/**
 * Servicio de sesiones
 *
 * Una "sesion" es un encuentro entre un profesional y un paciente.
 * Cada sesion guarda un SNAPSHOT de los valores economicos al momento
 * de registrarla, para que cambios futuros en el metodo de pago no
 * afecten retroactivamente sesiones ya cargadas.
 *
 * SESIONES AGRUPADAS (cantidadSesiones >= 1):
 *   Un mismo doc puede representar N encuentros con el mismo paciente,
 *   cargados juntos. La fecha+hora son representativas (suelen ser de
 *   cuando se registra el grupo o del primer encuentro). Los montos
 *   son los TOTALES del grupo (valorTotal = valorSesion * cantidadSesiones).
 *   Al pagarse, se paga el grupo entero.
 *
 *   Sesiones viejas sin cantidadSesiones se interpretan como cantidadSesiones=1.
 *
 * Modelo de doc en Firestore:
 *   sesiones/{sesionId}
 *     consultorioId, profesionalUid, pacienteId,
 *     fecha (Timestamp con dia + hora),
 *     metodoPagoId, metodoPagoNombre, metodoPagoTipo,
 *     cantidadSesiones (number, >=1, default 1),  ← NUEVO
 *     valorSesion (number, valor unitario),       ← NUEVO
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
  getDoc,
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
   Helpers de cantidad
   ============================================================ */

/**
 * Devuelve la cantidad efectiva de encuentros de una sesion. Soporta
 * sesiones viejas (sin cantidadSesiones) interpretandolas como 1.
 */
export function getCantidadSesiones(sesion) {
  const c = Number(sesion?.cantidadSesiones);
  return Number.isFinite(c) && c >= 1 ? Math.floor(c) : 1;
}

/* ============================================================
   Helpers internos
   ============================================================ */

/**
 * Valida y arma el payload listo para Firestore. Recibe un objeto
 * "humano" del form y devuelve el doc con el split ya calculado.
 *
 * INPUT:
 *   - valorSesion (recomendado): valor unitario por encuentro
 *   - cantidadSesiones (default 1)
 *   - O bien valorTotal directo (legacy/admin): se asume cantidadSesiones=1
 *     y valorSesion=valorTotal si no se pasa cantidad
 *
 * @throws Error si faltan datos minimos.
 */
function armarPayload({
  consultorioId,
  profesionalUid,
  pacienteId,
  fecha,                    // Date de JS
  metodo,                   // objeto del array consultorio.metodosPagoPaciente
  valorSesion,              // valor unitario (NUEVO, recomendado)
  cantidadSesiones = 1,     // default 1
  valorTotal: valorTotalIn, // legacy: si llega esto y no valorSesion
  notas,
}) {
  if (!consultorioId) throw new Error('consultorioId requerido');
  if (!profesionalUid) throw new Error('Tenés que elegir un profesional');
  if (!pacienteId) throw new Error('Tenés que elegir un paciente');
  if (!metodo?.id) throw new Error('Tenés que elegir un método de pago');
  if (!(fecha instanceof Date) || isNaN(fecha.getTime())) {
    throw new Error('La fecha y hora de la sesión es obligatoria');
  }

  const cantidad = Number(cantidadSesiones);
  if (!Number.isFinite(cantidad) || cantidad < 1 || !Number.isInteger(cantidad)) {
    throw new Error('La cantidad de sesiones debe ser un número entero mayor o igual a 1');
  }

  // ============================================================
  // Caso especial: metodo diferido (obra social) sin valor cargado.
  // ============================================================
  // Para sesiones de obra social, el monto que va a liquidar la prepaga
  // no se sabe al momento de registrar la sesion (lo informa la obra
  // social meses despues). Permitimos crearlas sin valor — el flow
  // "Liquidar monto" (boton tilde en la lista) carga el monto despues.
  //
  // Estas sesiones quedan en estadoPago = 'pendiente_monto', NO suman
  // al cobro pendiente del profesional, y no figuran en MisPagos hasta
  // que se liquiden.
  const tipoMetodo = metodo.tipo || 'inmediato';
  const esDiferido = tipoMetodo === 'diferido';
  const sinValor = (valorSesion === undefined || valorSesion === null || valorSesion === '')
    && (valorTotalIn === undefined || valorTotalIn === null || valorTotalIn === '');

  if (esDiferido && sinValor) {
    return {
      consultorioId,
      profesionalUid,
      pacienteId,
      fecha: Timestamp.fromDate(fecha),

      metodoPagoId: metodo.id,
      metodoPagoNombre: metodo.nombre || '',
      metodoPagoTipo: tipoMetodo,

      cantidadSesiones: cantidad,
      valorSesion: 0,

      valorTotal: 0,
      porcentajeConsultorio: Number(metodo.porcentajeConsultorio) || 0,
      montoConsultorio: 0,
      montoProfesional: 0,

      estadoPago: ESTADOS_PAGO_SESION.PENDIENTE_MONTO,
      notas: notas?.trim() || null,
    };
  }

  // Calcular valorSesion y valorTotal segun lo que llegue.
  let unitario, total;
  if (valorSesion !== undefined && valorSesion !== null && valorSesion !== '') {
    unitario = Number(valorSesion);
    if (!Number.isFinite(unitario) || unitario < 0) {
      throw new Error('El valor por sesión debe ser un número válido');
    }
    total = unitario * cantidad;
  } else if (valorTotalIn !== undefined && valorTotalIn !== null && valorTotalIn !== '') {
    // Legacy: nos pasaron el total ya calculado. Derivamos unitario.
    total = Number(valorTotalIn);
    if (!Number.isFinite(total) || total < 0) {
      throw new Error('El valor total debe ser un número válido');
    }
    unitario = cantidad > 0 ? Math.round(total / cantidad) : total;
  } else {
    throw new Error('Falta el valor de la sesión');
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
    metodoPagoTipo: tipoMetodo,

    // Datos de agrupacion
    cantidadSesiones: cantidad,
    valorSesion: unitario,

    valorTotal: total,
    porcentajeConsultorio: porcentaje,
    montoConsultorio,
    montoProfesional,

    estadoPago: ESTADOS_PAGO_SESION.DEBIDO,
    notas: notas?.trim() || null,
  };
}

