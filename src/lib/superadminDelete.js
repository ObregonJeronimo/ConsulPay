/**
 * Helpers cliente para acciones destructivas del superadmin.
 *
 * Estas acciones requieren reautenticacion previa (la confirmacion
 * de identidad ademas del login activo) para minimizar riesgo de:
 *   - Sesiones robadas (alguien con acceso fisico a la maquina)
 *   - Operaciones realizadas por error
 *
 * Reautenticacion: usamos Firebase Auth reauthenticateWithPopup
 * para Google (las cuentas de superadmin son Google).
 *
 * Endpoint backend: /api/super (router unico que usa el campo
 * "accion" para decidir que hacer). Esto se hizo para no exceder
 * el limite de 12 funciones serverless del plan Hobby de Vercel.
 */

import {
  EmailAuthProvider,
  GoogleAuthProvider,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
} from 'firebase/auth';

import { auth } from './firebase.js';

/* ============================================================
   Reautenticacion
   ============================================================ */

export function getProveedorActual() {
  const user = auth.currentUser;
  if (!user) return null;
  return user.providerData?.[0]?.providerId || null;
}

export async function reautenticarConGoogle() {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('No hay usuario logueado.');
  }
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });

  try {
    await reauthenticateWithPopup(user, provider);
    return true;
  } catch (err) {
    if (err.code === 'auth/popup-closed-by-user'
      || err.code === 'auth/cancelled-popup-request'
      || err.code === 'auth/user-cancelled') {
      const e = new Error('Cancelaste la confirmación.');
      e.codigo = 'CANCELADO';
      throw e;
    }
    if (err.code === 'auth/user-mismatch') {
      throw new Error(
        'La cuenta de Google que confirmaste no coincide con la cuenta logueada. ' +
        'Tenés que confirmar con la misma cuenta.',
      );
    }
    throw new Error(err.message || 'No se pudo confirmar la identidad.');
  }
}

export async function reautenticarConPassword(password) {
  const user = auth.currentUser;
  if (!user) throw new Error('No hay usuario logueado.');
  if (!user.email) throw new Error('Tu cuenta no tiene email.');

  const credential = EmailAuthProvider.credential(user.email, password);
  try {
    await reauthenticateWithCredential(user, credential);
    return true;
  } catch (err) {
    if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
      throw new Error('Contraseña incorrecta.');
    }
    throw new Error(err.message || 'No se pudo confirmar la identidad.');
  }
}

/* ============================================================
   Llamadas a /api/super
   ----------------------------------------------------------------
   Endpoint unico con router interno. El body siempre incluye un
   campo "accion" que indica que operacion ejecutar.
   ============================================================ */

/**
 * Helper interno que llama a /api/super con el id token actual.
 */
async function callSuperApi(accion, params) {
  const user = auth.currentUser;
  if (!user) throw new Error('No hay usuario logueado.');

  const token = await user.getIdToken();
  const res = await fetch('/api/super', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ accion, ...params }),
  });

  let data;
  try {
    data = await res.json();
  } catch {
    data = {};
  }

  if (!res.ok) {
    const err = new Error(data.error || `Error ${res.status}`);
    err.status = res.status;
    err.codigo = data.codigo;
    err.detalle = data;
    throw err;
  }

  return data;
}

/**
 * Elimina un consultorio entero con cascada. Backend valida que sea
 * superadmin + plan free + sin suscripcion activa.
 */
export async function eliminarConsultorioSuper(consultorioId) {
  if (!consultorioId) throw new Error('consultorioId requerido');
  return await callSuperApi('eliminar-consultorio', { consultorioId });
}

/**
 * Retira o elimina un profesional/admin.
 *
 * @param {object} params
 * @param {string} params.uid             - uid del target
 * @param {string} params.consultorioId   - consultorio del target
 * @param {'retirar'|'eliminar'} params.modo
 */
export async function eliminarProfesionalSuper({ uid, consultorioId, modo }) {
  if (!uid) throw new Error('uid requerido');
  if (!consultorioId) throw new Error('consultorioId requerido');
  if (modo !== 'retirar' && modo !== 'eliminar') {
    throw new Error('modo invalido');
  }
  return await callSuperApi('eliminar-profesional', {
    uid,
    consultorioId,
    modo,
  });
}
