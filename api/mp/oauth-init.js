/**
 * /api/mp/oauth-init
 *
 * Inicia el flow OAuth de Mercado Pago para vincular la cuenta del
 * admin del consultorio.
 *
 * Flujo:
 *  1. El frontend llama acá con un Firebase ID token (header Authorization)
 *     y consultorioId + slot (opcional) en el body.
 *  2. Validamos auth + que sea admin del consultorio.
 *  3. Decidimos a que slot va: si el body especifica slot lo usamos,
 *     sino se asigna automaticamente el primer slot libre (primary
 *     si esta libre, sino secondary). Si ambos estan ocupados, error.
 *  4. Generamos un state random unico y lo guardamos en Firestore con
 *     TTL de 10 min en /oauth_states/{state} junto con consultorioId,
 *     callerUid Y SLOT.
 *  5. Devolvemos { authorizeUrl } al frontend, que redirige al usuario.
 *
 * El state previene CSRF y vincula el callback al admin/consultorio
 * que inicio el flow, ademas del slot al que se va a guardar el token.
 *
 * SLOTS
 * ----------------------------------------------------------------
 * El sistema soporta hasta 2 cuentas MP por consultorio. Cada una
 * vive en un "slot": primary o secondary. Cuando hay 2 admins en el
 * consultorio y ambos conectan su MP, el sistema activa el flow de
 * "reparto entre socias" con rotacion del 15 al 14 de cada mes.
 *
 * Si el caller no especifica slot:
 *   - Si el slot 'primary' esta vacio, va a primary
 *   - Sino si secondary esta vacio, va a secondary
 *   - Sino, error 409 (no hay slot libre)
 *
 * Si el caller especifica slot, validamos:
 *   - El valor sea 'primary' o 'secondary'
 *   - Ese slot no este ya conectado (sino tiene que desconectar primero)
 *
 * NOTA sobre la pantalla "invalid session" de MP:
 * Si el user llega al authorize sin sesion MP activa y le da
 * "Autorizar", MP devuelve un opaco {"code":"unauthorized","message":
 * "invalid session"}. La prevencion la maneja el frontend con un modal
 * preventivo que avisa al user que se loguee en MP antes de continuar.
 *
 * Body:  { consultorioId: string, slot?: 'primary' | 'secondary' }
 * Header: Authorization: Bearer <firebase_id_token>
 * Devuelve: { authorizeUrl: string, slot: string }
 */

import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { randomBytes } from 'crypto';

import { asegurarAdminDeConsultorio, verificarAuthHeader } from '../_lib/auth.js';
import { initAdmin } from '../_lib/firebase-admin.js';
import { jsonResponse, readJsonBody } from '../_lib/http.js';
import { leerMpConfigDelSlot } from '../_lib/mp-config-helpers.js';

const MP_AUTHORIZE_URL = 'https://auth.mercadopago.com.ar/authorization';
const SLOTS_VALIDOS = ['primary', 'secondary'];

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

  const { consultorioId, slot: slotPedido } = body;
  if (!consultorioId) {
    return jsonResponse(res, 400, { error: 'consultorioId requerido.' });
  }

  // Validar slot si lo mandaron
  if (slotPedido !== undefined && !SLOTS_VALIDOS.includes(slotPedido)) {
    return jsonResponse(res, 400, {
      error: `Slot invalido. Debe ser uno de: ${SLOTS_VALIDOS.join(', ')}`,
    });
  }

  // Validar que el caller sea admin del consultorio
  try {
    await asegurarAdminDeConsultorio({ uid, consultorioId });
  } catch (err) {
    return jsonResponse(res, err.status || 500, { error: err.message });
  }

  const db = getFirestore();

  // Decidir el slot final segun lo pedido y el estado actual del consultorio
  let slotFinal;
  try {
    slotFinal = await decidirSlot({ db, consultorioId, slotPedido });
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

  // Persistir state con TTL — incluye el slot al que se va a guardar
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutos
  await db.collection('oauth_states').doc(state).set({
    consultorioId,
    callerUid: uid,
    slot: slotFinal,
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

  return jsonResponse(res, 200, { authorizeUrl, slot: slotFinal });
}

/**
 * Decide a que slot va el OAuth segun lo pedido por el caller y lo
 * que esta actualmente conectado.
 *
 * Reglas:
 *   - Si el caller pide slot explicito: validamos que ese slot este
 *     vacio (sino tiene que desconectar primero)
 *   - Si el caller no pide slot: asignamos automatico al primer slot
 *     libre (primary > secondary)
 *   - Si todos los slots estan ocupados: error 409
 *
 * @returns {'primary'|'secondary'} el slot final
 * @throws {Error & {status: number}} con status 4xx para errores del cliente
 */
async function decidirSlot({ db, consultorioId, slotPedido }) {
  const consSnap = await db.collection('consultorios').doc(consultorioId).get();
  if (!consSnap.exists) {
    const err = new Error('El consultorio no existe.');
    err.status = 404;
    throw err;
  }
  const consData = consSnap.data();

  const primaryConectado = !!leerMpConfigDelSlot(consData, 'primary');
  const secondaryConectado = !!leerMpConfigDelSlot(consData, 'secondary');

  if (slotPedido === 'primary') {
    if (primaryConectado) {
      const err = new Error(
        'El slot principal ya tiene una cuenta de Mercado Pago conectada. ' +
        'Desconectala primero si querés cambiarla.'
      );
      err.status = 409;
      throw err;
    }
    return 'primary';
  }

  if (slotPedido === 'secondary') {
    if (secondaryConectado) {
      const err = new Error(
        'El slot secundario ya tiene una cuenta de Mercado Pago conectada. ' +
        'Desconectala primero si querés cambiarla.'
      );
      err.status = 409;
      throw err;
    }
    // Si pidieron secondary pero primary esta vacio, redirigimos a
    // primary porque no tiene sentido dejar primary vacio.
    if (!primaryConectado) {
      return 'primary';
    }
    return 'secondary';
  }

  // Slot no pedido: asignacion automatica
  if (!primaryConectado) return 'primary';
  if (!secondaryConectado) return 'secondary';

  const err = new Error(
    'El consultorio ya tiene 2 cuentas de Mercado Pago conectadas. ' +
    'Para conectar otra, primero desconectá una.'
  );
  err.status = 409;
  throw err;
}
