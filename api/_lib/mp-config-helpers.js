/**
 * Helpers para el manejo de las cuentas MP del consultorio.
 *
 * MODELO DE DATOS (transicional, soporta el flow viejo y el nuevo)
 * ----------------------------------------------------------------
 * Un consultorio tiene 1 o 2 admins. Cada admin puede conectar SU
 * cuenta MP. Hasta 2 cuentas conectadas en total.
 *
 * Schema en Firestore:
 *
 *   consultorios/{id}
 *     // ---- LEGACY (se sigue usando si solo hay 1 admin con MP) ----
 *     mpIntegrado: boolean
 *     mpConfig: {
 *       accessTokenEnc, refreshTokenEnc, userIdMP, expiresAt,
 *       connectedAt, connectedByUid, livemode, scopes, publicKey
 *     }
 *
 *     // ---- NUEVO (cuando hay 2 admins con MP conectadas) ----
 *     mpConfigs: {
 *       primary:   { ...mpConfig, ownerAdminUid },
 *       secondary: { ...mpConfig, ownerAdminUid },
 *     }
 *     repartoActivado: boolean
 *     repartoIniciaEn: Timestamp  // el dia 15 del mes en que arranca la rotacion
 *
 * REGLA DE ROTACION
 * ----------------------------------------------------------------
 * Los ciclos van del 15 al 14 del mes siguiente.
 *   Ciclo 0: 15-jul al 14-ago → primary cobra
 *   Ciclo 1: 15-ago al 14-sep → secondary cobra
 *   Ciclo 2: 15-sep al 14-oct → primary cobra
 *   ... y asi alternando.
 *
 * Si fecha < repartoIniciaEn, no hay rotacion: cobra siempre primary
 * (que es el slot del admin original/legacy).
 *
 * COMPATIBILIDAD HACIA ATRAS
 * ----------------------------------------------------------------
 * Si el consultorio tiene mpConfig (legacy) pero no mpConfigs.primary,
 * lo tratamos como si tuviera mpConfigs.primary = mpConfig. Esto
 * permite que el codigo nuevo funcione sin necesidad de migrar
 * datos existentes — la migracion ocurre lazy cuando el segundo admin
 * intenta conectarse.
 */

import { Timestamp } from 'firebase-admin/firestore';

import { asegurarAccessTokenVigente } from './mp-token.js';

/* ============================================================
   Lectura de slots
   ============================================================ */

/**
 * Devuelve el mpConfig del slot dado, con fallback a legacy mpConfig
 * si el slot pedido es 'primary' y no existe mpConfigs.primary.
 *
 * @param {Object} consData - data del doc consultorio
 * @param {'primary'|'secondary'} slot
 * @returns {Object|null} el mpConfig del slot, o null si no esta conectado
 */
export function leerMpConfigDelSlot(consData, slot) {
  if (!consData) return null;

  // Si hay mpConfigs.{slot} explicito, usarlo
  if (consData.mpConfigs?.[slot]) {
    return consData.mpConfigs[slot];
  }

  // Fallback a legacy mpConfig solo para 'primary'
  if (slot === 'primary' && consData.mpIntegrado && consData.mpConfig) {
    // Inferimos el ownerAdminUid del legacy como connectedByUid
    return {
      ...consData.mpConfig,
      ownerAdminUid: consData.mpConfig.connectedByUid,
    };
  }

  return null;
}

/**
 * Devuelve la cantidad de slots MP conectados (0, 1 o 2).
 */
export function contarSlotsConectados(consData) {
  let count = 0;
  if (leerMpConfigDelSlot(consData, 'primary')) count++;
  if (leerMpConfigDelSlot(consData, 'secondary')) count++;
  return count;
}

/**
 * Devuelve true si el consultorio tiene al menos un slot MP conectado.
 * Equivalente al antiguo `consData.mpIntegrado` pero contemplando
 * mpConfigs nuevos.
 */
export function tieneAlgunMpConectado(consData) {
  return contarSlotsConectados(consData) > 0;
}

