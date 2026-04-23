/**
 * Servicio de pacientes del consultorio
 *
 * Los pacientes son creados por el admin. Cada paciente se asigna a un
 * profesional (editable) y tiene un método de pago principal (editable).
 *
 * Modelo:
 *   pacientes/{pacienteId}
 *     consultorioId, profesionalUid,
 *     nombre, apellido, dni, telefono, email,
 *     obraSocialNumero, metodoPagoId, valorSesionCustom,
 *     notas, estado, createdAt, createdByUid, updatedAt
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
   Crear paciente
   ============================================================ */
export async function crearPaciente({
  consultorioId,
  profesionalUid,
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
  if (!profesionalUid) throw new Error('Tenés que asignar un profesional');
  if (!metodoPagoId) throw new Error('Tenés que elegir un método de pago');
  if (!nombre?.trim()) throw new Error('El nombre es obligatorio');
  if (!apellido?.trim()) throw new Error('El apellido es obligatorio');

  const data = {
    consultorioId,
    profesionalUid,
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
  const permitidos = [
    'profesionalUid',
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
  for (const c of permitidos) {
    if (campos[c] === undefined) continue;
    if (typeof campos[c] === 'string') {
      const trimmed = campos[c].trim();
      update[c] = trimmed === '' ? null : (c === 'email' ? trimmed.toLowerCase() : trimmed);
    } else {
      update[c] = campos[c];
    }
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

/** Solo los pacientes asignados a un profesional específico */
export function suscribirPacientesProfesional(profesionalUid, callback) {
  const q = query(
    collection(db, 'pacientes'),
    where('profesionalUid', '==', profesionalUid),
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
