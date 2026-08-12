/* ============================================================
   Service worker de Firebase Cloud Messaging
   ----------------------------------------------------------------
   Recibe los push cuando ConsulPay NO esta abierta o esta en otra
   pestana. Si la app esta en primer plano, el mensaje lo maneja
   onMessage() en src/lib/notificaciones.js y este archivo no
   interviene.

   Tiene que vivir en /public y llamarse exactamente asi: el SDK de
   FCM busca /firebase-messaging-sw.js en la raiz del dominio. Si se
   renombra o se mueve, deja de registrarse sin dar error claro.

   OJO: un service worker no puede importar modulos ES ni usar el
   bundle de la app — corre aislado. Por eso se cargan los scripts
   "compat" por CDN y la config de Firebase esta repetida aca. Si
   alguna vez cambia el proyecto de Firebase, hay que tocar los dos
   lugares: src/lib/firebase.js y este archivo.

   Las keys son publicas (ver el comentario de src/lib/firebase.js).
   ============================================================ */

importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyBR0sJiELHhM9rB2R0aIfpnQoYfK1cJ1Ec',
  authDomain: 'consulpay-b84f0.firebaseapp.com',
  projectId: 'consulpay-b84f0',
  storageBucket: 'consulpay-b84f0.firebasestorage.app',
  messagingSenderId: '451327014660',
  appId: '1:451327014660:web:936624a5cf8a56527f4251',
});

/* Sin esto, un service worker nuevo queda "esperando" hasta que se cierren
   TODAS las pestanas del sitio, y mientras tanto sigue respondiendo el
   viejo. En la practica significa que cualquier cambio de este archivo
   puede tardar dias en verse: por eso el badge nuevo seguia saliendo con
   el icono anterior. skipWaiting lo activa de una y clients.claim le da el
   control de las pestanas ya abiertas. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const datos = payload.data || {};
  const titulo = datos.titulo || 'ConsulPay';
  const opciones = {
    body: datos.cuerpo || '',
    icon: '/favicon.svg',
    /* El badge NO puede ser el favicon: Android le descarta el color y se
       queda con la silueta del canal alpha. El favicon es un cuadrado opaco
       de punta a punta, asi que la silueta terminaba siendo ese cuadrado y
       la C desaparecia adentro. badge-notificacion.png tiene la C calada
       sobre fondo transparente, que es lo que Android espera. */
    badge: '/badge-notificacion.png',
    /* tag agrupa: si llegan dos avisos del mismo recordatorio, el segundo
       reemplaza al primero en vez de apilarse. */
    tag: datos.tag || 'consulpay',
    data: { url: datos.url || '/' },
  };
  return self.registration.showNotification(titulo, opciones);
});

/* Al tocar la notificacion: si ya hay una pestana de ConsulPay abierta se
   enfoca esa en vez de abrir otra, que es lo que espera cualquiera. */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const destino = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((listaClientes) => {
        for (const cliente of listaClientes) {
          if (cliente.url.includes(self.location.origin) && 'focus' in cliente) {
            cliente.navigate(destino);
            return cliente.focus();
          }
        }
        return self.clients.openWindow(destino);
      }),
  );
});
