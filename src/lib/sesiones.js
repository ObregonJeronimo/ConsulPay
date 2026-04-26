/**
 * Servicio de sesiones
 *
 * Una "sesion" es un encuentro entre un profesional y un paciente.
 * Cada sesion guarda un SNAPSHOT de los valores economicos al momento
 * de registrarla, para que cambios futuros en el metodo de pago no
 * afecten retroactivamente sesiones ya cargadas.
 *
 * Modelo de doc en Firestore:
 *   sesiones/{sesionId}
 *     consultorioId, profesionalUid, pacienteId,
 *     fecha (Timestamp con dia + hora),
 *     metodoPagoId, metodoPagoNombre, metodoPagoTipo,
 *     valorTotal, porcentajeConsultorio,
 *     montoConsultorio, montoProfesional,
 *     estadoPago: 'debido' | 'pagado',
 *     notas, createdAt, createdByUid, updatedAt, updatedByUid
 */

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';

import { db } from './firebase.js';
import { ESTADOS_PAGO_SESION } from './constants.js';

/* ============================================================
   Calculo del split
   ============================================================ */

/**
 * Calcula los montos del consultorio y del profesional a partir del
 * valor total y el porcentaje.
 *
 * IMPORTANTE: las Security Rules validan que estos numeros sean
 * coherentes con valorTotal y porcentajeConsultorio. Si cambias la
 * formula aca, hay que cambiarla tambien en firestore.rules.
 *
 * @param {number} valorTotal       — monto total que paga el paciente
 * @param {number} porcentaje       — % entre 0 y 100 que va al consultorio
 * @returns {{ montoConsultorio: number, montoProfesional: number }}
 */
export function calcularSplit(valorTotal, porcentaje) {
  const total = Number(valorTotal) || 0;
  const pct = Number(porcentaje) || 0;
  const montoConsultorio = Math.round(total * pct / 100);
  const montoProfesional = total - montoConsultorio;
  return { montoConsultorio, montoProfesional };
}

/* ============================================================
   Helpers internos
   ============================================================ */

/**
 * Valida y arma el payload listo para Firestore. Recibe un objeto
 * "humano" del form y devuelve el doc con el split ya calculado.
 *
 * @throws Error si faltan datos minimos.
 */
function armarPayload({
  consultorioId,
  profesionalUid,
  pacienteId,
  fecha,                    // Date de JS
  metodo,                   // objeto del array consultorio.metodosPagoPaciente
  valorTotal,
  notas,
}) {
  if (!consultorioId) throw new Error('consultorioId requerido');
  if (!profesionalUid) throw new Error('Tenés que elegir un profesional');
  if (!pacienteId) throw new Error('Tenés que elegir un paciente');
  if (!metodo?.id) throw new Error('Tenés que elegir un método de pago');
  if (!(fecha instanceof Date) || isNaN(fecha.getTime())) {
    throw new Error('La fecha y hora de la sesión es obligatoria');
  }
  const total = Number(valorTotal);
  if (!Number.isFinite(total) || total < 0) {
    throw new Error('El valor total debe ser un número válido');
  }

  const porcentaje = Number(metodo.porcentajeConsultorio) || 0;
  const { montoConsultorio, montoProfesional } = calcularSplit(total, porcentaje);

  return {
    consultorioId,
    profesionalUid,
    pacienteId,
    fecha: Timestamp.fromDate(fecha),

    // Snapshot del metodo: si despues el admin renombra o cambia el %,
    // la sesion mantiene los valores con los que se cobro.
    metodoPagoId: metodo.id,
    metodoPagoNombre: metodo.nombre || '',
    metodoPagoTipo: metodo.tipo || 'inmediato',

    valorTotal: total,
    porcentajeConsultorio: porcentaje,
    montoConsultorio,
    montoProfesional,

    estadoPago: ESTADOS_PAGO_SESION.DEBIDO,
    notas: notas?.trim() || null,
  };
}

/* ============================================================
   Crear sesion
   ============================================================ */
export async function crearSesion(input, createdByUid) {
  const payload = armarPayload(input);
  const ref = await addDoc(collection(db, 'sesiones'), {
    ...payload,
    createdAt: serverTimestamp(),
    createdByUid: createdByUid ?? null,
    updatedAt: serverTimestamp(),
    updatedByUid: createdByUid ?? null,
  });
  return ref.id;
}

/* ============================================================
   Actualizar sesion
   ============================================================ */
export async function actualizarSesion(sesionId, input, updatedByUid) {
  // armarPayload nos da todos los campos derivados (split correcto, etc.)
  const payload = armarPayload(input);
  await updateDoc(doc(db, 'sesiones', sesionId), {
    ...payload,
    updatedAt: serverTimestamp(),
    updatedByUid: updatedByUid ?? null,
  });
}

/* ============================================================
   Eliminar sesion
   ============================================================ */
export async function eliminarSesion(sesionId) {
  await deleteDoc(doc(db, 'sesiones', sesionId));
}

/* ============================================================
   Cambiar estado de pago (solo admin via rules)
   ============================================================ */
