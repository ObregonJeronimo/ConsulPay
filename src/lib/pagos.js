/**
 * Cliente frontend para pagos al consultorio.
 *
 * Las operaciones criticas (crear pago, validar sesiones, talk con MP)
 * viven en el backend (/api/mp/*). Desde el frontend solo:
 *  - Llamamos al backend con el Firebase ID token
 *  - Suscribimos a /pagos_consultorio para mostrar historial live
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

async function getConIdToken(path) {
  const idToken = await getAuth().currentUser?.getIdToken();
  if (!idToken) throw new Error('Sesión expirada. Volvé a iniciar sesión.');

  const res = await fetch(path, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
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
    throw err;
  }

  return data;
}

/**
 * Inicia un pago al consultorio.
 *
 * Llama al backend, recibe la initPointUrl y redirige al checkout MP.
 * Cuando el usuario vuelva del checkout, MP lo manda a /mi-panel/pagos/retorno.
 *
 * @param {Object} params
 * @param {string} params.consultorioId
 * @param {string[]} params.sesionesIds - sesiones a saldar con este pago
 * @returns {Promise<void>} (no devuelve, navega a otra URL)
 */
export async function iniciarPagoAlConsultorio({ consultorioId, sesionesIds }) {
  const data = await postConIdToken('/api/mp/crear-pago', {
    consultorioId,
    sesionesIds,
  });

  if (!data?.initPointUrl) {
    throw new Error('El servidor no devolvió la URL del checkout.');
  }

  // Redirigimos al checkout MP. El back_url va a traer al user a
  // /mi-panel/pagos/retorno?pagoId=...&status=...
  window.location.assign(data.initPointUrl);
}

/**
 * Consulta el estado actual de un pago. La pagina de retorno
 * post-checkout usa esto en polling para esperar a que el webhook
 * actualice el estado.
 */
export async function consultarEstadoPago(pagoId) {
  return getConIdToken(`/api/mp/pago-status?pagoId=${encodeURIComponent(pagoId)}`);
}

/* ============================================================
   Suscripciones live a /pagos_consultorio
   ============================================================ */

/**
 * Pagos hechos por un profesional (su historial).
 */
export function suscribirPagosDelProfesional(profesionalUid, consultorioId, callback) {
  if (!profesionalUid || !consultorioId) {
    callback([]);
    return () => {};
  }
  const q = query(
    collection(db, 'pagos_consultorio'),
    where('consultorioId', '==', consultorioId),
    where('profesionalUid', '==', profesionalUid),
    orderBy('createdAt', 'desc'),
  );
  return onSnapshot(q, (snap) => {
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    callback(list);
  }, (err) => {
    console.error('Error suscribiendo pagos del profesional:', err);
    callback([]);
  });
}

/**
 * Pagos recibidos por un consultorio (vista admin).
 */
export function suscribirPagosDelConsultorio(consultorioId, callback) {
  if (!consultorioId) {
    callback([]);
    return () => {};
  }
  const q = query(
    collection(db, 'pagos_consultorio'),
    where('consultorioId', '==', consultorioId),
    orderBy('createdAt', 'desc'),
  );
  return onSnapshot(q, (snap) => {
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    callback(list);
  }, (err) => {
    console.error('Error suscribiendo pagos del consultorio:', err);
    callback([]);
  });
}

/* ============================================================
   Helpers de presentacion
   ============================================================ */

export const ESTADOS_PAGO_CONSULTORIO = Object.freeze({
  PENDIENTE: 'pendiente',
  APROBADO: 'aprobado',
  RECHAZADO: 'rechazado',
  CANCELADO: 'cancelado',
  REEMBOLSADO: 'reembolsado',
});

export function labelEstadoPago(estado) {
  switch (estado) {
    case 'pendiente': return 'En proceso';
    case 'aprobado': return 'Aprobado';
    case 'rechazado': return 'Rechazado';
    case 'cancelado': return 'Cancelado';
    case 'reembolsado': return 'Reembolsado';
    default: return estado || '—';
  }
}

export function tonoEstadoPago(estado) {
  switch (estado) {
    case 'aprobado': return 'success';
    case 'pendiente': return 'warning';
    case 'rechazado':
    case 'cancelado': return 'danger';
    case 'reembolsado': return 'neutral';
    default: return 'neutral';
  }
}
