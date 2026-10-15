/**
 * Firebase inicialización
 *
 * Las keys de Firebase web son PÚBLICAS — van en el frontend y se ven en el bundle.
 * La seguridad real la dan las Security Rules de Firestore y la config de Authentication.
 * Ver: https://firebase.google.com/docs/projects/api-keys
 */

import { initializeApp } from 'firebase/app';
import { GoogleAuthProvider, getAuth } from 'firebase/auth';
import {
  getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyBR0sJiELHhM9rB2R0aIfpnQoYfK1cJ1Ec',
  authDomain: 'consulpay-b84f0.firebaseapp.com',
  projectId: 'consulpay-b84f0',
  storageBucket: 'consulpay-b84f0.firebasestorage.app',
  messagingSenderId: '451327014660',
  appId: '1:451327014660:web:936624a5cf8a56527f4251',
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
/*
  Firestore con cache persistente (IndexedDB) y no solo en memoria.

  Firestore cobra una lectura por documento cada vez que se abre una
  escucha. Con la cache solo en memoria, volver a una pantalla o recargar la
  pagina leia todo de nuevo: en CALA, ~1.000 sesiones por vez. Con la cache
  persistente, si se vuelve dentro de los 30 minutos Firestore reanuda la
  escucha y cobra solo lo que cambio. Los datos siguen en vivo: lo de la
  cache se muestra primero y se corrige solo apenas llega el servidor.

  persistentMultipleTabManager porque es comun tener la app abierta en dos
  pestanas. Si el navegador no tiene IndexedDB (alguna ventana privada),
  Firestore sigue con cache en memoria, que es lo que habia antes.

  Al cerrar sesion la cache se borra (ver signOut en lib/auth.js): en una
  computadora compartida no tienen que quedar pacientes ni montos.
*/
function crearFirestore() {
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch (e) {
    console.warn('Firestore sin cache persistente, sigue con la de memoria:', e);
    return getFirestore(app);
  }
}

export const db = crearFirestore();
export const googleProvider = new GoogleAuthProvider();
