/**
 * /api/mp/suscripcion-crear
 *
 * El dueño del consultorio (ownerUid) inicia el flow para suscribirse
 * al Plan Pro. Solo el dueño puede hacer esto, no cualquier admin.
 *
 * Flujo:
 *  1. Validamos auth + que el caller sea el OWNER del consultorio.
 *  2. Validamos que el consultorio tenga puedeVerPlanPro habilitado.
 *  3. Validamos que el consultorio NO tenga ya una suscripcion activa.
 *  4. Creamos preapproval en MP con:
 *     - access_token de la cuenta MP de ConsulPay (env CONSULPAY_MP_ACCESS_TOKEN)
 *     - monto del Plan Pro (env CONSULPAY_PRECIO_PRO_ARS)
 *     - frecuencia mensual
 *     - external_reference = consultorioId
 *     - back_url = volver a /admin/configuracion?suscripcion=ok
 *     - notification_url = /api/mp/webhook (UNIFICADO con pagos)
 *  5. Persistimos en /consultorios/{id}.subscription un estado
 *     'pendiente_autorizacion' con el preapprovalId.
 *  6. Devolvemos { initPointUrl } al frontend.
 *
 * El user va al init_point, autoriza con tarjeta, MP nos manda webhook
 * cuando el preapproval pasa a 'authorized', y ahi marcamos plan='pro'.
 *
 * Body: { consultorioId }
 * Header: Authorization: Bearer <firebase_id_token>
 * Devuelve: { initPointUrl, preapprovalId }
 */

import { FieldValue, getFirestore } from 'firebase-admin/firestore';

import { verificarAuthHeader } from '../_lib/auth.js';
import { initAdmin } from '../_lib/firebase-admin.js';
import { jsonResponse, readJsonBody } from '../_lib/http.js';
import { crearPreapproval } from '../_lib/mp-suscripciones.js';

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

  // ---------- Validar env vars ----------
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
    return jsonResponse(res, 500, {
      error: 'APP_BASE_URL no esta configurado.',
    });
  }

  const db = getFirestore();

  // ---------- Validar que el caller sea OWNER del consultorio ----------
  const consSnap = await db.collection('consultorios').doc(consultorioId).get();
  if (!consSnap.exists) {
    return jsonResponse(res, 404, { error: 'El consultorio no existe.' });
  }
  const consData = consSnap.data();

  if (consData.ownerUid !== uid) {
    return jsonResponse(res, 403, {
      error: 'Solo el dueño del consultorio puede contratar el Plan Pro.',
      codigo: 'NO_ES_OWNER',
    });
  }

  if (consData.estado !== 'activo') {
    return jsonResponse(res, 400, {
      error: 'El consultorio no esta activo.',
    });
  }

  // ---------- Validar que el consultorio tenga acceso al Plan Pro ----------
  // El campo puedeVerPlanPro lo controla el superadmin desde
  // /super/consultorios. Si esta en false, el consultorio NO ve la
  // pestaña "Plan" en el frontend, asi que llegar aca seria un caso
  // borde — alguien que llama directo al endpoint salteando la UI.
  // Validamos defensivamente.
  //
  // Backwards compat: si el campo NO esta definido (consultorios viejos),
  // permitimos. Solo bloqueamos si existe explicitamente y vale false.
  // Esto es importante porque NO queremos romper consultorios existentes
  // — el campo solo se setea cuando el superadmin lo toca explicitamente.
  if (consData.puedeVerPlanPro === false) {
    return jsonResponse(res, 403, {
      error: 'El Plan Pro está deshabilitado para tu consultorio. Contactá a soporte.',
      codigo: 'PLAN_PRO_DESHABILITADO',
    });
  }

  // ---------- Validar que NO tenga ya una suscripcion activa ----------
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

  // ---------- Necesitamos el email del owner para el preapproval ----------
  const ownerSnap = await db.collection('usuarios').doc(uid).get();
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

  // ---------- Crear preapproval en MP ----------
  // notification_url unificado: tanto pagos como suscripciones
  // notifican a /api/mp/webhook que rutea por type internamente.
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
      // No pasamos startDate: MP cobra apenas el user autoriza.
    });
  } catch (err) {
    console.error('Error creando preapproval MP:', err, err.mpResponse);
    return jsonResponse(res, 500, {
      error: `Mercado Pago rechazo la suscripcion: ${err.message}`,
      codigo: 'MP_PREAPPROVAL_RECHAZADO',
      detalleMP: err.mpResponse,
    });
  }

  // ---------- Persistir estado pre-autorizacion ----------
  // Apenas guardamos que existe un preapproval pendiente. El cobro y
  // la activacion del plan se concreta cuando llega el webhook de
  // 'authorized'.
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
