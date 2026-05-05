/**
 * /api/mp/suscripcion
 *
 * Endpoint multi-accion para operaciones del Plan Pro (suscripciones MP).
 * Consolida los antiguos /api/mp/suscripcion-crear y
 * /api/mp/suscripcion-cancelar en un solo endpoint para liberar slots
 * de funciones serverless en Vercel Hobby (limite de 12).
 *
 * Patron de uso:
 *   POST /api/mp/suscripcion
 *   Authorization: Bearer <firebase_id_token>
 *   Body: { accion: 'crear' | 'cancelar', consultorioId }
 *
 * Acciones:
 *   - crear: el dueño del consultorio inicia el flow de Plan Pro.
 *     Devuelve { initPointUrl, preapprovalId }.
 *
 *   - cancelar: el dueño cancela su suscripcion. Mantiene los
 *     beneficios hasta currentPeriodEnd. Devuelve { ok, currentPeriodEnd, mensaje }.
 *
 * Validacion comun a ambas acciones:
 *   - Auth via Firebase ID token
 *   - El caller debe ser el OWNER del consultorio (no cualquier admin,
 *     solo el dueño legal)
 *   - El consultorio debe existir y estar activo
 */

import { FieldValue, getFirestore } from 'firebase-admin/firestore';

import { verificarAuthHeader } from '../_lib/auth.js';
import { initAdmin } from '../_lib/firebase-admin.js';
import { jsonResponse, readJsonBody } from '../_lib/http.js';
import { cancelarPreapproval, crearPreapproval } from '../_lib/mp-suscripciones.js';

const ACCIONES_VALIDAS = ['crear', 'cancelar'];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return jsonResponse(res, 405, { error: 'Method not allowed' });
  }

  // ---------- Auth ----------
  let uid;
  try {
    initAdmin();
    uid = await verificarAuthHeader(req);
  } catch (err) {
    return jsonResponse(res, err.status || 500, { error: err.message });
  }

  // ---------- Body ----------
  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return jsonResponse(res, 400, { error: 'Body invalido.' });
  }

  const { accion, consultorioId } = body;
  if (!accion || !ACCIONES_VALIDAS.includes(accion)) {
    return jsonResponse(res, 400, {
      error: `accion invalida. Validas: ${ACCIONES_VALIDAS.join(', ')}`,
    });
  }
  if (!consultorioId) {
    return jsonResponse(res, 400, { error: 'consultorioId requerido.' });
  }

  // ---------- Validar consultorio + owner ----------
  // Comun a ambas acciones: solo el OWNER puede tocar suscripciones.
  const db = getFirestore();
  const consSnap = await db.collection('consultorios').doc(consultorioId).get();
  if (!consSnap.exists) {
    return jsonResponse(res, 404, { error: 'El consultorio no existe.' });
  }
  const consData = consSnap.data();

  if (consData.ownerUid !== uid) {
    return jsonResponse(res, 403, {
      error: 'Solo el dueño del consultorio puede gestionar la suscripcion.',
      codigo: 'NO_ES_OWNER',
    });
  }

  // ---------- Dispatch ----------
  try {
    switch (accion) {
      case 'crear':
        return await handleCrear({ res, db, consultorioId, consData, uid });
      case 'cancelar':
        return await handleCancelar({ res, db, consultorioId, consData });
      default:
        return jsonResponse(res, 400, { error: 'Accion no implementada.' });
    }
  } catch (err) {
    console.error(`Error en suscripcion/${accion}:`, err);
    return jsonResponse(res, err.status || 500, {
      error: err.message || 'Error interno.',
    });
  }
}

/* ============================================================
   ACCION: crear
   ----------------------------------------------------------------
   Iniciar flow del Plan Pro:
   1. Validar puedeVerPlanPro
   2. Validar que NO tenga suscripcion activa
   3. Crear preapproval en MP
   4. Persistir estado pending_authorization
   5. Devolver init_point para que el user autorice
   ============================================================ */

