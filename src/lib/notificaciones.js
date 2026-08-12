/* ============================================================
   Notificaciones push (Firebase Cloud Messaging)
   ----------------------------------------------------------------
   El profesional habilita las notificaciones y el navegador le da un
   token de dispositivo. Ese token se guarda en su doc de /usuarios y
   el cron de recordatorios lo usa para mandarle el aviso.

   Se guardan VARIOS tokens por usuario: uno por navegador y por
   dispositivo. Alguien que usa el celular y la compu tiene dos, y los
   dos tienen que recibir.

   Nada de esto se hace al entrar a la app. Pedir permiso de
   notificaciones apenas alguien abre una web es la forma mas rapida
   de que te lo bloqueen para siempre: el navegador recuerda el "no" y
   despues no hay como volver a preguntar. Se pide cuando el usuario
   aprieta el boton.
   ============================================================ */

import { arrayRemove, arrayUnion, doc, getDoc, updateDoc } from 'firebase/firestore';

import { app, db } from './firebase.js';

/* Clave publica del par VAPID (Firebase Console > Cloud Messaging >
   Certificados push web). Es publica por diseno: viaja en el bundle. */
const VAPID_KEY = 'BG9LeMd5pCXZtp5RKYol0skTrLwYeNqgq1t0n3AeBuxTP9Tf1oFbFQFH7amrV8cOgtgDzxxyDDsd-S6XwQmWsZ0';

export const ESTADOS_PERMISO = {
  NO_SOPORTADO: 'no_soportado',
  REQUIERE_INSTALAR: 'requiere_instalar',
  PENDIENTE: 'pendiente',
  CONCEDIDO: 'concedido',
  BLOQUEADO: 'bloqueado',
};

/** ¿Esta corriendo como app instalada en la pantalla de inicio? */
export function esPWAInstalada() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)').matches
    || window.navigator?.standalone === true;
}

function esIOS() {
  if (typeof navigator === 'undefined') return false;
  // iPadOS 13+ se hace pasar por Mac; el touch lo delata.
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/**
 * En que estado esta este dispositivo. Se usa para decidir que mostrar
 * en la UI sin pedirle permiso a nadie.
 */
export function estadoPermiso() {
  if (typeof window === 'undefined') return ESTADOS_PERMISO.NO_SOPORTADO;

  const tieneAPIs = 'Notification' in window
    && 'serviceWorker' in navigator
    && 'PushManager' in window;

  /* iPhone: Apple solo habilita push web a las apps agregadas a la
     pantalla de inicio (iOS 16.4+). En Safari normal las APIs ni
     aparecen, asi que sin este chequeo el usuario veria "tu navegador
     no soporta notificaciones" sin saber que le falta un paso. */
  if (esIOS() && !esPWAInstalada()) return ESTADOS_PERMISO.REQUIERE_INSTALAR;

  if (!tieneAPIs) return ESTADOS_PERMISO.NO_SOPORTADO;

  switch (Notification.permission) {
    case 'granted': return ESTADOS_PERMISO.CONCEDIDO;
    case 'denied': return ESTADOS_PERMISO.BLOQUEADO;
    default: return ESTADOS_PERMISO.PENDIENTE;
  }
}

/** Etiqueta corta del dispositivo, para que el usuario reconozca cual es. */
function describirDispositivo() {
  if (typeof navigator === 'undefined') return 'Dispositivo';
  const ua = navigator.userAgent;
  const so = /Android/.test(ua) ? 'Android'
    : esIOS() ? 'iPhone'
      : /Windows/.test(ua) ? 'Windows'
        : /Mac/.test(ua) ? 'Mac'
          : /Linux/.test(ua) ? 'Linux' : 'Dispositivo';
  const nav = /Edg\//.test(ua) ? 'Edge'
    : /OPR\//.test(ua) ? 'Opera'
      : /Chrome\//.test(ua) ? 'Chrome'
        : /Firefox\//.test(ua) ? 'Firefox'
          : /Safari\//.test(ua) ? 'Safari' : '';
  return nav ? `${so} · ${nav}` : so;
}

/* El SDK de messaging se importa aparte y solo cuando hace falta: son
   ~30 KB que no tiene por que pagar quien nunca activa notificaciones. */
async function cargarMessaging() {
  const { getMessaging, isSupported } = await import('firebase/messaging');
  if (!(await isSupported())) return null;
  return getMessaging(app);
}

/**
 * Pide permiso, obtiene el token y lo guarda en el doc del usuario.
 * Devuelve { ok, estado, token, error }.
 */
export async function activarNotificaciones(uid) {
  if (!uid) return { ok: false, estado: ESTADOS_PERMISO.NO_SOPORTADO };

  const estadoPrevio = estadoPermiso();
  if (estadoPrevio === ESTADOS_PERMISO.NO_SOPORTADO
    || estadoPrevio === ESTADOS_PERMISO.REQUIERE_INSTALAR) {
    return { ok: false, estado: estadoPrevio };
  }

  const permiso = await Notification.requestPermission();
  if (permiso !== 'granted') {
    return { ok: false, estado: permiso === 'denied' ? ESTADOS_PERMISO.BLOQUEADO : ESTADOS_PERMISO.PENDIENTE };
  }

  try {
    const messaging = await cargarMessaging();
    if (!messaging) return { ok: false, estado: ESTADOS_PERMISO.NO_SOPORTADO };

    const { getToken } = await import('firebase/messaging');
    /* El SW se registra a mano y se le pasa al SDK: si se deja que lo
       haga solo, en algunos navegadores toma un scope distinto y el
       token queda atado a un registro que despues no recibe nada. */
    const registro = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registro,
    });
    if (!token) return { ok: false, estado: ESTADOS_PERMISO.PENDIENTE };

    await guardarToken(uid, token);
    return { ok: true, estado: ESTADOS_PERMISO.CONCEDIDO, token };
  } catch (err) {
    console.error('No se pudo activar las notificaciones:', err);
    // El code de Firebase ('permission-denied', 'unavailable'...) dice mucho
    // mas que el mensaje, y es lo que hace falta para diagnosticar.
    return { ok: false, estado: estadoPermiso(), error: err.code || err.message };
  }
}

