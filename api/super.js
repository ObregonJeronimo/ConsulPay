/**
 * /api/super
 *
 * Router unico de operaciones de superadmin. Reemplaza a los endpoints
 * separados /api/super/eliminar-consultorio y /api/super/eliminar-profesional
 * para no exceder el limite de 12 funciones serverless del plan Hobby
 * de Vercel.
 *
 * Body: { accion: 'eliminar-consultorio' | 'eliminar-profesional', ...args }
 * Header: Authorization: Bearer <firebase_id_token>
 *
 * Acciones soportadas:
 *
 * 1. accion='eliminar-consultorio'
 *    Body extra: { consultorioId }
 *    Restricciones:
 *    - El caller debe ser superadmin.
 *    - El consultorio debe estar en plan='free' SIN suscripcion activa.
 *    Cascada borra: sesiones, pacientes, pagos_consultorio,
 *    pagos_mensualidad, solicitudes_sesion, logs_sesion,
 *    invitaciones_profesional, usuarios (del consultorio), consultorio.
 *
 * 2. accion='eliminar-profesional'
 *    Body extra: { uid, consultorioId, modo: 'retirar' | 'eliminar' }
 *    Restricciones:
 *    - Caller debe ser superadmin.
 *    - target != caller.
 *    - target debe pertenecer al consultorio.
 *    - target debe ser profesional o admin (no superadmin).
 *    - target NO puede ser el owner del consultorio.
 *    - target NO puede tener sesiones con estadoPago='debido'.
 *    Modos:
 *    - 'retirar': cambia estado a 'retirado' (soft).
 *    - 'eliminar': borra el doc /usuarios/{uid} (hard).
 *
 * NOTA: Como en el modelo actual cada user tiene consultorioId:string
 * (singular), al eliminar un consultorio borramos completamente los
 * docs /usuarios de sus miembros (no los pasamos a huerfanos). Si en
 * el futuro se hace multi-consultorio (array), hay que cambiar este
 * delete por updateDoc sacando el id del array.
 */

import { FieldValue, getFirestore } from 'firebase-admin/firestore';

import { verificarAuthHeader } from '../_lib/auth.js';
import { initAdmin } from '../_lib/firebase-admin.js';
import { jsonResponse, readJsonBody } from '../_lib/http.js';

/* ============================================================
   Helpers internos
   ============================================================ */

/**
 * Borra todos los docs de una coleccion que matcheen una query, en
 * batches de 400 (para no chocar con el limite de 500 ops/batch de
 * Firestore). Devuelve la cantidad total de docs borrados.
 */
async function borrarCollectionWhere(db, collectionName, whereClauses) {
  const BATCH_SIZE = 400;
  let totalBorrados = 0;

  while (true) {
    let q = db.collection(collectionName);
    for (const [field, op, value] of whereClauses) {
      q = q.where(field, op, value);
    }
    q = q.limit(BATCH_SIZE);

    const snap = await q.get();
    if (snap.empty) break;

    const batch = db.batch();
    for (const doc of snap.docs) {
      batch.delete(doc.ref);
    }
    await batch.commit();
    totalBorrados += snap.size;

    if (snap.size < BATCH_SIZE) break;
  }

  return totalBorrados;
}

/**
 * Valida que el uid sea superadmin. Lanza error con status si no.
 */
async function asegurarSuperadmin(db, uid) {
  const userSnap = await db.collection('usuarios').doc(uid).get();
  if (!userSnap.exists) {
    const e = new Error('Tu usuario no existe.');
    e.status = 403;
    throw e;
  }
  const userData = userSnap.data();
  if (userData.rol !== 'superadmin') {
    const e = new Error('Solo superadmins pueden ejecutar esta acción.');
    e.status = 403;
    e.codigo = 'NO_ES_SUPERADMIN';
    throw e;
  }
  return userData;
}

/* ============================================================
   Accion: eliminar-consultorio
   ============================================================ */

