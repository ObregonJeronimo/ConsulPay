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
 *      - leemos el SLOT que se decidio en oauth-init
 *   2. Lo marcamos used=true
 *   3. Intercambiamos code por tokens contra MP
 *   4. Encriptamos access_token + refresh_token
 *   5. Guardamos en /consultorios/{id} en el SLOT correspondiente:
 *        - mpConfigs.{slot} = {...tokens, ownerAdminUid: callerUid}
 *        - Si es primary: tambien sincronizamos mpConfig + mpIntegrado
 *          legacy (compat con codigo viejo)
 *   6. Si se acaba de conectar el SECONDARY (y primary ya estaba),
 *      activamos el reparto: repartoActivado=true,
 *      repartoIniciaEn = el dia 15 del mes siguiente.
 *   7. Redirigimos al admin a /admin/configuracion?mp=connected&slot=...
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
import {
  buildUpdateParaActivarReparto,
  buildUpdateParaGuardarSlot,
  leerMpConfigDelSlot,
} from '../_lib/mp-config-helpers.js';

function urlConError(reason) {
  const base = process.env.APP_BASE_URL || '';
  const params = new URLSearchParams({ mp: 'error', reason });
  return `${base}/admin/configuracion?${params.toString()}`;
}

function urlConExito(slot) {
  const base = process.env.APP_BASE_URL || '';
  const params = new URLSearchParams({ mp: 'connected' });
  if (slot) params.set('slot', slot);
  return `${base}/admin/configuracion?${params.toString()}`;
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

  const { consultorioId, callerUid, slot: slotState } = stateData;
  if (!consultorioId || !callerUid) {
    return redirectResponse(res, urlConError('state_corrupto'));
  }

  // Si el state no tiene slot (states viejos antes del feature), default
  // a primary para compat. Los states viejos tienen TTL 10min asi que
  // este caso es raro pero posible si alguien reabre un tab viejo.
  const slot = slotState === 'secondary' ? 'secondary' : 'primary';

  // Marcar state como usado (para que no se reutilice si hay race)
  await stateRef.update({ used: true, usedAt: new Date() });

  // Validar que el consultorio aun existe
  const consRef = db.collection('consultorios').doc(consultorioId);
  const consSnap = await consRef.get();
  if (!consSnap.exists) {
    return redirectResponse(res, urlConError('consultorio_no_existe'));
  }
  const consDataAntes = consSnap.data();

  // Re-validar que el slot todavia este libre. Por las dudas (race
  // condition) o si alguien abrio el flow desde la UI vieja sin
  // updates entre tabs.
  if (leerMpConfigDelSlot(consDataAntes, slot)) {
    return redirectResponse(res, urlConError('slot_ya_ocupado'));
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

  // Construir mpConfig encriptado, agregando ownerAdminUid (necesario
  // para saber a quien pertenece este slot)
  let mpConfigData;
  try {
    const base = buildMpConfig({ tokens, connectedByUid: callerUid });
    mpConfigData = {
      ...base,
      ownerAdminUid: callerUid,  // este slot le pertenece al admin que lo conecto
      slot,
    };
  } catch (err) {
    console.error('Error encriptando tokens:', err);
    return redirectResponse(res, urlConError('encriptacion_fallida'));
  }

  // Construir el update completo:
  //   - guardar el mpConfig en el slot correspondiente
  //   - si es primary, sincronizar legacy mpConfig + mpIntegrado
  //   - si se acaba de conectar el secondary y el primary ya estaba,
  //     activar el reparto
  const update = buildUpdateParaGuardarSlot(slot, mpConfigData);

  if (slot === 'secondary') {
    const primaryYaEstaba = !!leerMpConfigDelSlot(consDataAntes, 'primary');
    if (primaryYaEstaba) {
      const repartoUpdate = buildUpdateParaActivarReparto(new Date());
      Object.assign(update, repartoUpdate);
    }
  }

  // Guardar
  try {
    await consRef.update(update);
  } catch (err) {
    console.error('Error guardando mpConfig:', err);
    return redirectResponse(res, urlConError('guardado_fallido'));
  }

  return redirectResponse(res, urlConExito(slot));
}
