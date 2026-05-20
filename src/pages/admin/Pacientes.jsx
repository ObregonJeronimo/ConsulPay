import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import Avatar from '../../components/ui/Avatar.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';
import MetodoPagoSelect from '../../components/ui/MetodoPagoSelect.jsx';
import Spinner from '../../components/ui/Spinner.jsx';

import { useAuth } from '../../hooks/useAuth.js';
import { useConsultorio } from '../../hooks/useConsultorio.js';
import { useOverlayClose } from '../../hooks/useOverlayClose.js';
import {
  ESTADOS_PACIENTE,
  ESTADOS_USUARIO,
  TIPOS_METODO_PAGO,
  formatoARS,
} from '../../lib/constants.js';
import {
  archivarPaciente,
  crearPaciente,
  actualizarPaciente,
  getProfesionalesUids,
  reactivarPaciente,
  suscribirPacientesConsultorio,
} from '../../lib/pacientes.js';
import { suscribirProfesionales } from '../../lib/profesionales.js';

import './Pacientes.css';

/* ============================================================
   Íconos
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

const EditIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);

const ArchiveIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="21 8 21 21 3 21 3 8" />
    <rect x="1" y="3" width="22" height="5" />
    <line x1="10" y1="12" x2="14" y2="12" />
  </svg>
);

const FolderIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
  </svg>
);

const RotateIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="1 4 1 10 7 10" />
    <path d="M3.51 15a9 9 0 102.13-9.36L1 10" />
  </svg>
);

/* ============================================================
   Helpers
   ============================================================ */
function iniciales(nombre, apellido) {
  const n = nombre?.[0] ?? '';
  const a = apellido?.[0] ?? '';
  return (a + n).toUpperCase() || '·';
}

function nombreCompleto(p) {
  return `${p.apellido ?? ''}${p.apellido && p.nombre ? ', ' : ''}${p.nombre ?? ''}`;
}

function nombreVisibleProf(prof) {
  if (!prof) return null;
  return prof.displayName || prof.email || `Usuario ${prof.uid?.slice(0, 6) ?? ''}`;
}

/**
 * Renderiza el listado de profesionales asignados a un paciente.
 * Si son 1 o 2: muestra los nombres separados por coma.
 * Si son 3+: muestra el primero y "+N más" con tooltip que lista el resto.
 */
function ProfesionalesCelda({ pacienteUids, mapaProfesionales }) {
  const profs = pacienteUids
    .map((uid) => mapaProfesionales[uid])
    .filter(Boolean);

  if (profs.length === 0) {
    return <span style={{ color: 'var(--cp-text-faint)' }}>—</span>;
  }
  if (profs.length === 1) {
    return <span>{nombreVisibleProf(profs[0])}</span>;
  }
  if (profs.length === 2) {
    return (
      <span>
        {nombreVisibleProf(profs[0])}
        <span style={{ color: 'var(--cp-text-muted)' }}>{' · '}</span>
        {nombreVisibleProf(profs[1])}
      </span>
    );
  }
  // 3 o más: primero + tooltip con el resto
  const otros = profs.slice(1).map(nombreVisibleProf).join(', ');
  return (
    <span>
      {nombreVisibleProf(profs[0])}
      <span
        className="cp-pac-prof-mas"
        title={otros}
      >
        {' '}+{profs.length - 1} más
      </span>
    </span>
  );
}

/* ============================================================
   Página principal
   ============================================================ */