async function handleCrear({ res, db, consultorioId, consData, uid }) {
  // Validar env vars
  const accessTokenConsulpay = process.env.CONSULPAY_MP_ACCESS_TOKEN;
  if (!accessTokenConsulpay) {
    console.error('CONSULPAY_MP_ACCESS_TOKEN no configurado');
    return jsonResponse(res, 500, {
      error: 'El servidor no esta configurado para suscripciones.',
      codigo: 'SERVIDOR_NO_CONFIGURADO',
    });
  }
  const precioProRaw = process.env.CONSULPAY_PRECIO_PRO_ARS;
  const precioPro = Number(precioProRaw);
  if (!Number.isFinite(precioPro) || precioPro <= 0) {
    console.error('CONSULPAY_PRECIO_PRO_ARS invalido:', precioProRaw);
    return jsonResponse(res, 500, {
      error: 'El precio del Plan Pro no esta configurado.',
      codigo: 'PRECIO_NO_CONFIGURADO',
    });
  }

  const baseUrl = process.env.APP_BASE_URL;
  if (!baseUrl) {
    return jsonResponse(res, 500, { error: 'APP_BASE_URL no esta configurado.' });
  }

  if (consData.estado !== 'activo') {
    return jsonResponse(res, 400, { error: 'El consultorio no esta activo.' });
  }

  // El campo puedeVerPlanPro lo controla el superadmin desde
  // /super/consultorios. Si esta en false, el consultorio NO ve la
  // pestaña "Plan" en el frontend, asi que llegar aca seria un caso
  // borde — alguien que llama directo al endpoint salteando la UI.
  // Validamos defensivamente.
  //
  // Backwards compat: si el campo NO esta definido (consultorios viejos),
  // permitimos. Solo bloqueamos si existe explicitamente y vale false.
  if (consData.puedeVerPlanPro === false) {
    return jsonResponse(res, 403, {
      error: 'El Plan Pro está deshabilitado para tu consultorio. Contactá a soporte.',
      codigo: 'PLAN_PRO_DESHABILITADO',
    });
  }

  // Validar que NO tenga ya una suscripcion activa
  const sub = consData.subscription;
  const yaActivo = sub && (sub.status === 'authorized'
    || sub.status === 'pending_authorization'
    || sub.status === 'in_grace');
  if (yaActivo) {
    return jsonResponse(res, 400, {
      error: 'Ya existe una suscripcion activa o pendiente de autorizacion.',
      codigo: 'YA_TIENE_SUSCRIPCION',
      subStatus: sub.status,
    });
  }

  // Necesitamos el email del owner para el preapproval
  const ownerSnap = await db.collection('usuarios').doc(consData.ownerUid).get();
  if (!ownerSnap.exists) {
    return jsonResponse(res, 500, { error: 'Tu usuario no existe.' });
  }
  const ownerData = ownerSnap.data();
  const ownerEmail = ownerData.email;
  if (!ownerEmail) {
    return jsonResponse(res, 400, {
      error: 'Tu usuario no tiene email cargado. Actualizá tu perfil antes de suscribirte.',
    });
  }

  // Crear preapproval en MP. notification_url unificado: tanto pagos
  // como suscripciones notifican a /api/mp/webhook que rutea por type.
  const notificationUrl = `${baseUrl}/api/mp/webhook`;
  const backUrl = `${baseUrl}/admin/configuracion?suscripcion=autorizada`;

  let preapproval;
  try {
    preapproval = await crearPreapproval({
      accessToken: accessTokenConsulpay,
      payerEmail: ownerEmail,
      transactionAmount: precioPro,
      frequency: 1,
      frequencyType: 'months',
      reason: `ConsulPay Plan Pro — ${consData.nombre || 'Consultorio'}`,
      externalReference: consultorioId,
      backUrl,
      notificationUrl,
    });
  } catch (err) {
    console.error('Error creando preapproval MP:', err, err.mpResponse);
    return jsonResponse(res, 500, {
      error: `Mercado Pago rechazo la suscripcion: ${err.message}`,
      codigo: 'MP_PREAPPROVAL_RECHAZADO',
      detalleMP: err.mpResponse,
    });
  }

  // Persistir estado pre-autorizacion
  await db.collection('consultorios').doc(consultorioId).update({
    subscription: {
      preapprovalId: preapproval.id,
      status: 'pending_authorization',
      payerEmail: ownerEmail,
      payerUid: uid,
      transactionAmount: precioPro,
      currency: 'ARS',
      frequency: 1,
      frequencyType: 'months',
      currentPeriodEnd: null,
      lastChargedAt: null,
      cancelRequested: false,
      gracePeriodEndsAt: null,
      consecutiveFailures: 0,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
  });

  return jsonResponse(res, 200, {
    initPointUrl: preapproval.init_point,
    preapprovalId: preapproval.id,
  });
}

/* ============================================================
   ACCION: cancelar
   ----------------------------------------------------------------
   Cancelar la suscripcion. NO baja el plan a free de inmediato:
   el user mantiene los beneficios hasta currentPeriodEnd. El cron
   diario detecta cuando un periodo cancelado vencio y baja a free.
   ============================================================ */

async function handleCancelar({ res, db, consultorioId, consData }) {
  const accessTokenConsulpay = process.env.CONSULPAY_MP_ACCESS_TOKEN;
  if (!accessTokenConsulpay) {
    return jsonResponse(res, 500, {
      error: 'El servidor no esta configurado para suscripciones.',
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

  // Cancelar en MP. Si el preapproval estaba en 'pending_authorization'
  // (el user nunca llego a autorizar), lo cancelamos igual para limpiar.
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

  // Actualizar local. Campo plan NO se toca aca: el user sigue Pro
  // hasta currentPeriodEnd. El cron baja a free cuando vence.
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
