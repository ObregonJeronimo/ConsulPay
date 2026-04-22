/**
 * Constantes de la app
 */

export const ROLES = {
  ADMIN: 'admin',
  PROFESIONAL: 'profesional',
};

export const ESTADOS_USUARIO = {
  PENDIENTE: 'pendiente',
  APROBADO: 'aprobado',
  RECHAZADO: 'rechazado',
  SUSPENDIDO: 'suspendido',
};

export const ESTADOS_PAGO_SESION = {
  DEBIDO: 'debido',
  PAGADO: 'pagado',
};

export const ESTADOS_PAGO = {
  PENDIENTE: 'pendiente',
  CONFIRMADO: 'confirmado',
  RECHAZADO: 'rechazado',
};

export const METODOS_PAGO = {
  TRANSFERENCIA: 'transferencia',
  MERCADOPAGO: 'mercadopago',
  UALA: 'uala',
};

/** Formateador de moneda ARS */
export const formatoARS = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
});

/** Formateador de fecha corta */
export const formatoFecha = new Intl.DateTimeFormat('es-AR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});
