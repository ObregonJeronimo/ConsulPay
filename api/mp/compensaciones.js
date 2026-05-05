/**
 * /api/mp/compensaciones
 *
 * Endpoint multi-accion para gestion del flow de compensaciones del
 * "reparto entre socias" (multi-admin).
 *
 * Acciones:
 *
 *   - 'cerrar-ciclo':
 *       Calcula y persiste la compensacion de un ciclo (15-15).
 *       Lee los pagos aprobados del ciclo de la coleccion
 *       /pagos_consultorio, agrupa por slotCobrador, suma
 *       montoNetoReal de cada slot, y calcula la diferencia.
 *
 *       El que cobro mas tiene que transferirle al otro la
 *       mitad de la diferencia para emparejar.
 *
 *       Body: { consultorioId, idCiclo? }
 *         - idCiclo opcional: si no se pasa, usa el ciclo previo
 *           (no el actual — solo se cierran ciclos completos)
 *       Devuelve: { compensacion: {...} }
 *
 *   - 'marcar-transferida':
 *       El admin pagante (el que tiene mas plata) marca que ya
 *       hizo la transferencia al otro admin. Pasa estado a
 *       'transferido'. Solo el pagante puede llamar esto.
 *
 *       Body: { consultorioId, idCiclo }
 *
 *   - 'confirmar-recibida':
 *       El admin receptor confirma que ya recibio la transferencia.
 *       Pasa estado a 'saldado'. Solo el receptor puede llamar esto.
 *       Requiere que la compensacion ya este en estado 'transferido'.
 *
 *       Body: { consultorioId, idCiclo }
 *
 *   - 'recalcular':
 *       Re-calcula los totales del ciclo (por si hubo refunds, pagos
 *       que llegaron tarde, etc.). Solo se puede en estado 'pendiente'
 *       — una vez que el pagante confirmo, ya no se puede recalcular.
 *
 *       Body: { consultorioId, idCiclo }
 *
 * SEGURIDAD
 *   - Auth via Firebase ID token (Authorization header)
 *   - Solo admins del consultorio pueden llamar este endpoint
 *   - Para 'marcar-transferida' validamos que el caller sea el
 *     admin pagante (ownerAdminUidPagante)
 *   - Para 'confirmar-recibida' validamos que sea el receptor
 *
 * CONCURRENCIA
 *   Las acciones de marcar/confirmar usan transaction para evitar
 *   race conditions (dos clicks rapidos, un admin que confirma
 *   mientras el otro recalcula, etc.).
 */

import { FieldValue, getFirestore } from 'firebase-admin/firestore';

import { asegurarAdminDeConsultorio, verificarAuthHeader } from '../_lib/auth.js';
import { initAdmin } from '../_lib/firebase-admin.js';
import { jsonResponse, readJsonBody } from '../_lib/http.js';
import {
  calcularIdDelCiclo,
  calcularRangoDelCiclo,
  leerMpConfigDelSlot,
} from '../_lib/mp-config-helpers.js';

const ACCIONES_VALIDAS = [
  'cerrar-ciclo',
  'marcar-transferida',
  'confirmar-recibida',
  'recalcular',
];

const ESTADOS = {
  PENDIENTE: 'pendiente',
  TRANSFERIDO: 'transferido',
  SALDADO: 'saldado',
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return jsonResponse(res, 405, { error: 'Method not allowed' });
  }

  // ---------- Auth ----------
  let uid;
  try {
    initAdmin();
    uid = await verificarAuthHeader(req);
  } catch (err) {
    return jsonResponse(res, err.status || 500, { error: err.message });
  }

  // ---------- Body ----------
  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return jsonResponse(res, 400, { error: 'Body invalido.' });
  }

  const { accion, consultorioId } = body;
  if (!accion || !ACCIONES_VALIDAS.includes(accion)) {
    return jsonResponse(res, 400, {
      error: `accion invalida. Validas: ${ACCIONES_VALIDAS.join(', ')}`,
    });
  }
  if (!consultorioId) {
    return jsonResponse(res, 400, { error: 'consultorioId requerido.' });
  }

  // ---------- Validar admin del consultorio ----------
  try {
    await asegurarAdminDeConsultorio({ uid, consultorioId });
  } catch (err) {
    return jsonResponse(res, err.status || 500, { error: err.message });
  }

  const db = getFirestore();

  // ---------- Dispatch ----------
  try {
    switch (accion) {
      case 'cerrar-ciclo':
        return await handleCerrarCiclo({ res, db, consultorioId, body, uid });
      case 'recalcular':
        return await handleRecalcular({ res, db, consultorioId, body, uid });
      case 'marcar-transferida':
        return await handleMarcarTransferida({ res, db, consultorioId, body, uid });
      case 'confirmar-recibida':
        return await handleConfirmarRecibida({ res, db, consultorioId, body, uid });
      default:
        return jsonResponse(res, 400, { error: 'Accion no implementada.' });
    }
  } catch (err) {
    console.error(`Error en compensaciones/${accion}:`, err);
    return jsonResponse(res, err.status || 500, {
      error: err.message || 'Error interno.',
    });
  }
}