/* ============================================================
   Validacion: fecha mínima del consultorio
   ============================================================ */

/**
 * Lanza error si la fecha es anterior a la fecha de creacion del
 * consultorio. Esta validacion vive en cliente (no en rules) porque
 * agregar un get() del consultorio en rules tiene costo de lecturas
 * extra. Si un usuario maliciosamente burla esto, no hay riesgo de
 * seguridad — solo de coherencia historica.
 */
/**
 * Antes validabamos que la fecha de la sesion no fuera anterior a la
 * creacion del consultorio. Esa restriccion molestaba: hay consultorios
 * que adoptan ConsulPay despues de venir trabajando hace meses/anios y
 * necesitan cargar sesiones historicas para tener un libro completo.
 *
 * La funcion sigue exportada por compatibilidad con los call sites
 * existentes, pero ahora es un no-op. Cualquier fecha valida (incluso
 * de varios anios atras) se acepta.
 */
// eslint-disable-next-line no-unused-vars
export function validarFechaContraConsultorio(fecha, consultorio) {
  // No-op intencional. Ver doc arriba.
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
   Liquidar monto de una sesion en pendiente_monto (obra social)
   ----------------------------------------------------------------
   Se llama cuando la obra social informa cuanto liquido. Recibe el
   valor TOTAL liquidado (lo que el sistema reparte segun el % del
   metodo). La sesion pasa de pendiente_monto -> debido y empieza a
   sumar al cobro pendiente del profesional.

   Solo se ejecuta de manera directa por:
     - Admin del consultorio (siempre)
     - Profesional con permitirEdicionSesiones=true
   El profesional sin edicion directa no llama este helper, sino que
   crea una solicitud tipo LIQUIDAR_MONTO via solicitudes.js.
   ============================================================ */
export async function liquidarMontoSesion(sesionId, valorLiquidado, updatedByUid) {
  const v = Number(valorLiquidado);
  if (!Number.isFinite(v) || v <= 0) {
    throw new Error('El valor liquidado debe ser un número mayor a cero');
  }

  // Releemos el doc para obtener el porcentajeConsultorio del snapshot
  // que se guardo cuando se creo la sesion.
  const ref = doc(db, 'sesiones', sesionId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('La sesión no existe');
  const data = snap.data();

  if (data.estadoPago !== ESTADOS_PAGO_SESION.PENDIENTE_MONTO) {
    throw new Error('Esta sesión ya tiene monto liquidado');
  }

  const cantidad = data.cantidadSesiones || 1;
  const porcentaje = Number(data.porcentajeConsultorio) || 0;
  const { montoConsultorio, montoProfesional } = calcularSplit(v, porcentaje);
  const valorUnitario = cantidad > 0 ? Math.round(v / cantidad) : v;

  await updateDoc(ref, {
    valorTotal: v,
    valorSesion: valorUnitario,
    montoConsultorio,
    montoProfesional,
    estadoPago: ESTADOS_PAGO_SESION.DEBIDO,
    updatedAt: serverTimestamp(),
    updatedByUid: updatedByUid ?? null,
  });
}

/* ============================================================
   Editar el monto ya liquidado de una sesion de obra social
   ----------------------------------------------------------------
   Solo disponible si la sesion esta en estadoPago='debido' Y el
   metodoPagoTipo era 'diferido' (fue liquidada antes via
   liquidarMontoSesion). NO disponible si ya esta pagada.

   Disponible para admin y profesional (sin restriccion de confianza
   porque no cambia el estadoPago, solo corrige el monto).
   ============================================================ */
export async function editarMontoLiquidado(sesionId, valorNuevo, updatedByUid) {
  const v = Number(valorNuevo);
  if (!Number.isFinite(v) || v <= 0) {
    throw new Error('El valor debe ser un número mayor a cero');
  }

  const ref = doc(db, 'sesiones', sesionId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('La sesión no existe');
  const data = snap.data();

  if (data.estadoPago === ESTADOS_PAGO_SESION.PAGADO) {
    throw new Error('No se puede modificar el monto de una sesión ya pagada');
  }
  if (data.metodoPagoTipo !== 'diferido') {
    throw new Error('Solo se puede editar el monto de sesiones de obra social');
  }

  const cantidad = data.cantidadSesiones || 1;
  const porcentaje = Number(data.porcentajeConsultorio) || 0;
  const { montoConsultorio, montoProfesional } = calcularSplit(v, porcentaje);
  const valorUnitario = cantidad > 0 ? Math.round(v / cantidad) : v;

  await updateDoc(ref, {
    valorTotal: v,
    valorSesion: valorUnitario,
    montoConsultorio,
    montoProfesional,
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

   IMPORTANTE: los contadores de "cantidadSesiones" usan el campo del
   doc (con backwards compat a 1 si no existe). Asi un doc con
   cantidadSesiones=8 cuenta como 8 encuentros, no como 1.
   ============================================================ */

/**
 * Totales por profesional dentro de una lista de sesiones.
 * Devuelve un mapa: { [profesionalUid]: { cantidadSesiones (encuentros), cantidadRegistros (docs), totalConsultorio, totalProfesional, debido } }
 */
export function agregarPorProfesional(sesiones) {
  const resultado = {};
  for (const s of sesiones) {
    const uid = s.profesionalUid;
    if (!resultado[uid]) {
      resultado[uid] = {
        profesionalUid: uid,
        cantidadSesiones: 0,   // total de encuentros (sumando cantidadSesiones)
        cantidadRegistros: 0,  // cantidad de docs (cuantas filas)
        totalConsultorio: 0,
        totalProfesional: 0,
        debido: 0, // monto que el profesional aun debe al consultorio
      };
    }
    const r = resultado[uid];
    r.cantidadSesiones += getCantidadSesiones(s);
    r.cantidadRegistros += 1;
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
 *
 * @returns {{
 *   cantidad: number,        // total de encuentros (con cantidadSesiones)
 *   cantidadRegistros: number, // cantidad de docs
 *   valorTotal, totalConsultorio, totalProfesional, debido
 * }}
 */
export function totalesGlobales(sesiones) {
  let cantidad = 0;
  let cantidadRegistros = 0;
  let valorTotal = 0;
  let totalConsultorio = 0;
  let totalProfesional = 0;
  let debido = 0;
  for (const s of sesiones) {
    cantidad += getCantidadSesiones(s);
    cantidadRegistros += 1;
    valorTotal += s.valorTotal || 0;
    totalConsultorio += s.montoConsultorio || 0;
    totalProfesional += s.montoProfesional || 0;
    if (s.estadoPago === ESTADOS_PAGO_SESION.DEBIDO) {
      debido += s.montoConsultorio || 0;
    }
  }
  return { cantidad, cantidadRegistros, valorTotal, totalConsultorio, totalProfesional, debido };
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
