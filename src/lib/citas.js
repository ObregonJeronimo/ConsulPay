/**
 * Servicio de citas (agenda del consultorio)
 *
 * Solo aplica al modelo de reparto "recepcion_cobra": la recepcion es
 * quien maneja la agenda y agenda turnos a cada profesional. El
 * profesional ve su agenda en modo lectura.
 *
 * MODELO DE DATOS
 *
 *   /citas/{citaId}
 *     consultorioId, profesionalUid,
 *     pacienteId       -> ficha de paciente, o null si todavia no existe
 *     pacienteNombre   -> denormalizado, para pintar el calendario sin lookups
 *     fecha            -> 'YYYY-MM-DD' (string, no Timestamp: la agenda es
 *                         local al consultorio y comparar strings evita
 *                         problemas de zona horaria)
 *     hora             -> 'HH:mm'
 *     duracionMin, notas, estado, serieId, createdAt/By, updatedAt
 *
 *   /series_citas/{serieId}
 *     La regla de repeticion, para poder editar/eliminar la serie completa
 *     y para extender las series sin fecha de fin.
 *
 * POR QUE SE MATERIALIZAN LAS CITAS
 *
 * Cada ocurrencia de una serie se guarda como una cita concreta en vez de
 * calcularse al vuelo desde la regla. Es mas costoso en escrituras pero
 * permite mover, cancelar o reasignar un turno suelto sin romper el resto
 * de la serie — que es exactamente lo que pasa todo el tiempo en un
 * consultorio real. Para las series sin fecha de fin generamos una ventana
 * movil (VENTANA_SIN_FIN_MESES) que se extiende sola.
 */

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';

import { db } from './firebase.js';

export const ESTADOS_CITA = {
  AGENDADA: 'agendada',
  ASISTIO: 'asistio',
  AUSENTE: 'ausente',
  CANCELADA: 'cancelada',
};

export const TIPOS_REPETICION = {
  SEMANAL: 'semanal',       // por dia/s de la semana, cada N semanas
  CADA_N_DIAS: 'cada_n_dias',
  MENSUAL: 'mensual',       // mismo dia del mes, cada N meses
};

export const TIPOS_FIN = {
  CANTIDAD: 'cantidad',
  FECHA: 'fecha',
  SIN_FIN: 'sin_fin',
};

/** Cuanto se genera hacia adelante en las series sin fecha de fin. */
export const VENTANA_SIN_FIN_MESES = 3;

/** Tope duro de ocurrencias por generacion, para no crear miles de docs. */
const MAX_OCURRENCIAS = 120;

/* ============================================================
   Helpers de fecha — trabajamos con 'YYYY-MM-DD' en horario local
   ============================================================ */

export function aKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function desdeKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Dia de la semana 1..7 (lunes..domingo), que es como lo piensa la gente. */
export function diaSemana(date) {
  const js = date.getDay();
  return js === 0 ? 7 : js;
}

