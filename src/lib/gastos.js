/**
 * Gastos del consultorio (egresos del libro de caja)
 *
 * Los INGRESOS no viven acá: salen solos de las sesiones marcadas como
 * pagadas (cada una guarda receptorUid, o sea de qué caja entró) y de los
 * pagos de Mercado Pago. Este modulo cubre la otra mitad, que el sistema
 * no puede deducir: la plata que sale.
 *
 *   /gastos/{gastoId}
 *     consultorioId
 *     fecha    -> 'YYYY-MM-DD' (string: la caja es local al consultorio y
 *                 comparar dias como texto evita lios de zona horaria)
 *     monto    -> number positivo. El signo lo pone la vista, no el dato:
 *                 guardar negativos invita a sumar mal en cualquier query.
 *     cuenta   -> 'mp' | uid del admin de cuya caja salio
 *     motivo   -> texto libre ("alquiler", "epec", "papitas, gaseosas")
 */

import {
  addDoc, collection, deleteDoc, doc, onSnapshot, query,
  serverTimestamp, updateDoc, where,
} from 'firebase/firestore';

import { db } from './firebase.js';

/** Cuenta especial: lo cobrado por Mercado Pago, que no es de nadie en particular. */
export const CUENTA_MP = 'mp';

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

function validar({ monto, fecha, cuenta, motivo }) {
  const n = Number(monto);
  if (!Number.isFinite(n) || n <= 0) throw new Error('El monto tiene que ser mayor a cero.');
  if (!fecha) throw new Error('Elegí una fecha.');
  if (!cuenta) throw new Error('Elegí de qué caja salió.');
  if (!String(motivo || '').trim()) throw new Error('Escribí un motivo.');
  return { monto: Math.round(n * 100) / 100, fecha, cuenta, motivo: String(motivo).trim() };
}

export async function crearGasto(consultorioId, datos, creadoPorUid) {
  const limpio = validar(datos);
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
 * @param {Array} sesionesPagadas - con fechaPago, montoConsultorio y receptorUid
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
    movimientos.push({
      id: `s_${s.id}`, tipo: 'ingreso', cuenta, monto,
      fecha: aFecha(s.fechaPago), detalle: s.pacienteNombre || s.receptorNombre || 'Sesión cobrada',
      origen: 'sesion',
    });
  }

  for (const p of pagosMP) {
    const monto = Number(p.montoConsultorio ?? p.montoTotal) || 0;
    if (monto === 0) continue;
    movimientos.push({
      id: `mp_${p.id}`, tipo: 'ingreso', cuenta: CUENTA_MP, monto,
      fecha: aFecha(p.createdAt), detalle: p.profesionalNombre || 'Cobro por Mercado Pago',
      origen: 'mp',
    });
  }

  for (const g of gastos) {
    movimientos.push({
      id: `g_${g.id}`, gastoId: g.id, tipo: 'egreso',
      cuenta: idsValidos.has(g.cuenta) ? g.cuenta : 'sin_asignar',
      monto: Number(g.monto) || 0, fecha: g.fecha, detalle: g.motivo, origen: 'gasto',
    });
  }

  movimientos.sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));

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

function aFecha(v) {
  if (!v) return '';
  const d = v.toDate ? v.toDate() : (v instanceof Date ? v : new Date(v));
  if (isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
