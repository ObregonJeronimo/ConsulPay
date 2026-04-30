/**
 * /api/super/eliminar-consultorio
 *
 * Elimina un consultorio y TODOS sus datos relacionados en cascada.
 * Solo accesible para superadmins.
 *
 * Restricciones:
 *  - El caller debe ser superadmin.
 *  - El consultorio debe estar en plan='free' SIN suscripcion activa.
 *    Si tiene plan='pro' o subscription.status en authorized/pending,
 *    el delete se rechaza con un mensaje pidiendo cancelar primero.
 *
 * Que se elimina (en cascada):
 *  1. /sesiones donde consultorioId == X
 *  2. /pacientes donde consultorioId == X
 *  3. /pagos_consultorio donde consultorioId == X
 *  4. /pagos_mensualidad donde consultorioId == X
 *  5. /solicitudes_sesion donde consultorioId == X
 *  6. /logs_sesion donde consultorioId == X
 *  7. /invitaciones_profesional donde consultorioId == X
 *  8. /usuarios donde consultorioId == X (profesionales y admins
 *     de este consultorio - hard delete del doc, no de la cuenta
 *     de Firebase Auth)
 *  9. /consultorios/{id}
 *
 * IMPORTANTE: NO borra cuentas de Firebase Auth (eso requeriria
 * permisos especiales y no esta en el scope de este feature). Si
 * un user intenta loguearse despues, ensureUserDoc() le va a crear
 * un doc nuevo en estado 'pendiente' sin consultorio.
 *
 * Modelo MULTI-CONSULTORIO: hoy cada user tiene consultorioId:string
 * (singular), asi que cada user pertenece a UN solo consultorio. Si
 * en el futuro se implementa multi-consultorio (con array), hay que
 * ajustar: en lugar de borrar el doc del user, sacarlo del array.
 *
 * Body: { consultorioId }
 * Header: Authorization: Bearer <firebase_id_token>
 * Devuelve: { ok: true, deleted: { consultorios, usuarios, sesiones, ... } }
 */

import { getFirestore } from 'firebase-admin/firestore';

import { verificarAuthHeader } from '../_lib/auth.js';
import { initAdmin } from '../_lib/firebase-admin.js';
import { jsonResponse, readJsonBody } from '../_lib/http.js';

/**
 * Borra todos los docs de una coleccion que matcheen una query.
 * Usa batch delete de Firestore con paginacion para no exceder el
 * limite de 500 ops por batch.
 *
 * @param {Firestore} db
 * @param {string} collectionName
 * @param {Array<[string, any, any]>} whereClauses - ej: [['consultorioId', '==', 'xxx']]
 * @returns {Promise<number>} cantidad de docs borrados
 */
async function borrarCollectionWhere(db, collectionName, whereClauses) {
  const BATCH_SIZE = 400; // <500 para tener margen
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

    // Si se borraron menos de BATCH_SIZE, ya no hay mas
    if (snap.size < BATCH_SIZE) break;
  }

  return totalBorrados;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return jsonResponse(res, 405, { error: 'Method not allowed' });
  }

  let uid;
  try {
    initAdmin();
    uid = await verificarAuthHeader(req);
  } catch (err) {
    return jsonResponse(res, err.status || 500, { error: err.message });
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return jsonResponse(res, 400, { error: 'Body invalido.' });
  }

  const { consultorioId } = body;
  if (!consultorioId) {
    return jsonResponse(res, 400, { error: 'consultorioId requerido.' });
  }

  const db = getFirestore();

  // ---------- 1. Validar que el caller sea superadmin ----------
  const userSnap = await db.collection('usuarios').doc(uid).get();
  if (!userSnap.exists) {
    return jsonResponse(res, 403, { error: 'Tu usuario no existe.' });
  }
  const userData = userSnap.data();
  if (userData.rol !== 'superadmin') {
    return jsonResponse(res, 403, {
      error: 'Solo superadmins pueden eliminar consultorios.',
      codigo: 'NO_ES_SUPERADMIN',
    });
  }

  // ---------- 2. Cargar consultorio y validar plan + suscripcion ----------
  const consSnap = await db.collection('consultorios').doc(consultorioId).get();
  if (!consSnap.exists) {
    return jsonResponse(res, 404, { error: 'El consultorio no existe.' });
  }
  const consData = consSnap.data();

  // Solo permitimos eliminar consultorios FREE sin suscripcion activa.
  // Esto evita problemas con suscripciones de MP que seguirian cobrando
  // a un consultorio inexistente. El dueño del consultorio Pro tiene
  // que cancelar su suscripcion antes (lo hace desde su Configuracion).
  if (consData.plan === 'pro') {
    return jsonResponse(res, 400, {
      error: 'Este consultorio tiene Plan Pro activo. Pediile al dueño que cancele su suscripción antes de eliminarlo.',
      codigo: 'PLAN_PRO_ACTIVO',
    });
  }

  const sub = consData.subscription;
  if (sub && (
    sub.status === 'authorized'
    || sub.status === 'pending_authorization'
    || sub.status === 'in_grace'
  )) {
    return jsonResponse(res, 400, {
      error: 'Este consultorio tiene una suscripción activa o pendiente. Pediile al dueño que la cancele en su Configuración antes de eliminarlo.',
      codigo: 'SUSCRIPCION_ACTIVA',
      subStatus: sub.status,
    });
  }

  // ---------- 3. Borrar en cascada ----------
  // Orden importante: primero las colecciones con datos satelite
  // (sesiones, pagos, etc.), despues los usuarios, y al final el
  // consultorio mismo. Si algo falla en el medio, queda parcialmente
  // borrado pero el doc del consultorio sigue existiendo (mejor que
  // borrar el consultorio y dejar datos huerfanos).

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
    // Datos transaccionales del consultorio
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

    // Usuarios del consultorio (profesionales + admins).
    // En el modelo actual cada user tiene consultorioId:string (singular).
    // Cuando se implemente multi-consultorio (array), aca habria que
    // hacer un updateDoc sacando el id del array en lugar de delete.
    deleted.usuarios = await borrarCollectionWhere(db, 'usuarios',
      [['consultorioId', '==', consultorioId]]);

    // El consultorio mismo, al final.
    await db.collection('consultorios').doc(consultorioId).delete();
    deleted.consultorios = 1;
  } catch (err) {
    console.error('[eliminar-consultorio] Error en cascada:', err);
    return jsonResponse(res, 500, {
      error: 'Error eliminando datos del consultorio. Algunos datos pueden haberse borrado parcialmente.',
      codigo: 'CASCADE_ERROR',
      deleted, // devolvemos lo que ya se borro para diagnostico
      detalle: err.message,
    });
  }

  // ---------- 4. Log para auditoria ----------
  console.log(
    `[eliminar-consultorio] Consultorio ${consultorioId} (${consData.nombre || 'sin nombre'}) ` +
    `eliminado por superadmin ${userData.email || uid}. Resumen: ${JSON.stringify(deleted)}`,
  );

  return jsonResponse(res, 200, { ok: true, deleted });
}
