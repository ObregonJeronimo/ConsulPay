/**
 * Servicio de profesionales (vistos desde el admin)
 */

import {
  collection,
  doc,
  onSnapshot,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';

import { db } from './firebase.js';
import { ESTADOS_USUARIO, ROLES } from './constants.js';

/**
 * Suscripción en vivo a los profesionales del consultorio.
 * Incluye activos y suspendidos (la UI los separa visualmente).
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
