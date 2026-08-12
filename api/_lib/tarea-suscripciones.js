/**
 * Tarea: bajar a Free los consultorios cuya suscripcion vencio.
 *
 * Vivia en api/cron/suscripciones-expiradas.js como endpoint propio.
 * Se movio a _lib porque Vercel Hobby permite 12 funciones serverless y
 * el proyecto llego al tope: todo lo que esta en _lib no cuenta como
 * funcion, asi que las dos tareas diarias comparten un solo endpoint
 * (api/cron/diario.js). La logica no cambio.
 *
 * Busca consultorios donde:
 *  - subscription.currentPeriodEnd < ahora
 *  - plan == 'pro' (todavia no fueron bajados)
 *
 * Tambien cubre el caso de subscription.status == 'authorized' con el
 * periodo vencido, que es un fallo silencioso de MP.
 */

import { FieldValue, getFirestore } from 'firebase-admin/firestore';

export async function bajarSuscripcionesVencidas() {
  const db = getFirestore();
  const ahora = new Date();


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

  return stats;
}
