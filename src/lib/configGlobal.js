/**
 * Configuración global de la plataforma ConsulPay.
 *
 * Vive en /config/global como un solo documento. Contiene parámetros
 * globales que solo el superadmin puede modificar y que todo el sistema
 * lee como referencia.
 *
 * Maneja la "comisión que se queda ConsulPay" según el plan del
 * consultorio. Cuando se crea un consultorio nuevo, se usan estos
 * valores para inicializar sus campos comisionFree/comisionPro.
 *
 * NUEVO MODELO (2026):
 *   La comisión ConsulPay se calcula sobre el VALOR TOTAL INICIAL de la
 *   sesión (lo que paga el paciente), NO sobre el monto que el profesional
 *   le debe al consultorio. Es decir, si el paciente paga $25.000 y el
 *   consultorio cobra 22%, el monto consultorio es $5.500 — pero la
 *   comisión ConsulPay se calcula sobre los $25.000.
 *
 *   Free: 1% sobre el valor total
 *   Pro:  0.5% sobre el valor total
 *
 *   El admin del consultorio decide si absorbe ese 0.5%/1% o lo traslada
 *   al profesional aumentando el % del método de pago.
 *
 * IMPORTANTE: cambiar la config global NO afecta consultorios ya
 * existentes (sus comisiones quedan "grandfathered" en el valor que
 * tenían cuando se crearon). Esto es intencional para no sorprender
 * a clientes con cambios silenciosos. Si en el futuro queremos
 * actualizar masivamente, sería una operación administrativa aparte.
 */

import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';

import { db } from './firebase.js';

/**
 * Defaults de fabrica. Si el doc /config/global no existe todavia
 * (primer arranque del sistema), usamos estos valores.
 *
 * Modelo nuevo: 1% en free, 0.5% en pro, sobre el valor total de la sesion.
 */
export const CONFIG_GLOBAL_DEFAULT = Object.freeze({
  comisionFree: 1,   // 1% en plan free (sobre valor total)
  comisionPro: 0.5,  // 0.5% en plan pro (sobre valor total)
});

const DOC_REF = () => doc(db, 'config', 'global');

/**
 * Lee la config global. Si no existe el doc, devuelve los defaults.
 * Cualquier user autenticado puede leer (las rules lo permiten porque
 * el frontend de "crear consultorio" tiene que consultarla).
 */
export async function obtenerConfigGlobal() {
  const snap = await getDoc(DOC_REF());
  if (!snap.exists()) {
    return { ...CONFIG_GLOBAL_DEFAULT };
  }
  const data = snap.data();
  // Mergeamos con defaults para que campos faltantes no rompan
  return {
    comisionFree: typeof data.comisionFree === 'number' ? data.comisionFree : CONFIG_GLOBAL_DEFAULT.comisionFree,
    comisionPro: typeof data.comisionPro === 'number' ? data.comisionPro : CONFIG_GLOBAL_DEFAULT.comisionPro,
    updatedAt: data.updatedAt ?? null,
    updatedBy: data.updatedBy ?? null,
  };
}

/**
 * Actualiza la config global. Solo superadmin (las rules lo enforcen).
 *
 * @param {Object} params
 * @param {number} params.comisionFree
 * @param {number} params.comisionPro
 * @param {string} params.callerUid - uid del superadmin que ejecuta
 */
export async function actualizarConfigGlobal({ comisionFree, comisionPro, callerUid }) {
  if (typeof comisionFree !== 'number' || comisionFree < 0 || comisionFree > 100) {
    throw new Error('comisionFree debe ser un numero entre 0 y 100');
  }
  if (typeof comisionPro !== 'number' || comisionPro < 0 || comisionPro > 100) {
    throw new Error('comisionPro debe ser un numero entre 0 y 100');
  }
  if (!callerUid) {
    throw new Error('callerUid requerido');
  }

  await setDoc(DOC_REF(), {
    comisionFree,
    comisionPro,
    updatedAt: serverTimestamp(),
    updatedBy: callerUid,
  }, { merge: true });
}
