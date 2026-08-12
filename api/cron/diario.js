/**
 * /api/cron/diario
 *
 * Un solo cron para las dos tareas que corren una vez por dia.
 *
 * Antes eran dos endpoints (suscripciones-expiradas y recordatorios) y
 * el deploy empezo a fallar: Vercel Hobby permite 12 funciones
 * serverless y el proyecto llego a 13. La logica de cada tarea se movio
 * a api/_lib/, que Vercel NO cuenta como funcion, y este endpoint las
 * ejecuta a las dos. De paso queda libre el segundo slot de cron, que
 * en Hobby tambien esta limitado a 2.
 *
 * Las tareas corren AISLADAS: si una falla, la otra se ejecuta igual y
 * el error queda en la respuesta. Antes, al ser endpoints separados,
 * esa independencia era gratis; ahora hay que sostenerla a mano.
 *
 * Configurado en vercel.json:
 *   { "path": "/api/cron/diario", "schedule": "0 12 * * *" }
 *   12 UTC = 9 de la manana en Argentina, que es una hora razonable
 *   para que le llegue un aviso a un profesional. Para el chequeo de
 *   suscripciones la hora es indistinta.
 *
 * SEGURIDAD: solo lo puede llamar Vercel Cron, que manda el header
 * Authorization: Bearer <CRON_SECRET>.
 */

import { initAdmin } from '../_lib/firebase-admin.js';
import { jsonResponse } from '../_lib/http.js';
import { notificarRecordatorios } from '../_lib/tarea-recordatorios.js';
import { bajarSuscripcionesVencidas } from '../_lib/tarea-suscripciones.js';

export default async function handler(req, res) {
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

  try {
    initAdmin();
  } catch (err) {
    console.error('initAdmin fallo:', err);
    return jsonResponse(res, 500, { error: 'init_admin_fallo' });
  }

  const ranAt = new Date().toISOString();
  const resultado = { ok: true, ranAt, suscripciones: null, recordatorios: null };

  /* Cada tarea en su propio try: que falle el chequeo de suscripciones no
     tiene por que dejar a los profesionales sin sus avisos, ni al reves. */
  try {
    resultado.suscripciones = await bajarSuscripcionesVencidas();
  } catch (err) {
    console.error('Tarea suscripciones fallo:', err);
    resultado.ok = false;
    resultado.suscripciones = { error: err.message, ...(err.stats ?? {}) };
  }

  try {
    resultado.recordatorios = await notificarRecordatorios();
  } catch (err) {
    console.error('Tarea recordatorios fallo:', err);
    resultado.ok = false;
    resultado.recordatorios = { error: err.message, ...(err.stats ?? {}) };
  }

  console.log('Cron diario:', JSON.stringify(resultado));
  // 200 igual cuando una tarea falla: la otra corrio y el detalle esta en
  // el body. Un 500 haria que Vercel marque todo el cron como caido.
  return jsonResponse(res, 200, resultado);
}
