/**
 * /api/mp/crear-pago
 *
 * El profesional inicia un pago al consultorio para saldar X sesiones
 * debidas. Este endpoint:
 *  1. Valida auth + que el caller sea profesional del consultorio.
 *  2. Lee las sesiones a saldar y verifica que sean del profesional,
 *     del consultorio, y esten en estadoPago='debido'.
 *  3. Calcula montoTotal = suma de montoConsultorio.
 *  4. Calcula marketplaceFee = montoTotal * (consultorio.comisionConsulpay / 100).
 *  5. Refresca el access_token del consultorio si esta proximo a vencer.
 *  6. Crea preferencia en MP con marketplace_fee.
 *  7. Crea doc /pagos_consultorio/{pagoId} con estado='pendiente'.
 *  8. Devuelve { initPointUrl, pagoId } al frontend.
 *
 * Body: { consultorioId, sesionesIds: string[] }
 * Header: Authorization: Bearer <firebase_id_token>
 * Devuelve: { initPointUrl, pagoId, montoTotal, marketplaceFee }
 */

import { FieldValue, getFirestore } from 'firebase-admin/firestore';

import { verificarAuthHeader } from '../_lib/auth.js';
import { initAdmin } from '../_lib/firebase-admin.js';
import { jsonResponse, readJsonBody } from '../_lib/http.js';
import { crearPreferencia } from '../_lib/mp-marketplace.js';
import { asegurarAccessTokenVigente } from '../_lib/mp-token.js';

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

  const { consultorioId, sesionesIds } = body;
  if (!consultorioId) {
    return jsonResponse(res, 400, { error: 'consultorioId requerido.' });
  }
  if (!Array.isArray(sesionesIds) || sesionesIds.length === 0) {
    return jsonResponse(res, 400, { error: 'sesionesIds debe ser un array no vacio.' });
  }
  if (sesionesIds.length > 100) {
    // Limite arbitrario para evitar pagos gigantes que se rompen en MP
    return jsonResponse(res, 400, { error: 'No se pueden pagar mas de 100 sesiones a la vez.' });
  }

  const db = getFirestore();

  // ---------- 1. Validar que el caller sea profesional del consultorio ----------
  const userSnap = await db.collection('usuarios').doc(uid).get();
  if (!userSnap.exists) {
    return jsonResponse(res, 403, { error: 'Tu usuario no existe.' });
  }
  const userData = userSnap.data();
  if (userData.rol !== 'profesional') {
    return jsonResponse(res, 403, { error: 'Solo los profesionales pueden iniciar pagos al consultorio.' });
  }
  if (userData.consultorioId !== consultorioId) {
    return jsonResponse(res, 403, { error: 'No pertenecés a este consultorio.' });
  }
  if (userData.estado !== 'activo') {
    return jsonResponse(res, 403, { error: 'Tu cuenta no está activa.' });
  }

  // ---------- 2. Cargar consultorio y validar que tenga MP integrado ----------
  const consSnap = await db.collection('consultorios').doc(consultorioId).get();
  if (!consSnap.exists) {
    return jsonResponse(res, 404, { error: 'El consultorio no existe.' });
  }
  const consData = consSnap.data();
  if (!consData.mpIntegrado || !consData.mpConfig) {
    return jsonResponse(res, 400, {
      error: 'El consultorio no tiene Mercado Pago vinculado. Contactá al administrador.',
      codigo: 'MP_NO_VINCULADO',
    });
  }

  // ---------- 3. Cargar sesiones y validar ----------
  // Firestore tiene limite de 30 IDs en una query 'in', asi que leemos una a una.
  // Es mas lento pero mas simple y correcto.
  const sesionesRefs = sesionesIds.map((id) => db.collection('sesiones').doc(id));
  const sesionesSnaps = await db.getAll(...sesionesRefs);

  let montoTotal = 0;
  const sesionesValidadas = [];
  for (const snap of sesionesSnaps) {
    if (!snap.exists) {
      return jsonResponse(res, 400, {
        error: `La sesión ${snap.id} no existe.`,
      });
    }
    const sData = snap.data();
    if (sData.consultorioId !== consultorioId) {
      return jsonResponse(res, 403, {
        error: `La sesión ${snap.id} no pertenece a este consultorio.`,
      });
    }
    if (sData.profesionalUid !== uid) {
      return jsonResponse(res, 403, {
        error: `La sesión ${snap.id} no es tuya.`,
      });
    }
    if (sData.estadoPago !== 'debido') {
      return jsonResponse(res, 400, {
        error: `La sesión ${snap.id} ya fue pagada o no está en estado 'debido'.`,
        codigo: 'SESION_NO_DEBIDA',
        sesionId: snap.id,
      });
    }
    const monto = Number(sData.montoConsultorio) || 0;
    if (monto <= 0) {
      return jsonResponse(res, 400, {
        error: `La sesión ${snap.id} tiene monto invalido.`,
      });
    }
    montoTotal += monto;
    sesionesValidadas.push({ id: snap.id, data: sData });
  }

  if (montoTotal <= 0) {
    return jsonResponse(res, 400, { error: 'El monto total a pagar es 0.' });
  }

  // ---------- 4. Calcular marketplace fee ----------
  const comisionPct = Number(consData.comisionConsulpay);
  if (!Number.isFinite(comisionPct) || comisionPct < 0 || comisionPct > 100) {
    return jsonResponse(res, 500, { error: 'Configuración de comisión inválida en el consultorio.' });
  }
  // Redondeamos a 2 decimales (centavos)
  const marketplaceFee = Math.round(montoTotal * comisionPct) / 100 * 1; // monto*pct/100
  const fee = Math.round((montoTotal * comisionPct / 100) * 100) / 100;
  const montoConsultorio = Math.round((montoTotal - fee) * 100) / 100;

  // ---------- 5. Asegurar access token vigente (refresh lazy) ----------
  let accessToken;
  let mpConfigActualizado = null;
  try {
    const r = await asegurarAccessTokenVigente(consData.mpConfig);
    accessToken = r.accessToken;
    if (r.mpConfigActualizado) {
      mpConfigActualizado = r.mpConfigActualizado;
    }
  } catch (err) {
    console.error('Error asegurando access token:', err);
    return jsonResponse(res, 500, {
      error: 'No se pudo validar la conexión de Mercado Pago. Pedile al administrador que reconecte.',
      codigo: 'MP_TOKEN_INVALIDO',
    });
  }

  // Si refresco el token, persistimos el mpConfig nuevo ANTES de crear el pago.
  // Si crear el pago falla despues, perdemos un par de minutos pero el token
  // refrescado queda salvado.
  if (mpConfigActualizado) {
    try {
      await db.collection('consultorios').doc(consultorioId).update({
        mpConfig: mpConfigActualizado,
      });
    } catch (err) {
      console.warn('No se pudo persistir el mpConfig refrescado, sigo igual:', err);
    }
  }

  // ---------- 6. Crear el doc /pagos_consultorio ----------
  // Lo creamos ANTES de llamar a MP para tener un externalReference.
  // Si MP falla despues, marcamos el doc como rechazado y queda como log.
  const pagoRef = db.collection('pagos_consultorio').doc();
  const pagoId = pagoRef.id;

  const baseUrl = process.env.APP_BASE_URL || '';
  const notificationUrl = `${baseUrl}/api/mp/webhook`;
  const backUrls = {
    success: `${baseUrl}/mi-panel/pagos/retorno?pagoId=${pagoId}&status=success`,
    failure: `${baseUrl}/mi-panel/pagos/retorno?pagoId=${pagoId}&status=failure`,
    pending: `${baseUrl}/mi-panel/pagos/retorno?pagoId=${pagoId}&status=pending`,
  };

  // ---------- 7. Crear preferencia en MP ----------
  let preferencia;
  try {
    preferencia = await crearPreferencia({
      accessToken,
      items: [
        {
          id: pagoId,
          title: `Pago al consultorio (${sesionesValidadas.length} sesión${sesionesValidadas.length === 1 ? '' : 'es'})`,
          quantity: 1,
          unit_price: montoTotal,
          currency_id: 'ARS',
        },
      ],
      marketplaceFee: fee,
      externalReference: pagoId,
      notificationUrl,
      backUrls,
      payerEmail: userData.email,
    });
  } catch (err) {
    console.error('Error creando preferencia MP:', err, err.mpResponse);
    // Guardamos el pago como rechazado para tener registro
    await pagoRef.set({
      consultorioId,
      profesionalUid: uid,
      sesionesIds: sesionesValidadas.map((s) => s.id),
      montoTotal,
      montoConsultorio,
      montoConsulpay: fee,
      comisionPctAplicada: comisionPct,
      estado: 'rechazado',
      mpPreferenceId: null,
      mpPaymentId: null,
      initPointUrl: null,
      errorCreacion: err.message,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      createdByUid: uid,
    });
    return jsonResponse(res, 500, {
      error: `Mercado Pago rechazó la operación: ${err.message}`,
      codigo: 'MP_PREFERENCIA_RECHAZADA',
      detalleMP: err.mpResponse,
    });
  }

  // ---------- 8. Persistir doc /pagos_consultorio ----------
  await pagoRef.set({
    consultorioId,
    profesionalUid: uid,
    sesionesIds: sesionesValidadas.map((s) => s.id),
    montoTotal,
    montoConsultorio,
    montoConsulpay: fee,
    comisionPctAplicada: comisionPct,
    estado: 'pendiente',
    mpPreferenceId: preferencia.id,
    mpPaymentId: null,
    initPointUrl: preferencia.init_point,
    sandboxInitPointUrl: preferencia.sandbox_init_point || null,
    livemode: !!consData.mpConfig.livemode,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    createdByUid: uid,
    webhookRecibidoAt: null,
    rawPaymentData: null,
  });

  return jsonResponse(res, 200, {
    pagoId,
    initPointUrl: preferencia.init_point,
    montoTotal,
    marketplaceFee: fee,
    montoConsultorio,
  });
}
