import { useEffect, useMemo, useState } from 'react';

import ActionMenu from '../../components/ui/ActionMenu.jsx';
import DualScrollTable from '../../components/ui/DualScrollTable.jsx';
import Avatar from '../../components/ui/Avatar.jsx';
import CargaRapidaModal from '../admin/CargaRapidaModal.jsx';
import Button from '../../components/ui/Button.jsx';
import Spinner from '../../components/ui/Spinner.jsx';

import { useAuth } from '../../hooks/useAuth.js';
import { useConsultorio } from '../../hooks/useConsultorio.js';
import {
  ESTADOS_PACIENTE,
  ESTADOS_PAGO_SESION,
  ESTADOS_SOLICITUD_SESION,
  formatoARS,
  LABELS_TIPO_SOLICITUD,
  TIPOS_METODO_PAGO,
  TIPOS_SOLICITUD_SESION,
} from '../../lib/constants.js';
import { suscribirPacientesProfesional } from '../../lib/pacientes.js';
import {
  actualizarSesion,
  crearSesion,
  eliminarSesion,
  finDeMes,
  getCantidadSesiones,
  inicioDeMes,
  marcarSesionDebida,
  nombreDelMes,
  editarMontoLiquidado,
  liquidarMontoSesion,
  suscribirSesionesProfesional,
  totalesGlobales,
} from '../../lib/sesiones.js';
import {
  armarPayloadParaSolicitud,
  solicitarCrearSesion,
  solicitarEliminarSesion,
  solicitarLiquidarMonto,
  solicitarMarcarPagada,
  solicitarLiquidarOSSesion,
  solicitarModificarSesion,
  suscribirSolicitudesDelProfesional,
} from '../../lib/solicitudes.js';

import { GroupBadge, LiquidarMontoModal, SesionModal } from '../admin/Sesiones.jsx';
import '../admin/Sesiones.css';
import './MisSesiones.css';

/* ============================================================
   Iconos
   ============================================================ */
const PlusIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 4v16m8-8H4" />
  </svg>
);
const ChevronLeft = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6" />
  </svg>
);
const ChevronRight = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);
const EditIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);
const TrashIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-2 14a2 2 0 01-2 2H9a2 2 0 01-2-2L5 6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
  </svg>
);
const ClockIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);
const CheckIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

/* ============================================================
   Helpers
   ============================================================ */
function nombrePaciente(p) {
  return `${p.apellido ?? ''}${p.apellido && p.nombre ? ', ' : ''}${p.nombre ?? ''}`;
}
function inicialesPaciente(p) {
  return ((p.apellido?.[0] ?? '') + (p.nombre?.[0] ?? '')).toUpperCase() || '·';
}
function formatoFechaHoraCorta(date) {
  if (!date) return { dia: '—', hora: '' };
  const d = date.toDate ? date.toDate() : new Date(date);
  const dia = d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
  const hora = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  return { dia, hora };
}

function SelectorMes({ mes, setMes }) {
  const hoy = inicioDeMes(new Date());
  const esEsteMes = mes.getFullYear() === hoy.getFullYear() && mes.getMonth() === hoy.getMonth();

  return (
    <div className="cp-mes-selector">
      <button
        className="cp-mes-selector__btn"
        onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() - 1, 1))}
        aria-label="Mes anterior"
      >
        <ChevronLeft />
      </button>
      <span className="cp-mes-selector__label">{nombreDelMes(mes)}</span>
      <button
        className="cp-mes-selector__btn"
        onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() + 1, 1))}
        aria-label="Mes siguiente"
      >
        <ChevronRight />
      </button>
      {!esEsteMes && (
        <button className="cp-mes-selector__hoy" onClick={() => setMes(hoy)}>
          Hoy
        </button>
      )}
    </div>
  );
}

/* ============================================================
   Pagina principal
   ============================================================ */
