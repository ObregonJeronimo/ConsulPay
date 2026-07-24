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
 * @param {('primary'|'secondary')} [slot] - opcional. Si no se pasa,
 *   el backend asigna automaticamente al primer slot libre.
 * @returns {Promise<{authorizeUrl: string, slot: string}>}
 */
export async function obtenerUrlConexionMP(consultorioId, slot) {
  const body = { consultorioId };
  if (slot) body.slot = slot;

  const data = await postConIdToken('/api/mp/oauth-init', body);
  if (!data?.authorizeUrl) {
    throw new Error('El servidor no devolvió la URL de autorización.');
  }
  return { authorizeUrl: data.authorizeUrl, slot: data.slot };
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
 * @param {('primary'|'secondary')} [slot] - opcional, slot al que conectar.
 * @returns {Promise<void>} (no devuelve, navega a otra URL)
 */
export async function iniciarConexionMP(consultorioId, slot) {
  const { authorizeUrl } = await obtenerUrlConexionMP(consultorioId, slot);
  window.location.assign(authorizeUrl);
}

/**
 * Desconecta MP del consultorio. Usa el endpoint backend para limpiar
 * mpConfig (que solo el backend puede modificar por las rules).
 *
 * @param {string} consultorioId
 * @param {('primary'|'secondary')} [slot] - opcional. Si no se pasa,
 *   el backend desconecta el unico slot conectado. Si hay 2 slots
 *   conectados y no se pasa slot, el backend devuelve error 400.
 */
export async function desconectarMP(consultorioId, slot) {
  const body = { consultorioId };
  if (slot) body.slot = slot;
  await postConIdToken('/api/mp/oauth-disconnect', body);
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

/* ============================================================
   ¿Mercado Pago esta operativo para este consultorio?
   ----------------------------------------------------------------
   No alcanza con que UN admin haya vinculado su cuenta. Los cobros
   se alternan mes a mes entre las cuentas de los administradores
   (ver Configuracion > Pagos), asi que si falta una, los meses que
   le tocan a esa cuenta no tienen donde caer. La regla es: MP esta
   habilitado cuando TODOS los adminUids del consultorio tienen su
   cuenta conectada. Con un solo admin, alcanza con esa.

   Contempla el formato viejo (mpIntegrado + mpConfig) ademas de
   los slots primary / secondary.
   ============================================================ */
export function mpHabilitado(consultorio) {
  const adminUids = consultorio?.adminUids || [];
  if (adminUids.length === 0) return false;

  const conectados = new Set();
  for (const slot of ['primary', 'secondary']) {
    const cfg = consultorio?.mpConfigs?.[slot];
    const owner = cfg?.ownerAdminUid || cfg?.connectedByUid;
    if (owner) conectados.add(owner);
  }
  if (consultorio?.mpIntegrado && consultorio?.mpConfig) {
    const legacy = consultorio.mpConfig.ownerAdminUid || consultorio.mpConfig.connectedByUid;
    if (legacy) conectados.add(legacy);
  }

  return adminUids.every((uid) => conectados.has(uid));
}
