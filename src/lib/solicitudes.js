/**
 * Servicio de solicitudes de modificacion de sesiones (Fase B)
 */

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';

import { db } from './firebase.js';
import {
  ESTADOS_SOLICITUD_SESION,
  ESTADOS_PAGO_SESION,
  TIPOS_LOG_SESION,
  TIPOS_SOLICITUD_SESION,
} from './constants.js';
import { calcularSplit } from './sesiones.js';
import { escribirLog } from './logs.js';

/* ============================================================
   Helpers de descripcion humana
   ============================================================ */

function descPaciente(pacienteNombre) {
  return pacienteNombre || 'el paciente';
}

function descCantidad(cantidad) {
  const c = Number(cantidad);
  if (!Number.isFinite(c) || c <= 1) return '';
  return ` (${c} sesiones agrupadas)`;
}

function describirSolicitudCreada(solicitud, pacienteNombre, cantidadSesiones) {
  const sufijo = descCantidad(cantidadSesiones);
  switch (solicitud.tipo) {
    case TIPOS_SOLICITUD_SESION.CREAR:
      return `Solicitó crear una sesión con ${descPaciente(pacienteNombre)}${sufijo}`;
    case TIPOS_SOLICITUD_SESION.MODIFICAR:
      return `Solicitó modificar la sesión con ${descPaciente(pacienteNombre)}${sufijo}`;
    case TIPOS_SOLICITUD_SESION.ELIMINAR:
      return `Solicitó eliminar la sesión con ${descPaciente(pacienteNombre)}${sufijo}`;
    case TIPOS_SOLICITUD_SESION.LIQUIDAR_MONTO:
      return `Solicitó liquidar el monto de la sesión con ${descPaciente(pacienteNombre)}${sufijo}`;
    default:
      return 'Creó una solicitud';
  }
}

async function validarNoHayPendienteParaSesion(consultorioId, sesionId) {
  const q = query(
    collection(db, 'solicitudes_sesion'),
    where('consultorioId', '==', consultorioId),
    where('sesionId', '==', sesionId),
    where('estado', '==', ESTADOS_SOLICITUD_SESION.PENDIENTE),
  );
  const snap = await new Promise((resolve, reject) => {
    const unsub = onSnapshot(q, (s) => {
      unsub();
      resolve(s);
    }, reject);
  });
  if (!snap.empty) {
    throw new Error('Ya hay una solicitud pendiente para esta sesión. Esperá a que el administrador la resuelva.');
  }
}

export async function solicitarCrearSesion({
  consultorioId,
  profesionalUid,
  profesionalNombre,
  pacienteNombre,
  payloadPropuesto,
}) {
  const ref = await addDoc(collection(db, 'solicitudes_sesion'), {
    consultorioId,
    profesionalUid,
    profesionalNombre: profesionalNombre || null,
    tipo: TIPOS_SOLICITUD_SESION.CREAR,
    sesionId: null,
    payloadPropuesto,
    payloadAnterior: null,
    estado: ESTADOS_SOLICITUD_SESION.PENDIENTE,
    motivoRechazo: null,
    createdAt: serverTimestamp(),
    resolvedAt: null,
    resolvedByUid: null,
    resolvedByNombre: null,
  });

  await escribirLog({
    consultorioId,
    sesionId: null,
    solicitudId: ref.id,
    tipo: TIPOS_LOG_SESION.SOLICITUD_CREADA,
    actorUid: profesionalUid,
    actorRol: 'profesional',
    actorNombre: profesionalNombre || null,
    descripcion: describirSolicitudCreada(
      { tipo: TIPOS_SOLICITUD_SESION.CREAR },
      pacienteNombre,
      payloadPropuesto?.cantidadSesiones,
    ),
    payloadAnterior: null,
    payloadNuevo: payloadPropuesto,
  });

  return ref.id;
}

