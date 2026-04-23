/**
 * Constantes de dominio
 */

/* ============================================================
   Roles
   ============================================================ */
export const ROLES = {
  SUPERADMIN: 'superadmin',   // Jero + Thiago, operadores de la plataforma
  ADMIN: 'admin',             // Dueño de un consultorio
  PROFESIONAL: 'profesional', // Profesional invitado a un consultorio
};

/* ============================================================
   Estados de usuario
   ============================================================ */
export const ESTADOS_USUARIO = {
  ACTIVO: 'activo',
  PENDIENTE: 'pendiente',     // Profesional invitado que aún no fue aceptado por admin
  SUSPENDIDO: 'suspendido',   // Deshabilitado manualmente
};

/* ============================================================
   Planes de consultorio
   ============================================================ */
export const PLANES = {
  FREE: 'free',
  PAGO: 'pago',
};

export const COMISION_POR_PLAN = {
  [PLANES.FREE]: 6, // 6% que se queda ConsulPay
  [PLANES.PAGO]: 2, // 2% que se queda ConsulPay
};

export const PRECIO_MENSUALIDAD_PAGO = 50000; // ARS

/* ============================================================
   Estados de consultorio
   ============================================================ */
export const ESTADOS_CONSULTORIO = {
  ACTIVO: 'activo',
  SUSPENDIDO_POR_SUPER: 'suspendido_por_super', // Si vos/Thiago deshabilitan manualmente
};

/* ============================================================
   Estados de pagos (profesional → consultorio)
   ============================================================ */
export const ESTADOS_PAGO_SESION = {
  DEBIDO: 'debido',
  PAGADO: 'pagado',
};

export const ESTADOS_PAGO = {
  PENDIENTE: 'pendiente',     // Profesional dijo que pagó pero admin aún no confirmó
  CONFIRMADO: 'confirmado',
  RECHAZADO: 'rechazado',
};

export const METODOS_PAGO = {
  TRANSFERENCIA: 'transferencia',
  MERCADOPAGO: 'mercadopago',
  UALA: 'uala',
};

/* ============================================================
   Tipos de método de pago del paciente
   ============================================================ */
export const TIPOS_METODO_PAGO = {
  /** Paciente paga al profesional en el momento (particular, efectivo, etc.) */
  INMEDIATO: 'inmediato',
  /** Obra social / prepaga: el dinero llega meses después, en tandas */
  DIFERIDO: 'diferido',
};

export const LABELS_TIPO_METODO = {
  [TIPOS_METODO_PAGO.INMEDIATO]: 'Pago inmediato',
  [TIPOS_METODO_PAGO.DIFERIDO]: 'Pago diferido (obra social)',
};

/* ============================================================
   Invitaciones a profesionales
   ============================================================ */
export const ESTADOS_INVITACION = {
  PENDIENTE: 'pendiente',
  ACEPTADA: 'aceptada',
  CANCELADA: 'cancelada',
  EXPIRADA: 'expirada',
};

/* ============================================================
   Formateadores regionales (Argentina)
   ============================================================ */
export const formatoARS = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
});

export const formatoFecha = new Intl.DateTimeFormat('es-AR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

export const formatoFechaLarga = new Intl.DateTimeFormat('es-AR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

export const formatoPorcentaje = (n) => `${Math.round(n * 10) / 10}%`;
