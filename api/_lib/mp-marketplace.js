/**
 * Helper para crear preferencias de pago en Mercado Pago con
 * marketplace_fee (split de pagos).
 *
 * Como funciona:
 *  - El profesional paga X pesos.
 *  - Mercado Pago acredita (X - marketplace_fee) en la cuenta MP del
 *    consultorio (la que hizo OAuth).
 *  - El marketplace_fee cae en la cuenta MP de la app consulpay
 *    (la que creo la app y tiene el access_token de la app).
 *
 * Para que funcione marketplace_fee la app debe tener permisos OAuth
 * y el access_token usado debe ser el del consultorio (vendedor),
 * NO el del app owner (consulpay).
 */

const MP_BASE = 'https://api.mercadopago.com';

/**
 * Crea una preferencia de pago en MP.
 *
 * @param {Object} params
 * @param {string} params.accessToken - Access token del consultorio (vendedor)
 * @param {Array} params.items - Items a cobrar [{title, quantity, unit_price, currency_id}]
 * @param {number} params.marketplaceFee - Comision en pesos (lo que se queda ConsulPay)
 * @param {string} params.externalReference - ID interno del pago (pagoConsultorioId)
 * @param {string} params.notificationUrl - URL del webhook (publica, https)
 * @param {Object} params.backUrls - {success, failure, pending} URLs de retorno
 * @param {string} params.payerEmail - Email del profesional (opcional, prellena el checkout)
 * @returns {Promise<{id, init_point, sandbox_init_point}>}
 */
export async function crearPreferencia({
  accessToken,
  items,
  marketplaceFee,
  externalReference,
  notificationUrl,
  backUrls,
  payerEmail,
}) {
  if (!accessToken) throw new Error('accessToken requerido');
  if (!Array.isArray(items) || items.length === 0) throw new Error('items requerido');
  if (typeof marketplaceFee !== 'number' || marketplaceFee < 0) {
    throw new Error('marketplaceFee invalido');
  }
  if (!externalReference) throw new Error('externalReference requerido');

  const body = {
    items,
    marketplace_fee: Number(marketplaceFee.toFixed(2)),
    external_reference: externalReference,
    // auto_return: que el checkout vuelva al sitio sin que el user toque "Volver"
    auto_return: 'approved',
  };

  if (notificationUrl) {
    body.notification_url = notificationUrl;
  }

  if (backUrls) {
    body.back_urls = {
      success: backUrls.success,
      failure: backUrls.failure,
      pending: backUrls.pending,
    };
  }

  if (payerEmail) {
    body.payer = { email: payerEmail };
  }

  const res = await fetch(`${MP_BASE}/checkout/preferences`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.message
      || data?.error
      || `MP /checkout/preferences devolvio ${res.status}`;
    const err = new Error(`Error creando preferencia: ${msg}`);
    err.mpResponse = data;
    err.mpStatus = res.status;
    throw err;
  }

  if (!data.id || !data.init_point) {
    throw new Error('MP devolvio respuesta incompleta (sin id o init_point).');
  }

  return {
    id: data.id,
    init_point: data.init_point,
    sandbox_init_point: data.sandbox_init_point,
  };
}

/**
 * Trae los detalles de un pago MP por ID. Usado por el webhook para
 * verificar que el pago realmente exista y este en el estado declarado.
 *
 * No confiamos solo en el body del webhook (puede ser falsificado o
 * cachear datos viejos). Hacemos fetch fresco contra la API.
 *
 * @param {string} accessToken - Access token del consultorio
 * @param {string} paymentId - ID del pago MP
 */
export async function getPagoMP({ accessToken, paymentId }) {
  if (!accessToken) throw new Error('accessToken requerido');
  if (!paymentId) throw new Error('paymentId requerido');

  const res = await fetch(`${MP_BASE}/v1/payments/${paymentId}`, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.message || `MP devolvio ${res.status}`;
    const err = new Error(`Error consultando pago: ${msg}`);
    err.mpStatus = res.status;
    throw err;
  }

  return data;
}
