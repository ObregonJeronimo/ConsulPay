/**
 * Servicio de pacientes del consultorio
 *
 * Los pacientes son creados por el admin. Cada paciente se asigna a UNO O
 * VARIOS profesionales (editable) y tiene un método de pago principal.
 *
 * Modelo:
 *   pacientes/{pacienteId}
 *     consultorioId, profesionalesUids[],
 *     nombre, apellido, dni, telefono, email,
 *     obraSocialNumero, metodoPagoId, valorSesionCustom,
 *     notas, estado, createdAt, createdByUid, updatedAt
 *
 * IMPORTANTE — N:N profesional ↔ paciente:
 *   - Un paciente puede tener 1, 2 o N profesionales asignados.
 *   - Una SESION sigue siendo 1:1 (la atiende un solo profesional).
 *   - Las queries del profesional usan array-contains sobre
 *     profesionalesUids combinado con consultorioId (las rules
 *     requieren ambos campos en la query).
 *
 * Migracion (2026-04): el campo viejo `profesionalUid: string` fue
 * reemplazado por `profesionalesUids: string[]`. Pacientes anteriores
 * a esa fecha fueron migrados via script de consola.
 */

import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';

import { db } from './firebase.js';
import { ESTADOS_PACIENTE } from './constants.js';

/* ============================================================
   Helpers internos
   ============================================================ */

/**
 * Normaliza el array de profesionales para guardar en Firestore.
 * Acepta tanto un string (legacy) como un array. Devuelve siempre
 * array sin duplicados ni vacíos.
 */
function normalizarProfesionales(input) {
  if (!input) return [];
  const arr = Array.isArray(input) ? input : [input];
  // Filtrar vacios y deduplicar manteniendo el orden
  const visto = new Set();
  const out = [];
  for (const uid of arr) {
    if (typeof uid !== 'string' || !uid.trim()) continue;
    const u = uid.trim();
    if (visto.has(u)) continue;
    visto.add(u);
    out.push(u);
  }
  return out;
}

/* ============================================================
   Crear paciente
   ============================================================ */
export async function crearPaciente({
  consultorioId,
  profesionalesUids,   // array de UIDs (puede tambien recibir profesionalUid singular legacy)
  profesionalUid,      // backwards compat — si llega esto, lo wrappemos en array
  nombre,
  apellido,
  dni,
  telefono,
  email,
  obraSocialNumero,
  metodoPagoId,
  valorSesionCustom,
  notas,
  createdByUid,
}) {
  if (!consultorioId) throw new Error('consultorioId requerido');

  // Aceptar ambos formatos para que llamadas legacy no se rompan
  const profesionales = normalizarProfesionales(profesionalesUids ?? profesionalUid);
  if (profesionales.length === 0) {
    throw new Error('Tenés que asignar al menos un profesional');
  }

  if (!metodoPagoId) throw new Error('Tenés que elegir un método de pago');
  if (!nombre?.trim()) throw new Error('El nombre es obligatorio');
  if (!apellido?.trim()) throw new Error('El apellido es obligatorio');

  const data = {
    consultorioId,
    profesionalesUids: profesionales,
    nombre: nombre.trim(),
    apellido: apellido.trim(),
    dni: dni?.trim() || null,
    telefono: telefono?.trim() || null,
    email: email?.trim().toLowerCase() || null,
    obraSocialNumero: obraSocialNumero?.trim() || null,
    metodoPagoId,
    valorSesionCustom: valorSesionCustom
      ? Number(valorSesionCustom)
      : null,
    notas: notas?.trim() || null,
    estado: ESTADOS_PACIENTE.ACTIVO,
    createdAt: serverTimestamp(),
    createdByUid: createdByUid ?? null,
    updatedAt: serverTimestamp(),
  };

  const ref = await addDoc(collection(db, 'pacientes'), data);
  return ref.id;
}

/* ============================================================
   Actualizar paciente
   ============================================================ */
