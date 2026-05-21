/**
 * lib/recordatorios.js
 *
 * Modelo de datos:
 *
 * /recordatorios/{recordatorioId}
 *   consultorioId: string
 *   titulo: string
 *   descripcion: string
 *   destinatarios: string[]   — UIDs de profesionales
 *   creadoPorUid: string
 *   ciclo: {
 *     tipo: 'semanal' | 'quincenal' | 'mensual' | 'dia_del_mes'
 *     cada?: number            — para semanal/mensual: cada N semanas/meses
 *     dia?: number             — para dia_del_mes: dia 1-28
 *   }
 *   activo: boolean
 *   createdAt: Timestamp
 *   updatedAt: Timestamp
 *
 * /recordatorios_instancias/{instanciaId}
 *   recordatorioId: string
 *   consultorioId: string
 *   profesionalUid: string
 *   titulo: string             — snapshot
 *   descripcion: string        — snapshot
 *   estado: 'pendiente' | 'aceptado'
 *   creadaEn: Timestamp        — cuando se generó esta instancia
 *   aceptadaEn: Timestamp|null — cuando el profesional la aceptó
 *   expiraEn: Timestamp|null   — 15 días después de aceptar, se oculta
 *   proximaEn: Timestamp       — cuando se debe generar la siguiente instancia
 */

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';

import { db } from './firebase.js';

/* ---- Constantes ---- */
export const TIPOS_CICLO = {
  SEMANAL: 'semanal',
  QUINCENAL: 'quincenal',
  MENSUAL: 'mensual',
  DIA_DEL_MES: 'dia_del_mes',
};

export const LABELS_CICLO = {
  semanal: 'Cada N semanas',
  quincenal: 'Cada 2 semanas (quincenal)',
  mensual: 'Cada N meses',
  dia_del_mes: 'El día X de cada mes',
};

const DIAS_EXPIRACION = 15;

/* ============================================================
   Calcular próxima aparición desde una fecha base
   ============================================================ */
export function calcularProximaAparicion(ciclo, desde = new Date()) {
  const d = new Date(desde);

  switch (ciclo.tipo) {
    case TIPOS_CICLO.SEMANAL: {
      const semanas = Math.max(1, ciclo.cada ?? 1);
      d.setDate(d.getDate() + semanas * 7);
      return d;
    }
    case TIPOS_CICLO.QUINCENAL: {
      d.setDate(d.getDate() + 14);
      return d;
    }
    case TIPOS_CICLO.MENSUAL: {
      const meses = Math.max(1, ciclo.cada ?? 1);
      d.setMonth(d.getMonth() + meses);
      return d;
    }
    case TIPOS_CICLO.DIA_DEL_MES: {
      const dia = Math.min(31, Math.max(1, ciclo.dia ?? 1));
      d.setMonth(d.getMonth() + 1);
      d.setDate(dia);
      return d;
    }
    default:
      return d;
  }
}

/* ============================================================
   Texto legible del ciclo
   ============================================================ */
export function labelCiclo(ciclo) {
  if (!ciclo) return '';
  switch (ciclo.tipo) {
    case TIPOS_CICLO.SEMANAL:
      return `Cada ${ciclo.cada ?? 1} semana${(ciclo.cada ?? 1) === 1 ? '' : 's'}`;
    case TIPOS_CICLO.QUINCENAL:
      return 'Cada 2 semanas';
    case TIPOS_CICLO.MENSUAL:
      return `Cada ${ciclo.cada ?? 1} mes${(ciclo.cada ?? 1) === 1 ? '' : 'es'}`;
    case TIPOS_CICLO.DIA_DEL_MES:
      return `El día ${ciclo.dia ?? 1} de cada mes`;
    default:
      return '';
  }
}

/* ============================================================
   CRUD de recordatorios
   ============================================================ */

