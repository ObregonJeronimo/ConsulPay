import { useEffect, useMemo, useState } from 'react';

import ActionMenu from '../../components/ui/ActionMenu.jsx';
import DualScrollTable from '../../components/ui/DualScrollTable.jsx';
import Avatar from '../../components/ui/Avatar.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';
import Spinner from '../../components/ui/Spinner.jsx';

import { useAuth } from '../../hooks/useAuth.js';
import { ESTADOS_INVITACION, ESTADOS_USUARIO, formatoFechaLarga } from '../../lib/constants.js';
import { cancelarInvitacion, enviarInvitacion, suscribirInvitaciones } from '../../lib/invitaciones.js';
import {
  calcularDeudaProfesional,
  cambiarEstadoProfesional,
  retirarProfesional,
  setPermitirEdicionSesiones,
  setPermitirCargaPacientes,
  setPermitirMarcarPagadas,
  suscribirProfesionales,
} from '../../lib/profesionales.js';
import { useConsultorio } from '../../hooks/useConsultorio.js';
import { useOverlayClose } from '../../hooks/useOverlayClose.js';

import './Profesionales.css';

/* ============================================================
   Íconos
   ============================================================ */
const PlusIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 4v16m8-8H4" />
  </svg>
);

const CopyIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
  </svg>
);

const TrashIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-2 14a2 2 0 01-2 2H9a2 2 0 01-2-2L5 6m5 0V4a2 2 0 012-2h0a2 2 0 012 2v2" />
  </svg>
);

const InfoIcon = () => (
  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="16" x2="12" y2="12" />
    <line x1="12" y1="8" x2="12.01" y2="8" />
  </svg>
);

/* ============================================================
   Helper: iniciales
   ============================================================ */
function iniciales(nombre) {
  if (!nombre) return '·';
  const partes = nombre.trim().split(/\s+/);
  const first = partes[0]?.[0] ?? '';
  const last = partes.length > 1 ? partes[partes.length - 1][0] : '';
  return (first + last).toUpperCase();
}

/* ============================================================
   Página principal
   ============================================================ */