export default function Pacientes() {
  const { user } = useAuth();
  const { consultorio, loading: loadingConsultorio } = useConsultorio();

  const [pacientes, setPacientes] = useState([]);
  const [profesionales, setProfesionales] = useState([]);
  const [loading, setLoading] = useState(true);

  const [busqueda, setBusqueda] = useState('');
  const [filtroProfesional, setFiltroProfesional] = useState('todos');
  const [filtroMetodo, setFiltroMetodo] = useState('todos');

  const [editandoPaciente, setEditandoPaciente] = useState(null); // null | 'nuevo' | paciente
  const [archivandoPaciente, setArchivandoPaciente] = useState(null); // null | paciente
  const [verArchivados, setVerArchivados] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user?.consultorioId) return;

    let cargados = 0;
    const check = () => { cargados++; if (cargados >= 2) setLoading(false); };

    const unsubP = suscribirPacientesConsultorio(user.consultorioId, (data) => {
      setPacientes(data);
      check();
    });
    const unsubProf = suscribirProfesionales(user.consultorioId, (data) => {
      setProfesionales(data);
      check();
    });

    return () => { unsubP(); unsubProf(); };
  }, [user?.consultorioId]);

  const profesionalesActivos = useMemo(
    () => profesionales.filter((p) => p.estado === ESTADOS_USUARIO.ACTIVO),
    [profesionales],
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

  const mapaMetodos = useMemo(() => {
    const m = {};
    for (const x of metodos) m[x.id] = x;
    return m;
  }, [metodos]);

  // La tabla principal SOLO muestra activos. Los archivados viven en su
  // propio panel desplegable y nunca se mezclan con la tabla principal
  // (decision de UX para evitar el checkbox "mostrar archivados" del original).
  const pacientesActivos = useMemo(
    () => pacientes.filter((p) => p.estado === ESTADOS_PACIENTE.ACTIVO),
    [pacientes],
  );

  const pacientesArchivados = useMemo(
    () => pacientes.filter((p) => p.estado === ESTADOS_PACIENTE.ARCHIVADO),
    [pacientes],
  );

  const pacientesFiltrados = useMemo(() => {
    let list = pacientesActivos;

    // Filtro por profesional: ahora chequea si el UID del filtro esta
    // en el array profesionalesUids del paciente (paciente N:N).
    if (filtroProfesional !== 'todos') {
      list = list.filter((p) => getProfesionalesUids(p).includes(filtroProfesional));
    }

    if (filtroMetodo !== 'todos') {
      list = list.filter((p) => p.metodoPagoId === filtroMetodo);
    }

    const q = busqueda.trim().toLowerCase();
    if (q) {
      list = list.filter((p) => {
        const full = `${p.nombre ?? ''} ${p.apellido ?? ''}`.toLowerCase();
        const dni = (p.dni ?? '').toLowerCase();
        const email = (p.email ?? '').toLowerCase();
        return full.includes(q) || dni.includes(q) || email.includes(q);
      });
    }

    return list;
  }, [pacientesActivos, busqueda, filtroProfesional, filtroMetodo]);

  const activosTotal = pacientesActivos.length;
  const archivadosTotal = pacientesArchivados.length;

  async function handleGuardar(data) {
    setError('');
    try {
      if (editandoPaciente === 'nuevo') {
        await crearPaciente({
          consultorioId: user.consultorioId,
          createdByUid: user.uid,
          ...data,
        });
      } else {
        await actualizarPaciente(editandoPaciente.id, data);
      }
      setEditandoPaciente(null);
    } catch (err) {
      console.error(err);
      throw err;
    }
  }

  /* ---- Archivado: ahora pasa por modal de confirmacion ---- */
  function pedirArchivar(paciente) {
    setArchivandoPaciente(paciente);
  }

  async function confirmarArchivar() {
    if (!archivandoPaciente) return;
    try {
      await archivarPaciente(archivandoPaciente.id);
      setArchivandoPaciente(null);
    } catch (err) {
      setError(err.message || 'No se pudo archivar el paciente');
    }
  }

  async function handleReactivar(paciente) {
    try {
      await reactivarPaciente(paciente.id);
    } catch (err) {
      setError(err.message || 'No se pudo reactivar el paciente');
    }
  }

  /* ---- renders ---- */

  if (loadingConsultorio || loading) {
    return (
      <div className="cp-pacientes">
        <div style={{ padding: 60, display: 'flex', justifyContent: 'center' }}>
          <Spinner size={24} label="Cargando pacientes…" />
        </div>
      </div>
    );
  }

  const hayProfesionalesActivos = profesionalesActivos.length > 0;
  const hayMetodos = metodos.length > 0;
  const puedeCargar = hayProfesionalesActivos && hayMetodos;

  return (
    <div className="cp-pacientes">
      <header className="cp-page-header">
        <div>
          <h1 className="cp-page-title">Pacientes</h1>
          <p className="cp-page-sub">
            {loading
              ? 'Cargando…'
              : activosTotal === 0
                ? 'Todavía no cargaste pacientes.'
                : `${activosTotal} activo${activosTotal === 1 ? '' : 's'}${archivadosTotal > 0 ? ` · ${archivadosTotal} archivado${archivadosTotal === 1 ? '' : 's'}` : ''}`
            }
          </p>
        </div>

        {pacientes.length > 0 && (
          <Button
            variant="primary"
            icon={<PlusIcon />}
            onClick={() => setEditandoPaciente('nuevo')}
            disabled={!puedeCargar}
          >
            Agregar paciente
          </Button>
        )}
      </header>

      {!puedeCargar && pacientes.length === 0 && (
        <EmptyPreconfig
          hayProfesionales={hayProfesionalesActivos}
          hayMetodos={hayMetodos}
        />
      )}

      {pacientes.length === 0 && puedeCargar && (
        <EmptyState onAgregar={() => setEditandoPaciente('nuevo')} />
      )}

      {pacientes.length > 0 && (
        <>
          <FiltrosBar
            busqueda={busqueda}
            setBusqueda={setBusqueda}
            filtroProfesional={filtroProfesional}
            setFiltroProfesional={setFiltroProfesional}
            filtroMetodo={filtroMetodo}
            setFiltroMetodo={setFiltroMetodo}
            profesionales={profesionalesActivos}
            metodos={metodos}
            archivadosTotal={archivadosTotal}
            verArchivados={verArchivados}
            onToggleArchivados={() => setVerArchivados((v) => !v)}
          />

          {error && <div className="cp-config-error">{error}</div>}

          {/* Panel desplegable de archivados (visible solo si verArchivados=true) */}
          {verArchivados && archivadosTotal > 0 && (
            <PanelArchivados
              pacientes={pacientesArchivados}
              mapaProfesionales={mapaProfesionales}
              mapaMetodos={mapaMetodos}
              onReactivar={handleReactivar}
              onCerrar={() => setVerArchivados(false)}
            />
          )}

          {pacientesFiltrados.length === 0 ? (
            <div className="cp-pacientes__empty-filtered">
              No hay pacientes que coincidan con tu búsqueda o filtros.
            </div>
          ) : (
            <PacientesTabla
              pacientes={pacientesFiltrados}
              mapaProfesionales={mapaProfesionales}
              mapaMetodos={mapaMetodos}
              onEditar={(p) => setEditandoPaciente(p)}
              onArchivar={pedirArchivar}
            />
          )}
        </>
      )}

      {editandoPaciente && (
        <PacienteModal
          paciente={editandoPaciente === 'nuevo' ? null : editandoPaciente}
          profesionales={profesionalesActivos}
          metodos={metodos}
          onClose={() => setEditandoPaciente(null)}
          onGuardar={handleGuardar}
        />
      )}

      {archivandoPaciente && (
        <ConfirmarArchivadoModal
          paciente={archivandoPaciente}
          onCancelar={() => setArchivandoPaciente(null)}
          onConfirmar={confirmarArchivar}
        />
      )}
    </div>
  );
}

