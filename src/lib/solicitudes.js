/**
 * Servicio de solicitudes de modificacion de sesiones (Fase B)
 *
 * Cuando un profesional NO tiene confianza (permitirEdicionSesiones
 * = false en su doc de usuario), sus acciones sobre sesiones no se
 * ejecutan directamente sino que crean una solicitud que el admin
 * debe resolver.
 *
 * SOPORTA SESIONES AGRUPADAS: el payloadPropuesto y payloadAnterior
 * incluyen cantidadSesiones y valorSesion (ver lib/sesiones.js).
 *
 * Modelo:
 *   solicitudes_sesion/{solicitudId}
 *     consultorioId, profesionalUid (quien la pidio),
 *     profesionalNombre (snapshot),
 *     tipo: 'crear' | 'modificar' | 'eliminar',
 *     sesionId: null si tipo=crear (hasta que se aprueba),
 *               id de la sesion existente si tipo=modificar/eliminar,
 *     payloadPropuesto: para crear es la sesion completa,
 *                       para modificar es el nuevo set de campos,
 *                       para eliminar es null,
 *     payloadAnterior: snapshot de la sesion al momento de pedir
 *                      (para detectar si quedo obsoleta y para mostrar
 *                       el diff al admin),
 *     estado: 'pendiente' | 'aprobada' | 'rechazada' | 'obsoleta',
 *     motivoRechazo: string | null,
 *     createdAt, resolvedAt, resolvedByUid, resolvedByNombre
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
   ----------------------------------------------------------------
   Para que los logs y el detalle del modal muestren textos claros,
   centralizamos aca el armado de la "descripcion" de cada evento.
   ============================================================ */

function descPaciente(pacienteNombre) {
  return pacienteNombre || 'el paciente';
}

