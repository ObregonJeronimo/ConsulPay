/**
 * Servicio de configuración del consultorio
 *
 * Permite al admin editar los datos básicos del consultorio y los métodos de pago.
 */

import { doc, updateDoc } from 'firebase/firestore';

import { db } from './firebase.js';

/**
 * Actualiza datos básicos del consultorio.
 * Solo campos NO-sensibles (las Security Rules bloquean plan/mpConfig/etc.).
 */
export async function actualizarDatosConsultorio(consultorioId, datos) {
  const permitidos = [
    'nombre',
    'direccion',
    'telefono',
    'email',
    'cuit',
    'cbuTransferencia',
    'aliasTransferencia',
  ];

  const update = {};
  for (const campo of permitidos) {
    if (datos[campo] !== undefined) {
      update[campo] = typeof datos[campo] === 'string' ? datos[campo].trim() : datos[campo];
    }
  }

  await updateDoc(doc(db, 'consultorios', consultorioId), update);
}

/**
 * Reemplaza completamente el array de métodos de pago del consultorio.
 */
export async function actualizarMetodosPago(consultorioId, metodos) {
  // Validaciones básicas
  if (!Array.isArray(metodos)) throw new Error('Los métodos deben ser un array');

  for (const m of metodos) {
    if (!m.id || !m.nombre) throw new Error('Cada método necesita id y nombre');
    if (!['inmediato', 'diferido'].includes(m.tipo)) {
      throw new Error(`Tipo inválido en método "${m.nombre}"`);
    }
    const p = Number(m.porcentajeConsultorio);
    if (!Number.isFinite(p) || p < 0 || p > 100) {
      throw new Error(`% inválido en método "${m.nombre}"`);
    }
  }

  await updateDoc(doc(db, 'consultorios', consultorioId), {
    metodosPagoPaciente: metodos,
  });
}

/**
 * Genera un id razonable a partir de un nombre.
 * "Particular Especial" → "particular_especial"
 */
export function slugFromNombre(nombre) {
  return nombre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    || `metodo_${Date.now()}`;
}