/* ============================================================
   Empty states
   ============================================================ */
function EmptyPreconfig({ hayProfesionales, hayMetodos }) {
  return (
    <div className="cp-empty-pac">
      <div className="cp-empty-pac__mark" aria-hidden="true">
        <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M32 12v40M12 32h40" />
        </svg>
      </div>
      <h2 className="cp-empty-pac__title">Antes de cargar pacientes</h2>
      <p className="cp-empty-pac__desc">
        Necesitás tener configurado esto:
      </p>
      <ul className="cp-empty-pac__checklist">
        <li className={hayProfesionales ? 'cp-empty-pac__item--done' : ''}>
          <span className="cp-empty-pac__check">{hayProfesionales ? '✓' : '○'}</span>
          Al menos un profesional activo
        </li>
        <li className={hayMetodos ? 'cp-empty-pac__item--done' : ''}>
          <span className="cp-empty-pac__check">{hayMetodos ? '✓' : '○'}</span>
          Al menos un método de pago configurado
        </li>
      </ul>
      <div className="cp-empty-pac__actions">
        {!hayProfesionales && (
          <Link to="/admin/profesionales" className="cp-empty-pac__link">
            Ir a Profesionales →
          </Link>
        )}
        {!hayMetodos && (
          <Link to="/admin/configuracion" className="cp-empty-pac__link">
            Ir a Configuración →
          </Link>
        )}
      </div>
    </div>
  );
}