/* ============================================================
   Helpers
   ============================================================ */

/**
 * Calcula los totales de un ciclo a partir de los pagos aprobados.
 * Lee /pagos_consultorio filtrando por consultorioId, estado='aprobado'
 * y createdAt en el rango del ciclo. Agrupa por slotCobrador.
 *
 * Usa montoNetoReal (lo que efectivamente entro a la cuenta MP del
 * slot, despues de comisiones MP) — NO montoTotal (que es lo que
 * pago el profesional). Asi el reparto refleja la plata real.
 *
 * @param {Object} db - firestore
 * @param {string} consultorioId
 * @param {Date} desde
 * @param {Date} hasta
 * @returns {Promise<{
 *   primary: { totalBruto, totalNetoReal, comisionMP, comisionConsulpay,
 *              cantidadPagos, ownerAdminUid },
 *   secondary: { ... },
 *   sinSlot: { cantidadPagos }  // pagos viejos sin slotCobrador
 * }>}
 */
async function calcularTotalesDelCiclo(db, consultorioId, desde, hasta) {
  // Query: pagos aprobados del consultorio en el rango
  // Nota: usamos createdAt como proxy de cuando se hizo el cobro.
  // En el futuro podriamos usar webhookRecibidoAt si es mas preciso.
  const snap = await db.collection('pagos_consultorio')
    .where('consultorioId', '==', consultorioId)
    .where('estado', '==', 'aprobado')
    .where('createdAt', '>=', desde)
    .where('createdAt', '<=', hasta)
    .get();

  const result = {
    primary: {
      totalBruto: 0,
      totalNetoReal: 0,
      comisionMP: 0,
      comisionConsulpay: 0,
      cantidadPagos: 0,
      ownerAdminUid: null,
    },
    secondary: {
      totalBruto: 0,
      totalNetoReal: 0,
      comisionMP: 0,
      comisionConsulpay: 0,
      cantidadPagos: 0,
      ownerAdminUid: null,
    },
    sinSlot: {
      cantidadPagos: 0,
    },
  };

  for (const doc of snap.docs) {
    const p = doc.data();

    const slot = p.slotCobrador;
    if (slot !== 'primary' && slot !== 'secondary') {
      // Pago viejo sin slotCobrador (creado antes del feature multi-slot).
      // Por convencion lo asignamos a primary porque legacy mpConfig
      // siempre fue lo que es ahora primary.
      result.sinSlot.cantidadPagos++;
      result.primary.cantidadPagos++;
      result.primary.totalBruto += Number(p.montoTotal) || 0;
      result.primary.totalNetoReal += Number(p.montoNetoReal) || 0;
      result.primary.comisionMP += Number(p.feeMercadoPago) || 0;
      result.primary.comisionConsulpay += Number(p.montoConsulpay) || 0;
      continue;
    }

    const bucket = result[slot];
    bucket.cantidadPagos++;
    bucket.totalBruto += Number(p.montoTotal) || 0;
    // Si montoNetoReal no esta cargado (fallback: pago aprobado pero sin
    // webhook procesado todavia), usamos montoConsultorio como proxy.
    // No es perfecto pero es lo mejor que tenemos.
    const neto = Number(p.montoNetoReal);
    bucket.totalNetoReal += Number.isFinite(neto) && neto > 0
      ? neto
      : Number(p.montoConsultorio) || 0;
    bucket.comisionMP += Number(p.feeMercadoPago) || 0;
    bucket.comisionConsulpay += Number(p.montoConsulpay) || 0;
  }

  // Redondeo a 2 decimales
  for (const slot of ['primary', 'secondary']) {
    const b = result[slot];
    b.totalBruto = Math.round(b.totalBruto * 100) / 100;
    b.totalNetoReal = Math.round(b.totalNetoReal * 100) / 100;
    b.comisionMP = Math.round(b.comisionMP * 100) / 100;
    b.comisionConsulpay = Math.round(b.comisionConsulpay * 100) / 100;
  }

  return result;
}

