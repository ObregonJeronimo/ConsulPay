/**
 * /api/mp/suscripcion-webhook
 *
 * Receptor de webhooks de Mercado Pago para suscripciones.
 *
 * MP nos manda webhooks de dos tipos relacionados con preapprovals:
 *   1. type='subscription_preapproval': cambia el estado del preapproval
 *      en si (authorized, paused, cancelled, etc.)
 *   2. type='subscription_authorized_payment': se intento cobrar la
 *      mensualidad. Tiene status=approved/rejected. Puede haber
 *      varios por mes si el primer cobro falla.
 *
 * Acciones:
 *  - subscription_preapproval con status='authorized' (primera vez):
 *      → marcamos consultorio como Pro, comision=2%, currentPeriodEnd
 *  - subscription_preapproval con status='cancelled' o 'finished':
 *      → marcamos sub.status='cancelled'. (No bajamos a Free aca, el
 *         cron diario lo hara cuando currentPeriodEnd venza.)
 *  - subscription_authorized_payment con status='approved':
 *      → renovacion mensual exitosa. Extendemos currentPeriodEnd 30 dias,
 *         reseteamos consecutiveFailures=0, registramos /pagos_mensualidad.
 *  - subscription_authorized_payment con status='rejected':
 *      → cobro fallo. Incrementamos consecutiveFailures.
 *         Si llega a 3 → marcamos cancelled local (MP igual va a
 *         cancelar el preapproval por su cuenta).
 *         Cuando MP cancela definitivamente, llega un evento
 *         preapproval con status=cancelled.
 *
 * IMPORTANTE: este webhook usa MP_WEBHOOK_SECRET (mismo que el
 * webhook de pagos) para validar firma HMAC. Si necesitas un secret
 * diferente, agregar SUBSCRIPCION_WEBHOOK_SECRET y switchear.
 *
 * IDEMPOTENCIA: si MP nos manda el mismo evento 2 veces (cosa que
 * pasa), no debe tener efectos duplicados. Para preapproval:
 * comparamos sub.status antes de actualizar. Para authorized_payment:
 * antes de crear /pagos_mensualidad, chequeamos si ya existe uno con
 * mismo authorizedPaymentId.
 *
 * Siempre devolvemos 200 OK rapido (excepto firma invalida → 401),
 * para que MP no reintente.
 */

import { createHmac } from 'crypto';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

import { initAdmin } from '../_lib/firebase-admin.js';
import { jsonResponse, readJsonBody } from '../_lib/http.js';
import {
  getAuthorizedPayment,
  getPreapproval,
} from '../_lib/mp-suscripciones.js';

/**
 * Valida firma HMAC del webhook (mismo formato que el webhook de pagos).
 */
function validarFirma(req, dataId) {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      console.error('MP_WEBHOOK_SECRET no configurado en produccion. Rechazo webhook.');
      return false;
    }
    console.warn('MP_WEBHOOK_SECRET no configurado, permitiendo webhook en dev.');
    return true;
  }

  const xSignature = req.headers['x-signature'];
  const xRequestId = req.headers['x-request-id'];
  if (!xSignature || !xRequestId) {
    console.warn('Webhook subscripcion sin x-signature o x-request-id.');
    return false;
  }

  const parts = String(xSignature).split(',').map((p) => p.trim());
  let ts = null;
  let hash = null;
  for (const p of parts) {
    const [k, v] = p.split('=');
    if (k === 'ts') ts = v;
    if (k === 'v1') hash = v;
  }
  if (!ts || !hash) return false;

  const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
  const calculado = createHmac('sha256', secret).update(manifest).digest('hex');
  return calculado === hash;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return jsonResponse(res, 405, { error: 'Method not allowed' });
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    body = {};
  }

  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const queryId = url.searchParams.get('id') || url.searchParams.get('data.id');
  const queryType = url.searchParams.get('type');

  const dataId = body?.data?.id || body?.id || queryId;
  const eventType = body?.type || body?.action || queryType;

  // Solo procesamos eventos de suscripciones
  const esPreapproval = eventType === 'subscription_preapproval'
    || eventType === 'preapproval';
  const esAuthorizedPayment = eventType === 'subscription_authorized_payment'
    || eventType === 'authorized_payment';

  if (!esPreapproval && !esAuthorizedPayment) {
    return jsonResponse(res, 200, {
      ok: true,
      ignorado: 'tipo_no_relevante',
      eventType,
    });
  }

  if (!dataId) {
    console.warn('Webhook subscripcion sin data.id', { body });
    return jsonResponse(res, 200, { ok: true, ignorado: 'sin_id' });
  }

  if (!validarFirma(req, dataId)) {
    return jsonResponse(res, 401, { error: 'Firma invalida' });
  }

  const accessToken = process.env.CONSULPAY_MP_ACCESS_TOKEN;
  if (!accessToken) {
    console.error('CONSULPAY_MP_ACCESS_TOKEN no configurado');
    return jsonResponse(res, 200, { ok: true, error: 'no_access_token' });
  }

  try {
    initAdmin();
  } catch (err) {
    console.error('Error inicializando firebase-admin en webhook subscripcion:', err);
    return jsonResponse(res, 200, { ok: true, error: 'init_admin_fallo' });
  }

  const db = getFirestore();

  try {
    if (esPreapproval) {
      await procesarPreapproval(db, accessToken, dataId);
    } else if (esAuthorizedPayment) {
      await procesarAuthorizedPayment(db, accessToken, dataId);
    }
  } catch (err) {
    console.error('Error procesando webhook subscripcion:', err);
    // 200 igual: MP no debe reintentar si falla nuestro lado
  }

  return jsonResponse(res, 200, { ok: true });
}

