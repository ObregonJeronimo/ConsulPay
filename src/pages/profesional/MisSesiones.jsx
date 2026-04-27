import { useEffect, useMemo, useState } from 'react';

import Avatar from '../../components/ui/Avatar.jsx';
import Button from '../../components/ui/Button.jsx';
import Spinner from '../../components/ui/Spinner.jsx';

import { useAuth } from '../../hooks/useAuth.js';
import { useConsultorio } from '../../hooks/useConsultorio.js';
import {
  ESTADOS_PACIENTE,
  ESTADOS_PAGO_SESION,
  formatoARS,
  TIPOS_METODO_PAGO,
} from '../../lib/constants.js';
import { suscribirPacientesProfesional } from '../../lib/pacientes.js';
import {
  actualizarSesion,
  crearSesion,
  eliminarSesion,
  finDeMes,
  inicioDeMes,
  nombreDelMes,
  suscribirSesionesProfesional,
  totalesGlobales,
} from '../../lib/sesiones.js';

import { SesionModal } from '../admin/Sesiones.jsx';
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

/* ============================================================
   Selector de mes (mismo componente que admin, duplicado por
   ahora — si en el futuro tenemos 3 paginas con esto lo subimos
   a un shared component)
   ============================================================ */
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
  const [loadingSesiones, setLoadingSesiones] = useState(true);

  const [editando, setEditando] = useState(null); // null | 'nueva' | sesion

  // Suscripcion a sesiones del profesional, acotada al mes
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

  // Pacientes asignados al profesional (para el modal)
  useEffect(() => {
    if (!user?.uid || !user?.consultorioId) return;
    return suscribirPacientesProfesional(user.uid, user.consultorioId, setPacientes);
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

  // Stats del mes (desde la perspectiva del profesional)
  const stats = useMemo(() => totalesGlobales(sesiones), [sesiones]);
  const yaPagueAlConsultorio = stats.totalConsultorio - stats.debido;

  /* ---- Handlers ---- */

  async function handleGuardar(input) {
    if (editando === 'nueva') {
      await crearSesion(input, user.uid);
    } else {
      await actualizarSesion(editando.id, input, user.uid);
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
      await eliminarSesion(sesion.id);
    } catch (err) {
      alert(err.message || 'No se pudo eliminar la sesión.');
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
              : `${stats.cantidad} sesione${stats.cantidad === 1 ? '' : 's'} en ${nombreDelMes(mes)}.`}
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
                Registrar primera sesión
              </Button>
            </div>
          ) : (
            <TablaMisSesiones
              sesiones={sesiones}
              mapaPacientes={mapaPacientes}
              onEditar={(s) => setEditando(s)}
              onEliminar={handleEliminar}
            />
          )}
        </>
      )}

      {editando && (
        <SesionModal
          sesion={editando === 'nueva' ? null : editando}
          profesionales={[]} /* no se usa cuando esAdmin=false */
          pacientes={pacientesActivos}
          metodos={metodos}
          esAdmin={false}
          consultorioId={user.consultorioId}
          profesionalUidFijo={user.uid}
          onClose={() => setEditando(null)}
          onGuardar={handleGuardar}
        />
      )}
    </div>
  );
}

/* ============================================================
   Stats desde la perspectiva del profesional
   ----------------------------------------------------------------
   "Lo que cobré / Lo que debo / Lo que ya pagué" en vez de los
   numeros del consultorio.
   ============================================================ */
function StatsProfesional({ stats, yaPagado }) {
  return (
    <div className="cp-sesiones-stats">
      <div className="cp-stat">
        <div className="cp-stat__label">Sesiones</div>
        <div className="cp-stat__value">{stats.cantidad}</div>
        <div className="cp-stat__hint">en el mes seleccionado</div>
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
   Tabla de sesiones del profesional (mas compacta que la del admin)
   ============================================================ */
function TablaMisSesiones({ sesiones, mapaPacientes, onEditar, onEliminar }) {
  return (
    <div className="cp-table-wrap">
      <table className="cp-table cp-sesiones-tabla">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Paciente</th>
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
                <td>
                  {pac ? (
                    <div className="cp-prof-cell">
                      <Avatar initials={inicialesPaciente(pac)} size={28} />
                      <div>
                        <div className="cp-prof-name" style={{ fontSize: 13.5 }}>{nombrePaciente(pac)}</div>
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
                <td className="cp-num">{formatoARS.format(s.valorTotal)}</td>
                <td className="cp-num" style={{ color: 'var(--cp-success)' }}>
                  {formatoARS.format(s.montoProfesional)}
                </td>
                <td className="cp-num" style={{ color: 'var(--cp-accent)' }}>
                  {formatoARS.format(s.montoConsultorio)}
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
                      className="cp-icon-btn"
                      onClick={() => onEditar(s)}
                      title="Editar"
                      aria-label="Editar"
                      disabled={pagada}
                    >
                      <EditIcon />
                    </button>
                    <button
                      className="cp-icon-btn cp-icon-btn--danger"
                      onClick={() => onEliminar(s)}
                      title="Eliminar"
                      aria-label="Eliminar"
                      disabled={pagada}
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