export function primerDiaDelMes(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function ultimoDiaDelMes(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

/**
 * Las 42 celdas (6 semanas) de una grilla mensual que arranca en lunes.
 * Devolver siempre 42 evita que la grilla cambie de alto al navegar.
 */
export function grillaDelMes(date) {
  const primero = primerDiaDelMes(date);
  const offset = diaSemana(primero) - 1;
  const inicio = new Date(primero);
  inicio.setDate(primero.getDate() - offset);

  const dias = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(inicio);
    d.setDate(inicio.getDate() + i);
    dias.push(d);
  }
  return dias;
}

/* ============================================================
   Motor de repeticion
   ============================================================ */

/**
 * Calcula las fechas de una serie a partir de la regla.
 *
 * @param {string} desde - 'YYYY-MM-DD' de la primera cita
 * @param {Object} regla - { tipo, cada, diasSemana[] }
 * @param {Object} fin   - { tipo, cantidad, hasta }
 * @returns {string[]} fechas 'YYYY-MM-DD'
 */
export function calcularOcurrencias(desde, regla, fin) {
  const inicio = desdeKey(desde);
  const fechas = [];

  // Tope segun el tipo de fin. Sin fin => ventana movil de N meses.
  let limiteFecha = null;
  let limiteCantidad = MAX_OCURRENCIAS;

  if (fin.tipo === TIPOS_FIN.CANTIDAD) {
    limiteCantidad = Math.min(Math.max(1, Number(fin.cantidad) || 1), MAX_OCURRENCIAS);
  } else if (fin.tipo === TIPOS_FIN.FECHA && fin.hasta) {
    limiteFecha = fin.hasta;
  } else {
    const tope = new Date(inicio);
    tope.setMonth(tope.getMonth() + VENTANA_SIN_FIN_MESES);
    limiteFecha = aKey(tope);
  }

  const cada = Math.max(1, Number(regla.cada) || 1);

  if (regla.tipo === TIPOS_REPETICION.SEMANAL) {
    const dias = (regla.diasSemana || []).map(Number).filter((n) => n >= 1 && n <= 7);
    if (dias.length === 0) return [aKey(inicio)];

    // Recorremos semana por semana desde el lunes de la semana inicial.
    const lunes = new Date(inicio);
    lunes.setDate(inicio.getDate() - (diaSemana(inicio) - 1));

    let semana = 0;
    while (fechas.length < limiteCantidad && semana < 260) {
      for (const dia of [...dias].sort((a, b) => a - b)) {
        const d = new Date(lunes);
        d.setDate(lunes.getDate() + (semana * 7 * cada) + (dia - 1));
        const key = aKey(d);
        if (key < desde) continue;
        if (limiteFecha && key > limiteFecha) return fechas;
        if (fechas.length >= limiteCantidad) return fechas;
        fechas.push(key);
      }
      semana++;
    }
    return fechas;
  }

  if (regla.tipo === TIPOS_REPETICION.CADA_N_DIAS) {
    const d = new Date(inicio);
    while (fechas.length < limiteCantidad) {
      const key = aKey(d);
      if (limiteFecha && key > limiteFecha) break;
      fechas.push(key);
      d.setDate(d.getDate() + cada);
    }
    return fechas;
  }

  if (regla.tipo === TIPOS_REPETICION.MENSUAL) {
    const diaObjetivo = inicio.getDate();
    let i = 0;
    while (fechas.length < limiteCantidad && i < 240) {
      const d = new Date(inicio.getFullYear(), inicio.getMonth() + (i * cada), 1);
      // Si el mes no llega al dia objetivo (ej: 31 en febrero), usamos el ultimo.
      const ultimo = ultimoDiaDelMes(d).getDate();
      d.setDate(Math.min(diaObjetivo, ultimo));
      const key = aKey(d);
      i++;
      if (key < desde) continue;
      if (limiteFecha && key > limiteFecha) break;
      fechas.push(key);
    }
    return fechas;
  }

  return [aKey(inicio)];
}

/** Texto en lenguaje natural de la regla, para confirmar antes de guardar. */
export function describirRepeticion(regla, fin, fechaBase) {
  const NOMBRES = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados', 'domingos'];
  const cada = Math.max(1, Number(regla.cada) || 1);
  let frecuencia = '';

  if (regla.tipo === TIPOS_REPETICION.SEMANAL) {
    const dias = [...(regla.diasSemana || [])].sort((a, b) => a - b).map((d) => NOMBRES[d - 1]);
    const lista = dias.length === 0
      ? '—'
      : dias.length === 1
        ? dias[0]
        : `${dias.slice(0, -1).join(', ')} y ${dias[dias.length - 1]}`;
    frecuencia = cada === 1
      ? `todas las semanas los ${lista}`
      : `cada ${cada} semanas los ${lista}`;
  } else if (regla.tipo === TIPOS_REPETICION.CADA_N_DIAS) {
    frecuencia = cada === 1 ? 'todos los días' : `cada ${cada} días`;
  } else if (regla.tipo === TIPOS_REPETICION.MENSUAL) {
    const dia = fechaBase ? desdeKey(fechaBase).getDate() : '—';
    frecuencia = cada === 1
      ? `todos los ${dia} de cada mes`
      : `el día ${dia} cada ${cada} meses`;
  }

  let cierre = '';
  if (fin.tipo === TIPOS_FIN.CANTIDAD) {
    const n = Math.max(1, Number(fin.cantidad) || 1);
    cierre = `${n} ${n === 1 ? 'vez' : 'veces'}`;
  } else if (fin.tipo === TIPOS_FIN.FECHA) {
    cierre = fin.hasta ? `hasta el ${desdeKey(fin.hasta).toLocaleDateString('es-AR')}` : 'hasta una fecha a definir';
  } else {
    cierre = `sin fecha de fin (se agendan los próximos ${VENTANA_SIN_FIN_MESES} meses y se extiende solo)`;
  }

  return `Se agenda ${frecuencia} · ${cierre}`;
}

/* ============================================================
   Lectura
   ============================================================ */

/**
 * Suscripcion a las citas del consultorio dentro de un rango de fechas.
 * Filtramos por consultorioId en el query y el rango en memoria para no
 * depender de un indice compuesto (los volumenes por consultorio son
 * chicos: decenas de citas por mes).
 */
export function suscribirCitas(consultorioId, { desde, hasta }, callback) {
  if (!consultorioId) return () => {};

  const q = query(collection(db, 'citas'), where('consultorioId', '==', consultorioId));

  return onSnapshot(q, (snap) => {
    const citas = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((c) => (!desde || c.fecha >= desde) && (!hasta || c.fecha <= hasta))
      .sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));
    callback(citas);
  }, (err) => {
    console.error('Error en suscripción de citas:', err);
    callback([]);
  });
}

