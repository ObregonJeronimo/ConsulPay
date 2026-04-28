/**
 * Servicio de profesionales (vistos desde el admin)
 */

import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';

import { db } from './firebase.js';
import { ESTADOS_PAGO_SESION, ESTADOS_USUARIO, ROLES } from './constants.js';

/**
 * Suscripción en vivo a los profesionales del consultorio.
 * Incluye activos y suspendidos (la UI los separa visualmente).
 *
 * NOTA: filtra solo por rol=profesional. Si necesitas TODOS los
 * miembros (incluyendo admins del consultorio), usa
 * suscribirMiembrosConsultorio().
 */
export function suscribirProfesionales(consultorioId, callback) {
  const q = query(
    collection(db, 'usuarios'),
    where('consultorioId', '==', consultorioId),
    where('rol', '==', ROLES.PROFESIONAL),
  );

  return onSnapshot(q, (snap) => {
    const profesionales = snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
    // Ordenamos en memoria — no todos los docs tienen createdAt antiguo
    profesionales.sort((a, b) => {
      const aT = a.createdAt?.toMillis?.() ?? 0;
      const bT = b.createdAt?.toMillis?.() ?? 0;
      return bT - aT;
    });
    callback(profesionales);
  }, (err) => {
    console.error('Error en suscripción de profesionales:', err);
    callback([]);
  });
}

/**
 * Suscripción en vivo a TODOS los miembros del consultorio (admins +
 * profesionales). Para la UI de gestion de admins (M3) que necesita
 * mostrar la lista de admins actuales y los profesionales que se
 * pueden promover.
 *
 * NO filtra por rol — devuelve todos los users con el consultorioId
 * dado. La UI separa por rol y por estar/no estar en adminUids.
 */
export function suscribirMiembrosConsultorio(consultorioId, callback) {
  const q = query(
    collection(db, 'usuarios'),
    where('consultorioId', '==', consultorioId),
  );

  return onSnapshot(q, (snap) => {
    const miembros = snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
    miembros.sort((a, b) => {
      const aT = a.createdAt?.toMillis?.() ?? 0;
      const bT = b.createdAt?.toMillis?.() ?? 0;
      return bT - aT;
    });
    callback(miembros);
  }, (err) => {
    console.error('Error en suscripción de miembros del consultorio:', err);
    callback([]);
  });
}

/**
 * Cambia el estado de un profesional (activar / suspender).
 */
export async function cambiarEstadoProfesional(uid, nuevoEstado) {
  if (!Object.values(ESTADOS_USUARIO).includes(nuevoEstado)) {
    throw new Error('Estado inválido');
  }
  await updateDoc(doc(db, 'usuarios', uid), { estado: nuevoEstado });
}

/**
 * Actualiza el porcentaje custom que se queda el consultorio para este profesional.
 * null o undefined → usa el default del consultorio.
 */
export async function setPorcentajeCustom(uid, porcentaje) {
  const valor = porcentaje === null || porcentaje === '' || porcentaje === undefined
    ? null
    : Number(porcentaje);
  await updateDoc(doc(db, 'usuarios', uid), { porcentajeCustom: valor });
}

/**
 * Activa o desactiva el flag de "edicion directa de sesiones" para un
 * profesional. Cuando esta en true, el profesional puede crear/editar/
 * eliminar sesiones sin pasar por aprobacion del admin. Cuando esta en
 * false (o no existe), sus acciones generan solicitudes que el admin
 * debe aprobar.
 *
 * Default seguro: si nunca fue seteado, las rules tratan al profesional
 * como SIN confianza. El admin debe activarlo explicitamente.
 */
export async function setPermitirEdicionSesiones(uid, valor) {
  await updateDoc(doc(db, 'usuarios', uid), {
    permitirEdicionSesiones: !!valor,
  });
}

/* ============================================================
   Retiro del consultorio (M4)
   ----------------------------------------------------------------
   Un profesional puede ser retirado del consultorio (estado='retirado').
   Es un soft-delete: los registros historicos (sesiones, pagos,
   pacientes asignados) se preservan, pero el profesional ya no puede
   crear nada nuevo y al loguearse ve un mensaje informativo.

   El retiro puede ser iniciado por:
     - El admin del consultorio (sin restricciones).
     - El propio profesional (auto-retiro), pero SOLO si no tiene
       deuda pendiente (sesiones con estadoPago='debido').
   ============================================================ */

