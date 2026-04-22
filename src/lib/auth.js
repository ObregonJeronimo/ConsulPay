/**
 * Servicio de autenticación
 *
 * Maneja todos los flows de login/registro y sincronización con el documento
 * de usuario en Firestore.
 *
 * ARQUITECTURA DE ROLES:
 * - Todo usuario autenticado tiene un documento en `usuarios/{uid}`.
 * - El rol ("admin" | "profesional") vive en ese documento, NUNCA hardcodeado.
 * - Cuando un usuario entra por primera vez, se crea con rol "profesional" y
 *   estado "pendiente" por defecto.
 * - Para promover a alguien a admin, editar el doc manualmente en Firestore Console.
 * - Las Security Rules de Firestore garantizan que un usuario no pueda
 *   modificar su propio rol ni estado.
 */

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  updateProfile,
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';

import { auth, db, googleProvider } from './firebase.js';
import { ESTADOS_USUARIO, ROLES } from './constants.js';

/* ============================================================
   Helpers internos
   ============================================================ */

/**
 * Asegura que exista un documento en usuarios/{uid}. Si no existe, lo crea
 * con rol=profesional y estado=pendiente. Si existe, lo devuelve intacto.
 *
 * Retorna siempre el doc actualizado: { uid, email, displayName, rol, estado, ... }
 */
async function ensureUserDoc(firebaseUser) {
  const userRef = doc(db, 'usuarios', firebaseUser.uid);
  const snap = await getDoc(userRef);

  if (snap.exists()) {
    return { uid: firebaseUser.uid, ...snap.data() };
  }

  // Usuario nuevo: inicializar con rol básico
  const newUser = {
    email: firebaseUser.email ?? null,
    displayName: firebaseUser.displayName ?? null,
    photoURL: firebaseUser.photoURL ?? null,
    rol: ROLES.PROFESIONAL,
    estado: ESTADOS_USUARIO.PENDIENTE,
    consultorioId: null,
    createdAt: serverTimestamp(),
  };

  await setDoc(userRef, newUser);
  return { uid: firebaseUser.uid, ...newUser };
}

/* ============================================================
   API pública
   ============================================================ */

/**
 * Login con popup de Google.
 * @returns {Promise<Object>} el doc del usuario en Firestore
 */
export async function loginWithGoogle() {
  const credential = await signInWithPopup(auth, googleProvider);
  return await ensureUserDoc(credential.user);
}

/**
 * Login con email + password.
 */
export async function loginWithEmail(email, password) {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return await ensureUserDoc(credential.user);
}

/**
 * Registro con email + password. Setea el displayName si se provee.
 */
export async function registerWithEmail(email, password, displayName) {
  const credential = await createUserWithEmailAndPassword(auth, email, password);

  if (displayName) {
    await updateProfile(credential.user, { displayName });
  }

  return await ensureUserDoc(credential.user);
}

/**
 * Cierra sesión.
 */
export async function signOut() {
  await firebaseSignOut(auth);
}

/**
 * Dado un FirebaseUser, devuelve el doc extendido de Firestore.
 * Útil en el onAuthStateChanged del contexto.
 */
export async function getUserDoc(firebaseUser) {
  return await ensureUserDoc(firebaseUser);
}

/* ============================================================
   Traducción de errores de Firebase a mensajes amigables
   ============================================================ */

export function traducirErrorAuth(error) {
  const code = error?.code ?? '';

  const mapa = {
    'auth/invalid-email': 'El email no es válido.',
    'auth/user-disabled': 'Esta cuenta fue deshabilitada.',
    'auth/user-not-found': 'No existe una cuenta con ese email.',
    'auth/wrong-password': 'Contraseña incorrecta.',
    'auth/invalid-credential': 'Email o contraseña incorrectos.',
    'auth/email-already-in-use': 'Ya existe una cuenta con ese email.',
    'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres.',
    'auth/popup-closed-by-user': 'Cerraste la ventana antes de completar el login.',
    'auth/popup-blocked': 'El navegador bloqueó la ventana de Google. Permití popups e intentá de nuevo.',
    'auth/cancelled-popup-request': 'La ventana anterior se cerró. Intentá de nuevo.',
    'auth/network-request-failed': 'Error de red. Verificá tu conexión.',
    'auth/too-many-requests': 'Demasiados intentos. Esperá unos minutos.',
    'auth/operation-not-allowed': 'Este método de inicio de sesión no está habilitado. Habilitalo en Firebase Console → Authentication → Sign-in method.',
    'auth/unauthorized-domain': 'El dominio no está autorizado. Agregalo en Firebase Console → Authentication → Settings → Authorized domains.',
    'auth/account-exists-with-different-credential': 'Ya existe una cuenta con ese email usando otro método de inicio.',
  };

  // Log siempre en consola para debug
  if (error) {
    console.error('[Auth error]', error.code, error.message, error);
  }

  // Si tengo mensaje traducido, lo devuelvo. Si no, devuelvo el código crudo
  // para que se vea qué está pasando (más útil que un genérico).
  if (mapa[code]) return mapa[code];
  if (code) return `Error de autenticación: ${code}`;
  return 'Ocurrió un error inesperado. Revisá la consola (F12) para más detalle.';
}
