/**
 * Cliente frontend para compensaciones del "reparto entre socias".
 *
 * Modelo:
 *   /consultorios/{consultorioId}/compensaciones/{idCiclo}
 *   donde idCiclo = 'AAAA-MM-15' (formato deterministico desde la fecha).
 *
 * Flow tipico:
 *   1. UI lista compensaciones del consultorio via suscribirCompensaciones()
 *   2. Cuando termina un ciclo (ej: hoy es 16-jul, el ciclo previo
 *      cerró el 14-jul), el admin puede llamar a cerrarCiclo() para
 *      calcular y persistir la compensacion.
 *   3. UI muestra "Mama tiene que transferirle $X a Socia". Mama hace
 *      click en "Generar link MP" (genera URL con monto y alias precargados).
 *   4. Mama transfiere desde su MP. Vuelve a ConsulPay y aprieta
 *      "Ya transferi" → llama marcarTransferida()
 *   5. Socia ve el cambio en vivo y aprieta "Confirmar que recibi"
 *      → llama confirmarRecibida(). Compensacion saldada.
 *
 * Las operaciones de escritura van por backend (/api/mp/compensaciones)
 * porque las rules de Firestore tienen write: false en compensaciones
 * (por seguridad: queremos validar que el caller sea el pagante o el
 * receptor segun corresponda, y eso se hace en el endpoint).
 *
 * La lectura va directo a Firestore (admins del consultorio pueden leer
 * por las rules).
 */

import { getAuth } from 'firebase/auth';
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
} from 'firebase/firestore';

import { db } from './firebase.js';

/* ============================================================
   Helper: POST con Firebase ID token
   ============================================================ */

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
    err.codigo = data?.codigo;
    err.status = res.status;
    throw err;
  }
  return data;
}

/* ============================================================
   Constantes
   ============================================================ */

export const ESTADOS_COMPENSACION = {
  PENDIENTE: 'pendiente',
  TRANSFERIDO: 'transferido',
  SALDADO: 'saldado',
};

/* ============================================================
   API publica — escrituras (via backend)
   ============================================================ */

/**
 * Cierra un ciclo: calcula y persiste la compensacion. Si idCiclo no
 * se pasa, cierra el ciclo previo al actual (no el actual — los
 * ciclos se cierran solo cuando terminan).
 *
 * @param {string} consultorioId
 * @param {string} [idCiclo] - opcional, formato 'AAAA-MM-15'
 * @returns {Promise<{ok: boolean, compensacion: Object}>}
 */
export async function cerrarCiclo(consultorioId, idCiclo) {
  const body = { accion: 'cerrar-ciclo', consultorioId };
  if (idCiclo) body.idCiclo = idCiclo;
  return postConIdToken('/api/mp/compensaciones', body);
}

/**
 * Recalcula los totales de un ciclo ya cerrado (por refunds, pagos
 * tardios, etc.). Solo se puede en estado 'pendiente' — una vez que
 * el pagante confirmó la transferencia, no se puede recalcular.
 *
 * @param {string} consultorioId
 * @param {string} idCiclo
 * @returns {Promise<{ok: boolean, compensacion: Object}>}
 */
export async function recalcularCompensacion(consultorioId, idCiclo) {
  return postConIdToken('/api/mp/compensaciones', {
    accion: 'recalcular',
    consultorioId,
    idCiclo,
  });
}

/**
 * El admin pagante (el que tiene mas plata) marca que ya hizo la
 * transferencia. Cambia estado pendiente → transferido.
 *
 * Solo puede llamar el admin que es ownerAdminUidPagante de la
 * compensacion. El backend valida.
 *
 * @param {string} consultorioId
 * @param {string} idCiclo
 * @returns {Promise<{ok: boolean}>}
 */
export async function marcarTransferida(consultorioId, idCiclo) {
  return postConIdToken('/api/mp/compensaciones', {
    accion: 'marcar-transferida',
    consultorioId,
    idCiclo,
  });
}

/**
 * El admin receptor confirma que recibió la transferencia. Cambia
 * estado transferido → saldado.
 *
 * Solo puede llamar el admin que es ownerAdminUidReceptor de la
 * compensacion. Requiere que el estado sea 'transferido'. El backend
 * valida.
 *
 * @param {string} consultorioId
 * @param {string} idCiclo
 * @returns {Promise<{ok: boolean}>}
 */
export async function confirmarRecibida(consultorioId, idCiclo) {
  return postConIdToken('/api/mp/compensaciones', {
    accion: 'confirmar-recibida',
    consultorioId,
    idCiclo,
  });
}

/* ============================================================
   API publica — lecturas (live via Firestore)
   ============================================================ */

/**
 * Suscribe a las compensaciones de un consultorio, ordenadas por
 * fecha (mas reciente primero).
 *
 * @param {string} consultorioId
 * @param {(compensaciones: Array) => void} onChange
 * @returns {() => void} unsubscribe
 */
