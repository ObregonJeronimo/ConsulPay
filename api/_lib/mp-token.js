/**
 * Cliente de Mercado Pago (lado servidor).
 *
 * Maneja:
 *  - Intercambio de authorization code por tokens (OAuth)
 *  - Refresh de access token cuando esta proximo a vencer
 *  - Traer info del usuario MP autenticado
 *
 * Toda la comunicacion con MP es HTTPS contra api.mercadopago.com.
 */

import { decrypt, encrypt } from './encryption.js';

const MP_BASE = 'https://api.mercadopago.com';
const REFRESH_THRESHOLD_DAYS = 7; // si vence en menos de N dias, refrescar antes de usar

/* ============================================================
   OAuth: intercambiar code por access_token + refresh_token
   ============================================================ */

/**
 * Intercambia el authorization code recibido en el callback por
 * tokens de acceso. Es la primera vez que el consultorio obtiene
 * tokens (no hay refresh todavia).
 *
 * Devuelve los datos del token + datos del user MP que autorizo.
 */
export async function intercambiarCodePorTokens({ code, redirectUri }) {
  const clientId = process.env.MP_CLIENT_ID;
  const clientSecret = process.env.MP_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('MP_CLIENT_ID o MP_CLIENT_SECRET no configurados.');
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
  });

  const res = await fetch(`${MP_BASE}/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
    },
    body: body.toString(),
  });

  const data = await res.json();
  if (!res.ok) {
    const msg = data?.message || data?.error_description || `MP devolvio ${res.status}`;
    throw new Error(`Error intercambiando code: ${msg}`);
  }

  // Validamos que vengan los campos minimos
  if (!data.access_token || !data.refresh_token || !data.user_id) {
    throw new Error('Respuesta de MP incompleta (faltan access_token / refresh_token / user_id).');
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    publicKey: data.public_key,
    userIdMP: data.user_id,
    scopes: data.scope,
    livemode: data.live_mode === true || data.live_mode === 'true',
    expiresIn: data.expires_in, // segundos
  };
}

/**
 * Refresca el access_token usando el refresh_token guardado.
 * Devuelve los nuevos tokens (incluido un nuevo refresh_token, MP rota).
 */
export async function refrescarAccessToken({ refreshToken }) {
  const clientId = process.env.MP_CLIENT_ID;
  const clientSecret = process.env.MP_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('MP_CLIENT_ID o MP_CLIENT_SECRET no configurados.');
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });

  const res = await fetch(`${MP_BASE}/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
    },
    body: body.toString(),
  });

  const data = await res.json();
  if (!res.ok) {
    const msg = data?.message || data?.error_description || `MP devolvio ${res.status}`;
    throw new Error(`Error refrescando token: ${msg}`);
  }

  if (!data.access_token || !data.refresh_token) {
    throw new Error('Respuesta de MP incompleta al refrescar.');
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    publicKey: data.public_key,
    livemode: data.live_mode === true || data.live_mode === 'true',
  };
}

/* ============================================================
   Persistencia de mpConfig en Firestore (encriptado)
   ============================================================ */

/**
 * Construye el objeto mpConfig que se guarda en /consultorios/{id}.
 * accessToken y refreshToken se encriptan; el resto va en claro.
 */
export function buildMpConfig({ tokens, connectedByUid }) {
  const now = Date.now();
  const expiresAtMs = now + (tokens.expiresIn * 1000);
  return {
    accessTokenEnc: encrypt(tokens.accessToken),
    refreshTokenEnc: encrypt(tokens.refreshToken),
    publicKey: tokens.publicKey || null,
    userIdMP: String(tokens.userIdMP),
    scopes: tokens.scopes || null,
    livemode: !!tokens.livemode,
    expiresAt: new Date(expiresAtMs),
    connectedAt: new Date(now),
    connectedByUid,
  };
}

/**
 * Dado el mpConfig actual de un consultorio, decide si hay que refrescar
 * y si si, hace el refresh. Devuelve el accessToken vigente (en claro,
 * solo en memoria del backend) y, si refresco, el nuevo mpConfig para
 * persistir.
 *
 * @returns {{ accessToken: string, mpConfigActualizado?: object }}
 */
export async function asegurarAccessTokenVigente(mpConfig) {
  if (!mpConfig?.accessTokenEnc || !mpConfig?.refreshTokenEnc) {
    throw new Error('mpConfig invalido: falta accessTokenEnc o refreshTokenEnc.');
  }

  const expiresAtMs = mpConfig.expiresAt?.toMillis
    ? mpConfig.expiresAt.toMillis()
    : (mpConfig.expiresAt instanceof Date ? mpConfig.expiresAt.getTime() : null);

  if (!expiresAtMs) {
    throw new Error('mpConfig sin expiresAt valido.');
  }

  const ahora = Date.now();
  const umbralMs = REFRESH_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;
  const necesitaRefresh = (expiresAtMs - ahora) < umbralMs;

  if (!necesitaRefresh) {
    // Token vigente, lo desencriptamos y devolvemos
    const accessToken = decrypt(mpConfig.accessTokenEnc);
    return { accessToken };
  }

  // Refrescar
  const refreshToken = decrypt(mpConfig.refreshTokenEnc);
  const nuevos = await refrescarAccessToken({ refreshToken });

  const nuevosExpiresAt = new Date(ahora + (nuevos.expiresIn * 1000));
  const mpConfigActualizado = {
    ...mpConfig,
    accessTokenEnc: encrypt(nuevos.accessToken),
    refreshTokenEnc: encrypt(nuevos.refreshToken),
    publicKey: nuevos.publicKey || mpConfig.publicKey,
    livemode: !!nuevos.livemode,
    expiresAt: nuevosExpiresAt,
    refreshedAt: new Date(ahora),
  };

  return {
    accessToken: nuevos.accessToken,
    mpConfigActualizado,
  };
}