/**
 * Guarda el token en el doc del usuario. arrayUnion no alcanza para
 * evitar duplicados porque el objeto incluye la fecha, y dos objetos
 * con distinta fecha son distintos para Firestore. Por eso se guarda
 * el token pelado en fcmTokens (para poder consultarlo desde el cron
 * sin parsear) y el detalle legible en fcmDispositivos.
 */
/* Clave segura para el mapa de dispositivos.

   Un token FCM tiene forma "abc123:APA91bH..." y puede traer ':' y '.'.
   Firestore lee el punto como separador de niveles, asi que
   `fcmDispositivos.abc:APA91bH` es un field path invalido y updateDoc
   falla ENTERO: no se guardaba ni el token, que es lo unico que
   importaba. Se deja solo lo que Firestore acepta en una clave. */
function claveDispositivo(token) {
  return token.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 24) || 'dispositivo';
}

async function guardarToken(uid, token) {
  const ref = doc(db, 'usuarios', uid);

  /* Dos escrituras y no una: el array de tokens es lo que el cron
     necesita para enviar, y no puede quedar sin guardar porque falle el
     detalle de dispositivos, que es solo informativo. */
  await updateDoc(ref, { fcmTokens: arrayUnion(token) });

  try {
    await updateDoc(ref, {
      [`fcmDispositivos.${claveDispositivo(token)}`]: {
        etiqueta: describirDispositivo(),
        registradoEn: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.warn('No se pudo guardar el detalle del dispositivo:', err);
  }
}

/**
 * ¿Este dispositivo esta realmente registrado para recibir avisos?
 *
 * No alcanza con Notification.permission: el permiso puede estar
 * concedido y el token no haberse guardado nunca (por un fallo de red o
 * de reglas). Sin este chequeo la UI decia "Avisos activados" mientras
 * el cron reportaba "sin dispositivos registrados".
 */
export async function tieneTokenRegistrado(uid) {
  if (!uid || estadoPermiso() !== ESTADOS_PERMISO.CONCEDIDO) return false;
  try {
    const messaging = await cargarMessaging();
    if (!messaging) return false;
    const { getToken } = await import('firebase/messaging');
    const registro = await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js');
    if (!registro) return false;
    const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registro });
    if (!token) return false;

    const snap = await getDoc(doc(db, 'usuarios', uid));
    return (snap.data()?.fcmTokens || []).includes(token);
  } catch (err) {
    console.error('No se pudo verificar el registro del dispositivo:', err);
    return false;
  }
}

/** Saca este dispositivo de la lista. El permiso del navegador queda igual. */
export async function desactivarNotificaciones(uid) {
  if (!uid) return { ok: false };
  try {
    const messaging = await cargarMessaging();
    if (!messaging) return { ok: false };

    const { deleteToken, getToken } = await import('firebase/messaging');
    const registro = await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js');
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      ...(registro ? { serviceWorkerRegistration: registro } : {}),
    });

    if (token) {
      await updateDoc(doc(db, 'usuarios', uid), {
        fcmTokens: arrayRemove(token),
        [`fcmDispositivos.${claveDispositivo(token)}`]: null,
      });
      await deleteToken(messaging);
    }
    return { ok: true };
  } catch (err) {
    console.error('No se pudo desactivar las notificaciones:', err);
    return { ok: false, error: err.message };
  }
}

/**
 * Escucha los mensajes que llegan con la app abierta. En primer plano el
 * service worker NO se ejecuta, asi que sin esto no pasaria nada visible.
 * Devuelve una funcion para desuscribirse.
 */
export async function escucharEnPrimerPlano(alRecibir) {
  try {
    if (estadoPermiso() !== ESTADOS_PERMISO.CONCEDIDO) return () => {};
    const messaging = await cargarMessaging();
    if (!messaging) return () => {};
    const { onMessage } = await import('firebase/messaging');
    return onMessage(messaging, (payload) => {
      const datos = payload?.data ?? {};
      /* Con la app abierta el service worker NO corre, asi que la
         notificacion hay que mostrarla a mano. Se usa el registro del SW
         y no new Notification() porque en Android Chrome el constructor
         directo tira error y no muestra nada. */
      mostrarNotificacionLocal(datos);
      if (typeof alRecibir === 'function') alRecibir(datos);
    });
  } catch {
    return () => {};
  }
}

async function mostrarNotificacionLocal(datos) {
  try {
    const registro = await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js');
    if (!registro) return;
    await registro.showNotification(datos.titulo || 'ConsulPay', {
      body: datos.cuerpo || '',
      icon: '/favicon.svg',
      // Ver el comentario del badge en firebase-messaging-sw.js.
      badge: '/badge-notificacion.png',
      tag: datos.tag || 'consulpay',
      data: { url: datos.url || '/' },
    });
  } catch (err) {
    console.error('No se pudo mostrar la notificación:', err);
  }
}
