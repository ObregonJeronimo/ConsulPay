/**
 * /api/mp/crear-pago
 *
 * El profesional inicia un pago al consultorio para saldar X sesiones
 * debidas. Este endpoint:
 *  1. Valida auth + que el caller sea profesional del consultorio.
 *  2. Lee las sesiones a saldar y verifica que sean del profesional,
 *     del consultorio, y esten en estadoPago='debido'.
 *  3. Calcula montoTotal = suma de montoConsultorio.
 *  4. Calcula marketplaceFee usando la comision correcta segun el plan
 *     actual del consultorio (comisionPro si plan='pro', comisionFree
 *     si plan='free'). Backwards compat con comisionConsulpay viejo.
 *  5. Decide a que slot MP le toca cobrar (rotacion 15-15 si hay 2
 *     admins con MP conectada y reparto activo) y refresca el access
 *     token de ese slot si esta proximo a vencer.
 *  6. Crea preferencia en MP con marketplace_fee. El dinero cae directo
 *     en la cuenta MP del slot que cobra.
 *  7. Crea doc /pagos_consultorio/{pagoId} con estado='pendiente' +
 *     trazabilidad del slot/usuario MP que recibe.
 *  8. Devuelve { initPointUrl, pagoId } al frontend.
 *
 * SOPORTE MULTI-ADMIN
 * ----------------------------------------------------------------
 * Si el consultorio tiene 2 admins con MP conectada y el reparto
 * esta activo, los pagos rotan entre primary y secondary segun la
 * fecha. Esto es transparente para el profesional que paga: ve el
 * mismo flow de siempre, solo que el dinero cae en la cuenta MP del
 * admin que le toca cobrar este ciclo.
 *
 * Si solo hay 1 admin con MP (caso comun), todo va a primary y
 * funciona exactamente como antes (compat total).
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
import {
  buildUpdateParaGuardarSlot,
  obtenerAccessTokenParaCobro,
  tieneAlgunMpConectado,
} from '../_lib/mp-config-helpers.js';

/**
 * Resuelve el porcentaje de comision a aplicar para un consultorio.
 *
 * Logica:
 *   1. Si el consultorio es plan='pro' y tiene comisionPro definido (>=0)
 *      -> usa comisionPro
 *   2. Si el consultorio es plan='free' y tiene comisionFree definido (>=0)
 *      -> usa comisionFree
 *   3. Backwards compat: si el campo nuevo (Pro o Free) NO esta definido,
 *      cae al campo viejo `comisionConsulpay` (numero unico que se usaba
 *      antes del split por plan)
 *   4. Si nada esta definido -> error
 *
 * @param {object} consData - data del doc /consultorios/{id}
 * @returns {{ comisionPct: number, plan: string, fuente: string }}
 *   fuente es 'comisionPro' | 'comisionFree' | 'comisionConsulpay' (para logs)
 */
