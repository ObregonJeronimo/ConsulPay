import { useEffect, useMemo, useState } from 'react';

import Avatar from '../../components/ui/Avatar.jsx';
import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';
import PacienteAutocomplete from '../../components/ui/PacienteAutocomplete.jsx';
import Spinner from '../../components/ui/Spinner.jsx';

import { useAuth } from '../../hooks/useAuth.js';
import { useConsultorio } from '../../hooks/useConsultorio.js';
import {
  ESTADOS_PACIENTE,
  ESTADOS_PAGO_SESION,
  ESTADOS_USUARIO,
  formatoARS,
  TIPOS_METODO_PAGO,
} from '../../lib/constants.js';
import { suscribirPacientesConsultorio } from '../../lib/pacientes.js';
import { suscribirProfesionales } from '../../lib/profesionales.js';
import {
  calcularSplit,
  crearSesion,
  actualizarSesion,
  eliminarSesion,
  finDeMes,
  getCantidadSesiones,
  inicioDeMes,
  marcarSesionDebida,
  marcarSesionPagada,
  nombreDelMes,
  suscribirSesionesConsultorio,
  totalesGlobales,
  validarFechaContraConsultorio,
} from '../../lib/sesiones.js';
import { marcarPendientesComoObsoletas } from '../../lib/solicitudes.js';

import './Sesiones.css';

/* ============================================================
   Iconos
   ============================================================ */
const PlusIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 4v16m8-8H4" />
  </svg>
);
const SearchIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="7" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
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
const CheckIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);
const RevertIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="1 4 1 10 7 10" />
    <path d="M3.51 15a9 9 0 102.13-9.36L1 10" />
  </svg>
);
const LockIcon = () => (
  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" />
    <path d="M7 11V7a5 5 0 0110 0v4" />
  </svg>
);

/* ============================================================
   Helpers
   ============================================================ */
function nombrePaciente(p) {
  return `${p.apellido ?? ''}${p.apellido && p.nombre ? ', ' : ''}${p.nombre ?? ''}`;
}
function nombreProfesional(p) {
  return p?.displayName || p?.email || '—';
}
function inicialesPaciente(p) {
  return ((p.apellido?.[0] ?? '') + (p.nombre?.[0] ?? '')).toUpperCase() || '·';
}

function formatoFechaHoraCorta(date) {
  if (!date) return '—';
  const d = date.toDate ? date.toDate() : new Date(date);
  const dia = d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
  const hora = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  return { dia, hora };
}

