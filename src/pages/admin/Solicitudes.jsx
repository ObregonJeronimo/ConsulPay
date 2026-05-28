import { useEffect, useMemo, useState } from 'react';

import Avatar from '../../components/ui/Avatar.jsx';
import DualScrollTable from '../../components/ui/DualScrollTable.jsx';
import Button from '../../components/ui/Button.jsx';
import Spinner from '../../components/ui/Spinner.jsx';

import { useAuth } from '../../hooks/useAuth.js';
import { useOverlayClose } from '../../hooks/useOverlayClose.js';
import {
  ESTADOS_SOLICITUD_SESION,
  formatoARS,
  LABELS_TIPO_SOLICITUD,
  TIPOS_LOG_SESION,
  TIPOS_METODO_PAGO,
  TIPOS_SOLICITUD_SESION,
} from '../../lib/constants.js';
import { suscribirLogsDeSolicitud } from '../../lib/logs.js';
import { suscribirPacientesConsultorio } from '../../lib/pacientes.js';
import { suscribirProfesionales } from '../../lib/profesionales.js';
import {
  aprobarSolicitud,
  rechazarSolicitud,
  suscribirTodasSolicitudes,
} from '../../lib/solicitudes.js';

import { GroupBadge } from './Sesiones.jsx';
import './Solicitudes.css';
import './Sesiones.css';

/* ============================================================
   Iconos
   ============================================================ */
const UserIcon = () => (
  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);
const ClockIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);
const PlusIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 4v16m8-8H4" />
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
const InfoIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="16" x2="12" y2="12" />
    <line x1="12" y1="8" x2="12.01" y2="8" />
  </svg>
);
const CheckIcon = () => (
  <svg viewBox="0 0 24 24" width="56" height="56" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

/* ============================================================
   Helpers
   ============================================================ */
function nombrePaciente(p) {
  if (!p) return null;
  return `${p.apellido ?? ''}${p.apellido && p.nombre ? ', ' : ''}${p.nombre ?? ''}`;
}
function inicialesPaciente(p) {
  return ((p.apellido?.[0] ?? '') + (p.nombre?.[0] ?? '')).toUpperCase() || '·';
}
function nombreProfesional(p) {
  return p?.displayName || p?.email || '—';
}
function formatoFechaCompleta(date) {
  if (!date) return '—';
  const d = date.toDate ? date.toDate() : new Date(date);
  return d.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }) + ' · ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}
function formatoRelativo(date) {
  if (!date) return '';
  const d = date.toDate ? date.toDate() : new Date(date);
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'recién';
  if (diffMin < 60) return `hace ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `hace ${diffH} h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `hace ${diffD} día${diffD === 1 ? '' : 's'}`;
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
}

/**
 * Devuelve la cantidad de sesiones agrupadas que indica un payload
 * (con backwards compat: sin cantidadSesiones se interpreta como 1).
 */
function cantidadDePayload(payload) {
  const c = Number(payload?.cantidadSesiones);
  return Number.isFinite(c) && c >= 1 ? Math.floor(c) : 1;
}

function iconoTipo(tipo) {
  switch (tipo) {
    case TIPOS_SOLICITUD_SESION.CREAR: return <PlusIcon />;
    case TIPOS_SOLICITUD_SESION.MODIFICAR: return <EditIcon />;
    case TIPOS_SOLICITUD_SESION.ELIMINAR: return <TrashIcon />;
    case TIPOS_SOLICITUD_SESION.LIQUIDAR_MONTO: return <CheckIcon />;
    case TIPOS_SOLICITUD_SESION.CARGA_RAPIDA: return <span style={{ fontSize: 13 }}>⚡</span>;
    case TIPOS_SOLICITUD_SESION.CREAR_PACIENTE: return <UserIcon />;
    default: return null;
  }
}

