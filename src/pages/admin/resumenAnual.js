/*
  Piezas compartidas por las dos matrices anuales del panel del admin:
  ResumenProfesionales (profesionales × meses) y ResumenPacientes
  (pacientes × meses de un profesional).

  Las dos leen las mismas sesiones, clasifican cada celda con el mismo
  criterio y se pintan con el mismo CSS (cp-rp__*). Vivían duplicadas en
  el primer componente; al agregar el segundo se movieron acá para que
  no puedan divergir: si mañana cambia qué cuenta como "a liquidar",
  tiene que cambiar en un solo lugar.
*/

export const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** La fecha de una sesión, venga como Timestamp, {seconds} o Date. */
export function fechaDeSesion(s) {
  const f = s?.fecha;
  if (!f) return null;
  if (f.toDate) return f.toDate();
  if (f.seconds !== undefined) return new Date(f.seconds * 1000);
  const d = new Date(f);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 45.200 → "45 mil". Sin esto no entran doce columnas en una pantalla. */
export function montoCompacto(n) {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1).replace('.', ',')} M`;
  if (n >= 1000) return `${Math.round(n / 1000)} mil`;
  return String(n);
}

/** Celda vacía de la matriz: doce por fila. */
export function celdaVacia() {
  return { debe: 0, porLiquidar: 0, encuentros: 0, registros: 0 };
}

/**
 * Suma una sesión a la celda que le toca y devuelve cuánto se agregó a la
 * deuda, para que quien llame lo acumule en el total de su fila.
 *
 * Una sesión de obra social sin monto NO suma deuda: todavía no se sabe
 * cuánto va a liquidar. Se cuenta aparte como "a liquidar" para que la
 * celda no parezca saldada.
 */
export function acumularSesion(celda, sesion, cantidadSesiones, ESTADOS) {
  celda.registros += 1;
  celda.encuentros += cantidadSesiones;

  if (sesion.estadoPago === ESTADOS.PENDIENTE_MONTO) {
    celda.porLiquidar += 1;
    return 0;
  }
  if (sesion.estadoPago === ESTADOS.DEBIDO) {
    const monto = sesion.montoConsultorio || 0;
    celda.debe += monto;
    return monto;
  }
  return 0;
}