function descCantidad(cantidad) {
  // Si es 1 o undefined, no agregamos nada (es el caso "normal")
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

/* ============================================================
   Validacion: solo una solicitud activa por sesion
   ----------------------------------------------------------------
   Antes de crear una solicitud sobre una sesion existente, chequea
   que no haya otra pendiente para esa misma sesion. Si la hay,
   lanza error.
   ============================================================ */
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

/* ============================================================
   Crear solicitud
   ----------------------------------------------------------------
   Cada tipo (crear/modificar/eliminar) tiene su propia funcion
   exportada para que el caller no se equivoque pasando un payload
   que no corresponde al tipo.
   ============================================================ */

/**
 * Solicitar crear una sesion. El payloadPropuesto contiene los
 * mismos campos que se le pasarian a crearSesion(), ya con el split
 * calculado.
 */
export async function solicitarCrearSesion({
  consultorioId,
  profesionalUid,
  profesionalNombre,
  pacienteNombre,    // solo para el log
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

/**
 * Solicitar modificar una sesion existente.
 * payloadPropuesto = nuevos valores deseados (con split ya calculado).
 * payloadAnterior  = snapshot de la sesion al momento de la solicitud
 *                    (lo agarramos automaticamente leyendo la sesion).
 */
export async function solicitarModificarSesion({
  consultorioId,
  sesionId,
  profesionalUid,
  profesionalNombre,
  pacienteNombre,
  payloadPropuesto,
}) {
  await validarNoHayPendienteParaSesion(consultorioId, sesionId);

  // Tomamos snapshot del estado actual para el diff
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

/**
 * Solicitar eliminar una sesion.
 */
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

/**
 * Solicitar liquidar el monto de una sesion en pendiente_monto (obra social).
 * Solo se usa cuando el profesional NO tiene edicion directa.
 *
 * payloadPropuesto incluye:
 *   - valorLiquidado: el total que dijo la obra social
 *   - valorSesion / valorTotal / montoConsultorio / montoProfesional ya
 *     calculados en cliente para que el admin vea el preview en el modal
 *     de la solicitud y no tenga que recalcular.
 *
 * Cuando el admin aprueba, el aprobador llama a la misma logica de
 * liquidarMontoSesion (recalcula y graba). El payload guardado sirve
 * de auditoria pero la liquidacion final usa los datos guardados en el
 * doc de sesion en el momento de la aprobacion.
 */
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

  // Calculamos el preview del split usando el % guardado en la sesion
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
 * Aprobar una solicitud: aplica el cambio sobre /sesiones/ y marca la
 * solicitud como aprobada. Antes de aplicar, verifica que la sesion
 * referenciada no haya sido modificada/eliminada por otro lado: si
 * lo fue, marca la solicitud como obsoleta y NO aplica nada.
 *
 * Esta funcion debe llamarse desde el admin (las rules lo aseguran).
 */
export async function aprobarSolicitud({
  solicitudId,
  adminUid,
  adminNombre,
}) {
  // Releemos la solicitud por si cambio
  const solSnap = await getDoc(doc(db, 'solicitudes_sesion', solicitudId));
  if (!solSnap.exists()) throw new Error('La solicitud ya no existe.');
  const sol = { id: solSnap.id, ...solSnap.data() };

  if (sol.estado !== ESTADOS_SOLICITUD_SESION.PENDIENTE) {
    throw new Error('Esta solicitud ya fue resuelta.');
  }

  const consultorioId = sol.consultorioId;

  if (sol.tipo === TIPOS_SOLICITUD_SESION.CREAR) {
    // Crear la sesion con el payload propuesto + auditoria
    const sesionRef = await addDoc(collection(db, 'sesiones'), {
      ...sol.payloadPropuesto,
      estadoPago: ESTADOS_PAGO_SESION.DEBIDO,
      createdAt: serverTimestamp(),
      createdByUid: sol.profesionalUid,  // creador real es el profesional
      updatedAt: serverTimestamp(),
      updatedByUid: adminUid,            // pero el aprobador es el admin
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

    // Necesitamos los metodos del consultorio para calcular el split
    // (porcentajeConsultorio, montoConsultorio, montoProfesional).
    // Los leemos desde el doc del consultorio.
    const consSnap = await getDoc(doc(db, 'consultorios', consultorioId));
    const metodosPago = consSnap.exists()
      ? (consSnap.data().metodosPagoPaciente ?? [])
      : [];
    const mapaMetodos = Object.fromEntries(metodosPago.map((m) => [m.id, m]));

    // Usamos buildSesionData (la funcion pura de sesiones.js) para cada
    // sesion, así los campos economicos quedan correctos y pasan las rules.
    const { buildSesionData } = await import('./sesiones.js');
    const { writeBatch: wb, doc: docFn, collection: colFn } = await import('firebase/firestore');
    const batch = wb(db);
    const ts = serverTimestamp();

    for (const s of sesionesPayload) {
      const metodo = mapaMetodos[s.metodoPagoId];
      if (!metodo) continue; // metodo eliminado, saltear

      // Convertir fecha serializada a Date
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
    const receptor = sol.payloadPropuesto?.receptor ?? { uid: adminUid, nombre: adminNombre };
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

  // Para modificar y eliminar necesitamos la sesion actual
  if (!sol.sesionId) {
    throw new Error('La solicitud no tiene sesion asociada.');
  }
  const sesActualSnap = await getDoc(doc(db, 'sesiones', sol.sesionId));

  // Caso obsoleto: la sesion ya no existe
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

  // Caso obsoleto: la sesion fue modificada despues de la solicitud
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
      sesionId: null,  // ya no existe
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
    // Verificacion extra: la sesion sigue en pendiente_monto.
    // Si ya fue liquidada por otro lado (por ej. el admin lo hizo
    // manualmente despues), marcamos obsoleta.
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

    // Aplicamos los valores del payloadPropuesto. Como la solicitud
    // guarda el valorLiquidado original, podemos recalcular si quisieramos
    // pero los valores ya estan calculados al momento de pedirla y
    // el porcentaje del metodo no cambia (snapshot guardado en la sesion).
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
  sesionSnapshot,   // { pacienteNombre, fecha, metodoPagoNombre, valorTotal }
  receptor,         // { uid, nombre } — quién recibió el dinero
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

/* ============================================================
   Solicitar liquidar monto de obra social
   ============================================================ */
export async function solicitarLiquidarOSSesion({
  consultorioId,
  profesionalUid,
  profesionalNombre,
  sesionId,
  sesionSnapshot,   // { pacienteNombre, fecha, metodoPagoNombre }
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

/* ============================================================
   Solicitar creación de paciente (profesional con permiso)
   ============================================================ */
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

/* ============================================================
   Solicitar carga rapida (profesional sin edicion directa)
   ----------------------------------------------------------------
   Guarda 1 solicitud con el array completo de sesiones a crear.
   El admin la revisa, aprueba o rechaza como bloque.
   ============================================================ */
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

/**
 * Detecta si la sesion actual es divergente del snapshot que tenia la
 * solicitud al momento de pedirse. Comparamos los campos significativos
 * (los economicos y los de identidad). Cambios cosmeticos como notas
 * o updatedAt no cuentan.
 *
 * Incluye cantidadSesiones y valorSesion porque cambios en estos
 * tambien hacen que la solicitud quede obsoleta.
 */
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
  // cantidadSesiones y valorSesion: comparar con backwards compat (1 / 0)
  const cant1 = Number(snapshot.cantidadSesiones) || 1;
  const cant2 = Number(actual.cantidadSesiones) || 1;
  if (cant1 !== cant2) return true;
  // Fecha viene como Timestamp; comparamos en ms
  const f1 = snapshot.fecha?.toMillis ? snapshot.fecha.toMillis() : snapshot.fecha?.seconds;
  const f2 = actual.fecha?.toMillis ? actual.fecha.toMillis() : actual.fecha?.seconds;
  if (f1 !== f2) return true;
  return false;
}

/**
 * Rechazar una solicitud sin aplicar cambios. Motivo es opcional.
 */
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

/* ============================================================
   Marcar solicitudes pendientes como obsoletas
   ----------------------------------------------------------------
   Esta funcion la llama el frontend desde la accion DIRECTA del admin
   sobre una sesion (modificar/eliminar). Antes de hacer el cambio
   directo, busca solicitudes pendientes para esa misma sesion y las
   marca como obsoletas, con su log correspondiente.
   ============================================================ */
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

/* ============================================================
   Helper interno: actualizar campos comunes al resolver
   ============================================================ */
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

/* ============================================================
   Suscripciones live
   ============================================================ */

/**
 * Solicitudes pendientes del consultorio (vista admin).
 * Para el badge en el sidebar y la bandeja de /admin/solicitudes.
 */
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

/**
 * TODAS las solicitudes del consultorio (incluye resueltas).
 * Para la pagina /admin/solicitudes con tabs "Pendientes / Resueltas".
 */
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

/**
 * Solicitudes hechas por un profesional (vista profesional).
 * Para que vea su propio historial: pendientes, aprobadas, rechazadas.
 */
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

/* ============================================================
   Helper: armar payload propuesto desde un input "humano"
   ----------------------------------------------------------------
   Las solicitudes guardan el mismo formato que las sesiones (con
   split calculado y todo) para que aprobar sea solo un updateDoc o
   addDoc directo, sin recalcular nada en el momento de aprobar.

   Acepta:
   - valorSesion + cantidadSesiones (recomendado): valor unitario *
     cantidad = total
   - valorTotal directo (legacy): se usa tal cual, cantidadSesiones=1
   ============================================================ */
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