/* ============================================================
   Decision: que slot cobra hoy?
   ============================================================ */

/**
 * Decide a que slot le toca cobrar en una fecha dada.
 *
 * Reglas:
 *   1. Si solo hay 1 slot conectado (o ninguno) → siempre 'primary'
 *      (flow viejo). Si no hay ninguno conectado, devuelve 'primary'
 *      igual y el caller decide que hacer (probablemente fallar).
 *   2. Si hay 2 slots conectados pero repartoActivado=false o
 *      fecha < repartoIniciaEn → cobra 'primary' (todavia no arranco
 *      la rotacion).
 *   3. Si hay 2 slots conectados y fecha >= repartoIniciaEn → calcula
 *      el ciclo (cuantos meses pasaron desde repartoIniciaEn,
 *      contando desde el dia 15) y alterna.
 *
 * @param {Object} consData
 * @param {Date} [fecha=new Date()]
 * @returns {{slot: 'primary'|'secondary', razon: string}}
 *   razon = 'unico-slot' | 'reparto-no-iniciado' | 'reparto-rotacion'
 */
export function elegirSlotQueCobra(consData, fecha = new Date()) {
  const tienePrimary = !!leerMpConfigDelSlot(consData, 'primary');
  const tieneSecondary = !!leerMpConfigDelSlot(consData, 'secondary');

  // Caso 1: solo hay primary (o ninguno)
  if (!tieneSecondary) {
    return { slot: 'primary', razon: 'unico-slot' };
  }

  // Caso 2: hay 2 pero no se activo el reparto todavia, o la fecha
  // todavia no llego al inicio del primer ciclo
  const repartoIniciaEn = consData.repartoIniciaEn?.toDate
    ? consData.repartoIniciaEn.toDate()
    : (consData.repartoIniciaEn instanceof Date ? consData.repartoIniciaEn : null);

  if (!consData.repartoActivado || !repartoIniciaEn || fecha < repartoIniciaEn) {
    return { slot: 'primary', razon: 'reparto-no-iniciado' };
  }

  // Caso 3: rotacion activa. Calcular cuantos ciclos pasaron desde
  // repartoIniciaEn (cada ciclo = 1 mes, del 15 al 14).
  const cicloIndex = calcularCicloIndex(repartoIniciaEn, fecha);
  const slot = cicloIndex % 2 === 0 ? 'primary' : 'secondary';
  return { slot, razon: 'reparto-rotacion' };
}

/**
 * Cuenta cuantos ciclos completos del 15 al 14 pasaron entre dos
 * fechas. El ciclo 0 va de inicio al 14 del mes siguiente, el ciclo 1
 * del 15 del mes siguiente al 14 del posterior, etc.
 *
 * Asume que ambas fechas son >= que el dia 15 del mes de inicio.
 *
 * Ejemplos (asumiendo inicio = 15-jul-2025):
 *   fecha = 20-jul-2025  → 0
 *   fecha = 14-ago-2025  → 0
 *   fecha = 15-ago-2025  → 1
 *   fecha = 16-sep-2025  → 2
 *   fecha = 14-jul-2026  → 11
 *   fecha = 15-jul-2026  → 12
 */
export function calcularCicloIndex(fechaInicio, fecha) {
  // Diferencia en meses calendario
  const diffMeses = (fecha.getFullYear() - fechaInicio.getFullYear()) * 12
    + (fecha.getMonth() - fechaInicio.getMonth());

  // Si el dia del mes actual es < 15, todavia estamos en el ciclo
  // anterior. Si es >= 15, ya cambiamos de ciclo.
  // (Asumimos que fechaInicio cae siempre el dia 15.)
  if (fecha.getDate() < 15) {
    return Math.max(0, diffMeses - 1);
  }
  return diffMeses;
}