function dateAInputValue(d) {
  if (!d) return '';
  const date = d instanceof Date ? d : new Date(d);
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/* ============================================================
   Pagina principal
   ============================================================ */
export default function Sesiones() {
  const { user } = useAuth();
  const { consultorio, loading: loadingConsultorio } = useConsultorio();

  const [mes, setMes] = useState(() => inicioDeMes(new Date()));

  const [sesiones, setSesiones] = useState([]);
  const [pacientes, setPacientes] = useState([]);
  const [profesionales, setProfesionales] = useState([]);
  const [loadingSesiones, setLoadingSesiones] = useState(true);

  const [busqueda, setBusqueda] = useState('');
  const [filtroProfesional, setFiltroProfesional] = useState('todos');
  const [filtroMetodo, setFiltroMetodo] = useState('todos');
  const [filtroEstado, setFiltroEstado] = useState('todos');

  const [editando, setEditando] = useState(null);

  useEffect(() => {
    if (!user?.consultorioId) return;
    setLoadingSesiones(true);
    const desde = inicioDeMes(mes);
    const hasta = finDeMes(mes);
    const unsub = suscribirSesionesConsultorio(
      user.consultorioId,
      (data) => {
        setSesiones(data);
        setLoadingSesiones(false);
      },
      { desde, hasta },
    );
    return unsub;
  }, [user?.consultorioId, mes]);

  useEffect(() => {
    if (!user?.consultorioId) return;
    return suscribirPacientesConsultorio(user.consultorioId, setPacientes);
  }, [user?.consultorioId]);

  useEffect(() => {
    if (!user?.consultorioId) return;
    return suscribirProfesionales(user.consultorioId, setProfesionales);
  }, [user?.consultorioId]);

  const profesionalesActivos = useMemo(
    () => profesionales.filter((p) => p.estado === ESTADOS_USUARIO.ACTIVO),
    [profesionales],
  );

  const pacientesActivos = useMemo(
    () => pacientes.filter((p) => p.estado === ESTADOS_PACIENTE.ACTIVO),
    [pacientes],
  );

  const metodos = useMemo(
    () => consultorio?.metodosPagoPaciente ?? [],
    [consultorio?.metodosPagoPaciente],
  );

  const mapaProfesionales = useMemo(() => {
    const m = {};
    for (const p of profesionales) m[p.uid] = p;
    return m;
  }, [profesionales]);

  const mapaPacientes = useMemo(() => {
    const m = {};
    for (const p of pacientes) m[p.id] = p;
    return m;
  }, [pacientes]);

  const sesionesFiltradas = useMemo(() => {
    let list = sesiones;

    if (filtroProfesional !== 'todos') {
      list = list.filter((s) => s.profesionalUid === filtroProfesional);
    }
    if (filtroMetodo !== 'todos') {
      list = list.filter((s) => s.metodoPagoId === filtroMetodo);
    }
    if (filtroEstado !== 'todos') {
      list = list.filter((s) => s.estadoPago === filtroEstado);
    }

    const q = busqueda.trim().toLowerCase();
    if (q) {
      list = list.filter((s) => {
        const pac = mapaPacientes[s.pacienteId];
        const prof = mapaProfesionales[s.profesionalUid];
        const pacStr = pac ? `${pac.nombre ?? ''} ${pac.apellido ?? ''} ${pac.dni ?? ''}`.toLowerCase() : '';
        const profStr = prof ? `${prof.displayName ?? ''} ${prof.email ?? ''}`.toLowerCase() : '';
        return pacStr.includes(q) || profStr.includes(q);
      });
    }

    return list;
  }, [sesiones, busqueda, filtroProfesional, filtroMetodo, filtroEstado, mapaPacientes, mapaProfesionales]);

  const stats = useMemo(() => totalesGlobales(sesiones), [sesiones]);
  const cobrado = stats.totalConsultorio - stats.debido;

  /* ---- Handlers ---- */

  async function handleGuardar(input) {
    if (editando === 'nueva') {
      await crearSesion(input, user.uid);
    } else {
      await actualizarSesion(editando.id, input, user.uid);
      try {
        await marcarPendientesComoObsoletas({
          consultorioId: user.consultorioId,
          sesionId: editando.id,
          motivo: 'La sesión fue modificada directamente por el administrador.',
          adminUid: user.uid,
          adminNombre: user.displayName || user.email,
        });
      } catch (err) {
        console.error('Error marcando solicitudes como obsoletas:', err);
      }
    }
    setEditando(null);
  }

  async function handleEliminar(sesion) {
    const pac = mapaPacientes[sesion.pacienteId];
    const ok = confirm(
      `¿Eliminar la sesión del ${formatoFechaHoraCorta(sesion.fecha).dia} con ${pac ? nombrePaciente(pac) : 'el paciente'}?\n\nEsta acción no se puede deshacer.`,
    );
    if (!ok) return;
    try {
      try {
        await marcarPendientesComoObsoletas({
          consultorioId: user.consultorioId,
          sesionId: sesion.id,
          motivo: 'La sesión fue eliminada directamente por el administrador.',
          adminUid: user.uid,
          adminNombre: user.displayName || user.email,
        });
      } catch (err) {
        console.error('Error marcando solicitudes como obsoletas:', err);
      }
      await eliminarSesion(sesion.id);
    } catch (err) {
      alert(err.message || 'No se pudo eliminar la sesión.');
    }
  }

  async function handleTogglePagado(sesion) {
    try {
      if (sesion.estadoPago === ESTADOS_PAGO_SESION.DEBIDO) {
        await marcarSesionPagada(sesion.id, user.uid);
      } else {
        await marcarSesionDebida(sesion.id, user.uid);
      }
    } catch (err) {
      alert(err.message || 'No se pudo cambiar el estado.');
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

  const hayPrereqs = profesionalesActivos.length > 0
    && pacientesActivos.length > 0
    && metodos.length > 0;

  return (
    <div className="cp-sesiones">
      <header className="cp-sesiones-header">
        <div>
          <h1 className="cp-page-title">Sesiones</h1>
          <p className="cp-page-sub">
            Registro de sesiones del consultorio. {stats.cantidad === 0
              ? 'Sin sesiones este mes.'
              : `${stats.cantidad} sesione${stats.cantidad === 1 ? '' : 's'} en ${nombreDelMes(mes)}${stats.cantidad !== stats.cantidadRegistros ? ` (${stats.cantidadRegistros} registro${stats.cantidadRegistros === 1 ? '' : 's'})` : ''}.`
            }
          </p>
          <SelectorMes mes={mes} setMes={setMes} />
        </div>
        <Button
          variant="primary"
          icon={<PlusIcon />}
          onClick={() => setEditando('nueva')}
          disabled={!hayPrereqs}
        >
          Registrar sesión
        </Button>
      </header>

      {!hayPrereqs && (
        <div className="cp-sesiones-empty">
          <div className="cp-sesiones-empty__mark">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h2 className="cp-sesiones-empty__title">Falta configuración previa</h2>
          <p className="cp-sesiones-empty__desc">
            Para registrar sesiones necesitás tener al menos un profesional activo,
            un paciente cargado y un método de pago configurado.
          </p>
        </div>
      )}

      {hayPrereqs && (
        <>
          <StatsCards stats={stats} cobrado={cobrado} />

          <div className="cp-sesiones-filtros">
            <div className="cp-sesiones-filtros__search">
              <SearchIcon />
              <input
                type="text"
                placeholder="Buscar por paciente, profesional o DNI…"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
            </div>
            <select
              className="cp-sesiones-filtros__select"
              value={filtroProfesional}
              onChange={(e) => setFiltroProfesional(e.target.value)}
            >
              <option value="todos">Todos los profesionales</option>
              {profesionalesActivos.map((p) => (
                <option key={p.uid} value={p.uid}>{nombreProfesional(p)}</option>
              ))}
            </select>
            <select
              className="cp-sesiones-filtros__select"
              value={filtroMetodo}
              onChange={(e) => setFiltroMetodo(e.target.value)}
            >
              <option value="todos">Todos los métodos</option>
              {metodos.map((m) => (
                <option key={m.id} value={m.id}>{m.nombre}</option>
              ))}
            </select>
            <select
              className="cp-sesiones-filtros__select"
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value)}
            >
              <option value="todos">Todos los estados</option>
              <option value={ESTADOS_PAGO_SESION.DEBIDO}>Debidas</option>
              <option value={ESTADOS_PAGO_SESION.PAGADO}>Pagadas</option>
            </select>
          </div>

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
                Cuando se registren sesiones de este mes, las vas a ver acá con el desglose
                de cuánto va al consultorio y cuánto al profesional.
              </p>
              <Button variant="primary" icon={<PlusIcon />} onClick={() => setEditando('nueva')}>
                Registrar primera sesión
              </Button>
            </div>
          ) : sesionesFiltradas.length === 0 ? (
            <div className="cp-sesiones-empty">
              <p className="cp-sesiones-empty__desc">
                Ninguna sesión coincide con los filtros aplicados.
              </p>
            </div>
          ) : (
            <TablaSesiones
              sesiones={sesionesFiltradas}
              mapaPacientes={mapaPacientes}
              mapaProfesionales={mapaProfesionales}
              onEditar={(s) => setEditando(s)}
              onEliminar={handleEliminar}
              onTogglePagado={handleTogglePagado}
            />
          )}
        </>
      )}

      {editando && (
        <SesionModal
          sesion={editando === 'nueva' ? null : editando}
          profesionales={profesionalesActivos}
          pacientes={pacientesActivos}
          metodos={metodos}
          esAdmin
          consultorio={consultorio}
          consultorioId={user.consultorioId}
          onClose={() => setEditando(null)}
          onGuardar={handleGuardar}
        />
      )}
    </div>
  );
}

