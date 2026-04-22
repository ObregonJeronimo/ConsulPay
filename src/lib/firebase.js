/**
 * Firebase inicialización
 *
 * Las keys de Firebase web son PÚBLICAS — van en el frontend y se ven en el bundle.
 * La seguridad real la dan las Security Rules de Firestore y la config de Authentication.
 * Ver: https://firebase.google.com/docs/projects/api-keys
 */

import { initializeApp } from 'firebase/app';
import { GoogleAuthProvider, getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

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
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
