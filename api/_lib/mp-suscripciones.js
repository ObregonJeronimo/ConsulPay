/**
 * Helper para gestionar suscripciones recurrentes en Mercado Pago
 * (preapproval). Usado para el Plan Pro de ConsulPay ($50.000/mes).
 *
 * Como funciona:
 *  - Creamos una "preapproval" (autorizacion de débito recurrente)
 *  - El user va a la URL `init_point` que MP nos devuelve, mete su
 *    tarjeta de credito, y autoriza el cobro recurrente.
 *  - MP empieza a cobrar el monto pactado cada `frequency` periodos.
 *  - Cada vez que MP intenta un cobro, manda webhook con el resultado.
 *  - Podemos cancelar/pausar/modificar via PUT sobre el preapproval.
 *
 * IMPORTANTE: las suscripciones NO usan marketplace_fee.
 * El dinero va DIRECTO a la cuenta MP del access_token usado en la
 * llamada (en nuestro caso, la cuenta de Jero/ConsulPay).
 *
 * Diferencia con /pagos_consultorio:
 *  - pagos_consultorio: profesional → consultorio (split, marketplace_fee)
 *  - pagos_mensualidad: consultorio → ConsulPay (sin split)
 *
 * Docs MP:
 *  https://www.mercadopago.com.ar/developers/es/reference/subscriptions/_preapproval/post
 */

const MP_BASE = 'https://api.mercadopago.com';

/**
 * Crea una preapproval (suscripcion recurrente) en MP.
 *
 * Devuelve el id del preapproval y la URL `init_point` a la que hay
 * que mandar al user para que autorice el debito recurrente.
 *
 * @param {Object} params
 * @param {string} params.accessToken - Access token de la cuenta MP que recibe el cobro (Jero)
 * @param {string} params.payerEmail - Email del que paga (admin del consultorio)
 * @param {number} params.transactionAmount - Monto a cobrar cada periodo (ARS)
 * @param {number} params.frequency - Cantidad de unidades de tiempo entre cobros (ej 1)
 * @param {string} params.frequencyType - 'days' | 'months' (ej 'months')
 * @param {string} params.reason - Descripcion visible al user (ej "ConsulPay Plan Pro")
 * @param {string} params.externalReference - ID interno (consultorioId)
 * @param {string} params.backUrl - URL adonde MP redirige al user despues de autorizar
 * @param {string} [params.notificationUrl] - URL del webhook
 * @param {Date} [params.startDate] - Fecha del primer cobro (default: ahora)
 * @returns {Promise<{id, init_point, status}>}
 */
export async function crearPreapproval({
  accessToken,
  payerEmail,
  transactionAmount,
  frequency,
  frequencyType,
  reason,
  externalReference,
  backUrl,
  notificationUrl,
  startDate,
}) {
  if (!accessToken) throw new Error('accessToken requerido');
  if (!payerEmail) throw new Error('payerEmail requerido');
  if (typeof transactionAmount !== 'number' || transactionAmount <= 0) {
    throw new Error('transactionAmount invalido');
  }
  if (!externalReference) throw new Error('externalReference requerido');
  if (!backUrl) throw new Error('backUrl requerido');

  const body = {
    reason: reason || 'Suscripcion ConsulPay',
    external_reference: externalReference,
    payer_email: payerEmail,
    back_url: backUrl,
    auto_recurring: {
      frequency: frequency || 1,
      frequency_type: frequencyType || 'months',
      transaction_amount: Number(transactionAmount.toFixed(2)),
      currency_id: 'ARS',
    },
    // status='authorized' arranca activo; 'pending' espera autorizacion
    status: 'pending',
  };

  if (startDate) {
    body.auto_recurring.start_date = startDate.toISOString();
  }

  if (notificationUrl) {
    body.notification_url = notificationUrl;
  }

  const res = await fetch(`${MP_BASE}/preapproval`, {
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
    const msg = data?.message || data?.error || `MP /preapproval devolvio ${res.status}`;
    const err = new Error(`Error creando preapproval: ${msg}`);
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
    status: data.status,
  };
}

/**
 * Lee el estado actual de un preapproval. Usado por el webhook para
 * confirmar que el preapproval realmente existe y esta en el estado
 * que dice MP.
 */
export async function getPreapproval({ accessToken, preapprovalId }) {
  if (!accessToken) throw new Error('accessToken requerido');
  if (!preapprovalId) throw new Error('preapprovalId requerido');

  const res = await fetch(`${MP_BASE}/preapproval/${preapprovalId}`, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.message || `MP devolvio ${res.status}`;
    const err = new Error(`Error consultando preapproval: ${msg}`);
    err.mpStatus = res.status;
    err.mpResponse = data;
    throw err;
  }

  return data;
}

/**
 * Cancela un preapproval (deja de cobrar).
 *
 * Importante: cancelar la suscripcion en MP NO le quita acceso al
 * user inmediatamente. El user mantiene los beneficios hasta el final
 * del periodo que ya pago. Eso lo maneja el cron diario en nuestra
 * logica.
 */
export async function cancelarPreapproval({ accessToken, preapprovalId }) {
  if (!accessToken) throw new Error('accessToken requerido');
  if (!preapprovalId) throw new Error('preapprovalId requerido');

  const res = await fetch(`${MP_BASE}/preapproval/${preapprovalId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ status: 'cancelled' }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.message || `MP devolvio ${res.status}`;
    const err = new Error(`Error cancelando preapproval: ${msg}`);
    err.mpStatus = res.status;
    err.mpResponse = data;
    throw err;
  }

  return data;
}

/**
 * Lee un authorized_payment (un cobro individual de un preapproval).
 *
 * Cuando MP intenta cobrar la mensualidad y nos manda webhook, el
 * webhook viene con un id que corresponde a un authorized_payment,
 * no a un preapproval. Este helper trae el detalle del cobro
 * individual (status, amount, date, etc).
 */
export async function getAuthorizedPayment({ accessToken, authorizedPaymentId }) {
  if (!accessToken) throw new Error('accessToken requerido');
  if (!authorizedPaymentId) throw new Error('authorizedPaymentId requerido');

  const res = await fetch(
    `${MP_BASE}/authorized_payments/${authorizedPaymentId}`,
    {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.message || `MP devolvio ${res.status}`;
    const err = new Error(`Error consultando authorized_payment: ${msg}`);
    err.mpStatus = res.status;
    err.mpResponse = data;
    throw err;
  }

  return data;
}
