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
 * En lugar de mandar al user directo a auth.mercadopago.com.ar/authorization,
 * lo mandamos a www.mercadopago.com.ar/login?go=<authorize_url>. Esto fuerza
 * a MP a verificar la sesion del user antes de mostrarle "Autorizar a
 * consulpay". Sin este wrapper, MP a veces muestra la pantalla de autorizar
 * sin tener sesion activa, y al darle "Autorizar" devuelve un opaco
 * {"code":"unauthorized","message":"invalid session"} que confunde al user.
 *
 * Con el prelogin: si el user ya esta logueado en MP, MP salta el login
 * automaticamente y va directo a authorize. Si no esta logueado, le pide
 * loguearse primero. En ambos casos, sin error.
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
const MP_LOGIN_URL = 'https://www.mercadopago.com.ar/login';

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

  // Construir URL de autorizacion (la "interna", a /authorization)
  const authorizeParams = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    platform_id: 'mp',
    redirect_uri: redirectUri,
    state,
  });
  const innerAuthorizeUrl = `${MP_AUTHORIZE_URL}?${authorizeParams.toString()}`;

  // Envolverla en /login?go=<authorize_url> para forzar el prelogin.
  // El "go" en MP es relativo al dominio, asi que solo pasamos el path
  // + query (sin el https://auth.mercadopago.com.ar/).
  //
  // En la practica, MP soporta tanto un "go" relativo al dominio actual
  // como una URL absoluta. Pasamos la URL absoluta para que MP siempre
  // redirija al endpoint correcto sin importar de que dominio venga.
  const loginParams = new URLSearchParams({
    go: innerAuthorizeUrl,
  });
  const authorizeUrl = `${MP_LOGIN_URL}?${loginParams.toString()}`;

  return jsonResponse(res, 200, { authorizeUrl });
}