function badgeEstado(estado) {
  switch (estado) {
    case ESTADOS_SOLICITUD_SESION.PENDIENTE:
      return <span className="cp-badge cp-badge--debido"><ClockIcon />Pendiente</span>;
    case ESTADOS_SOLICITUD_SESION.APROBADA:
      return <span className="cp-badge cp-badge--pagada"><span className="cp-badge__dot" />Aprobada</span>;
    case ESTADOS_SOLICITUD_SESION.RECHAZADA:
      return <span className="cp-badge cp-badge--rechazada"><span className="cp-badge__dot" />Rechazada</span>;
    case ESTADOS_SOLICITUD_SESION.OBSOLETA:
      return <span className="cp-badge cp-badge--obsoleta"><span className="cp-badge__dot" />Obsoleta</span>;
    default:
      return <span className="cp-badge">{estado}</span>;
  }
}

/* ============================================================
   Pagina principal
   ============================================================ */
export default function Solicitudes() {
  const { user } = useAuth();
  const [solicitudes, setSolicitudes] = useState([]);
  const [pacientes, setPacientes] = useState([]);
  const [profesionales, setProfesionales] = useState([]);
  const [loading, setLoading] = useState(true);

  const [tab, setTab] = useState('pendientes');
  const [seleccionada, setSeleccionada] = useState(null);

  useEffect(() => {
    if (!user?.consultorioId) return;
    setLoading(true);
    const unsub = suscribirTodasSolicitudes(user.consultorioId, (data) => {
      setSolicitudes(data);
      setLoading(false);
    });
    return unsub;
  }, [user?.consultorioId]);

  useEffect(() => {
    if (!user?.consultorioId) return;
    return suscribirPacientesConsultorio(user.consultorioId, setPacientes);
  }, [user?.consultorioId]);

  useEffect(() => {
    if (!user?.consultorioId) return;
    return suscribirProfesionales(user.consultorioId, setProfesionales);
  }, [user?.consultorioId]);

  const mapaPacientes = useMemo(() => {
    const m = {};
    for (const p of pacientes) m[p.id] = p;
    return m;
  }, [pacientes]);

  const mapaProfesionales = useMemo(() => {
    const m = {};
    for (const p of profesionales) m[p.uid] = p;
    return m;
  }, [profesionales]);

  const pendientes = useMemo(
    () => solicitudes.filter((s) => s.estado === ESTADOS_SOLICITUD_SESION.PENDIENTE),
    [solicitudes],
  );
  const resueltas = useMemo(
    () => solicitudes.filter((s) => s.estado !== ESTADOS_SOLICITUD_SESION.PENDIENTE),
    [solicitudes],
  );

  const lista = tab === 'pendientes' ? pendientes : resueltas;

  useEffect(() => {
    if (!seleccionada) return;
    const fresh = solicitudes.find((s) => s.id === seleccionada.id);
    if (fresh && fresh !== seleccionada) {
      setSeleccionada(fresh);
    }
  }, [solicitudes]);   // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="cp-solicitudes">
      <header className="cp-page-header">
        <div>
          <h1 className="cp-page-title">Solicitudes</h1>
          <p className="cp-page-sub">
            Acciones que profesionales sin edición directa pidieron sobre sesiones.
            Aprobá o rechazá cada una para que se aplique (o no) sobre el consultorio.
          </p>
          <div className="cp-tabs-bar">
            <button
              className={`cp-tabs-bar__btn ${tab === 'pendientes' ? 'cp-tabs-bar__btn--active' : ''}`}
              onClick={() => setTab('pendientes')}
            >
              Pendientes
              {pendientes.length > 0 && (
                <span className="cp-tabs-bar__count">{pendientes.length}</span>
              )}
            </button>
            <button
              className={`cp-tabs-bar__btn ${tab === 'resueltas' ? 'cp-tabs-bar__btn--active' : ''}`}
              onClick={() => setTab('resueltas')}
            >
              Resueltas
              {resueltas.length > 0 && (
                <span className="cp-tabs-bar__count">{resueltas.length}</span>
              )}
            </button>
          </div>
        </div>
      </header>

      {loading ? (
        <div style={{ padding: 60, display: 'flex', justifyContent: 'center' }}>
          <Spinner size={24} label="Cargando solicitudes…" />
        </div>
      ) : lista.length === 0 ? (
        <EmptyState tab={tab} />
      ) : (
        <TablaSolicitudes
          solicitudes={lista}
          mapaPacientes={mapaPacientes}
          mapaProfesionales={mapaProfesionales}
          onSeleccionar={setSeleccionada}
        />
      )}

      {seleccionada && (
        <DetalleModal
          solicitud={seleccionada}
          mapaPacientes={mapaPacientes}
          mapaProfesionales={mapaProfesionales}
          adminUid={user.uid}
          adminNombre={user.displayName || user.email}
          consultorioId={user.consultorioId}
          onClose={() => setSeleccionada(null)}
        />
      )}
    </div>
  );
}

