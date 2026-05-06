/**
 * Servicio de gestión de consultorios
 *
 * Encapsula la creación del consultorio y el "upgrade" del usuario
 * actual a admin/owner de ese consultorio.
 */

import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';

import { db } from './firebase.js';
import { obtenerConfigGlobal } from './configGlobal.js';
import { ESTADOS_CONSULTORIO, ESTADOS_USUARIO, PLANES, ROLES } from './constants.js';

/**
 * Crea un nuevo consultorio y asigna al usuario actual como owner/admin.
 *
 * Operación atómica (transaction):
 *  1. Crea doc en /consultorios/{consultorioId}
 *  2. Actualiza /usuarios/{uid} con rol=admin, consultorioId=nuevo, estado=activo
 *
 * Si algo falla, ambos cambios se revierten.
 *
 * @param {Object} params
 * @param {string} params.ownerUid - uid del usuario logueado
 * @param {string} params.nombreConsultorio
 * @param {string} [params.direccion]
 * @param {string} [params.telefono]
 * @param {string} [params.cuit]
 * @param {Array} params.metodosPagoPaciente - [{id, nombre, porcentajeConsultorio, valorSesionDefault}]
 * @param {string} [params.cbuTransferencia]
 * @param {string} [params.aliasTransferencia]
 * @returns {Promise<{consultorioId: string}>}
 */
export async function crearConsultorio(params) {
  const {
    ownerUid,
    nombreConsultorio,
    direccion = '',
    telefono = '',
    cuit = '',
    metodosPagoPaciente = [],
    cbuTransferencia = '',
    aliasTransferencia = '',
  } = params;

  if (!ownerUid) throw new Error('ownerUid requerido');
  if (!nombreConsultorio?.trim()) throw new Error('El nombre del consultorio es obligatorio');

  // Leemos las comisiones globales (free y pro) ANTES de la transaction.
  // Si no existe el doc /config/global, usa los defaults de fabrica (1%/0.5%).
  // El consultorio se crea con AMBOS valores porque cuando suba a Pro va a
  // necesitar el comisionPro ya configurado. Si falla la lectura, usamos
  // los defaults — no es critico bloquear la creacion del consultorio.
  let comisionFreeInicial = 1;  // fallback nuevo modelo
  let comisionProInicial = 0.5; // fallback nuevo modelo
  try {
    const configGlobal = await obtenerConfigGlobal();
    comisionFreeInicial = configGlobal.comisionFree;
    comisionProInicial = configGlobal.comisionPro;
  } catch (err) {
    console.warn('No se pudo leer config global, usando defaults 1%/0.5%:', err);
  }

  // Genero un id nuevo para el consultorio
  const consultorioRef = doc(db, 'consultorios', crypto.randomUUID());
  const userRef = doc(db, 'usuarios', ownerUid);

  await runTransaction(db, async (tx) => {
    const userSnap = await tx.get(userRef);
    if (!userSnap.exists()) {
      throw new Error('Tu usuario no existe. Recargá la página.');
    }

    const userData = userSnap.data();

    // Chequeo idempotencia: si el usuario ya tiene un consultorio, abortar.
    // Esto evita que un doble-click o reintento cree 2 consultorios.
    if (userData.consultorioId) {
      throw new Error(
        'Ya pertenecés a un consultorio. Si es un error, contactá a soporte.',
      );
    }

    // 1. Crear el consultorio
    tx.set(consultorioRef, {
      nombre: nombreConsultorio.trim(),
      direccion: direccion.trim(),
      telefono: telefono.trim(),
      cuit: cuit.trim(),
      ownerUid,
      adminUids: [ownerUid],
      plan: PLANES.FREE,
      planVenceEn: null,
      // Modelo nuevo: ambos campos por consultorio. El backend resuelve
      // cual usar segun el plan actual al cobrar.
      comisionFree: comisionFreeInicial,
      comisionPro: comisionProInicial,
      mpIntegrado: false,
      mpConfig: null,
      ualaIntegrado: false,
      ualaConfig: null,
      cbuTransferencia: cbuTransferencia.trim(),
      aliasTransferencia: aliasTransferencia.trim(),
      metodosPagoPaciente,
      estado: ESTADOS_CONSULTORIO.ACTIVO,
      createdAt: serverTimestamp(),
      createdByUid: ownerUid,
    });

    // 2. Promover al usuario a admin de ese consultorio
    tx.update(userRef, {
      rol: ROLES.ADMIN,
      consultorioId: consultorioRef.id,
      estado: ESTADOS_USUARIO.ACTIVO,
    });
  });

  return { consultorioId: consultorioRef.id };
}
