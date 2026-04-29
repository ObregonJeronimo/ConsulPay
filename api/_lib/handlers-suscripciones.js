/**
 * Handlers de eventos de suscripcion (preapproval + authorized_payment).
 *
 * Esta logica vive como modulo separado porque la llama el webhook
 * unificado /api/mp/webhook (MP solo permite UNA URL de webhook por
 * aplicacion, asi que routeamos por tipo de evento adentro).
 *
 * Eventos manejados:
 *  - subscription_preapproval: cambia estado del preapproval
 *      (authorized, paused, cancelled, finished, etc.)
 *  - subscription_authorized_payment: cobro mensual individual
 *      (approved, rejected, pending)
 *
 * Idempotencia:
 *  - preapproval: comparamos status antes de actualizar
 *  - authorized_payment: chequeamos /pagos_mensualidad por
 *    mpAuthorizedPaymentId antes de crear
 */

import { FieldValue } from 'firebase-admin/firestore';

import {
  getAuthorizedPayment,
  getPreapproval,
} from './mp-suscripciones.js';

/**
 * Procesa un evento de tipo `subscription_preapproval`.
 *
 * @param {Firestore} db
 * @param {string} accessToken - access token de la cuenta MP de ConsulPay
 * @param {string} preapprovalId
 */
export async function procesarPreapproval(db, accessToken, preapprovalId) {
  let pre;
  try {
    pre = await getPreapproval({ accessToken, preapprovalId });
  } catch (err) {
    console.error(`No se pudo leer preapproval ${preapprovalId}:`, err);
    return;
  }

  const consultorioId = pre.external_reference;
  if (!consultorioId) {
    console.warn(`Preapproval ${preapprovalId} sin external_reference`);
    return;
  }

  const consSnap = await db.collection('consultorios').doc(consultorioId).get();
  if (!consSnap.exists) {
    console.warn(`Consultorio ${consultorioId} no existe.`);
    return;
  }
  const consData = consSnap.data();

  // Sanity check: que el preapproval del doc coincida con el que llego
  const subActual = consData.subscription;
  if (subActual?.preapprovalId && subActual.preapprovalId !== preapprovalId) {
    console.warn(
      `Mismatch preapprovalId en consultorio ${consultorioId}: doc=${subActual.preapprovalId} vs webhook=${preapprovalId}`,
    );
    return;
  }

  // Mapear status MP → nuestros estados
  // MP usa: pending, authorized, paused, cancelled, finished
  let nuevoStatus = subActual?.status;
  let cambiaPlanAPro = false;

  switch (pre.status) {
    case 'authorized':
      // Si todavia no estaba authorized, pasamos a Pro.
      if (subActual?.status !== 'authorized') {
        nuevoStatus = 'authorized';
        cambiaPlanAPro = true;
      }
      break;
    case 'paused':
      nuevoStatus = 'paused';
      break;
    case 'cancelled':
    case 'finished':
      nuevoStatus = 'cancelled';
      break;
    case 'pending':
      nuevoStatus = 'pending_authorization';
      break;
    default:
      console.warn(`Status preapproval desconocido: ${pre.status}`);
  }

  // Calcular currentPeriodEnd (next_payment_date que devuelve MP)
  let currentPeriodEnd = subActual?.currentPeriodEnd ?? null;
  if (pre.next_payment_date) {
    currentPeriodEnd = new Date(pre.next_payment_date);
  }

  const updates = {
    'subscription.status': nuevoStatus,
    'subscription.lastWebhookAt': FieldValue.serverTimestamp(),
    'subscription.updatedAt': FieldValue.serverTimestamp(),
  };
  if (currentPeriodEnd) {
    updates['subscription.currentPeriodEnd'] = currentPeriodEnd;
  }

  if (cambiaPlanAPro) {
    // Activar Plan Pro: comision baja a 2%.
    let comisionPro = 2;
    try {
      const cfgSnap = await db.collection('config').doc('comisiones').get();
      if (cfgSnap.exists) {
        const cfg = cfgSnap.data();
        if (typeof cfg.pro === 'number' && cfg.pro >= 0 && cfg.pro <= 100) {
          comisionPro = cfg.pro;
        }
      }
    } catch (err) {
      console.warn('No se pudo leer config/comisiones, uso 2% default:', err.message);
    }

    updates.plan = 'pro';
    updates.comisionConsulpay = comisionPro;
    updates.planVenceEn = currentPeriodEnd || null;
    updates['subscription.consecutiveFailures'] = 0;
  }

  await db.collection('consultorios').doc(consultorioId).update(updates);
  console.log(
    `Preapproval ${preapprovalId} procesado: status=${nuevoStatus}, plan=${cambiaPlanAPro ? 'pro' : '(unchanged)'}`,
  );
}