/**
 * Citas de un profesional puntual.
 *
 * IMPORTANTE: el filtro por profesionalUid va en el query y no en memoria.
 * Las reglas de seguridad solo dejan al profesional leer sus propias citas,
 * y Firestore evalua eso contra el query, no contra los resultados: si
 * pidieramos todas las del consultorio para filtrarlas despues, rechazaria
 * la consulta entera con permission-denied.
 */
export function suscribirCitasProfesional(consultorioId, profesionalUid, { desde, hasta }, callback) {
  if (!consultorioId || !profesionalUid) return () => {};

  const q = query(
    collection(db, 'citas'),
    where('consultorioId', '==', consultorioId),
    where('profesionalUid', '==', profesionalUid),
  );

  return onSnapshot(q, (snap) => {
    const citas = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((c) => (!desde || c.fecha >= desde) && (!hasta || c.fecha <= hasta))
      .sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));
    callback(citas);
  }, (err) => {
    console.error('Error en suscripción de citas del profesional:', err);
    callback([]);
  });
}

/* ============================================================
   Escritura
   ============================================================ */

function limpiarDatos(datos) {
  return {
    profesionalUid: datos.profesionalUid,
    pacienteId: datos.pacienteId ?? null,
    pacienteNombre: (datos.pacienteNombre || '').trim(),
    fecha: datos.fecha,
    hora: datos.hora,
    duracionMin: Number(datos.duracionMin) || 45,
    notas: (datos.notas || '').trim(),
  };
}

function validar(datos) {
  if (!datos.profesionalUid) throw new Error('Elegí un profesional.');
  if (!datos.pacienteNombre) throw new Error('Elegí un paciente o escribí un nombre.');
  if (!datos.fecha) throw new Error('Elegí una fecha.');
  if (!datos.hora) throw new Error('Elegí un horario.');
}

