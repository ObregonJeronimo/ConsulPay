/**
 * /api/mp/oauth-init
 *
 * Inicia el flow OAuth de Mercado Pago para vincular la cuenta del
 * admin del consultorio.
 *
 * Flujo:
 *  1. El frontend llama acá con un Firebase ID token (header Authorization)
 *     y consultorioId en el body.
 *  2. Validamos auth + que sea admin del consultorio.
 *  3. Generamos un state random unico y lo guardamos en Firestore con TTL
 *     de 10 min en /oauth_states/{state} junto con consultorioId y callerUid.
 *  4. Devolvemos { authorizeUrl } al frontend, que redirige al usuario.
 *
 * El state previene CSRF y vincula el callback al admin/consultorio
 * que inicio el flow.
 *
 * NOTA sobre la pantalla "invalid session" de MP:
 * Si el user llega al authorize sin sesion MP activa y le da
 * "Autorizar", MP devuelve un opaco {"code":"unauthorized","message":
 * "invalid session"}. Probamos varias vueltas:
 *
 *   - www.mercadopago.com.ar/login?go=https://auth... → "Algo salio mal"
 *     (MP no acepta cruzar subdominios en `go`)
 *   - auth.mercadopago.com.ar/login?go=/authorization → 404 en ML
 *     (cuando no hay sesion, MP delega a SSO de Mercado Libre, y ML no
 *      tiene /authorization en sus rutas)
 *
 * Conclusion: el wrapper `?go=` no es para apps OAuth de terceros.
 * Volvemos al flujo estandar (link directo a /authorization). La
 * prevencion de "invalid session" la maneja el frontend con un modal
 * preventivo que avisa al user que se loguee en MP antes de continuar.
 *
 * Body:  { consultorioId: string }
 * Header: Authorization: Bearer <firebase_id_token>
 * Devuelve: { authorizeUrl: string }
 */

import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { randomBytes } from 'crypto';

import { asegurarAdminDeConsultorio, verificarAuthHeader } from '../_lib/auth.js';
import { initAdmin } from '../_lib/firebase-admin.js';
import { jsonResponse, readJsonBody } from '../_lib/http.js';

const MP_AUTHORIZE_URL = 'https://auth.mercadopago.com.ar/authorization';

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

  // Validar que el caller sea admin del consultorio
  try {
    await asegurarAdminDeConsultorio({ uid, consultorioId });
  } catch (err) {
    return jsonResponse(res, err.status || 500, { error: err.message });
  }

  // Variables de entorno
  const clientId = process.env.MP_CLIENT_ID;
  const redirectUri = process.env.MP_REDIRECT_URI;
  if (!clientId) {
    return jsonResponse(res, 500, {
      error: 'MP_CLIENT_ID no esta configurado en el servidor.',
    });
  }
  if (!redirectUri) {
    return jsonResponse(res, 500, {
      error: 'MP_REDIRECT_URI no esta configurado en el servidor.',
    });
  }

  // Generar state random unico (URL-safe)
  const state = randomBytes(32).toString('hex');

  // Persistir state con TTL
  const db = getFirestore();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutos
  await db.collection('oauth_states').doc(state).set({
    consultorioId,
    callerUid: uid,
    proveedor: 'mp',
    createdAt: FieldValue.serverTimestamp(),
    expiresAt,
    used: false,
  });

  // Construir URL de autorizacion estandar (sin wrapper)
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    platform_id: 'mp',
    redirect_uri: redirectUri,
    state,
  });
  const authorizeUrl = `${MP_AUTHORIZE_URL}?${params.toString()}`;

  return jsonResponse(res, 200, { authorizeUrl });
}