export default function MisSesiones() {
  const { user } = useAuth();
  const { consultorio, loading: loadingConsultorio } = useConsultorio();

  const [mes, setMes] = useState(() => inicioDeMes(new Date()));

  const [sesiones, setSesiones] = useState([]);
  const [pacientes, setPacientes] = useState([]);
  const [solicitudes, setSolicitudes] = useState([]);
  const [loadingSesiones, setLoadingSesiones] = useState(true);

  const [editando, setEditando] = useState(null); // null | 'nueva' | sesion
  const [liquidando, setLiquidando] = useState(null);
  const [cargaRapidaOpen, setCargaRapidaOpen] = useState(false);

  // Si no tiene confianza, mostramos un banner aclaratorio y las acciones
  // crean solicitudes en lugar de tocar /sesiones/ directamente.
  const tieneConfianza = !!user?.permitirEdicionSesiones;
  const puedeMarcarPagadas = !!user?.permitirMarcarPagadas;

  // Suscripciones
  useEffect(() => {
    if (!user?.uid || !user?.consultorioId) return;
    setLoadingSesiones(true);
    const desde = inicioDeMes(mes);
    const hasta = finDeMes(mes);
    const unsub = suscribirSesionesProfesional(
      user.uid,
      user.consultorioId,
      (data) => {
        setSesiones(data);
        setLoadingSesiones(false);
      },
      { desde, hasta },
    );
    return unsub;
  }, [user?.uid, user?.consultorioId, mes]);

  useEffect(() => {
    if (!user?.uid || !user?.consultorioId) return;
    return suscribirPacientesProfesional(user.uid, user.consultorioId, setPacientes);
  }, [user?.uid, user?.consultorioId]);

  useEffect(() => {
    if (!user?.uid || !user?.consultorioId) return;
    return suscribirSolicitudesDelProfesional(user.consultorioId, user.uid, setSolicitudes);
  }, [user?.uid, user?.consultorioId]);

  const pacientesActivos = useMemo(
    () => pacientes.filter((p) => p.estado === ESTADOS_PACIENTE.ACTIVO),
    [pacientes],
  );

  const metodos = useMemo(
    () => consultorio?.metodosPagoPaciente ?? [],
    [consultorio?.metodosPagoPaciente],
  );

  const mapaPacientes = useMemo(() => {
    const m = {};
    for (const p of pacientes) m[p.id] = p;
    return m;
  }, [pacientes]);

  // Set de sesionId con solicitudes pendientes (para deshabilitar editar/eliminar
  // en esas filas mientras la solicitud se resuelve)
  const sesionesConPendiente = useMemo(() => {
    const set = new Set();
    for (const s of solicitudes) {
      if (s.estado === ESTADOS_SOLICITUD_SESION.PENDIENTE && s.sesionId) {
        set.add(s.sesionId);
      }
    }
    return set;
  }, [solicitudes]);

  // Las 5 ultimas solicitudes resueltas / pendientes para mostrar arriba
  const solicitudesParaMostrar = useMemo(() => {
    const desde = inicioDeMes(mes).getTime();
    const hasta = finDeMes(mes).getTime();
    return solicitudes.filter((s) => {
      const t = s.createdAt?.toDate ? s.createdAt.toDate().getTime()
        : s.createdAt?.seconds ? s.createdAt.seconds * 1000 : 0;
      return t >= desde && t <= hasta;
    }).slice(0, 10);
  }, [solicitudes, mes]);

  const [marcarMesOpen, setMarcarMesOpen] = useState(false);
  const [liquidarOSOpen, setLiquidarOSOpen] = useState(false);

  // Sesiones del mes elegibles para cada accion masiva. Se excluyen las que
  // ya tienen una solicitud pendiente: pedir dos veces lo mismo le duplica
  // el trabajo al admin y el helper del backend lo rechaza igual.
  const sesionesDebidasDelMes = useMemo(
    () => sesiones.filter((x) => x.estadoPago === ESTADOS_PAGO_SESION.DEBIDO
      && !sesionesConPendiente.has(x.id)),
    [sesiones, sesionesConPendiente],
  );

  const sesionesPorLiquidar = useMemo(
    () => sesiones.filter((x) => x.estadoPago === ESTADOS_PAGO_SESION.PENDIENTE_MONTO
      && !sesionesConPendiente.has(x.id)),
    [sesiones, sesionesConPendiente],
  );

  const solicitudesPendientesCount = useMemo(
    () => solicitudes.filter((s) => s.estado === ESTADOS_SOLICITUD_SESION.PENDIENTE).length,
    [solicitudes],
  );

  const stats = useMemo(() => totalesGlobales(sesiones), [sesiones]);
  const yaPagueAlConsultorio = stats.totalConsultorio - stats.debido;

  /* ---- Handlers: ramifican segun tieneConfianza ---- */

  function nombrePacienteDeInput(input) {
    const pac = mapaPacientes[input.pacienteId];
    return pac ? nombrePaciente(pac) : null;
  }
  function nombrePacienteDeSesion(sesion) {
    const pac = mapaPacientes[sesion.pacienteId];
    return pac ? nombrePaciente(pac) : null;
  }

  async function handleGuardar(input) {
    if (editando === 'nueva') {
      if (tieneConfianza) {
        await crearSesion(input, user.uid);
      } else {
        await solicitarCrearSesion({
          consultorioId: user.consultorioId,
          profesionalUid: user.uid,
          profesionalNombre: user.displayName || user.email,
          pacienteNombre: nombrePacienteDeInput(input),
          payloadPropuesto: armarPayloadParaSolicitud(input),
        });
      }
    } else {
      // Editar sesion existente
      if (tieneConfianza) {
        await actualizarSesion(editando.id, input, user.uid);
      } else {
        await solicitarModificarSesion({
          consultorioId: user.consultorioId,
          sesionId: editando.id,
          profesionalUid: user.uid,
          profesionalNombre: user.displayName || user.email,
          pacienteNombre: nombrePacienteDeSesion(editando),
          payloadPropuesto: armarPayloadParaSolicitud(input),
        });
      }
    }
    setEditando(null);
  }

  async function handleEliminar(sesion) {
    const pac = mapaPacientes[sesion.pacienteId];
    const nombrePac = pac ? nombrePaciente(pac) : 'el paciente';
    const cantidad = getCantidadSesiones(sesion);
    const sufijoCantidad = cantidad > 1 ? ` (registro de ${cantidad} sesiones agrupadas)` : '';

    const mensaje = tieneConfianza
      ? `¿Eliminar la sesión del ${formatoFechaHoraCorta(sesion.fecha).dia} con ${nombrePac}${sufijoCantidad}?\n\nEsta acción no se puede deshacer.`
      : `¿Solicitar eliminación de la sesión del ${formatoFechaHoraCorta(sesion.fecha).dia} con ${nombrePac}${sufijoCantidad}?\n\nLa eliminación quedará pendiente hasta que el administrador la apruebe.`;

    const ok = confirm(mensaje);
    if (!ok) return;
    try {
      if (tieneConfianza) {
        await eliminarSesion(sesion.id);
      } else {
        await solicitarEliminarSesion({
          consultorioId: user.consultorioId,
          sesionId: sesion.id,
          profesionalUid: user.uid,
          profesionalNombre: user.displayName || user.email,
          pacienteNombre: nombrePac,
        });
      }
    } catch (err) {
      alert(err.message || 'No se pudo procesar la acción.');
    }
  }

  // Cargar monto liquidado de una sesion en pendiente_monto.
  // Si el profesional tiene confianza -> directo. Si no -> solicitud al admin.
  function handleAbrirLiquidar(sesion) {
    setLiquidando(sesion);
  }

  async function handleConfirmarLiquidar(valor) {
    if (!liquidando) return;
    const esPrimeraLiquidacion = liquidando.estadoPago === ESTADOS_PAGO_SESION.PENDIENTE_MONTO;
    if (esPrimeraLiquidacion) {
      if (tieneConfianza) {
        await liquidarMontoSesion(liquidando.id, valor, user.uid);
      } else if (puedeMarcarPagadas) {
        // Tiene permiso de marcar pagadas → solicita liquidación OS
        const pac = mapaPacientes[liquidando.pacienteId];
        await solicitarLiquidarOSSesion({
          consultorioId: user.consultorioId,
          sesionId: liquidando.id,
          monto: valor,
          profesionalUid: user.uid,
          profesionalNombre: user.displayName || user.email || '',
          sesionSnapshot: {
            pacienteNombre: pac ? nombrePaciente(pac) : (liquidando.pacienteNombre || ''),
            fecha: liquidando.fecha,
            metodoPagoNombre: liquidando.metodoPagoNombre || '',
            porcentajeConsultorio: Number(liquidando.porcentajeConsultorio) || 0,
          },
        });
      } else {
        const pac = mapaPacientes[liquidando.pacienteId];
        await solicitarLiquidarMonto({
          consultorioId: user.consultorioId,
          sesionId: liquidando.id,
          valorLiquidado: valor,
          profesionalUid: user.uid,
          profesionalNombre: user.displayName || user.email,
          pacienteNombre: pac ? nombrePaciente(pac) : 'Paciente',
        });
      }
    } else {
      await editarMontoLiquidado(liquidando.id, valor, user.uid);
    }
    setLiquidando(null);
  }

  // Marcar sesión como pagada / revertir a debe
  async function handleTogglePagado(sesion) {
    if (sesion.estadoPago === ESTADOS_PAGO_SESION.PAGADO) {
      // Revertir a debe — solo con edición directa (no tiene sentido solicitar reversión)
      if (!tieneConfianza) {
        alert('No tenés permiso para revertir el estado de pago. Contactá al administrador.');
        return;
      }
      try {
        await marcarSesionDebida(sesion.id, user.uid);
      } catch (err) {
        alert(err.message || 'No se pudo cambiar el estado.');
      }
      return;
    }
    // Marcar como pagada — genera solicitud si tiene permiso
    if (!puedeMarcarPagadas) return;
    const pac = mapaPacientes[sesion.pacienteId];
    /* Sin receptor a proposito. El profesional le PAGA al consultorio: el
       receptor es quien cobro del otro lado, no el. Poniendose a si mismo
       ensuciaba /admin/reparto, que agrupa por receptorUid para mostrar
       cuanto cobro cada administrador. Al omitirlo, aprobarSolicitud lo
       resuelve con el admin que aprueba, que es justamente quien confirma
       haber recibido la plata. */
    try {
      await solicitarMarcarPagada({
        consultorioId: user.consultorioId,
        profesionalUid: user.uid,
        profesionalNombre: user.displayName || user.email || '',
        sesionId: sesion.id,
        sesionSnapshot: {
          pacienteNombre: pac ? nombrePaciente(pac) : (sesion.pacienteNombre || ''),
          fecha: sesion.fecha,
          metodoPagoNombre: sesion.metodoPagoNombre || '',
          valorTotal: sesion.valorTotal || 0,
        },
      });
    } catch (err) {
      alert(err.message || 'No se pudo enviar la solicitud.');
    }
  }

  if (loadingConsultorio) {
    return (
      <div className="cp-sesiones">
        <div style={{ padding: 60, display: 'flex', justifyContent: 'center' }}>
          <Spinner size={24} />
        </div>
      </div>
    );
  }

  const hayPrereqs = pacientesActivos.length > 0 && metodos.length > 0;

  return (
    <div className="cp-sesiones">
      <header className="cp-sesiones-header">
        <div>
          <h1 className="cp-page-title">Mis sesiones</h1>
          <p className="cp-page-sub">
            {stats.cantidad === 0
              ? `Sin sesiones registradas en ${nombreDelMes(mes)}.`
              : `${stats.cantidad} sesione${stats.cantidad === 1 ? '' : 's'} en ${nombreDelMes(mes)}${stats.cantidad !== stats.cantidadRegistros ? ` (${stats.cantidadRegistros} registro${stats.cantidadRegistros === 1 ? '' : 's'})` : ''}.`}
          </p>
          <SelectorMes mes={mes} setMes={setMes} />
        </div>
        {/* Mismo contenedor en columna que usa el admin: sin esto las filas
            de botones quedan como hermanas sueltas del header y el flex las
            acomoda a la par del titulo en vez de apilarlas a la derecha. */}
        <div className="cp-sesiones-header__acciones">
          <div style={{ display: 'flex', gap: 10, alignItems: 'stretch' }}>
          <Button variant="secondary" onClick={() => setCargaRapidaOpen(true)} disabled={!hayPrereqs} style={{ flex: 1 }}>
            Carga rápida
          </Button>
          <Button
            variant="primary"
            icon={<PlusIcon />}
            onClick={() => setEditando('nueva')}
            disabled={!hayPrereqs}
            style={{ flex: 1 }}
          >
            {tieneConfianza ? 'Registrar sesión' : 'Solicitar nueva sesión'}
          </Button>
        </div>
        {/* Acciones masivas del mes. Solo aparecen si el admin le habilito
            "marcar pagadas": sin ese permiso el profesional no puede tocar
            el estado de pago ni siquiera pidiendolo. */}
        {puedeMarcarPagadas && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'stretch' }}>
            <Button
              variant="secondary"
              type="button"
              onClick={() => setMarcarMesOpen(true)}
              disabled={!hayPrereqs || sesionesDebidasDelMes.length === 0}
              style={{ flex: 1 }}
            >
              Marcar mes como pagado
            </Button>
            <Button
              variant="secondary"
              type="button"
              onClick={() => setLiquidarOSOpen(true)}
              disabled={!hayPrereqs || sesionesPorLiquidar.length === 0}
              style={{ flex: 1 }}
            >
              Liquidar sesiones OS
            </Button>
          </div>
        )}
        </div>
      </header>

      {/* Banner de modo "con aprobacion" */}
      {!tieneConfianza && (
        <div className="cp-aprobacion-banner">
          <ClockIcon />
          <div>
            <strong>Modo con aprobación</strong>
            <span>
              Tus acciones sobre sesiones (crear, modificar, eliminar) requieren la aprobación
              del administrador del consultorio. Cada solicitud queda registrada y vas a poder
              ver su estado acá. <strong>Tip:</strong> si tenés varias sesiones del mes con un mismo paciente,
              cargalas en un solo registro indicando la cantidad — así el administrador aprueba el grupo entero de una.
            </span>
          </div>
        </div>
      )}

      {/* Panel de solicitudes recientes */}
      {!tieneConfianza && solicitudesParaMostrar.length > 0 && (
        <SolicitudesPanel
          solicitudes={solicitudesParaMostrar}
          mapaPacientes={mapaPacientes}
          totalPendientes={solicitudesPendientesCount}
        />
      )}

      {!hayPrereqs && (
        <div className="cp-sesiones-empty">
          <div className="cp-sesiones-empty__mark">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h2 className="cp-sesiones-empty__title">Falta configuración</h2>
          <p className="cp-sesiones-empty__desc">
            {pacientesActivos.length === 0
              ? 'Todavía no te asignaron pacientes. Cuando el administrador del consultorio te asigne pacientes, vas a poder registrar sesiones.'
              : 'No hay métodos de pago configurados en el consultorio. Avisale al administrador.'}
          </p>
        </div>
      )}

      {hayPrereqs && (
        <>
          <StatsProfesional stats={stats} yaPagado={yaPagueAlConsultorio} />

          {loadingSesiones ? (
            <div style={{ padding: 60, display: 'flex', justifyContent: 'center' }}>
              <Spinner size={24} label="Cargando sesiones…" />
            </div>
          ) : sesiones.length === 0 ? (
            <div className="cp-sesiones-empty">
              <div className="cp-sesiones-empty__mark">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 7V3m8 4V3M3 11h18M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <h2 className="cp-sesiones-empty__title">Sin sesiones en {nombreDelMes(mes)}</h2>
              <p className="cp-sesiones-empty__desc">
                Cuando registres sesiones de este mes, las vas a ver acá con el cálculo
                automático de cuánto te queda y cuánto le debés al consultorio.
              </p>
              <Button variant="primary" icon={<PlusIcon />} onClick={() => setEditando('nueva')}>
                {tieneConfianza ? 'Registrar primera sesión' : 'Solicitar primera sesión'}
              </Button>
            </div>
          ) : (
            <TablaMisSesiones
              sesiones={sesiones}
              mapaPacientes={mapaPacientes}
              sesionesConPendiente={sesionesConPendiente}
              puedeMarcarPagadas={puedeMarcarPagadas}
              onEditar={(s) => setEditando(s)}
              onEliminar={handleEliminar}
              onLiquidar={handleAbrirLiquidar}
              onTogglePagado={handleTogglePagado}
            />
          )}
        </>
      )}

      {cargaRapidaOpen && (
        <CargaRapidaModal
          mesContexto={mes}
          esAdmin={false}
          tieneConfianza={tieneConfianza}
          profesionalNombre={user?.displayName || user?.email || ''}
          profesionales={[]}
          pacientes={pacientesActivos}
          mapaMetodos={Object.fromEntries(metodos.map((m) => [m.id, m]))}
          metodos={metodos}
          consultorioId={user.consultorioId}
          profesionalUidFijo={user.uid}
          uid={user.uid}
          onClose={() => setCargaRapidaOpen(false)}
        />
      )}

      {editando && (
        <SesionModal
          sesion={editando === 'nueva' ? null : editando}
          profesionales={[]}
          pacientes={pacientesActivos}
          metodos={metodos}
          esAdmin={false}
          consultorio={consultorio}
          consultorioId={user.consultorioId}
          profesionalUidFijo={user.uid}
          // Pasamos el flag para que el modal pueda ajustar el copy del boton
          modoSolicitud={!tieneConfianza}
          onClose={() => setEditando(null)}
          onGuardar={handleGuardar}
        />
      )}

      {marcarMesOpen && (
        <MarcarMesPagadoModal
          sesiones={sesionesDebidasDelMes}
          mapaPacientes={mapaPacientes}
          mes={mes}
          user={user}
          onClose={() => setMarcarMesOpen(false)}
        />
      )}

      {liquidarOSOpen && (
        <LiquidarOSMasivoModal
          sesiones={sesionesPorLiquidar}
          mapaPacientes={mapaPacientes}
          mes={mes}
          user={user}
          onClose={() => setLiquidarOSOpen(false)}
        />
      )}

      {liquidando && (
        <LiquidarMontoModal
          sesion={liquidando}
          paciente={mapaPacientes[liquidando.pacienteId]}
          modoSolicitud={!tieneConfianza && liquidando.estadoPago === ESTADOS_PAGO_SESION.PENDIENTE_MONTO}
          esCorreccion={liquidando.estadoPago === ESTADOS_PAGO_SESION.DEBIDO}
          onClose={() => setLiquidando(null)}
          onConfirmar={handleConfirmarLiquidar}
        />
      )}
    </div>
  );
}

