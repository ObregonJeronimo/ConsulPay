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
  RETIRADO: 'retirado',       // Profesional que dejó el consultorio (soft-delete).
                              // Sus registros historicos (sesiones, pagos) se preservan.
                              // No puede crear nuevas sesiones ni iniciar sesion en el panel.
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

export const ESTADOS_PACIENTE = {
  ACTIVO: 'activo',
  ARCHIVADO: 'archivado',
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
   Solicitudes de modificacion de sesiones (Fase B de sesiones)
   ----------------------------------------------------------------
   Cuando un profesional NO tiene confianza (permitirEdicionSesiones
   = false) sus acciones sobre sesiones generan una solicitud que
   queda pendiente hasta que el admin la apruebe o rechace.
   ============================================================ */
export const TIPOS_SOLICITUD_SESION = {
  CREAR: 'crear',           // Crear una sesion nueva
  MODIFICAR: 'modificar',   // Modificar una sesion existente
  ELIMINAR: 'eliminar',     // Eliminar una sesion
};

export const ESTADOS_SOLICITUD_SESION = {
  PENDIENTE: 'pendiente',     // Esperando que el admin la resuelva
  APROBADA: 'aprobada',       // Admin la acepto y se aplico
  RECHAZADA: 'rechazada',     // Admin la rechazo (con motivo opcional)
  OBSOLETA: 'obsoleta',       // La sesion fue modificada/eliminada por otro
                              //  camino antes de que el admin resolviera
};

export const LABELS_TIPO_SOLICITUD = {
  [TIPOS_SOLICITUD_SESION.CREAR]: 'Crear sesión',
  [TIPOS_SOLICITUD_SESION.MODIFICAR]: 'Modificar sesión',
  [TIPOS_SOLICITUD_SESION.ELIMINAR]: 'Eliminar sesión',
};

/* ============================================================
   Logs de auditoria de sesiones (Fase C de sesiones)
   ============================================================ */
export const TIPOS_LOG_SESION = {
  CREADA: 'creada',
  MODIFICADA: 'modificada',
  ELIMINADA: 'eliminada',
  ESTADO_PAGO: 'estado_pago',          // Cambio de pagada/debida
  SOLICITUD_CREADA: 'solicitud_creada',
  SOLICITUD_APROBADA: 'solicitud_aprobada',
  SOLICITUD_RECHAZADA: 'solicitud_rechazada',
  SOLICITUD_OBSOLETA: 'solicitud_obsoleta',
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