export async function solicitarModificarSesion({
  consultorioId,
  sesionId,
  profesionalUid,
  profesionalNombre,
  pacienteNombre,
  payloadPropuesto,
}) {
  await validarNoHayPendienteParaSesion(consultorioId, sesionId);

  const snap = await getDoc(doc(db, 'sesiones', sesionId));
  if (!snap.exists()) {
    throw new Error('La sesión que querés modificar ya no existe.');
  }
  const payloadAnterior = { id: snap.id, ...snap.data() };

  const ref = await addDoc(collection(db, 'solicitudes_sesion'), {
    consultorioId,
    profesionalUid,
    profesionalNombre: profesionalNombre || null,
    tipo: TIPOS_SOLICITUD_SESION.MODIFICAR,
    sesionId,
    payloadPropuesto,
    payloadAnterior,
    estado: ESTADOS_SOLICITUD_SESION.PENDIENTE,
    motivoRechazo: null,
    createdAt: serverTimestamp(),
    resolvedAt: null,
    resolvedByUid: null,
    resolvedByNombre: null,
  });

  await escribirLog({
    consultorioId,
    sesionId,
    solicitudId: ref.id,
    tipo: TIPOS_LOG_SESION.SOLICITUD_CREADA,
    actorUid: profesionalUid,
    actorRol: 'profesional',
    actorNombre: profesionalNombre || null,
    descripcion: describirSolicitudCreada(
      { tipo: TIPOS_SOLICITUD_SESION.MODIFICAR },
      pacienteNombre,
      payloadPropuesto?.cantidadSesiones,
    ),
    payloadAnterior,
    payloadNuevo: payloadPropuesto,
  });

  return ref.id;
}

export async function solicitarEliminarSesion({
  consultorioId,
  sesionId,
  profesionalUid,
  profesionalNombre,
  pacienteNombre,
}) {
  await validarNoHayPendienteParaSesion(consultorioId, sesionId);

  const snap = await getDoc(doc(db, 'sesiones', sesionId));
  if (!snap.exists()) {
    throw new Error('La sesión que querés eliminar ya no existe.');
  }
  const payloadAnterior = { id: snap.id, ...snap.data() };

  const ref = await addDoc(collection(db, 'solicitudes_sesion'), {
    consultorioId,
    profesionalUid,
    profesionalNombre: profesionalNombre || null,
    tipo: TIPOS_SOLICITUD_SESION.ELIMINAR,
    sesionId,
    payloadPropuesto: null,
    payloadAnterior,
    estado: ESTADOS_SOLICITUD_SESION.PENDIENTE,
    motivoRechazo: null,
    createdAt: serverTimestamp(),
    resolvedAt: null,
    resolvedByUid: null,
    resolvedByNombre: null,
  });

  await escribirLog({
    consultorioId,
    sesionId,
    solicitudId: ref.id,
    tipo: TIPOS_LOG_SESION.SOLICITUD_CREADA,
    actorUid: profesionalUid,
    actorRol: 'profesional',
    actorNombre: profesionalNombre || null,
    descripcion: describirSolicitudCreada(
      { tipo: TIPOS_SOLICITUD_SESION.ELIMINAR },
      pacienteNombre,
      payloadAnterior?.cantidadSesiones,
    ),
    payloadAnterior,
    payloadNuevo: null,
  });

  return ref.id;
}