/* ============================================================
   Selector de mes
   ============================================================ */
function SelectorMes({ mes, setMes }) {
  const hoy = inicioDeMes(new Date());
  const esEsteMes = mes.getFullYear() === hoy.getFullYear() && mes.getMonth() === hoy.getMonth();

  function prev() {
    setMes(new Date(mes.getFullYear(), mes.getMonth() - 1, 1));
  }
  function next() {
    setMes(new Date(mes.getFullYear(), mes.getMonth() + 1, 1));
  }

  return (
    <div className="cp-mes-selector">
      <button className="cp-mes-selector__btn" onClick={prev} aria-label="Mes anterior">
        <ChevronLeft />
      </button>
      <span className="cp-mes-selector__label">{nombreDelMes(mes)}</span>
      <button className="cp-mes-selector__btn" onClick={next} aria-label="Mes siguiente">
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
   Stats cards
   ============================================================ */
function StatsCards({ stats, cobrado }) {
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
      <div className="cp-stat">
        <div className="cp-stat__label">Facturación total</div>
        <div className="cp-stat__value">{formatoARS.format(stats.valorTotal)}</div>
        <div className="cp-stat__hint">suma del valor de todas las sesiones</div>
      </div>
      <div className="cp-stat cp-stat--debido">
        <div className="cp-stat__label">Por cobrar</div>
        <div className="cp-stat__value">{formatoARS.format(stats.debido)}</div>
        <div className="cp-stat__hint">sesiones aún no pagadas al consultorio</div>
      </div>
      <div className="cp-stat cp-stat--success">
        <div className="cp-stat__label">Cobrado</div>
        <div className="cp-stat__value">{formatoARS.format(cobrado)}</div>
        <div className="cp-stat__hint">ya recibido por el consultorio</div>
      </div>
    </div>
  );
}

/* ============================================================
   Badge "×N" para sesiones agrupadas
   ----------------------------------------------------------------
   Se muestra al lado del nombre del paciente o de la fecha cuando
   el doc representa mas de 1 encuentro. Visualmente discreto.
   ============================================================ */
export function GroupBadge({ cantidad }) {
  const c = Number(cantidad) || 1;
  if (c <= 1) return null;
  return (
    <span
      className="cp-group-badge"
      title={`Este registro representa ${c} sesiones agrupadas`}
    >
      ×{c}
    </span>
  );
}

/* ============================================================
   Tabla de sesiones (vista admin)
   ============================================================ */
function TablaSesiones({ sesiones, mapaPacientes, mapaProfesionales, onEditar, onEliminar, onTogglePagado }) {
  return (
    <div className="cp-table-wrap">
      <table className="cp-table cp-sesiones-tabla">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Profesional</th>
            <th>Paciente</th>
            <th>Método</th>
            <th className="cp-num-col">Valor</th>
            <th className="cp-num-col">Consultorio</th>
            <th className="cp-num-col">Profesional</th>
            <th>Estado</th>
            <th aria-label="Acciones" />
          </tr>
        </thead>
        <tbody>
          {sesiones.map((s) => {
            const pac = mapaPacientes[s.pacienteId];
            const prof = mapaProfesionales[s.profesionalUid];
            const f = formatoFechaHoraCorta(s.fecha);
            const pagada = s.estadoPago === ESTADOS_PAGO_SESION.PAGADO;
            const cantidad = getCantidadSesiones(s);

            return (
              <tr
                key={s.id}
                className={`cp-sesiones-tabla__row ${pagada ? 'cp-sesiones-tabla__row--pagada' : ''}`}
                onClick={() => onEditar(s)}
              >
                <td>
                  <div className="cp-fecha-cell">
                    <div className="cp-fecha-cell__dia">{f.dia}</div>
                    <div className="cp-fecha-cell__hora">{f.hora}</div>
                  </div>
                </td>
                <td style={{ fontSize: 13.5 }}>
                  {prof ? nombreProfesional(prof) : <span style={{ color: 'var(--cp-text-faint)' }}>—</span>}
                </td>
                <td>
                  {pac ? (
                    <div className="cp-prof-cell">
                      <Avatar initials={inicialesPaciente(pac)} size={28} />
                      <div>
                        <div className="cp-prof-name" style={{ fontSize: 13.5 }}>
                          {nombrePaciente(pac)}
                          <GroupBadge cantidad={cantidad} />
                        </div>
                      </div>
                    </div>
                  ) : <span style={{ color: 'var(--cp-text-faint)' }}>Paciente eliminado</span>}
                </td>
                <td style={{ fontSize: 13 }}>
                  {s.metodoPagoNombre}
                  {s.metodoPagoTipo === TIPOS_METODO_PAGO.DIFERIDO && (
                    <span className="cp-badge cp-badge--diferido" style={{ marginLeft: 6 }}>diferido</span>
                  )}
                </td>
                <td className="cp-num">
                  {formatoARS.format(s.valorTotal)}
                  {cantidad > 1 && s.valorSesion ? (
                    <div style={{ fontSize: 11, color: 'var(--cp-text-muted)', marginTop: 2 }}>
                      {formatoARS.format(s.valorSesion)} c/u
                    </div>
                  ) : null}
                </td>
                <td className="cp-num" style={{ color: 'var(--cp-accent)' }}>
                  {formatoARS.format(s.montoConsultorio)}
                </td>
                <td className="cp-num" style={{ color: 'var(--cp-success)' }}>
                  {formatoARS.format(s.montoProfesional)}
                </td>
                <td>
                  <span className={`cp-badge ${pagada ? 'cp-badge--pagada' : 'cp-badge--debido'}`}>
                    <span className="cp-badge__dot" />
                    {pagada ? 'Pagada' : 'Debida'}
                  </span>
                </td>
                <td onClick={(e) => e.stopPropagation()}>
                  <div className="cp-sesiones-tabla__actions">
                    <button
                      className={`cp-icon-btn ${pagada ? '' : 'cp-icon-btn--success'}`}
                      onClick={() => onTogglePagado(s)}
                      title={pagada ? 'Marcar como debida' : 'Marcar como pagada'}
                      aria-label={pagada ? 'Marcar como debida' : 'Marcar como pagada'}
                    >
                      {pagada ? <RevertIcon /> : <CheckIcon />}
                    </button>
                    <button
                      className="cp-icon-btn"
                      onClick={() => onEditar(s)}
                      title="Editar"
                      aria-label="Editar"
                    >
                      <EditIcon />
                    </button>
                    <button
                      className="cp-icon-btn cp-icon-btn--danger"
                      onClick={() => onEliminar(s)}
                      title="Eliminar"
                      aria-label="Eliminar"
                    >
                      <TrashIcon />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ============================================================
   Modal de alta/edicion de sesion
   ----------------------------------------------------------------
   Reutilizable entre admin y profesional.
   - Admin ve dropdown de profesional al inicio
   - Profesional NO ve ese dropdown
   - Profesional NO puede editar el método de pago (lo configura el admin
     en la ficha del paciente). Se muestra como solo lectura con candado.
   - Campo nuevo "Cantidad de sesiones" debajo de la hora (default 1).
     Si cantidad > 1 el doc representa N encuentros agrupados.
   - El campo de valor pasa de "valor total" a "valor por sesión",
     con el total mostrado debajo (valor × cantidad).
   - Validacion fecha mínima vs consultorio.createdAt.
   - modoSolicitud=true: ajusta copy de titulo/subtitulo/boton.
   ============================================================ */
export function SesionModal({
  sesion,
  profesionales,
  pacientes,
  metodos,
  esAdmin,
  consultorio,
  consultorioId,
  profesionalUidFijo,
  modoSolicitud = false,
  onClose,
  onGuardar,
}) {
  const esNueva = !sesion;

  const [profesionalUid, setProfesionalUid] = useState(
    sesion?.profesionalUid ?? profesionalUidFijo ?? profesionales[0]?.uid ?? ''
  );
  const [pacienteId, setPacienteId] = useState(sesion?.pacienteId ?? '');
  const [fechaInput, setFechaInput] = useState(() => {
    if (sesion?.fecha) {
      const d = sesion.fecha.toDate ? sesion.fecha.toDate() : new Date(sesion.fecha);
      return dateAInputValue(d);
    }
    return dateAInputValue(new Date());
  });
  const [metodoId, setMetodoId] = useState(sesion?.metodoPagoId ?? '');

  // Cantidad de sesiones — default 1, mínimo 1
  const [cantidad, setCantidad] = useState(() => {
    if (sesion?.cantidadSesiones) return String(sesion.cantidadSesiones);
    return '1';
  });

  // Valor por sesión (unitario). Si la sesion existente tiene valorSesion,
  // lo usamos; si no, derivamos de valorTotal/cantidadSesiones.
  const [valorSesion, setValorSesion] = useState(() => {
    if (sesion?.valorSesion !== undefined && sesion?.valorSesion !== null) {
      return String(sesion.valorSesion);
    }
    if (sesion?.valorTotal !== undefined && sesion?.valorTotal !== null) {
      const c = sesion.cantidadSesiones || 1;
      return String(c > 0 ? Math.round(sesion.valorTotal / c) : sesion.valorTotal);
    }
    return '';
  });

  const [notas, setNotas] = useState(sesion?.notas ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Auto-cargar metodo del paciente al elegirlo (solo en alta nueva)
  useEffect(() => {
    if (!pacienteId || !esNueva) return;
    const pac = pacientes.find((p) => p.id === pacienteId);
    if (!pac) return;
    if (!metodoId) {
      setMetodoId(pac.metodoPagoId || '');
    }
  }, [pacienteId, esNueva]);   // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-cargar valor default del metodo (solo en alta nueva, solo si vacio)
  useEffect(() => {
    if (!metodoId || !esNueva) return;
    const m = metodos.find((x) => x.id === metodoId);
    if (m && !valorSesion) {
      setValorSesion(String(m.valorSesionDefault ?? ''));
    }
  }, [metodoId, esNueva]);   // eslint-disable-line react-hooks/exhaustive-deps

  const metodoSeleccionado = metodos.find((m) => m.id === metodoId);
  const porcentaje = Number(metodoSeleccionado?.porcentajeConsultorio ?? 0);
  const cantidadNum = Math.max(1, Math.floor(Number(cantidad) || 1));
  const valorSesionNum = Number(valorSesion) || 0;
  const valorTotal = valorSesionNum * cantidadNum;
  const split = calcularSplit(valorTotal, porcentaje);

  // El profesional NO puede editar el método de pago. Lo configura el
  // admin en la ficha del paciente. Lo mostramos como solo lectura.
  const metodoBloqueado = !esAdmin;

  /* ---- Copy dinamico segun modo ---- */
  const titulo = esNueva
    ? (modoSolicitud ? 'Solicitar nueva sesión' : 'Registrar sesión')
    : (modoSolicitud ? 'Solicitar modificación' : 'Editar sesión');

  const subtitulo = esNueva
    ? (modoSolicitud
      ? 'Cargá los datos de la sesión que querés crear. La solicitud quedará pendiente de aprobación del administrador.'
      : 'Cargá los datos de la sesión. El cálculo del split se hace automáticamente según el método.')
    : (modoSolicitud
      ? 'Modificá los datos de esta sesión. Los cambios quedarán pendientes de aprobación del administrador.'
      : 'Modificá los datos de esta sesión.');

  const labelBoton = submitting
    ? 'Enviando…'
    : esNueva
      ? (modoSolicitud ? 'Enviar solicitud' : 'Registrar sesión')
      : (modoSolicitud ? 'Enviar solicitud de cambio' : 'Guardar cambios');

  async function onSubmit(e) {
    e.preventDefault();
    setError('');

    const fecha = fechaInput ? new Date(fechaInput) : null;

    if (!profesionalUid) { setError('Tenés que elegir un profesional'); return; }
    if (!pacienteId) { setError('Tenés que elegir un paciente'); return; }
    if (!metodoSeleccionado) { setError('Tenés que elegir un método de pago'); return; }
    if (!fecha || isNaN(fecha.getTime())) { setError('Fecha y hora inválidas'); return; }

    // Validación de fecha mínima contra creación del consultorio
    try {
      validarFechaContraConsultorio(fecha, consultorio);
    } catch (err) {
      setError(err.message);
      return;
    }

    if (cantidadNum < 1) { setError('La cantidad de sesiones debe ser al menos 1'); return; }
    if (valorSesionNum < 0) { setError('El valor por sesión no puede ser negativo'); return; }

    setSubmitting(true);
    try {
      await onGuardar({
        consultorioId,
        profesionalUid,
        pacienteId,
        fecha,
        metodo: metodoSeleccionado,
        valorSesion: valorSesionNum,
        cantidadSesiones: cantidadNum,
        notas,
      });
    } catch (err) {
      setError(err.message || 'No se pudo guardar la sesión');
      setSubmitting(false);
    }
  }

  return (
    <div className="cp-modal-overlay" onClick={onClose}>
      <div className="cp-modal cp-modal--wide" onClick={(e) => e.stopPropagation()}>
        <button className="cp-modal__close" onClick={onClose} aria-label="Cerrar">×</button>

        <h2 className="cp-modal__title">{titulo}</h2>
        <p className="cp-modal__sub">{subtitulo}</p>

        <form className="cp-modal__form" onSubmit={onSubmit}>
          {esAdmin && (
            <div>
              <label className="cp-field__label" style={{ display: 'block', marginBottom: 6 }}>
                Profesional
              </label>
              <select
                className="cp-select"
                value={profesionalUid}
                onChange={(e) => setProfesionalUid(e.target.value)}
                required
              >
                <option value="" disabled>Elegir profesional…</option>
                {profesionales.map((p) => (
                  <option key={p.uid} value={p.uid}>{nombreProfesional(p)}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="cp-field__label" style={{ display: 'block', marginBottom: 6 }}>
              Paciente
            </label>
            <PacienteAutocomplete
              pacientes={pacientes}
              value={pacienteId}
              onChange={setPacienteId}
              profesionalUid={profesionalUid}
              placeholder="Ingrese DNI o nombre"
              required
            />
          </div>

          <div className="cp-sesion-modal__row-2">
            <Input
              name="fecha"
              type="datetime-local"
              label="Fecha y hora"
              value={fechaInput}
              onChange={(e) => setFechaInput(e.target.value)}
              required
            />

            <Input
              name="cantidad"
              type="number"
              label="Cantidad de sesiones"
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              min="1"
              step="1"
              required
              hint={cantidadNum > 1
                ? `Este registro representa ${cantidadNum} encuentros agrupados.`
                : 'Si cargás un grupo (ej: 8 sesiones del mes), aumentá este valor.'}
            />
          </div>

          <div>
            <label className="cp-field__label" style={{ display: 'block', marginBottom: 6 }}>
              Método de pago
              {metodoBloqueado && (
                <span style={{
                  marginLeft: 8,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 11,
                  color: 'var(--cp-text-muted)',
                  fontWeight: 'normal',
                }}>
                  <LockIcon />
                  Configurado por el administrador
                </span>
              )}
            </label>
            <select
              className="cp-select"
              value={metodoId}
              onChange={(e) => setMetodoId(e.target.value)}
              required
              disabled={metodoBloqueado}
            >
              <option value="" disabled>Elegir método…</option>
              {metodos.map((m) => (
                <option key={m.id} value={m.id} disabled={m.activo === false}>
                  {m.nombre}{m.activo === false ? ' (inactivo)' : ''}
                </option>
              ))}
            </select>
            {metodoBloqueado && (
              <div style={{ fontSize: 12, color: 'var(--cp-text-muted)', marginTop: 4 }}>
                El método de pago se configura desde la ficha del paciente. Si necesitás cambiarlo, hablá con el administrador del consultorio.
              </div>
            )}
          </div>

          <Input
            name="valorSesion"
            type="number"
            label="Valor por sesión"
            value={valorSesion}
            onChange={(e) => setValorSesion(e.target.value)}
            min="0"
            step="any"
            required
            hint={metodoSeleccionado
              ? cantidadNum > 1
                ? `Total: ${formatoARS.format(valorTotal)} (${cantidadNum} × ${formatoARS.format(valorSesionNum)})`
                : `Default del método: ${formatoARS.format(metodoSeleccionado.valorSesionDefault ?? 0)} — podés cargar cualquier monto si esta sesión fue distinta.`
              : 'Elegí un método primero para ver el valor sugerido.'}
          />

          {metodoSeleccionado && valorTotal > 0 && (
            <div className="cp-split-preview">
              <div className="cp-split-preview__col cp-split-preview__col--profesional">
                <span className="cp-split-preview__label">Para el profesional</span>
                <span className="cp-split-preview__value">{formatoARS.format(split.montoProfesional)}</span>
              </div>
              <div className="cp-split-preview__col cp-split-preview__col--consultorio">
                <span className="cp-split-preview__label">Para el consultorio ({porcentaje}%)</span>
                <span className="cp-split-preview__value">{formatoARS.format(split.montoConsultorio)}</span>
              </div>
              {metodoSeleccionado.tipo === TIPOS_METODO_PAGO.DIFERIDO && (
                <div className="cp-split-preview__hint">
                  Este método es <strong>diferido</strong>: el cobro se realiza cuando la obra social libera el lote.
                </div>
              )}
            </div>
          )}

          <div>
            <label className="cp-field__label" style={{ display: 'block', marginBottom: 6 }}>
              Notas internas (opcional)
            </label>
            <textarea
              className="cp-textarea"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              rows="2"
              placeholder="Cualquier dato relevante de esta sesión"
            />
          </div>

          {error && <div className="cp-modal__error">{error}</div>}

          <div className="cp-modal__actions">
            <Button variant="secondary" type="button" onClick={onClose} disabled={submitting}>
              Cancelar
            </Button>
            <Button variant="primary" type="submit" disabled={submitting}>
              {submitting
                ? <><Spinner size={14} /> {labelBoton}</>
                : labelBoton}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
