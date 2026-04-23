import { useEffect, useMemo, useState } from 'react';

import Avatar from '../../components/ui/Avatar.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';
import Spinner from '../../components/ui/Spinner.jsx';

import { useAuth } from '../../hooks/useAuth.js';
import { useConsultorio } from '../../hooks/useConsultorio.js';
import {
  ESTADOS_PACIENTE,
  ESTADOS_USUARIO,
  formatoARS,
} from '../../lib/constants.js';
import {
  archivarPaciente,
  crearPaciente,
  actualizarPaciente,
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
  const [mostrarArchivados, setMostrarArchivados] = useState(false);

  const [editandoPaciente, setEditandoPaciente] = useState(null); // null | 'nuevo' | paciente
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

  // Mapa uid → profesional (para mostrar nombre)
  const mapaProfesionales = useMemo(() => {
    const m = {};
    for (const p of profesionales) m[p.uid] = p;
    return m;
  }, [profesionales]);

  // Mapa id → método (para mostrar nombre)
  const mapaMetodos = useMemo(() => {
    const m = {};
    for (const x of metodos) m[x.id] = x;
    return m;
  }, [metodos]);

  const pacientesFiltrados = useMemo(() => {
    let list = pacientes;

    if (!mostrarArchivados) {
      list = list.filter((p) => p.estado === ESTADOS_PACIENTE.ACTIVO);
    }

    if (filtroProfesional !== 'todos') {
      list = list.filter((p) => p.profesionalUid === filtroProfesional);
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
  }, [pacientes, busqueda, filtroProfesional, filtroMetodo, mostrarArchivados]);

  const activosTotal = pacientes.filter((p) => p.estado === ESTADOS_PACIENTE.ACTIVO).length;
  const archivadosTotal = pacientes.filter((p) => p.estado === ESTADOS_PACIENTE.ARCHIVADO).length;

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

  async function handleArchivar(paciente) {
    const ok = confirm(
      `¿Archivar a ${nombreCompleto(paciente)}?\n\nLa información queda guardada y podés reactivarlo cuando quieras.`,
    );
    if (!ok) return;
    try {
      await archivarPaciente(paciente.id);
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
            mostrarArchivados={mostrarArchivados}
            setMostrarArchivados={setMostrarArchivados}
            profesionales={profesionalesActivos}
            metodos={metodos}
            archivadosTotal={archivadosTotal}
          />

          {error && <div className="cp-config-error">{error}</div>}

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
              onArchivar={handleArchivar}
              onReactivar={handleReactivar}
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
          <a href="/admin/profesionales" className="cp-empty-pac__link">
            Ir a Profesionales →
          </a>
        )}
        {!hayMetodos && (
          <a href="/admin/configuracion" className="cp-empty-pac__link">
            Ir a Configuración →
          </a>
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
        Cargá el primer paciente. Vas a asignarle un profesional y un método de pago.
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
  mostrarArchivados, setMostrarArchivados,
  profesionales, metodos, archivadosTotal,
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

      <select
        className="cp-filtros__select"
        value={filtroMetodo}
        onChange={(e) => setFiltroMetodo(e.target.value)}
      >
        <option value="todos">Todos los métodos</option>
        {metodos.map((m) => (
          <option key={m.id} value={m.id}>{m.nombre}</option>
        ))}
      </select>

      {archivadosTotal > 0 && (
        <label className="cp-filtros__check">
          <input
            type="checkbox"
            checked={mostrarArchivados}
            onChange={(e) => setMostrarArchivados(e.target.checked)}
          />
          Mostrar archivados
        </label>
      )}
    </div>
  );
}

/* ============================================================
   Tabla de pacientes
   ============================================================ */
function PacientesTabla({
  pacientes,
  mapaProfesionales,
  mapaMetodos,
  onEditar,
  onArchivar,
  onReactivar,
}) {
  return (
    <div className="cp-table-wrap">
      <table className="cp-table cp-pacientes-table">
        <thead>
          <tr>
            <th>Paciente</th>
            <th>Profesional</th>
            <th>Método</th>
            <th className="cp-num-col">Valor sesión</th>
            <th>Obra social Nº</th>
            <th aria-label="Acciones" />
          </tr>
        </thead>
        <tbody>
          {pacientes.map((p) => {
            const prof = mapaProfesionales[p.profesionalUid];
            const metodo = mapaMetodos[p.metodoPagoId];
            // Valor siempre viene del método. Compat con pacientes viejos
            // que tenían valorSesionCustom: lo ignoramos, priorizamos el método.
            const valor = metodo?.valorSesionDefault ?? 0;
            const archivado = p.estado === ESTADOS_PACIENTE.ARCHIVADO;

            return (
              <tr key={p.id} className={archivado ? 'cp-pac-row--archivado' : ''}>
                <td>
                  <div className="cp-prof-cell">
                    <Avatar initials={iniciales(p.nombre, p.apellido)} size={32} />
                    <div>
                      <div className="cp-prof-name">
                        {nombreCompleto(p)}
                        {archivado && <Badge tone="neutral" style={{ marginLeft: 8 }}>Archivado</Badge>}
                      </div>
                      <div className="cp-prof-meta">
                        {p.dni ? `DNI ${p.dni}` : ''}
                        {p.dni && p.telefono ? ' · ' : ''}
                        {p.telefono || ''}
                      </div>
                    </div>
                  </div>
                </td>
                <td style={{ fontSize: 13.5 }}>
                  {prof ? (prof.displayName || prof.email) : <span style={{ color: 'var(--cp-text-faint)' }}>—</span>}
                </td>
                <td style={{ fontSize: 13.5 }}>
                  {metodo ? metodo.nombre : <span style={{ color: 'var(--cp-danger)' }}>Método eliminado</span>}
                </td>
                <td className="cp-num">{formatoARS.format(valor)}</td>
                <td style={{ fontSize: 13, color: 'var(--cp-text-muted)' }}>
                  {p.obraSocialNumero || '—'}
                </td>
                <td style={{ textAlign: 'right' }}>
                  <button
                    className="cp-prof-action"
                    onClick={() => onEditar(p)}
                    title="Editar"
                  >
                    <EditIcon />
                  </button>
                  {archivado ? (
                    <button
                      className="cp-prof-action"
                      onClick={() => onReactivar(p)}
                      style={{ marginLeft: 6 }}
                    >
                      Reactivar
                    </button>
                  ) : (
                    <button
                      className="cp-prof-action"
                      onClick={() => onArchivar(p)}
                      style={{ marginLeft: 6 }}
                      title="Archivar"
                    >
                      <ArchiveIcon />
                    </button>
                  )}
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
   Modal crear/editar paciente
   ============================================================ */
function PacienteModal({ paciente, profesionales, metodos, onClose, onGuardar }) {
  const esNuevo = !paciente;
  const [form, setForm] = useState(() => ({
    nombre: paciente?.nombre ?? '',
    apellido: paciente?.apellido ?? '',
    dni: paciente?.dni ?? '',
    telefono: paciente?.telefono ?? '',
    email: paciente?.email ?? '',
    obraSocialNumero: paciente?.obraSocialNumero ?? '',
    profesionalUid: paciente?.profesionalUid ?? (profesionales[0]?.uid ?? ''),
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

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await onGuardar({
        nombre: form.nombre,
        apellido: form.apellido,
        dni: form.dni,
        telefono: form.telefono,
        email: form.email,
        obraSocialNumero: form.obraSocialNumero,
        profesionalUid: form.profesionalUid,
        metodoPagoId: form.metodoPagoId,
        // valorSesionCustom ya no se setea desde acá — siempre usa el default del método
        valorSesionCustom: null,
        notas: form.notas,
      });
    } catch (err) {
      setError(err.message || 'No se pudo guardar el paciente');
      setSubmitting(false);
    }
  }

  return (
    <div className="cp-modal-overlay" onClick={onClose}>
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

          <div className="cp-config-row">
            <div>
              <label className="cp-field__label" style={{ display: 'block', marginBottom: 6 }}>
                Profesional asignado
              </label>
              <select
                className="cp-select"
                value={form.profesionalUid}
                onChange={(e) => setField('profesionalUid', e.target.value)}
                required
              >
                {profesionales.map((p) => (
                  <option key={p.uid} value={p.uid}>
                    {p.displayName || p.email}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="cp-field__label" style={{ display: 'block', marginBottom: 6 }}>
                Método de pago
              </label>
              <select
                className="cp-select"
                value={form.metodoPagoId}
                onChange={(e) => setField('metodoPagoId', e.target.value)}
                required
              >
                {metodos.map((m) => (
                  <option key={m.id} value={m.id} disabled={m.activo === false}>
                    {m.nombre}{m.activo === false ? ' (inactivo)' : ''}
                  </option>
                ))}
              </select>
            </div>
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
            <div className="cp-valor-info">
              <div className="cp-valor-info__main">
                <span className="cp-valor-info__label">Valor de sesión</span>
                <span className="cp-valor-info__amount">{formatoARS.format(valorDelMetodo)}</span>
              </div>
              <div className="cp-valor-info__hint">
                Definido por el método <strong>{metodoSeleccionado.nombre}</strong>.
                {' '}
                <a href="/admin/configuracion" className="cp-valor-info__link">
                  Editar en Configuración →
                </a>
              </div>
            </div>
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
