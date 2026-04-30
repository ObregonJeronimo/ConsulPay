/**
 * lib/legal.js
 * ----------------------------------------------------------------
 * Constantes y utilidades relacionadas con los documentos legales
 * de ConsulPay (TOS y Politica de Privacidad).
 *
 * VERSIONADO:
 * Cuando un usuario acepta los TOS al registrarse (o al loguearse
 * por primera vez si es legacy), guardamos en su doc de /usuarios/{uid}
 * los campos:
 *   - aceptoTOSAt:  timestamp del momento de aceptacion
 *   - tosVersion:   string identificador de la version aceptada
 *
 * Si en el futuro modificamos los TOS de forma material (no solo
 * tipeo o aclaraciones menores), bumpeamos VERSION_TOS_ACTUAL. Eso
 * permite, mas adelante, agregar logica que pida re-aceptacion a
 * usuarios cuya version aceptada quedo desactualizada.
 *
 * Convenciones para VERSION_TOS_ACTUAL:
 *   - Formato YYYY-MM-DD de la fecha de vigencia
 *   - Bumpear SOLO ante cambios materiales (clausulas que afecten
 *     derechos del usuario), NO por correcciones tipograficas
 */

/**
 * Version actual de los Terminos y Condiciones + Politica de Privacidad.
 *
 * Esta es la version que se asocia con cada nueva aceptacion. Si la
 * cambias aca, los nuevos registros van a guardar el valor nuevo;
 * los registros existentes mantienen su valor original.
 *
 * IMPORTANTE: si cambia, hay que actualizar tambien la fecha en
 * src/pages/legal/PoliticaPrivacidad.jsx y TerminosCondiciones.jsx
 * (constante FECHA_VIGENCIA en cada archivo).
 */
export const VERSION_TOS_ACTUAL = '2026-04-30';

/**
 * Devuelve true si el usuario tiene una aceptacion de TOS valida
 * para la version actual. Util si en el futuro queremos forzar
 * re-aceptacion al cambiar los TOS.
 *
 * Por ahora no se usa en ningun gate, pero queda lista la API.
 */
export function tieneTOSAceptadosVigentes(usuario) {
  if (!usuario) return false;
  if (!usuario.aceptoTOSAt) return false;
  if (!usuario.tosVersion) return false;
  return usuario.tosVersion === VERSION_TOS_ACTUAL;
}
