/**
 * /api/mp/webhook
 *
 * Receptor de notificaciones IPN/Webhooks de Mercado Pago.
 *
 * MP nos manda un POST cada vez que un pago cambia de estado. Este
 * endpoint:
 *   1. Valida la firma HMAC del webhook con MP_WEBHOOK_SECRET.
 *   2. Identifica el pago (data.id viene en el body / query).
 *   3. Hace fetch fresco contra la API de MP para obtener el estado
 *      real del pago (no confiamos solo en el body del webhook).
 *   4. Busca el doc /pagos_consultorio por mpPreferenceId o
 *      external_reference (=pagoId).
 *   5. Actualiza el doc del pago con el estado nuevo.
 *   6. Si el pago fue aprobado, marca las sesiones asociadas como
 *      pagadas (estadoPago='pagado' + pagoConsultorioId=pagoId).
 *
 * IDEMPOTENCIA: si MP nos manda el mismo webhook 2 veces (cosa que
 * pasa), no debe tener efectos secundarios. Antes de actualizar,
 * chequeamos el estado actual del doc.
 *
 * VALIDACION DE FIRMA: MP firma cada webhook con HMAC-SHA256 usando
 * el secret que configuramos en su panel + el id del pago + un
 * timestamp. Si la firma no coincide, devolvemos 401 y NO procesamos.
 * Sin esta validacion, cualquiera podria simular pagos aprobados.
 *
 * IMPORTANTE: este endpoint debe ser tolerante a errores y siempre
 * devolver 200 OK rapido a MP, sino MP reintenta indefinidamente y
 * podemos tener tormentas de webhooks. Si algo falla, logueamos pero
 * devolvemos 200.
 */

import { createHmac } from 'crypto';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

import { initAdmin } from '../_lib/firebase-admin.js';
import { jsonResponse, readJsonBody } from '../_lib/http.js';
import { decrypt } from '../_lib/encryption.js';
import { getPagoMP } from '../_lib/mp-marketplace.js';

/**
 * Valida la firma x-signature del webhook.
 *
 * MP arma la firma asi:
 *   manifest = `id:${dataId};request-id:${requestId};ts:${ts};`
 *   signature_hex = HMAC-SHA256(manifest, MP_WEBHOOK_SECRET)
 *
 * El header viene como:
 *   x-signature: ts=1234567,v1=abcd1234...
 *
 * Devuelve true si la firma coincide, false si no.
 *
 * Si MP_WEBHOOK_SECRET no esta configurado, devuelve true SOLO en
 * desarrollo (NODE_ENV !== 'production'). En produccion, false.
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
    console.warn('Webhook sin x-signature o x-request-id.');
    return false;
  }

  // Parsear ts=...,v1=...
  const parts = String(xSignature).split(',').map((p) => p.trim());
  let ts = null;
  let hash = null;
  for (const p of parts) {
    const [k, v] = p.split('=');
    if (k === 'ts') ts = v;
    if (k === 'v1') hash = v;
  }

  if (!ts || !hash) {
    console.warn('x-signature no tiene formato esperado (ts=..,v1=..).');
    return false;
  }

  // Construir el manifest segun la doc de MP
  const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
  const calculado = createHmac('sha256', secret).update(manifest).digest('hex');

  if (calculado !== hash) {
    console.warn('Firma de webhook no valida.', {
      manifest,
      calculado: calculado.slice(0, 12),
      recibido: hash.slice(0, 12),
    });
    return false;
  }
  return true;
}

/**
 * Extrae el desglose de fees del objeto Payment de MP.
 *
 * MP devuelve un array fee_details con todas las fees aplicadas:
 *   { type: 'mercadopago_fee', amount: 22.29, fee_payer: 'collector' }
 *   { type: 'application_fee', amount: 24.00, fee_payer: 'collector' }
 *   ...otros tipos posibles: financing_fee, financing_repayment_fee, ...
 *
 * Lo que nos interesa para mostrar al user:
 *  - feeMercadoPago: lo que cobra MP por procesar el pago
 *  - feeAplicacion: nuestra comisión (marketplace_fee). Aunque ya la
 *    tenemos en pagoData.comisionConsulpay, validamos que coincida.
 *  - netReceivedAmount: lo que efectivamente recibe el seller.
 *
 * Si fee_details no viene, devolvemos { feeMercadoPago: null, ... }
 * — es importante manejar el caso null en la UI para pagos viejos
 * que no tienen este desglose.
 */
