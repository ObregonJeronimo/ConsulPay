/**
 * /api/mp/webhook
 *
 * Receptor UNIFICADO de notificaciones IPN/Webhooks de Mercado Pago.
 * MP solo permite UNA URL de webhook por aplicacion, asi que routeamos
 * adentro segun el type del evento.
 *
 * Tipos manejados:
 *   - payment: pago de profesional al consultorio (marketplace_fee)
 *   - subscription_preapproval: estado de suscripcion del Plan Pro
 *   - subscription_authorized_payment: cobro mensual del Plan Pro
 *   - merchant_order, plan, etc.: ignorados (devolvemos 200)
 *
 * Para todos los tipos:
 *   1. Validamos firma HMAC con MP_WEBHOOK_SECRET.
 *   2. Hacemos fetch contra la API de MP para obtener el estado real
 *      (no confiamos solo en el body del webhook).
 *   3. Actualizamos los docs correspondientes en Firestore.
 *
 * IDEMPOTENCIA: si MP nos manda el mismo webhook 2 veces, no debe
 * tener efectos secundarios. Cada handler chequea estado actual
 * antes de actualizar.
 *
 * IMPORTANTE: este endpoint debe devolver 200 OK rapido a MP, sino
 * MP reintenta indefinidamente. Si algo falla en el procesamiento,
 * logueamos pero devolvemos 200. La unica excepcion es firma
 * invalida (401) — no devolvemos 200 a un atacante.
 */

import { createHmac } from 'crypto';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

import { initAdmin } from '../_lib/firebase-admin.js';
import { jsonResponse, readJsonBody } from '../_lib/http.js';
import { getPagoMP } from '../_lib/mp-marketplace.js';
import {
  buildUpdateParaGuardarSlot,
  leerMpConfigDelSlot,
  listarSlotsConectados,
  obtenerAccessTokenDeSlot,
  tieneAlgunMpConectado,
} from '../_lib/mp-config-helpers.js';
import {
  procesarAuthorizedPayment,
  procesarPreapproval,
} from '../_lib/handlers-suscripciones.js';

/**
 * Valida la firma x-signature del webhook.
 *
 * MP arma la firma asi:
 *   manifest = `id:${dataId};request-id:${requestId};ts:${ts};`
 *   signature_hex = HMAC-SHA256(manifest, MP_WEBHOOK_SECRET)
 *
 * Header: x-signature: ts=1234567,v1=abcd1234...
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
 * fee_details viene como array con cada cargo. Nos interesa:
 *  - mercadopago_fee: cargo de MP por procesar el pago
 *  - application_fee: nuestra comision (marketplace_fee)
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
  }

  const netDeMP = pagoMP.transaction_details?.net_received_amount;
  const transactionAmount = Number(pagoMP.transaction_amount) || 0;
  const netCalculado = transactionAmount - feeMercadoPago - feeAplicacion;

  return {
    feeMercadoPago: huboMpFee ? feeMercadoPago : null,
    feeAplicacion: huboAppFee ? feeAplicacion : null,
    netReceivedAmount: typeof netDeMP === 'number' ? netDeMP : netCalculado,
    transactionAmount,
    feeDetailsRaw: details,
  };
}

/**
 * Normaliza el `type` que viene en el body del webhook.
 *
 * MP usa formatos distintos segun el tipo de evento:
 *  - body.type='payment' (formato moderno)
 *  - body.topic='payment' (formato IPN viejo)
 *  - query string ?type=payment o ?topic=payment
 *  - body.action='payment.updated' (notificaciones de tipo 'action')
 *
 * Devolvemos el tipo en lowercase normalizado:
 *  - 'payment'
 *  - 'subscription_preapproval'
 *  - 'subscription_authorized_payment'
 *  - 'merchant_order' (ignorado)
 *  - cualquier otro: lo devolvemos como vino para loguear
 */
