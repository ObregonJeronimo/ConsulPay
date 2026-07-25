/**
 * Servicio de gestión de consultorios
 *
 * Encapsula la creación del consultorio y el "upgrade" del usuario
 * actual a admin/owner de ese consultorio.
 */

import { doc, getDoc, runTransaction, serverTimestamp, updateDoc } from 'firebase/firestore';

import { db } from './firebase.js';
import { obtenerConfigGlobal } from './configGlobal.js';
import {
  ESTADOS_CONSULTORIO,
  ESTADOS_USUARIO,
  MODELO_REPARTO_DEFAULT,
  MODELOS_REPARTO,
  PLANES,
  ROLES,
} from './constants.js';

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
    modeloReparto = MODELO_REPARTO_DEFAULT,
  } = params;

  if (!ownerUid) throw new Error('ownerUid requerido');
  if (!nombreConsultorio?.trim()) throw new Error('El nombre del consultorio es obligatorio');

  // Blindaje: solo aceptamos valores válidos del enum. Cualquier otra cosa
  // cae al modelo clásico para no dejar el consultorio en un estado inválido.
  const modeloResuelto = Object.values(MODELOS_REPARTO).includes(modeloReparto)
    ? modeloReparto
    : MODELO_REPARTO_DEFAULT;

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
      /* Directorio de nombres visibles para el profesional, sembrado desde
         el minuto cero. Se mantiene despues en lib/admins.js al promover o
         remover administradores. */
      adminsDirectorio: [{
        uid: ownerUid,
        nombre: userData.displayName || userData.email || ownerUid,
      }],
      // Modelo de circulación del dinero (ver MODELOS_REPARTO en constants).
      // Se elige al crear el consultorio y condiciona el comportamiento de
      // los paneles. Inmutable por ahora desde la UI (se podría permitir
      // cambiarlo más adelante desde Configuración con las validaciones del caso).
      modeloReparto: modeloResuelto,
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

/* ============================================================
   Directorio de administradores — reparacion para consultorios viejos
   ----------------------------------------------------------------
   El directorio se mantiene solo: se siembra al crear el consultorio y
   se actualiza en lib/admins.js cuando se promueve o remueve un admin.
   Un consultorio nuevo NO necesita que nadie entre a la app.

   Esta funcion existe solo para los consultorios que ya existian antes
   de que el campo se creara, y para reparar el dato si quedo desfasado
   (por ejemplo, un admin que cambio su displayName). Corre al abrir la
   app y no escribe nada si ya esta al dia.
   ============================================================ */
export async function sincronizarDirectorioAdmins(consultorioId, admin) {
  if (!consultorioId || !admin?.uid) return;

  const ref = doc(db, 'consultorios', consultorioId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const data = snap.data();
  const adminUids = data.adminUids || [];
  // Solo un admin puede leer /usuarios de los demas miembros y escribir el
  // doc del consultorio. Si quien entra no es admin, no hay nada que hacer.
  if (!adminUids.includes(admin.uid)) return;

  /* Se publica el directorio COMPLETO, no solo la entrada propia: un admin
     puede leer los /usuarios de todo su consultorio, asi que con que entre
     uno alcanza para que el profesional vea los dos nombres. Antes cada uno
     publicaba lo suyo y la lista quedaba a medias hasta que entraran todos. */
  const entradas = [];
  for (const uid of adminUids) {
    if (uid === admin.uid) {
      const propio = admin.nombre || uid;
      entradas.push({ uid, nombre: propio });
      continue;
    }
    try {
      const u = await getDoc(doc(db, 'usuarios', uid));
      const d = u.exists() ? u.data() : null;
      const nombre = d?.displayName || d?.email;
      if (nombre) entradas.push({ uid, nombre });
    } catch {
      // Un admin que no se puede leer no rompe el resto del directorio.
    }
  }
  if (entradas.length === 0) return;

  // Solo se escribe si algo cambio, para no pegarle a Firestore en cada carga.
  const actual = Array.isArray(data.adminsDirectorio) ? data.adminsDirectorio : [];
  const igual = actual.length === entradas.length
    && entradas.every((e) => actual.some((a) => a.uid === e.uid && a.nombre === e.nombre));
  if (igual) return;

  await updateDoc(ref, { adminsDirectorio: entradas });
}
