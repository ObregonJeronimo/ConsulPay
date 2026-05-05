/**
 * /api/mp/oauth-disconnect
 *
 * Desconecta una cuenta MP del consultorio (un slot especifico).
 *
 * Body: { consultorioId, slot?: 'primary' | 'secondary' }
 * Header: Authorization: Bearer <firebase_id_token>
 *
 * Si no se especifica slot:
 *   - Si solo hay un slot conectado, se desconecta ese.
 *   - Si hay 2 slots conectados, error 400 (debe especificar cual).
 *
 * Implicancias para el sistema:
 *  - Despues de desconectar el ULTIMO slot, los profesionales no
 *    pueden iniciar pagos al consultorio (la UI debe mostrar
 *    'metodo de pago deshabilitado').
 *  - Los pagos en curso quedan en su estado actual; no se cancelan
 *    automaticamente.
 *  - Si se desconecta el secondary y queda solo primary, el reparto
 *    se desactiva automaticamente (vuelve al flow viejo de 1 admin).
 *  - Si se desconecta el primary y hay secondary, el secondary se
 *    "promueve" automaticamente a primary (esto lo hace
 *    buildUpdateParaDesconectarSlot). Asi el codigo legacy que mira
 *    mpConfig sigue funcionando.
 *
 * Los registros historicos de compensaciones (cuando exista esa
 * coleccion) NO se borran al desconectar — se preservan para que el
 * admin pueda ver el historial despues.
 *
 * NO revocamos los tokens viejos en MP. El admin puede revocarlos
 * manualmente desde su panel de MP si quiere.
 */

import { getFirestore } from 'firebase-admin/firestore';

import { asegurarAdminDeConsultorio, verificarAuthHeader } from '../_lib/auth.js';
import { initAdmin } from '../_lib/firebase-admin.js';
import { jsonResponse, readJsonBody } from '../_lib/http.js';
import {
  buildUpdateParaDesconectarSlot,
  contarSlotsConectados,
  leerMpConfigDelSlot,
} from '../_lib/mp-config-helpers.js';

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

  if (slotPedido !== undefined && !SLOTS_VALIDOS.includes(slotPedido)) {
    return jsonResponse(res, 400, {
      error: `Slot invalido. Debe ser uno de: ${SLOTS_VALIDOS.join(', ')}`,
    });
  }

  try {
    await asegurarAdminDeConsultorio({ uid, consultorioId });
  } catch (err) {
    return jsonResponse(res, err.status || 500, { error: err.message });
  }

  const db = getFirestore();
  const consRef = db.collection('consultorios').doc(consultorioId);
  const consSnap = await consRef.get();
  if (!consSnap.exists) {
    return jsonResponse(res, 404, { error: 'El consultorio no existe.' });
  }
  const consData = consSnap.data();

  // Decidir el slot a desconectar
  const slotADesconectar = decidirSlotADesconectar(consData, slotPedido);
  if (!slotADesconectar) {
    return jsonResponse(res, 400, {
      error: 'No hay ninguna cuenta de Mercado Pago conectada para desconectar.',
    });
  }

  if (typeof slotADesconectar === 'object' && slotADesconectar.error) {
    return jsonResponse(res, slotADesconectar.status || 400, {
      error: slotADesconectar.error,
    });
  }

  // Construir el update segun el slot que se desconecta. Esto maneja:
  //   - desconectar primary cuando hay secondary: promueve secondary
  //   - desconectar primary cuando NO hay secondary: limpia legacy
  //   - desconectar secondary: apaga el reparto
  const update = buildUpdateParaDesconectarSlot(slotADesconectar, consData);
  update.mpDesconectadoAt = new Date();
  update.mpDesconectadoPorUid = uid;

  await consRef.update(update);

  return jsonResponse(res, 200, {
    ok: true,
    slotDesconectado: slotADesconectar,
  });
}

/**
 * Decide cual slot desconectar.
 *
 * Reglas:
 *   - Si pidio slot explicito, validamos que ese slot exista y lo
 *     desconectamos.
 *   - Si no pidio slot:
 *     * Si hay 0 slots conectados: null (caller mostrara error)
 *     * Si hay 1 slot conectado: lo desconectamos
 *     * Si hay 2 slots conectados: error 400 (debe especificar cual)
 *
 * @returns {'primary'|'secondary'|null|{error,status}}
 */
function decidirSlotADesconectar(consData, slotPedido) {
  if (slotPedido) {
    if (!leerMpConfigDelSlot(consData, slotPedido)) {
      return {
        error: `El slot ${slotPedido} no tiene ninguna cuenta conectada.`,
        status: 400,
      };
    }
    return slotPedido;
  }

  const total = contarSlotsConectados(consData);
  if (total === 0) return null;

  if (total === 1) {
    if (leerMpConfigDelSlot(consData, 'primary')) return 'primary';
    return 'secondary';
  }

  // total === 2
  return {
    error: 'El consultorio tiene 2 cuentas conectadas. Especificá cual desconectar (primary o secondary).',
    status: 400,
  };
}
