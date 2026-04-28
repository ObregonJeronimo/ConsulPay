/**
 * /api/mp/oauth-disconnect
 *
 * Desconecta la cuenta MP del consultorio. Limpia mpConfig (quedando
 * null) y marca mpIntegrado=false.
 *
 * Body: { consultorioId }
 * Header: Authorization: Bearer <firebase_id_token>
 *
 * Implicancias para el sistema:
 *  - Despues de desconectar, los profesionales no pueden iniciar pagos
 *    al consultorio (la UI debe mostrar 'metodo de pago deshabilitado').
 *  - Los pagos en curso quedan en su estado actual; no se cancelan
 *    automaticamente.
 *  - Si el admin reconecta despues, va a generar tokens nuevos (se
 *    pierde el historial de tokens viejos).
 *
 * NO revocamos los tokens viejos en MP. El admin puede revocarlos
 * manualmente desde su panel de MP si quiere. Si en algun momento
 * MP da una API publica de revocacion, la podemos agregar aca.
 */

import { getFirestore } from 'firebase-admin/firestore';

import { asegurarAdminDeConsultorio, verificarAuthHeader } from '../_lib/auth.js';
import { initAdmin } from '../_lib/firebase-admin.js';
import { jsonResponse, readJsonBody } from '../_lib/http.js';

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

  try {
    await asegurarAdminDeConsultorio({ uid, consultorioId });
  } catch (err) {
    return jsonResponse(res, err.status || 500, { error: err.message });
  }

  const db = getFirestore();
  await db.collection('consultorios').doc(consultorioId).update({
    mpIntegrado: false,
    mpConfig: null,
    mpDesconectadoAt: new Date(),
    mpDesconectadoPorUid: uid,
  });

  return jsonResponse(res, 200, { ok: true });
}
