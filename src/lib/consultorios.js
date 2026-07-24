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
   Directorio de administradores
   ----------------------------------------------------------------
   Un profesional NO puede leer /usuarios de otros miembros (ver las
   security rules), asi que no tiene forma de saber como se llaman los
   administradores. Pero SI puede leer el doc del consultorio. Por eso
   los nombres se denormalizan aca: es el unico lugar que las dos
   partes pueden ver sin abrir la lectura de /usuarios.

   Cada admin mantiene su propia entrada al entrar a la app. No hay un
   proceso que lo sincronice todo junto: si un admin cambia su nombre,
   la proxima vez que abre ConsulPay se corrige solo.
   ============================================================ */
export async function sincronizarDirectorioAdmins(consultorioId, admin) {
  if (!consultorioId || !admin?.uid || !admin?.nombre) return;

  const ref = doc(db, 'consultorios', consultorioId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const data = snap.data();
  // Solo los administradores figuran en el directorio.
  if (!(data.adminUids || []).includes(admin.uid)) return;

  const actual = Array.isArray(data.adminsDirectorio) ? data.adminsDirectorio : [];
  const mio = actual.find((a) => a.uid === admin.uid);
  if (mio && mio.nombre === admin.nombre) return; // ya esta al dia

  // Se reescribe la entrada propia y se descartan las de quienes ya no
  // son admins, para que el selector no ofrezca a alguien que se fue.
  const limpio = actual.filter((a) => a.uid !== admin.uid && (data.adminUids || []).includes(a.uid));
  await updateDoc(ref, {
    adminsDirectorio: [...limpio, { uid: admin.uid, nombre: admin.nombre }],
  });
}
