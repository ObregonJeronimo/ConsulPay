/**
 * Helpers de autenticacion para endpoints serverless.
 */

import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

import { initAdmin } from './firebase-admin.js';

/**
 * Valida el header Authorization: Bearer <token> contra firebase-admin.
 * Devuelve el uid si es valido. Lanza error si no.
 */
export async function verificarAuthHeader(req) {
  initAdmin();
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    const err = new Error('Falta el token de autenticacion.');
    err.status = 401;
    throw err;
  }
  try {
    const decoded = await getAuth().verifyIdToken(token);
    return decoded.uid;
  } catch {
    const err = new Error('Token invalido o expirado.');
    err.status = 401;
    throw err;
  }
}

/**
 * Trae el doc del usuario por uid. Devuelve { uid, ...userData } o null
 * si no existe.
 */
export async function traerUsuario(uid) {
  initAdmin();
  const db = getFirestore();
  const snap = await db.collection('usuarios').doc(uid).get();
  if (!snap.exists) return null;
  return { uid, ...snap.data() };
}

/**
 * Verifica que el caller (uid) sea admin del consultorio indicado.
 * Chequea las dos condiciones (igual que firestore.rules / esAdminDe):
 *  1. userData.consultorioId == consultorioId
 *  2. uid esta listado en consultorios/{id}.adminUids[]
 *
 * Tambien acepta superadmin sin chequeos adicionales.
 *
 * Devuelve { user, consultorio } si todo OK. Lanza error si no.
 */
export async function asegurarAdminDeConsultorio({ uid, consultorioId }) {
  initAdmin();
  const db = getFirestore();

  const userSnap = await db.collection('usuarios').doc(uid).get();
  if (!userSnap.exists) {
    const err = new Error('Tu usuario no existe.');
    err.status = 403;
    throw err;
  }
  const userData = userSnap.data();

  const consSnap = await db.collection('consultorios').doc(consultorioId).get();
  if (!consSnap.exists) {
    const err = new Error('El consultorio no existe.');
    err.status = 404;
    throw err;
  }
  const consData = consSnap.data();

  const esSuperadmin = userData.rol === 'superadmin';
  const esAdmin = userData.rol === 'admin'
    && userData.consultorioId === consultorioId
    && Array.isArray(consData.adminUids)
    && consData.adminUids.includes(uid);

  if (!esSuperadmin && !esAdmin) {
    const err = new Error('No sos administrador de este consultorio.');
    err.status = 403;
    throw err;
  }

  return {
    user: { uid, ...userData },
    consultorio: { id: consultorioId, ...consData },
  };
}