export async function solicitarLiquidarMonto({
  consultorioId,
  sesionId,
  valorLiquidado,
  profesionalUid,
  profesionalNombre,
  pacienteNombre,
}) {
  await validarNoHayPendienteParaSesion(consultorioId, sesionId);

  const snap = await getDoc(doc(db, 'sesiones', sesionId));
  if (!snap.exists()) {
    throw new Error('La sesión que querés liquidar ya no existe.');
  }
  const payloadAnterior = { id: snap.id, ...snap.data() };

  if (payloadAnterior.estadoPago !== ESTADOS_PAGO_SESION.PENDIENTE_MONTO) {
    throw new Error('Esta sesión ya tiene monto liquidado.');
  }

  const v = Number(valorLiquidado);
  if (!Number.isFinite(v) || v <= 0) {
    throw new Error('El valor liquidado debe ser un número mayor a cero');
  }

  const cantidad = Number(payloadAnterior.cantidadSesiones) || 1;
  const porcentaje = Number(payloadAnterior.porcentajeConsultorio) || 0;
  const montoConsultorio = Math.round((v * porcentaje) / 100);
  const montoProfesional = v - montoConsultorio;
  const valorUnitario = cantidad > 0 ? Math.round(v / cantidad) : v;

  const payloadPropuesto = {
    valorLiquidado: v,
    valorTotal: v,
    valorSesion: valorUnitario,
    montoConsultorio,
    montoProfesional,
    estadoPago: ESTADOS_PAGO_SESION.DEBIDO,
  };

  const ref = await addDoc(collection(db, 'solicitudes_sesion'), {
    consultorioId,
    profesionalUid,
    profesionalNombre: profesionalNombre || null,
    tipo: TIPOS_SOLICITUD_SESION.LIQUIDAR_MONTO,
    sesionId,
    payloadPropuesto,
    payloadAnterior,
    estado: ESTADOS_SOLICITUD_SESION.PENDIENTE,
    motivoRechazo: null,
    createdAt: serverTimestamp(),
    resolvedAt: null,
    resolvedByUid: null,
    resolvedByNombre: null,
  });

  await escribirLog({
    consultorioId,
    sesionId,
    solicitudId: ref.id,
    tipo: TIPOS_LOG_SESION.SOLICITUD_CREADA,
    actorUid: profesionalUid,
    actorRol: 'profesional',
    actorNombre: profesionalNombre || null,
    descripcion: describirSolicitudCreada(
      { tipo: TIPOS_SOLICITUD_SESION.LIQUIDAR_MONTO },
      pacienteNombre,
      payloadAnterior?.cantidadSesiones,
    ),
    payloadAnterior,
    payloadNuevo: payloadPropuesto,
  });

  return ref.id;
}

/* ============================================================
   Resolver solicitud (admin)
   ============================================================ */

/**
 * Aprobar una solicitud.
 *
 * Para MARCAR_PAGADA: el receptorOverride permite al admin elegir
 * a quién asignar el dinero recibido. Si no se pasa, usa el receptor
 * que vino en la solicitud (que es el profesional que solicitó, lo cual
 * normalmente no es el correcto — por eso siempre conviene pasar override).
 */