function extraerFeeDetails(pagoMP) {
  const details = Array.isArray(pagoMP.fee_details) ? pagoMP.fee_details : [];

  let feeMercadoPago = 0;
  let feeAplicacion = 0;
  let huboMpFee = false;
  let huboAppFee = false;

  for (const f of details) {
    const amount = Number(f.amount) || 0;
    if (f.type === 'mercadopago_fee') {
      feeMercadoPago += amount;
      huboMpFee = true;
    } else if (f.type === 'application_fee') {
      feeAplicacion += amount;
      huboAppFee = true;
    }
    // Otros tipos (financing_fee, etc) los ignoramos por ahora.
    // Si aparecen para algun caso de cuotas, agregar.
  }

  // El neto que recibe el seller. Lo sacamos directo de transaction_details
  // (lo calcula MP), pero si no viene, lo calculamos nosotros.
  const netDeMP = pagoMP.transaction_details?.net_received_amount;
  const transactionAmount = Number(pagoMP.transaction_amount) || 0;
  const netCalculado = transactionAmount - feeMercadoPago - feeAplicacion;

  return {
    feeMercadoPago: huboMpFee ? feeMercadoPago : null,
    feeAplicacion: huboAppFee ? feeAplicacion : null,
    netReceivedAmount: typeof netDeMP === 'number' ? netDeMP : netCalculado,
    transactionAmount,
    feeDetailsRaw: details, // por si despues queremos mostrar todos
  };
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

  // MP envia el id del pago de varias formas posibles:
  //  - body.data.id (formato nuevo "webhooks v2")
  //  - body.id + body.topic (formato IPN viejo)
  //  - query string ?id=...&topic=payment
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const queryId = url.searchParams.get('id') || url.searchParams.get('data.id');
  const queryTopic = url.searchParams.get('topic') || url.searchParams.get('type');

  const dataId = body?.data?.id || body?.id || queryId;
  const topic = body?.type || body?.topic || queryTopic;

  // Solo procesamos pagos. Otros topics (ej "merchant_order") los ignoramos.
  if (topic !== 'payment') {
    return jsonResponse(res, 200, { ok: true, ignorado: 'topic_no_payment', topic });
  }

  if (!dataId) {
    console.warn('Webhook sin data.id ni id ni query id', { body, queryId });
    return jsonResponse(res, 200, { ok: true, ignorado: 'sin_id' });
  }

  // Validar firma
  if (!validarFirma(req, dataId)) {
    return jsonResponse(res, 401, { error: 'Firma invalida' });
  }

  try {
    initAdmin();
  } catch (err) {
    console.error('Error inicializando firebase-admin en webhook:', err);
    return jsonResponse(res, 200, { ok: true, error: 'init_admin_fallo' });
  }

  const db = getFirestore();

  try {
    await procesarPago(db, dataId);
  } catch (err) {
    console.error('Error procesando webhook MP:', err);
  }

  return jsonResponse(res, 200, { ok: true });
}

/**
 * Procesa la notificacion de un pago.
 * Lee el pago de MP, lo matchea con un doc /pagos_consultorio,
 * y actualiza estados.
 */
async function procesarPago(db, paymentId) {
  // Buscamos directo en pagos_consultorio si ya tenemos este paymentId
  const existentePorPaymentId = await db.collection('pagos_consultorio')
    .where('mpPaymentId', '==', String(paymentId))
    .limit(1)
    .get();

  let pagoDoc = null;
  if (!existentePorPaymentId.empty) {
    pagoDoc = existentePorPaymentId.docs[0];
  }

  // Si no lo encontramos, iteramos consultorios y buscamos por external_reference.
  if (!pagoDoc) {
    const consultoriosSnap = await db.collection('consultorios')
      .where('mpIntegrado', '==', true)
      .get();

    for (const consDoc of consultoriosSnap.docs) {
      const consData = consDoc.data();
      if (!consData.mpConfig?.accessTokenEnc) continue;

      let accessToken;
      try {
        accessToken = decrypt(consData.mpConfig.accessTokenEnc);
      } catch (err) {
        console.warn(`No se pudo decifrar accessToken de ${consDoc.id}:`, err.message);
        continue;
      }

      try {
        const pagoMP = await getPagoMP({ accessToken, paymentId });
        const externalRef = pagoMP.external_reference;
        if (!externalRef) {
          console.warn(`Pago ${paymentId} sin external_reference, no se puede matchear.`);
          return;
        }

        const pagoSnap = await db.collection('pagos_consultorio').doc(externalRef).get();
        if (!pagoSnap.exists) {
          console.warn(`Pago consultorio ${externalRef} no existe en Firestore.`);
          return;
        }
        const pagoData = pagoSnap.data();
        if (pagoData.consultorioId !== consDoc.id) {
          console.warn(`Mismatch consultorio en pago ${externalRef}: ${pagoData.consultorioId} vs ${consDoc.id}`);
          continue;
        }
        pagoDoc = pagoSnap;
        await actualizarPagoYDescuentoSesiones(db, pagoSnap, pagoMP);
        return;
      } catch (err) {
        if (err.mpStatus === 404) continue;
        console.warn(`Error consultando pago ${paymentId} con cons ${consDoc.id}:`, err.message);
        continue;
      }
    }

    if (!pagoDoc) {
      console.warn(`No pudimos matchear el pago MP ${paymentId} con ningun consultorio.`);
      return;
    }
  } else {
    // Ya teniamos el pago, refrescamos el estado contra MP usando el
    // access_token del consultorio asociado.
    const pagoData = pagoDoc.data();
    const consSnap = await db.collection('consultorios').doc(pagoData.consultorioId).get();
    if (!consSnap.exists) {
      console.error(`Consultorio ${pagoData.consultorioId} no existe.`);
      return;
    }
    const consData = consSnap.data();
    if (!consData.mpConfig?.accessTokenEnc) {
      console.warn(`Consultorio ${pagoData.consultorioId} sin mpConfig.`);
      return;
    }
    let accessToken;
    try {
      accessToken = decrypt(consData.mpConfig.accessTokenEnc);
    } catch (err) {
      console.error('No se pudo decifrar accessToken:', err);
      return;
    }
    try {
      const pagoMP = await getPagoMP({ accessToken, paymentId });
      await actualizarPagoYDescuentoSesiones(db, pagoDoc, pagoMP);
    } catch (err) {
      console.error('Error consultando pago en MP:', err);
    }
  }
}