async function ejecutarEliminarConsultorio(db, callerUid, callerData, body) {
  const { consultorioId } = body;
  if (!consultorioId) {
    return { status: 400, payload: { error: 'consultorioId requerido.' } };
  }

  const consSnap = await db.collection('consultorios').doc(consultorioId).get();
  if (!consSnap.exists) {
    return { status: 404, payload: { error: 'El consultorio no existe.' } };
  }
  const consData = consSnap.data();

  // Solo permitimos eliminar consultorios FREE sin suscripcion activa.
  if (consData.plan === 'pro') {
    return {
      status: 400,
      payload: {
        error: 'Este consultorio tiene Plan Pro activo. Pediile al dueño que cancele su suscripción antes de eliminarlo.',
        codigo: 'PLAN_PRO_ACTIVO',
      },
    };
  }

  const sub = consData.subscription;
  if (sub && (
    sub.status === 'authorized'
    || sub.status === 'pending_authorization'
    || sub.status === 'in_grace'
  )) {
    return {
      status: 400,
      payload: {
        error: 'Este consultorio tiene una suscripción activa o pendiente. Pediile al dueño que la cancele en su Configuración antes de eliminarlo.',
        codigo: 'SUSCRIPCION_ACTIVA',
        subStatus: sub.status,
      },
    };
  }

  const deleted = {
    sesiones: 0,
    pacientes: 0,
    pagos_consultorio: 0,
    pagos_mensualidad: 0,
    solicitudes_sesion: 0,
    logs_sesion: 0,
    invitaciones_profesional: 0,
    usuarios: 0,
    consultorios: 0,
  };

  try {
    deleted.sesiones = await borrarCollectionWhere(db, 'sesiones',
      [['consultorioId', '==', consultorioId]]);
    deleted.pacientes = await borrarCollectionWhere(db, 'pacientes',
      [['consultorioId', '==', consultorioId]]);
    deleted.pagos_consultorio = await borrarCollectionWhere(db, 'pagos_consultorio',
      [['consultorioId', '==', consultorioId]]);
    deleted.pagos_mensualidad = await borrarCollectionWhere(db, 'pagos_mensualidad',
      [['consultorioId', '==', consultorioId]]);
    deleted.solicitudes_sesion = await borrarCollectionWhere(db, 'solicitudes_sesion',
      [['consultorioId', '==', consultorioId]]);
    deleted.logs_sesion = await borrarCollectionWhere(db, 'logs_sesion',
      [['consultorioId', '==', consultorioId]]);
    deleted.invitaciones_profesional = await borrarCollectionWhere(db, 'invitaciones_profesional',
      [['consultorioId', '==', consultorioId]]);
    deleted.usuarios = await borrarCollectionWhere(db, 'usuarios',
      [['consultorioId', '==', consultorioId]]);

    await db.collection('consultorios').doc(consultorioId).delete();
    deleted.consultorios = 1;
  } catch (err) {
    console.error('[super:eliminar-consultorio] Error en cascada:', err);
    return {
      status: 500,
      payload: {
        error: 'Error eliminando datos del consultorio. Algunos datos pueden haberse borrado parcialmente.',
        codigo: 'CASCADE_ERROR',
        deleted,
        detalle: err.message,
      },
    };
  }

  console.log(
    `[super:eliminar-consultorio] Consultorio ${consultorioId} (${consData.nombre || 'sin nombre'}) ` +
    `eliminado por superadmin ${callerData.email || callerUid}. ${JSON.stringify(deleted)}`,
  );

  return { status: 200, payload: { ok: true, deleted } };
}

/* ============================================================
   Accion: eliminar-profesional
   ============================================================ */

async function ejecutarEliminarProfesional(db, callerUid, callerData, body) {
  const { uid: targetUid, consultorioId, modo } = body;

  if (!targetUid) {
    return { status: 400, payload: { error: 'uid del profesional requerido.' } };
  }
  if (!consultorioId) {
    return { status: 400, payload: { error: 'consultorioId requerido.' } };
  }
  if (modo !== 'retirar' && modo !== 'eliminar') {
    return {
      status: 400,
      payload: { error: 'modo invalido. Debe ser "retirar" (soft delete) o "eliminar" (hard delete).' },
    };
  }
  if (targetUid === callerUid) {
    return {
      status: 400,
      payload: { error: 'No podés eliminarte a vos mismo desde acá.' },
    };
  }

  const consSnap = await db.collection('consultorios').doc(consultorioId).get();
  if (!consSnap.exists) {
    return { status: 404, payload: { error: 'El consultorio no existe.' } };
  }
  const consData = consSnap.data();

  const targetSnap = await db.collection('usuarios').doc(targetUid).get();
  if (!targetSnap.exists) {
    return { status: 404, payload: { error: 'El usuario no existe.' } };
  }
  const targetData = targetSnap.data();

  if (targetData.consultorioId !== consultorioId) {
    return {
      status: 400,
      payload: { error: 'Este usuario no pertenece al consultorio indicado.' },
    };
  }
  if (targetData.rol !== 'profesional' && targetData.rol !== 'admin') {
    return {
      status: 400,
      payload: { error: 'Solo se pueden retirar/eliminar profesionales o admins, no superadmins.' },
    };
  }
  if (consData.ownerUid === targetUid) {
    return {
      status: 400,
      payload: {
        error: 'No podés eliminar al dueño del consultorio. Para esto, eliminá el consultorio entero o pedí transferir ownership primero.',
        codigo: 'ES_OWNER',
      },
    };
  }

  // Validar que NO tenga deuda pendiente
  const sesionesDebidas = await db.collection('sesiones')
    .where('consultorioId', '==', consultorioId)
    .where('profesionalUid', '==', targetUid)
    .where('estadoPago', '==', 'debido')
    .limit(1)
    .get();

  if (!sesionesDebidas.empty) {
    const todasDebidas = await db.collection('sesiones')
      .where('consultorioId', '==', consultorioId)
      .where('profesionalUid', '==', targetUid)
      .where('estadoPago', '==', 'debido')
      .get();
    let total = 0;
    for (const d of todasDebidas.docs) {
      total += Number(d.data().montoConsultorio) || 0;
    }
    return {
      status: 400,
      payload: {
        error: `El profesional tiene ${todasDebidas.size} sesión${todasDebidas.size === 1 ? '' : 'es'} debida${todasDebidas.size === 1 ? '' : 's'} ` +
          `por un total de $${total.toLocaleString('es-AR')}. Pedile que salde la deuda antes de eliminarlo.`,
        codigo: 'DEUDA_PENDIENTE',
        deuda: { cantidad: todasDebidas.size, total },
      },
    };
  }

  const targetEmail = targetData.email || targetUid;
  let opResultado = {};

  if (modo === 'retirar') {
    await db.collection('usuarios').doc(targetUid).update({
      estado: 'retirado',
      retiradoAt: FieldValue.serverTimestamp(),
    });
    opResultado = { modo: 'retirar', estado: 'retirado' };
  } else {
    if (Array.isArray(consData.adminUids) && consData.adminUids.includes(targetUid)) {
      await db.collection('consultorios').doc(consultorioId).update({
        adminUids: FieldValue.arrayRemove(targetUid),
      });
    }
    await db.collection('usuarios').doc(targetUid).delete();
    opResultado = { modo: 'eliminar', usuariosBorrados: 1 };
  }

  console.log(
    `[super:eliminar-profesional] ${modo === 'retirar' ? 'Retirado' : 'Eliminado'} ` +
    `${targetEmail} del consultorio ${consultorioId} por superadmin ${callerData.email || callerUid}.`,
  );

  return { status: 200, payload: { ok: true, ...opResultado } };
}

