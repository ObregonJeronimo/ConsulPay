/**
 * Servicios para el panel del superadmin.
 *
 * Cosas que el superadmin puede hacer sobre los consultorios:
 *  - Listar paginado (5 por pagina) — para no descargar miles de docs
 *    si la plataforma crece. Usa cursor (lastVisible) de Firestore.
 *  - Cargar los miembros de un consultorio especifico (cuando el user
 *    expande la fila).
 *  - Actualizar la config de un consultorio (comisiones + visibilidad
 *    del Plan Pro).
 *
 * NO usa onSnapshot live: el panel super se mira de a ratos, y un boton
 * "Refrescar" cubre el 99% de los casos. Live a colecciones enteras es
 * caro y no aporta valor aca.
 *
 * Las acciones simples sobre usuarios (suspender/reactivar) y la carga
 * batch de TODO el panorama siguen viviendo en lib/usuariosSuper.js.
 * Este modulo es solo para la nueva funcionalidad de gestion de
 * consultorios paginada.
 */

import {
  collection,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  updateDoc,
  where,
} from 'firebase/firestore';

import { db } from './firebase.js';
import { ROLES, ESTADOS_USUARIO } from './constants.js';

/* ============================================================
   Constantes
   ============================================================ */

/**
 * Cantidad de consultorios por pagina en el panel super.
 * Si en algun momento queremos cambiarlo, es un solo lugar.
 */
export const CONSULTORIOS_PAGE_SIZE = 5;

/**
 * Defaults razonables para los campos nuevos cuando un consultorio
 * todavia no los tiene definidos. Se usan tanto en el modal de
 * edicion (como valores iniciales) como en la lista (para mostrar
 * "comision actual" cuando no esta definida explicitamente).
 *
 * Coinciden con la logica de negocio (modelo nuevo, sobre valor total):
 *  - Free default: 1%
 *  - Pro default: 0.5%
 *  - puedeVerPlanPro default: true (habilitado para todos por default)
 */
export const DEFAULTS_CONSULTORIO_SUPER = {
  comisionFree: 1,
  comisionPro: 0.5,
  puedeVerPlanPro: true,
};

/* ============================================================
   Listado paginado de consultorios
   ============================================================ */

/**
 * Trae UNA pagina de consultorios. Ordena por nombre (alfabetico)
 * para que la paginacion sea estable y predecible.
 *
 * Uso:
 *   // Primera pagina
 *   const { items, lastDoc, hayMas } = await cargarPaginaConsultorios();
 *
 *   // Pagina siguiente
 *   const next = await cargarPaginaConsultorios({ lastDoc });
 *
 * @param {object} [opts]
 * @param {object} [opts.lastDoc] - DocumentSnapshot del ultimo elemento de la pagina anterior.
 *                                  Si no se pasa, trae la primera pagina.
 * @param {number} [opts.pageSize] - default CONSULTORIOS_PAGE_SIZE
 *
 * @returns {Promise<{
 *   items: Array<{ id: string, ...consultorioData }>,
 *   lastDoc: DocumentSnapshot | null,
 *   hayMas: boolean
 * }>}
 *
 * `hayMas` indica si hay (al menos) otra pagina despues de esta. Lo
 * inferimos pidiendo pageSize+1 docs y descartando el extra. Si vino
 * el extra -> hayMas=true. Esto evita una query separada de COUNT.
 */
export async function cargarPaginaConsultorios({ lastDoc = null, pageSize = CONSULTORIOS_PAGE_SIZE } = {}) {
  const constraints = [orderBy('nombre', 'asc')];
  if (lastDoc) {
    constraints.push(startAfter(lastDoc));
  }
  // Pedimos pageSize+1 para detectar si hay mas paginas sin una query
  // de COUNT extra. Despues descartamos el extra antes de devolver.
  constraints.push(limit(pageSize + 1));

  const q = query(collection(db, 'consultorios'), ...constraints);
  const snap = await getDocs(q);

  const docs = snap.docs;
  const hayMas = docs.length > pageSize;
  const docsPagina = hayMas ? docs.slice(0, pageSize) : docs;

  const items = docsPagina.map((d) => ({ id: d.id, ...d.data() }));
  const lastDocPagina = docsPagina.length > 0 ? docsPagina[docsPagina.length - 1] : null;

  return { items, lastDoc: lastDocPagina, hayMas };
}

