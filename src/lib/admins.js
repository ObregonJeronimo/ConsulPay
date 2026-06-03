/**
 * Servicio de gestión de admins de un consultorio (Multi-Admin)
 *
 * Permite que un consultorio tenga HASTA 2 admins (no más), todos iguales
 * en permisos pero preservando la distincion del Owner original (dueño
 * legal).
 *
 * LIMITE DE 2 ADMINS
 * ----------------------------------------------------------------
 * El sistema permite hasta 2 admins por consultorio. La razon es que
 * cuando hay 2 admins, ConsulPay habilita el flow de "reparto entre
 * administradores" con doble cuenta MP conectada y rotacion del 15
 * al 15 de cada mes. Esa logica solo funciona limpia con exactamente
 * 2 admins.
 *
 * Si en el futuro se quiere soportar 3+ admins, hay que repensar la
 * estrategia de reparto (split 1:N de MP, etc.). Por ahora, 2 es el
 * limite duro tanto en cliente como en firestore.rules.
 *
 * MODELO DE DATOS
 * ----------------------------------------------------------------
 *   /consultorios/{consultorioId}
 *     ownerUid:  string         <- dueño legal, original/transferido
 *     adminUids: string[]       <- TODOS los admins (incluido el owner)
 *                                  HARD LIMIT: maximo 2 elementos
 *
 *   /usuarios/{uid}
 *     rol: 'admin' | 'profesional' | 'superadmin'
 *     consultorioId: string     <- el consultorio "activo" del user
 *                                  (multi-consultorio futuro lo refactorea)
 *     estado: 'activo' | ...
 *
 * INVARIANTES (las rules tambien las enforcen):
 *   1. ownerUid SIEMPRE esta en adminUids
 *   2. adminUids nunca queda vacio
 *   3. adminUids.length <= 2 (NUEVO)
 *   4. Solo el owner puede transferir ownership
 *
 * Todas las operaciones son atomicas (Firestore transactions).
 */

import { arrayRemove, arrayUnion, doc, runTransaction, serverTimestamp } from 'firebase/firestore';

import { db } from './firebase.js';
import { ESTADOS_USUARIO, ROLES } from './constants.js';

/**
 * Maximo de admins permitidos por consultorio.
 *
 * Cambiar este valor requiere ademas:
 *  - Actualizar firestore.rules con el mismo limite
 *  - Repensar la logica de reparto en /admin/reparto (hoy asume 2 fijos)
 *  - Repensar slots primary/secondary de mpConfigs
 */
export const MAX_ADMINS_POR_CONSULTORIO = 2;

/* ============================================================
   Helper interno: validar que el caller tenga permisos
   ============================================================ */

/**
 * Lee el doc del consultorio y valida que el caller (callerUid) sea admin.
 * Lanza error con mensaje claro si no lo es.
 *
 * Usado dentro de transactions para asegurar consistencia.
 */
function validarCallerEsAdmin(consData, callerUid) {
  if (!consData) {
    throw new Error('El consultorio no existe.');
  }
  const adminUids = consData.adminUids || [];
  if (!adminUids.includes(callerUid)) {
    throw new Error('No sos administrador de este consultorio.');
  }
}

/**
 * Valida que el caller sea el OWNER del consultorio.
 */
function validarCallerEsOwner(consData, callerUid) {
  if (!consData) {
    throw new Error('El consultorio no existe.');
  }
  if (consData.ownerUid !== callerUid) {
    throw new Error('Solo el dueño del consultorio puede realizar esta acción.');
  }
}

/* ============================================================
   API publica
   ============================================================ */

/**
 * Promueve a un usuario existente a admin del consultorio.
 *
 * Operacion atomica:
 *   1. Lee el consultorio y el usuario destino
 *   2. Valida permisos del caller (debe ser admin del consultorio)
 *   3. Valida que el destino exista y sea elegible (rol profesional o admin
 *      del MISMO consultorio; no se pueden traer admins de otros consultorios)
 *   4. Valida que el consultorio tenga menos de MAX_ADMINS_POR_CONSULTORIO
 *      admins (limite duro: 2). Si ya tiene 2, lanza error claro.
 *   5. Agrega uid al adminUids del consultorio
 *   6. Actualiza /usuarios/{uid} para reflejar rol=admin (si era profesional)
 *
 * El destino tiene que tener consultorioId del consultorio (fue invitado y
 * acepto antes). Si no, no se puede promover — el flujo de invitacion sigue
 * siendo el mismo (api/invitar-profesional).
 *
 * @param {Object} params
 * @param {string} params.consultorioId
 * @param {string} params.callerUid     - quien hace la operacion (debe ser admin)
 * @param {string} params.nuevoUid      - uid del usuario a promover
 *
 * @throws Error si ya hay 2 admins, si el usuario no pertenece al consultorio,
 *               si no esta activo, o si ya es admin.
 */