/* ============================================================
   Modal: marcar el mes como pagado (genera solicitudes)
   ----------------------------------------------------------------
   El profesional NO puede cambiar el estado de pago por su cuenta:
   estaria saldando su propia deuda con el consultorio sin que nadie
   lo confirme. Las reglas de Firestore lo bloquean. Asi que esto
   genera una solicitud por sesion, que el admin ve agrupada por mes
   y aprueba en lote.
   ============================================================ */
function MarcarMesPagadoModal({ sesiones, mapaPacientes, mes, user, onClose }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [progreso, setProgreso] = useState(0);

  const total = useMemo(
    () => sesiones.reduce((acc, x) => acc + (x.montoConsultorio || 0), 0),
    [sesiones],
  );

  // Desglose por paciente: es lo que el profesional necesita para revisar
  // antes de mandar. Una sesion puede agrupar varias (cantidadSesiones),
  // asi que se suman los encuentros, no los registros.
  const porPaciente = useMemo(() => {
    const mapa = new Map();
    for (const ses of sesiones) {
      const pac = mapaPacientes[ses.pacienteId];
      const nombre = pac ? nombrePaciente(pac) : (ses.pacienteNombre || 'Paciente');
      const prev = mapa.get(nombre) || { nombre, cantidad: 0, monto: 0 };
      prev.cantidad += getCantidadSesiones(ses);
      prev.monto += ses.montoConsultorio || 0;
      mapa.set(nombre, prev);
    }
    return [...mapa.values()].sort((x, y) => y.monto - x.monto);
  }, [sesiones, mapaPacientes]);

  async function confirmar() {
    setError('');
    setSubmitting(true);
    let hechas = 0;
    try {
      for (const ses of sesiones) {
        const pac = mapaPacientes[ses.pacienteId];
        await solicitarMarcarPagada({
          consultorioId: user.consultorioId,
          profesionalUid: user.uid,
          profesionalNombre: user.displayName || user.email || '',
          sesionId: ses.id,
          sesionSnapshot: {
            pacienteNombre: pac ? nombrePaciente(pac) : (ses.pacienteNombre || ''),
            fecha: ses.fecha,
            metodoPagoNombre: ses.metodoPagoNombre || '',
            valorTotal: ses.valorTotal || 0,
          },
          // Sin receptor: lo define el admin al aprobar (ver handleTogglePagado).
        });
        hechas += 1;
        setProgreso(hechas);
      }
      onClose();
    } catch (err) {
      // Si fallo a mitad, las ya creadas quedan validas: se informa cuantas
      // salieron para que el profesional no reintente todo y duplique.
      setError(
        `${err.message || 'No se pudieron enviar todas las solicitudes.'}`
        + (hechas > 0 ? ` Se enviaron ${hechas} de ${sesiones.length}.` : ''),
      );
      setSubmitting(false);
    }
  }

  return (
    <div className="cp-modal-overlay" onClick={onClose}>
      <div className="cp-modal" onClick={(e) => e.stopPropagation()}>
        <button className="cp-modal__close" onClick={onClose} aria-label="Cerrar">×</button>
        <h2 className="cp-modal__title">Marcar {nombreDelMes(mes)} como pagado</h2>
        <p className="cp-modal__sub">
          Se va a pedir al administrador que dé por pagadas las{' '}
          <strong>{sesiones.length}</strong> sesion{sesiones.length === 1 ? '' : 'es'} que
          todavía figuran como debidas este mes.
        </p>

        <div className="cp-desglose">
          <div className="cp-desglose__head">
            <span>Paciente</span>
            <span>Sesiones</span>
            <span>Al consultorio</span>
          </div>
          <div className="cp-desglose__body">
            {porPaciente.map((p) => (
              <div key={p.nombre} className="cp-desglose__fila">
                <span className="cp-desglose__pac">{p.nombre}</span>
                <span className="cp-desglose__cant">
                  {p.cantidad} {p.cantidad === 1 ? 'sesión' : 'sesiones'}
                </span>
                <span className="cp-desglose__monto">{formatoARS.format(p.monto)}</span>
              </div>
            ))}
          </div>
          <div className="cp-desglose__total">
            <span>Total a pagar</span>
            <strong>{formatoARS.format(total)}</strong>
          </div>
        </div>

        <div className="cp-aprobacion-nota">
          Queda pendiente hasta que el administrador la apruebe. Él las ve
          agrupadas por mes, así que las aprueba todas juntas.
        </div>

        {error && <div className="cp-modal__error">{error}</div>}

        <div className="cp-modal__actions">
          <Button variant="ghost" type="button" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button variant="primary" type="button" onClick={confirmar} disabled={submitting}>
            {submitting
              ? <><Spinner size={14} /> Enviando {progreso}/{sesiones.length}…</>
              : `Enviar ${sesiones.length} solicitud${sesiones.length === 1 ? '' : 'es'}`}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Modal: liquidar sesiones de obra social (genera solicitudes)
   ----------------------------------------------------------------
   Cada sesion de obra social se liquida con SU propio monto (la obra
   social informa un importe distinto por prestacion), asi que no
   alcanza con un boton: hay que cargar el valor de cada una.
   ============================================================ */
function LiquidarOSMasivoModal({ sesiones, mapaPacientes, mes, user, onClose }) {
  const [montos, setMontos] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [progreso, setProgreso] = useState(0);

  const conMonto = useMemo(
    () => sesiones.filter((x) => Number(montos[x.id]) > 0),
    [sesiones, montos],
  );
  const totalCargado = useMemo(
    () => conMonto.reduce((acc, x) => acc + Number(montos[x.id] || 0), 0),
    [conMonto, montos],
  );

  async function confirmar() {
    if (conMonto.length === 0) {
      setError('Cargá el monto de al menos una sesión.');
      return;
    }
    setError('');
    setSubmitting(true);
    let hechas = 0;
    try {
      for (const ses of conMonto) {
        const pac = mapaPacientes[ses.pacienteId];
        await solicitarLiquidarOSSesion({
          consultorioId: user.consultorioId,
          profesionalUid: user.uid,
          profesionalNombre: user.displayName || user.email || '',
          sesionId: ses.id,
          monto: Number(montos[ses.id]),
          sesionSnapshot: {
            pacienteNombre: pac ? nombrePaciente(pac) : (ses.pacienteNombre || ''),
            fecha: ses.fecha,
            metodoPagoNombre: ses.metodoPagoNombre || '',
            porcentajeConsultorio: Number(ses.porcentajeConsultorio) || 0,
          },
        });
        hechas += 1;
        setProgreso(hechas);
      }
      onClose();
    } catch (err) {
      setError(
        `${err.message || 'No se pudieron enviar todas las solicitudes.'}`
        + (hechas > 0 ? ` Se enviaron ${hechas} de ${conMonto.length}.` : ''),
      );
      setSubmitting(false);
    }
  }

  return (
    <div className="cp-modal-overlay" onClick={onClose}>
      <div className="cp-modal cp-modal--wide" onClick={(e) => e.stopPropagation()}>
        <button className="cp-modal__close" onClick={onClose} aria-label="Cerrar">×</button>
        <h2 className="cp-modal__title">Liquidar sesiones de obra social</h2>
        <p className="cp-modal__sub">
          Cargá lo que liquidó la obra social por cada sesión de {nombreDelMes(mes)}.
          Las que dejes en blanco no se envían.
        </p>

        <div className="cp-liquidar-lista">
          {sesiones.map((ses) => {
            const pac = mapaPacientes[ses.pacienteId];
            const fechaRaw = ses.fecha?.toDate ? ses.fecha.toDate() : null;
            return (
              <div key={ses.id} className="cp-liquidar-fila">
                <div className="cp-liquidar-fila__info">
                  <span className="cp-liquidar-fila__pac">
                    {pac ? nombrePaciente(pac) : (ses.pacienteNombre || 'Paciente')}
                  </span>
                  <span className="cp-liquidar-fila__meta">
                    {fechaRaw ? fechaRaw.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' }) : '—'}
                    {ses.metodoPagoNombre ? ` · ${ses.metodoPagoNombre}` : ''}
                  </span>
                </div>
                <div className="cp-liquidar-fila__input">
                  <span>$</span>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    placeholder="0"
                    value={montos[ses.id] ?? ''}
                    onChange={(e) => setMontos((m) => ({ ...m, [ses.id]: e.target.value }))}
                    disabled={submitting}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="cp-liquidar-total">
          <span>{conMonto.length} de {sesiones.length} con monto cargado</span>
          <strong>{formatoARS.format(totalCargado)}</strong>
        </div>

        <div className="cp-aprobacion-nota">
          Cada monto se envía como solicitud al administrador. Recién cuando
          las apruebe se genera la deuda con el consultorio.
        </div>

        {error && <div className="cp-modal__error">{error}</div>}

        <div className="cp-modal__actions">
          <Button variant="ghost" type="button" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            type="button"
            onClick={confirmar}
            disabled={submitting || conMonto.length === 0}
          >
            {submitting
              ? <><Spinner size={14} /> Enviando {progreso}/{conMonto.length}…</>
              : `Enviar ${conMonto.length} solicitud${conMonto.length === 1 ? '' : 'es'}`}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Banner + panel de solicitudes
   ============================================================ */
function SolicitudesPanel({ solicitudes, mapaPacientes, totalPendientes }) {
  const [abierta, setAbierta] = useState(null);

  return (
    <div className="cp-solicitudes-panel">
      <div className="cp-solicitudes-panel__head">
        <h3 className="cp-solicitudes-panel__title">
          Mis solicitudes
          {totalPendientes > 0 && (
            <span className="cp-solicitudes-panel__count">{totalPendientes} pendiente{totalPendientes === 1 ? '' : 's'}</span>
          )}
        </h3>
        <span className="cp-solicitudes-panel__hint">Tocá una para ver el detalle</span>
      </div>
      <div className="cp-solicitudes-panel__list">
        {solicitudes.map((s) => {
          const esCargaRapida = s.tipo === TIPOS_SOLICITUD_SESION.CARGA_RAPIDA;
          const pac = !esCargaRapida && (s.payloadPropuesto?.pacienteId
            ? mapaPacientes[s.payloadPropuesto.pacienteId]
            : (s.payloadAnterior?.pacienteId ? mapaPacientes[s.payloadAnterior.pacienteId] : null));
          const nombrePac = esCargaRapida
            ? `${s.payloadPropuesto?.sesiones?.length ?? 0} sesiones`
            : (pac
              ? nombrePaciente(pac)
              : (s.payloadPropuesto?.sesionSnapshot?.pacienteNombre
                || s.payloadPropuesto?.pacienteNombre
                || '—'));

          const cantidad = !esCargaRapida
            ? (s.payloadPropuesto?.cantidadSesiones ?? s.payloadAnterior?.cantidadSesiones ?? 1)
            : 1;

          const fechaRaw = fechaDeTimestamp(s.createdAt);
          const fechaStr = fechaRaw
            ? fechaRaw.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })
            : '';

          const { badgeClass, badgeText } = estiloEstadoSolicitud(s.estado);
          const abiertaEsta = abierta === s.id;

          return (
            <div key={s.id} className={`cp-solicitud-item ${abiertaEsta ? 'cp-solicitud-item--abierta' : ''}`}>
              <button
                type="button"
                className="cp-solicitud-row cp-solicitud-row--btn"
                onClick={() => setAbierta(abiertaEsta ? null : s.id)}
                aria-expanded={abiertaEsta}
              >
                <div className="cp-solicitud-row__main">
                  <div className="cp-solicitud-row__title">
                    {LABELS_TIPO_SOLICITUD[s.tipo] ?? s.tipo} — {nombrePac}
                    {!esCargaRapida && <GroupBadge cantidad={cantidad} />}
                    {fechaStr && (
                      <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--cp-text-faint)', fontWeight: 400 }}>
                        {fechaStr}
                      </span>
                    )}
                  </div>
                  {s.estado === ESTADOS_SOLICITUD_SESION.RECHAZADA && s.motivoRechazo && (
                    <div className="cp-solicitud-row__motivo">Motivo: {s.motivoRechazo}</div>
                  )}
                  {s.estado === ESTADOS_SOLICITUD_SESION.OBSOLETA && (
                    <div className="cp-solicitud-row__motivo">
                      La sesión fue modificada por otro camino. Si querés, podés volver a solicitar.
                    </div>
                  )}
                </div>
                <span className={`cp-badge ${badgeClass}`}>{badgeText}</span>
                <span className="cp-solicitud-row__chevron" aria-hidden="true">
                  {abiertaEsta ? '▴' : '▾'}
                </span>
              </button>

              {abiertaEsta && <DetalleSolicitud solicitud={s} pacienteNombre={nombrePac} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---- Helpers de solicitudes ---- */

function fechaDeTimestamp(ts) {
  if (!ts) return null;
  if (ts.toDate) return ts.toDate();
  if (ts.seconds !== undefined) return new Date(ts.seconds * 1000);
  const d = new Date(ts);
  return isNaN(d.getTime()) ? null : d;
}

function estiloEstadoSolicitud(estado) {
  switch (estado) {
    case ESTADOS_SOLICITUD_SESION.PENDIENTE:
      return { badgeClass: 'cp-badge--pendiente-monto', badgeText: 'Pendiente' };
    case ESTADOS_SOLICITUD_SESION.APROBADA:
      return { badgeClass: 'cp-badge--pagada', badgeText: 'Aprobada' };
    case ESTADOS_SOLICITUD_SESION.RECHAZADA:
      return { badgeClass: 'cp-badge--debido', badgeText: 'Rechazada' };
    case ESTADOS_SOLICITUD_SESION.OBSOLETA:
      return { badgeClass: 'cp-badge--obsoleta', badgeText: 'Obsoleta' };
    default:
      return { badgeClass: '', badgeText: estado };
  }
}

function fmtFechaLarga(ts) {
  const d = fechaDeTimestamp(ts);
  if (!d) return '—';
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })
    + ' · ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

/*
  Detalle de una solicitud.

  Los payloads no tienen una forma unica (cada tipo guarda lo suyo), asi
  que en vez de asumir una estructura rigida se arma la lista con los
  campos que efectivamente existan. Si manana se agrega un tipo nuevo,
  esto no se rompe: muestra lo que haya.
*/
function DetalleSolicitud({ solicitud: s, pacienteNombre }) {
  const prop = s.payloadPropuesto || {};
  const ant = s.payloadAnterior || null;
  const snap = prop.sesionSnapshot || {};

  const filas = [];
  const push = (label, valor) => {
    if (valor === undefined || valor === null || valor === '') return;
    filas.push({ label, valor });
  };

  push('Paciente', pacienteNombre !== '—' ? pacienteNombre : null);
  push('Fecha de la sesión', prop.fecha || snap.fecha
    ? fmtFechaLarga(prop.fecha || snap.fecha) : null);
  push('Método', prop.metodoPagoNombre || snap.metodoPagoNombre);
  if (Number.isFinite(Number(prop.cantidadSesiones)) && Number(prop.cantidadSesiones) > 1) {
    push('Sesiones agrupadas', prop.cantidadSesiones);
  }
  if (Number.isFinite(Number(prop.valorTotal ?? snap.valorTotal))) {
    push('Valor total', formatoARS.format(Number(prop.valorTotal ?? snap.valorTotal)));
  }
  if (Number.isFinite(Number(prop.montoConsultorio))) {
    push('Al consultorio', formatoARS.format(Number(prop.montoConsultorio)));
  }
  if (Number.isFinite(Number(prop.monto))) {
    push('Monto liquidado', formatoARS.format(Number(prop.monto)));
  }
  if (prop.valorLiquidado !== undefined) {
    push('Monto liquidado', formatoARS.format(Number(prop.valorLiquidado) || 0));
  }
  if (s.tipo === TIPOS_SOLICITUD_SESION.CARGA_RAPIDA) {
    push('Sesiones en la carga', prop.sesiones?.length);
  }
  if (prop.receptor?.nombre) push('Recibe', prop.receptor.nombre);

  return (
    <div className="cp-solicitud-detalle">
      <div className="cp-solicitud-detalle__grid">
        <div className="cp-solicitud-detalle__item">
          <span className="cp-solicitud-detalle__label">Enviada</span>
          <span className="cp-solicitud-detalle__valor">{fmtFechaLarga(s.createdAt)}</span>
        </div>
        {filas.map((f) => (
          <div key={f.label} className="cp-solicitud-detalle__item">
            <span className="cp-solicitud-detalle__label">{f.label}</span>
            <span className="cp-solicitud-detalle__valor">{f.valor}</span>
          </div>
        ))}
      </div>

      {/* Solo en modificaciones tiene sentido el antes/despues */}
      {ant && s.tipo === TIPOS_SOLICITUD_SESION.MODIFICAR && (
        <div className="cp-solicitud-detalle__cambio">
          <span className="cp-solicitud-detalle__label">Valor anterior</span>
          <span className="cp-solicitud-detalle__valor">
            {Number.isFinite(Number(ant.valorTotal))
              ? formatoARS.format(Number(ant.valorTotal))
              : '—'}
            {Number.isFinite(Number(prop.valorTotal)) && (
              <> → <strong>{formatoARS.format(Number(prop.valorTotal))}</strong></>
            )}
          </span>
        </div>
      )}

      {s.estado !== ESTADOS_SOLICITUD_SESION.PENDIENTE && (
        <div className="cp-solicitud-detalle__resolucion">
          <span className="cp-solicitud-detalle__label">
            {s.estado === ESTADOS_SOLICITUD_SESION.APROBADA ? 'Aprobada' : 'Resuelta'}
          </span>
          <span className="cp-solicitud-detalle__valor">
            {fmtFechaLarga(s.updatedAt || s.resueltaEn)}
            {s.adminNombre ? ` · por ${s.adminNombre}` : ''}
          </span>
        </div>
      )}

      {s.estado === ESTADOS_SOLICITUD_SESION.PENDIENTE && (
        <div className="cp-solicitud-detalle__nota">
          Esperando la aprobación del administrador. Mientras tanto la sesión
          no cambia de estado.
        </div>
      )}
    </div>
  );
}

/* ============================================================
   Stats desde la perspectiva del profesional
   ============================================================ */
function StatsProfesional({ stats, yaPagado }) {
  return (
    <div className="cp-sesiones-stats">
      <div className="cp-stat">
        <div className="cp-stat__label">Sesiones</div>
        <div className="cp-stat__value">{stats.cantidad}</div>
        <div className="cp-stat__hint">
          en el mes seleccionado
          {stats.cantidad !== stats.cantidadRegistros && ` · ${stats.cantidadRegistros} registro${stats.cantidadRegistros === 1 ? '' : 's'}`}
        </div>
      </div>
      <div className="cp-stat cp-stat--success">
        <div className="cp-stat__label">Lo que cobré</div>
        <div className="cp-stat__value">{formatoARS.format(stats.totalProfesional)}</div>
        <div className="cp-stat__hint">tu parte de las sesiones</div>
      </div>
      <div className="cp-stat cp-stat--debido">
        <div className="cp-stat__label">Le debo al consultorio</div>
        <div className="cp-stat__value">{formatoARS.format(stats.debido)}</div>
        <div className="cp-stat__hint">de sesiones aún no pagadas</div>
      </div>
      <div className="cp-stat">
        <div className="cp-stat__label">Ya pagado</div>
        <div className="cp-stat__value">{formatoARS.format(yaPagado)}</div>
        <div className="cp-stat__hint">al consultorio este mes</div>
      </div>
    </div>
  );
}

/* ============================================================
   Tabla de sesiones del profesional
   ----------------------------------------------------------------
   Columna "Sesiones" dedicada que muestra la cantidad de encuentros
   agrupados en el registro. Si es 1, se ve como "1" normal; si es
   N>1, se ve como "N" en color accent destacado para que el ojo
   lo capte facil.

   Las acciones quedan deshabilitadas si la sesion ya fue pagada o
   si tiene una solicitud pendiente.
   ============================================================ */
function TablaMisSesiones({ sesiones, mapaPacientes, sesionesConPendiente, puedeMarcarPagadas, onEditar, onEliminar, onLiquidar, onTogglePagado }) {
  return (
    <DualScrollTable className="cp-compact-list">
      <table className="cp-table cp-sesiones-tabla">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Paciente</th>
            <th className="cp-num-col" title="Cantidad de sesiones agrupadas en este registro">Sesiones</th>
            <th>Método</th>
            <th className="cp-num-col">Valor</th>
            <th className="cp-num-col">Mi parte</th>
            <th className="cp-num-col">Al consultorio</th>
            <th>Estado</th>
            <th aria-label="Acciones" />
          </tr>
        </thead>
        <tbody>
          {sesiones.map((s) => {
            const pac = mapaPacientes[s.pacienteId];
            const f = formatoFechaHoraCorta(s.fecha);
            const pagada = s.estadoPago === ESTADOS_PAGO_SESION.PAGADO;
            const pendienteMonto = s.estadoPago === ESTADOS_PAGO_SESION.PENDIENTE_MONTO;
            const tienePendiente = sesionesConPendiente.has(s.id);
            const accionesDisabled = pagada || tienePendiente;
            const cantidad = getCantidadSesiones(s);
            const esAgrupada = cantidad > 1;

            return (
              <tr
                key={s.id}
                className={`cp-sesiones-tabla__row ${pagada ? 'cp-sesiones-tabla__row--pagada' : ''} ${pendienteMonto ? 'cp-sesiones-tabla__row--pendiente-monto' : ''}`}
                onClick={() => !accionesDisabled && onEditar(s)}
              >
                <td data-label="Fecha">
                  <div className="cp-fecha-cell">
                    <div className="cp-fecha-cell__dia">{f.dia}</div>
                    <div className="cp-fecha-cell__hora">{f.hora}</div>
                  </div>
                </td>
                <td data-label="Paciente">
                  {pac ? (
                    <div className="cp-prof-cell">
                      <Avatar initials={inicialesPaciente(pac)} size={28} />
                      <div>
                        <div className="cp-prof-name" style={{ fontSize: 13.5 }}>
                          {nombrePaciente(pac)}
                        </div>
                      </div>
                    </div>
                  ) : <span style={{ color: 'var(--cp-text-muted)', fontSize: 13 }}>{s.pacienteNombre || 'Paciente eliminado'}</span>}
                </td>
                <td data-label="Sesiones" className="cp-num">
                  <span
                    className={esAgrupada ? 'cp-cantidad-cell cp-cantidad-cell--grupo' : 'cp-cantidad-cell'}
                    title={esAgrupada ? `Este registro representa ${cantidad} sesiones agrupadas` : '1 sesión'}
                  >
                    {cantidad}
                  </span>
                </td>
                <td data-label="Método" style={{ fontSize: 13 }}>
                  {s.metodoPagoNombre}
                  {s.metodoPagoTipo === TIPOS_METODO_PAGO.DIFERIDO && (
                    <span className="cp-badge cp-badge--diferido" style={{ marginLeft: 6 }}>diferido</span>
                  )}
                </td>
                <td data-label="Valor" className="cp-num">
                  {pendienteMonto ? (
                    <span style={{ color: 'var(--cp-text-faint)', fontStyle: 'italic' }}>—</span>
                  ) : (
                    <>
                      {formatoARS.format(s.valorTotal)}
                      {esAgrupada && s.valorSesion ? (
                        <div style={{ fontSize: 11, color: 'var(--cp-text-muted)', marginTop: 2 }}>
                          {formatoARS.format(s.valorSesion)} c/u
                        </div>
                      ) : null}
                    </>
                  )}
                </td>
                <td data-label="Mi parte" className="cp-num" style={{ color: 'var(--cp-success)' }}>
                  {pendienteMonto ? <span style={{ color: 'var(--cp-text-faint)' }}>—</span> : formatoARS.format(s.montoProfesional)}
                </td>
                <td data-label="Al consultorio" className="cp-num" style={{ color: 'var(--cp-accent)' }}>
                  {pendienteMonto ? <span style={{ color: 'var(--cp-text-faint)' }}>—</span> : formatoARS.format(s.montoConsultorio)}
                </td>
                <td data-label="Estado">
                  {tienePendiente ? (
                    <span className="cp-badge cp-badge--debido">
                      <ClockIcon />
                      Solicitud pendiente
                    </span>
                  ) : pendienteMonto ? (
                    <span className="cp-badge cp-badge--pendiente-monto">
                      <span className="cp-badge__dot" />
                      Pendiente liquidar
                    </span>
                  ) : (
                    <span className={`cp-badge ${pagada ? 'cp-badge--pagada' : 'cp-badge--debido'}`}>
                      <span className="cp-badge__dot" />
                      {pagada ? 'Pagada' : 'Debe'}
                    </span>
                  )}
                </td>
                <td className="cp-sesiones-tabla__actions-cell" onClick={(e) => e.stopPropagation()}>
                  <div className="cp-sesiones-tabla__actions">
                    {pendienteMonto && !tienePendiente ? (
                      <button
                        className="cp-icon-btn cp-icon-btn--success"
                        onClick={() => onLiquidar(s)}
                        title="Liquidar monto de obra social"
                        aria-label="Liquidar monto"
                      >
                        <CheckIcon />
                      </button>
                    ) : s.metodoPagoTipo === TIPOS_METODO_PAGO.DIFERIDO && !pagada && !tienePendiente ? (
                      <button
                        className="cp-icon-btn"
                        onClick={() => onLiquidar(s)}
                        title="Corregir monto liquidado"
                        aria-label="Corregir monto"
                      >
                        <EditIcon />
                      </button>
                    ) : (
                      <>
                        <button
                          className="cp-icon-btn"
                          onClick={() => onEditar(s)}
                          title={tienePendiente ? 'Hay una solicitud pendiente para esta sesión' : 'Editar'}
                          aria-label="Editar"
                          disabled={accionesDisabled}
                        >
                          <EditIcon />
                        </button>
                        {/* Sesión pagada: el profesional NO puede eliminarla, solo el admin */}
                        {!pagada && (
                          <button
                            className="cp-icon-btn cp-icon-btn--danger"
                            onClick={() => onEliminar(s)}
                            title={tienePendiente ? 'Hay una solicitud pendiente para esta sesión' : 'Eliminar'}
                            aria-label="Eliminar"
                            disabled={tienePendiente}
                          >
                            <TrashIcon />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </td>

                {/* Mobile: fila compacta */}
                <td className="cp-td-mobile-main" onClick={() => !accionesDisabled && onEditar(s)}>
                  <div className="cp-row-mobile__top">
                    {pac ? (
                      <div className="cp-prof-cell">
                        <Avatar initials={inicialesPaciente(pac)} size={26} />
                        <div className="cp-prof-name">
                          {nombrePaciente(pac)}
                          {esAgrupada && <GroupBadge cantidad={cantidad} />}
                        </div>
                      </div>
                    ) : <span style={{ color: 'var(--cp-text-muted)', fontSize: 13 }}>{s.pacienteNombre || 'Paciente eliminado'}</span>}
                  </div>
                  <div className="cp-row-mobile__mid">
                    {f.dia} {f.hora} · {s.metodoPagoNombre}
                  </div>
                  <div className="cp-row-mobile__bot">
                    {pendienteMonto ? 'Pendiente de liquidar' : `Mi parte: ${formatoARS.format(s.montoProfesional)} · Total: ${formatoARS.format(s.valorTotal)}`}
                  </div>
                </td>
                <td className="cp-td-mobile-badge">
                  {tienePendiente ? (
                    <span className="cp-badge cp-badge--debido" style={{ fontSize: 11 }}><ClockIcon />Solicit.</span>
                  ) : pendienteMonto ? (
                    <span className="cp-badge cp-badge--pendiente-monto" style={{ fontSize: 11 }}><span className="cp-badge__dot" />A liquid.</span>
                  ) : (
                    <span className={`cp-badge ${pagada ? 'cp-badge--pagada' : 'cp-badge--debido'}`} style={{ fontSize: 11 }}>
                      <span className="cp-badge__dot" />{pagada ? 'Pagada' : 'Debe'}
                    </span>
                  )}
                </td>
                <td className="cp-td-mobile-actions" onClick={(e) => e.stopPropagation()}>
                  <ActionMenu items={[
                    ...(pendienteMonto && !tienePendiente ? [{
                      label: 'Liquidar monto', icon: <CheckIcon />, onClick: () => onLiquidar(s),
                    }] : s.metodoPagoTipo === TIPOS_METODO_PAGO.DIFERIDO && !pagada && !tienePendiente ? [{
                      label: 'Corregir monto', icon: <EditIcon />, onClick: () => onLiquidar(s),
                    }] : []),
                    /* Marcar como pagada: genera una solicitud al admin, no
                       cambia el estado directo. Solo si el admin le habilito
                       el permiso y la sesion ya tiene monto definido. */
                    ...(puedeMarcarPagadas && !pagada && !pendienteMonto && !tienePendiente ? [{
                      label: 'Marcar como pagada', icon: <CheckIcon />, onClick: () => onTogglePagado(s),
                    }] : []),
                    { label: 'Editar', icon: <EditIcon />, onClick: () => onEditar(s), disabled: accionesDisabled },
                    ...(!pagada ? [{ label: 'Eliminar', icon: <TrashIcon />, onClick: () => onEliminar(s), danger: true, disabled: tienePendiente }] : []),
                  ]} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </DualScrollTable>
  );
}