/**
 * Cuenta total de consultorios en la plataforma.
 * Usa getCountFromServer (server-side) que es eficiente: no descarga
 * los docs, solo el contador. Util para mostrar "Mostrando X-Y de Z".
 */
export async function contarConsultorios() {
  const snap = await getCountFromServer(collection(db, 'consultorios'));
  return snap.data().count;
}

/* ============================================================
   Miembros de un consultorio
   ============================================================ */

/**
 * Trae los miembros (usuarios con consultorioId == X) de un consultorio
 * especifico. Se llama cuando el superadmin expande una fila en la
 * lista paginada.
 *
 * No es live tampoco — los datos se leen una vez al expandir.
 */
export async function cargarMiembrosConsultorio(consultorioId) {
  if (!consultorioId) return [];
  const q = query(
    collection(db, 'usuarios'),
    where('consultorioId', '==', consultorioId),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
}

/**
 * Resuelve los datos extra de un consultorio + miembros, util cuando
 * necesitamos info completa para el modal de edicion (lo cual no es
 * estrictamente necesario porque el modal solo edita 3 campos, pero lo
 * dejo disponible por si lo necesitamos).
 */
export async function cargarConsultorioConMiembros(consultorioId) {
  const [consSnap, miembros] = await Promise.all([
    getDoc(doc(db, 'consultorios', consultorioId)),
    cargarMiembrosConsultorio(consultorioId),
  ]);
  if (!consSnap.exists()) return null;
  return {
    consultorio: { id: consSnap.id, ...consSnap.data() },
    miembros,
  };
}

/* ============================================================
   Actualizar config (comisiones + visibilidad Plan Pro)
   ============================================================ */

/**
 * Valida y actualiza la configuracion de un consultorio.
 * Solo el superadmin puede hacerlo (las rules lo enforcan).
 *
 * Campos editables:
 *   - comisionFree: number (0-100). % de comision cuando esta en plan free.
 *   - comisionPro: number (0-100). % cuando esta en plan pro.
 *   - puedeVerPlanPro: boolean. Si false: el consultorio NO ve la pestaña
 *                      "Plan" en su Configuracion. NO afecta suscripciones
 *                      ya activas (el cron las renueva normalmente hasta
 *                      que el user cancele o falle el cobro).
 *
 * Validacion:
 *   - Las comisiones deben ser numeros validos entre 0 y 100. Permitimos
 *     0% (caso de cortesia/partner). Permitimos hasta 100% (caso teorico,
 *     no esperamos llegar ahi en la practica pero no lo bloqueamos).
 *   - puedeVerPlanPro debe ser boolean.
 *   - Si planEsUltra=true: el consultorio pasa al plan 'ultra' y se setea
 *     comisionUltra. Si planEsUltra=false y antes estaba en ultra, vuelve
 *     a 'free' (caemos al default seguro; si necesita 'pro' habria que
 *     re-suscribir manualmente o tocar el campo a mano).
 *
 * @param {string} consultorioId
 * @param {{
 *   comisionFree: number,
 *   comisionPro: number,
 *   puedeVerPlanPro: boolean,
 *   planEsUltra?: boolean,
 *   comisionUltra?: number | null
 * }} cambios
 */
export async function actualizarConfigSuper(consultorioId, cambios) {
  if (!consultorioId) throw new Error('consultorioId requerido');

  const {
    comisionFree,
    comisionPro,
    puedeVerPlanPro,
    planEsUltra,
    comisionUltra,
  } = cambios;

  // Validaciones
  if (!Number.isFinite(comisionFree) || comisionFree < 0 || comisionFree > 100) {
    throw new Error('La comisión Free debe ser un número entre 0 y 100.');
  }
  if (!Number.isFinite(comisionPro) || comisionPro < 0 || comisionPro > 100) {
    throw new Error('La comisión Pro debe ser un número entre 0 y 100.');
  }
  if (typeof puedeVerPlanPro !== 'boolean') {
    throw new Error('puedeVerPlanPro debe ser true o false.');
  }

  if (planEsUltra) {
    if (!Number.isFinite(comisionUltra) || comisionUltra < 0 || comisionUltra > 100) {
      throw new Error('La comisión Ultra debe ser un número entre 0 y 100 cuando el plan Ultra está activado.');
    }
  }

  // Redondeamos a 2 decimales para evitar floats raros (ej: 6.123456%)
  const comisionFreeR = Math.round(comisionFree * 100) / 100;
  const comisionProR = Math.round(comisionPro * 100) / 100;

  // Releemos el consultorio para decidir el plan resultante:
  //   - Si planEsUltra=true: plan='ultra'
  //   - Si planEsUltra=false y el plan actual es 'ultra': bajamos a 'free'
  //     (los Ultra son acuerdos manuales; el superadmin si quiere subirlo
  //     a pro despues lo hace manualmente)
  //   - Si planEsUltra=false y el plan no es ultra: no tocamos plan
  let nuevoPlan = null;
  let nuevaComisionUltra;
  if (planEsUltra === true) {
    nuevoPlan = 'ultra';
    nuevaComisionUltra = Math.round(comisionUltra * 100) / 100;
  } else if (planEsUltra === false) {
    // Solo tocamos si actualmente esta en ultra (para bajarlo). Si no, no.
    const snap = await getDoc(doc(db, 'consultorios', consultorioId));
    if (snap.exists() && snap.data().plan === 'ultra') {
      nuevoPlan = 'free';
      nuevaComisionUltra = null;
    }
  }

  const update = {
    comisionFree: comisionFreeR,
    comisionPro: comisionProR,
    puedeVerPlanPro,
  };

  if (nuevoPlan !== null) {
    update.plan = nuevoPlan;
  }
  if (nuevaComisionUltra !== undefined) {
    update.comisionUltra = nuevaComisionUltra;
  }

  await updateDoc(doc(db, 'consultorios', consultorioId), update);
}

/* ============================================================
   Helpers de display
   ============================================================ */

/**
 * Devuelve el % de comision a mostrar en la lista paginada para un
 * consultorio dado. Mira segun el plan actual y cae al campo legacy
 * `comisionConsulpay` si los nuevos no estan definidos.
 *
 * Esta funcion replica la logica del backend (resolverComision en
 * api/mp/crear-pago.js) pero en el cliente para display. Si la
 * cambias en uno, cambiala en el otro.
 *
 * @returns {{ pct: number, etiqueta: string }}
 *   - pct: numero (0-100), o NaN si no hay valor
 *   - etiqueta: 'Pro' | 'Free' | 'Legacy' (de donde salio)
 */
export function comisionDeConsultorio(c) {
  const plan = c.plan || 'free';
  const esValido = (v) => Number.isFinite(v) && v >= 0 && v <= 100;

  if (plan === 'ultra') {
    const cU = Number(c.comisionUltra);
    if (esValido(cU)) return { pct: cU, etiqueta: 'Ultra' };
    // Si el plan figura como ultra pero no tiene comisionUltra seteada,
    // caemos al Pro como fallback defensivo. No deberia pasar (el
    // superadmin setea ambos campos juntos cuando activa Ultra).
  }

  if (plan === 'pro') {
    const cP = Number(c.comisionPro);
    if (esValido(cP)) return { pct: cP, etiqueta: 'Pro' };
  } else {
    const cF = Number(c.comisionFree);
    if (esValido(cF)) return { pct: cF, etiqueta: 'Free' };
  }

  const legacy = Number(c.comisionConsulpay);
  if (esValido(legacy)) return { pct: legacy, etiqueta: 'Legacy' };

  return { pct: NaN, etiqueta: '—' };
}

/**
 * Cantidad de miembros activos de un consultorio. Util para mostrar
 * "X profesionales activos" en la lista paginada sin tener que cargar
 * miembros completos.
 *
 * NOTA: hace una query de COUNT (eficiente, no descarga docs). Si la
 * lista paginada muestra 5 consultorios, esto son 5 queries de COUNT
 * en paralelo — aceptable.
 *
 * Cuenta solo profesionales (no admins) que esten en estado 'activo'.
 */
export async function contarProfesionalesActivos(consultorioId) {
  const q = query(
    collection(db, 'usuarios'),
    where('consultorioId', '==', consultorioId),
    where('rol', '==', ROLES.PROFESIONAL),
    where('estado', '==', ESTADOS_USUARIO.ACTIVO),
  );
  const snap = await getCountFromServer(q);
  return snap.data().count;
}
