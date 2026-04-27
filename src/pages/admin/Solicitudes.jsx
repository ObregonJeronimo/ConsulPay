import { useEffect, useMemo, useState } from 'react';

import Avatar from '../../components/ui/Avatar.jsx';
import Button from '../../components/ui/Button.jsx';
import Spinner from '../../components/ui/Spinner.jsx';

import { useAuth } from '../../hooks/useAuth.js';
import {
  ESTADOS_SOLICITUD_SESION,
  formatoARS,
  LABELS_TIPO_SOLICITUD,
  TIPOS_METODO_PAGO,
  TIPOS_SOLICITUD_SESION,
} from '../../lib/constants.js';
import { suscribirPacientesConsultorio } from '../../lib/pacientes.js';
import { suscribirProfesionales } from '../../lib/profesionales.js';
import {
  aprobarSolicitud,
  rechazarSolicitud,
  suscribirTodasSolicitudes,
} from '../../lib/solicitudes.js';

import './Solicitudes.css';
import './Sesiones.css';   // reusamos cp-badge*, cp-modal*, cp-stat*

/* ============================================================
   Iconos
   ============================================================ */
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

function iconoTipo(tipo) {
  switch (tipo) {
    case TIPOS_SOLICITUD_SESION.CREAR: return <PlusIcon />;
    case TIPOS_SOLICITUD_SESION.MODIFICAR: return <EditIcon />;
    case TIPOS_SOLICITUD_SESION.ELIMINAR: return <TrashIcon />;
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

  const [tab, setTab] = useState('pendientes'); // 'pendientes' | 'resueltas'
  const [seleccionada, setSeleccionada] = useState(null);

  // Suscripcion live a TODAS las solicitudes del consultorio
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

  // Particion: pendientes / resueltas
  const pendientes = useMemo(
    () => solicitudes.filter((s) => s.estado === ESTADOS_SOLICITUD_SESION.PENDIENTE),
    [solicitudes],
  );
  const resueltas = useMemo(
    () => solicitudes.filter((s) => s.estado !== ESTADOS_SOLICITUD_SESION.PENDIENTE),
    [solicitudes],
  );

  const lista = tab === 'pendientes' ? pendientes : resueltas;

  /* Cuando se actualiza la solicitud seleccionada (ej: el live llega y la
     marca como resuelta), refrescamos la referencia para que el modal
     muestre el estado real. */
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
   ============================================================ */
function TablaSolicitudes({ solicitudes, mapaPacientes, mapaProfesionales, onSeleccionar }) {
  return (
    <div className="cp-table-wrap">
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
            // El paciente puede venir del payload propuesto (crear/modificar)
            // o del anterior (eliminar/modificar)
            const pacienteId = s.payloadPropuesto?.pacienteId || s.payloadAnterior?.pacienteId;
            const pac = pacienteId ? mapaPacientes[pacienteId] : null;

            const resuelta = s.estado !== ESTADOS_SOLICITUD_SESION.PENDIENTE;

            return (
              <tr
                key={s.id}
                className={`cp-solicitudes-tabla__row ${resuelta ? 'cp-solicitudes-tabla__row--resuelta' : ''}`}
                onClick={() => onSeleccionar(s)}
              >
                <td>
                  <span className={`cp-solicitud-tipo cp-solicitud-tipo--${s.tipo}`}>
                    {iconoTipo(s.tipo)}
                    {LABELS_TIPO_SOLICITUD[s.tipo]}
                  </span>
                </td>
                <td style={{ fontSize: 13.5 }}>
                  {s.profesionalNombre || nombreProfesional(prof)}
                </td>
                <td>
                  {pac ? (
                    <div className="cp-prof-cell">
                      <Avatar initials={inicialesPaciente(pac)} size={28} />
                      <div className="cp-prof-name" style={{ fontSize: 13.5 }}>
                        {nombrePaciente(pac)}
                      </div>
                    </div>
                  ) : (
                    <span style={{ color: 'var(--cp-text-faint)', fontSize: 13.5 }}>—</span>
                  )}
                </td>
                <td style={{ fontSize: 13, color: 'var(--cp-text-muted)' }}>
                  {formatoRelativo(s.createdAt)}
                </td>
                <td>{badgeEstado(s.estado)}</td>
                <td style={{ textAlign: 'right' }}>
                  <button
                    type="button"
                    className="cp-prof-action"
                    onClick={(e) => { e.stopPropagation(); onSeleccionar(s); }}
                  >
                    Ver detalle
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
   Modal de detalle con diff antes/despues
   ============================================================ */
function DetalleModal({ solicitud, mapaPacientes, mapaProfesionales, adminUid, adminNombre, onClose }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [mostrandoMotivo, setMostrandoMotivo] = useState(false);
  const [motivo, setMotivo] = useState('');

  const esPendiente = solicitud.estado === ESTADOS_SOLICITUD_SESION.PENDIENTE;
  const prof = mapaProfesionales[solicitud.profesionalUid];

  const pacienteId = solicitud.payloadPropuesto?.pacienteId || solicitud.payloadAnterior?.pacienteId;
  const pac = pacienteId ? mapaPacientes[pacienteId] : null;
  const nombrePac = nombrePaciente(pac) || 'paciente';

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

  return (
    <div className="cp-modal-overlay" onClick={onClose}>
      <div className="cp-modal cp-modal--wide cp-modal--detalle" onClick={(e) => e.stopPropagation()}>
        <button className="cp-modal__close" onClick={onClose} aria-label="Cerrar">×</button>

        <h2 className="cp-modal__title">
          <span className={`cp-solicitud-tipo cp-solicitud-tipo--${solicitud.tipo}`}>
            {iconoTipo(solicitud.tipo)}
          </span>
          {' '}
          {LABELS_TIPO_SOLICITUD[solicitud.tipo]} · {nombrePac}
        </h2>

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

        {/* Form de motivo de rechazo (solo cuando se desplega) */}
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
                  : 'Aprobar'}
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
   Diff: muestra los cambios segun el tipo
   ----------------------------------------------------------------
   Crear: una columna con los datos propuestos.
   Modificar: dos columnas, antes vs despues, filas que cambian
     resaltadas.
   Eliminar: una columna con los datos que se van a perder.
   ============================================================ */
function Diff({ solicitud, pac }) {
  const { tipo, payloadPropuesto, payloadAnterior } = solicitud;

  if (tipo === TIPOS_SOLICITUD_SESION.CREAR) {
    return <DiffSingle payload={payloadPropuesto} pac={pac} encabezado="Datos propuestos" tono="despues" />;
  }

  if (tipo === TIPOS_SOLICITUD_SESION.ELIMINAR) {
    return <DiffSingle payload={payloadAnterior} pac={pac} encabezado="Sesión a eliminar" tono="eliminar" />;
  }

  // Modificar
  return <DiffDoble anterior={payloadAnterior} propuesto={payloadPropuesto} pac={pac} />;
}

const CAMPOS_DIFF = [
  { key: 'fecha',                label: 'Fecha y hora' },
  { key: 'metodoPagoNombre',     label: 'Método de pago' },
  { key: 'valorTotal',           label: 'Valor total' },
  { key: 'porcentajeConsultorio', label: '% consultorio' },
  { key: 'montoConsultorio',     label: 'Al consultorio' },
  { key: 'montoProfesional',     label: 'Al profesional' },
  { key: 'notas',                label: 'Notas' },
];

function valorFormateado(payload, key) {
  if (!payload) return null;
  const v = payload[key];
  if (v == null || v === '') return null;
  switch (key) {
    case 'fecha': {
      const d = v.toDate ? v.toDate() : new Date(v);
      return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })
        + ' · ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    }
    case 'valorTotal':
    case 'montoConsultorio':
    case 'montoProfesional':
      return formatoARS.format(v);
    case 'porcentajeConsultorio':
      return `${v}%`;
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
  // Para fechas comparamos en milisegundos
  if (key === 'fecha') {
    const ma = a?.toMillis ? a.toMillis() : (a ? new Date(a).getTime() : null);
    const mb = b?.toMillis ? b.toMillis() : (b ? new Date(b).getTime() : null);
    return ma === mb;
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
        {/* Paciente al tope si se puede resolver */}
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
          // Saltamos solo si AMBOS son null (excepto notas, que igual queremos mostrar para auditar)
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