/**
 * Mapea el status de MP al estado nuestro y actualiza el doc del pago.
 * Si el pago fue aprobado y todavia no procesamos, marca las sesiones
 * como pagadas.
 *
 * IDEMPOTENTE: si llaman 2 veces con el mismo pago aprobado, las
 * sesiones se actualizan una sola vez (chequeamos webhookRecibidoAt).
 *
 * NUEVO: ahora extraemos fee_details del payment para guardar el
 * desglose real de fees (lo que cobro MP, lo que cobro la app, y el
 * neto que recibe el seller). La UI lo muestra para que el admin
 * sepa exactamente que va a recibir en su cuenta.
 */
async function actualizarPagoYDescuentoSesiones(db, pagoSnap, pagoMP) {
  const pagoData = pagoSnap.data();
  const pagoRef = pagoSnap.ref;

  // Mapeo de estados MP → nuestros
  let estadoNuevo = pagoData.estado; // default no cambiar
  switch (pagoMP.status) {
    case 'approved':
      estadoNuevo = 'aprobado';
      break;
    case 'rejected':
    case 'cancelled':
      estadoNuevo = 'rechazado';
      break;
    case 'pending':
    case 'in_process':
    case 'in_mediation':
    case 'authorized':
      estadoNuevo = 'pendiente';
      break;
    case 'refunded':
    case 'charged_back':
      estadoNuevo = 'reembolsado';
      break;
    default:
      console.warn(`Estado MP desconocido: ${pagoMP.status}`);
      break;
  }

  const yaProcesadoComoAprobado = pagoData.estado === 'aprobado'
    && pagoData.webhookRecibidoAt != null;

  // Extraer desglose de fees
  const fees = extraerFeeDetails(pagoMP);

  // Actualizar el doc del pago.
  // Nuevos campos:
  //  - feeMercadoPago: lo que cobra MP (a informar al user)
  //  - montoNetoReal: lo que efectivamente recibe el seller (=
  //    transaction_amount - feeMercadoPago - application_fee)
  //  - feeDetailsRaw: array completo por si queremos analizar despues
  //
  // Mantenemos por compat:
  //  - montoNeto: el campo viejo (= bruto - comisionConsulpay), pero
  //    ahora la UI lee montoNetoReal con fallback a montoNeto.
  await pagoRef.update({
    estado: estadoNuevo,
    mpPaymentId: String(pagoMP.id),
    mpStatusDetail: pagoMP.status_detail || null,
    feeMercadoPago: fees.feeMercadoPago,
    montoNetoReal: fees.netReceivedAmount,
    feeDetailsRaw: fees.feeDetailsRaw,
    rawPaymentData: {
      status: pagoMP.status,
      status_detail: pagoMP.status_detail,
      payment_method_id: pagoMP.payment_method_id || null,
      payment_type_id: pagoMP.payment_type_id || null,
      transaction_amount: pagoMP.transaction_amount || null,
      net_received_amount: pagoMP.transaction_details?.net_received_amount || null,
      installments: pagoMP.installments || null,
    },
    webhookRecibidoAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  // Si el pago fue aprobado y NO lo procesamos antes, marcamos las
  // sesiones como pagadas en una sola transaccion atomica.
  if (estadoNuevo === 'aprobado' && !yaProcesadoComoAprobado) {
    const sesionesIds = pagoData.sesionesIds || [];
    if (sesionesIds.length > 0) {
      const batch = db.batch();
      for (const sesionId of sesionesIds) {
        const sesionRef = db.collection('sesiones').doc(sesionId);
        batch.update(sesionRef, {
          estadoPago: 'pagado',
          pagoConsultorioId: pagoSnap.id,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      try {
        await batch.commit();
        console.log(`Marcadas ${sesionesIds.length} sesiones como pagadas para pago ${pagoSnap.id}`);
      } catch (err) {
        console.error(`Error marcando sesiones como pagadas para pago ${pagoSnap.id}:`, err);
      }
    }
  }
}
