/**
 * Firebase inicialización
 *
 * NOTA: por ahora está con config placeholder. Cuando Jero pase las keys reales
 * desde console.firebase.google.com, las reemplazamos acá.
 *
 * Las keys de Firebase web son PÚBLICAS — van en el frontend y se ven
 * en el bundle. La seguridad real la dan las Security Rules de Firestore
 * y la config de Authentication.
 */

import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'PLACEHOLDER_REEMPLAZAR',
  authDomain: 'consulpay-placeholder.firebaseapp.com',
  projectId: 'consulpay-placeholder',
  storageBucket: 'consulpay-placeholder.firebasestorage.app',
  messagingSenderId: '000000000000',
  appId: '1:000000000000:web:placeholder',
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
