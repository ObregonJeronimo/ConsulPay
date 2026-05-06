/**
 * /api/cron/suscripciones-expiradas
 *
 * Cron job diario. Busca consultorios donde:
 *  - subscription.status == 'cancelled' (canceladas pero todavia Pro)
 *  - subscription.currentPeriodEnd < ahora
 *  - plan == 'pro' (todavia no fueron bajadas)
 *
 * Y los baja a plan='free' + comisionConsulpay=6.
 *
 * Tambien maneja consultorios donde subscription.status == 'authorized'
 * pero currentPeriodEnd ya paso hace mas de N dias sin renovar (caso
 * de fallo silencioso de MP). Por las dudas.
 *
 * SEGURIDAD: este endpoint debe ser solo llamable por Vercel Cron.
 * Validamos el header `Authorization: Bearer <CRON_SECRET>` que
 * Vercel manda automaticamente.
 *
 * Configurar en vercel.json:
 *   "crons": [{
 *     "path": "/api/cron/suscripciones-expiradas",
 *     "schedule": "0 3 * * *"  // todos los dias a las 03:00 UTC
 *   }]
 */

import { FieldValue, getFirestore } from 'firebase-admin/firestore';

import { initAdmin } from '../_lib/firebase-admin.js';
import { jsonResponse } from '../_lib/http.js';

export default async function handler(req, res) {
  // Validar que sea Vercel Cron (mandamos un secret en el header)
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const auth = req.headers.authorization || '';
    if (auth !== `Bearer ${expected}`) {
      return jsonResponse(res, 401, { error: 'No autorizado.' });
    }
  } else if (process.env.NODE_ENV === 'production') {
    console.error('CRON_SECRET no configurado en produccion');
    return jsonResponse(res, 500, { error: 'CRON_SECRET no configurado' });
  }
  // En dev permitimos sin auth para que Thiago pueda probar manual.

  try {
    initAdmin();
  } catch (err) {
    console.error('initAdmin fallo:', err);
    return jsonResponse(res, 500, { error: 'init_admin_fallo' });
  }

  const db = getFirestore();

  // En el modelo nuevo, cada consultorio ya tiene comisionFree configurada.
  // Al bajar a Free NO sobrescribimos: dejamos lo que cada consultorio tenga.
  // Solo verificamos que NO falte el campo (compat consultorios antiguos).
  // Si falta, leemos el default desde config/global como fallback.
  let comisionFreeDefault = 1;
  try {
    const cfgSnap = await db.collection('config').doc('global').get();
    if (cfgSnap.exists) {
      const cfg = cfgSnap.data();
      if (typeof cfg.comisionFree === 'number' && cfg.comisionFree >= 0 && cfg.comisionFree <= 100) {
        comisionFreeDefault = cfg.comisionFree;
      }
    }
  } catch (err) {
    console.warn('No se pudo leer config/global, uso 1% default:', err.message);
  }

  const ahora = new Date();
  const stats = {
    procesados: 0,
    bajadosAFree: 0,
    errores: 0,
  };

  /* ----------------------------------------
     Caso 1: cancelados que ya vencieron
     - sub.status='cancelled' AND currentPeriodEnd < ahora AND plan='pro'
     ----------------------------------------
     Firestore no soporta "<" en queries combinadas con otros where
     facilmente. Estrategia simple: leer todos los Pro y filtrar en
     memoria. Para escala chica funciona; si crece, agregamos un index
     compuesto y query con limit. */
  const proSnap = await db.collection('consultorios')
    .where('plan', '==', 'pro')
    .get();

  for (const doc of proSnap.docs) {
    stats.procesados += 1;
    const data = doc.data();
    const sub = data.subscription || {};
    const fin = sub.currentPeriodEnd;
    const finDate = fin?.toDate ? fin.toDate() : (fin instanceof Date ? fin : null);

    if (!finDate) continue;
    if (finDate >= ahora) continue;

    // Vencido. Bajamos a Free siempre (haya cancelado o no — si no
    // cancelo y MP no cobro, igual bajamos por seguridad. Si despues
    // MP cobra, el webhook va a re-extender el periodo).
    //
    // Solo seteamos comisionFree si el consultorio NO tiene el campo
    // (compat consultorio antiguo). Si ya lo tiene configurado, lo
    // respetamos.
    try {
      const tieneComisionFree = typeof data.comisionFree === 'number'
        && data.comisionFree >= 0
        && data.comisionFree <= 100;

      const update = {
        plan: 'free',
        planVenceEn: null,
        'subscription.status':
          sub.status === 'authorized' ? 'expired' : (sub.status || 'expired'),
        'subscription.expiredAt': FieldValue.serverTimestamp(),
        'subscription.updatedAt': FieldValue.serverTimestamp(),
      };
      if (!tieneComisionFree) {
        update.comisionFree = comisionFreeDefault;
      }

      await doc.ref.update(update);
      stats.bajadosAFree += 1;
      console.log(
        `Cron: bajado a Free consultorio ${doc.id} (subStatus=${sub.status}, fin=${finDate.toISOString()})`,
      );
    } catch (err) {
      stats.errores += 1;
      console.error(`Error bajando consultorio ${doc.id} a Free:`, err);
    }
  }

  return jsonResponse(res, 200, {
    ok: true,
    ranAt: ahora.toISOString(),
    ...stats,
  });
}
