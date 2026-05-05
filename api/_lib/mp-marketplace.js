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

/**
 * Busca pagos en MP filtrando por rango de fechas.
 *
 * Usado por el panel de reparto entre socias para ver cuanto cobro
 * cada cuenta MP en un ciclo dado (15 al 14 del mes siguiente).
 *
 * Filtros que aplicamos:
 *   - range = date_created (cuando se creo el pago)
 *   - status = approved (solo pagos aprobados; los pending/rejected
 *     no cuentan para el reparto)
 *   - limit = 100, offset = 0 (paginar manualmente si hace falta)
 *
 * MP API: GET /v1/payments/search
 *
 * @param {Object} params
 * @param {string} params.accessToken - access_token del slot consultado
 * @param {Date}   params.desde - inicio del rango (inclusive)
 * @param {Date}   params.hasta - fin del rango (inclusive)
 * @param {number} [params.limit=100] - max resultados (max 100 segun MP)
 * @param {number} [params.offset=0] - paginacion
 * @returns {Promise<{
 *   results: Array,
 *   paging: { total, limit, offset }
 * }>}
 */
export async function searchPagosMP({
  accessToken,
  desde,
  hasta,
  limit = 100,
  offset = 0,
}) {
  if (!accessToken) throw new Error('accessToken requerido');
  if (!(desde instanceof Date)) throw new Error('desde debe ser Date');
  if (!(hasta instanceof Date)) throw new Error('hasta debe ser Date');
  if (desde > hasta) throw new Error('desde debe ser <= hasta');

  // MP usa formato ISO 8601 con offset (ej: 2025-07-15T00:00:00.000-03:00)
  // Pero acepta tambien Z (UTC). Usamos UTC porque los Date de JS lo
  // hacen mas predecible.
  const beginDate = desde.toISOString();
  const endDate = hasta.toISOString();

  const params = new URLSearchParams({
    sort: 'date_created',
    criteria: 'desc',
    range: 'date_created',
    begin_date: beginDate,
    end_date: endDate,
    status: 'approved',
    limit: String(limit),
    offset: String(offset),
  });

  const url = `${MP_BASE}/v1/payments/search?${params.toString()}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.message || `MP devolvio ${res.status}`;
    const err = new Error(`Error buscando pagos: ${msg}`);
    err.mpStatus = res.status;
    throw err;
  }

  return {
    results: Array.isArray(data.results) ? data.results : [],
    paging: data.paging || { total: 0, limit, offset },
  };
}
