/**
 * Servicio de invitaciones a profesionales
 *
 * El admin de un consultorio invita a un profesional por email. El flow es:
 *   1. Frontend llama a la Vercel Function /api/invitar-profesional con un ID token
 *      del usuario admin (Firebase ID token, demuestra que está logueado).
 *   2. El backend valida el token, valida que sea admin del consultorio,
 *      crea el doc en Firestore y envía el email vía Resend.
 *   3. El link del email apunta a /aceptar-invitacion?id=xxx
 *
 * Escribimos el doc desde el backend y no desde el frontend porque:
 *   - Así podemos enviar el email en la misma transacción
 *   - El backend tiene privilegios Admin (saltea Security Rules) y puede
 *     crear docs con timestamps de servidor, etc.
 */

import { getAuth } from 'firebase/auth';
import {
  collection,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';

import { db } from './firebase.js';
import { ESTADOS_INVITACION } from './constants.js';

/**
 * Envía una invitación: crea el doc en Firestore y manda email vía Resend.
 * @param {Object} params
 * @param {string} params.email - email del profesional
 * @param {string} params.nombre - nombre del profesional (para el email)
 * @param {string} params.consultorioId
 * @param {string} params.consultorioNombre
 * @param {number} params.porcentajeOverride - % que cobra el consultorio para este profesional
 * @returns {Promise<{invitacionId: string}>}
 */
export async function enviarInvitacion(params) {
  const idToken = await getAuth().currentUser?.getIdToken();
  if (!idToken) throw new Error('Sesión expirada. Volvé a iniciar sesión.');

  const res = await fetch('/api/invitar-profesional', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    let msg = 'No se pudo enviar la invitación.';
    try {
      const body = await res.json();
      msg = body.error || msg;
    } catch {
      /* response no era JSON */
    }
    throw new Error(msg);
  }

  return await res.json();
}

/**
 * Suscripción en vivo a las invitaciones del consultorio actual.
 * Las ordenamos en memoria (no con orderBy en el query) para evitar
 * depender de un índice compuesto de Firestore. Con volúmenes chicos
 * (decenas de invitaciones por consultorio) es eficiente.
 * @param {string} consultorioId
 * @param {(invitaciones: Array) => void} callback
 * @returns unsubscribe
 */
export function suscribirInvitaciones(consultorioId, callback) {
  const q = query(
    collection(db, 'invitaciones_profesional'),
    where('consultorioId', '==', consultorioId),
  );

  return onSnapshot(q, (snap) => {
    const invitaciones = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    invitaciones.sort((a, b) => {
      const aT = a.createdAt?.toMillis?.() ?? 0;
      const bT = b.createdAt?.toMillis?.() ?? 0;
      return bT - aT;
    });
    callback(invitaciones);
  }, (err) => {
    console.error('Error en suscripción de invitaciones:', err);
    callback([]);
  });
}

/**
 * Filtra invitaciones por estado.
 */
export function filtrarPendientes(invitaciones) {
  return invitaciones.filter((i) => i.estado === ESTADOS_INVITACION.PENDIENTE);
}
