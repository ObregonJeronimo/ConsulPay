import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import ActionMenu from '../../components/ui/ActionMenu.jsx';
import Avatar from '../../components/ui/Avatar.jsx';
import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';
import MetodoPagoSelect from '../../components/ui/MetodoPagoSelect.jsx';
import PacienteAutocomplete from '../../components/ui/PacienteAutocomplete.jsx';
import Spinner from '../../components/ui/Spinner.jsx';

import { useAuth } from '../../hooks/useAuth.js';
import { useConsultorio } from '../../hooks/useConsultorio.js';
import { useOverlayClose } from '../../hooks/useOverlayClose.js';
import {
  ESTADOS_PACIENTE,
  ESTADOS_PAGO_SESION,
  ESTADOS_USUARIO,
  formatoARS,
  TIPOS_METODO_PAGO,
} from '../../lib/constants.js';
import { suscribirPacientesConsultorio } from '../../lib/pacientes.js';
import { suscribirMiembrosConsultorio, suscribirProfesionales } from '../../lib/profesionales.js';
import {
  calcularSplit,
  crearSesion,
  actualizarSesion,
  editarMontoLiquidado,
  eliminarSesion,
  finDeMes,
  getCantidadSesiones,
  inicioDeMes,
  liquidarMontoSesion,
  marcarSesionDebida,
  marcarSesionPagada,
  marcarSesionesMesPagadas,
  nombreDelMes,
  suscribirSesionesConsultorio,
  totalesGlobales,
  validarFechaContraConsultorio,
} from '../../lib/sesiones.js';

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
  const [liquidando, setLiquidando] = useState(null);
  const [pagarMesOpen, setPagarMesOpen] = useState(false);
  const [quienRecibioSesion, setQuienRecibioSesion] = useState(null); // sesion pendiente de receptor

  // Admins del consultorio (dinamicos desde Firestore) para "¿Quién recibió?"
  const [miembros, setMiembros] = useState([]);
  const admins = useMemo(
    () => miembros.filter((m) => m.rol === 'admin' || m.esAdminDelConsultorio),
    [miembros],
  );

  // Si venimos del Dashboard con state { abrirNueva: true }, abrimos
  // el modal de nueva sesion automaticamente y limpiamos el state.
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    if (location.state?.abrirNueva) {
      setEditando('nueva');
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state?.abrirNueva]);  // sesion a la que vamos a cargarle el monto

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

  useEffect(() => {
    if (!user?.consultorioId) return;
    return suscribirMiembrosConsultorio(user.consultorioId, setMiembros);
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

  const stats = useMemo(() => totalesGlobales(sesionesFiltradas), [sesionesFiltradas]);
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
    if (sesion.estadoPago === ESTADOS_PAGO_SESION.DEBIDO) {
      // Pedir quién recibió antes de marcar como pagada
      setQuienRecibioSesion(sesion);
    } else {
      // Revertir a "debe": no necesita saber quién recibió
      try {
        await marcarSesionDebida(sesion.id, user.uid);
      } catch (err) {
        alert(err.message || 'No se pudo cambiar el estado.');
      }
    }
  }

  async function handleConfirmarReceptor(receptor) {
    if (!quienRecibioSesion) return;
    try {
      await marcarSesionPagada(quienRecibioSesion.id, user.uid, receptor);
    } catch (err) {
      alert(err.message || 'No se pudo marcar como pagada.');
    } finally {
      setQuienRecibioSesion(null);
    }
  }

  // Abre el modal de liquidacion para cargar el monto de una sesion
  // de obra social que estaba en pendiente_monto. El admin siempre
  // puede liquidar directo.
  function handleAbrirLiquidar(sesion) {
    setLiquidando(sesion);
  }

  async function handleConfirmarLiquidar(valor) {
    if (!liquidando) return;
    try {
      if (liquidando.estadoPago === ESTADOS_PAGO_SESION.PENDIENTE_MONTO) {
        await liquidarMontoSesion(liquidando.id, valor, user.uid);
      } else {
        // Ya estaba liquidada (debido) — corregimos el monto
        await editarMontoLiquidado(liquidando.id, valor, user.uid);
      }
      setLiquidando(null);
    } catch (err) {
      throw err;
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
            <MetodoPagoSelect
              className="cp-sesiones-filtros__select"
              metodos={metodos}
              value={filtroMetodo}
              onChange={(e) => setFiltroMetodo(e.target.value)}
            >
              <option value="todos">Todos los métodos</option>
            </MetodoPagoSelect>
            <select
              className="cp-sesiones-filtros__select"
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value)}
            >
              <option value="todos">Todos los estados</option>
              <option value={ESTADOS_PAGO_SESION.PENDIENTE_MONTO}>A liquidar</option>
              <option value={ESTADOS_PAGO_SESION.DEBIDO}>Deben</option>
              <option value={ESTADOS_PAGO_SESION.PAGADO}>Pagadas</option>
            </select>
            <Button
              variant="secondary"
              type="button"
              onClick={() => setPagarMesOpen(true)}
            >
              Pagar mes
            </Button>
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
              onLiquidar={handleAbrirLiquidar}
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

      {liquidando && (
        <LiquidarMontoModal
          sesion={liquidando}
          paciente={mapaPacientes[liquidando.pacienteId]}
          esCorreccion={liquidando.estadoPago === ESTADOS_PAGO_SESION.DEBIDO}
          onClose={() => setLiquidando(null)}
          onConfirmar={handleConfirmarLiquidar}
        />
      )}

      {quienRecibioSesion && (
        <QuienRecibioModal
          admins={admins}
          sesion={quienRecibioSesion}
          paciente={mapaPacientes[quienRecibioSesion.pacienteId]}
          onClose={() => setQuienRecibioSesion(null)}
          onConfirmar={handleConfirmarReceptor}
        />
      )}

      {pagarMesOpen && (
        <PagarMesModal
          consultorioId={user.consultorioId}
          profesionales={profesionalesActivos}
          pacientes={pacientesActivos}
          mapaPacientes={mapaPacientes}
          admins={admins}
          uid={user.uid}
          onClose={() => setPagarMesOpen(false)}
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
function TablaSesiones({ sesiones, mapaPacientes, mapaProfesionales, onEditar, onEliminar, onTogglePagado, onLiquidar }) {
  return (
    <div className="cp-compact-list cp-table-wrap">
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
            const pendienteMonto = s.estadoPago === ESTADOS_PAGO_SESION.PENDIENTE_MONTO;
            const cantidad = getCantidadSesiones(s);

            return (
              <tr
                key={s.id}
                className={`cp-sesiones-tabla__row ${pagada ? 'cp-sesiones-tabla__row--pagada' : ''} ${pendienteMonto ? 'cp-sesiones-tabla__row--pendiente-monto' : ''}`}
                onClick={() => onEditar(s)}
              >
                <td data-label="Fecha">
                  <div className="cp-fecha-cell">
                    <div className="cp-fecha-cell__dia">{f.dia}</div>
                    <div className="cp-fecha-cell__hora">{f.hora}</div>
                  </div>
                </td>
                <td data-label="Profesional" style={{ fontSize: 13.5 }}>
                  {prof ? nombreProfesional(prof) : <span style={{ color: 'var(--cp-text-faint)' }}>—</span>}
                </td>
                <td data-label="Paciente">
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
                      {cantidad > 1 && s.valorSesion ? (
                        <div style={{ fontSize: 11, color: 'var(--cp-text-muted)', marginTop: 2 }}>
                          {formatoARS.format(s.valorSesion)} c/u
                        </div>
                      ) : null}
                    </>
                  )}
                </td>
                <td data-label="Consultorio" className="cp-num" style={{ color: 'var(--cp-accent)' }}>
                  {pendienteMonto ? <span style={{ color: 'var(--cp-text-faint)' }}>—</span> : formatoARS.format(s.montoConsultorio)}
                </td>
                <td data-label="Profesional" className="cp-num" style={{ color: 'var(--cp-success)' }}>
                  {pendienteMonto ? <span style={{ color: 'var(--cp-text-faint)' }}>—</span> : formatoARS.format(s.montoProfesional)}
                </td>
                <td data-label="Estado">
                  {pendienteMonto ? (
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
                    {pendienteMonto ? (
                      <button
                        className="cp-icon-btn cp-icon-btn--success"
                        onClick={() => onLiquidar(s)}
                        title="Liquidar monto de obra social"
                        aria-label="Liquidar monto"
                      >
                        <CheckIcon />
                      </button>
                    ) : s.metodoPagoTipo === TIPOS_METODO_PAGO.DIFERIDO && !pagada ? (
                      <button
                        className="cp-icon-btn"
                        onClick={() => onLiquidar(s)}
                        title="Corregir monto liquidado"
                        aria-label="Corregir monto"
                      >
                        <EditIcon />
                      </button>
                    ) : (
                      <button
                        className={`cp-icon-btn ${pagada ? '' : 'cp-icon-btn--success'}`}
                        onClick={() => onTogglePagado(s)}
                        title={pagada ? 'Marcar como debe' : 'Marcar como pagada'}
                        aria-label={pagada ? 'Marcar como debe' : 'Marcar como pagada'}
                      >
                        {pagada ? <RevertIcon /> : <CheckIcon />}
                      </button>
                    )}
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

                {/* ── Mobile-only tds: fila compacta tipo lista ─────────
                    En mobile (<=640px) ocultamos todos los tds de arriba
                    y mostramos estos 3 que forman la fila compacta. */}
                <td className="cp-td-mobile-main" onClick={() => onEditar(s)}>
                  <div className="cp-row-mobile__top">
                    {pac ? (
                      <div className="cp-prof-cell">
                        <Avatar initials={inicialesPaciente(pac)} size={26} />
                        <div className="cp-prof-name">
                          {nombrePaciente(pac)}
                          {cantidad > 1 && <GroupBadge cantidad={cantidad} />}
                        </div>
                      </div>
                    ) : <span style={{ color: 'var(--cp-text-faint)' }}>Paciente eliminado</span>}
                  </div>
                  <div className="cp-row-mobile__mid">
                    {f.dia} {f.hora}
                    {' · '}
                    {prof ? nombreProfesional(prof) : '—'}
                  </div>
                  <div className="cp-row-mobile__bot">
                    {s.metodoPagoNombre}
                    {!pendienteMonto && ` · ${formatoARS.format(s.valorTotal)}`}
                    {!pendienteMonto && s.montoProfesional !== s.valorTotal && ` (prof: ${formatoARS.format(s.montoProfesional)})`}
                  </div>
                </td>
                <td className="cp-td-mobile-badge">
                  {pendienteMonto ? (
                    <span className="cp-badge cp-badge--pendiente-monto" style={{ fontSize: 11 }}>
                      <span className="cp-badge__dot" />
                      A liquidar
                    </span>
                  ) : (
                    <span className={`cp-badge ${pagada ? 'cp-badge--pagada' : 'cp-badge--debido'}`} style={{ fontSize: 11 }}>
                      <span className="cp-badge__dot" />
                      {pagada ? 'Pagada' : 'Debe'}
                    </span>
                  )}
                </td>
                <td className="cp-td-mobile-actions" onClick={(e) => e.stopPropagation()}>
                  <ActionMenu
                    items={[
                      ...(pendienteMonto ? [{
                        label: 'Liquidar monto',
                        icon: <CheckIcon />,
                        onClick: () => onLiquidar(s),
                      }] : s.metodoPagoTipo === TIPOS_METODO_PAGO.DIFERIDO && !pagada ? [{
                        label: 'Corregir monto',
                        icon: <EditIcon />,
                        onClick: () => onLiquidar(s),
                      }] : [{
                        label: pagada ? 'Marcar debe' : 'Marcar pagada',
                        icon: pagada ? <RevertIcon /> : <CheckIcon />,
                        onClick: () => onTogglePagado(s),
                      }]),
                      { label: 'Editar', icon: <EditIcon />, onClick: () => onEditar(s) },
                      { label: 'Eliminar', icon: <TrashIcon />, onClick: () => onEliminar(s), danger: true },
                    ]}
                  />
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
    sesion?.profesionalUid ?? profesionalUidFijo ?? (esNueva ? '' : profesionales[0]?.uid ?? '')
  );
  const [pacienteId, setPacienteId] = useState(sesion?.pacienteId ?? '');

  // Pacientes filtrados por el profesional seleccionado (solo en alta nueva).
  // Un paciente "pertenece" a un profesional si su profesionalesUids incluye
  // ese uid (campo array en Firestore). Si no hay profesional elegido, no
  // mostramos pacientes. Si es edicion, mostramos todos (no bloqueamos).
  const pacientesFiltrados = useMemo(() => {
    if (!esNueva) return pacientes;
    if (!profesionalUid) return [];
    return pacientes.filter((p) => {
      const uids = p.profesionalesUids || (p.profesionalUid ? [p.profesionalUid] : []);
      return uids.includes(profesionalUid);
    });
  }, [pacientes, profesionalUid, esNueva]);

  // Al cambiar el profesional en alta nueva, limpiar el paciente seleccionado
  // (porque el paciente anterior puede no pertenecer al nuevo profesional).
  const handleCambiarProfesional = (uid) => {
    setProfesionalUid(uid);
    if (esNueva) {
      setPacienteId('');
      setMetodoId('');
      setValorSesion('');
    }
  };
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
    // Si el metodo es diferido (obra social), el valor se carga despues
    // via "Liquidar monto" — limpiamos el campo para que la sesion se
    // cree como pendiente_monto.
    if (m?.tipo === TIPOS_METODO_PAGO.DIFERIDO) {
      setValorSesion('');
      return;
    }
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

  // Cuando el metodo es diferido (obra social), no se carga valor en el
  // momento — la obra social informa el monto despues. Esto cambia varias
  // cosas en el modal: ocultamos el input de valor, no mostramos preview
  // de split, y la sesion se guardara en estado pendiente_monto.
  const esDiferido = metodoSeleccionado?.tipo === TIPOS_METODO_PAGO.DIFERIDO;

  // Solo permitimos editar valor en una sesion existente que no sea diferida
  // pendiente_monto. Si la sesion ya tiene monto liquidado (estadoPago=debido)
  // se puede editar normalmente como antes.
  const esLiquidacionPendiente = !esNueva && sesion?.estadoPago === ESTADOS_PAGO_SESION.PENDIENTE_MONTO;

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
    if (!esDiferido && valorSesionNum < 0) { setError('El valor por sesión no puede ser negativo'); return; }
    if (!esDiferido && valorSesionNum === 0) { setError('Tenés que ingresar un valor para la sesión'); return; }

    setSubmitting(true);
    try {
      await onGuardar({
        consultorioId,
        profesionalUid,
        pacienteId,
        fecha,
        metodo: metodoSeleccionado,
        // Si es diferido, mandamos undefined para que armarPayload genere
        // la sesion en estado pendiente_monto (sin valor).
        valorSesion: esDiferido ? undefined : valorSesionNum,
        cantidadSesiones: cantidadNum,
        notas,
      });
    } catch (err) {
      setError(err.message || 'No se pudo guardar la sesión');
      setSubmitting(false);
    }
  }

  const overlayProps = useOverlayClose(onClose);

  return (
    <div className="cp-modal-overlay" {...overlayProps}>
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
                onChange={(e) => handleCambiarProfesional(e.target.value)}
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
              {esAdmin && esNueva && !profesionalUid && (
                <span style={{ color: 'var(--cp-text-faint)', fontWeight: 400, marginLeft: 8, fontSize: 12 }}>
                  — elegí un profesional primero
                </span>
              )}
              {esAdmin && esNueva && profesionalUid && pacientesFiltrados.length === 0 && (
                <span style={{ color: 'var(--cp-warning, #b8860b)', fontWeight: 400, marginLeft: 8, fontSize: 12 }}>
                  — este profesional no tiene pacientes asignados
                </span>
              )}
            </label>
            <PacienteAutocomplete
              pacientes={pacientesFiltrados}
              value={pacienteId}
              onChange={setPacienteId}
              profesionalUid={profesionalUid}
              placeholder={esAdmin && esNueva && !profesionalUid ? 'Elegí un profesional primero' : 'Ingrese DNI o nombre'}
              required
              disabled={esAdmin && esNueva && !profesionalUid}
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
            <MetodoPagoSelect
              className="cp-select"
              metodos={metodos}
              value={metodoId}
              onChange={(e) => setMetodoId(e.target.value)}
              required
              disabled={metodoBloqueado}
            >
              <option value="" disabled>Elegir método…</option>
            </MetodoPagoSelect>
            {metodoBloqueado && (
              <div style={{ fontSize: 12, color: 'var(--cp-text-muted)', marginTop: 4 }}>
                El método de pago se configura desde la ficha del paciente. Si necesitás cambiarlo, hablá con el administrador del consultorio.
              </div>
            )}
          </div>

          {esDiferido ? (
            <div className="cp-aviso-diferido">
              <div className="cp-aviso-diferido__icon" aria-hidden>⏳</div>
              <div className="cp-aviso-diferido__body">
                <div className="cp-aviso-diferido__title">Sesión de obra social</div>
                <div className="cp-aviso-diferido__text">
                  El valor de esta sesión se carga después, cuando la obra social informe el monto.
                  Mientras tanto, la sesión queda como <strong>pendiente de liquidar</strong> y no
                  suma al cobro pendiente. Cuando llegue el monto, hacé click en el ✓ de la sesión
                  para liquidarla.
                </div>
              </div>
            </div>
          ) : (
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
          )}

          {metodoSeleccionado && valorTotal > 0 && !esDiferido && (
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

/* ============================================================
   Modal de liquidacion de monto (obra social)
   ----------------------------------------------------------------
   Aparece cuando el user (admin o profesional con edicion directa)
   hace click en el ✓ de una sesion en estado pendiente_monto.
   El profesional sin edicion directa tiene su propia version (ver
   LiquidarMontoSolicitudModal en MisSesiones).

   Pide el valor TOTAL liquidado por la obra social, muestra preview
   del split usando el % del metodo (snapshot guardado en la sesion),
   y al confirmar llama al onConfirmar que internamente actualiza la
   sesion via liquidarMontoSesion().
   ============================================================ */
export function LiquidarMontoModal({ sesion, paciente, modoSolicitud, esCorreccion, onClose, onConfirmar }) {
  // Si es correccion, pre-llenamos con el monto actual
  const [valor, setValor] = useState(esCorreccion && sesion?.valorTotal ? String(sesion.valorTotal) : '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const valorNum = Number(valor) || 0;
  const porcentaje = Number(sesion?.porcentajeConsultorio) || 0;
  const split = calcularSplit(valorNum, porcentaje);
  const cantidad = getCantidadSesiones(sesion);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    if (!valorNum || valorNum <= 0) {
      setError('Ingresá un valor mayor a cero');
      return;
    }
    setSubmitting(true);
    try {
      await onConfirmar(valorNum);
    } catch (err) {
      setError(err.message || 'No se pudo liquidar el monto');
      setSubmitting(false);
    }
  }

  const nombrePac = paciente
    ? `${paciente.nombre || ''} ${paciente.apellido || ''}`.trim() || 'Paciente'
    : 'Paciente eliminado';

  const titulo = esCorreccion
    ? 'Corregir monto liquidado'
    : modoSolicitud ? 'Solicitar liquidación de monto' : 'Liquidar monto';

  const labelBoton = submitting
    ? (modoSolicitud ? 'Enviando…' : esCorreccion ? 'Guardando…' : 'Liquidando…')
    : (modoSolicitud ? 'Enviar solicitud' : esCorreccion ? 'Guardar corrección' : 'Liquidar');

  const overlayProps = useOverlayClose(onClose);

  return (
    <div className="cp-modal-overlay" {...overlayProps}>
      <div className="cp-modal" onClick={(e) => e.stopPropagation()}>
        <button className="cp-modal__close" onClick={onClose} aria-label="Cerrar">×</button>

        <h2 className="cp-modal__title">{titulo}</h2>
        <p className="cp-modal__sub">
          {esCorreccion
            ? `Corregí el monto liquidado por ${sesion.metodoPagoNombre}. Solo disponible mientras la sesión no esté pagada.`
            : modoSolicitud
              ? `Cargá el monto que liquidó la obra social. La solicitud quedará pendiente hasta que el administrador la apruebe.`
              : `Cargá el monto que liquidó la obra social ${sesion.metodoPagoNombre} por la sesión de ${nombrePac}${cantidad > 1 ? ` (${cantidad} sesiones)` : ''}.`}
        </p>

        <form className="cp-modal__form" onSubmit={onSubmit}>
          <Input
            name="valorLiquidado"
            type="number"
            label="Valor total liquidado"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            min="0"
            step="any"
            autoFocus
            required
            hint={cantidad > 1
              ? `Se va a dividir entre ${cantidad} sesiones automáticamente`
              : 'Lo que efectivamente pagó la obra social por esta sesión'}
          />

          {valorNum > 0 && (
            <div className="cp-split-preview">
              <div className="cp-split-preview__col cp-split-preview__col--profesional">
                <span className="cp-split-preview__label">Para el profesional</span>
                <span className="cp-split-preview__value">{formatoARS.format(split.montoProfesional)}</span>
              </div>
              <div className="cp-split-preview__col cp-split-preview__col--consultorio">
                <span className="cp-split-preview__label">Para el consultorio ({porcentaje}%)</span>
                <span className="cp-split-preview__value">{formatoARS.format(split.montoConsultorio)}</span>
              </div>
            </div>
          )}

          {error && <div className="cp-modal__error">{error}</div>}

          <div className="cp-modal__actions">
            <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" disabled={submitting || !valorNum}>
              {submitting ? <><Spinner size={14} /> {labelBoton}</> : labelBoton}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ============================================================
   Modal "¿Quién recibió el dinero?"
   ----------------------------------------------------------------
   Aparece antes de marcar una sesión individual como pagada.
   Muestra los admins del consultorio como opciones. Al confirmar
   guarda receptorUid + receptorNombre en la sesión.
   ============================================================ */
export function QuienRecibioModal({ admins, sesion, paciente, onClose, onConfirmar }) {
  const overlayProps = useOverlayClose(onClose);
  const [receptorUid, setReceptorUid] = useState(admins[0]?.uid ?? '');
  const [submitting, setSubmitting] = useState(false);

  const nombrePac = paciente
    ? `${paciente.nombre || ''} ${paciente.apellido || ''}`.trim()
    : 'Paciente';

  async function handleConfirmar() {
    const admin = admins.find((a) => a.uid === receptorUid);
    if (!admin) return;
    setSubmitting(true);
    try {
      await onConfirmar({
        uid: admin.uid,
        nombre: admin.displayName || admin.email || admin.uid,
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="cp-modal-overlay" {...overlayProps}>
      <div className="cp-modal" onClick={(e) => e.stopPropagation()}>
        <button className="cp-modal__close" onClick={onClose} aria-label="Cerrar">×</button>
        <h2 className="cp-modal__title">¿Quién recibió el dinero?</h2>
        <p className="cp-modal__sub">
          Sesión de <strong>{nombrePac}</strong> · {formatoARS.format(sesion?.montoConsultorio || 0)} para el consultorio
        </p>
        <div className="cp-modal__form">
          <div className="cp-quien-recibio__opciones">
            {admins.length === 0 ? (
              <p style={{ color: 'var(--cp-text-muted)', fontSize: 13.5 }}>
                No hay admins registrados en el consultorio.
              </p>
            ) : admins.map((a) => (
              <label
                key={a.uid}
                className={`cp-quien-recibio__opcion ${receptorUid === a.uid ? 'cp-quien-recibio__opcion--active' : ''}`}
              >
                <input
                  type="radio"
                  name="receptor"
                  value={a.uid}
                  checked={receptorUid === a.uid}
                  onChange={() => setReceptorUid(a.uid)}
                />
                <Avatar initials={(a.displayName || a.email || '?')[0].toUpperCase()} size={32} />
                <span className="cp-quien-recibio__nombre">
                  {a.displayName || a.email}
                </span>
              </label>
            ))}
          </div>
          <div className="cp-modal__actions">
            <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={handleConfirmar}
              disabled={submitting || !receptorUid || admins.length === 0}
            >
              {submitting ? <><Spinner size={14} /> Guardando…</> : 'Confirmar'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Modal "Pagar mes"
   ----------------------------------------------------------------
   Permite al admin seleccionar un profesional y un mes, ver el
   resumen de sesiones por paciente y marcar todas como pagadas
   de una vez (excepto las de obra social sin valor).
   ============================================================ */
export function PagarMesModal({ consultorioId, profesionales, pacientes, mapaPacientes, admins, uid, onClose }) {
  const overlayProps = useOverlayClose(onClose);
  const [profUid, setProfUid] = useState('');
  const [mes, setMes] = useState(() => inicioDeMes(new Date()));
  const [sesiones, setSesiones] = useState([]);
  const [loadingSes, setLoadingSes] = useState(false);
  const [receptorUid, setReceptorUid] = useState(admins[0]?.uid ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  // Cargar sesiones del profesional+mes elegido
  useEffect(() => {
    if (!profUid || !consultorioId) { setSesiones([]); return; }
    setLoadingSes(true);
    const desde = inicioDeMes(mes);
    const hasta = finDeMes(mes);
    const unsub = suscribirSesionesConsultorio(
      consultorioId,
      (data) => {
        setSesiones(data.filter((s) => s.profesionalUid === profUid));
        setLoadingSes(false);
      },
      { desde, hasta },
    );
    return unsub;
  }, [consultorioId, profUid, mes]);

  // Agrupar por paciente
  const porPaciente = useMemo(() => {
    const map = {};
    for (const s of sesiones) {
      if (!map[s.pacienteId]) map[s.pacienteId] = { sesiones: [] };
      map[s.pacienteId].sesiones.push(s);
    }
    return Object.entries(map).map(([pacienteId, { sesiones: ss }]) => {
      const pac = mapaPacientes[pacienteId];
      const debidas = ss.filter((s) => s.estadoPago === ESTADOS_PAGO_SESION.DEBIDO);
      const aLiquidar = ss.filter((s) => s.estadoPago === ESTADOS_PAGO_SESION.PENDIENTE_MONTO);
      const pagadas = ss.filter((s) => s.estadoPago === ESTADOS_PAGO_SESION.PAGADO);
      const totalDebe = debidas.reduce((acc, s) => acc + (s.montoConsultorio || 0), 0);
      return { pacienteId, pac, debidas, aLiquidar, pagadas, totalDebe };
    }).filter((r) => r.debidas.length > 0 || r.aLiquidar.length > 0);
  }, [sesiones, mapaPacientes]);

  const sesionesPagables = useMemo(
    () => porPaciente.flatMap((r) => r.debidas),
    [porPaciente],
  );
  const totalAPagar = useMemo(
    () => sesionesPagables.reduce((acc, s) => acc + (s.montoConsultorio || 0), 0),
    [sesionesPagables],
  );
  const totalALiquidar = useMemo(
    () => porPaciente.reduce((acc, r) => acc + r.aLiquidar.length, 0),
    [porPaciente],
  );

  async function handlePagar() {
    const admin = admins.find((a) => a.uid === receptorUid);
    if (!admin || sesionesPagables.length === 0) return;
    setSubmitting(true);
    try {
      await marcarSesionesMesPagadas(
        sesionesPagables.map((s) => s.id),
        uid,
        { uid: admin.uid, nombre: admin.displayName || admin.email || admin.uid },
      );
      setDone(true);
    } catch (err) {
      alert(err.message || 'No se pudieron marcar las sesiones como pagadas.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="cp-modal-overlay" {...overlayProps}>
      <div className="cp-modal cp-modal--wide" onClick={(e) => e.stopPropagation()}>
        <button className="cp-modal__close" onClick={onClose} aria-label="Cerrar">×</button>
        <h2 className="cp-modal__title">Pagar mes</h2>
        <p className="cp-modal__sub">
          Seleccioná un profesional y un mes para ver las sesiones pendientes de pago.
        </p>

        {done ? (
          <div className="cp-modal__form">
            <div className="cp-pagar-mes__done">
              <div style={{ fontSize: 48 }}>✓</div>
              <div style={{ fontWeight: 500, fontSize: 16 }}>
                {sesionesPagables.length} sesión{sesionesPagables.length === 1 ? '' : 'es'} marcada{sesionesPagables.length === 1 ? '' : 's'} como pagadas
              </div>
              <div style={{ color: 'var(--cp-text-muted)', fontSize: 13.5 }}>
                Total: {formatoARS.format(totalAPagar)}
              </div>
            </div>
            <div className="cp-modal__actions">
              <Button variant="primary" onClick={onClose}>Cerrar</Button>
            </div>
          </div>
        ) : (
          <div className="cp-modal__form">
            {/* Filtros */}
            <div className="cp-pagar-mes__filtros">
              <div style={{ flex: 1 }}>
                <label className="cp-field__label" style={{ display: 'block', marginBottom: 6 }}>Profesional</label>
                <select
                  className="cp-select"
                  value={profUid}
                  onChange={(e) => setProfUid(e.target.value)}
                >
                  <option value="">Elegir profesional…</option>
                  {profesionales.map((p) => (
                    <option key={p.uid} value={p.uid}>{p.displayName || p.email}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="cp-field__label" style={{ display: 'block', marginBottom: 6 }}>Mes</label>
                <SelectorMesPagarMes mes={mes} setMes={setMes} />
              </div>
            </div>

            {/* Lista por paciente */}
            {!profUid ? (
              <p style={{ color: 'var(--cp-text-faint)', fontSize: 13.5, textAlign: 'center', padding: '24px 0' }}>
                Elegí un profesional para ver sus sesiones
              </p>
            ) : loadingSes ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
                <Spinner size={20} />
              </div>
            ) : porPaciente.length === 0 ? (
              <p style={{ color: 'var(--cp-text-muted)', fontSize: 13.5, textAlign: 'center', padding: '24px 0' }}>
                No hay sesiones pendientes en {nombreDelMes(mes)}
              </p>
            ) : (
              <>
                <div className="cp-pagar-mes__tabla">
                  <div className="cp-pagar-mes__tabla-head">
                    <span>Paciente</span>
                    <span style={{ textAlign: 'center' }}>Sesiones</span>
                    <span style={{ textAlign: 'right' }}>Total al consultorio</span>
                  </div>
                  {porPaciente.map((r) => (
                    <div key={r.pacienteId} className="cp-pagar-mes__row">
                      <div className="cp-prof-cell">
                        <Avatar
                          initials={r.pac ? `${r.pac.nombre?.[0] || ''}${r.pac.apellido?.[0] || ''}`.toUpperCase() : '?'}
                          size={28}
                        />
                        <div>
                          <div className="cp-prof-name" style={{ fontSize: 13.5 }}>
                            {r.pac ? `${r.pac.nombre || ''} ${r.pac.apellido || ''}`.trim() : 'Paciente eliminado'}
                          </div>
                          {r.pagadas.length > 0 && (
                            <div style={{ fontSize: 11.5, color: 'var(--cp-text-faint)' }}>
                              {r.pagadas.length} ya pagada{r.pagadas.length === 1 ? '' : 's'}
                            </div>
                          )}
                        </div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        {r.debidas.length > 0 && (
                          <span style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--cp-text)' }}>
                            {r.debidas.length} deben
                          </span>
                        )}
                        {r.aLiquidar.length > 0 && (
                          <div style={{ fontSize: 11.5, color: 'var(--cp-warning, #b8860b)', marginTop: 2 }}>
                            {r.aLiquidar.length} sin valor (OS)
                          </div>
                        )}
                      </div>
                      <div style={{ textAlign: 'right', fontWeight: 500, fontSize: 14 }}>
                        {r.debidas.length > 0
                          ? formatoARS.format(r.totalDebe)
                          : <span style={{ color: 'var(--cp-text-faint)' }}>—</span>}
                      </div>
                    </div>
                  ))}

                  {/* Total */}
                  <div className="cp-pagar-mes__total">
                    <span>Total a pagar</span>
                    <span />
                    <span style={{ textAlign: 'right', fontSize: 18, fontWeight: 600, color: 'var(--cp-success)' }}>
                      {formatoARS.format(totalAPagar)}
                    </span>
                  </div>
                </div>

                {totalALiquidar > 0 && (
                  <div className="cp-aviso-diferido">
                    <div className="cp-aviso-diferido__icon">⚠</div>
                    <div className="cp-aviso-diferido__body">
                      <div className="cp-aviso-diferido__title">
                        {totalALiquidar} sesión{totalALiquidar === 1 ? '' : 'es'} de obra social sin liquidar
                      </div>
                      <div className="cp-aviso-diferido__text">
                        Estas sesiones no tienen valor aún (probablemente la obra social todavía no informó el monto). No se pueden marcar como pagadas hasta que tengan valor. Quedarán pendientes.
                      </div>
                    </div>
                  </div>
                )}

                {/* ¿Quién recibió? */}
                <div>
                  <label className="cp-field__label" style={{ display: 'block', marginBottom: 8 }}>
                    ¿Quién recibió el dinero?
                  </label>
                  <div className="cp-quien-recibio__opciones">
                    {admins.map((a) => (
                      <label
                        key={a.uid}
                        className={`cp-quien-recibio__opcion ${receptorUid === a.uid ? 'cp-quien-recibio__opcion--active' : ''}`}
                      >
                        <input
                          type="radio"
                          name="receptor-mes"
                          value={a.uid}
                          checked={receptorUid === a.uid}
                          onChange={() => setReceptorUid(a.uid)}
                        />
                        <Avatar initials={(a.displayName || a.email || '?')[0].toUpperCase()} size={28} />
                        <span>{a.displayName || a.email}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </>
            )}

            <div className="cp-modal__actions">
              <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
              {sesionesPagables.length > 0 && (
                <Button
                  type="button"
                  variant="primary"
                  onClick={handlePagar}
                  disabled={submitting || !receptorUid}
                >
                  {submitting
                    ? <><Spinner size={14} /> Procesando…</>
                    : `Marcar ${sesionesPagables.length} sesión${sesionesPagables.length === 1 ? '' : 'es'} como pagadas`}
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SelectorMesPagarMes({ mes, setMes }) {
  function anterior() {
    setMes((m) => { const d = new Date(m); d.setMonth(d.getMonth() - 1); return inicioDeMes(d); });
  }
  function siguiente() {
    setMes((m) => { const d = new Date(m); d.setMonth(d.getMonth() + 1); return inicioDeMes(d); });
  }
  const esEsteMes = inicioDeMes(new Date()).getTime() === mes.getTime();
  return (
    <div className="cp-mes-selector" style={{ marginTop: 0 }}>
      <button type="button" className="cp-mes-selector__btn" onClick={anterior}>‹</button>
      <span className="cp-mes-selector__label">{nombreDelMes(mes)}</span>
      <button type="button" className="cp-mes-selector__btn" onClick={siguiente} disabled={esEsteMes}>›</button>
    </div>
  );
}