/* ============================================================
   Empty states
   ============================================================ */
function EmptyState({ tab }) {
  if (tab === 'pendientes') {
    return (
      <div className="cp-solicitudes-empty">
        <div className="cp-solicitudes-empty__mark">
          <CheckIcon />
        </div>
        <h2 className="cp-solicitudes-empty__title">Todo al día</h2>
        <p className="cp-solicitudes-empty__desc">
          No hay solicitudes pendientes de aprobación. Cuando un profesional sin
          edición directa cree, modifique o elimine una sesión, vas a verla acá.
        </p>
      </div>
    );
  }
  return (
    <div className="cp-solicitudes-empty">
      <div className="cp-solicitudes-empty__mark" style={{ background: 'var(--cp-bg)', color: 'var(--cp-text-faint)' }}>
        <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
          <path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z" />
        </svg>
      </div>
      <h2 className="cp-solicitudes-empty__title">Sin solicitudes resueltas</h2>
      <p className="cp-solicitudes-empty__desc">
        Cuando aprobés o rechacés solicitudes, vas a verlas acá como historial.
      </p>
    </div>
  );
}

/* ============================================================
   Tabla
   ----------------------------------------------------------------
   Muestra el badge ×N al lado del paciente cuando la solicitud
   representa un grupo de sesiones (ej: 8 sesiones del mes).
   ============================================================ */