/* ============================================================
   Accion: migrar-comisiones-2026
   ============================================================
   Migracion one-shot del modelo de comisiones viejo (6%/2% sobre
   montoConsultorio) al nuevo (1%/0.5% sobre valorTotal de la sesion).
   El backend ya calcula `valorTotal * comisionPct`; lo unico que
   resta es asegurar que cada consultorio tenga `comisionFree` y
   `comisionPro` con valores razonables del modelo nuevo.

   Comportamiento:
   1. Lee /config/global y lo actualiza a {comisionFree:1, comisionPro:0.5}
      si no estan en esos valores.
   2. Para cada consultorio:
      a. Si NO tiene `comisionFree` -> setea 1.
      b. Si NO tiene `comisionPro` -> setea 0.5.
      c. Si tiene `comisionFree`/`comisionPro` con valores del modelo
         viejo (>=2 ambos), los baja a los nuevos defaults.
      d. Si tiene `comisionConsulpay` (legacy), lo deja como esta para
         no romper nada en docs viejos. El frontend ya no lo usa.
   3. Es idempotente: correrla 2 veces no rompe nada.

   Body extra: { dryRun?: boolean }
     - Si dryRun=true, devuelve lo que CAMBIARIA pero no escribe nada.
   ============================================================ */

async function ejecutarMigrarComisiones2026(db, callerUid, callerData, body) {
  const dryRun = body.dryRun === true;
  const NUEVO_FREE = 1;
  const NUEVO_PRO = 0.5;

  const log = [];
  const errores = [];
  let consultoriosActualizados = 0;
  let configGlobalActualizado = false;
  let cfgNeedsUpdate = false;

  // 1. /config/global
  try {
    const cfgRef = db.collection('config').doc('global');
    const cfgSnap = await cfgRef.get();
    const cfgData = cfgSnap.exists ? cfgSnap.data() : {};
    cfgNeedsUpdate = (
      Number(cfgData.comisionFree) !== NUEVO_FREE
      || Number(cfgData.comisionPro) !== NUEVO_PRO
    );
    if (cfgNeedsUpdate) {
      const fActual = Number.isFinite(Number(cfgData.comisionFree))
        ? Number(cfgData.comisionFree) : 'no-existe';
      const pActual = Number.isFinite(Number(cfgData.comisionPro))
        ? Number(cfgData.comisionPro) : 'no-existe';
      log.push(
        `config/global: ${fActual}/${pActual} → ${NUEVO_FREE}/${NUEVO_PRO}`,
      );
      if (!dryRun) {
        await cfgRef.set({
          comisionFree: NUEVO_FREE,
          comisionPro: NUEVO_PRO,
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: callerUid,
        }, { merge: true });
        configGlobalActualizado = true;
      }
    }
  } catch (err) {
    console.error('[migrar-2026] Error leyendo/escribiendo config/global:', err);
    errores.push(`config/global: ${err.message}`);
  }

  // 2. Cada consultorio
  let consSnap;
  try {
    consSnap = await db.collection('consultorios').get();
  } catch (err) {
    console.error('[migrar-2026] Error leyendo coleccion consultorios:', err);
    return {
      status: 500,
      payload: {
        error: 'No se pudo leer la colección de consultorios.',
        detalle: err.message,
      },
    };
  }

  for (const doc of consSnap.docs) {
    try {
      const data = doc.data();
      const updates = {};
      const nombre = data.nombre || '(sin nombre)';

      const cFree = Number(data.comisionFree);
      const cPro = Number(data.comisionPro);
      const tieneFree = Number.isFinite(cFree) && cFree >= 0 && cFree <= 100;
      const tienePro = Number.isFinite(cPro) && cPro >= 0 && cPro <= 100;

      // Caso A: no tiene comisionFree o tiene valor del modelo viejo (>=2)
      if (!tieneFree) {
        updates.comisionFree = NUEVO_FREE;
      } else if (cFree >= 2) {
        updates.comisionFree = NUEVO_FREE;
      }

      // Caso B: no tiene comisionPro o tiene valor del modelo viejo (>=1.5)
      if (!tienePro) {
        updates.comisionPro = NUEVO_PRO;
      } else if (cPro >= 1.5) {
        updates.comisionPro = NUEVO_PRO;
      }

      if (Object.keys(updates).length > 0) {
        log.push(
          `consultorio ${doc.id} (${nombre}, plan=${data.plan || 'free'}): ` +
          `free ${tieneFree ? cFree : 'no-existe'}→${updates.comisionFree ?? cFree}, ` +
          `pro ${tienePro ? cPro : 'no-existe'}→${updates.comisionPro ?? cPro}`,
        );
        if (!dryRun) {
          await doc.ref.update(updates);
        }
        consultoriosActualizados++;
      }
    } catch (err) {
      console.error(`[migrar-2026] Error procesando consultorio ${doc.id}:`, err);
      errores.push(`consultorio ${doc.id}: ${err.message}`);
    }
  }

  console.log(
    `[super:migrar-comisiones-2026] ${dryRun ? '(DRY-RUN) ' : ''}` +
    `Ejecutado por ${callerData.email || callerUid}. ` +
    `Consultorios afectados: ${consultoriosActualizados}/${consSnap.size}. ` +
    `config/global: ${configGlobalActualizado || (dryRun && cfgNeedsUpdate) ? 'sí' : 'no'}. ` +
    `Errores: ${errores.length}.`,
  );

  return {
    status: 200,
    payload: {
      ok: true,
      dryRun,
      consultoriosTotal: consSnap.size,
      consultoriosActualizados,
      configGlobalActualizado: configGlobalActualizado || (dryRun && cfgNeedsUpdate),
      log,
      errores: errores.length > 0 ? errores : undefined,
    },
  };
}

