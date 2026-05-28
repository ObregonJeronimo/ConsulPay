import { useEffect, useMemo, useState } from 'react';

import ActionMenu from '../../components/ui/ActionMenu.jsx';
import DualScrollTable from '../../components/ui/DualScrollTable.jsx';
import Avatar from '../../components/ui/Avatar.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';
import Spinner from '../../components/ui/Spinner.jsx';

import { useAuth } from '../../hooks/useAuth.js';
import { useConsultorio } from '../../hooks/useConsultorio.js';
import { useOverlayClose } from '../../hooks/useOverlayClose.js';
import { ESTADOS_PACIENTE, TIPOS_METODO_PAGO, formatoARS } from '../../lib/constants.js';
import { getMetodosPaciente, suscribirPacientesProfesional } from '../../lib/pacientes.js';
import { solicitarCrearPaciente } from '../../lib/solicitudes.js';

import './../admin/Pacientes.css';

function iniciales(nombre, apellido) {
  const n = nombre?.[0] ?? '';
  const a = apellido?.[0] ?? '';
  return (a + n).toUpperCase() || '·';
}

function nombreCompleto(p) {
  return `${p.apellido ?? ''}${p.apellido && p.nombre ? ', ' : ''}${p.nombre ?? ''}`;
}

export default function MisPacientes() {
  const { user } = useAuth();
  const { consultorio } = useConsultorio();
  const [pacientes, setPacientes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  const metodos = useMemo(() => consultorio?.metodosPagoPaciente ?? [], [consultorio]);
  const mapaMetodos = useMemo(() => Object.fromEntries(metodos.map((m) => [m.id, m])), [metodos]);
  const puedeCargar = !!user?.permitirCargaPacientes;

  useEffect(() => {
    // Necesitamos AMBOS datos para que la query pase las Security Rules.
    // Si falta alguno (ej: consultorio todavía cargando), esperamos.
    if (!user?.uid || !user?.consultorioId) {
      setLoading(false);
      return;
    }

    const unsub = suscribirPacientesProfesional(
      user.uid,
      user.consultorioId,
      (data) => {
        setPacientes(data);
        setLoading(false);
      },
    );
    return unsub;
  }, [user?.uid, user?.consultorioId]);

  const activos = pacientes.filter((p) => p.estado === ESTADOS_PACIENTE.ACTIVO);

  if (loading) {
    return (
      <div className="cp-pacientes">
        <div style={{ padding: 60, display: 'flex', justifyContent: 'center' }}>
          <Spinner size={24} label="Cargando…" />
        </div>
      </div>
    );
  }

  return (
    <div className="cp-pacientes">
      <header className="cp-page-header">
        <div>
          <h1 className="cp-page-title">Mis pacientes</h1>
          <p className="cp-page-sub">
            {activos.length === 0
              ? 'Todavía no te asignaron pacientes.'
              : `${activos.length} paciente${activos.length === 1 ? '' : 's'} activo${activos.length === 1 ? '' : 's'}`
            }
          </p>
        </div>
        {puedeCargar && (
          <Button variant="primary" onClick={() => setModalOpen(true)}>
            + Nuevo paciente
          </Button>
        )}
      </header>

      {modalOpen && (
        <SolicitarPacienteModal
          metodos={metodos}
          consultorioId={user.consultorioId}
          profesionalUid={user.uid}
          profesionalNombre={user.displayName || user.email || ''}
          onClose={() => setModalOpen(false)}
        />
      )}

      {activos.length === 0 ? (
        <div className="cp-empty-pac">
          <div className="cp-empty-pac__mark" aria-hidden="true">
            <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="32" cy="22" r="10" />
              <path d="M12 56c0-10 8-18 20-18s20 8 20 18" />
            </svg>
          </div>
          <h2 className="cp-empty-pac__title">Sin pacientes asignados</h2>
          <p className="cp-empty-pac__desc">
            Cuando el administrador del consultorio te asigne pacientes, los vas a ver acá
            junto con su método de pago y valor por sesión.
          </p>
        </div>
      ) : (
        <DualScrollTable className="cp-compact-list">
          <table className="cp-table cp-pacientes-table">
            <thead>
              <tr>
                <th>Paciente</th>
                <th>Método</th>
                <th className="cp-num-col">Valor sesión</th>
                <th>Obra social Nº</th>
                <th>Contacto</th>
              </tr>
            </thead>
            <tbody>
              {activos.map((p) => {
                const metodosIds = getMetodosPaciente(p);
                const metodosDelPac = metodosIds.map((id) => mapaMetodos[id]).filter(Boolean);
                const primerMetodo = metodosDelPac[0];
                const valor = primerMetodo?.valorSesionDefault ?? 0;
                return (
                  <tr key={p.id}>
                    <td data-label="Paciente">
                      <div className="cp-prof-cell">
                        <Avatar initials={iniciales(p.nombre, p.apellido)} size={32} />
                        <div>
                          <div className="cp-prof-name">{nombreCompleto(p)}</div>
                          <div className="cp-prof-meta">{p.dni ? `DNI ${p.dni}` : ''}</div>
                        </div>
                      </div>
                    </td>
                    <td data-label="Método" style={{ fontSize: 13.5 }}>
                      {metodosDelPac.length === 0
                        ? <span style={{ color: 'var(--cp-danger)' }}>—</span>
                        : metodosDelPac.map((m, i) => (
                            <span key={m.id}>
                              {i > 0 && <span style={{ color: 'var(--cp-text-faint)', margin: '0 4px' }}>·</span>}
                              {m.nombre}
                              {m.tipo === 'diferido' && <Badge tone="info" style={{ marginLeft: 4 }}>diferido</Badge>}
                            </span>
                          ))}
                    </td>
                    <td data-label="Valor sesión" className="cp-num">
                      {primerMetodo?.tipo === TIPOS_METODO_PAGO.DIFERIDO ? (
                        <span style={{ color: 'var(--cp-text-faint)', fontStyle: 'italic', fontSize: 13 }}>Según OS</span>
                      ) : formatoARS.format(valor)}
                    </td>
                    <td data-label="Obra social Nº" style={{ fontSize: 13, color: 'var(--cp-text-muted)' }}>{p.obraSocialNumero || '—'}</td>
                    <td data-label="Contacto" style={{ fontSize: 13, color: 'var(--cp-text-muted)' }}>{p.telefono || p.email || '—'}</td>

                    {/* Mobile: fila compacta (solo lectura, sin acciones) */}
                    <td className="cp-td-mobile-main">
                      <div className="cp-row-mobile__top">
                        <div className="cp-prof-cell">
                          <Avatar initials={iniciales(p.nombre, p.apellido)} size={26} />
                          <div className="cp-prof-name">{nombreCompleto(p)}</div>
                        </div>
                      </div>
                      <div className="cp-row-mobile__mid">
                        {metodosDelPac.length === 0
                          ? 'Sin método'
                          : metodosDelPac.map((m) => m.nombre).join(' · ')}
                        {p.obraSocialNumero ? ` · Nº ${p.obraSocialNumero}` : ''}
                      </div>
                      <div className="cp-row-mobile__bot">
                        {p.telefono || p.email || ''}
                        {primerMetodo?.tipo !== TIPOS_METODO_PAGO.DIFERIDO && primerMetodo && ` · ${formatoARS.format(valor)}`}
                      </div>
                    </td>
                    <td className="cp-td-mobile-badge" />
                    <td className="cp-td-mobile-actions" />
                  </tr>
                );
              })}
            </tbody>
          </table>
        </DualScrollTable>
      )}
    </div>
  );
}

/* ============================================================
   Modal: Solicitar nuevo paciente
   ============================================================ */
function SolicitarPacienteModal({ metodos, consultorioId, profesionalUid, profesionalNombre, onClose }) {
  const overlayProps = useOverlayClose(onClose);
  const [form, setForm] = useState({
    nombre: '', apellido: '', dni: '', telefono: '', email: '',
    metodosPagoIds: [], notas: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  function setField(k, v) { setForm((prev) => ({ ...prev, [k]: v })); }

  function toggleMetodo(id) {
    setForm((prev) => ({
      ...prev,
      metodosPagoIds: prev.metodosPagoIds.includes(id)
        ? prev.metodosPagoIds.filter((x) => x !== id)
        : [...prev.metodosPagoIds, id],
    }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    if (!form.nombre.trim()) { setError('El nombre es obligatorio.'); return; }
    if (!form.apellido.trim()) { setError('El apellido es obligatorio.'); return; }
    if (!form.metodosPagoIds.length) { setError('Seleccioná al menos un método de pago.'); return; }

    setSubmitting(true);
    try {
      await solicitarCrearPaciente({
        consultorioId,
        profesionalUid,
        profesionalNombre,
        datosPaciente: {
          nombre: form.nombre.trim(),
          apellido: form.apellido.trim(),
          dni: form.dni.trim() || null,
          telefono: form.telefono.trim() || null,
          email: form.email.trim().toLowerCase() || null,
          metodosPagoIds: form.metodosPagoIds,
          notas: form.notas.trim() || null,
        },
      });
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="cp-modal-overlay" {...overlayProps}>
      <div className="cp-modal cp-modal--wide" onClick={(e) => e.stopPropagation()}>
        <button className="cp-modal__close" onClick={onClose} aria-label="Cerrar">×</button>
        <h2 className="cp-modal__title">Solicitar nuevo paciente</h2>
        <p className="cp-modal__sub">
          El administrador recibirá la solicitud y la aprobará. Cuando se apruebe, el paciente quedará asignado a vos.
        </p>

        {done ? (
          <div className="cp-modal__form" style={{ textAlign: 'center', padding: '32px 16px' }}>
            <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 8 }}>Solicitud enviada</div>
            <div style={{ color: 'var(--cp-text-muted)', fontSize: 13.5, marginBottom: 28 }}>
              El administrador revisará la solicitud y creará el paciente.
            </div>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <Button variant="primary" onClick={onClose} style={{ minWidth: 120 }}>Cerrar</Button>
            </div>
          </div>
        ) : (
          <form className="cp-modal__form" onSubmit={onSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Input label="Apellido *" value={form.apellido} onChange={(e) => setField('apellido', e.target.value)} placeholder="Apellido" required />
              <Input label="Nombre *" value={form.nombre} onChange={(e) => setField('nombre', e.target.value)} placeholder="Nombre" required />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Input label="DNI" value={form.dni} onChange={(e) => setField('dni', e.target.value)} placeholder="Opcional" />
              <Input label="Teléfono" value={form.telefono} onChange={(e) => setField('telefono', e.target.value)} placeholder="Opcional" />
            </div>
            <Input label="Email" type="email" value={form.email} onChange={(e) => setField('email', e.target.value)} placeholder="Opcional" />

            <div>
              <label className="cp-field__label" style={{ display: 'block', marginBottom: 8 }}>
                Métodos de pago *
              </label>
              <div className="cp-pac-metodos-lista">
                {metodos.map((m) => {
                  const sel = form.metodosPagoIds.includes(m.id);
                  return (
                    <label key={m.id} className={`cp-pac-metodo-item ${sel ? 'cp-pac-metodo-item--sel' : ''}`}>
                      <input type="checkbox" checked={sel} onChange={() => toggleMetodo(m.id)} />
                      <span className="cp-pac-metodo-item__nombre">{m.nombre}</span>
                      {m.tipo === 'diferido' && <span style={{ fontSize: 11, color: 'var(--cp-text-faint)' }}>OS</span>}
                    </label>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="cp-field__label" style={{ display: 'block', marginBottom: 6 }}>
                Notas internas <span style={{ color: 'var(--cp-text-faint)', fontWeight: 400 }}>(opcional)</span>
              </label>
              <textarea
                className="cp-input"
                value={form.notas}
                onChange={(e) => setField('notas', e.target.value)}
                rows={2}
                style={{ width: '100%', resize: 'vertical', boxSizing: 'border-box' }}
              />
            </div>

            {error && <p style={{ color: 'var(--cp-danger)', fontSize: 13 }}>{error}</p>}

            <div className="cp-modal__actions">
              <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>Cancelar</Button>
              <Button type="submit" variant="primary" disabled={submitting}>
                {submitting ? 'Enviando…' : 'Enviar solicitud'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