/**
 * Calcula el flow de compensacion: quien le debe transferir a quien.
 *
 * El que cobro mas tiene que transferirle al otro la mitad de la
 * diferencia para emparejar.
 *
 * Ejemplo:
 *   primary cobro $100, secondary cobro $80
 *   diferencia = $20
 *   primary transfiere $10 a secondary → ambos quedan con $90
 *
 * @returns {{
 *   diferenciaNeta: number,
 *   paganteSlot: 'primary'|'secondary'|null,
 *   receptorSlot: 'primary'|'secondary'|null,
 *   montoATransferir: number,
 *   estaEmparejado: boolean
 * }}
 */
function calcularFlowDeCompensacion(totales) {
  const netoPrimary = totales.primary.totalNetoReal;
  const netoSecondary = totales.secondary.totalNetoReal;

  const diferenciaNeta = Math.abs(netoPrimary - netoSecondary);
  const montoATransferir = Math.round((diferenciaNeta / 2) * 100) / 100;

  // Si la diferencia es menor a 1 centavo, consideramos que ya estan
  // emparejados (no hace falta transferir nada)
  if (diferenciaNeta < 0.01) {
    return {
      diferenciaNeta: 0,
      paganteSlot: null,
      receptorSlot: null,
      montoATransferir: 0,
      estaEmparejado: true,
    };
  }

  if (netoPrimary > netoSecondary) {
    return {
      diferenciaNeta,
      paganteSlot: 'primary',
      receptorSlot: 'secondary',
      montoATransferir,
      estaEmparejado: false,
    };
  }
  return {
    diferenciaNeta,
    paganteSlot: 'secondary',
    receptorSlot: 'primary',
    montoATransferir,
    estaEmparejado: false,
  };
}

/**
 * Resuelve la fecha de referencia del ciclo a cerrar.
 * Si idCiclo viene en el body, parsea esa fecha. Sino, devuelve el
 * ciclo PREVIO al actual (no el actual — solo cerramos ciclos
 * completos).
 */
function resolverFechaDelCiclo(idCicloPedido) {
  if (idCicloPedido) {
    // idCiclo formato 'AAAA-MM-15'
    const m = String(idCicloPedido).match(/^(\d{4})-(\d{2})-15$/);
    if (!m) {
      const err = new Error('idCiclo invalido. Formato esperado: AAAA-MM-15');
      err.status = 400;
      throw err;
    }
    const [, y, mo] = m;
    return new Date(Number(y), Number(mo) - 1, 20, 12, 0, 0);  // dia 20 cualquiera del ciclo
  }

  // Default: ciclo previo. Tomamos la fecha de hoy y le restamos 1 mes
  // para que caiga en el ciclo anterior.
  const hoy = new Date();
  return new Date(hoy.getFullYear(), hoy.getMonth() - 1, hoy.getDate(), 12, 0, 0);
}

/* ============================================================
   ACCION: cerrar-ciclo
   ============================================================ */