/**
 * Calcula la fecha del 15 del mes siguiente a una fecha dada.
 * Usado para calcular repartoIniciaEn cuando el segundo admin se
 * conecta.
 *
 * Ejemplos:
 *   fecha = 23-jun-2025 → 15-jul-2025
 *   fecha = 14-jul-2025 → 15-ago-2025  (siempre el "siguiente" 15)
 *   fecha = 15-jul-2025 → 15-ago-2025  (ya estamos en un dia 15, vamos al siguiente)
 *   fecha = 30-jul-2025 → 15-ago-2025
 */
export function calcularProximoDia15(fecha) {
  const d = new Date(fecha);
  // Ir al primer dia del mes siguiente, despues sumar 14 dias para llegar al 15
  const proximoMes = new Date(d.getFullYear(), d.getMonth() + 1, 15, 0, 0, 0, 0);
  return proximoMes;
}

/* ============================================================
   Acceso a token vigente del slot que cobra
   ============================================================ */

/**
 * Devuelve el access_token vigente del slot que cobra en una fecha.
 * Si el token esta proximo a vencer, lo refresca y devuelve los nuevos
 * datos para que el caller los persista en Firestore.
 *
 * @returns {Promise<{
 *   slot: 'primary'|'secondary',
 *   accessToken: string,
 *   mpConfigActualizado?: Object,  // si refresco, actualizar este slot
 *   userIdMP: string,
 *   livemode: boolean
 * }>}
 *
 * @throws Error si el slot que toca cobrar no esta conectado.
 */
export async function obtenerAccessTokenParaCobro(consData, fecha = new Date()) {
  const { slot, razon } = elegirSlotQueCobra(consData, fecha);
  const mpConfig = leerMpConfigDelSlot(consData, slot);

  if (!mpConfig) {
    throw new Error(
      `El consultorio no tiene Mercado Pago conectado en el slot ${slot}. ` +
      `Pediles a los admins que vinculen sus cuentas.`
    );
  }

  const { accessToken, mpConfigActualizado } = await asegurarAccessTokenVigente(mpConfig);

  return {
    slot,
    razon,
    accessToken,
    mpConfigActualizado,
    userIdMP: mpConfig.userIdMP,
    livemode: !!mpConfig.livemode,
    ownerAdminUid: mpConfig.ownerAdminUid || mpConfig.connectedByUid,
  };
}

/**
 * Devuelve el access_token vigente del slot indicado explicitamente.
 * Util para webhooks donde ya sabemos a que slot le pertenece el pago
 * (porque guardamos slotCobrador en el doc /pagos_consultorio).
 *
 * Tambien refresca el token si esta proximo a vencer.
 *
 * @param {Object} consData
 * @param {'primary'|'secondary'} slot
 * @returns {Promise<{
 *   accessToken: string,
 *   mpConfigActualizado?: Object,
 *   userIdMP: string,
 *   livemode: boolean
 * } | null>}  null si el slot no tiene cuenta conectada.
 */
export async function obtenerAccessTokenDeSlot(consData, slot) {
  const mpConfig = leerMpConfigDelSlot(consData, slot);
  if (!mpConfig) return null;

  const { accessToken, mpConfigActualizado } = await asegurarAccessTokenVigente(mpConfig);

  return {
    accessToken,
    mpConfigActualizado,
    userIdMP: mpConfig.userIdMP,
    livemode: !!mpConfig.livemode,
    ownerAdminUid: mpConfig.ownerAdminUid || mpConfig.connectedByUid,
  };
}

/**
 * Devuelve los slots que tienen cuenta conectada en un consultorio.
 * Util para iterar sobre las cuentas MP en webhooks (donde no sabemos
 * a priori a que slot le pertenece un pago).
 *
 * @returns {Array<'primary'|'secondary'>}
 */
export function listarSlotsConectados(consData) {
  const slots = [];
  if (leerMpConfigDelSlot(consData, 'primary')) slots.push('primary');
  if (leerMpConfigDelSlot(consData, 'secondary')) slots.push('secondary');
  return slots;
}

/* ============================================================
   Construir el path de update en Firestore
   ============================================================ */