export async function actualizarPaciente(pacienteId, campos) {
  const permitidosString = [
    'nombre',
    'apellido',
    'dni',
    'telefono',
    'email',
    'obraSocialNumero',
    'metodoPagoId',
    'notas',
    'estado',
  ];

  const update = { updatedAt: serverTimestamp() };

  // Campos string normales
  for (const c of permitidosString) {
    if (campos[c] === undefined) continue;
    if (typeof campos[c] === 'string') {
      const trimmed = campos[c].trim();
      update[c] = trimmed === '' ? null : (c === 'email' ? trimmed.toLowerCase() : trimmed);
    } else {
      update[c] = campos[c];
    }
  }

  // Campo array: profesionalesUids
  if (campos.profesionalesUids !== undefined) {
    const profesionales = normalizarProfesionales(campos.profesionalesUids);
    if (profesionales.length === 0) {
      throw new Error('El paciente debe tener al menos un profesional asignado');
    }
    update.profesionalesUids = profesionales;
  }

  // Backwards compat por si algun caller viejo manda profesionalUid singular
  if (campos.profesionalUid !== undefined && campos.profesionalesUids === undefined) {
    const profesionales = normalizarProfesionales(campos.profesionalUid);
    if (profesionales.length === 0) {
      throw new Error('El paciente debe tener al menos un profesional asignado');
    }
    update.profesionalesUids = profesionales;
  }

  await updateDoc(doc(db, 'pacientes', pacienteId), update);
}

/* ============================================================
   Archivar paciente (baja lógica)
   ============================================================ */
export async function archivarPaciente(pacienteId) {
  await updateDoc(doc(db, 'pacientes', pacienteId), {
    estado: ESTADOS_PACIENTE.ARCHIVADO,
    updatedAt: serverTimestamp(),
  });
}

export async function reactivarPaciente(pacienteId) {
  await updateDoc(doc(db, 'pacientes', pacienteId), {
    estado: ESTADOS_PACIENTE.ACTIVO,
    updatedAt: serverTimestamp(),
  });
}

/* ============================================================
   Suscripciones live
   ============================================================ */

/** Todos los pacientes del consultorio (vista admin) */
export function suscribirPacientesConsultorio(consultorioId, callback) {
  const q = query(
    collection(db, 'pacientes'),
    where('consultorioId', '==', consultorioId),
  );
  return onSnapshot(q, (snap) => {
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    list.sort((a, b) => {
      const an = `${a.apellido ?? ''} ${a.nombre ?? ''}`.toLowerCase();
      const bn = `${b.apellido ?? ''} ${b.nombre ?? ''}`.toLowerCase();
      return an.localeCompare(bn, 'es');
    });
    callback(list);
  }, (err) => {
    console.error('Error en suscripción de pacientes:', err);
    callback([]);
  });
}

/**
 * Solo los pacientes asignados a un profesional específico dentro de su consultorio.
 *
 * IMPORTANTE: usamos `array-contains` sobre profesionalesUids combinado con
 * `consultorioId` igualdad, porque las Security Rules requieren que la query
 * filtre por TODOS los campos que la rule usa para decidir acceso. La rule
 * de lectura usa `resource.data.consultorioId` y `request.auth.uid in
 * resource.data.profesionalesUids`, asi que la query tiene que tener ambos.
 *
 * Limite Firestore: solo se puede usar UN array-contains por query. Como
 * solo filtramos por un UID a la vez, no hay problema.
 */
export function suscribirPacientesProfesional(profesionalUid, consultorioId, callback) {
  if (!profesionalUid || !consultorioId) {
    // Sin los dos datos no podemos armar una query que pase las rules.
    callback([]);
    return () => {};
  }

  const q = query(
    collection(db, 'pacientes'),
    where('consultorioId', '==', consultorioId),
    where('profesionalesUids', 'array-contains', profesionalUid),
  );
  return onSnapshot(q, (snap) => {
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    list.sort((a, b) => {
      const an = `${a.apellido ?? ''} ${a.nombre ?? ''}`.toLowerCase();
      const bn = `${b.apellido ?? ''} ${b.nombre ?? ''}`.toLowerCase();
      return an.localeCompare(bn, 'es');
    });
    callback(list);
  }, (err) => {
    console.error('Error en suscripción de pacientes del profesional:', err);
    callback([]);
  });
}

/* ============================================================
   Helpers de presentacion
   ============================================================ */

/**
 * Devuelve la lista de UIDs de profesionales asignados al paciente,
 * con backwards compat para docs viejos que aun tengan profesionalUid
 * singular (no deberia haber ninguno post-migracion, pero por las dudas).
 */
export function getProfesionalesUids(paciente) {
  if (Array.isArray(paciente?.profesionalesUids)) {
    return paciente.profesionalesUids;
  }
  if (typeof paciente?.profesionalUid === 'string' && paciente.profesionalUid) {
    return [paciente.profesionalUid];
  }
  return [];
}
