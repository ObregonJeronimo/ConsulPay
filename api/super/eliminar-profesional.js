/**
 * /api/super/eliminar-profesional
 *
 * Elimina (o retira) a un profesional de un consultorio. Solo superadmin.
 *
 * Dos modos:
 *   - 'retirar' (soft delete): el doc del usuario sigue existiendo,
 *     pero pasa a estado='retirado'. Sus sesiones historicas se
 *     mantienen (importantisimo para registros contables).
 *   - 'eliminar' (hard delete): el doc del usuario se borra. Las
 *     sesiones historicas se mantienen pero quedan sin doc de
 *     usuario asociado (en la UI van a aparecer como "Profesional
 *     eliminado"). NO borra la cuenta de Firebase Auth.
 *
 * Validaciones (ambos modos):
 *   - El caller es superadmin.
 *   - El target es un usuario con rol='profesional' o 'admin'.
 *   - El target NO tiene deuda pendiente con el consultorio.
 *   - Si el target es el OWNER del consultorio, se rechaza.
 *
 * Body: { uid, consultorioId, modo: 'retirar' | 'eliminar' }
 */

import { FieldValue, getFirestore } from 'firebase-admin/firestore';

import { verificarAuthHeader } from '../_lib/auth.js';
import { initAdmin } from '../_lib/firebase-admin.js';
import { jsonResponse, readJsonBody } from '../_lib/http.js';

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

  const { uid: targetUid, consultorioId, modo } = body;

  if (!targetUid) {
    return jsonResponse(res, 400, { error: 'uid del profesional requerido.' });
  }
  if (!consultorioId) {
    return jsonResponse(res, 400, { error: 'consultorioId requerido.' });
  }
  if (modo !== 'retirar' && modo !== 'eliminar') {
    return jsonResponse(res, 400, {
      error: 'modo invalido. Debe ser "retirar" (soft delete) o "eliminar" (hard delete).',
    });
  }
  if (targetUid === callerUid) {
    return jsonResponse(res, 400, {
      error: 'No podés eliminarte a vos mismo desde acá.',
    });
  }

  const db = getFirestore();

  const callerSnap = await db.collection('usuarios').doc(callerUid).get();
  if (!callerSnap.exists) {
    return jsonResponse(res, 403, { error: 'Tu usuario no existe.' });
  }
  const callerData = callerSnap.data();
  if (callerData.rol !== 'superadmin') {
    return jsonResponse(res, 403, {
      error: 'Solo superadmins pueden ejecutar esta acción.',
      codigo: 'NO_ES_SUPERADMIN',
    });
  }

  const consSnap = await db.collection('consultorios').doc(consultorioId).get();
  if (!consSnap.exists) {
    return jsonResponse(res, 404, { error: 'El consultorio no existe.' });
  }
  const consData = consSnap.data();

  const targetSnap = await db.collection('usuarios').doc(targetUid).get();
  if (!targetSnap.exists) {
    return jsonResponse(res, 404, { error: 'El usuario no existe.' });
  }
  const targetData = targetSnap.data();

  if (targetData.consultorioId !== consultorioId) {
    return jsonResponse(res, 400, {
      error: 'Este usuario no pertenece al consultorio indicado.',
    });
  }
  if (targetData.rol !== 'profesional' && targetData.rol !== 'admin') {
    return jsonResponse(res, 400, {
      error: 'Solo se pueden retirar/eliminar profesionales o admins, no superadmins.',
    });
  }
  if (consData.ownerUid === targetUid) {
    return jsonResponse(res, 400, {
      error: 'No podés eliminar al dueño del consultorio. Para esto, eliminá el consultorio entero o pedí transferir ownership primero.',
      codigo: 'ES_OWNER',
    });
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
    return jsonResponse(res, 400, {
      error: `El profesional tiene ${todasDebidas.size} sesión${todasDebidas.size === 1 ? '' : 'es'} debida${todasDebidas.size === 1 ? '' : 's'} ` +
        `por un total de $${total.toLocaleString('es-AR')}. Pedile que salde la deuda antes de eliminarlo.`,
      codigo: 'DEUDA_PENDIENTE',
      deuda: { cantidad: todasDebidas.size, total },
    });
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
    `[eliminar-profesional] ${modo === 'retirar' ? 'Retirado' : 'Eliminado'} ` +
    `${targetEmail} del consultorio ${consultorioId} por superadmin ${callerData.email || callerUid}.`,
  );

  return jsonResponse(res, 200, {
    ok: true,
    ...opResultado,
  });
}
