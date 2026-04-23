/**
 * Helpers de formato y validación para identificadores argentinos
 * (CUIT, CBU, CVU, DNI).
 *
 * Patrón: cada identificador tiene dos funciones:
 *   - soloDigitos(value, maxLen): filtra letras y limita largo. Útil en el
 *     onChange de inputs para bloquear entradas inválidas en tiempo real.
 *   - formatear(value): toma una cadena de dígitos y devuelve el formato
 *     visual (con guiones para CUIT, crudo para CBU).
 *
 * Las validaciones estrictas de integridad (dígito verificador del CUIT,
 * checksum del CBU) las dejamos para más adelante si hacen falta.
 */

/* ============================================================
   Utilidades base
   ============================================================ */

/**
 * Remueve todo lo que no sea dígito y limita la longitud.
 * @param {string} value
 * @param {number} maxLen
 * @returns {string}
 */
export function soloDigitos(value, maxLen = Infinity) {
  const limpio = (value ?? '').replace(/\D/g, '');
  return limpio.slice(0, maxLen);
}

/* ============================================================
   CUIT
   ----------------------------------------------------------------
   Formato: XX-XXXXXXXX-X (11 dígitos)
     - 2 dígitos: tipo de persona (20/23/24/27 para físicas, 30/33 jurídicas)
     - 8 dígitos: número de DNI (o raíz en jurídicas)
     - 1 dígito: verificador
   ============================================================ */

const CUIT_MAX_DIGITOS = 11;

/**
 * Limita el input a 11 dígitos y solo números.
 * Se usa en el onChange del input CUIT.
 */
export function soloDigitosCUIT(value) {
  return soloDigitos(value, CUIT_MAX_DIGITOS);
}

/**
 * Formatea una cadena de dígitos al patrón XX-XXXXXXXX-X.
 * Tolerante con entradas parciales: si el usuario tipeó 5 dígitos,
 * devuelve XX-XXX (sin el segundo guión todavía).
 */
export function formatearCUIT(value) {
  const d = soloDigitos(value, CUIT_MAX_DIGITOS);
  if (d.length <= 2) return d;
  if (d.length <= 10) return `${d.slice(0, 2)}-${d.slice(2)}`;
  return `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}`;
}

/**
 * @returns {boolean} true si el CUIT está completo (11 dígitos).
 */
export function esCUITCompleto(value) {
  return soloDigitos(value).length === CUIT_MAX_DIGITOS;
}

/* ============================================================
   CBU / CVU
   ----------------------------------------------------------------
   Formato: 22 dígitos sin separadores.
     - CBU (Clave Bancaria Uniforme): bancos tradicionales.
     - CVU (Clave Virtual Uniforme): billeteras virtuales (Mercado Pago, etc.).
   Ambos tienen el mismo formato visual y largo, se validan igual.
   ============================================================ */

const CBU_LARGO = 22;

/**
 * Limita el input a 22 dígitos y solo números.
 * Se usa en el onChange del input CBU/CVU.
 */
export function soloDigitosCBU(value) {
  return soloDigitos(value, CBU_LARGO);
}

/**
 * @returns {boolean} true si el CBU/CVU está completo (22 dígitos).
 */
export function esCBUCompleto(value) {
  return soloDigitos(value).length === CBU_LARGO;
}

/**
 * Largos estándar exportados por si alguien los necesita en UI
 * (ej: mostrar "12/22" mientras el usuario tipea).
 */
export const LARGOS = {
  CUIT: CUIT_MAX_DIGITOS,
  CBU: CBU_LARGO,
};
