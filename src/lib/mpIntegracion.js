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
 * Pide al backend que genere el state OAuth y devuelva la URL de
 * autorizacion de MP. NO redirige — solo devuelve la URL.
 *
 * Lo usa la UI para mostrar la URL en un modal preventivo (que avisa
 * al user que se loguee en MP antes de continuar).
 *
 * @param {string} consultorioId
 * @returns {Promise<string>} la authorizeUrl
 */
export async function obtenerUrlConexionMP(consultorioId) {
  const { authorizeUrl } = await postConIdToken('/api/mp/oauth-init', {
    consultorioId,
  });
  if (!authorizeUrl) {
    throw new Error('El servidor no devolvió la URL de autorización.');
  }
  return authorizeUrl;
}

/**
 * Inicia el flow OAuth: pide al backend la URL y redirige inmediatamente.
 *
 * Mantengo esta funcion para compatibilidad (codigo que ya la usaba)
 * pero el flujo recomendado es:
 *   1. Llamar obtenerUrlConexionMP() para tener la URL
 *   2. Mostrar al user un aviso de "asegurate de estar logueado en MP"
 *   3. Cuando confirme, hacer window.location.assign(url) directo
 *
 * @param {string} consultorioId
 * @returns {Promise<void>} (no devuelve, navega a otra URL)
 */
export async function iniciarConexionMP(consultorioId) {
  const url = await obtenerUrlConexionMP(consultorioId);
  window.location.assign(url);
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