export async function marcarSesionPagada(sesionId, updatedByUid) {
  await updateDoc(doc(db, 'sesiones', sesionId), {
    estadoPago: ESTADOS_PAGO_SESION.PAGADO,
    updatedAt: serverTimestamp(),
    updatedByUid: updatedByUid ?? null,
  });
}

export async function marcarSesionDebida(sesionId, updatedByUid) {
  await updateDoc(doc(db, 'sesiones', sesionId), {
    estadoPago: ESTADOS_PAGO_SESION.DEBIDO,
    updatedAt: serverTimestamp(),
    updatedByUid: updatedByUid ?? null,
  });
}

/* ============================================================
   Suscripciones live
   ============================================================ */

/**
 * Todas las sesiones del consultorio (vista admin).
 *
 * @param {string} consultorioId
 * @param {(sesiones: Array) => void} callback
 * @param {{ desde?: Date, hasta?: Date }} [filtros]
 *   Rango opcional de fechas (incluyente). Si no se pasan, trae todo.
 *   Para listas grandes conviene siempre acotar a un mes.
 */
export function suscribirSesionesConsultorio(consultorioId, callback, filtros = {}) {
  const constraints = [where('consultorioId', '==', consultorioId)];
  if (filtros.desde) constraints.push(where('fecha', '>=', Timestamp.fromDate(filtros.desde)));
  if (filtros.hasta) constraints.push(where('fecha', '<=', Timestamp.fromDate(filtros.hasta)));
  constraints.push(orderBy('fecha', 'desc'));

  const q = query(collection(db, 'sesiones'), ...constraints);
  return onSnapshot(q, (snap) => {
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    callback(list);
  }, (err) => {
    console.error('Error en suscripción de sesiones del consultorio:', err);
    callback([]);
  });
}

/**
 * Sesiones de un profesional dentro de su consultorio.
 *
 * IMPORTANTE: filtramos por AMBOS campos (consultorioId + profesionalUid)
 * porque las rules requieren que la query incluya todos los campos que
 * la rule usa para decidir acceso (mismo patron que pacientes).
 */
export function suscribirSesionesProfesional(profesionalUid, consultorioId, callback, filtros = {}) {
  if (!profesionalUid || !consultorioId) {
    callback([]);
    return () => {};
  }

  const constraints = [
    where('consultorioId', '==', consultorioId),
    where('profesionalUid', '==', profesionalUid),
  ];
  if (filtros.desde) constraints.push(where('fecha', '>=', Timestamp.fromDate(filtros.desde)));
  if (filtros.hasta) constraints.push(where('fecha', '<=', Timestamp.fromDate(filtros.hasta)));
  constraints.push(orderBy('fecha', 'desc'));

  const q = query(collection(db, 'sesiones'), ...constraints);
  return onSnapshot(q, (snap) => {
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    callback(list);
  }, (err) => {
    console.error('Error en suscripción de sesiones del profesional:', err);
    callback([]);
  });
}

/* ============================================================
   Helpers de agregacion en memoria
   ----------------------------------------------------------------
   Estos calculos se hacen sobre la lista ya cargada (no requieren
   queries adicionales). Para datasets de hasta unas miles de sesiones
   por mes esto es instantaneo. Si crece, se mueven a Cloud Functions
   o a documentos agregados precalculados.
   ============================================================ */

/**
 * Totales por profesional dentro de una lista de sesiones.
 * Devuelve un mapa: { [profesionalUid]: { sesiones, totalConsultorio, totalProfesional, debido } }
 */
export function agregarPorProfesional(sesiones) {
  const resultado = {};
  for (const s of sesiones) {
    const uid = s.profesionalUid;
    if (!resultado[uid]) {
      resultado[uid] = {
        profesionalUid: uid,
        cantidadSesiones: 0,
        totalConsultorio: 0,
        totalProfesional: 0,
        debido: 0, // monto que el profesional aun debe al consultorio
      };
    }
    const r = resultado[uid];
    r.cantidadSesiones += 1;
    r.totalConsultorio += s.montoConsultorio || 0;
    r.totalProfesional += s.montoProfesional || 0;
    if (s.estadoPago === ESTADOS_PAGO_SESION.DEBIDO) {
      r.debido += s.montoConsultorio || 0;
    }
  }
  return resultado;
}

/**
 * Totales globales de una lista de sesiones.
 */
export function totalesGlobales(sesiones) {
  let cantidad = 0;
  let valorTotal = 0;
  let totalConsultorio = 0;
  let totalProfesional = 0;
  let debido = 0;
  for (const s of sesiones) {
    cantidad += 1;
    valorTotal += s.valorTotal || 0;
    totalConsultorio += s.montoConsultorio || 0;
    totalProfesional += s.montoProfesional || 0;
    if (s.estadoPago === ESTADOS_PAGO_SESION.DEBIDO) {
      debido += s.montoConsultorio || 0;
    }
  }
  return { cantidad, valorTotal, totalConsultorio, totalProfesional, debido };
}

/* ============================================================
   Utilidades de fecha (rangos del mes)
   ============================================================ */

export function inicioDeMes(fecha = new Date()) {
  const d = new Date(fecha);
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

export function finDeMes(fecha = new Date()) {
  const d = new Date(fecha);
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

export function nombreDelMes(fecha = new Date()) {
  return fecha.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
}
