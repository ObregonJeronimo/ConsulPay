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
 * IMPORTANTE - prelogin:
 * En lugar de mandar al user directo a /authorization (que falla con
 * "invalid session" si no hay sesion MP), lo mandamos a:
 *
 *   auth.mercadopago.com.ar/login?go=/authorization?...
 *
 * Notas sobre el "go":
 * - DEBE ser relativo al mismo dominio (auth.mercadopago.com.ar). Si
 *   pasamos una URL absoluta a otro subdominio (ej www.mercadopago.com.ar),
 *   MP rompe con un genérico "Algo salió mal".
 * - El path en `go` se compone solamente del path + query del authorize,
 *   sin el dominio.
 *
 * Con esto:
 * - Si el user ya esta logueado en MP, MP salta el login automaticamente
 *   y va directo a authorize.
 * - Si no esta logueado, MP le pide loguearse y despues va al authorize.
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

const MP_AUTH_BASE = 'https://auth.mercadopago.com.ar';

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

  // Construimos el path + query del authorize (sin el dominio, porque
  // va a ir como `go` relativo al login del mismo subdominio).
  const authorizeParams = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    platform_id: 'mp',
    redirect_uri: redirectUri,
    state,
  });
  const goRelative = `/authorization?${authorizeParams.toString()}`;

  // Envolverla en /login?go=<go_relativo> en el MISMO subdominio
  // (auth.mercadopago.com.ar). MP no acepta cruzar subdominios en `go`.
  const loginParams = new URLSearchParams({ go: goRelative });
  const authorizeUrl = `${MP_AUTH_BASE}/login?${loginParams.toString()}`;

  return jsonResponse(res, 200, { authorizeUrl });
}
