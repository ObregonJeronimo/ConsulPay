/**
 * /api/mp/pago-status
 *
 * Endpoint de consulta para que el frontend sepa el estado actual de
 * un pago. Lo usa la pagina de retorno post-checkout (/mi-panel/pagos/retorno)
 * para hacer polling hasta que el webhook actualice el estado.
 *
 * GET /api/mp/pago-status?pagoId=xxx
 * Header: Authorization: Bearer <firebase_id_token>
 * Devuelve: { estado, mpPaymentId, montoTotal, marketplaceFee, sesionesIds, updatedAt }
 *
 * Solo el profesional dueño del pago, el admin del consultorio o un
 * superadmin pueden consultar. Chequeamos en el endpoint en lugar de
 * confiar solo en las rules porque el endpoint hace lectura via
 * firebase-admin (que saltea rules).
 */

import { getFirestore } from 'firebase-admin/firestore';

import { verificarAuthHeader } from '../_lib/auth.js';
import { initAdmin } from '../_lib/firebase-admin.js';
import { jsonResponse } from '../_lib/http.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return jsonResponse(res, 405, { error: 'Method not allowed' });
  }

  let uid;
  try {
    initAdmin();
    uid = await verificarAuthHeader(req);
  } catch (err) {
    return jsonResponse(res, err.status || 500, { error: err.message });
  }

  // Parsear pagoId del query
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pagoId = url.searchParams.get('pagoId');
  if (!pagoId) {
    return jsonResponse(res, 400, { error: 'pagoId requerido en query.' });
  }

  const db = getFirestore();
  const pagoSnap = await db.collection('pagos_consultorio').doc(pagoId).get();
  if (!pagoSnap.exists) {
    return jsonResponse(res, 404, { error: 'Pago no encontrado.' });
  }
  const pagoData = pagoSnap.data();

  // Validar que el caller pueda ver este pago:
  //  - el profesional dueño del pago, o
  //  - un admin del consultorio (rol=admin + consultorioId match + en adminUids), o
  //  - un superadmin
  const userSnap = await db.collection('usuarios').doc(uid).get();
  if (!userSnap.exists) {
    return jsonResponse(res, 403, { error: 'Tu usuario no existe.' });
  }
  const userData = userSnap.data();

  const esSuperadmin = userData.rol === 'superadmin';
  const esProfesionalDueño = userData.rol === 'profesional'
    && pagoData.profesionalUid === uid
    && userData.consultorioId === pagoData.consultorioId;

  let esAdmin = false;
  if (userData.rol === 'admin' && userData.consultorioId === pagoData.consultorioId) {
    const consSnap = await db.collection('consultorios').doc(pagoData.consultorioId).get();
    const adminUids = consSnap.exists ? (consSnap.data().adminUids || []) : [];
    esAdmin = adminUids.includes(uid);
  }

  if (!esSuperadmin && !esProfesionalDueño && !esAdmin) {
    return jsonResponse(res, 403, { error: 'No tenés permiso para ver este pago.' });
  }

  // Devolver info publica del pago. NO devolvemos rawPaymentData
  // entero (puede tener info sensible del payer); devolvemos solo
  // lo que el frontend necesita.
  return jsonResponse(res, 200, {
    pagoId,
    estado: pagoData.estado,
    mpPaymentId: pagoData.mpPaymentId,
    mpStatusDetail: pagoData.mpStatusDetail || null,
    montoTotal: pagoData.montoTotal,
    montoConsultorio: pagoData.montoConsultorio,
    marketplaceFee: pagoData.montoConsulpay,
    sesionesIds: pagoData.sesionesIds || [],
    consultorioId: pagoData.consultorioId,
    profesionalUid: pagoData.profesionalUid,
    initPointUrl: pagoData.initPointUrl,
    livemode: pagoData.livemode || false,
    webhookRecibidoAt: pagoData.webhookRecibidoAt
      ? pagoData.webhookRecibidoAt.toDate().toISOString()
      : null,
    createdAt: pagoData.createdAt
      ? pagoData.createdAt.toDate().toISOString()
      : null,
    updatedAt: pagoData.updatedAt
      ? pagoData.updatedAt.toDate().toISOString()
      : null,
  });
}
