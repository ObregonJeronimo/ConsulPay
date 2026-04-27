/**
 * Servicio de logs de auditoria de sesiones (Fase C)
 *
 * Cada accion sobre una sesion (crear, modificar, eliminar, cambiar
 * estado de pago) o sobre una solicitud (crear, aprobar, rechazar,
 * marcar obsoleta) escribe un doc en logs_sesion. Esto da trazabilidad
 * total: quien hizo que, cuando, con que datos.
 *
 * Modelo:
 *   logs_sesion/{logId}
 *     consultorioId, sesionId (puede ser null si la sesion fue
 *       eliminada o si es de una solicitud aun no aplicada),
 *     solicitudId (null si no aplica),
 *     tipo: TIPOS_LOG_SESION,
 *     actorUid (quien hizo la accion),
 *     actorRol ('admin' | 'profesional' | 'superadmin'),
 *     actorNombre (snapshot del nombre, util si despues lo eliminan),
 *     descripcion (texto humano armado en el frontend),
 *     payloadAnterior, payloadNuevo (snapshots de los datos),
 *     createdAt
 *
 * IMPORTANTE: los logs son inmutables — solo se crean, nunca se
 * modifican ni se eliminan. Las rules lo refuerzan.
 */

import {
  addDoc,
  collection,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
} from 'firebase/firestore';

import { db } from './firebase.js';
import { TIPOS_LOG_SESION } from './constants.js';

/**
 * Escribe un log de auditoria. Funcion generica que reciben los
 * servicios de sesiones y solicitudes.
 *
 * @param {object} params
 * @param {string} params.consultorioId
 * @param {string|null} params.sesionId
 * @param {string|null} params.solicitudId
 * @param {string} params.tipo  - uno de TIPOS_LOG_SESION
 * @param {string} params.actorUid
 * @param {string} params.actorRol
 * @param {string} params.actorNombre
 * @param {string} params.descripcion
 * @param {object|null} [params.payloadAnterior]
 * @param {object|null} [params.payloadNuevo]
 */
export async function escribirLog({
  consultorioId,
  sesionId = null,
  solicitudId = null,
  tipo,
  actorUid,
  actorRol,
  actorNombre,
  descripcion,
  payloadAnterior = null,
  payloadNuevo = null,
}) {
  if (!consultorioId) throw new Error('consultorioId requerido para log');
  if (!tipo) throw new Error('tipo requerido para log');
  if (!actorUid) throw new Error('actorUid requerido para log');

  await addDoc(collection(db, 'logs_sesion'), {
    consultorioId,
    sesionId,
    solicitudId,
    tipo,
    actorUid,
    actorRol: actorRol || null,
    actorNombre: actorNombre || null,
    descripcion: descripcion || '',
    payloadAnterior,
    payloadNuevo,
    createdAt: serverTimestamp(),
  });
}

/* ============================================================
   Suscripciones
   ============================================================ */

/**
 * Logs de una sesion especifica, ordenados de mas reciente a mas viejo.
 * Para mostrar en el modal de detalle de sesion.
 */
export function suscribirLogsDeSesion(consultorioId, sesionId, callback) {
  if (!consultorioId || !sesionId) {
    callback([]);
    return () => {};
  }
  const q = query(
    collection(db, 'logs_sesion'),
    where('consultorioId', '==', consultorioId),
    where('sesionId', '==', sesionId),
    orderBy('createdAt', 'desc'),
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }, (err) => {
    console.error('Error en suscripcion de logs de sesion:', err);
    callback([]);
  });
}

/**
 * Logs de una solicitud especifica.
 */
export function suscribirLogsDeSolicitud(consultorioId, solicitudId, callback) {
  if (!consultorioId || !solicitudId) {
    callback([]);
    return () => {};
  }
  const q = query(
    collection(db, 'logs_sesion'),
    where('consultorioId', '==', consultorioId),
    where('solicitudId', '==', solicitudId),
    orderBy('createdAt', 'desc'),
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }, (err) => {
    console.error('Error en suscripcion de logs de solicitud:', err);
    callback([]);
  });
}

/* ============================================================
   Re-export de tipos para uso comodo desde paginas
   ============================================================ */
export { TIPOS_LOG_SESION };