export async function promoverAAdmin({ consultorioId, callerUid, nuevoUid }) {
  if (!consultorioId) throw new Error('consultorioId requerido');
  if (!callerUid) throw new Error('callerUid requerido');
  if (!nuevoUid) throw new Error('nuevoUid requerido');
  if (callerUid === nuevoUid) {
    throw new Error('No podés promoverte a vos mismo: ya sos admin.');
  }

  const consRef = doc(db, 'consultorios', consultorioId);
  const userRef = doc(db, 'usuarios', nuevoUid);

  await runTransaction(db, async (tx) => {
    const consSnap = await tx.get(consRef);
    const userSnap = await tx.get(userRef);

    const consData = consSnap.exists() ? consSnap.data() : null;
    validarCallerEsAdmin(consData, callerUid);

    if (!userSnap.exists()) {
      throw new Error('El usuario que querés promover no existe.');
    }
    const userData = userSnap.data();

    if (userData.consultorioId !== consultorioId) {
      throw new Error(
        'Solo podés promover a un usuario que ya pertenezca a este consultorio. ' +
        'Si todavía no fue invitado, mandale primero una invitación de profesional.'
      );
    }

    if (userData.estado !== ESTADOS_USUARIO.ACTIVO) {
      throw new Error('El usuario no está activo en el consultorio.');
    }

    const adminUids = consData.adminUids || [];
    if (adminUids.includes(nuevoUid)) {
      throw new Error('Este usuario ya es administrador del consultorio.');
    }

    // Limite de 2 admins por consultorio. Esta validacion existe en
    // 3 lugares: aqui (UX inmediato), en firestore.rules (seguridad),
    // y en la UI (deshabilitar boton). Los 3 son necesarios porque las
    // rules no dan mensajes de error amigables al usuario.
    if (adminUids.length >= MAX_ADMINS_POR_CONSULTORIO) {
      throw new Error(
        `El consultorio ya tiene el máximo de ${MAX_ADMINS_POR_CONSULTORIO} administradores. ` +
        'Si querés promover a otro usuario, primero tenés que remover a uno de los actuales.'
      );
    }

    // 1. Agregar al array de admins del consultorio
    tx.update(consRef, {
      adminUids: arrayUnion(nuevoUid),
      updatedAt: serverTimestamp(),
    });

    // 2. Actualizar el doc del usuario:
    //    rol = admin (si era profesional)
    //    Mantenemos consultorioId, estado, etc. — solo subimos el rol.
    if (userData.rol !== ROLES.ADMIN) {
      tx.update(userRef, {
        rol: ROLES.ADMIN,
      });
    }
  });
}

/**
 * Promueve un profesional a coadmin del consultorio.
 * El coadmin tiene los mismos permisos que admin en la UI pero:
 *  - NO se agrega a adminUids (no participa del reparto ni de "quién recibió")
 *  - Solo el admin dueño puede promover a coadmin
 *  - El coadmin NO puede promover a otros a coadmin
 */
export async function promoverACoadmin({ consultorioId, callerUid, nuevoUid }) {
  if (!consultorioId) throw new Error('consultorioId requerido');
  if (!callerUid) throw new Error('callerUid requerido');
  if (!nuevoUid) throw new Error('nuevoUid requerido');
  if (callerUid === nuevoUid) throw new Error('No podés promoverte a vos mismo.');

  const consRef = doc(db, 'consultorios', consultorioId);
  const userRef = doc(db, 'usuarios', nuevoUid);

  await runTransaction(db, async (tx) => {
    const consSnap = await tx.get(consRef);
    const userSnap = await tx.get(userRef);

    const consData = consSnap.exists() ? consSnap.data() : null;
    validarCallerEsAdmin(consData, callerUid);

    if (!userSnap.exists()) throw new Error('El usuario no existe.');
    const userData = userSnap.data();

    if (userData.consultorioId !== consultorioId) {
      throw new Error('El usuario no pertenece a este consultorio.');
    }
    if (userData.estado !== ESTADOS_USUARIO.ACTIVO) {
      throw new Error('El usuario no está activo.');
    }
    if (userData.rol === ROLES.COADMIN) {
      throw new Error('Este usuario ya es coadmin.');
    }
    if (userData.rol === ROLES.ADMIN) {
      throw new Error('Este usuario ya es admin.');
    }

    // Solo cambia el rol — NO toca adminUids
    tx.update(userRef, { rol: ROLES.COADMIN });
  });
}

/**
 * Revierte un coadmin a profesional.
 */
export async function revertirCoadmin({ consultorioId, callerUid, uidCoadmin }) {
  if (callerUid === uidCoadmin) throw new Error('No podés revertirte a vos mismo.');

  const consRef = doc(db, 'consultorios', consultorioId);
  const userRef = doc(db, 'usuarios', uidCoadmin);

  await runTransaction(db, async (tx) => {
    const consSnap = await tx.get(consRef);
    validarCallerEsAdmin(consSnap.data(), callerUid);

    const userSnap = await tx.get(userRef);
    if (!userSnap.exists() || userSnap.data().rol !== ROLES.COADMIN) {
      throw new Error('El usuario no es coadmin.');
    }
    tx.update(userRef, { rol: ROLES.PROFESIONAL });
  });
}