/* ============================================================
   Procesar evento de preapproval (cambia estado de la suscripcion)
   ============================================================ */
async function procesarPreapproval(db, accessToken, preapprovalId) {
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
      // (Idempotente: si ya estaba authorized, no hacemos nada.)
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
      // Sigue esperando autorizacion del user
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
    // Como respaldo, leemos el porcentaje configurado globalmente
    // (config/comisiones.pro). Si no existe, usamos 2 por default.
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
  console.log(`Preapproval ${preapprovalId} procesado: status=${nuevoStatus}, plan=${cambiaPlanAPro ? 'pro' : '(unchanged)'}`);
}

/* ============================================================
   Procesar evento de authorized_payment (cobro mensual individual)
   ============================================================ */
async function procesarAuthorizedPayment(db, accessToken, authorizedPaymentId) {
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
  // (idealmente con un index, pero hoy podemos hacer query)
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

  // ---------- IDEMPOTENCIA: evitar double-write para mismo authorizedPaymentId ----------
  const existente = await db.collection('pagos_mensualidad')
    .where('mpAuthorizedPaymentId', '==', String(authorizedPaymentId))
    .limit(1)
    .get();

  if (!existente.empty) {
    // Ya procesamos este pago. Salimos sin hacer nada.
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
    status, // approved | rejected | pending
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
    // Cobro exitoso. Extender currentPeriodEnd 30 dias y resetear failures.
    const nuevoFinPeriodo = new Date(fechaCobro);
    nuevoFinPeriodo.setDate(nuevoFinPeriodo.getDate() + 30);

    await db.collection('consultorios').doc(consultorioId).update({
      'subscription.lastChargedAt': fechaCobro,
      'subscription.currentPeriodEnd': nuevoFinPeriodo,
      'subscription.consecutiveFailures': 0,
      'subscription.status': consData.subscription?.cancelRequested
        ? 'cancelled' // si ya cancelo, mantenemos cancelled aunque MP cobre
        : 'authorized',
      'subscription.updatedAt': FieldValue.serverTimestamp(),
      planVenceEn: nuevoFinPeriodo,
    });
    console.log(`Cobro mensual aprobado para ${consultorioId}, nuevo periodo hasta ${nuevoFinPeriodo}`);
  } else if (status === 'rejected') {
    // Cobro fallo. Incrementar contador.
    const failuresActuales = consData.subscription?.consecutiveFailures || 0;
    const nuevoCount = failuresActuales + 1;

    const updates = {
      'subscription.consecutiveFailures': nuevoCount,
      'subscription.lastFailedAt': fechaCobro,
      'subscription.lastFailureReason': payment.status_detail || 'unknown',
      'subscription.updatedAt': FieldValue.serverTimestamp(),
    };

    // Si llegamos a 3 fallos, marcamos cancelled local. MP va a cancelar
    // el preapproval por su cuenta y nos llegara otro webhook que confirme.
    if (nuevoCount >= 3) {
      updates['subscription.status'] = 'cancelled';
      updates['subscription.cancelReason'] = 'cobros_fallidos';
    }

    await db.collection('consultorios').doc(consultorioId).update(updates);
    console.log(`Cobro mensual rechazado para ${consultorioId} (intento ${nuevoCount}/3)`);
  } else {
    console.log(`AuthorizedPayment ${authorizedPaymentId} status=${status}, no se actualiza subscription.`);
  }
}
