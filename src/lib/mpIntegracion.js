/**
 * Cliente frontend para integrar Mercado Pago al consultorio.
 *
 * Las operaciones sensibles (intercambio de code, encriptacion de
 * tokens, refresh) viven en el backend (/api/mp/*). Desde el frontend
 * solo orquestamos: pedimos al backend que arme la URL de OAuth y
 * redirigimos al user.
 */

import { getAuth } from 'firebase/auth';

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
    throw new Error(data?.error || `Error ${res.status} del servidor.`);
  }

  return data;
}

/**
 * Inicia el flow OAuth: pide al backend que genere el state y la URL
 * de autorizacion, luego redirige al user al panel de MP para que
 * autorize.
 *
 * @param {string} consultorioId
 * @returns {Promise<void>} (no devuelve, navega a otra URL)
 */
export async function iniciarConexionMP(consultorioId) {
  const { authorizeUrl } = await postConIdToken('/api/mp/oauth-init', {
    consultorioId,
  });
  if (!authorizeUrl) {
    throw new Error('El servidor no devolvió la URL de autorización.');
  }
  // Redirigimos al panel de MP. El callback va a redirigir de vuelta
  // a /admin/configuracion?mp=connected o ?mp=error.
  window.location.assign(authorizeUrl);
}

/**
 * Desconecta MP del consultorio. Usa el endpoint backend para limpiar
 * mpConfig (que solo el backend puede modificar por las rules).
 */
export async function desconectarMP(consultorioId) {
  await postConIdToken('/api/mp/oauth-disconnect', { consultorioId });
}

/* ============================================================
   Helpers de UI
   ============================================================ */

/**
 * Formatea cuantos dias faltan para el vencimiento del token.
 * Si ya vencio, devuelve un mensaje diferente.
 */
export function diasHastaVencimiento(expiresAt) {
  if (!expiresAt) return null;
  const ms = expiresAt?.toDate
    ? expiresAt.toDate().getTime()
    : (expiresAt instanceof Date ? expiresAt.getTime() : null);
  if (!ms) return null;

  const diff = ms - Date.now();
  if (diff <= 0) return { vencido: true, dias: 0 };
  return { vencido: false, dias: Math.ceil(diff / (1000 * 60 * 60 * 24)) };
}
