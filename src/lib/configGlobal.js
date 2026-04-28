/**
 * Configuración global de la plataforma ConsulPay.
 *
 * Vive en /config/global como un solo documento. Contiene parámetros
 * globales que solo el superadmin puede modificar y que todo el sistema
 * lee como referencia.
 *
 * Por ahora maneja la "comisión que se queda ConsulPay" según el plan
 * del consultorio. Cuando se cree un consultorio nuevo, se usa este
 * valor para inicializar su `comisionConsulpay`.
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
 */
export const CONFIG_GLOBAL_DEFAULT = Object.freeze({
  comisionFree: 6, // 6% en plan free
  comisionPro: 2,  // 2% en plan pro (paga $50.000/mes)
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
