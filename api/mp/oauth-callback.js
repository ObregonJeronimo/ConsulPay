/**
 * /api/mp/oauth-callback
 *
 * MP redirige al admin acá despues de autorizar (o rechazar) la
 * vinculacion de su cuenta al consultorio.
 *
 * Query params recibidos:
 *   code: string — authorization code (si autorizo)
 *   state: string — el state que pusimos en oauth-init
 *   error?: string — si hubo error (ej "access_denied")
 *
 * Flujo:
 *   1. Validamos state contra /oauth_states/{state}
 *      - existe, no expiro, no fue usado
 *   2. Lo marcamos used=true
 *   3. Intercambiamos code por tokens contra MP
 *   4. Encriptamos access_token + refresh_token
 *   5. Guardamos en /consultorios/{id}.mpConfig + mpIntegrado=true
 *   6. Redirigimos al admin a /admin/configuracion?mp=connected
 *
 * Si algo falla, redirigimos con ?mp=error&reason=xxx para que la UI
 * muestre el problema.
 *
 * Este endpoint NO requiere Firebase ID token: la autenticacion es
 * via el state guardado en Firestore (que vincula al uid que inicio
 * el flow). El admin esta logueado en su browser y MP lo redirige
 * con el state, no manda token.
 */

import { getFirestore } from 'firebase-admin/firestore';

import { initAdmin } from '../_lib/firebase-admin.js';
import { redirectResponse } from '../_lib/http.js';
import { buildMpConfig, intercambiarCodePorTokens } from '../_lib/mp-token.js';

function urlConError(reason) {
  const base = process.env.APP_BASE_URL || '';
  const params = new URLSearchParams({ mp: 'error', reason });
  return `${base}/admin/configuracion?${params.toString()}`;
}

function urlConExito() {
  const base = process.env.APP_BASE_URL || '';
  return `${base}/admin/configuracion?mp=connected`;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return redirectResponse(res, urlConError('metodo_invalido'));
  }

  // Parsear query string
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const errorParam = url.searchParams.get('error');

  // Si MP devolvio un error explicito (ej: usuario rechazo)
  if (errorParam) {
    return redirectResponse(res, urlConError(errorParam));
  }

  if (!code || !state) {
    return redirectResponse(res, urlConError('faltan_parametros'));
  }

  try {
    initAdmin();
  } catch (err) {
    console.error('Error inicializando firebase-admin:', err);
    return redirectResponse(res, urlConError('servidor_no_configurado'));
  }

  const db = getFirestore();

  // Validar state
  const stateRef = db.collection('oauth_states').doc(state);
  const stateSnap = await stateRef.get();
  if (!stateSnap.exists) {
    return redirectResponse(res, urlConError('state_invalido'));
  }
  const stateData = stateSnap.data();

  if (stateData.used) {
    return redirectResponse(res, urlConError('state_ya_usado'));
  }

  const expiresAtMs = stateData.expiresAt?.toMillis
    ? stateData.expiresAt.toMillis()
    : (stateData.expiresAt instanceof Date ? stateData.expiresAt.getTime() : 0);
  if (expiresAtMs && expiresAtMs < Date.now()) {
    return redirectResponse(res, urlConError('state_expirado'));
  }

  if (stateData.proveedor !== 'mp') {
    return redirectResponse(res, urlConError('state_proveedor_invalido'));
  }

  const { consultorioId, callerUid } = stateData;
  if (!consultorioId || !callerUid) {
    return redirectResponse(res, urlConError('state_corrupto'));
  }

  // Marcar state como usado (para que no se reutilice si hay race)
  await stateRef.update({ used: true, usedAt: new Date() });

  // Validar que el consultorio aun existe
  const consRef = db.collection('consultorios').doc(consultorioId);
  const consSnap = await consRef.get();
  if (!consSnap.exists) {
    return redirectResponse(res, urlConError('consultorio_no_existe'));
  }

  // Intercambiar code por tokens
  let tokens;
  try {
    tokens = await intercambiarCodePorTokens({
      code,
      redirectUri: process.env.MP_REDIRECT_URI,
    });
  } catch (err) {
    console.error('Error intercambiando code:', err);
    return redirectResponse(res, urlConError('intercambio_fallido'));
  }

  // Construir mpConfig encriptado
  let mpConfig;
  try {
    mpConfig = buildMpConfig({ tokens, connectedByUid: callerUid });
  } catch (err) {
    console.error('Error encriptando tokens:', err);
    return redirectResponse(res, urlConError('encriptacion_fallida'));
  }

  // Guardar en el consultorio
  try {
    await consRef.update({
      mpIntegrado: true,
      mpConfig,
    });
  } catch (err) {
    console.error('Error guardando mpConfig:', err);
    return redirectResponse(res, urlConError('guardado_fallido'));
  }

  return redirectResponse(res, urlConExito());
}