/**
 * Devuelve el path de update para persistir un mpConfig en un slot.
 *
 * Importante: cuando guardamos en mpConfigs.primary, ademas marcamos
 * mpIntegrado=true (legacy) y mpConfig=el mismo (compat). Esto asegura
 * que codigo viejo que mira mpIntegrado / mpConfig directamente siga
 * funcionando.
 *
 * @param {'primary'|'secondary'} slot
 * @param {Object} mpConfigData - el mpConfig encriptado a guardar
 * @returns {Object} update object para pasar a docRef.update()
 */
export function buildUpdateParaGuardarSlot(slot, mpConfigData) {
  const update = {
    [`mpConfigs.${slot}`]: mpConfigData,
  };

  // Si es primary, ademas refrescamos los campos legacy para que el
  // codigo viejo siga viendo la cuenta como "conectada"
  if (slot === 'primary') {
    update.mpIntegrado = true;
    update.mpConfig = mpConfigData;
  }

  return update;
}

/**
 * Devuelve el update para desconectar un slot. Si es primary, ademas
 * limpia los campos legacy (mpIntegrado=false, mpConfig=null) — pero
 * SOLO si secondary tampoco esta conectado, para no romper compat.
 *
 * @param {'primary'|'secondary'} slot
 * @param {Object} consDataActual - data actual del consultorio
 *                                  (para decidir si limpiar legacy)
 * @returns {Object} update object
 */
export function buildUpdateParaDesconectarSlot(slot, consDataActual) {
  const update = {
    [`mpConfigs.${slot}`]: null,
  };

  // Si desconectamos primary, hay que decidir que hacer con los
  // campos legacy (mpIntegrado, mpConfig) que codigo viejo lee.
  // Tres casos:
  //   a) primary se desconecta y no hay secondary → limpiar legacy
  //   b) primary se desconecta y SI hay secondary → "promover"
  //      el secondary a primary (copiar a campos legacy y vaciar
  //      mpConfigs.secondary)
  //   c) secondary se desconecta → no tocar legacy
  if (slot === 'primary') {
    const tieneSecondary = !!consDataActual.mpConfigs?.secondary;
    if (tieneSecondary) {
      // Promover secondary a primary
      const secondary = consDataActual.mpConfigs.secondary;
      update['mpConfigs.primary'] = secondary;
      update['mpConfigs.secondary'] = null;
      update.mpIntegrado = true;
      update.mpConfig = secondary;
      // Si habia reparto activado, lo desactivamos: con un solo slot
      // la rotacion no tiene sentido
      update.repartoActivado = false;
    } else {
      // No hay secondary: limpiar todo
      update.mpIntegrado = false;
      update.mpConfig = null;
      update.repartoActivado = false;
    }
  } else if (slot === 'secondary') {
    // Desconectar secondary tambien apaga el reparto. La rotacion
    // queda inactiva hasta que se reconecte un secondary.
    update.repartoActivado = false;
  }

  return update;
}

/* ============================================================
   Activacion del reparto cuando se conecta el segundo slot
   ============================================================ */

/**
 * Calcula el update parcial para activar el reparto cuando se conecta
 * el segundo slot. El reparto arranca el dia 15 del mes SIGUIENTE a
 * la fecha de conexion (para evitar bugs con pagos a medio mes).
 *
 * IMPORTANTE: solo llamar a esto cuando se acaba de conectar el segundo
 * slot Y el primero ya estaba conectado. Si llamas en cualquier otro
 * momento, el reparto se activa cuando no debe.
 *
 * @param {Date} fechaConexion
 * @returns {Object} update parcial
 */
export function buildUpdateParaActivarReparto(fechaConexion = new Date()) {
  const repartoIniciaEn = calcularProximoDia15(fechaConexion);
  return {
    repartoActivado: true,
    repartoIniciaEn: Timestamp.fromDate(repartoIniciaEn),
    repartoActivadoEn: Timestamp.fromDate(fechaConexion),
  };
}
