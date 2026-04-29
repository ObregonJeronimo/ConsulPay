/**
 * /api/mp/suscripcion-cancelar
 *
 * El dueño del consultorio cancela su suscripcion al Plan Pro.
 *
 * IMPORTANTE: cancelar NO baja el plan a Free de inmediato. El user
 * mantiene los beneficios (comision 2%) hasta el final del periodo
 * que ya pago (campo currentPeriodEnd). El cron diario es el que
 * detecta cuando un periodo ya cancelado vence y baja a Free.
 *
 * Por eso aca solo:
 *  1. Validamos que el caller sea el OWNER del consultorio.
 *  2. Validamos que tenga subscription activa.
 *  3. Llamamos a MP para cancelar el preapproval (status=cancelled).
 *  4. Actualizamos /consultorios/{id}.subscription:
 *      - status = 'cancelled'
 *      - cancelRequested = true
 *      - cancelledAt = now
 *  5. PLAN sigue siendo 'pro' hasta currentPeriodEnd.
 *
 * Cuando el cron diario corre y ve currentPeriodEnd < hoy + status='cancelled',
 * baja plan='free' y comisionConsulpay=6.
 *
 * Body: { consultorioId }
 * Header: Authorization: Bearer <firebase_id_token>
 * Devuelve: { ok: true, currentPeriodEnd: <iso> }
 */

import { FieldValue, getFirestore } from 'firebase-admin/firestore';

import { verificarAuthHeader } from '../_lib/auth.js';
import { initAdmin } from '../_lib/firebase-admin.js';
import { jsonResponse, readJsonBody } from '../_lib/http.js';
import { cancelarPreapproval } from '../_lib/mp-suscripciones.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return jsonResponse(res, 405, { error: 'Method not allowed' });
  }

  let uid;
  try {
    initAdmin();
    uid = await verificarAuthHeader(req);
  } catch (err) {
    return jsonResponse(res, err.status || 500, { error: err.message });
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return jsonResponse(res, 400, { error: 'Body invalido.' });
  }

  const { consultorioId } = body;
  if (!consultorioId) {
    return jsonResponse(res, 400, { error: 'consultorioId requerido.' });
  }

  const accessTokenConsulpay = process.env.CONSULPAY_MP_ACCESS_TOKEN;
  if (!accessTokenConsulpay) {
    return jsonResponse(res, 500, {
      error: 'El servidor no esta configurado para suscripciones.',
    });
  }

  const db = getFirestore();

  const consSnap = await db.collection('consultorios').doc(consultorioId).get();
  if (!consSnap.exists) {
    return jsonResponse(res, 404, { error: 'El consultorio no existe.' });
  }
  const consData = consSnap.data();

  if (consData.ownerUid !== uid) {
    return jsonResponse(res, 403, {
      error: 'Solo el dueño del consultorio puede cancelar la suscripcion.',
      codigo: 'NO_ES_OWNER',
    });
  }

  const sub = consData.subscription;
  if (!sub || !sub.preapprovalId) {
    return jsonResponse(res, 400, {
      error: 'El consultorio no tiene una suscripcion activa.',
      codigo: 'SIN_SUSCRIPCION',
    });
  }

  if (sub.status === 'cancelled') {
    return jsonResponse(res, 400, {
      error: 'La suscripcion ya esta cancelada.',
      codigo: 'YA_CANCELADA',
    });
  }

  // ---------- Cancelar en MP ----------
  // Si el preapproval estaba en 'pending_authorization' (el user nunca
  // llego a autorizar), lo cancelamos igual para limpiar.
  try {
    await cancelarPreapproval({
      accessToken: accessTokenConsulpay,
      preapprovalId: sub.preapprovalId,
    });
  } catch (err) {
    console.error('Error cancelando preapproval en MP:', err, err.mpResponse);
    // Si MP devuelve 404 es porque el preapproval ya no existe.
    // En ese caso, igualmente actualizamos local.
    if (err.mpStatus !== 404) {
      return jsonResponse(res, 500, {
        error: `Mercado Pago rechazo la cancelacion: ${err.message}`,
        codigo: 'MP_CANCEL_RECHAZADO',
      });
    }
  }

  // ---------- Actualizar local ----------
  // Campo plan NO se toca aca: el user sigue Pro hasta currentPeriodEnd.
  await db.collection('consultorios').doc(consultorioId).update({
    'subscription.status': 'cancelled',
    'subscription.cancelRequested': true,
    'subscription.cancelledAt': FieldValue.serverTimestamp(),
    'subscription.updatedAt': FieldValue.serverTimestamp(),
  });

  return jsonResponse(res, 200, {
    ok: true,
    currentPeriodEnd: sub.currentPeriodEnd
      ? (sub.currentPeriodEnd.toDate
          ? sub.currentPeriodEnd.toDate().toISOString()
          : sub.currentPeriodEnd)
      : null,
    mensaje: sub.currentPeriodEnd
      ? 'Suscripcion cancelada. Mantenes los beneficios hasta la fecha de renovacion.'
      : 'Suscripcion cancelada.',
  });
}
