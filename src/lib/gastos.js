/**
 * Movimientos cargados a mano en el libro de caja: gastos y, desde el
 * 19/10/2026, ingresos que no vienen de una sesion.
 *
 * Casi todos los ingresos salen solos de las sesiones marcadas como
 * pagadas (cada una guarda receptorUid, o sea de que caja entro) y de los
 * pagos de Mercado Pago. Lo que el sistema no puede deducir se carga aca:
 * la plata que sale y la que entra por otro lado (en CALA, la primera fue
 * "$5.000 pago de diferencia entrada").
 *
 * Los ingresos manuales viven en la misma coleccion que los gastos, con
 * tipo 'ingreso': las reglas de Firestore ya validan estos campos y no hubo
 * que tocarlas. La coleccion se sigue llamando gastos por compatibilidad;
 * todo el que la lee pasa por armarLibro, que es quien los separa.
 *
 *   /gastos/{gastoId}
 *     consultorioId
 *     fecha    -> 'YYYY-MM-DD' (string: la caja es local al consultorio y
 *                 comparar dias como texto evita lios de zona horaria)
 *     monto    -> number positivo. El signo lo pone la vista, no el dato:
 *                 guardar negativos invita a sumar mal en cualquier query.
 *     cuenta   -> 'mp' | uid del admin de cuya caja salio (o a cuya caja entro)
 *     motivo   -> texto libre ("alquiler", "epec", "papitas, gaseosas")
 *     tipo     -> 'egreso' | 'ingreso'. Los docs anteriores no lo tienen:
 *                 sin el campo es un gasto.
 *     enSaldoInicial -> opcional, solo para la billetera (ver saldosDeBilletera).
 *                 true: ya estaba descontado en el saldo de partida aunque
 *                 su fecha sea posterior al corte; false: no estaba, aunque
 *                 sea anterior. Sin el campo, decide la fecha. El libro lo
 *                 muestra igual: es un gasto del mes como cualquier otro.
 */

import {
  addDoc, collection, deleteDoc, doc, onSnapshot, query,
  serverTimestamp, updateDoc, where,
} from 'firebase/firestore';

import { ESTADOS_PAGO_SESION } from './constants.js';
import { db } from './firebase.js';

/** Cuenta especial: lo cobrado por Mercado Pago, que no es de nadie en particular. */
export const CUENTA_MP = 'mp';

/**
 * La plata que entro sin que nadie marcara quien la recibio: sesiones
 * pagadas antes de que se guardara el receptor (en CALA, 125 de mayo de
 * 2026). Antes se llamaba "Sin asignar", que sonaba a algo pendiente de
 * repartir; lo que paso es que no se registro, y eso es lo que dice.
 * El id queda igual: es lo que usan armarLibro y serieAnual.
 */
export const CAJA_SIN_RECEPTOR = {
  id: 'sin_asignar',
  nombre: 'No se marcó quién cobró',
  completo: 'No se marcó quién recibió el dinero',
};

export function suscribirGastos(consultorioId, callback) {
  if (!consultorioId) return () => {};
  const q = query(collection(db, 'gastos'), where('consultorioId', '==', consultorioId));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }, (err) => {
    console.error('Error en suscripción de gastos:', err);
    callback([]);
  });
}

function validar({ monto, fecha, cuenta, motivo, tipo }) {
  const n = Number(monto);
  const esIngreso = tipo === 'ingreso';
  if (!Number.isFinite(n) || n <= 0) throw new Error('El monto tiene que ser mayor a cero.');
  if (!fecha) throw new Error('Elegí una fecha.');
  if (!cuenta) throw new Error(esIngreso ? 'Elegí a qué caja entró.' : 'Elegí de qué caja salió.');
  if (!String(motivo || '').trim()) throw new Error('Escribí un motivo.');
  return {
    monto: Math.round(n * 100) / 100, fecha, cuenta, motivo: String(motivo).trim(),
    // Solo si vino: editar un movimiento sin decir el tipo no lo cambia.
    ...(tipo ? { tipo: esIngreso ? 'ingreso' : 'egreso' } : {}),
  };
}

