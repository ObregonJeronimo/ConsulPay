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
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';

import { auth, db, googleProvider } from './firebase.js';
import { ESTADOS_USUARIO, ROLES } from './constants.js';

/* ============================================================
   Helpers internos
   ============================================================ */

/**
 * Asegura que exista un documento en usuarios/{uid}. Si no existe, lo crea
 * con rol=profesional y estado=pendiente. Si existe, lo devuelve intacto.
 *
 * Retorna siempre el doc actualizado.
 */
async function ensureUserDoc(firebaseUser) {
  const userRef = doc(db, 'usuarios', firebaseUser.uid);
  const snap = await getDoc(userRef);

  if (snap.exists()) {
    return { uid: firebaseUser.uid, ...snap.data() };
  }

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

export async function loginWithGoogle() {
  const credential = await signInWithPopup(auth, googleProvider);
  return await ensureUserDoc(credential.user);
}

export async function loginWithEmail(email, password) {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return await ensureUserDoc(credential.user);
}

export async function registerWithEmail(email, password, displayName) {
  const credential = await createUserWithEmailAndPassword(auth, email, password);

  if (displayName) {
    await updateProfile(credential.user, { displayName });
  }

  return await ensureUserDoc(credential.user);
}

export async function signOut() {
  await firebaseSignOut(auth);
}

/**
 * Lectura one-shot del doc del usuario. Usada en login/registro para
 * garantizar que el doc exista antes de empezar a suscribirse en vivo.
 */
export async function getUserDoc(firebaseUser) {
  return await ensureUserDoc(firebaseUser);
}

/**
 * Suscribe en vivo al doc /usuarios/{uid}.
 *
 * El callback recibe { uid, ...data } cuando el doc existe, o null si no
 * existe (caso borde: alguien lo borró desde Firestore Console mientras
 * el user estaba logueado).
 *
 * Devuelve un unsubscribe que el caller debe llamar al desmontarse o
 * cuando cambie de usuario, para evitar leaks de suscripciones.
 *
 * Es la base del comportamiento "live" del AuthContext: cualquier cambio
 * en el doc del usuario (rol, estado, consultorioId,
 * permitirEdicionSesiones, etc.) se refleja al instante en
 * useAuth().user sin necesidad de re-login.
 *
 * IMPORTANTE: el caller debe haber llamado primero a getUserDoc para
 * garantizar que el doc exista. Si el doc no existe cuando se levanta
 * la suscripción, el primer callback va a venir con null.
 */
export function suscribirUserDoc(uid, callback) {
  const userRef = doc(db, 'usuarios', uid);
  return onSnapshot(
    userRef,
    (snap) => {
      if (snap.exists()) {
        callback({ uid: snap.id, ...snap.data() });
      } else {
        callback(null);
      }
    },
    (err) => {
      console.error('[Auth] Error en suscripción al doc del usuario:', err);
      callback(null);
    },
  );
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

  if (error) {
    console.error('[Auth error]', error.code, error.message, error);
  }

  if (mapa[code]) return mapa[code];
  if (code) return `Error de autenticación: ${code}`;
  return 'Ocurrió un error inesperado. Revisá la consola (F12) para más detalle.';
}