/** Crea una cita suelta. */
export async function crearCita(consultorioId, datos, creadaPorUid) {
  const limpio = limpiarDatos(datos);
  validar(limpio);

  const ref = await addDoc(collection(db, 'citas'), {
    ...limpio,
    consultorioId,
    estado: ESTADOS_CITA.AGENDADA,
    serieId: null,
    creadaPorUid: creadaPorUid ?? null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return { citaId: ref.id };
}

/**
 * Crea una serie: guarda la regla y materializa cada ocurrencia.
 * Se usa un batch para que sea todo o nada.
 */
export async function crearSerieCitas(consultorioId, datos, repeticion, creadaPorUid) {
  const limpio = limpiarDatos(datos);
  validar(limpio);

  const { regla, fin } = repeticion;
  const fechas = calcularOcurrencias(limpio.fecha, regla, fin);
  if (fechas.length === 0) throw new Error('La repetición no genera ninguna fecha. Revisá la configuración.');

  const serieRef = doc(collection(db, 'series_citas'));
  const batch = writeBatch(db);

  batch.set(serieRef, {
    consultorioId,
    profesionalUid: limpio.profesionalUid,
    pacienteId: limpio.pacienteId,
    pacienteNombre: limpio.pacienteNombre,
    hora: limpio.hora,
    duracionMin: limpio.duracionMin,
    notas: limpio.notas,
    regla,
    fin,
    desde: limpio.fecha,
    // Hasta donde ya generamos: lo usa la extension de las series sin fin.
    generadoHasta: fechas[fechas.length - 1],
    creadaPorUid: creadaPorUid ?? null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  for (const fecha of fechas) {
    batch.set(doc(collection(db, 'citas')), {
      ...limpio,
      fecha,
      consultorioId,
      estado: ESTADOS_CITA.AGENDADA,
      serieId: serieRef.id,
      creadaPorUid: creadaPorUid ?? null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  await batch.commit();
  return { serieId: serieRef.id, generadas: fechas.length };
}

/**
 * Actualiza una cita.
 * @param {'una'|'siguientes'|'serie'} alcance - solo aplica si es de serie
 */
export async function actualizarCita(cita, cambios, alcance = 'una') {
  const limpio = limpiarDatos({ ...cita, ...cambios });
  validar(limpio);

  if (!cita.serieId || alcance === 'una') {
    await updateDoc(doc(db, 'citas', cita.id), { ...limpio, updatedAt: serverTimestamp() });
    return { actualizadas: 1 };
  }

  const snap = await getDocs(query(collection(db, 'citas'), where('serieId', '==', cita.serieId)));
  const objetivo = snap.docs.filter((d) => {
    if (alcance === 'serie') return true;
    return (d.data().fecha || '') >= cita.fecha;
  });

  const batch = writeBatch(db);
  for (const d of objetivo) {
    // La fecha de cada ocurrencia NO se pisa: mover toda una serie de dia
    // es otra operacion (se cancela y se rehace la serie).
    batch.update(d.ref, {
      profesionalUid: limpio.profesionalUid,
      pacienteId: limpio.pacienteId,
      pacienteNombre: limpio.pacienteNombre,
      hora: limpio.hora,
      duracionMin: limpio.duracionMin,
      notas: limpio.notas,
      updatedAt: serverTimestamp(),
    });
  }
  await batch.commit();
  return { actualizadas: objetivo.length };
}

/** Cambia el estado de una cita (asistió / ausente / cancelada). */
export async function marcarEstadoCita(citaId, estado) {
  await updateDoc(doc(db, 'citas', citaId), { estado, updatedAt: serverTimestamp() });
}

/**
 * Elimina una cita.
 * @param {'una'|'siguientes'|'serie'} alcance
 */
export async function eliminarCita(cita, alcance = 'una') {
  if (!cita.serieId || alcance === 'una') {
    await deleteDoc(doc(db, 'citas', cita.id));
    return { eliminadas: 1 };
  }

  const snap = await getDocs(query(collection(db, 'citas'), where('serieId', '==', cita.serieId)));
  const objetivo = snap.docs.filter((d) => {
    if (alcance === 'serie') return true;
    return (d.data().fecha || '') >= cita.fecha;
  });

  const batch = writeBatch(db);
  for (const d of objetivo) batch.delete(d.ref);

  // Si se borro la serie entera, la regla ya no tiene sentido.
  if (alcance === 'serie') batch.delete(doc(db, 'series_citas', cita.serieId));

  await batch.commit();
  return { eliminadas: objetivo.length };
}