function EmptyState({ onAgregar }) {
  return (
    <div className="cp-empty-pac">
      <div className="cp-empty-pac__mark" aria-hidden="true">
        <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="32" cy="22" r="10" />
          <path d="M12 56c0-10 8-18 20-18s20 8 20 18" />
        </svg>
      </div>
      <h2 className="cp-empty-pac__title">Todavía no hay pacientes</h2>
      <p className="cp-empty-pac__desc">
        Cargá el primer paciente. Vas a poder asignarle uno o varios profesionales y un método de pago.
        Después, al registrar sesiones, el sistema calcula el split automáticamente.
      </p>
      <Button variant="primary" icon={<PlusIcon />} onClick={onAgregar}>
        Cargar primer paciente
      </Button>
    </div>
  );
}

/* ============================================================
   Barra de filtros
   ============================================================ */
function FiltrosBar({
  busqueda, setBusqueda,
  filtroProfesional, setFiltroProfesional,
  filtroMetodo, setFiltroMetodo,
  profesionales, metodos,
  archivadosTotal, verArchivados, onToggleArchivados,
}) {
  return (
    <div className="cp-filtros">
      <div className="cp-filtros__search">
        <SearchIcon />
        <input
          type="text"
          placeholder="Buscar por nombre, apellido, DNI…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
      </div>

      <select
        className="cp-filtros__select"
        value={filtroProfesional}
        onChange={(e) => setFiltroProfesional(e.target.value)}
      >
        <option value="todos">Todos los profesionales</option>
        {profesionales.map((p) => (
          <option key={p.uid} value={p.uid}>{p.displayName || p.email}</option>
        ))}
      </select>

      <MetodoPagoSelect
        className="cp-filtros__select"
        metodos={metodos}
        value={filtroMetodo}
        onChange={(e) => setFiltroMetodo(e.target.value)}
      >
        <option value="todos">Todos los métodos</option>
      </MetodoPagoSelect>

      {archivadosTotal > 0 && (
        <button
          type="button"
          className={`cp-archivados-btn ${verArchivados ? 'cp-archivados-btn--active' : ''}`}
          onClick={onToggleArchivados}
        >
          <FolderIcon />
          {verArchivados ? 'Ocultar archivados' : 'Ver pacientes archivados'}
          <span className="cp-archivados-btn__count">{archivadosTotal}</span>
        </button>
      )}
    </div>
  );
}

/* ============================================================
   Panel de archivados (desplegable)
   ============================================================ */
