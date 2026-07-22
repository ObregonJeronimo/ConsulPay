/**
 * Constantes de dominio
 */

/* ============================================================
   Roles
   ============================================================ */
export const ROLES = {
  SUPERADMIN: 'superadmin',   // Jero + Thiago, operadores de la plataforma
  ADMIN: 'admin',             // Dueño de un consultorio
  COADMIN: 'coadmin',         // Co-admin: mismos permisos que admin, sin reparto
  PROFESIONAL: 'profesional', // Profesional invitado a un consultorio
};

/* ============================================================
   Modelo de reparto del consultorio
   ----------------------------------------------------------------
   Define cómo circula el dinero dentro del consultorio. Se elige al
   crearlo y condiciona el comportamiento de los paneles.

   - PROFESIONAL_PAGA (modelo clásico, default histórico):
       cliente → profesional → consultorio.
       El paciente le paga al profesional; el profesional le transfiere
       al consultorio la parte que corresponde. Tanto admin como
       profesional pueden registrar sesiones, y el profesional paga sus
       sesiones desde su panel.

   - RECEPCION_COBRA (modelo nuevo):
       cliente → recepción → profesionales.
       El paciente le paga a la recepción (el admin), que guarda el dinero
       en caja y luego reparte a cada profesional. El profesional NO paga
       sesiones (no existe ese flujo) y NO registra sesiones: solo el admin
       las crea. El profesional ve cuánto le corresponde y cuándo lo recibió.

   Los consultorios creados antes de este campo se asumen PROFESIONAL_PAGA.
   ============================================================ */
export const MODELOS_REPARTO = {
  PROFESIONAL_PAGA: 'profesional_paga',
  RECEPCION_COBRA: 'recepcion_cobra',
};

/** Valor por defecto para consultorios sin el campo (retrocompatibilidad). */
export const MODELO_REPARTO_DEFAULT = MODELOS_REPARTO.PROFESIONAL_PAGA;

/**
 * Helper: devuelve el modelo de reparto de un consultorio, con fallback
 * al modelo clásico si el campo no existe (consultorios previos).
 */
export function getModeloReparto(consultorio) {
  return consultorio?.modeloReparto || MODELO_REPARTO_DEFAULT;
}

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
  PRO: 'pro',
  // Plan Ultra: variante no publica, activada por superadmin para
  // consultorios especificos (acuerdos puntuales). Tiene comision
  // configurable por consultorio (comisionUltra). No aparece en la
  // landing publica ni en la comparativa de planes a menos que el
  // consultorio tenga puedeVerPlanUltra=true o ya este en Ultra.
  ULTRA: 'ultra',
};

export const COMISION_POR_PLAN = {
  [PLANES.FREE]: 1,   // 1% (modelo 2026)
  [PLANES.PRO]: 0.5,  // 0.5% (modelo 2026)
  // ULTRA es por consultorio, no tiene default global.
};

export const PRECIO_MENSUALIDAD_PAGO = 100000; // ARS

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
  /** Sesion creada con metodo diferido (obra social) sin valor cargado.
   *  No suma al cobro pendiente del profesional hasta que se liquide
   *  el monto via el flow "Liquidar monto" (boton tilde en la lista). */
  PENDIENTE_MONTO: 'pendiente_monto',
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
  CREAR: 'crear',
  MODIFICAR: 'modificar',
  ELIMINAR: 'eliminar',
  LIQUIDAR_MONTO: 'liquidar_monto',
  CARGA_RAPIDA: 'carga_rapida',
  CREAR_PACIENTE: 'crear_paciente',
  MARCAR_PAGADA: 'marcar_pagada',
  LIQUIDAR_OS: 'liquidar_os',
};

export const ESTADOS_SOLICITUD_SESION = {
  PENDIENTE: 'pendiente',
  APROBADA: 'aprobada',
  RECHAZADA: 'rechazada',
  OBSOLETA: 'obsoleta',
};

export const LABELS_TIPO_SOLICITUD = {
  [TIPOS_SOLICITUD_SESION.CREAR]: 'Crear sesión',
  [TIPOS_SOLICITUD_SESION.MODIFICAR]: 'Modificar sesión',
  [TIPOS_SOLICITUD_SESION.ELIMINAR]: 'Eliminar sesión',
  [TIPOS_SOLICITUD_SESION.LIQUIDAR_MONTO]: 'Liquidar monto obra social',
  [TIPOS_SOLICITUD_SESION.CARGA_RAPIDA]: 'Carga rápida',
  [TIPOS_SOLICITUD_SESION.CREAR_PACIENTE]: 'Nuevo paciente',
  [TIPOS_SOLICITUD_SESION.MARCAR_PAGADA]: 'Marcar como pagada',
  [TIPOS_SOLICITUD_SESION.LIQUIDAR_OS]: 'Liquidar obra social',
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
