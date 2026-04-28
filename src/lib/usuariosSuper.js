/**
 * Servicio de usuarios y consultorios para el panel super-admin.
 *
 * Hace lecturas batch (una vez al cargar la pagina, sin onSnapshot)
 * para mostrar el panorama completo de usuarios agrupados por
 * consultorio. Las acciones simples (suspender / reactivar) viven
 * en este mismo archivo para mantener todo lo del panel super junto.
 */

import {
  collection,
  doc,
  getDocs,
  updateDoc,
} from 'firebase/firestore';

import { db } from './firebase.js';
import { ESTADOS_USUARIO, ROLES } from './constants.js';

/**
 * Trae TODOS los usuarios y consultorios del sistema, una sola vez.
 *
 * No usa onSnapshot porque:
 *  - El panel super-admin se abre de a ratos, no se mira live.
 *  - Suscripciones live a colecciones enteras son caras (cobra cada
 *    cambio en cualquier doc).
 *  - Un boton "Refrescar" cubre el 99% de los casos.
 *
 * @returns {Promise<{ usuarios: Array, consultorios: Array }>}
 */
export async function cargarPanoramaSuper() {
  const [usuariosSnap, consultoriosSnap] = await Promise.all([
    getDocs(collection(db, 'usuarios')),
    getDocs(collection(db, 'consultorios')),
  ]);

  const usuarios = usuariosSnap.docs.map((d) => ({ uid: d.id, ...d.data() }));
  const consultorios = consultoriosSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  return { usuarios, consultorios };
}

/**
 * Agrupa usuarios por consultorio, dejando 3 categorias especiales:
 *   - superadmins (sin consultorioId, rol=superadmin)
 *   - sin consultorio (sin consultorioId, rol distinto a superadmin) — usuarios huerfanos
 *   - por consultorio (con consultorioId, agrupados)
 *
 * Devuelve una estructura facil de renderizar:
 * {
 *   superadmins: [...users],
 *   huerfanos: [...users],
 *   porConsultorio: [
 *     { consultorio: {...}, miembros: [...users] },
 *     ...
 *   ]
 * }
 *
 * Cada miembro va enriquecido con un flag esOwner derivado del
 * consultorio.ownerUid. Los miembros de cada consultorio se ordenan:
 *   admins primero (owner primero entre admins), luego profesionales
 *   activos por nombre, luego suspendidos, luego retirados.
 */
export function agruparUsuariosPorConsultorio(usuarios, consultorios) {
  const mapaCons = new Map(consultorios.map((c) => [c.id, c]));

  const superadmins = [];
  const huerfanos = [];
  const buckets = new Map(); // consultorioId -> array de miembros

  for (const u of usuarios) {
    if (u.rol === ROLES.SUPERADMIN) {
      superadmins.push(u);
      continue;
    }
    if (!u.consultorioId || !mapaCons.has(u.consultorioId)) {
      huerfanos.push(u);
      continue;
    }
    if (!buckets.has(u.consultorioId)) {
      buckets.set(u.consultorioId, []);
    }
    buckets.get(u.consultorioId).push(u);
  }

  const porConsultorio = [];
  // Orden de consultorios: por nombre alfabetico
  const consOrdenados = [...consultorios].sort((a, b) =>
    (a.nombre || '').localeCompare(b.nombre || '', 'es'),
  );

  for (const cons of consOrdenados) {
    const miembrosRaw = buckets.get(cons.id) || [];
    const adminUids = new Set(cons.adminUids || []);
    const ownerUid = cons.ownerUid;

    const miembros = miembrosRaw
      .map((u) => ({
        ...u,
        esAdminDelConsultorio: adminUids.has(u.uid),
        esOwner: u.uid === ownerUid,
      }))
      .sort(ordenMiembros);

    porConsultorio.push({ consultorio: cons, miembros });
  }

  // Sort de superadmins y huerfanos por nombre
  superadmins.sort((a, b) => nombreVisible(a).localeCompare(nombreVisible(b), 'es'));
  huerfanos.sort((a, b) => nombreVisible(a).localeCompare(nombreVisible(b), 'es'));

  return { superadmins, huerfanos, porConsultorio };
}

/**
 * Orden de miembros dentro de un consultorio:
 *   1. Owner primero (si existe)
 *   2. Otros admins (alfabetico)
 *   3. Profesionales activos (alfabetico)
 *   4. Pendientes (alfabetico)
 *   5. Suspendidos (alfabetico)
 *   6. Retirados (alfabetico)
 */
function ordenMiembros(a, b) {
  const peso = (m) => {
    if (m.esOwner) return 0;
    if (m.esAdminDelConsultorio) return 1;
    if (m.estado === ESTADOS_USUARIO.ACTIVO) return 2;
    if (m.estado === ESTADOS_USUARIO.PENDIENTE) return 3;
    if (m.estado === ESTADOS_USUARIO.SUSPENDIDO) return 4;
    if (m.estado === ESTADOS_USUARIO.RETIRADO) return 5;
    return 6;
  };
  const pa = peso(a);
  const pb = peso(b);
  if (pa !== pb) return pa - pb;
  return nombreVisible(a).localeCompare(nombreVisible(b), 'es');
}

export function nombreVisible(u) {
  return u.displayName || u.email || `Usuario ${(u.uid || '').slice(0, 6)}`;
}

/* ============================================================
   Acciones simples (super-admin)
   ----------------------------------------------------------------
   Read-only es la regla, pero permitimos suspender/reactivar como
   acciones administrativas basicas. NO permitimos cambiar rol ni
   consultorioId desde aca por riesgos de inconsistencia.
   ============================================================ */

/**
 * Suspende un usuario (no importa el rol).
 * Las rules permiten porque sos superadmin.
 */
export async function suspenderUsuarioSuper(uid) {
  if (!uid) throw new Error('uid requerido');
  await updateDoc(doc(db, 'usuarios', uid), {
    estado: ESTADOS_USUARIO.SUSPENDIDO,
  });
}

/**
 * Reactiva un usuario suspendido o retirado.
 * Lo deja en estado=activo. NO modifica rol ni consultorioId.
 */
export async function reactivarUsuarioSuper(uid) {
  if (!uid) throw new Error('uid requerido');
  await updateDoc(doc(db, 'usuarios', uid), {
    estado: ESTADOS_USUARIO.ACTIVO,
  });
}
