/**
 * Inicializacion compartida de firebase-admin para todos los
 * endpoints serverless de /api/.
 *
 * Se autentica con una service account JSON guardada en la env var
 * FIREBASE_ADMIN_KEY (string JSON). En Vercel cada serverless function
 * arranca limpia, asi que no podemos asumir que initializeApp ya fue
 * llamado — chequeamos getApps().length cada vez.
 */

import { cert, getApps, initializeApp } from 'firebase-admin/app';

let initialized = false;

export function initAdmin() {
  if (initialized) return;
  if (getApps().length > 0) {
    initialized = true;
    return;
  }

  const raw = process.env.FIREBASE_ADMIN_KEY;
  if (!raw) {
    throw new Error(
      'FIREBASE_ADMIN_KEY no está configurada en Vercel Env Vars.',
    );
  }

  const serviceAccount = typeof raw === 'string' ? JSON.parse(raw) : raw;
  initializeApp({ credential: cert(serviceAccount) });
  initialized = true;
}