export async function crearRecordatorio({
  consultorioId,
  titulo,
  descripcion,
  destinatarios,   // string[]
  ciclo,
  creadoPorUid,
}) {
  if (!titulo?.trim()) throw new Error('El título es obligatorio');
  if (!destinatarios?.length) throw new Error('Seleccioná al menos un profesional');
  if (!ciclo?.tipo) throw new Error('Definí la frecuencia del recordatorio');

  const ref = await addDoc(collection(db, 'recordatorios'), {
    consultorioId,
    titulo: titulo.trim(),
    descripcion: descripcion?.trim() || '',
    destinatarios,
    ciclo,
    creadoPorUid,
    activo: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // Crear la primera instancia para cada destinatario (aparición inmediata)
  await generarInstancias(ref.id, {
    consultorioId,
    titulo: titulo.trim(),
    descripcion: descripcion?.trim() || '',
    destinatarios,
    ciclo,
  });

  return ref.id;
}

export async function actualizarRecordatorio(recordatorioId, {
  titulo,
  descripcion,
  ciclo,
}) {
  await updateDoc(doc(db, 'recordatorios', recordatorioId), {
    titulo: titulo.trim(),
    descripcion: descripcion?.trim() || '',
    ciclo,
    updatedAt: serverTimestamp(),
  });
}

export async function eliminarRecordatorio(recordatorioId) {
  await deleteDoc(doc(db, 'recordatorios', recordatorioId));
  // Las instancias existentes se dejan — el profesional las puede seguir viendo
  // hasta que expiren naturalmente
}

export async function toggleActivoRecordatorio(recordatorioId, activo) {
  await updateDoc(doc(db, 'recordatorios', recordatorioId), {
    activo,
    updatedAt: serverTimestamp(),
  });
}

/* ============================================================
   Instancias
   ============================================================ */

/**
 * Genera una instancia por cada destinatario del recordatorio.
 * La proximaEn se calcula desde ahora según el ciclo.
 */
async function generarInstancias(recordatorioId, { consultorioId, titulo, descripcion, destinatarios, ciclo }) {
  const batch = writeBatch(db);
  const ahora = new Date();

  for (const profesionalUid of destinatarios) {
    const ref = doc(collection(db, 'recordatorios_instancias'));
    batch.set(ref, {
      recordatorioId,
      consultorioId,
      profesionalUid,
      titulo,
      descripcion,
      ciclo,                              // snapshot — necesario para generar la siguiente instancia al aceptar
      estado: 'pendiente',
      creadaEn: Timestamp.fromDate(ahora),
      aceptadaEn: null,
      expiraEn: null,
      proximaEn: Timestamp.fromDate(ahora),
    });
  }
  await batch.commit();
}

/**
 * El profesional acepta una instancia.
 * Se marca como aceptada y se calcula expiraEn (+15 días).
 * También genera la siguiente instancia según el ciclo del recordatorio padre.
 */
export async function aceptarInstancia(instanciaId, instancia, cicloArg) {
  const ahora = new Date();
  const expiraEn = new Date(ahora);
  expiraEn.setDate(expiraEn.getDate() + DIAS_EXPIRACION);

  await updateDoc(doc(db, 'recordatorios_instancias', instanciaId), {
    estado: 'aceptado',
    aceptadaEn: Timestamp.fromDate(ahora),
    expiraEn: Timestamp.fromDate(expiraEn),
  });

  // Determinar el ciclo: primero del snapshot de la instancia,
  // si no existe (instancias viejas pre-fix) leer del doc padre.
  let ciclo = cicloArg ?? instancia.ciclo ?? null;
  if (!ciclo && instancia.recordatorioId) {
    const padreSnap = await getDoc(doc(db, 'recordatorios', instancia.recordatorioId));
    if (padreSnap.exists()) ciclo = padreSnap.data().ciclo ?? null;
  }

  // Generar la siguiente instancia si hay ciclo
  if (ciclo) {
    const proximaEn = calcularProximaAparicion(ciclo, ahora);
    await addDoc(collection(db, 'recordatorios_instancias'), {
      recordatorioId: instancia.recordatorioId,
      consultorioId: instancia.consultorioId,
      profesionalUid: instancia.profesionalUid,
      titulo: instancia.titulo,
      descripcion: instancia.descripcion,
      ciclo,
      estado: 'pendiente',
      creadaEn: Timestamp.fromDate(ahora),
      aceptadaEn: null,
      expiraEn: null,
      proximaEn: Timestamp.fromDate(proximaEn),
    });
  }
}

/* ============================================================
   Suscripciones
   ============================================================ */

/** Todos los recordatorios del consultorio (para admin) */
export function suscribirRecordatoriosConsultorio(consultorioId, callback) {
  const q = query(
    collection(db, 'recordatorios'),
    where('consultorioId', '==', consultorioId),
  );
  return onSnapshot(q, (snap) => {
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    list.sort((a, b) => {
      const ta = a.createdAt?.seconds ?? 0;
      const tb = b.createdAt?.seconds ?? 0;
      return tb - ta;
    });
    callback(list);
  });
}

/** Recordatorios creados por el profesional (su propia vista de admin) */
export function suscribirRecordatoriosPropios(profesionalUid, consultorioId, callback) {
  const q = query(
    collection(db, 'recordatorios'),
    where('consultorioId', '==', consultorioId),
    where('creadoPorUid', '==', profesionalUid),
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

/**
 * Instancias visibles para un profesional:
 * - estado 'pendiente' → siempre visible
 * - estado 'aceptado' → visible hasta expiraEn (15 días)
 * - proximaEn ya pasó → hay que mostrarla (es una nueva vuelta del ciclo)
 */
export function suscribirInstanciasProfesional(profesionalUid, consultorioId, callback) {
  const q = query(
    collection(db, 'recordatorios_instancias'),
    where('profesionalUid', '==', profesionalUid),
    where('consultorioId', '==', consultorioId),
  );
  return onSnapshot(q, (snap) => {
    const ahora = new Date();
    const list = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((inst) => {
        if (inst.estado === 'pendiente') {
          // Solo mostrar si ya llegó la fecha de aparición
          const proxima = inst.proximaEn?.toDate
            ? inst.proximaEn.toDate()
            : inst.proximaEn?.seconds
              ? new Date(inst.proximaEn.seconds * 1000)
              : null;
          // Si no tiene proximaEn, mostrar siempre (instancia inicial)
          if (proxima && proxima > ahora) return false;
        }
        // Ocultar si ya expiró (aceptado hace más de 15 días)
        if (inst.expiraEn) {
          const expira = inst.expiraEn.toDate ? inst.expiraEn.toDate() : new Date(inst.expiraEn.seconds * 1000);
          if (expira < ahora) return false;
        }
        return true;
      });
    list.sort((a, b) => {
      // Pendientes primero
      if (a.estado === 'pendiente' && b.estado !== 'pendiente') return -1;
      if (b.estado === 'pendiente' && a.estado !== 'pendiente') return 1;
      return 0;
    });
    callback(list);
  });
}