/**
 * Calcula la deuda actual de un profesional con el consultorio.
 *
 * La "deuda" es la suma de montoConsultorio de todas las sesiones del
 * profesional con estadoPago='debido'. No depende de fechas: es
 * cuanto debe HOY, sin importar cuando se cobro al paciente.
 *
 * Esta funcion lee TODAS las sesiones debidas del profesional. En
 * volumenes grandes podria ser lenta, pero en un consultorio normal
 * (decenas de sesiones por mes) es eficiente.
 *
 * @param {string} consultorioId
 * @param {string} profesionalUid
 * @returns {Promise<{cantidad: number, total: number}>}
 *   cantidad: cuantas sesiones debidas tiene
 *   total:    suma de montoConsultorio en ARS
 */
export async function calcularDeudaProfesional(consultorioId, profesionalUid) {
  const q = query(
    collection(db, 'sesiones'),
    where('consultorioId', '==', consultorioId),
    where('profesionalUid', '==', profesionalUid),
    where('estadoPago', '==', ESTADOS_PAGO_SESION.DEBIDO),
  );

  const snap = await getDocs(q);
  let total = 0;
  for (const d of snap.docs) {
    total += Number(d.data().montoConsultorio) || 0;
  }
  return { cantidad: snap.size, total };
}

/**
 * Retira a un profesional del consultorio.
 *
 * Reglas:
 *   - Si esAutoRetiro=true, valida que el profesional no tenga deuda
 *     pendiente. Si tiene, lanza error con detalle.
 *   - Si esAutoRetiro=false (admin retira), no valida deuda — el admin
 *     puede retirar a un profesional aunque le deba plata. Esa deuda
 *     queda registrada en sesiones historicas y se sigue pudiendo
 *     cobrar (cuando exista la feature de pagos).
 *
 * Cambios en el doc del usuario:
 *   estado: 'retirado'
 *   retiradoAt: Date.now()  (timestamp simple, no serverTimestamp porque
 *                            updateDoc lo maneja distinto y aca no
 *                            necesitamos auditoria fina)
 *
 * No tocamos consultorioId — el doc sigue apuntando al consultorio
 * que lo retiro. Eso es importante para que las sesiones historicas
 * sigan siendo legibles por el admin con las rules actuales.
 *
 * @param {Object} params
 * @param {string} params.uid              - el uid del profesional a retirar
 * @param {string} params.consultorioId    - consultorio del que sale
 * @param {boolean} [params.esAutoRetiro]  - true si el propio profesional ejecuta
 */
export async function retirarProfesional({ uid, consultorioId, esAutoRetiro = false }) {
  if (!uid) throw new Error('uid requerido');
  if (!consultorioId) throw new Error('consultorioId requerido');

  // Si es auto-retiro, validamos deuda primero
  if (esAutoRetiro) {
    const deuda = await calcularDeudaProfesional(consultorioId, uid);
    if (deuda.cantidad > 0) {
      // Construimos el mensaje en el caller para tener mejor formato — aca
      // pasamos la info via Error con propiedades adicionales.
      const err = new Error(
        `No podés salir del consultorio mientras tengas deuda pendiente. ` +
        `Tenés ${deuda.cantidad} sesión${deuda.cantidad === 1 ? '' : 'es'} debida${deuda.cantidad === 1 ? '' : 's'} ` +
        `por un total de $${deuda.total.toLocaleString('es-AR')}. ` +
        `Saldá la deuda con el administrador antes de salir.`,
      );
      err.codigoDeuda = 'DEUDA_PENDIENTE';
      err.deuda = deuda;
      throw err;
    }
  }

  await updateDoc(doc(db, 'usuarios', uid), {
    estado: ESTADOS_USUARIO.RETIRADO,
    retiradoAt: new Date(),
    // permitirEdicionSesiones se mantiene en false implicito (el flag tampoco
    // tiene sentido para un retirado), pero no lo tocamos: si el admin lo
    // reactiva en el futuro, vuelve con su estado anterior.
  });
}
