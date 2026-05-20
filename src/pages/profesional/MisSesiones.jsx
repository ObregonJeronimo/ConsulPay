import { useEffect, useMemo, useState } from 'react';

import ActionMenu from '../../components/ui/ActionMenu.jsx';
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
} from '../../lib/constants.js';
import { getMetodosPaciente, suscribirPacientesProfesional } from '../../lib/pacientes.js';
import {
  actualizarSesion,
  crearSesion,
  eliminarSesion,
  finDeMes,
  getCantidadSesiones,
  inicioDeMes,
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
  solicitarModificarSesion,
  suscribirSolicitudesDelProfesional,
} from '../../lib/solicitudes.js';

import { GroupBadge, LiquidarMontoModal, SesionModal } from '../admin/Sesiones.jsx';
import '../admin/Sesiones.css';

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
    return solicitudes.slice(0, 5);
  }, [solicitudes]);

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
    try {
      const esPrimeraLiquidacion = liquidando.estadoPago === ESTADOS_PAGO_SESION.PENDIENTE_MONTO;
      if (esPrimeraLiquidacion) {
        if (tieneConfianza) {
          await liquidarMontoSesion(liquidando.id, valor, user.uid);
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
        // Correccion del monto (sesion ya estaba en debido)
        // Disponible sin restriccion de confianza para el profesional
        await editarMontoLiquidado(liquidando.id, valor, user.uid);
      }
      setLiquidando(null);
    } catch (err) {
      throw err;
    }
  }

  /* ---- Renders ---- */

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
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {/* Carga rápida: disponible para todos los profesionales.
              Sin edición directa → genera solicitud en bloque. */}
          <Button variant="secondary" onClick={() => setCargaRapidaOpen(true)} disabled={!hayPrereqs}>
            Carga rápida
          </Button>
          <Button
            variant="primary"
            icon={<PlusIcon />}
            onClick={() => setEditando('nueva')}
            disabled={!hayPrereqs}
          >
            {tieneConfianza ? 'Registrar sesión' : 'Solicitar nueva sesión'}
          </Button>
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
              onEditar={(s) => setEditando(s)}
              onEliminar={handleEliminar}
              onLiquidar={handleAbrirLiquidar}
            />
          )}
        </>
      )}

      {cargaRapidaOpen && (
        <CargaRapidaModal
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
   Banner + panel de solicitudes
   ============================================================ */
function SolicitudesPanel({ solicitudes, mapaPacientes, totalPendientes }) {
  return (
    <div className="cp-solicitudes-panel">
      <div className="cp-solicitudes-panel__head">
        <h3 className="cp-solicitudes-panel__title">
          Mis solicitudes recientes
          {totalPendientes > 0 && (
            <span className="cp-solicitudes-panel__count">{totalPendientes} pendiente{totalPendientes === 1 ? '' : 's'}</span>
          )}
        </h3>
      </div>
      <div className="cp-solicitudes-panel__list">
        {solicitudes.map((s) => {
          const pac = s.payloadPropuesto?.pacienteId
            ? mapaPacientes[s.payloadPropuesto.pacienteId]
            : (s.payloadAnterior?.pacienteId ? mapaPacientes[s.payloadAnterior.pacienteId] : null);
          const nombrePac = pac ? nombrePaciente(pac) : 'paciente desconocido';

          // Cantidad agrupada (si aplica) para mostrar en el titulo
          const cantidad = s.payloadPropuesto?.cantidadSesiones
            ?? s.payloadAnterior?.cantidadSesiones
            ?? 1;

          let icon, badgeClass, badgeText;
          switch (s.estado) {
            case ESTADOS_SOLICITUD_SESION.PENDIENTE:
              icon = <ClockIcon />;
              badgeClass = 'cp-badge--debido';
              badgeText = 'Pendiente';
              break;
            case ESTADOS_SOLICITUD_SESION.APROBADA:
              badgeClass = 'cp-badge--pagada';
              badgeText = 'Aprobada';
              break;
            case ESTADOS_SOLICITUD_SESION.RECHAZADA:
              badgeClass = 'cp-badge--rechazada';
              badgeText = 'Rechazada';
              break;
            case ESTADOS_SOLICITUD_SESION.OBSOLETA:
              badgeClass = 'cp-badge--obsoleta';
              badgeText = 'Obsoleta';
              break;
            default:
              badgeClass = '';
              badgeText = s.estado;
          }

          return (
            <div key={s.id} className="cp-solicitud-row">
              <div className="cp-solicitud-row__main">
                <div className="cp-solicitud-row__title">
                  {LABELS_TIPO_SOLICITUD[s.tipo]} — {nombrePac}
                  <GroupBadge cantidad={cantidad} />
                </div>
                {s.estado === ESTADOS_SOLICITUD_SESION.RECHAZADA && s.motivoRechazo && (
                  <div className="cp-solicitud-row__motivo">
                    Motivo: {s.motivoRechazo}
                  </div>
                )}
                {s.estado === ESTADOS_SOLICITUD_SESION.OBSOLETA && (
                  <div className="cp-solicitud-row__motivo">
                    La sesión fue modificada por otro camino. Si querés, podés volver a solicitar.
                  </div>
                )}
              </div>
              <span className={`cp-badge ${badgeClass}`}>
                {icon}
                {badgeText}
              </span>
            </div>
          );
        })}
      </div>
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
function TablaMisSesiones({ sesiones, mapaPacientes, sesionesConPendiente, onEditar, onEliminar, onLiquidar }) {
  return (
    <div className="cp-compact-list cp-table-wrap">
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
                  ) : <span style={{ color: 'var(--cp-text-faint)' }}>Paciente eliminado</span>}
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
                    ) : <span style={{ color: 'var(--cp-text-faint)' }}>Paciente eliminado</span>}
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
                    { label: 'Editar', icon: <EditIcon />, onClick: () => onEditar(s), disabled: accionesDisabled },
                    // Pagada: el profesional no puede eliminar, solo el admin
                    ...(!pagada ? [{ label: 'Eliminar', icon: <TrashIcon />, onClick: () => onEliminar(s), danger: true, disabled: tienePendiente }] : []),
                  ]} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
