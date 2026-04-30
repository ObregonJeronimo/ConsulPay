/**
 * Helpers cliente para acciones destructivas del superadmin.
 *
 * Estas acciones requieren reautenticacion previa (la confirmacion
 * de identidad ademas del login activo) para minimizar riesgo de:
 *   - Sesiones robadas (alguien con acceso fisico a la maquina)
 *   - Operaciones realizadas por error
 *
 * Reautenticacion: usamos Firebase Auth reauthenticateWithPopup
 * para Google (las cuentas de superadmin son Google) — abre una
 * ventana de popup donde el user confirma con su cuenta de Google.
 *
 * Si en el futuro hay superadmins con cuentas de email/password,
 * habra que agregar reauthenticateWithCredential en una rama mas.
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

/**
 * Devuelve el provider del usuario actual (google.com, password, etc.).
 * Si no hay user logueado, devuelve null.
 *
 * Esto nos sirve para decidir el flow correcto de reauth:
 *   - 'google.com' -> reauthenticateWithPopup (Google popup)
 *   - 'password'   -> input de password + reauthenticateWithCredential
 *   - otro         -> no soportado por ahora
 */
export function getProveedorActual() {
  const user = auth.currentUser;
  if (!user) return null;
  // providerData es un array, tomamos el primero (cuenta principal).
  // Por construccion en ConsulPay nunca linkamos cuentas de proveedores
  // distintos, asi que es siempre 1 elemento.
  return user.providerData?.[0]?.providerId || null;
}

/**
 * Reautentica al user actual con Google. Abre popup, devuelve true si
 * el user confirmo. Lanza error si rechaza, cierra popup, o si no es
 * cuenta de Google.
 *
 * Despues de un reauth exitoso, las acciones sensibles tienen una
 * "ventana de confianza" reciente. Firebase Auth no expone explicitamente
 * cuanto dura, pero para nuestros endpoints (que validan auth con
 * verifyIdToken pero no chequean recencia), basta con haber pasado
 * el reauth en la misma sesion del browser justo antes.
 */
export async function reautenticarConGoogle() {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('No hay usuario logueado.');
  }
  const provider = new GoogleAuthProvider();
  // Forzar a que Google pida elegir cuenta aunque ya este logueado,
  // para que el user explicitamente confirme con QUE cuenta esta
  // autorizando la accion.
  provider.setCustomParameters({ prompt: 'select_account' });

  try {
    await reauthenticateWithPopup(user, provider);
    return true;
  } catch (err) {
    // Si el user cierra el popup o cancela, lo tratamos como no
    // confirmado (no es un error fatal, es un "no quiso").
    if (err.code === 'auth/popup-closed-by-user'
      || err.code === 'auth/cancelled-popup-request'
      || err.code === 'auth/user-cancelled') {
      const e = new Error('Cancelaste la confirmación.');
      e.codigo = 'CANCELADO';
      throw e;
    }
    // Si la cuenta de Google con la que reautentica no es la misma
    // que esta logueada actualmente, Firebase lanza credential-mismatch.
    if (err.code === 'auth/user-mismatch') {
      throw new Error(
        'La cuenta de Google que confirmaste no coincide con la cuenta logueada. ' +
        'Tenés que confirmar con la misma cuenta.',
      );
    }
    throw new Error(err.message || 'No se pudo confirmar la identidad.');
  }
}

/**
 * Reautentica con email/password. Para uso futuro si llega a haber
 * superadmins con email/password.
 */
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
   Llamadas a endpoints
   ============================================================ */

/**
 * Llama al endpoint backend con el id token actual del user en el
 * header Authorization. Helper interno.
 */
async function callApi(endpoint, body) {
  const user = auth.currentUser;
  if (!user) throw new Error('No hay usuario logueado.');

  const token = await user.getIdToken();
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(body || {}),
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
 *
 * @param {string} consultorioId
 * @returns {Promise<{ ok: true, deleted: { ... } }>}
 *   deleted contiene el conteo de docs eliminados por coleccion.
 */
export async function eliminarConsultorioSuper(consultorioId) {
  if (!consultorioId) throw new Error('consultorioId requerido');
  return await callApi('/api/super/eliminar-consultorio', { consultorioId });
}

/**
 * Retira o elimina un profesional/admin.
 *
 * @param {object} params
 * @param {string} params.uid             - uid del target
 * @param {string} params.consultorioId   - consultorio del target
 * @param {'retirar'|'eliminar'} params.modo
 *   - 'retirar': soft delete (estado='retirado', mantiene doc)
 *   - 'eliminar': hard delete (borra el doc /usuarios)
 */
export async function eliminarProfesionalSuper({ uid, consultorioId, modo }) {
  if (!uid) throw new Error('uid requerido');
  if (!consultorioId) throw new Error('consultorioId requerido');
  if (modo !== 'retirar' && modo !== 'eliminar') {
    throw new Error('modo invalido');
  }
  return await callApi('/api/super/eliminar-profesional', {
    uid,
    consultorioId,
    modo,
  });
}