export default function Profesionales() {
  const { user } = useAuth();
  const { consultorio } = useConsultorio();
  const [profesionales, setProfesionales] = useState([]);
  const [invitaciones, setInvitaciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openInvitar, setOpenInvitar] = useState(false);

  useEffect(() => {
    if (!user?.consultorioId) return;

    let cargados = 0;
    const checkDone = () => {
      cargados++;
      if (cargados >= 2) setLoading(false);
    };

    const unsubProfs = suscribirProfesionales(user.consultorioId, (data) => {
      setProfesionales(data);
      checkDone();
    });
    const unsubInvs = suscribirInvitaciones(user.consultorioId, (data) => {
      setInvitaciones(data);
      checkDone();
    });

    return () => {
      unsubProfs();
      unsubInvs();
    };
  }, [user?.consultorioId]);

  const invitacionesPendientes = useMemo(
    () => invitaciones.filter((i) => i.estado === ESTADOS_INVITACION.PENDIENTE),
    [invitaciones],
  );

  const activos = useMemo(
    () => profesionales.filter((p) => p.estado === ESTADOS_USUARIO.ACTIVO),
    [profesionales],
  );
  const suspendidos = useMemo(
    () => profesionales.filter((p) => p.estado === ESTADOS_USUARIO.SUSPENDIDO),
    [profesionales],
  );
  const retirados = useMemo(
    () => profesionales.filter((p) => p.estado === ESTADOS_USUARIO.RETIRADO),
    [profesionales],
  );

  // State para el modal de confirmacion de retiro.
  // Guarda el profesional que el admin clickeo "Retirar" y todavia no confirmo.
  const [retirando, setRetirando] = useState(null);

  // Total accionable: solo cuenta los que el admin gestiona "en vivo".
  // Los retirados NO entran al total accionable, pero pueden existir y
  // tener su seccion separada al final.
  const totalAccionables = activos.length + suspendidos.length + invitacionesPendientes.length;

  return (
    <div className="cp-profs">

      {/* Header */}
      <header className="cp-page-header">
        <div>
          <h1 className="cp-page-title">Profesionales</h1>
          <p className="cp-page-sub">
            {loading
              ? 'Cargando…'
              : totalAccionables === 0
                ? 'Todavía no invitaste a ningún profesional.'
                : `${activos.length} activo${activos.length === 1 ? '' : 's'} · ${invitacionesPendientes.length} pendiente${invitacionesPendientes.length === 1 ? '' : 's'}`
            }
          </p>
        </div>

        {totalAccionables > 0 && (
          <Button variant="primary" icon={<PlusIcon />} onClick={() => setOpenInvitar(true)}>
            Invitar profesional
          </Button>
        )}
      </header>

      {loading ? (
        <div className="cp-profs__loading">
          <Spinner size={24} label="Cargando profesionales…" />
        </div>
      ) : totalAccionables === 0 ? (
        <EmptyState onInvitar={() => setOpenInvitar(true)} />
      ) : (
        <>
          {invitacionesPendientes.length > 0 && (
            <section className="cp-section">
              <div className="cp-section-head">
                <h2 className="cp-section-title">Invitaciones pendientes</h2>
              </div>
              <InvitacionesLista
                invitaciones={invitacionesPendientes}
                onCancelar={async (i) => {
                  const ok = confirm(
                    `¿Cancelar la invitación para ${i.email}?\n\nSi querés invitar a este profesional más adelante, vas a tener que enviar una nueva invitación.`,
                  );
                  if (!ok) return;
                  try {
                    await cancelarInvitacion(i.id);
                  } catch (err) {
                    console.error('Error cancelando invitación:', err);
                    alert('No se pudo cancelar la invitación. Intentá de nuevo.');
                  }
                }}
              />
            </section>
          )}

          {activos.length > 0 && (
            <section className="cp-section">
              <div className="cp-section-head">
                <h2 className="cp-section-title">Activos</h2>
                <p className="cp-section-hint">
                  Si activás <strong>edición directa</strong>, el profesional puede registrar y modificar sesiones sin tu aprobación.
                  Si está apagada, cada cambio te llega como solicitud.
                </p>
              </div>
              <ProfesionalesTabla
                profesionales={activos}
                onSuspender={(uid) => cambiarEstadoProfesional(uid, ESTADOS_USUARIO.SUSPENDIDO)}
                onRetirar={(p) => setRetirando(p)}
              />
            </section>
          )}

          {suspendidos.length > 0 && (
            <section className="cp-section">
              <div className="cp-section-head">
                <h2 className="cp-section-title">Suspendidos</h2>
              </div>
              <ProfesionalesTabla
                profesionales={suspendidos}
                onReactivar={(uid) => cambiarEstadoProfesional(uid, ESTADOS_USUARIO.ACTIVO)}
                onRetirar={(p) => setRetirando(p)}
              />
            </section>
          )}

          {retirados.length > 0 && (
            <section className="cp-section">
              <div className="cp-section-head">
                <h2 className="cp-section-title">Retirados</h2>
                <p className="cp-section-hint">
                  Profesionales que dejaron el consultorio. Sus sesiones, pagos y registros
                  históricos se mantienen para auditoría. No pueden iniciar sesión ni crear
                  nuevas sesiones.
                </p>
              </div>
              <ProfesionalesTablaRetirados profesionales={retirados} />
            </section>
          )}
        </>
      )}

      {/* Modal de invitar */}
      {openInvitar && (
        <InvitarModal
          onClose={() => setOpenInvitar(false)}
          consultorioId={user.consultorioId}
          consultorioNombre={consultorio?.nombre || ''}
        />
      )}

      {/* Modal de confirmacion de retiro */}
      {retirando && (
        <RetirarProfesionalModal
          profesional={retirando}
          consultorioId={user.consultorioId}
          onCancelar={() => setRetirando(null)}
          onCompletado={() => setRetirando(null)}
        />
      )}
    </div>
  );
}