function normalizarTipoEvento(body, queryType) {
  const raw = body?.type || body?.topic || queryType || '';
  const action = body?.action || '';

  // Si action es del tipo 'payment.updated', extraemos el tipo
  if (action.startsWith('payment.')) return 'payment';
  if (action.startsWith('subscription_preapproval.')) return 'subscription_preapproval';
  if (action.startsWith('subscription_authorized_payment.')) return 'subscription_authorized_payment';

  return String(raw).toLowerCase();
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
  const queryType = url.searchParams.get('type') || url.searchParams.get('topic');

  const dataId = body?.data?.id || body?.id || queryId;
  const tipo = normalizarTipoEvento(body, queryType);

  // Sin id no podemos hacer nada
  if (!dataId) {
    console.warn('Webhook sin data.id ni id', { tipo, body, queryId });
    return jsonResponse(res, 200, { ok: true, ignorado: 'sin_id' });
  }

  // Filtrar tipos que NO procesamos. Devolvemos 200 para que MP no
  // reintente, pero no hacemos nada.
  const tiposManejados = new Set([
    'payment',
    'subscription_preapproval',
    'subscription_authorized_payment',
    'preapproval', // alias por las dudas
    'authorized_payment', // alias por las dudas
  ]);

  if (!tiposManejados.has(tipo)) {
    return jsonResponse(res, 200, {
      ok: true,
      ignorado: 'tipo_no_manejado',
      tipo,
    });
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

  // Routear segun tipo
  try {
    if (tipo === 'payment') {
      await procesarPagoConsultorio(db, dataId);
    } else if (tipo === 'subscription_preapproval' || tipo === 'preapproval') {
      const accessToken = process.env.CONSULPAY_MP_ACCESS_TOKEN;
      if (!accessToken) {
        console.error('CONSULPAY_MP_ACCESS_TOKEN no configurado');
      } else {
        await procesarPreapproval(db, accessToken, dataId);
      }
    } else if (tipo === 'subscription_authorized_payment' || tipo === 'authorized_payment') {
      const accessToken = process.env.CONSULPAY_MP_ACCESS_TOKEN;
      if (!accessToken) {
        console.error('CONSULPAY_MP_ACCESS_TOKEN no configurado');
      } else {
        await procesarAuthorizedPayment(db, accessToken, dataId);
      }
    }
  } catch (err) {
    console.error(`Error procesando webhook MP (tipo=${tipo}):`, err);
  }

  return jsonResponse(res, 200, { ok: true });
}

/* ============================================================
   Handler de pagos (marketplace_fee / pagos_consultorio)
   ----------------------------------------------------------------
   Logica que ya tenia el endpoint antes de unificar. Sin cambios.
   ============================================================ */

async function procesarPagoConsultorio(db, paymentId) {
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
  // Cada consultorio puede tener 1 o 2 slots MP conectados, y el pago puede
  // pertenecer a cualquiera de los dos. Iteramos todos los slots de cada
  // consultorio hasta encontrar el pago.
  if (!pagoDoc) {
    // Traer consultorios con MP integrado (campo legacy o slots nuevos).
    // Para simplificar, traemos los que tengan mpIntegrado=true (que se
    // sigue manteniendo en true mientras haya algun slot con primary).
    // Los consultorios que solo tengan secondary (sin primary) NO los
    // cubre este query — pero ese caso no deberia darse porque
    // buildUpdateParaDesconectarSlot promueve secondary a primary cuando
    // se desconecta primary. Asi que mpIntegrado=true cubre el 100% de
    // consultorios que tienen al menos un slot conectado.
    const consultoriosSnap = await db.collection('consultorios')
      .where('mpIntegrado', '==', true)
      .get();

    for (const consDoc of consultoriosSnap.docs) {
      const consData = consDoc.data();
      if (!tieneAlgunMpConectado(consData)) continue;

      const slots = listarSlotsConectados(consData);

      // Iterar cada slot del consultorio buscando el pago
      let pagoEncontradoParaEsteCons = false;

      for (const slot of slots) {
        const tokenInfo = await obtenerAccessTokenDeSlot(consData, slot).catch((err) => {
          console.warn(`No se pudo obtener token de ${consDoc.id}/${slot}:`, err.message);
          return null;
        });
        if (!tokenInfo) continue;

        // Si el token se refresco durante esta consulta, lo persistimos.
        // Hacemos fire-and-forget porque no es bloqueante.
        if (tokenInfo.mpConfigActualizado) {
          db.collection('consultorios').doc(consDoc.id).update(
            buildUpdateParaGuardarSlot(slot, tokenInfo.mpConfigActualizado),
          ).catch((err) => {
            console.warn(`Refresh persistencia ${consDoc.id}/${slot} fallo:`, err.message);
          });
        }

        try {
          const pagoMP = await getPagoMP({ accessToken: tokenInfo.accessToken, paymentId });
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
            console.warn(
              `Mismatch consultorio en pago ${externalRef}: ${pagoData.consultorioId} vs ${consDoc.id}`,
            );
            continue;
          }
          pagoDoc = pagoSnap;
          await actualizarPagoYDescuentoSesiones(db, pagoSnap, pagoMP);
          pagoEncontradoParaEsteCons = true;
          break;  // ya encontre el pago, no sigo iterando slots de este cons
        } catch (err) {
          if (err.mpStatus === 404) continue;  // este slot no es; probar siguiente
          console.warn(
            `Error consultando pago ${paymentId} con cons ${consDoc.id} slot ${slot}:`,
            err.message,
          );
          continue;
        }
      }

      if (pagoEncontradoParaEsteCons) return;
    }

    if (!pagoDoc) {
      console.warn(`No pudimos matchear el pago MP ${paymentId} con ningun consultorio.`);
      return;
    }
  } else {
    // Camino feliz: ya teniamos el pago. Refrescamos contra MP usando el
    // access_token del SLOT CORRECTO (el que cobro). Esto lo sabemos
    // porque crear-pago.js guarda slotCobrador en el doc desde el commit
    // que agrega multi-slot.
    //
    // Para pagos viejos creados antes de ese commit, slotCobrador no
    // existe — fallback a 'primary' (que via mpConfig legacy sigue
    // apuntando a la misma cuenta de siempre).
    const pagoData = pagoDoc.data();
    const consSnap = await db.collection('consultorios').doc(pagoData.consultorioId).get();
    if (!consSnap.exists) {
      console.error(`Consultorio ${pagoData.consultorioId} no existe.`);
      return;
    }
    const consData = consSnap.data();

    const slot = pagoData.slotCobrador || 'primary';

    if (!leerMpConfigDelSlot(consData, slot)) {
      console.warn(
        `Consultorio ${pagoData.consultorioId} no tiene slot ${slot} conectado. ` +
        `(El slot puede haberse desconectado despues del pago.)`
      );
      return;
    }

    const tokenInfo = await obtenerAccessTokenDeSlot(consData, slot).catch((err) => {
      console.error(`No se pudo obtener token de ${pagoData.consultorioId}/${slot}:`, err);
      return null;
    });
    if (!tokenInfo) return;

    // Persistir refresh si hubo
    if (tokenInfo.mpConfigActualizado) {
      db.collection('consultorios').doc(pagoData.consultorioId).update(
        buildUpdateParaGuardarSlot(slot, tokenInfo.mpConfigActualizado),
      ).catch((err) => {
        console.warn(`Refresh persistencia fallo:`, err.message);
      });
    }

    try {
      const pagoMP = await getPagoMP({ accessToken: tokenInfo.accessToken, paymentId });
      await actualizarPagoYDescuentoSesiones(db, pagoDoc, pagoMP);
    } catch (err) {
      console.error('Error consultando pago en MP:', err);
    }
  }
}

async function actualizarPagoYDescuentoSesiones(db, pagoSnap, pagoMP) {
  const pagoData = pagoSnap.data();
  const pagoRef = pagoSnap.ref;

  // Mapeo de estados MP → nuestros
  let estadoNuevo = pagoData.estado;
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

  const fees = extraerFeeDetails(pagoMP);

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

  // Si el pago fue aprobado y NO lo procesamos antes, marcamos sesiones
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
        console.log(
          `Marcadas ${sesionesIds.length} sesiones como pagadas para pago ${pagoSnap.id}`,
        );
      } catch (err) {
        console.error(
          `Error marcando sesiones como pagadas para pago ${pagoSnap.id}:`,
          err,
        );
      }
    }
  }
}