export async function crearGasto(consultorioId, datos, creadoPorUid) {
  const limpio = validar({ ...datos, tipo: datos.tipo || 'egreso' });
  const ref = await addDoc(collection(db, 'gastos'), {
    ...limpio,
    consultorioId,
    creadoPorUid: creadoPorUid ?? null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return { gastoId: ref.id };
}

export async function actualizarGasto(gastoId, datos) {
  const limpio = validar(datos);
  await updateDoc(doc(db, 'gastos', gastoId), { ...limpio, updatedAt: serverTimestamp() });
}

export async function eliminarGasto(gastoId) {
  await deleteDoc(doc(db, 'gastos', gastoId));
}

/* ============================================================
   Armado del libro de caja
   ============================================================ */

/**
 * Une ingresos y egresos en un unico listado cronologico y calcula los
 * totales por cuenta.
 *
 * @param {Array} sesionesPagadas - con fechaPago, fecha, montoConsultorio,
 *   receptorUid y profesionalUid
 * @param {Array} pagosMP - pagos de Mercado Pago aprobados
 * @param {Array} gastos
 * @param {Array} cuentas - [{ id, nombre }] en el orden en que se muestran
 */
export function armarLibro({ sesionesPagadas = [], pagosMP = [], gastos = [], cuentas = [] }) {
  const idsValidos = new Set(cuentas.map((c) => c.id));
  const movimientos = [];

  for (const s of sesionesPagadas) {
    const monto = Number(s.montoConsultorio) || 0;
    if (monto === 0) continue;
    // Si el receptor no está entre las cuentas conocidas (admin que ya no
    // está, o sesión vieja sin receptor), va a "sin asignar" en vez de
    // desaparecer: la plata entró igual y tiene que verse.
    const cuenta = idsValidos.has(s.receptorUid) ? s.receptorUid : 'sin_asignar';
    /* detalle NO cae a receptorNombre: ese es el admin que cobro, que ya se
       muestra en la columna de la caja. Cuando la sesion no tiene el nombre
       del paciente desnormalizado, el consumidor lo resuelve contra el mapa
       de pacientes usando pacienteId; antes se colaba el nombre del admin
       como si fuera un paciente. */
    /* Las sesiones pagadas antes de que existiera fechaPago no la tienen:
       en CALA son 262, casi siete millones entre mayo y julio de 2026.
       Con aFecha(s.fechaPago) sola quedaban con fecha vacia y no caian en
       ningun mes: el libro y el Resumen las perdian mientras "Cobros por
       mes" si las contaba. Se usa el mismo respaldo que ya usa aquella
       vista (updatedAt), para que las tres digan lo mismo. */
    movimientos.push({
      id: `s_${s.id}`, tipo: 'ingreso', cuenta, monto,
      fecha: aFecha(s.fechaPago || s.updatedAt), orden: aMillis(s.fechaPago || s.updatedAt),
      detalle: s.pacienteNombre || '',
      pacienteId: s.pacienteId || null,
      /* De quien vino la plata y de cuando es el trabajo que se esta
         cobrando. Son dos datos distintos de la fecha de pago: una sesion
         de julio se liquida en octubre, asi que sin fechaSesion la fila
         dice cuando entro el dinero pero no de que mes es. */
      profesionalUid: s.profesionalUid || null,
      fechaSesion: aFecha(s.fecha),
      cantidad: Number(s.cantidadSesiones) > 0 ? Math.floor(Number(s.cantidadSesiones)) : 1,
      origen: 'sesion',
    });
  }

  for (const p of pagosMP) {
    const monto = Number(p.montoConsultorio ?? p.montoTotal) || 0;
    if (monto === 0) continue;
    movimientos.push({
      id: `mp_${p.id}`, tipo: 'ingreso', cuenta: CUENTA_MP, monto,
      fecha: aFecha(p.createdAt), orden: aMillis(p.createdAt),
      detalle: p.profesionalNombre || 'Cobro por Mercado Pago',
      origen: 'mp',
    });
  }

  for (const g of gastos) {
    // Un ingreso cargado a mano suma como un cobro, pero no es de una
    // sesion: origen 'manual', para que no se agrupe con los cobros del dia.
    const esIngreso = g.tipo === 'ingreso';
    movimientos.push({
      id: `g_${g.id}`, gastoId: g.id, tipo: esIngreso ? 'ingreso' : 'egreso',
      cuenta: idsValidos.has(g.cuenta) ? g.cuenta : 'sin_asignar',
      monto: Number(g.monto) || 0, fecha: g.fecha, orden: aMillis(g.createdAt),
      detalle: g.motivo, origen: esIngreso ? 'manual' : 'gasto',
      enSaldoInicial: typeof g.enSaldoInicial === 'boolean' ? g.enSaldoInicial : null,
    });
  }

  /* Por dia y, dentro del dia, por orden de carga. Antes solo por dia: los
     del mismo dia quedaban en el orden en que Firestore devuelve los docs
     (por id, o sea al azar) y lo recien cargado aparecia en el medio. */
  movimientos.sort((a, b) => (a.fecha || '').localeCompare(b.fecha || '') || a.orden - b.orden);

  const totales = {};
  for (const c of [...cuentas, { id: 'sin_asignar' }]) {
    totales[c.id] = { ingresos: 0, egresos: 0, saldo: 0 };
  }
  for (const m of movimientos) {
    const t = totales[m.cuenta] || (totales[m.cuenta] = { ingresos: 0, egresos: 0, saldo: 0 });
    if (m.tipo === 'ingreso') { t.ingresos += m.monto; t.saldo += m.monto; }
    else { t.egresos += m.monto; t.saldo -= m.monto; }
  }

  return { movimientos, totales };
}

/* ============================================================
   Cajas
   ============================================================ */

/** "Adriana Barrozo" -> "Adriana": alcanza para distinguir las cajas. */
export function nombreCorto(u) {
  const n = u?.displayName || u?.email || '';
  return n.split(/\s+/)[0] || 'Admin';
}

/**
 * Las cajas del consultorio, en el orden en que se muestran: Mercado Pago
 * (si corresponde) y despues un administrador por cada adminUid.
 *
 * Vive aca y no en cada pantalla porque el Resumen y el libro de caja
 * tienen que mostrar exactamente las mismas columnas: si una cuenta
 * Mercado Pago y la otra no, los totales por caja dejan de coincidir.
 */
export function cuentasDeCaja({ adminUids = [], miembros = [], conMP = false }) {
  const porUid = Object.fromEntries(miembros.map((m) => [m.uid, m]));
  const admins = adminUids.map((id) => ({
    id,
    nombre: porUid[id] ? nombreCorto(porUid[id]) : `Admin ${id.slice(0, 4)}`,
    completo: porUid[id]?.displayName || porUid[id]?.email || id,
  }));
  const cajaMP = { id: CUENTA_MP, nombre: 'Mercado Pago', completo: 'Cobros por Mercado Pago' };
  return conMP ? [cajaMP, ...admins] : admins;
}

/**
 * Si hubo cobros por Mercado Pago entre dos fechas 'YYYY-MM-DD'.
 *
 * Con MP apagado la caja MP se esconde, salvo que en el periodo que se
 * mira haya entrado plata por ahi: esconderla seria esconder plata.
 */
export function hayMPEnRango(pagosMP, desde, hasta) {
  return pagosMP.some((pago) => {
    // createdAt llega como Timestamp o, en docs viejos, como { seconds }.
    const c = pago.createdAt;
    const iso = aFecha(c && !c.toDate && c.seconds !== undefined ? new Date(c.seconds * 1000) : c);
    return iso !== '' && iso >= desde && iso <= hasta;
  });
}

/* ============================================================
   Serie anual (pestana Resumen)
   ============================================================ */

function filaVacia(mes, ids) {
  return {
    mes, ingresos: 0, egresos: 0, aCobrar: 0, sinMonto: 0, sesionesCobradas: 0, gastos: 0,
    porCuenta: Object.fromEntries(ids.map((id) => [id, { ingresos: 0, egresos: 0 }])),
  };
}

/**
 * Un anio mes por mes: lo que entro, lo que salio y lo que todavia se debe.
 *
 * Ingresos y egresos se toman de los movimientos de armarLibro, los mismos
 * que lista el libro de caja: el Resumen no recalcula nada por su cuenta,
 * asi que la fila de julio y el pie del libro de julio no pueden dar
 * numeros distintos. Van por la fecha del movimiento — el cobro o el gasto.
 *
 * "A cobrar" va por el mes de la SESION, no del cobro: lo que interesa es
 * cuanto del trabajo de septiembre todavia no se pago. Las sesiones de
 * obra social que todavia no tienen monto se cuentan aparte (sinMonto):
 * no se sabe cuanto van a liquidar, pero tampoco estan saldadas.
 *
 * @param {Array} movimientos - salida de armarLibro, de todos los meses
 * @param {Array} sesiones - sesiones con fecha dentro del anio (cualquier estado)
 * @param {number} anio
 * @param {Array} cuentas - [{ id }]
 * @returns {{ meses: Array, total: Object }}
 */
export function serieAnual({ movimientos = [], sesiones = [], anio, cuentas = [] }) {
  const ids = [...cuentas.map((c) => c.id), 'sin_asignar'];
  const meses = Array.from({ length: 12 }, (_, mes) => filaVacia(mes, ids));
  const prefijo = `${anio}-`;

  for (const mv of movimientos) {
    if (!mv.fecha || !mv.fecha.startsWith(prefijo)) continue;
    const fila = meses[Number(mv.fecha.slice(5, 7)) - 1];
    if (!fila) continue;
    const pc = fila.porCuenta[mv.cuenta] || (fila.porCuenta[mv.cuenta] = { ingresos: 0, egresos: 0 });
    if (mv.tipo === 'ingreso') {
      fila.ingresos += mv.monto; pc.ingresos += mv.monto;
      if (mv.origen === 'sesion') fila.sesionesCobradas += mv.cantidad || 1;
    } else {
      fila.egresos += mv.monto; pc.egresos += mv.monto;
      fila.gastos += 1;
    }
  }

  for (const s of sesiones) {
    const iso = aFecha(s.fecha);
    if (!iso.startsWith(prefijo)) continue;
    const fila = meses[Number(iso.slice(5, 7)) - 1];
    if (s.estadoPago === ESTADOS_PAGO_SESION.DEBIDO) fila.aCobrar += Number(s.montoConsultorio) || 0;
    else if (s.estadoPago === ESTADOS_PAGO_SESION.PENDIENTE_MONTO) fila.sinMonto += 1;
  }

  const total = filaVacia(null, ids);
  for (const f of meses) {
    for (const k of ['ingresos', 'egresos', 'aCobrar', 'sinMonto', 'sesionesCobradas', 'gastos']) total[k] += f[k];
    for (const [id, v] of Object.entries(f.porCuenta)) {
      const t = total.porCuenta[id] || (total.porCuenta[id] = { ingresos: 0, egresos: 0 });
      t.ingresos += v.ingresos; t.egresos += v.egresos;
    }
  }
  return { meses, total };
}

/* ============================================================
   Billeteras
   ============================================================ */

/**
 * Cuanta plata del consultorio tiene cada admin HOY.
 *
 * El libro dice lo que entro y salio en un periodo; la billetera dice lo
 * que cada una tiene en la mano. Para eso hace falta un punto de partida
 * que el sistema no puede deducir: cuanto tenia cada una en una fecha. Se
 * carga una sola vez en el consultorio:
 *
 *   consultorios/{id}.billeteras
 *     desde   -> 'YYYY-MM-DD', primer dia que cuenta. El saldo cargado es
 *                el del CIERRE del dia anterior: en CALA, desde '2026-10-03'
 *                con lo que tenia cada una al terminar el 2/10.
 *     saldos  -> { [uid]: number } saldo de partida de cada admin
 *     nota    -> de donde salieron los numeros, para quien lo mire despues
 *
 * A partir de ahi se suman los cobros y se restan los gastos de la caja de
 * cada una, tomados de armarLibro: los mismos movimientos que lista el
 * libro, asi la billetera no puede contradecirlo.
 *
 * Lo cobrado sin que nadie marcara quien lo recibio no es de ninguna
 * billetera, pero tampoco se puede esconder: se devuelve aparte
 * (sinReceptor) para avisarlo.
 *
 * El corte por fecha no siempre alcanza: en CALA el saldo de partida salio
 * de una planilla cuyo ultimo renglon antes del saldo era un gasto del 3/10
 * (una reunion), y los gastos del mismo 3/10 que vienen despues no estaban.
 * Para esos casos el gasto lleva enSaldoInicial (ver el modelo arriba), que
 * le gana a la fecha. Va en el gasto y no en una lista aparte de ajustes:
 * si se borra o se corrige el gasto, su efecto en la billetera lo sigue.
 *
 * @param {Object} config - consultorio.billeteras (o null si no se cargo)
 * @param {Array} movimientos - salida de armarLibro, de todos los meses
 * @param {Array} cuentas - [{ id, nombre, completo }]
 * @returns {null | { desde, billeteras: Array, sinReceptor: number }}
 */
export function saldosDeBilletera({ config, movimientos = [], cuentas = [] }) {
  if (!config?.desde || !config?.saldos) return null;
  const { desde, saldos } = config;
  const porId = Object.fromEntries(cuentas.map((c) => [c.id, c]));

  const billeteras = Object.keys(saldos)
    // Un admin que ya no esta en el consultorio no tiene billetera que mostrar.
    .filter((id) => porId[id])
    .map((id) => ({ ...porId[id], inicial: Number(saldos[id]) || 0, ingresos: 0, egresos: 0, saldo: 0 }));
  const idx = Object.fromEntries(billeteras.map((b) => [b.id, b]));

  let sinReceptor = 0;
  for (const mv of movimientos) {
    if (!mv.fecha) continue;
    const cuenta = mv.enSaldoInicial === true ? false
      : mv.enSaldoInicial === false ? true
        : mv.fecha >= desde;
    if (!cuenta) continue;
    const b = idx[mv.cuenta];
    if (!b) {
      if (mv.cuenta === CAJA_SIN_RECEPTOR.id && mv.tipo === 'ingreso') sinReceptor += mv.monto;
      continue;
    }
    if (mv.tipo === 'ingreso') b.ingresos += mv.monto; else b.egresos += mv.monto;
  }
  for (const b of billeteras) b.saldo = b.inicial + b.ingresos - b.egresos;

  return { desde, billeteras, sinReceptor };
}

/**
 * Momento de carga en ms, para ordenar dentro de un mismo dia. Un gasto
 * recien creado todavia no tiene la hora del servidor (serverTimestamp
 * pendiente): va al final, que es donde termina cuando llega.
 */
function aMillis(v) {
  if (!v) return Number.MAX_SAFE_INTEGER;
  const d = v.toDate ? v.toDate()
    : (v.seconds !== undefined ? new Date(v.seconds * 1000) : (v instanceof Date ? v : new Date(v)));
  const t = d.getTime();
  return Number.isNaN(t) ? Number.MAX_SAFE_INTEGER : t;
}

function aFecha(v) {
  if (!v) return '';
  const d = v.toDate ? v.toDate() : (v instanceof Date ? v : new Date(v));
  if (isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