export function suscribirCompensaciones(consultorioId, onChange) {
  if (!consultorioId) throw new Error('consultorioId requerido');

  const q = query(
    collection(db, 'consultorios', consultorioId, 'compensaciones'),
    orderBy('desde', 'desc'),
  );

  return onSnapshot(q, (snap) => {
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    onChange(items);
  });
}

/**
 * Suscribe a una compensacion especifica (por id de ciclo).
 *
 * @param {string} consultorioId
 * @param {string} idCiclo
 * @param {(compensacion: Object|null) => void} onChange
 * @returns {() => void} unsubscribe
 */
export function suscribirCompensacion(consultorioId, idCiclo, onChange) {
  const ref = doc(db, 'consultorios', consultorioId, 'compensaciones', idCiclo);
  return onSnapshot(ref, (snap) => {
    if (!snap.exists()) {
      onChange(null);
      return;
    }
    onChange({ id: snap.id, ...snap.data() });
  });
}

/* ============================================================
   Helpers de UI
   ============================================================ */

/**
 * Genera URL de transferencia MP precargada con monto y, si esta
 * disponible, alias/CVU del receptor.
 *
 * IMPORTANTE: la URL es solo un atajo de UX. MP no garantiza que
 * acepte todos los parametros precargados via querystring — algunos
 * los respeta, otros los ignora. En el peor caso, abre la app/web
 * de MP y el user completa los datos manualmente.
 *
 * El user real va a:
 *  1. Click en el boton → abre app MP / web
 *  2. MP le muestra la pantalla de transferencia (con monto si lo
 *     respeto, sin si no)
 *  3. Confirma con su PIN/contraseña
 *  4. Vuelve a ConsulPay y aprieta "Ya transferi"
 *
 * @param {Object} params
 * @param {number} params.monto - monto a transferir
 * @param {string} [params.aliasReceptor] - alias MP del receptor
 * @returns {string} URL para abrir
 */
export function generarUrlTransferenciaMP({ monto, aliasReceptor }) {
  // El esquema de URL de MP para transferir cambia seguido. Hoy
  // (2026) la app responde a:
  //   https://www.mercadopago.com.ar/transferir?...
  // pero los parametros precargados varian. El fallback siempre
  // funciona: abrir mercadopago.com.ar y dejar que el user busque
  // "Transferir".
  const base = 'https://www.mercadopago.com.ar/';
  const params = new URLSearchParams();
  if (Number.isFinite(monto) && monto > 0) {
    params.set('amount', String(Math.round(monto * 100) / 100));
  }
  if (aliasReceptor) {
    params.set('alias', aliasReceptor);
  }
  // Path "transferir" es el que MP usa actualmente. Si no funciona,
  // MP redirige al home y el user transfiere manual.
  return `${base}transferir?${params.toString()}`;
}

/**
 * Formatea un periodo de ciclo en formato legible.
 *
 * Ejemplo: { desde: 2025-07-15, hasta: 2025-08-14 } → "15 jul → 14 ago 2025"
 *
 * @param {Object|Date} desde - Timestamp de Firestore o Date
 * @param {Object|Date} hasta
 * @returns {string}
 */
export function formatearPeriodoCiclo(desde, hasta) {
  const d = desde?.toDate ? desde.toDate() : (desde instanceof Date ? desde : new Date(desde));
  const h = hasta?.toDate ? hasta.toDate() : (hasta instanceof Date ? hasta : new Date(hasta));

  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

  const mismoYear = d.getFullYear() === h.getFullYear();
  if (mismoYear) {
    return `${d.getDate()} ${meses[d.getMonth()]} → ${h.getDate()} ${meses[h.getMonth()]} ${h.getFullYear()}`;
  }
  return `${d.getDate()} ${meses[d.getMonth()]} ${d.getFullYear()} → ${h.getDate()} ${meses[h.getMonth()]} ${h.getFullYear()}`;
}

/**
 * Devuelve true si una compensacion necesita accion del usuario actual.
 *
 * Casos:
 *  - estado=pendiente y user es el pagante → "tenés que transferir"
 *  - estado=transferido y user es el receptor → "tenés que confirmar"
 *
 * Util para mostrar badges/notificaciones de "tenés algo pendiente".
 *
 * @param {Object} comp
 * @param {string} userUid
 * @returns {boolean}
 */
export function requiereAccionDelUsuario(comp, userUid) {
  if (!comp || !userUid) return false;
  if (comp.estaEmparejado) return false;

  if (comp.estado === ESTADOS_COMPENSACION.PENDIENTE
      && comp.ownerAdminUidPagante === userUid) {
    return true;
  }
  if (comp.estado === ESTADOS_COMPENSACION.TRANSFERIDO
      && comp.ownerAdminUidReceptor === userUid) {
    return true;
  }
  return false;
}