async function handleCerrarCiclo({ res, db, consultorioId, body, uid }) {
  const fechaRef = resolverFechaDelCiclo(body.idCiclo);
  const idCiclo = calcularIdDelCiclo(fechaRef);
  const { desde, hasta } = calcularRangoDelCiclo(fechaRef);

  // Validar que el ciclo este completo (hasta < hoy)
  if (hasta > new Date()) {
    return jsonResponse(res, 400, {
      error: 'No se puede cerrar un ciclo que todavia no termino. ' +
             `Este ciclo termina el ${hasta.toISOString().slice(0, 10)}.`,
      codigo: 'CICLO_NO_TERMINADO',
    });
  }

  // Validar que el consultorio tenga 2 admins con MP conectada
  const consSnap = await db.collection('consultorios').doc(consultorioId).get();
  const consData = consSnap.data();
  const primary = leerMpConfigDelSlot(consData, 'primary');
  const secondary = leerMpConfigDelSlot(consData, 'secondary');
  if (!primary || !secondary) {
    return jsonResponse(res, 400, {
      error: 'El consultorio no tiene 2 cuentas MP conectadas. ' +
             'El reparto entre socias requiere ambos slots ocupados.',
      codigo: 'SLOTS_INCOMPLETOS',
    });
  }

  // Validar que el ciclo este dentro del rango de reparto activo
  const repartoIniciaEn = consData.repartoIniciaEn?.toDate
    ? consData.repartoIniciaEn.toDate()
    : (consData.repartoIniciaEn instanceof Date ? consData.repartoIniciaEn : null);
  if (!consData.repartoActivado || !repartoIniciaEn || hasta < repartoIniciaEn) {
    return jsonResponse(res, 400, {
      error: 'El reparto entre socias no estaba activo en ese ciclo. ' +
             'No hay nada que compensar.',
      codigo: 'REPARTO_NO_ACTIVO_EN_CICLO',
    });
  }

  // Validar que no exista ya
  const compRef = db.collection('consultorios').doc(consultorioId)
    .collection('compensaciones').doc(idCiclo);
  const compSnap = await compRef.get();
  if (compSnap.exists) {
    return jsonResponse(res, 409, {
      error: 'La compensacion de ese ciclo ya fue cerrada. ' +
             'Si querés recalcular los totales, usá la acción "recalcular".',
      codigo: 'YA_CERRADO',
      idCiclo,
    });
  }

  // Calcular totales y compensacion
  const totales = await calcularTotalesDelCiclo(db, consultorioId, desde, hasta);
  totales.primary.ownerAdminUid = primary.ownerAdminUid || primary.connectedByUid;
  totales.secondary.ownerAdminUid = secondary.ownerAdminUid || secondary.connectedByUid;

  const flow = calcularFlowDeCompensacion(totales);

  // Persistir
  const docData = {
    idCiclo,
    consultorioId,
    desde,
    hasta,
    totales,
    diferenciaNeta: flow.diferenciaNeta,
    paganteSlot: flow.paganteSlot,
    receptorSlot: flow.receptorSlot,
    montoATransferir: flow.montoATransferir,
    estaEmparejado: flow.estaEmparejado,
    estado: flow.estaEmparejado ? ESTADOS.SALDADO : ESTADOS.PENDIENTE,
    pagante: { confirmadoEn: null, confirmadoPorUid: null },
    receptor: { confirmadoEn: null, confirmadoPorUid: null },
    // Snapshots de admins para preservar info aunque despues alguno se vaya
    ownerAdminUidPagante: flow.paganteSlot
      ? totales[flow.paganteSlot].ownerAdminUid
      : null,
    ownerAdminUidReceptor: flow.receptorSlot
      ? totales[flow.receptorSlot].ownerAdminUid
      : null,
    cerradoPorUid: uid,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  await compRef.set(docData);

  return jsonResponse(res, 200, {
    ok: true,
    compensacion: {
      ...docData,
      desde: desde.toISOString(),
      hasta: hasta.toISOString(),
    },
  });
}

/* ============================================================
   ACCION: recalcular
   ============================================================ */

async function handleRecalcular({ res, db, consultorioId, body, uid }) {
  if (!body.idCiclo) {
    return jsonResponse(res, 400, { error: 'idCiclo requerido.' });
  }

  const compRef = db.collection('consultorios').doc(consultorioId)
    .collection('compensaciones').doc(body.idCiclo);

  // Tx para evitar race con marcar-transferida
  await db.runTransaction(async (tx) => {
    const compSnap = await tx.get(compRef);
    if (!compSnap.exists) {
      const err = new Error('Esa compensacion no existe. Cerrala primero con cerrar-ciclo.');
      err.status = 404;
      throw err;
    }
    const comp = compSnap.data();
    if (comp.estado !== ESTADOS.PENDIENTE) {
      const err = new Error(
        'Solo se puede recalcular una compensacion en estado pendiente. ' +
        `Estado actual: ${comp.estado}.`
      );
      err.status = 409;
      throw err;
    }

    const desde = comp.desde.toDate();
    const hasta = comp.hasta.toDate();
    const totales = await calcularTotalesDelCiclo(db, consultorioId, desde, hasta);
    totales.primary.ownerAdminUid = comp.totales.primary.ownerAdminUid;
    totales.secondary.ownerAdminUid = comp.totales.secondary.ownerAdminUid;

    const flow = calcularFlowDeCompensacion(totales);

    tx.update(compRef, {
      totales,
      diferenciaNeta: flow.diferenciaNeta,
      paganteSlot: flow.paganteSlot,
      receptorSlot: flow.receptorSlot,
      montoATransferir: flow.montoATransferir,
      estaEmparejado: flow.estaEmparejado,
      estado: flow.estaEmparejado ? ESTADOS.SALDADO : ESTADOS.PENDIENTE,
      ownerAdminUidPagante: flow.paganteSlot
        ? totales[flow.paganteSlot].ownerAdminUid
        : null,
      ownerAdminUidReceptor: flow.receptorSlot
        ? totales[flow.receptorSlot].ownerAdminUid
        : null,
      recalculadoPorUid: uid,
      recalculadoEn: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  const compFresco = await compRef.get();
  const data = compFresco.data();
  return jsonResponse(res, 200, {
    ok: true,
    compensacion: {
      ...data,
      desde: data.desde.toDate().toISOString(),
      hasta: data.hasta.toDate().toISOString(),
    },
  });
}

/* ============================================================
   ACCION: marcar-transferida
   ============================================================ */

async function handleMarcarTransferida({ res, db, consultorioId, body, uid }) {
  if (!body.idCiclo) {
    return jsonResponse(res, 400, { error: 'idCiclo requerido.' });
  }

  const compRef = db.collection('consultorios').doc(consultorioId)
    .collection('compensaciones').doc(body.idCiclo);

  await db.runTransaction(async (tx) => {
    const compSnap = await tx.get(compRef);
    if (!compSnap.exists) {
      const err = new Error('Esa compensacion no existe.');
      err.status = 404;
      throw err;
    }
    const comp = compSnap.data();

    if (comp.estado !== ESTADOS.PENDIENTE) {
      const err = new Error(
        `No se puede marcar como transferida desde el estado "${comp.estado}". ` +
        'Solo desde "pendiente".'
      );
      err.status = 409;
      throw err;
    }

    if (comp.estaEmparejado) {
      const err = new Error('Esta compensacion no requiere transferencia (ya estaba emparejada).');
      err.status = 400;
      throw err;
    }

    // Solo el admin pagante puede marcar transferida
    if (comp.ownerAdminUidPagante !== uid) {
      const err = new Error(
        'Solo el admin que tiene que transferir puede marcar como transferida.'
      );
      err.status = 403;
      throw err;
    }

    tx.update(compRef, {
      estado: ESTADOS.TRANSFERIDO,
      'pagante.confirmadoEn': FieldValue.serverTimestamp(),
      'pagante.confirmadoPorUid': uid,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  return jsonResponse(res, 200, { ok: true });
}

/* ============================================================
   ACCION: confirmar-recibida
   ============================================================ */

async function handleConfirmarRecibida({ res, db, consultorioId, body, uid }) {
  if (!body.idCiclo) {
    return jsonResponse(res, 400, { error: 'idCiclo requerido.' });
  }

  const compRef = db.collection('consultorios').doc(consultorioId)
    .collection('compensaciones').doc(body.idCiclo);

  await db.runTransaction(async (tx) => {
    const compSnap = await tx.get(compRef);
    if (!compSnap.exists) {
      const err = new Error('Esa compensacion no existe.');
      err.status = 404;
      throw err;
    }
    const comp = compSnap.data();

    if (comp.estado !== ESTADOS.TRANSFERIDO) {
      const err = new Error(
        `No se puede confirmar recibida desde el estado "${comp.estado}". ` +
        'Esperá a que el otro admin marque que transfirió.'
      );
      err.status = 409;
      throw err;
    }

    // Solo el admin receptor puede confirmar
    if (comp.ownerAdminUidReceptor !== uid) {
      const err = new Error(
        'Solo el admin que recibe la transferencia puede confirmar.'
      );
      err.status = 403;
      throw err;
    }

    tx.update(compRef, {
      estado: ESTADOS.SALDADO,
      'receptor.confirmadoEn': FieldValue.serverTimestamp(),
      'receptor.confirmadoPorUid': uid,
      saldadoEn: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });

  return jsonResponse(res, 200, { ok: true });
}