/* ============================================================
   Handler principal (router)
   ============================================================ */

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return jsonResponse(res, 405, { error: 'Method not allowed' });
  }

  let callerUid;
  try {
    initAdmin();
    callerUid = await verificarAuthHeader(req);
  } catch (err) {
    return jsonResponse(res, err.status || 500, { error: err.message });
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return jsonResponse(res, 400, { error: 'Body invalido.' });
  }

  const { accion } = body;
  if (!accion) {
    return jsonResponse(res, 400, { error: 'Falta el campo "accion".' });
  }

  const db = getFirestore();

  // Validar superadmin (compartido entre todas las acciones)
  let callerData;
  try {
    callerData = await asegurarSuperadmin(db, callerUid);
  } catch (err) {
    return jsonResponse(res, err.status || 403, {
      error: err.message,
      codigo: err.codigo,
    });
  }

  // Router de acciones
  let resultado;
  try {
    switch (accion) {
      case 'eliminar-consultorio':
        resultado = await ejecutarEliminarConsultorio(db, callerUid, callerData, body);
        break;
      case 'eliminar-profesional':
        resultado = await ejecutarEliminarProfesional(db, callerUid, callerData, body);
        break;
      case 'migrar-comisiones-2026':
        resultado = await ejecutarMigrarComisiones2026(db, callerUid, callerData, body);
        break;
      default:
        return jsonResponse(res, 400, {
          error: `Accion desconocida: "${accion}". Validas: eliminar-consultorio, eliminar-profesional, migrar-comisiones-2026.`,
        });
    }
  } catch (err) {
    console.error(`[super:${accion}] Error inesperado:`, err);
    return jsonResponse(res, 500, {
      error: 'Error inesperado en el servidor.',
      detalle: err.message,
    });
  }

  return jsonResponse(res, resultado.status, resultado.payload);
}