function TablaSolicitudes({ solicitudes, mapaPacientes, mapaProfesionales, onSeleccionar }) {
  return (
    <DualScrollTable className="cp-compact-list">
      <table className="cp-table cp-solicitudes-tabla">
        <thead>
          <tr>
            <th>Tipo</th>
            <th>Profesional</th>
            <th>Paciente</th>
            <th>Solicitada</th>
            <th>Estado</th>
            <th aria-label="Acciones" />
          </tr>
        </thead>
        <tbody>
          {solicitudes.map((s) => {
            const prof = mapaProfesionales[s.profesionalUid];
            const pacienteId = s.payloadPropuesto?.pacienteId || s.payloadAnterior?.pacienteId;
            const pac = pacienteId ? mapaPacientes[pacienteId] : null;
            // Para crear_paciente el nombre viene en el payload, no en mapaPacientes
            const nombrePacDesdePayload = s.tipo === TIPOS_SOLICITUD_SESION.CREAR_PACIENTE
              ? `${s.payloadPropuesto?.datosPaciente?.apellido || ''} ${s.payloadPropuesto?.datosPaciente?.nombre || ''}`.trim()
              : null;
            const resuelta = s.estado !== ESTADOS_SOLICITUD_SESION.PENDIENTE;
            const cantidad = cantidadDePayload(s.payloadPropuesto || s.payloadAnterior);

            return (
              <tr
                key={s.id}
                className={`cp-solicitudes-tabla__row ${resuelta ? 'cp-solicitudes-tabla__row--resuelta' : ''}`}
                onClick={() => onSeleccionar(s)}
              >
                <td data-label="Tipo">
                  <span className={`cp-solicitud-tipo cp-solicitud-tipo--${s.tipo}`}>
                    {iconoTipo(s.tipo)}
                    {LABELS_TIPO_SOLICITUD[s.tipo]}
                  </span>
                </td>
                <td data-label="Profesional" style={{ fontSize: 13.5 }}>
                  {s.profesionalNombre || nombreProfesional(prof)}
                </td>
                <td data-label="Paciente">
                  {nombrePacDesdePayload ? (
                    <span style={{ fontSize: 13.5, fontWeight: 500 }}>{nombrePacDesdePayload}</span>
                  ) : pac ? (
                    <div className="cp-prof-cell">
                      <Avatar initials={inicialesPaciente(pac)} size={28} />
                      <div className="cp-prof-name" style={{ fontSize: 13.5 }}>
                        {nombrePaciente(pac)}
                        <GroupBadge cantidad={cantidad} />
                      </div>
                    </div>
                  ) : (
                    <span style={{ color: 'var(--cp-text-faint)', fontSize: 13.5 }}>—</span>
                  )}
                </td>
                <td data-label="Solicitada" style={{ fontSize: 13, color: 'var(--cp-text-muted)' }}>
                  {formatoRelativo(s.createdAt)}
                </td>
                <td data-label="Estado">{badgeEstado(s.estado)}</td>
                <td className="cp-solicitudes-tabla__action-cell" style={{ textAlign: 'right' }}>
                  <button
                    type="button"
                    className="cp-prof-action"
                    onClick={(e) => { e.stopPropagation(); onSeleccionar(s); }}
                  >
                    Ver detalle
                  </button>
                </td>

                {/* Mobile: fila compacta */}
                <td className="cp-td-mobile-main" onClick={() => onSeleccionar(s)}>
                  <div className="cp-row-mobile__top">
                    {pac ? (
                      <div className="cp-prof-cell">
                        <Avatar initials={inicialesPaciente(pac)} size={26} />
                        <div className="cp-prof-name">
                          {nombrePaciente(pac)}
                          <GroupBadge cantidad={cantidad} />
                        </div>
                      </div>
                    ) : (
                      <span className={`cp-solicitud-tipo cp-solicitud-tipo--${s.tipo}`}>
                        {iconoTipo(s.tipo)} {LABELS_TIPO_SOLICITUD[s.tipo]}
                      </span>
                    )}
                  </div>
                  <div className="cp-row-mobile__mid">
                    {LABELS_TIPO_SOLICITUD[s.tipo]}
                    {pac ? ` · ${s.profesionalNombre || nombreProfesional(prof)}` : ''}
                  </div>
                  <div className="cp-row-mobile__bot">
                    {formatoRelativo(s.createdAt)}
                  </div>
                </td>
                <td className="cp-td-mobile-badge">
                  {badgeEstado(s.estado)}
                </td>
                <td className="cp-td-mobile-actions" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    className="cp-action-menu__trigger"
                    onClick={() => onSeleccionar(s)}
                    aria-label="Ver detalle"
                    style={{ fontSize: 12, width: 'auto', padding: '4px 8px' }}
                  >
                    →
                  </button>
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
   Modal de detalle con diff antes/despues + historial
   ----------------------------------------------------------------
   Muestra prominentemente el badge ×N en el titulo cuando aplica
   para que el admin vea claramente que esta aprobando un grupo.
   ============================================================ */
function DetalleModal({ solicitud, mapaPacientes, mapaProfesionales, adminUid, adminNombre, consultorioId, onClose }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [mostrandoMotivo, setMostrandoMotivo] = useState(false);
  const [motivo, setMotivo] = useState('');

  const esPendiente = solicitud.estado === ESTADOS_SOLICITUD_SESION.PENDIENTE;
  const prof = mapaProfesionales[solicitud.profesionalUid];

  const pacienteId = solicitud.payloadPropuesto?.pacienteId || solicitud.payloadAnterior?.pacienteId;
  const pac = pacienteId ? mapaPacientes[pacienteId] : null;
  const nombrePac = solicitud.tipo === TIPOS_SOLICITUD_SESION.CREAR_PACIENTE
    ? `${solicitud.payloadPropuesto?.datosPaciente?.apellido || ''} ${solicitud.payloadPropuesto?.datosPaciente?.nombre || ''}`.trim() || 'Nuevo paciente'
    : (nombrePaciente(pac) || 'paciente');

  // Cantidad para el titulo
  const cantidad = cantidadDePayload(solicitud.payloadPropuesto || solicitud.payloadAnterior);

  async function handleAprobar() {
    setError('');
    setSubmitting(true);
    try {
      await aprobarSolicitud({
        solicitudId: solicitud.id,
        adminUid,
        adminNombre,
      });
      onClose();
    } catch (err) {
      setError(err.message || 'No se pudo aprobar la solicitud.');
      setSubmitting(false);
    }
  }

  async function handleRechazar() {
    if (!mostrandoMotivo) {
      setMostrandoMotivo(true);
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      await rechazarSolicitud({
        solicitudId: solicitud.id,
        adminUid,
        adminNombre,
        motivo,
      });
      onClose();
    } catch (err) {
      setError(err.message || 'No se pudo rechazar la solicitud.');
      setSubmitting(false);
    }
  }

  const overlayProps = useOverlayClose(onClose);

  return (
    <div className="cp-modal-overlay" {...overlayProps}>
      <div className="cp-modal cp-modal--wide cp-modal--detalle" onClick={(e) => e.stopPropagation()}>
        <button className="cp-modal__close" onClick={onClose} aria-label="Cerrar">×</button>

        <h2 className="cp-modal__title">
          <span className={`cp-solicitud-tipo cp-solicitud-tipo--${solicitud.tipo}`}>
            {iconoTipo(solicitud.tipo)}
          </span>
          {' '}
          {solicitud.tipo === TIPOS_SOLICITUD_SESION.CARGA_RAPIDA
            ? `Carga rápida — ${solicitud.payloadPropuesto?.sesiones?.length ?? 0} sesiones`
            : <>{LABELS_TIPO_SOLICITUD[solicitud.tipo]} · {nombrePac}<GroupBadge cantidad={cantidad} /></>}
        </h2>

        {/* Aviso prominente cuando es agrupacion */}
        {cantidad > 1 && esPendiente && (
          <div className="cp-detalle-aviso" style={{ background: 'var(--cp-accent-bg)', color: 'var(--cp-accent-dark)', marginBottom: 14 }}>
            <InfoIcon />
            <div>
              <strong>Sesiones agrupadas: {cantidad}</strong>
              Este registro representa <strong>{cantidad} encuentros</strong> con el paciente,
              cargados juntos. Aprobar o rechazar afecta al grupo entero.
            </div>
          </div>
        )}

        <div className="cp-detalle-header">
          <div className="cp-detalle-header__autor">
            Solicitada por <strong>{solicitud.profesionalNombre || nombreProfesional(prof)}</strong>
          </div>
          <div className="cp-detalle-header__fecha">
            {formatoFechaCompleta(solicitud.createdAt)}
          </div>
          <div style={{ marginTop: 6 }}>{badgeEstado(solicitud.estado)}</div>
        </div>

        {/* Diff segun el tipo */}
        <Diff solicitud={solicitud} pac={pac} />

        {/* Avisos para estados no pendientes */}
        {solicitud.estado === ESTADOS_SOLICITUD_SESION.OBSOLETA && (
          <div className="cp-detalle-aviso">
            <InfoIcon />
            <div>
              <strong>Esta solicitud quedó obsoleta</strong>
              La sesión fue modificada o eliminada por otro camino antes de que se resolviera.
              No es posible aplicarla.
            </div>
          </div>
        )}

        {solicitud.estado === ESTADOS_SOLICITUD_SESION.RECHAZADA && (
          <div className="cp-detalle-aviso cp-detalle-aviso--rechazada">
            <InfoIcon />
            <div>
              <strong>Solicitud rechazada</strong>
              {solicitud.motivoRechazo
                ? `Motivo: "${solicitud.motivoRechazo}"`
                : 'No se especificó motivo.'}
              {solicitud.resolvedByNombre && ` — Por ${solicitud.resolvedByNombre}.`}
            </div>
          </div>
        )}

        {solicitud.estado === ESTADOS_SOLICITUD_SESION.APROBADA && (
          <div className="cp-detalle-aviso" style={{ background: 'var(--cp-success-bg)', color: 'var(--cp-success)' }}>
            <InfoIcon />
            <div>
              <strong>Solicitud aprobada</strong>
              Los cambios fueron aplicados {solicitud.resolvedByNombre && `por ${solicitud.resolvedByNombre}`}.
            </div>
          </div>
        )}

        {/* Form de motivo de rechazo */}
        {esPendiente && mostrandoMotivo && (
          <div className="cp-rechazo-form">
            <label className="cp-rechazo-form__label">
              Motivo del rechazo (opcional)
            </label>
            <textarea
              className="cp-textarea"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows="2"
              placeholder="Ej: el valor declarado no coincide con la sesión real, faltan datos, etc."
              autoFocus
            />
          </div>
        )}

        {error && <div className="cp-modal__error" style={{ marginTop: 12 }}>{error}</div>}

        {/* Historial de auditoria (Fase C.2) */}
        <HistorialPanel consultorioId={consultorioId} solicitudId={solicitud.id} />

        {/* Acciones */}
        <div className="cp-modal__actions">
          {esPendiente ? (
            <>
              <Button variant="secondary" type="button" onClick={onClose} disabled={submitting}>
                Cerrar
              </Button>
              <Button
                variant="secondary"
                type="button"
                onClick={handleRechazar}
                disabled={submitting}
                style={{
                  color: 'var(--cp-danger)',
                  borderColor: mostrandoMotivo ? 'var(--cp-danger)' : undefined,
                }}
              >
                {mostrandoMotivo
                  ? (submitting ? <><Spinner size={14} /> Rechazando…</> : 'Confirmar rechazo')
                  : 'Rechazar'}
              </Button>
              <Button variant="primary" type="button" onClick={handleAprobar} disabled={submitting || mostrandoMotivo}>
                {submitting && !mostrandoMotivo
                  ? <><Spinner size={14} /> Aprobando…</>
                  : (cantidad > 1 ? `Aprobar (${cantidad} sesiones)` : 'Aprobar')}
              </Button>
            </>
          ) : (
            <Button variant="primary" type="button" onClick={onClose}>
              Cerrar
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   HistorialPanel — muestra los logs de auditoria de la solicitud
   ============================================================ */
function HistorialPanel({ consultorioId, solicitudId }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!consultorioId || !solicitudId) return;
    setLoading(true);
    const unsub = suscribirLogsDeSolicitud(consultorioId, solicitudId, (data) => {
      setLogs(data);
      setLoading(false);
    });
    return unsub;
  }, [consultorioId, solicitudId]);

  if (loading) {
    return (
      <div className="cp-historial">
        <h3 className="cp-historial__title">Historial</h3>
        <div style={{ padding: 16, display: 'flex', justifyContent: 'center' }}>
          <Spinner size={16} />
        </div>
      </div>
    );
  }

  if (logs.length === 0) {
    return null;
  }

  return (
    <div className="cp-historial">
      <h3 className="cp-historial__title">
        Historial
        <span className="cp-historial__count">{logs.length} evento{logs.length === 1 ? '' : 's'}</span>
      </h3>
      <ol className="cp-historial__list">
        {logs.map((log) => (
          <li key={log.id} className="cp-historial__item">
            <span className={`cp-historial__dot cp-historial__dot--${tipoColor(log.tipo)}`} />
            <div className="cp-historial__contenido">
              <div className="cp-historial__descripcion">{log.descripcion}</div>
              <div className="cp-historial__meta">
                {log.actorNombre || 'Usuario'} · {formatoFechaCompleta(log.createdAt)}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function tipoColor(tipo) {
  switch (tipo) {
    case TIPOS_LOG_SESION.SOLICITUD_CREADA: return 'pendiente';
    case TIPOS_LOG_SESION.SOLICITUD_APROBADA: return 'success';
    case TIPOS_LOG_SESION.SOLICITUD_RECHAZADA: return 'danger';
    case TIPOS_LOG_SESION.SOLICITUD_OBSOLETA: return 'muted';
    default: return 'muted';
  }
}

/* ============================================================
   Diff
   ----------------------------------------------------------------
   Agregamos cantidadSesiones y valorSesion a CAMPOS_DIFF para que
   el admin vea esos datos al revisar.
   ============================================================ */
function Diff({ solicitud, pac }) {
  const { tipo, payloadPropuesto, payloadAnterior } = solicitud;

  if (tipo === TIPOS_SOLICITUD_SESION.CARGA_RAPIDA) {
    return <DiffCargaRapida sesiones={payloadPropuesto?.sesiones ?? []} />;
  }

  if (tipo === TIPOS_SOLICITUD_SESION.CREAR) {
    return <DiffSingle payload={payloadPropuesto} pac={pac} encabezado="Datos propuestos" tono="despues" />;
  }

  if (tipo === TIPOS_SOLICITUD_SESION.ELIMINAR) {
    return <DiffSingle payload={payloadAnterior} pac={pac} encabezado="Sesión a eliminar" tono="eliminar" />;
  }

  return <DiffDoble anterior={payloadAnterior} propuesto={payloadPropuesto} pac={pac} />;
}

function DiffCargaRapida({ sesiones }) {
  if (!sesiones || sesiones.length === 0) {
    return <p style={{ color: 'var(--cp-text-faint)', fontSize: 13.5 }}>Sin sesiones en esta solicitud.</p>;
  }

  // Convierte cualquier formato de fecha a Date nativo sin explotar.
  // Firestore serializa Timestamps como plain objects {seconds, nanoseconds}
  // cuando están guardados dentro de un campo mapa/array.
  function parseFecha(v) {
    if (!v) return null;
    if (typeof v.toDate === 'function') return v.toDate();          // Timestamp Firestore
    if (v.seconds !== undefined) return new Date(v.seconds * 1000); // Timestamp serializado
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }

  const total = sesiones.reduce((acc, s) => acc + (s.valorTotal || 0), 0);
  const sinValor = sesiones.filter((s) => s.estadoPago === 'pendiente_monto').length;

  return (
    <div className="cp-cr-solicitud">
      <div className="cp-cr-solicitud__head">
        <span className="cp-cr-solicitud__count">
          {sesiones.length} sesión{sesiones.length === 1 ? '' : 'es'} a registrar
        </span>
        {total > 0 && (
          <span className="cp-cr-solicitud__total">
            Total: {formatoARS.format(total)}
          </span>
        )}
      </div>
      <div className="cp-cr-solicitud__tabla">
        {sesiones.map((s, i) => {
          const d = parseFecha(s.fecha);
          const fecha = d
            ? d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })
              + ' · ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
            : '—';
          return (
            <div key={i} className="cp-cr-solicitud__row">
              <div className="cp-cr-solicitud__pac">{s.pacienteNombre || '—'}</div>
              <div className="cp-cr-solicitud__meta">
                {fecha} · {s.metodoPagoNombre}
                {s.cantidadSesiones > 1 && ` · ×${s.cantidadSesiones}`}
              </div>
              <div className="cp-cr-solicitud__valor">
                {s.estadoPago === 'pendiente_monto'
                  ? <span style={{ color: 'var(--cp-warning, #b8860b)', fontSize: 12 }}>OS sin liquidar</span>
                  : formatoARS.format(s.valorTotal || 0)}
              </div>
            </div>
          );
        })}
      </div>
      {sinValor > 0 && (
        <div style={{ fontSize: 12.5, color: 'var(--cp-warning, #b8860b)', marginTop: 10 }}>
          ⚠ {sinValor} sesión{sinValor === 1 ? '' : 'es'} de obra social sin monto aún. Se crearán en estado "A liquidar".
        </div>
      )}
    </div>
  );
}

const CAMPOS_DIFF = [
  { key: 'fecha',                label: 'Fecha y hora' },
  { key: 'cantidadSesiones',     label: 'Cantidad de sesiones' },
  { key: 'metodoPagoNombre',     label: 'Método de pago' },
  { key: 'valorSesion',          label: 'Valor por sesión' },
  { key: 'valorTotal',           label: 'Valor total' },
  { key: 'porcentajeConsultorio', label: '% consultorio' },
  { key: 'montoConsultorio',     label: 'Al consultorio' },
  { key: 'montoProfesional',     label: 'Al profesional' },
  { key: 'notas',                label: 'Notas' },
];

function valorFormateado(payload, key) {
  if (!payload) return null;
  const v = payload[key];
  if (v == null || v === '') {
    // Para cantidadSesiones: si no esta definido, mostramos "1" (default)
    if (key === 'cantidadSesiones') return '1';
    return null;
  }
  switch (key) {
    case 'fecha': {
      const d = v.toDate ? v.toDate() : new Date(v);
      return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })
        + ' · ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    }
    case 'valorTotal':
    case 'valorSesion':
    case 'montoConsultorio':
    case 'montoProfesional':
      return formatoARS.format(v);
    case 'porcentajeConsultorio':
      return `${v}%`;
    case 'cantidadSesiones':
      return String(v);
    case 'metodoPagoNombre':
      return (
        <>
          {v}
          {payload.metodoPagoTipo === TIPOS_METODO_PAGO.DIFERIDO && (
            <span className="cp-badge cp-badge--diferido" style={{ marginLeft: 6 }}>diferido</span>
          )}
        </>
      );
    default:
      return v;
  }
}

function compararValor(a, b, key) {
  if (key === 'fecha') {
    const ma = a?.toMillis ? a.toMillis() : (a ? new Date(a).getTime() : null);
    const mb = b?.toMillis ? b.toMillis() : (b ? new Date(b).getTime() : null);
    return ma === mb;
  }
  if (key === 'cantidadSesiones') {
    // Backwards compat: undefined o null se trata como 1
    const na = Number(a) || 1;
    const nb = Number(b) || 1;
    return na === nb;
  }
  return (a ?? null) === (b ?? null);
}

function DiffSingle({ payload, pac, encabezado, tono }) {
  return (
    <div className="cp-diff">
      <div className="cp-diff__head cp-diff__head--single">
        <div className={`cp-diff__head-cell ${tono === 'eliminar' ? 'cp-diff__head-cell--eliminar' : 'cp-diff__head-cell--despues'}`}>
          {encabezado}
        </div>
      </div>
      <div className="cp-diff__body">
        {pac && (
          <div className={`cp-diff__row cp-diff__row--single ${tono === 'eliminar' ? 'cp-diff__row--eliminar' : ''}`}>
            <div className="cp-diff__campo">Paciente</div>
            <div className="cp-diff__valor">{nombrePaciente(pac)}</div>
          </div>
        )}
        {CAMPOS_DIFF.map(({ key, label }) => {
          const v = valorFormateado(payload, key);
          if (v == null && key !== 'notas') return null;
          return (
            <div
              key={key}
              className={`cp-diff__row cp-diff__row--single ${tono === 'eliminar' ? 'cp-diff__row--eliminar' : ''}`}
            >
              <div className="cp-diff__campo">{label}</div>
              <div className="cp-diff__valor">
                {v ?? <span className="cp-diff__valor--vacio">—</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DiffDoble({ anterior, propuesto, pac }) {
  return (
    <div className="cp-diff">
      <div className="cp-diff__head">
        <div className="cp-diff__head-cell">Antes</div>
        <div className="cp-diff__head-cell cp-diff__head-cell--despues">Después</div>
      </div>
      <div className="cp-diff__body">
        {pac && (
          <div className="cp-diff__row">
            <div className="cp-diff__campo">Paciente</div>
            <div className="cp-diff__valor">{nombrePaciente(pac)}</div>
            <div className="cp-diff__valor">{nombrePaciente(pac)}</div>
          </div>
        )}
        {CAMPOS_DIFF.map(({ key, label }) => {
          const vAnt = valorFormateado(anterior, key);
          const vNue = valorFormateado(propuesto, key);
          if (vAnt == null && vNue == null && key !== 'notas') return null;

          const cambio = !compararValor(anterior?.[key], propuesto?.[key], key);

          return (
            <div key={key} className={`cp-diff__row ${cambio ? 'cp-diff__row--changed' : ''}`}>
              <div className="cp-diff__campo">{label}</div>
              <div className={`cp-diff__valor ${cambio ? 'cp-diff__valor--anterior' : ''}`}>
                {vAnt ?? <span className="cp-diff__valor--vacio">—</span>}
              </div>
              <div className={`cp-diff__valor ${cambio ? 'cp-diff__valor--despues' : ''}`}>
                {vNue ?? <span className="cp-diff__valor--vacio">—</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