/**
 * Remueve a un admin del consultorio.
 *
 * Casos cubiertos:
 *   1. El caller (admin) remueve a OTRO admin
 *   2. El caller (admin) se remueve a SI MISMO ("salir como admin")
 *
 * NO se puede:
 *   - Remover al owner (ownerUid). Antes hay que transferir ownership.
 *   - Dejar adminUids vacio.
 *
 * Despues de remover, el ex-admin queda como profesional en el mismo
 * consultorio (rol=profesional, consultorioId sin cambios). Si el caller
 * quiere expulsarlo del consultorio completamente, eso es otra operacion
 * (M4: estado=retirado).
 *
 * NOTA sobre el reparto: si el consultorio tenia 2 admins y se baja a 1,
 * el flow de "reparto entre administradores" se desactiva automaticamente. Los
 * registros historicos de compensaciones se preservan (ver
 * /consultorios/{id}/compensaciones — esos docs no se borran nunca).
 *
 * @param {Object} params
 * @param {string} params.consultorioId
 * @param {string} params.callerUid          - quien ejecuta (debe ser admin)
 * @param {string} params.uidARemover        - uid del admin a remover
 */
export async function removerAdmin({ consultorioId, callerUid, uidARemover }) {
  if (!consultorioId) throw new Error('consultorioId requerido');
  if (!callerUid) throw new Error('callerUid requerido');
  if (!uidARemover) throw new Error('uidARemover requerido');

  const consRef = doc(db, 'consultorios', consultorioId);
  const userRef = doc(db, 'usuarios', uidARemover);

  await runTransaction(db, async (tx) => {
    const consSnap = await tx.get(consRef);
    const userSnap = await tx.get(userRef);

    const consData = consSnap.exists() ? consSnap.data() : null;
    validarCallerEsAdmin(consData, callerUid);

    const adminUids = consData.adminUids || [];

    if (!adminUids.includes(uidARemover)) {
      throw new Error('Ese usuario no es administrador.');
    }

    // No se puede remover al owner
    if (consData.ownerUid === uidARemover) {
      throw new Error(
        'No podés remover al dueño del consultorio. ' +
        'Antes tenés que transferir el ownership a otro administrador.'
      );
    }

    // No dejar el array vacio
    if (adminUids.length <= 1) {
      throw new Error('Tiene que quedar al menos un administrador.');
    }

    // 1. Sacar del array
    tx.update(consRef, {
      adminUids: arrayRemove(uidARemover),
      updatedAt: serverTimestamp(),
    });

    // 2. Bajar de rol al ex-admin: pasa a profesional.
    //    Mantenemos consultorioId — sigue perteneciendo al consultorio,
    //    solo deja de tener privilegios de admin. Si el admin quiere
    //    sacarlo del consultorio completamente, eso es M4 (retirado).
    if (userSnap.exists()) {
      tx.update(userRef, {
        rol: ROLES.PROFESIONAL,
      });
    }
  });
}

/**
 * Transfiere el ownership del consultorio a otro admin.
 *
 * Reglas:
 *   - Solo el owner actual (callerUid === ownerUid) puede transferir.
 *   - El nuevo owner debe ser un admin actual del consultorio.
 *   - El owner viejo NO se remueve de adminUids — sigue siendo admin
 *     normal. Si quiere salir tambien, despues hace removerAdmin.
 *
 * @param {Object} params
 * @param {string} params.consultorioId
 * @param {string} params.callerUid          - debe ser el owner actual
 * @param {string} params.nuevoOwnerUid
 */
export async function transferirOwnership({ consultorioId, callerUid, nuevoOwnerUid }) {
  if (!consultorioId) throw new Error('consultorioId requerido');
  if (!callerUid) throw new Error('callerUid requerido');
  if (!nuevoOwnerUid) throw new Error('nuevoOwnerUid requerido');
  if (callerUid === nuevoOwnerUid) {
    throw new Error('Ya sos el dueño actual.');
  }

  const consRef = doc(db, 'consultorios', consultorioId);

  await runTransaction(db, async (tx) => {
    const consSnap = await tx.get(consRef);
    const consData = consSnap.exists() ? consSnap.data() : null;

    validarCallerEsOwner(consData, callerUid);

    const adminUids = consData.adminUids || [];
    if (!adminUids.includes(nuevoOwnerUid)) {
      throw new Error(
        'El nuevo dueño tiene que ser un administrador actual del consultorio. ' +
        'Promovelo primero antes de transferir ownership.'
      );
    }

    tx.update(consRef, {
      ownerUid: nuevoOwnerUid,
      updatedAt: serverTimestamp(),
    });
  });
}
