/**
 * Cliente frontend para suscripciones (Plan Pro).
 *
 * Las operaciones criticas (talk con MP, validar owner, etc.) viven
 * en el backend (/api/mp/suscripcion-*). Desde el frontend solo:
 *  - Llamamos al backend con el Firebase ID token
 *  - Suscribimos a /pagos_mensualidad para mostrar historial de cobros
 */

import { getAuth } from 'firebase/auth';
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';

import { db } from './firebase.js';

async function postConIdToken(path, body) {
  const idToken = await getAuth().currentUser?.getIdToken();
  if (!idToken) throw new Error('Sesión expirada. Volvé a iniciar sesión.');

  const res = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(body),
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    /* response no era JSON */
  }

  if (!res.ok) {
    const err = new Error(data?.error || `Error ${res.status} del servidor.`);
    err.status = res.status;
    err.codigo = data?.codigo;
    err.detalle = data;
    throw err;
  }

  return data;
}

/**
 * Inicia el flow de suscripcion al Plan Pro.
 *
 * Llama al backend, que crea un preapproval en MP, y devuelve la URL
 * a la que hay que redirigir al user para que autorice el cobro
 * recurrente. Cuando el user autoriza, MP nos manda webhook y se
 * activa el plan automaticamente.
 *
 * @param {string} consultorioId
 * @returns {Promise<void>} (no devuelve, navega a otra URL)
 */
export async function iniciarSuscripcionPro(consultorioId) {
  const data = await postConIdToken('/api/mp/suscripcion', {
    accion: 'crear',
    consultorioId,
  });

  if (!data?.initPointUrl) {
    throw new Error('El servidor no devolvió la URL de autorización.');
  }

  // Redirigimos al user al flow de autorizacion de MP. Cuando autoriza
  // (o cancela), MP lo trae de vuelta a la backUrl.
  window.location.assign(data.initPointUrl);
}

/**
 * Cancela la suscripcion al Plan Pro.
 *
 * No baja el plan inmediatamente: el user mantiene Pro hasta el final
 * del periodo que ya pago.
 */
export async function cancelarSuscripcionPro(consultorioId) {
  return postConIdToken('/api/mp/suscripcion', {
    accion: 'cancelar',
    consultorioId,
  });
}

/* ============================================================
   Suscripciones live a /pagos_mensualidad
   ============================================================ */

/**
 * Historial de cobros mensuales de un consultorio.
 */
export function suscribirPagosMensualidad(consultorioId, callback) {
  if (!consultorioId) {
    callback([]);
    return () => {};
  }
  const q = query(
    collection(db, 'pagos_mensualidad'),
    where('consultorioId', '==', consultorioId),
    orderBy('createdAt', 'desc'),
  );
  return onSnapshot(q, (snap) => {
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    callback(list);
  }, (err) => {
    console.error('Error suscribiendo pagos_mensualidad:', err);
    callback([]);
  });
}

/* ============================================================
   Helpers de presentacion
   ============================================================ */

/**
 * Devuelve un label legible del estado de la suscripcion.
 * Maneja tanto el campo subscription.status como el plan general.
 */
export function labelEstadoSuscripcion(consultorio) {
  if (!consultorio) return '—';
  const sub = consultorio.subscription;
  if (!sub) return consultorio.plan === 'pro' ? 'Activa' : 'Sin suscripción';

  switch (sub.status) {
    case 'pending_authorization': return 'Esperando autorización';
    case 'authorized': return 'Activa';
    case 'paused': return 'Pausada';
    case 'cancelled':
      // Si cancelo pero todavia esta vigente, decirlo
      if (consultorio.plan === 'pro') return 'Cancelada (vigente hasta vencimiento)';
      return 'Cancelada';
    case 'expired': return 'Expirada';
    case 'rejected': return 'Rechazada';
    default: return sub.status || '—';
  }
}

/**
 * Devuelve true si el user puede contratar Pro (todavia esta en Free
 * y no tiene suscripcion en vuelo).
 */
export function puedeContratarPro(consultorio) {
  if (!consultorio) return false;
  if (consultorio.plan === 'pro') return false;
  const sub = consultorio.subscription;
  if (!sub) return true;
  // Si tiene suscripcion pendiente o expirada, deja contratar de nuevo
  return sub.status === 'expired' || sub.status === 'rejected' || !sub.status;
}

/**
 * Devuelve true si el user puede cancelar (es Pro y la sub no esta
 * ya cancelada).
 */
export function puedeCancelarPro(consultorio) {
  if (!consultorio) return false;
  const sub = consultorio.subscription;
  if (!sub) return false;
  return sub.status === 'authorized' || sub.status === 'pending_authorization';
}