export async function aprobarSolicitud({
  solicitudId,
  adminUid,
  adminNombre,
  receptorOverride,  // { uid, nombre } opcional — solo para MARCAR_PAGADA
}) {
  const solSnap = await getDoc(doc(db, 'solicitudes_sesion', solicitudId));
  if (!solSnap.exists()) throw new Error('La solicitud ya no existe.');
  const sol = { id: solSnap.id, ...solSnap.data() };

  if (sol.estado !== ESTADOS_SOLICITUD_SESION.PENDIENTE) {
    throw new Error('Esta solicitud ya fue resuelta.');
  }

  const consultorioId = sol.consultorioId;

  if (sol.tipo === TIPOS_SOLICITUD_SESION.CREAR) {
    const sesionRef = await addDoc(collection(db, 'sesiones'), {
      ...sol.payloadPropuesto,
      estadoPago: ESTADOS_PAGO_SESION.DEBIDO,
      createdAt: serverTimestamp(),
      createdByUid: sol.profesionalUid,
      updatedAt: serverTimestamp(),
      updatedByUid: adminUid,
    });

    await actualizarSolicitudResuelta({
      solicitudId,
      adminUid,
      adminNombre,
      estado: ESTADOS_SOLICITUD_SESION.APROBADA,
      sesionIdResultante: sesionRef.id,
    });

    await escribirLog({
      consultorioId,
      sesionId: sesionRef.id,
      solicitudId,
      tipo: TIPOS_LOG_SESION.SOLICITUD_APROBADA,
      actorUid: adminUid,
      actorRol: 'admin',
      actorNombre: adminNombre,
      descripcion: 'Aprobó la solicitud de creación. La sesión fue creada.',
      payloadAnterior: null,
      payloadNuevo: sol.payloadPropuesto,
    });
    return;
  }

  if (sol.tipo === TIPOS_SOLICITUD_SESION.CARGA_RAPIDA) {
    const sesionesPayload = sol.payloadPropuesto?.sesiones ?? [];

    const consSnap = await getDoc(doc(db, 'consultorios', consultorioId));
    const metodosPago = consSnap.exists()
      ? (consSnap.data().metodosPagoPaciente ?? [])
      : [];
    const mapaMetodos = Object.fromEntries(metodosPago.map((m) => [m.id, m]));

    const { buildSesionData } = await import('./sesiones.js');
    const { writeBatch: wb, doc: docFn, collection: colFn } = await import('firebase/firestore');
    const batch = wb(db);
    const ts = serverTimestamp();

    for (const s of sesionesPayload) {
      const metodo = mapaMetodos[s.metodoPagoId];
      if (!metodo) continue;

      let fecha;
      if (s.fecha?.seconds !== undefined) {
        fecha = new Date(s.fecha.seconds * 1000);
      } else if (s.fecha?.toDate) {
        fecha = s.fecha.toDate();
      } else {
        fecha = new Date(s.fecha);
      }

      const sesionData = buildSesionData({
        consultorioId,
        profesionalUid: sol.profesionalUid,
        pacienteId: s.pacienteId,
        fecha,
        metodo,
        valorSesion: s.estadoPago === 'pendiente_monto' ? undefined : s.valorSesion,
        cantidadSesiones: s.cantidadSesiones,
        notas: null,
      });

      const sesRef = docFn(colFn(db, 'sesiones'));
      batch.set(sesRef, {
        ...sesionData,
        createdAt: ts,
        createdByUid: sol.profesionalUid,
        updatedAt: ts,
        updatedByUid: adminUid,
      });
    }
    await batch.commit();

    await actualizarSolicitudResuelta({
      solicitudId,
      adminUid,
      adminNombre,
      estado: ESTADOS_SOLICITUD_SESION.APROBADA,
    });
    return;
  }

  if (sol.tipo === TIPOS_SOLICITUD_SESION.MARCAR_PAGADA) {
    const { marcarSesionPagada } = await import('./sesiones.js');
    // Prioridad del receptor: override del admin > snapshot en la solicitud > admin actual
    const receptor = receptorOverride
      || sol.payloadPropuesto?.receptor
      || { uid: adminUid, nombre: adminNombre };
    await marcarSesionPagada(sol.sesionId, adminUid, receptor);
    await actualizarSolicitudResuelta({ solicitudId, adminUid, adminNombre, estado: ESTADOS_SOLICITUD_SESION.APROBADA });
    return;
  }

  if (sol.tipo === TIPOS_SOLICITUD_SESION.LIQUIDAR_OS) {
    const { liquidarMontoSesion } = await import('./sesiones.js');
    await liquidarMontoSesion(sol.sesionId, sol.payloadPropuesto?.monto, adminUid);
    await actualizarSolicitudResuelta({ solicitudId, adminUid, adminNombre, estado: ESTADOS_SOLICITUD_SESION.APROBADA });
    return;
  }

  if (sol.tipo === TIPOS_SOLICITUD_SESION.CREAR_PACIENTE) {
    const datos = sol.payloadPropuesto?.datosPaciente ?? {};
    const { crearPaciente } = await import('./pacientes.js');
    await crearPaciente({
      consultorioId,
      profesionalesUids: [sol.profesionalUid],
      nombre: datos.nombre,
      apellido: datos.apellido,
      dni: datos.dni || null,
      telefono: datos.telefono || null,
      email: datos.email || null,
      metodosPagoIds: datos.metodosPagoIds || [],
      notas: datos.notas || null,
      createdByUid: adminUid,
    });
    await actualizarSolicitudResuelta({
      solicitudId,
      adminUid,
      adminNombre,
      estado: ESTADOS_SOLICITUD_SESION.APROBADA,
    });
    return;
  }

  if (!sol.sesionId) {
    throw new Error('La solicitud no tiene sesion asociada.');
  }
  const sesActualSnap = await getDoc(doc(db, 'sesiones', sol.sesionId));

  if (!sesActualSnap.exists()) {
    await actualizarSolicitudResuelta({
      solicitudId,
      adminUid,
      adminNombre,
      estado: ESTADOS_SOLICITUD_SESION.OBSOLETA,
    });
    await escribirLog({
      consultorioId,
      sesionId: sol.sesionId,
      solicitudId,
      tipo: TIPOS_LOG_SESION.SOLICITUD_OBSOLETA,
      actorUid: adminUid,
      actorRol: 'admin',
      actorNombre: adminNombre,
      descripcion: 'La solicitud quedó obsoleta: la sesión ya no existe.',
    });
    throw new Error('La sesión asociada a esta solicitud ya no existe. Quedó marcada como obsoleta.');
  }

  const sesActual = { id: sesActualSnap.id, ...sesActualSnap.data() };

  if (haySesionDivergente(sol.payloadAnterior, sesActual)) {
    await actualizarSolicitudResuelta({
      solicitudId,
      adminUid,
      adminNombre,
      estado: ESTADOS_SOLICITUD_SESION.OBSOLETA,
    });
    await escribirLog({
      consultorioId,
      sesionId: sol.sesionId,
      solicitudId,
      tipo: TIPOS_LOG_SESION.SOLICITUD_OBSOLETA,
      actorUid: adminUid,
      actorRol: 'admin',
      actorNombre: adminNombre,
      descripcion: 'La solicitud quedó obsoleta: la sesión fue modificada después de la solicitud.',
      payloadAnterior: sol.payloadAnterior,
      payloadNuevo: sesActual,
    });
    throw new Error('La sesión fue modificada después de que se hizo la solicitud. Quedó marcada como obsoleta.');
  }

  if (sol.tipo === TIPOS_SOLICITUD_SESION.MODIFICAR) {
    await updateDoc(doc(db, 'sesiones', sol.sesionId), {
      ...sol.payloadPropuesto,
      updatedAt: serverTimestamp(),
      updatedByUid: adminUid,
    });

    await actualizarSolicitudResuelta({
      solicitudId,
      adminUid,
      adminNombre,
      estado: ESTADOS_SOLICITUD_SESION.APROBADA,
    });

    await escribirLog({
      consultorioId,
      sesionId: sol.sesionId,
      solicitudId,
      tipo: TIPOS_LOG_SESION.SOLICITUD_APROBADA,
      actorUid: adminUid,
      actorRol: 'admin',
      actorNombre: adminNombre,
      descripcion: 'Aprobó la solicitud de modificación. Los cambios fueron aplicados.',
      payloadAnterior: sesActual,
      payloadNuevo: sol.payloadPropuesto,
    });
    return;
  }

  if (sol.tipo === TIPOS_SOLICITUD_SESION.ELIMINAR) {
    await deleteDoc(doc(db, 'sesiones', sol.sesionId));

    await actualizarSolicitudResuelta({
      solicitudId,
      adminUid,
      adminNombre,
      estado: ESTADOS_SOLICITUD_SESION.APROBADA,
    });

    await escribirLog({
      consultorioId,
      sesionId: null,
      solicitudId,
      tipo: TIPOS_LOG_SESION.SOLICITUD_APROBADA,
      actorUid: adminUid,
      actorRol: 'admin',
      actorNombre: adminNombre,
      descripcion: 'Aprobó la solicitud de eliminación. La sesión fue eliminada.',
      payloadAnterior: sesActual,
      payloadNuevo: null,
    });
    return;
  }

  if (sol.tipo === TIPOS_SOLICITUD_SESION.LIQUIDAR_MONTO) {
    if (sesActual.estadoPago !== ESTADOS_PAGO_SESION.PENDIENTE_MONTO) {
      await actualizarSolicitudResuelta({
        solicitudId,
        adminUid,
        adminNombre,
        estado: ESTADOS_SOLICITUD_SESION.OBSOLETA,
      });
      await escribirLog({
        consultorioId,
        sesionId: sol.sesionId,
        solicitudId,
        tipo: TIPOS_LOG_SESION.SOLICITUD_OBSOLETA,
        actorUid: adminUid,
        actorRol: 'admin',
        actorNombre: adminNombre,
        descripcion: 'La solicitud quedó obsoleta: la sesión ya fue liquidada por otro camino.',
      });
      throw new Error('Esta sesión ya fue liquidada. La solicitud queda obsoleta.');
    }

    await updateDoc(doc(db, 'sesiones', sol.sesionId), {
      valorTotal: sol.payloadPropuesto.valorTotal,
      valorSesion: sol.payloadPropuesto.valorSesion,
      montoConsultorio: sol.payloadPropuesto.montoConsultorio,
      montoProfesional: sol.payloadPropuesto.montoProfesional,
      estadoPago: ESTADOS_PAGO_SESION.DEBIDO,
      updatedAt: serverTimestamp(),
      updatedByUid: adminUid,
    });

    await actualizarSolicitudResuelta({
      solicitudId,
      adminUid,
      adminNombre,
      estado: ESTADOS_SOLICITUD_SESION.APROBADA,
    });

    await escribirLog({
      consultorioId,
      sesionId: sol.sesionId,
      solicitudId,
      tipo: TIPOS_LOG_SESION.SOLICITUD_APROBADA,
      actorUid: adminUid,
      actorRol: 'admin',
      actorNombre: adminNombre,
      descripcion: 'Aprobó la liquidación del monto de la obra social.',
      payloadAnterior: sesActual,
      payloadNuevo: sol.payloadPropuesto,
    });
    return;
  }

  throw new Error('Tipo de solicitud desconocido.');
}