/**
 * Procesa un evento de tipo `subscription_authorized_payment` (cobro
 * mensual individual).
 *
 * @param {Firestore} db
 * @param {string} accessToken - access token de la cuenta MP de ConsulPay
 * @param {string} authorizedPaymentId
 */
export async function procesarAuthorizedPayment(db, accessToken, authorizedPaymentId) {
  let payment;
  try {
    payment = await getAuthorizedPayment({ accessToken, authorizedPaymentId });
  } catch (err) {
    console.error(`No se pudo leer authorized_payment ${authorizedPaymentId}:`, err);
    return;
  }

  const preapprovalId = payment.preapproval_id;
  if (!preapprovalId) {
    console.warn(`AuthorizedPayment ${authorizedPaymentId} sin preapproval_id`);
    return;
  }

  // Buscar el consultorio por preapprovalId
  const consQuery = await db.collection('consultorios')
    .where('subscription.preapprovalId', '==', preapprovalId)
    .limit(1)
    .get();

  if (consQuery.empty) {
    console.warn(`Ningun consultorio matchea preapprovalId ${preapprovalId}`);
    return;
  }

  const consDoc = consQuery.docs[0];
  const consultorioId = consDoc.id;
  const consData = consDoc.data();

  // ---------- IDEMPOTENCIA: evitar double-write ----------
  const existente = await db.collection('pagos_mensualidad')
    .where('mpAuthorizedPaymentId', '==', String(authorizedPaymentId))
    .limit(1)
    .get();

  if (!existente.empty) {
    console.log(`AuthorizedPayment ${authorizedPaymentId} ya procesado, skipping.`);
    return;
  }

  // ---------- Crear /pagos_mensualidad ----------
  const pagoMensRef = db.collection('pagos_mensualidad').doc();
  const status = payment.status; // 'approved' | 'rejected' | 'pending' | ...
  const monto = Number(payment.transaction_amount) || 0;
  const fechaCobro = payment.payment_date
    ? new Date(payment.payment_date)
    : new Date();

  await pagoMensRef.set({
    consultorioId,
    preapprovalId,
    mpAuthorizedPaymentId: String(authorizedPaymentId),
    mpPaymentId: payment.payment_id ? String(payment.payment_id) : null,
    monto,
    currency: payment.currency_id || 'ARS',
    status,
    statusDetail: payment.status_detail || null,
    fechaCobro,
    rawData: {
      payment_method_id: payment.payment_method_id || null,
      reason: payment.reason || null,
      retry_attempt: payment.retry_attempt || null,
    },
    createdAt: FieldValue.serverTimestamp(),
  });

  // ---------- Actualizar /consultorios/{id}.subscription ----------
  if (status === 'approved') {
    // Cobro exitoso: extender currentPeriodEnd 30 dias y resetear failures
    const nuevoFinPeriodo = new Date(fechaCobro);
    nuevoFinPeriodo.setDate(nuevoFinPeriodo.getDate() + 30);

    await db.collection('consultorios').doc(consultorioId).update({
      'subscription.lastChargedAt': fechaCobro,
      'subscription.currentPeriodEnd': nuevoFinPeriodo,
      'subscription.consecutiveFailures': 0,
      'subscription.status': consData.subscription?.cancelRequested
        ? 'cancelled'
        : 'authorized',
      'subscription.updatedAt': FieldValue.serverTimestamp(),
      planVenceEn: nuevoFinPeriodo,
    });
    console.log(
      `Cobro mensual aprobado para ${consultorioId}, nuevo periodo hasta ${nuevoFinPeriodo}`,
    );
  } else if (status === 'rejected') {
    // Cobro fallo: incrementar contador
    const failuresActuales = consData.subscription?.consecutiveFailures || 0;
    const nuevoCount = failuresActuales + 1;

    const updates = {
      'subscription.consecutiveFailures': nuevoCount,
      'subscription.lastFailedAt': fechaCobro,
      'subscription.lastFailureReason': payment.status_detail || 'unknown',
      'subscription.updatedAt': FieldValue.serverTimestamp(),
    };

    // Si llegamos a 3 fallos, marcamos cancelled local. MP va a cancelar
    // el preapproval por su cuenta y nos llegara otro webhook.
    if (nuevoCount >= 3) {
      updates['subscription.status'] = 'cancelled';
      updates['subscription.cancelReason'] = 'cobros_fallidos';
    }

    await db.collection('consultorios').doc(consultorioId).update(updates);
    console.log(
      `Cobro mensual rechazado para ${consultorioId} (intento ${nuevoCount}/3)`,
    );
  } else {
    console.log(
      `AuthorizedPayment ${authorizedPaymentId} status=${status}, no se actualiza subscription.`,
    );
  }
}