function PanelArchivados({ pacientes, mapaProfesionales, mapaMetodos, onReactivar, onCerrar }) {
  return (
    <div className="cp-archivados-panel">
      <div className="cp-archivados-panel__head">
        <div>
          <h3 className="cp-archivados-panel__title">
            <FolderIcon />
            Pacientes archivados
            <span className="cp-archivados-panel__count">{pacientes.length}</span>
          </h3>
          <p className="cp-archivados-panel__hint">
            Estos pacientes no aparecen en la tabla principal ni en búsquedas activas.
            Podés reactivarlos cuando quieras.
          </p>
        </div>
        <button
          type="button"
          className="cp-archivados-panel__close"
          onClick={onCerrar}
          aria-label="Cerrar panel"
        >
          ×
        </button>
      </div>

      <ul className="cp-archivados-panel__list">
        {pacientes.map((p) => {
          const profUids = getProfesionalesUids(p);
          const metodo = mapaMetodos[p.metodoPagoId];
          const profsResumen = profUids.length === 0
            ? 'Sin profesional'
            : profUids.length === 1
              ? (nombreVisibleProf(mapaProfesionales[profUids[0]]) || 'Profesional eliminado')
              : `${profUids.length} profesionales`;
          return (
            <li key={p.id} className="cp-archivado-row">
              <div className="cp-archivado-row__main">
                <Avatar initials={iniciales(p.nombre, p.apellido)} size={32} />
                <div className="cp-archivado-row__info">
                  <div className="cp-archivado-row__name">
                    {nombreCompleto(p)}
                  </div>
                  <div className="cp-archivado-row__meta">
                    {p.dni ? `DNI ${p.dni}` : 'Sin DNI'}
                    {' · '}
                    {profsResumen}
                    {metodo && ` · ${metodo.nombre}`}
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="cp-archivado-row__btn"
                onClick={() => onReactivar(p)}
                title="Reactivar paciente"
              >
                <RotateIcon />
                Reactivar
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ============================================================
   Tabla de pacientes (solo activos)
   ============================================================ */
function PacientesTabla({
  pacientes,
  mapaProfesionales,
  mapaMetodos,
  onEditar,
  onArchivar,
}) {
  return (
    <div className="cp-table-wrap">
      <table className="cp-table cp-pacientes-table">
        <thead>
          <tr>
            <th>Paciente</th>
            <th>Profesional/es</th>
            <th>Método</th>
            <th className="cp-num-col">Valor sesión</th>
            <th>Obra social Nº</th>
            <th aria-label="Acciones" />
          </tr>
        </thead>
        <tbody>
          {pacientes.map((p) => {
            const profUids = getProfesionalesUids(p);
            const metodo = mapaMetodos[p.metodoPagoId];
            const valor = metodo?.valorSesionDefault ?? 0;

            return (
              <tr key={p.id}>
                <td data-label="Paciente">
                  <div className="cp-prof-cell">
                    <Avatar initials={iniciales(p.nombre, p.apellido)} size={32} />
                    <div>
                      <div className="cp-prof-name">
                        {nombreCompleto(p)}
                      </div>
                      <div className="cp-prof-meta">
                        {p.dni ? `DNI ${p.dni}` : ''}
                        {p.dni && p.telefono ? ' · ' : ''}
                        {p.telefono || ''}
                      </div>
                    </div>
                  </div>
                </td>
                <td data-label="Profesional/es" style={{ fontSize: 13.5 }}>
                  <ProfesionalesCelda
                    pacienteUids={profUids}
                    mapaProfesionales={mapaProfesionales}
                  />
                </td>
                <td data-label="Método" style={{ fontSize: 13.5 }}>
                  {metodo ? metodo.nombre : <span style={{ color: 'var(--cp-danger)' }}>Método eliminado</span>}
                </td>
                <td data-label="Valor sesión" className="cp-num">
                  {metodo?.tipo === TIPOS_METODO_PAGO.DIFERIDO ? (
                    <span style={{ color: 'var(--cp-text-faint)', fontStyle: 'italic', fontSize: 13 }}>
                      Según OS
                    </span>
                  ) : (
                    formatoARS.format(valor)
                  )}
                </td>
                <td data-label="Obra social Nº" style={{ fontSize: 13, color: 'var(--cp-text-muted)' }}>
                  {p.obraSocialNumero || '—'}
                </td>
                <td className="cp-pacientes-table__actions" style={{ textAlign: 'right' }}>
                  <button
                    className="cp-prof-action"
                    onClick={() => onEditar(p)}
                    title="Editar"
                  >
                    <EditIcon />
                  </button>
                  <button
                    className="cp-prof-action"
                    onClick={() => onArchivar(p)}
                    style={{ marginLeft: 6 }}
                    title="Archivar"
                  >
                    <ArchiveIcon />
                  </button>
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
   Modal de confirmacion de archivado
   ============================================================ */
function ConfirmarArchivadoModal({ paciente, onCancelar, onConfirmar }) {
  const [submitting, setSubmitting] = useState(false);

  async function handleArchivar() {
    setSubmitting(true);
    try {
      await onConfirmar();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="cp-modal-overlay" onClick={onCancelar}>
      <div className="cp-modal cp-modal--confirm-archive" onClick={(e) => e.stopPropagation()}>
        <button
          className="cp-modal__close"
          onClick={onCancelar}
          aria-label="Cerrar"
          disabled={submitting}
        >
          ×
        </button>

        <div className="cp-confirm-archive__icon">
          <ArchiveIcon />
        </div>

        <h2 className="cp-modal__title">
          ¿Archivar a {nombreCompleto(paciente)}?
        </h2>
        <p className="cp-modal__sub">
          El paciente dejará de aparecer en las búsquedas y listados activos.
          Toda su información queda guardada y vas a poder reactivarlo desde{' '}
          <strong>Ver pacientes archivados</strong> cuando quieras.
        </p>

        <div className="cp-modal__actions">
          <Button
            variant="secondary"
            type="button"
            onClick={onCancelar}
            disabled={submitting}
          >
            Cancelar
          </Button>
          <Button
            variant="primary"
            type="button"
            onClick={handleArchivar}
            disabled={submitting}
          >
            {submitting
              ? <><Spinner size={14} /> Archivando…</>
              : 'Archivar'}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Modal crear/editar paciente
   ----------------------------------------------------------------
   Cambio importante: ahora el campo "profesional" pasa a ser un
   multi-select (checkboxes en una lista). Se requiere AL MENOS UNO.
   ============================================================ */
function PacienteModal({ paciente, profesionales, metodos, onClose, onGuardar }) {
  const esNuevo = !paciente;

  // UIDs ya asignados al paciente (o el primer profesional si es nuevo)
  const uidsIniciales = useMemo(() => {
    if (paciente) {
      return getProfesionalesUids(paciente);
    }
    // Default para nuevo: primer profesional preseleccionado, asi al
    // crear rapido un paciente no hay que abrir el dropdown
    return profesionales[0]?.uid ? [profesionales[0].uid] : [];
  }, [paciente, profesionales]);

  const [form, setForm] = useState(() => ({
    nombre: paciente?.nombre ?? '',
    apellido: paciente?.apellido ?? '',
    dni: paciente?.dni ?? '',
    telefono: paciente?.telefono ?? '',
    email: paciente?.email ?? '',
    obraSocialNumero: paciente?.obraSocialNumero ?? '',
    profesionalesUids: uidsIniciales,
    metodoPagoId: paciente?.metodoPagoId ?? (metodos.find((m) => m.activo !== false)?.id ?? metodos[0]?.id ?? ''),
    notas: paciente?.notas ?? '',
  }));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const metodoSeleccionado = metodos.find((m) => m.id === form.metodoPagoId);
  const valorDelMetodo = metodoSeleccionado?.valorSesionDefault ?? 0;

  function setField(k, v) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  function toggleProfesional(uid) {
    setForm((prev) => {
      const ya = prev.profesionalesUids.includes(uid);
      return {
        ...prev,
        profesionalesUids: ya
          ? prev.profesionalesUids.filter((x) => x !== uid)
          : [...prev.profesionalesUids, uid],
      };
    });
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError('');

    if (form.profesionalesUids.length === 0) {
      setError('Tenés que asignar al menos un profesional');
      return;
    }

    setSubmitting(true);
    try {
      await onGuardar({
        nombre: form.nombre,
        apellido: form.apellido,
        dni: form.dni,
        telefono: form.telefono,
        email: form.email,
        obraSocialNumero: form.obraSocialNumero,
        profesionalesUids: form.profesionalesUids,
        metodoPagoId: form.metodoPagoId,
        valorSesionCustom: null,
        notas: form.notas,
      });
    } catch (err) {
      setError(err.message || 'No se pudo guardar el paciente');
      setSubmitting(false);
    }
  }

  const overlayProps = useOverlayClose(onClose);

  return (
    <div className="cp-modal-overlay" {...overlayProps}>
      <div className="cp-modal cp-modal--wide" onClick={(e) => e.stopPropagation()}>
        <button className="cp-modal__close" onClick={onClose} aria-label="Cerrar">×</button>

        <h2 className="cp-modal__title">
          {esNuevo ? 'Agregar paciente' : 'Editar paciente'}
        </h2>
        <p className="cp-modal__sub">
          {esNuevo
            ? 'Cargá los datos del paciente. Todo es editable después.'
            : 'Cambiá los datos que necesites.'}
        </p>

        <form className="cp-modal__form" onSubmit={onSubmit}>
          <div className="cp-config-row">
            <Input
              name="apellido"
              label="Apellido"
              value={form.apellido}
              onChange={(e) => setField('apellido', e.target.value)}
              required
              autoFocus
            />
            <Input
              name="nombre"
              label="Nombre"
              value={form.nombre}
              onChange={(e) => setField('nombre', e.target.value)}
              required
            />
          </div>

          <div className="cp-config-row">
            <Input
              name="dni"
              label="DNI (opcional)"
              value={form.dni}
              onChange={(e) => setField('dni', e.target.value)}
            />
            <Input
              name="telefono"
              label="Teléfono (opcional)"
              value={form.telefono}
              onChange={(e) => setField('telefono', e.target.value)}
            />
          </div>

          <Input
            name="email"
            type="email"
            label="Email (opcional)"
            value={form.email}
            onChange={(e) => setField('email', e.target.value)}
          />

          {/* Profesionales asignados (multi-select) */}
          <div>
            <label className="cp-field__label" style={{ display: 'block', marginBottom: 6 }}>
              Profesionales asignados
              <span className="cp-pac-multi__hint">
                {' '}· {form.profesionalesUids.length} de {profesionales.length} seleccionado{form.profesionalesUids.length === 1 ? '' : 's'}
              </span>
            </label>
            <div className="cp-pac-multi">
              {profesionales.length === 0 ? (
                <div className="cp-pac-multi__empty">
                  No hay profesionales activos en el consultorio.
                </div>
              ) : (
                profesionales.map((p) => {
                  const checked = form.profesionalesUids.includes(p.uid);
                  return (
                    <label
                      key={p.uid}
                      className={`cp-pac-multi__option ${checked ? 'cp-pac-multi__option--checked' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleProfesional(p.uid)}
                      />
                      <Avatar
                        initials={
                          ((p.displayName?.[0] ?? p.email?.[0]) ?? '·').toUpperCase()
                        }
                        size={26}
                      />
                      <div className="cp-pac-multi__info">
                        <div className="cp-pac-multi__name">
                          {p.displayName || p.email}
                        </div>
                        {p.email && p.displayName && (
                          <div className="cp-pac-multi__email">{p.email}</div>
                        )}
                      </div>
                    </label>
                  );
                })
              )}
            </div>
          </div>

          <div>
            <label className="cp-field__label" style={{ display: 'block', marginBottom: 6 }}>
              Método de pago
            </label>
            <MetodoPagoSelect
              className="cp-select"
              metodos={metodos}
              value={form.metodoPagoId}
              onChange={(e) => setField('metodoPagoId', e.target.value)}
              required
            />
          </div>

          {metodoSeleccionado?.tipo === 'diferido' && (
            <Input
              name="obraSocialNumero"
              label={`Nº de afiliado (${metodoSeleccionado.nombre})`}
              placeholder="Opcional"
              value={form.obraSocialNumero}
              onChange={(e) => setField('obraSocialNumero', e.target.value)}
            />
          )}

          {metodoSeleccionado && (
            metodoSeleccionado.tipo === TIPOS_METODO_PAGO.DIFERIDO ? (
              // Para obras sociales / prepagas: el valor de la sesion lo
              // decide la obra social al liquidar, no se carga aca. El
              // profesional/admin lo ingresa en el modal de Liquidar monto
              // dentro del tab Sesiones (boton ✓ de cada sesion pendiente).
              <div className="cp-valor-info cp-valor-info--diferido">
                <div className="cp-valor-info__main">
                  <span className="cp-valor-info__label">Valor de sesión</span>
                  <span className="cp-valor-info__amount-text">
                    Lo decide la obra social
                  </span>
                </div>
                <div className="cp-valor-info__hint">
                  Las sesiones con <strong>{metodoSeleccionado.nombre}</strong> no
                  llevan valor al crearse. Se carga después en el listado de
                  sesiones cuando la obra social informe el monto.
                </div>
              </div>
            ) : (
              <div className="cp-valor-info">
                <div className="cp-valor-info__main">
                  <span className="cp-valor-info__label">Valor de sesión</span>
                  <span className="cp-valor-info__amount">{formatoARS.format(valorDelMetodo)}</span>
                </div>
                <div className="cp-valor-info__hint">
                  Definido por el método <strong>{metodoSeleccionado.nombre}</strong>.
                  {' '}
                  <Link to="/admin/configuracion" className="cp-valor-info__link" onClick={onClose}>
                    Editar en Configuración →
                  </Link>
                </div>
              </div>
            )
          )}

          <div>
            <label className="cp-field__label" style={{ display: 'block', marginBottom: 6 }}>
              Notas internas (opcional)
            </label>
            <textarea
              className="cp-textarea"
              value={form.notas}
              onChange={(e) => setField('notas', e.target.value)}
              rows="3"
              placeholder="Cualquier dato relevante del paciente para el equipo"
            />
          </div>

          {error && <div className="cp-modal__error">{error}</div>}

          <div className="cp-modal__actions">
            <Button variant="secondary" type="button" onClick={onClose} disabled={submitting}>
              Cancelar
            </Button>
            <Button variant="primary" type="submit" disabled={submitting}>
              {submitting ? <><Spinner size={14} /> Guardando…</> : (esNuevo ? 'Crear paciente' : 'Guardar cambios')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