/* ============================================================
   Solicitar marcar sesión como pagada
   ============================================================ */
export async function solicitarMarcarPagada({
  consultorioId,
  profesionalUid,
  profesionalNombre,
  sesionId,
  sesionSnapshot,
  receptor,
}) {
  const ref = await addDoc(collection(db, 'solicitudes_sesion'), {
    consultorioId,
    tipo: TIPOS_SOLICITUD_SESION.MARCAR_PAGADA,
    estado: ESTADOS_SOLICITUD_SESION.PENDIENTE,
    profesionalUid,
    profesionalNombre,
    sesionId,
    payloadPropuesto: { sesionSnapshot, receptor },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function solicitarLiquidarOSSesion({
  consultorioId,
  profesionalUid,
  profesionalNombre,
  sesionId,
  sesionSnapshot,
  monto,
}) {
  if (!monto || Number(monto) <= 0) throw new Error('El monto debe ser mayor a 0');
  const ref = await addDoc(collection(db, 'solicitudes_sesion'), {
    consultorioId,
    tipo: TIPOS_SOLICITUD_SESION.LIQUIDAR_OS,
    estado: ESTADOS_SOLICITUD_SESION.PENDIENTE,
    profesionalUid,
    profesionalNombre,
    sesionId,
    payloadPropuesto: { sesionSnapshot, monto: Number(monto) },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function solicitarCrearPaciente({
  consultorioId,
  profesionalUid,
  profesionalNombre,
  datosPaciente,
}) {
  if (!datosPaciente?.nombre?.trim()) throw new Error('El nombre es obligatorio');
  if (!datosPaciente?.apellido?.trim()) throw new Error('El apellido es obligatorio');
  if (!datosPaciente?.metodosPagoIds?.length) throw new Error('Seleccioná al menos un método de pago');

  const ref = await addDoc(collection(db, 'solicitudes_sesion'), {
    consultorioId,
    tipo: TIPOS_SOLICITUD_SESION.CREAR_PACIENTE,
    estado: ESTADOS_SOLICITUD_SESION.PENDIENTE,
    profesionalUid,
    profesionalNombre,
    payloadPropuesto: { datosPaciente },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function solicitarCargaRapida({
  consultorioId,
  profesionalUid,
  profesionalNombre,
  sesiones,
}) {
  if (!sesiones || sesiones.length === 0) {
    throw new Error('No hay sesiones para solicitar.');
  }

  const ref = await addDoc(collection(db, 'solicitudes_sesion'), {
    consultorioId,
    tipo: TIPOS_SOLICITUD_SESION.CARGA_RAPIDA,
    estado: ESTADOS_SOLICITUD_SESION.PENDIENTE,
    profesionalUid,
    profesionalNombre,
    payloadPropuesto: { sesiones },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return ref.id;
}

function haySesionDivergente(snapshot, actual) {
  if (!snapshot || !actual) return true;
  const camposClave = [
    'profesionalUid',
    'pacienteId',
    'metodoPagoId',
    'valorTotal',
    'porcentajeConsultorio',
    'montoConsultorio',
    'montoProfesional',
    'estadoPago',
  ];
  for (const k of camposClave) {
    if (snapshot[k] !== actual[k]) return true;
  }
  const cant1 = Number(snapshot.cantidadSesiones) || 1;
  const cant2 = Number(actual.cantidadSesiones) || 1;
  if (cant1 !== cant2) return true;
  const f1 = snapshot.fecha?.toMillis ? snapshot.fecha.toMillis() : snapshot.fecha?.seconds;
  const f2 = actual.fecha?.toMillis ? actual.fecha.toMillis() : actual.fecha?.seconds;
  if (f1 !== f2) return true;
  return false;
}

export async function rechazarSolicitud({
  solicitudId,
  adminUid,
  adminNombre,
  motivo,
}) {
  const solSnap = await getDoc(doc(db, 'solicitudes_sesion', solicitudId));
  if (!solSnap.exists()) throw new Error('La solicitud ya no existe.');
  const sol = solSnap.data();

  if (sol.estado !== ESTADOS_SOLICITUD_SESION.PENDIENTE) {
    throw new Error('Esta solicitud ya fue resuelta.');
  }

  await updateDoc(doc(db, 'solicitudes_sesion', solicitudId), {
    estado: ESTADOS_SOLICITUD_SESION.RECHAZADA,
    motivoRechazo: motivo?.trim() || null,
    resolvedAt: serverTimestamp(),
    resolvedByUid: adminUid,
    resolvedByNombre: adminNombre || null,
  });

  await escribirLog({
    consultorioId: sol.consultorioId,
    sesionId: sol.sesionId,
    solicitudId,
    tipo: TIPOS_LOG_SESION.SOLICITUD_RECHAZADA,
    actorUid: adminUid,
    actorRol: 'admin',
    actorNombre: adminNombre,
    descripcion: motivo?.trim()
      ? `Rechazó la solicitud. Motivo: "${motivo.trim()}"`
      : 'Rechazó la solicitud sin especificar motivo.',
    payloadAnterior: sol.payloadAnterior,
    payloadNuevo: sol.payloadPropuesto,
  });
}

export async function marcarPendientesComoObsoletas({
  consultorioId,
  sesionId,
  motivo,
  adminUid,
  adminNombre,
}) {
  const q = query(
    collection(db, 'solicitudes_sesion'),
    where('consultorioId', '==', consultorioId),
    where('sesionId', '==', sesionId),
    where('estado', '==', ESTADOS_SOLICITUD_SESION.PENDIENTE),
  );
  const snap = await new Promise((resolve, reject) => {
    const unsub = onSnapshot(q, (s) => {
      unsub();
      resolve(s);
    }, reject);
  });

  for (const d of snap.docs) {
    await updateDoc(d.ref, {
      estado: ESTADOS_SOLICITUD_SESION.OBSOLETA,
      resolvedAt: serverTimestamp(),
      resolvedByUid: adminUid,
      resolvedByNombre: adminNombre || null,
    });
    await escribirLog({
      consultorioId,
      sesionId,
      solicitudId: d.id,
      tipo: TIPOS_LOG_SESION.SOLICITUD_OBSOLETA,
      actorUid: adminUid,
      actorRol: 'admin',
      actorNombre: adminNombre,
      descripcion: motivo || 'La solicitud quedó obsoleta porque la sesión fue modificada por otro camino.',
    });
  }
}

async function actualizarSolicitudResuelta({
  solicitudId,
  adminUid,
  adminNombre,
  estado,
  sesionIdResultante,
}) {
  const update = {
    estado,
    resolvedAt: serverTimestamp(),
    resolvedByUid: adminUid,
    resolvedByNombre: adminNombre || null,
  };
  if (sesionIdResultante) {
    update.sesionId = sesionIdResultante;
  }
  await updateDoc(doc(db, 'solicitudes_sesion', solicitudId), update);
}

export function suscribirSolicitudesPendientes(consultorioId, callback) {
  if (!consultorioId) {
    callback([]);
    return () => {};
  }
  const q = query(
    collection(db, 'solicitudes_sesion'),
    where('consultorioId', '==', consultorioId),
    where('estado', '==', ESTADOS_SOLICITUD_SESION.PENDIENTE),
    orderBy('createdAt', 'desc'),
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }, (err) => {
    console.error('Error en suscripcion de solicitudes pendientes:', err);
    callback([]);
  });
}

export function suscribirTodasSolicitudes(consultorioId, callback) {
  if (!consultorioId) {
    callback([]);
    return () => {};
  }
  const q = query(
    collection(db, 'solicitudes_sesion'),
    where('consultorioId', '==', consultorioId),
    orderBy('createdAt', 'desc'),
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }, (err) => {
    console.error('Error en suscripcion de solicitudes:', err);
    callback([]);
  });
}

export function suscribirSolicitudesDelProfesional(consultorioId, profesionalUid, callback) {
  if (!consultorioId || !profesionalUid) {
    callback([]);
    return () => {};
  }
  const q = query(
    collection(db, 'solicitudes_sesion'),
    where('consultorioId', '==', consultorioId),
    where('profesionalUid', '==', profesionalUid),
    orderBy('createdAt', 'desc'),
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }, (err) => {
    console.error('Error en suscripcion de solicitudes del profesional:', err);
    callback([]);
  });
}

export function armarPayloadParaSolicitud({
  consultorioId,
  profesionalUid,
  pacienteId,
  fecha,
  metodo,
  valorSesion,
  cantidadSesiones = 1,
  valorTotal: valorTotalIn,
  notas,
}) {
  const cantidad = Number(cantidadSesiones) || 1;

  let unitario, total;
  if (valorSesion !== undefined && valorSesion !== null && valorSesion !== '') {
    unitario = Number(valorSesion) || 0;
    total = unitario * cantidad;
  } else {
    total = Number(valorTotalIn) || 0;
    unitario = cantidad > 0 ? Math.round(total / cantidad) : total;
  }

  const porcentaje = Number(metodo?.porcentajeConsultorio) || 0;
  const { montoConsultorio, montoProfesional } = calcularSplit(total, porcentaje);

  return {
    consultorioId,
    profesionalUid,
    pacienteId,
    fecha: fecha instanceof Date ? Timestamp.fromDate(fecha) : fecha,
    metodoPagoId: metodo.id,
    metodoPagoNombre: metodo.nombre || '',
    metodoPagoTipo: metodo.tipo || 'inmediato',
    cantidadSesiones: cantidad,
    valorSesion: unitario,
    valorTotal: total,
    porcentajeConsultorio: porcentaje,
    montoConsultorio,
    montoProfesional,
    notas: notas?.trim() || null,
  };
}