/* ============================================================
   Empty state
   ============================================================ */
function EmptyState({ onInvitar }) {
  return (
    <div className="cp-empty-profs">
      <div className="cp-empty-profs__mark" aria-hidden="true">
        <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="24" cy="24" r="8" />
          <path d="M32 48c0-6-4-12-12-12S8 42 8 48" />
          <circle cx="44" cy="20" r="6" />
          <path d="M56 40c0-5-3-8-8-8s-6 2-7 4" />
        </svg>
      </div>
      <h2 className="cp-empty-profs__title">Tu consultorio está vacío</h2>
      <p className="cp-empty-profs__desc">
        Invitá al primer profesional por email. Va a recibir un link para aceptar
        la invitación y sumarse a tu consultorio.
      </p>
      <Button variant="primary" icon={<PlusIcon />} onClick={onInvitar}>
        Invitar primer profesional
      </Button>
    </div>
  );
}

/* ============================================================
   Lista de invitaciones pendientes
   ============================================================ */
function InvitacionesLista({ invitaciones, onCancelar }) {
  const [copiedId, setCopiedId] = useState(null);

  function copiar(aceptarUrl, id) {
    navigator.clipboard.writeText(aceptarUrl).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }).catch(() => {
      console.error('No se pudo copiar al portapapeles');
    });
  }

  return (
    <div className="cp-invitaciones">
      {invitaciones.map((i) => {
        const aceptarUrl = `${window.location.origin}/aceptar-invitacion?id=${encodeURIComponent(i.id)}`;
        return (
          <div key={i.id} className="cp-invitacion">
            <Avatar initials={iniciales(i.nombre)} size={36} />
            <div className="cp-invitacion__body">
              <div className="cp-invitacion__nombre">{i.nombre}</div>
              <div className="cp-invitacion__meta">
                {i.email}
                {i.createdAt?.toDate && ` · enviada ${formatoFechaLarga.format(i.createdAt.toDate())}`}
              </div>
            </div>
            <div className="cp-invitacion__actions">
              <Badge tone="warning">Pendiente</Badge>
              <button
                type="button"
                className="cp-invitacion__copy"
                onClick={() => copiar(aceptarUrl, i.id)}
                title="Copiar link de invitación"
              >
                {copiedId === i.id ? (
                  <span style={{ fontSize: 12 }}>¡Copiado!</span>
                ) : (
                  <>
                    <CopyIcon />
                    <span>Copiar link</span>
                  </>
                )}
              </button>
              <button
                type="button"
                className="cp-invitacion__cancel"
                onClick={() => onCancelar(i)}
                title="Cancelar invitación"
                aria-label="Cancelar invitación"
              >
                <TrashIcon />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ============================================================
   Tabla de profesionales activos/suspendidos
   ============================================================ */
function ProfesionalesTabla({ profesionales, onSuspender, onReactivar, onRetirar }) {
  return (
    <DualScrollTable className="cp-compact-list">
      <table className="cp-table">
        <thead>
          <tr>
            <th>Profesional</th>
            <th>Email</th>
            <th>Estado</th>
            {onSuspender && <th>Edición directa</th>}
            {onSuspender && <th>Carga pacientes</th>}
            {onSuspender && <th>Marcar pagadas</th>}
            <th aria-label="Acciones" />
          </tr>
        </thead>
        <tbody>
          {profesionales.map((p) => {
            const estadoBadge = p.estado === ESTADOS_USUARIO.ACTIVO ? (
              <Badge tone="success">Activo</Badge>
            ) : p.estado === ESTADOS_USUARIO.SUSPENDIDO ? (
              <Badge tone="danger">Suspendido</Badge>
            ) : (
              <Badge tone="warning">Pendiente</Badge>
            );

            const acciones = [
              ...(onSuspender ? [{
                label: p.permitirEdicionSesiones
                  ? 'Desactivar edición directa'
                  : 'Activar edición directa',
                onClick: async () => {
                  try { await setPermitirEdicionSesiones(p.uid, !p.permitirEdicionSesiones); }
                  catch { alert('No se pudo cambiar la configuración.'); }
                },
              }, {
                label: p.permitirCargaPacientes
                  ? 'Desactivar carga de pacientes'
                  : 'Activar carga de pacientes',
                onClick: async () => {
                  try { await setPermitirCargaPacientes(p.uid, !p.permitirCargaPacientes); }
                  catch { alert('No se pudo cambiar la configuración.'); }
                },
              }, {
                label: p.permitirMarcarPagadas
                  ? 'Desactivar marcar pagadas'
                  : 'Activar marcar pagadas',
                onClick: async () => {
                  try { await setPermitirMarcarPagadas(p.uid, !p.permitirMarcarPagadas); }
                  catch { alert('No se pudo cambiar la configuración.'); }
                },
              }] : []),
              ...(onSuspender ? [{ label: 'Suspender', onClick: () => onSuspender(p.uid) }] : []),
              ...(onReactivar ? [{ label: 'Reactivar', onClick: () => onReactivar(p.uid) }] : []),
              ...(onRetirar ? [{ label: 'Retirar', onClick: () => onRetirar(p), danger: true }] : []),
            ];

            return (
              <tr key={p.uid}>
                <td data-label="Profesional">
                  <div className="cp-prof-cell">
                    <Avatar initials={iniciales(p.displayName || p.email)} size={32} />
                    <div>
                      <div className="cp-prof-name">{p.displayName || '—'}</div>
                      <div className="cp-prof-meta">
                        Se unió {p.createdAt?.toDate && formatoFechaLarga.format(p.createdAt.toDate())}
                      </div>
                    </div>
                  </div>
                </td>
                <td data-label="Email" style={{ fontSize: 13.5, color: 'var(--cp-text-muted)' }}>{p.email}</td>
                <td data-label="Estado">{estadoBadge}</td>
                {onSuspender && <td data-label="Edición directa"><ToggleEdicionDirecta profesional={p} /></td>}
                {onSuspender && <td data-label="Carga pacientes"><ToggleCargaPacientes profesional={p} /></td>}
                {onSuspender && <td data-label="Marcar pagadas"><ToggleMarcarPagadas profesional={p} /></td>}
                <td className="cp-prof-tabla__actions" style={{ textAlign: 'right' }}>
                  {onSuspender && <button className="cp-prof-action" onClick={() => onSuspender(p.uid)}>Suspender</button>}
                  {onReactivar && <button className="cp-prof-action" onClick={() => onReactivar(p.uid)}>Reactivar</button>}
                  {onRetirar && <button className="cp-prof-action cp-prof-action--danger" onClick={() => onRetirar(p)} style={{ marginLeft: 6 }}>Retirar</button>}
                </td>

                {/* Mobile: fila compacta */}
                <td className="cp-td-mobile-main">
                  <div className="cp-row-mobile__top">
                    <div className="cp-prof-cell">
                      <Avatar initials={iniciales(p.displayName || p.email)} size={26} />
                      <div className="cp-prof-name">{p.displayName || '—'}</div>
                    </div>
                  </div>
                  <div className="cp-row-mobile__mid">{p.email}</div>
                  <div className="cp-row-mobile__bot">
                    {p.createdAt?.toDate ? `Desde ${formatoFechaLarga.format(p.createdAt.toDate())}` : ''}
                    {onSuspender ? ` · Ed. directa: ${p.permitirEdicionSesiones ? 'Sí' : 'No'}` : ''}
                  </div>
                </td>
                <td className="cp-td-mobile-badge">{estadoBadge}</td>
                <td className="cp-td-mobile-actions" onClick={(e) => e.stopPropagation()}>
                  {acciones.length > 0 && <ActionMenu items={acciones} />}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </DualScrollTable>
  );
}

/* ============================================================
   Tabla read-only de profesionales retirados.
   No tiene acciones — los registros se preservan y los datos no se
   pueden modificar. Si en algun momento queremos "reincorporar" a
   un retirado, eso seria una accion separada (cambiar estado de
   retirado a activo manualmente).
   ============================================================ */
function ProfesionalesTablaRetirados({ profesionales }) {
  return (
    <div className="cp-table-wrap">
      <table className="cp-table">
        <thead>
          <tr>
            <th>Profesional</th>
            <th>Email</th>
            <th>Retiro</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          {profesionales.map((p) => {
            const retiradoAt = p.retiradoAt?.toDate
              ? p.retiradoAt.toDate()
              : (p.retiradoAt instanceof Date ? p.retiradoAt : null);
            return (
              <tr key={p.uid} className="cp-prof-row--retirado">
                <td data-label="Profesional">
                  <div className="cp-prof-cell">
                    <Avatar initials={iniciales(p.displayName || p.email)} size={32} />
                    <div>
                      <div className="cp-prof-name">{p.displayName || '—'}</div>
                      <div className="cp-prof-meta">
                        Se había unido {p.createdAt?.toDate && formatoFechaLarga.format(p.createdAt.toDate())}
                      </div>
                    </div>
                  </div>
                </td>
                <td data-label="Email" style={{ fontSize: 13.5, color: 'var(--cp-text-muted)' }}>{p.email}</td>
                <td data-label="Retiro" style={{ fontSize: 13.5, color: 'var(--cp-text-muted)' }}>
                  {retiradoAt ? formatoFechaLarga.format(retiradoAt) : '—'}
                </td>
                <td data-label="Estado">
                  <Badge tone="neutral">Retirado</Badge>
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
   Toggle inline para "Edicion directa de sesiones"
   ============================================================ */
function ToggleMarcarPagadas({ profesional }) {
  const [updating, setUpdating] = useState(false);
  const activo = !!profesional.permitirMarcarPagadas;

  async function onToggle() {
    if (updating) return;
    setUpdating(true);
    try {
      await setPermitirMarcarPagadas(profesional.uid, !activo);
    } catch {
      alert('No se pudo cambiar la configuración.');
    } finally {
      setUpdating(false);
    }
  }

  return (
    <div className="cp-edicion-directa">
      <button
        type="button"
        className={`cc-toggle ${activo ? 'cc-toggle--on' : ''}`}
        onClick={onToggle}
        disabled={updating}
        aria-pressed={activo}
        aria-label={activo ? 'Desactivar marcar pagadas' : 'Activar marcar pagadas'}
      >
        <span className="cc-toggle__thumb" />
      </button>
      <span className="cp-edicion-directa__label">{activo ? 'Sí' : 'No'}</span>
    </div>
  );
}

function ToggleCargaPacientes({ profesional }) {
  const [updating, setUpdating] = useState(false);
  const activo = !!profesional.permitirCargaPacientes;

  async function onToggle() {
    if (updating) return;
    setUpdating(true);
    try {
      await setPermitirCargaPacientes(profesional.uid, !activo);
    } catch {
      alert('No se pudo cambiar la configuración. Intentá de nuevo.');
    } finally {
      setUpdating(false);
    }
  }

  return (
    <div className="cp-edicion-directa" title={activo
      ? 'El profesional puede solicitar crear nuevos pacientes.'
      : 'El profesional no puede solicitar nuevos pacientes.'}>
      <button
        type="button"
        className={`cc-toggle ${activo ? 'cc-toggle--on' : ''}`}
        onClick={onToggle}
        disabled={updating}
        aria-pressed={activo}
        aria-label={activo ? 'Desactivar carga de pacientes' : 'Activar carga de pacientes'}
      >
        <span className="cc-toggle__thumb" />
      </button>
      <span className="cp-edicion-directa__label">
        {activo ? 'Sí' : 'No'}
      </span>
    </div>
  );
}

function ToggleEdicionDirecta({ profesional }) {
  const [updating, setUpdating] = useState(false);
  const activo = !!profesional.permitirEdicionSesiones;

  async function onToggle() {
    if (updating) return;
    setUpdating(true);
    try {
      await setPermitirEdicionSesiones(profesional.uid, !activo);
    } catch (err) {
      console.error('Error actualizando edicion directa:', err);
      alert('No se pudo cambiar la configuración. Intentá de nuevo.');
    } finally {
      setUpdating(false);
    }
  }

  const tooltip = activo
    ? 'El profesional puede registrar y modificar sesiones directamente. Cambios quedan en log de auditoría.'
    : 'Los cambios del profesional sobre sesiones requieren tu aprobación.';

  return (
    <div className="cp-edicion-directa" title={tooltip}>
      <button
        type="button"
        className={`cc-toggle ${activo ? 'cc-toggle--on' : ''}`}
        onClick={onToggle}
        disabled={updating}
        aria-pressed={activo}
        aria-label={activo ? 'Desactivar edición directa' : 'Activar edición directa'}
      >
        <span className="cc-toggle__thumb" />
      </button>
      <span className="cp-edicion-directa__label">
        {activo ? 'Sí' : 'Con aprobación'}
        <InfoIcon />
      </span>
    </div>
  );
}

/* ============================================================
   Modal: Invitar profesional
   ============================================================ */
function InvitarModal({ onClose, consultorioId, consultorioNombre }) {
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState('');

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await enviarInvitacion({
        email: email.trim(),
        nombre: nombre.trim(),
        consultorioId,
        consultorioNombre,
        porcentajeOverride: null,
      });
      setResultado(res);
    } catch (err) {
      setError(err.message || 'No se pudo enviar la invitación.');
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setNombre(''); setEmail('');
    setResultado(null); setError('');
  }

  const overlayProps = useOverlayClose(onClose);

  return (
    <div className="cp-modal-overlay" {...overlayProps}>
      <div className="cp-modal" onClick={(e) => e.stopPropagation()}>
        <button className="cp-modal__close" onClick={onClose} aria-label="Cerrar">×</button>

        {!resultado ? (
          <>
            <h2 className="cp-modal__title">Invitar profesional</h2>
            <p className="cp-modal__sub">
              Le vamos a enviar un email con un link único para que se sume al consultorio.
              Los porcentajes y valores de sesión dependen del método de pago de cada paciente,
              configurables desde la sección <strong>Configuración</strong>.
            </p>

            <form onSubmit={onSubmit} className="cp-modal__form">
              <Input
                name="nombre"
                label="Nombre del profesional"
                placeholder="María Rodríguez"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                required
                autoFocus
              />
              <Input
                name="email"
                type="email"
                label="Email"
                placeholder="maria@mail.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />

              {error && <div className="cp-modal__error">{error}</div>}

              <div className="cp-modal__actions">
                <Button variant="secondary" type="button" onClick={onClose} disabled={submitting}>
                  Cancelar
                </Button>
                <Button variant="primary" type="submit" disabled={submitting}>
                  {submitting ? <><Spinner size={14} /> Enviando…</> : 'Enviar invitación'}
                </Button>
              </div>
            </form>
          </>
        ) : (
          <>
            <div className="cp-modal__success">
              <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h2 className="cp-modal__title">Invitación enviada</h2>
            <p className="cp-modal__sub">
              {resultado.emailEnviado
                ? `Le enviamos un email a ${email} con el link de acceso.`
                : (resultado.warning || 'La invitación se creó pero no se pudo enviar el email.')}
            </p>

            {!resultado.emailEnviado && resultado.aceptarUrl && (
              <div className="cp-modal__fallback">
                <div style={{ fontSize: 12, color: 'var(--cp-text-muted)', marginBottom: 6 }}>
                  Link de invitación (copiá y mandáselo manual):
                </div>
                <div className="cp-modal__link">{resultado.aceptarUrl}</div>
              </div>
            )}

            <div className="cp-modal__actions">
              <Button variant="secondary" onClick={reset}>Invitar otro</Button>
              <Button variant="primary" onClick={onClose}>Listo</Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   Modal de retiro de profesional (desde la vista admin)
   ----------------------------------------------------------------
   Antes de mostrar la confirmacion, lee la deuda actual del profesional
   y la muestra al admin como informacion (no bloquea: el admin puede
   retirar igual). Cuando se ejecuta:
     - Cambia estado del profesional a 'retirado'
     - retiradoAt = ahora
   No toca consultorioId — el doc sigue ligado al consultorio para que
   las sesiones historicas sean legibles.
   ============================================================ */
function RetirarProfesionalModal({ profesional, consultorioId, onCancelar, onCompletado }) {
  const [deuda, setDeuda] = useState(null);
  const [cargandoDeuda, setCargandoDeuda] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const d = await calcularDeudaProfesional(consultorioId, profesional.uid);
        if (!cancelado) {
          setDeuda(d);
          setCargandoDeuda(false);
        }
      } catch (err) {
        if (!cancelado) {
          console.error('Error calculando deuda:', err);
          setDeuda({ cantidad: 0, total: 0 });
          setCargandoDeuda(false);
        }
      }
    })();
    return () => { cancelado = true; };
  }, [consultorioId, profesional.uid]);

  async function handleRetirar() {
    setError('');
    setSubmitting(true);
    try {
      await retirarProfesional({
        uid: profesional.uid,
        consultorioId,
        esAutoRetiro: false, // admin retira: no validamos deuda
      });
      onCompletado();
    } catch (err) {
      setError(err.message || 'No se pudo retirar.');
      setSubmitting(false);
    }
  }

  const nombre = profesional.displayName || profesional.email || 'el profesional';
  const tieneDeuda = deuda && deuda.cantidad > 0;

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

        <h2 className="cp-modal__title">¿Retirar a {nombre} del consultorio?</h2>
        <div className="cp-modal__sub">
          El profesional ya no podrá iniciar sesión ni crear nuevas sesiones, pero sus
          registros históricos (sesiones, pagos, pacientes asignados) se preservan
          intactos.

          {cargandoDeuda ? (
            <div style={{ marginTop: 16, color: 'var(--cp-text-faint)', fontSize: 13 }}>
              Calculando deuda…
            </div>
          ) : tieneDeuda ? (
            <div className="cp-retiro-deuda-aviso">
              <strong>Atención:</strong> tiene{' '}
              <strong>{deuda.cantidad} sesión{deuda.cantidad === 1 ? '' : 'es'}</strong>{' '}
              sin pagar al consultorio por un total de{' '}
              <strong>${deuda.total.toLocaleString('es-AR')}</strong>.
              Esta deuda se mantendrá registrada y podrá saldarse después.
            </div>
          ) : (
            <div className="cp-retiro-deuda-ok">
              ✓ No tiene deuda pendiente con el consultorio.
            </div>
          )}
        </div>

        {error && <div className="cp-modal__error">{error}</div>}

        <div className="cp-modal__actions">
          <Button variant="secondary" type="button" onClick={onCancelar} disabled={submitting}>
            Cancelar
          </Button>
          <Button variant="danger" type="button" onClick={handleRetirar} disabled={submitting || cargandoDeuda}>
            {submitting ? <><Spinner size={14} /> Retirando…</> : 'Retirar profesional'}
          </Button>
        </div>
      </div>
    </div>
  );
}