function resolverComision(consData) {
  const plan = consData.plan || 'free';

  // Helper: chequear que un valor sea un numero valido (>=0, <=100)
  const esValido = (v) => Number.isFinite(v) && v >= 0 && v <= 100;

  // Intentar campo nuevo segun el plan
  if (plan === 'pro') {
    const c = Number(consData.comisionPro);
    if (esValido(c)) {
      return { comisionPct: c, plan, fuente: 'comisionPro' };
    }
  } else {
    const c = Number(consData.comisionFree);
    if (esValido(c)) {
      return { comisionPct: c, plan, fuente: 'comisionFree' };
    }
  }

  // Backwards compat: cae al campo viejo
  const cLegacy = Number(consData.comisionConsulpay);
  if (esValido(cLegacy)) {
    return { comisionPct: cLegacy, plan, fuente: 'comisionConsulpay' };
  }

  // Nada definido -> error
  return null;
}

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

  // Soporta tanto el modelo viejo (mpConfig + mpIntegrado) como el nuevo
  // (mpConfigs.{primary,secondary}). tieneAlgunMpConectado revisa los dos.
  if (!tieneAlgunMpConectado(consData)) {
    return jsonResponse(res, 400, {
      error: 'El consultorio no tiene Mercado Pago vinculado. Contactá al administrador.',
      codigo: 'MP_NO_VINCULADO',
    });
  }

  // ---------- 3. Cargar sesiones y validar ----------
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
  // Resolver comision segun plan del consultorio (con backwards compat
  // a comisionConsulpay viejo). El helper devuelve null si no encuentra
  // un valor valido en ningun lado.
  const comisionResolved = resolverComision(consData);
  if (!comisionResolved) {
    console.error(
      `[crear-pago] Consultorio ${consultorioId} sin comision configurada. ` +
      `plan=${consData.plan}, comisionPro=${consData.comisionPro}, ` +
      `comisionFree=${consData.comisionFree}, comisionConsulpay=${consData.comisionConsulpay}`,
    );
    return jsonResponse(res, 500, {
      error: 'Configuración de comisión inválida en el consultorio. Contactá a soporte.',
      codigo: 'COMISION_INVALIDA',
    });
  }
  const { comisionPct, fuente: fuenteComision } = comisionResolved;

  // Caso especial: comision = 0% (consultorios de cortesia, partners, etc.)
  // En MP el marketplace_fee debe ser >= 0 — 0 es valido, no hay que tratar
  // como error. Simplemente no se cobra comision a consulpay.
  const fee = Math.round((montoTotal * comisionPct / 100) * 100) / 100;
  const montoConsultorio = Math.round((montoTotal - fee) * 100) / 100;

  // ---------- 5. Asegurar access token vigente del slot que toca cobrar ----------
  // obtenerAccessTokenParaCobro elige el slot segun la rotacion:
  //   - Si solo hay 1 slot conectado → ese
  //   - Si hay 2 slots y el reparto no esta activado → primary
  //   - Si hay 2 slots y el reparto esta activo → alterna primary/secondary
  //     segun el ciclo del 15 al 14 de cada mes
  //
  // El helper ademas refresca el token si esta proximo a vencer y devuelve
  // mpConfigActualizado para que persistamos los nuevos tokens.
  let accessToken;
  let slotCobrador;
  let razonSlot;
  let userIdMPReceptor;
  let livemodeReceptor;
  let mpConfigActualizado = null;
  try {
    const r = await obtenerAccessTokenParaCobro(consData, new Date());
    accessToken = r.accessToken;
    slotCobrador = r.slot;
    razonSlot = r.razon;
    userIdMPReceptor = r.userIdMP;
    livemodeReceptor = r.livemode;
    if (r.mpConfigActualizado) {
      mpConfigActualizado = r.mpConfigActualizado;
    }
  } catch (err) {
    console.error('Error obteniendo access token para cobro:', err);
    return jsonResponse(res, 500, {
      error: 'No se pudo validar la conexión de Mercado Pago. Pedile al administrador que reconecte.',
      codigo: 'MP_TOKEN_INVALIDO',
    });
  }

  // Si el token se refresco, persistimos los nuevos en el slot correcto
  // (tanto en mpConfigs.{slot} como, si es primary, en el legacy mpConfig)
  if (mpConfigActualizado) {
    try {
      const update = buildUpdateParaGuardarSlot(slotCobrador, mpConfigActualizado);
      await db.collection('consultorios').doc(consultorioId).update(update);
    } catch (err) {
      console.warn('No se pudo persistir el mpConfig refrescado, sigo igual:', err);
    }
  }

  // ---------- 6. Crear el doc /pagos_consultorio ----------
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
    await pagoRef.set({
      consultorioId,
      profesionalUid: uid,
      sesionesIds: sesionesValidadas.map((s) => s.id),
      montoTotal,
      montoConsultorio,
      montoConsulpay: fee,
      comisionPctAplicada: comisionPct,
      planAplicado: consData.plan || 'free',
      fuenteComision,
      // Trazabilidad del slot que cobro (para auditoria del reparto)
      slotCobrador,
      razonSlot,
      mpUserIdReceptor: userIdMPReceptor,
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
  // Guardamos planAplicado y fuenteComision para tener trazabilidad de
  // que comision se aplico al momento del pago, util para auditoria.
  // Tambien guardamos slotCobrador y mpUserIdReceptor para rastrear a
  // quien le cayo este pago (clave para el panel de reparto entre
  // socias y para conciliacion con MP).
  await pagoRef.set({
    consultorioId,
    profesionalUid: uid,
    sesionesIds: sesionesValidadas.map((s) => s.id),
    montoTotal,
    montoConsultorio,
    montoConsulpay: fee,
    comisionPctAplicada: comisionPct,
    planAplicado: consData.plan || 'free',
    fuenteComision,
    // Trazabilidad del slot que cobro (clave para el panel de reparto)
    slotCobrador,                  // 'primary' | 'secondary'
    razonSlot,                     // 'unico-slot' | 'reparto-no-iniciado' | 'reparto-rotacion'
    mpUserIdReceptor: userIdMPReceptor,  // user_id de MP de la cuenta que cobra
    estado: 'pendiente',
    mpPreferenceId: preferencia.id,
    mpPaymentId: null,
    initPointUrl: preferencia.init_point,
    sandboxInitPointUrl: preferencia.sandbox_init_point || null,
    livemode: !!livemodeReceptor,
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
