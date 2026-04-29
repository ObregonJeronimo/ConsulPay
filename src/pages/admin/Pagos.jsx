import { useEffect, useMemo, useState } from 'react';

import Avatar from '../../components/ui/Avatar.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Spinner from '../../components/ui/Spinner.jsx';

import { useAuth } from '../../hooks/useAuth.js';
import { formatoARS } from '../../lib/constants.js';
import {
  labelEstadoPago,
  suscribirPagosDelConsultorio,
  tonoEstadoPago,
} from '../../lib/pagos.js';
import { suscribirProfesionales } from '../../lib/profesionales.js';

import './Pagos.css';

/* ============================================================
   Helpers
   ============================================================ */
function nombreVisible(p) {
  if (!p) return 'Profesional eliminado';
  return p.displayName || p.email || `Usuario ${p.uid.slice(0, 6)}`;
}
function inicialesProfesional(p) {
  if (!p) return '·';
  const nombre = nombreVisible(p);
  const partes = nombre.trim().split(/\s+/);
  const first = partes[0]?.[0] ?? '';
  const last = partes.length > 1 ? partes[partes.length - 1][0] : '';
  return (first + last).toUpperCase() || '·';
}
function formatoFechaCorta(date) {
  if (!date) return '—';
  const d = date.toDate ? date.toDate() : new Date(date);
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
}
function formatoFechaHora(date) {
  if (!date) return '—';
  const d = date.toDate ? date.toDate() : new Date(date);
  const fecha = d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
  const hora = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  return `${fecha} · ${hora}`;
}

/* ============================================================
   Pagina principal: pagos recibidos (admin)
   ============================================================ */
export default function PagosAdmin() {
  const { user } = useAuth();
  const consultorioId = user?.consultorioId;

  const [pagos, setPagos] = useState([]);
  const [profesionales, setProfesionales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState('todos');
  const [pagoSeleccionado, setPagoSeleccionado] = useState(null);

  /* ---- Suscripciones live ---- */
  useEffect(() => {
    if (!consultorioId) return;
    setLoading(true);
    return suscribirPagosDelConsultorio(consultorioId, (data) => {
      setPagos(data);
      setLoading(false);
    });
  }, [consultorioId]);

  useEffect(() => {
    if (!consultorioId) return;
    return suscribirProfesionales(consultorioId, setProfesionales);
  }, [consultorioId]);

  const mapaProfesionales = useMemo(() => {
    const m = {};
    for (const p of profesionales) m[p.uid] = p;
    return m;
  }, [profesionales]);

  /* ---- Calculos derivados ---- */

  const pagosFiltrados = useMemo(() => {
    if (filtroEstado === 'todos') return pagos;
    return pagos.filter((p) => p.estado === filtroEstado);
  }, [pagos, filtroEstado]);

  const stats = useMemo(() => {
    let aprobados = 0;
    let pendientes = 0;
    let totalRecibido = 0;
    let totalComision = 0;
    for (const p of pagos) {
      if (p.estado === 'aprobado') {
        aprobados += 1;
        totalRecibido += p.montoConsultorio || 0;
        totalComision += p.montoConsulpay || 0;
      } else if (p.estado === 'pendiente') {
        pendientes += 1;
      }
    }
    return { aprobados, pendientes, totalRecibido, totalComision };
  }, [pagos]);

  /* ---- Renders ---- */

  if (loading && pagos.length === 0) {
    return (
      <div className="cp-pagos-admin">
        <div style={{ padding: 60, display: 'flex', justifyContent: 'center' }}>
          <Spinner size={24} label="Cargando pagos…" />
        </div>
      </div>
    );
  }

  return (
    <div className="cp-pagos-admin">
      <header className="cp-page-header">
        <div>
          <h1 className="cp-page-title">Pagos recibidos</h1>
          <p className="cp-page-sub">
            Pagos de profesionales al consultorio vía Mercado Pago.
          </p>
        </div>
      </header>

      {/* Stats */}
      <div className="cp-pagos-stats">
        <div className="cp-stat cp-stat--success">
          <div className="cp-stat__label">Total recibido</div>
          <div className="cp-stat__value">{formatoARS.format(stats.totalRecibido)}</div>
          <div className="cp-stat__hint">{stats.aprobados} pago{stats.aprobados === 1 ? '' : 's'} aprobado{stats.aprobados === 1 ? '' : 's'}</div>
        </div>
        <div className="cp-stat">
          <div className="cp-stat__label">Comisión ConsulPay</div>
          <div className="cp-stat__value">{formatoARS.format(stats.totalComision)}</div>
          <div className="cp-stat__hint">descontada antes de acreditar</div>
        </div>
        <div className="cp-stat cp-stat--debido">
          <div className="cp-stat__label">En proceso</div>
          <div className="cp-stat__value">{stats.pendientes}</div>
          <div className="cp-stat__hint">pago{stats.pendientes === 1 ? '' : 's'} esperando confirmación</div>
        </div>
      </div>

      {/* Filtros */}
      <div className="cp-pagos-filtros">
        <FiltroEstado value={filtroEstado} onChange={setFiltroEstado} pagos={pagos} />
      </div>

      {/* Tabla */}
      {pagosFiltrados.length === 0 ? (
        <div className="cp-sesiones-empty">
          <h2 className="cp-sesiones-empty__title">
            {filtroEstado === 'todos'
              ? 'Aún no recibiste pagos'
              : `No hay pagos en estado "${labelEstadoPago(filtroEstado)}"`}
          </h2>
          <p className="cp-sesiones-empty__desc">
            {filtroEstado === 'todos'
              ? 'Cuando tus profesionales paguen al consultorio vía Mercado Pago, los vas a ver acá.'
              : 'Probá cambiar el filtro de estado para ver más pagos.'}
          </p>
        </div>
      ) : (
        <div className="cp-table-wrap">
          <table className="cp-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Profesional</th>
                <th className="cp-num-col">Monto bruto</th>
                <th className="cp-num-col">Comisión</th>
                <th className="cp-num-col">Recibido</th>
                <th className="cp-num-col">Sesiones</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {pagosFiltrados.map((p) => {
                const prof = mapaProfesionales[p.profesionalUid];
                return (
                  <tr
                    key={p.id}
                    className="cp-pagos-row"
                    onClick={() => setPagoSeleccionado(p)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td>{formatoFechaCorta(p.createdAt)}</td>
                    <td>
                      <div className="cp-prof-cell">
                        <Avatar initials={inicialesProfesional(prof)} size={28} />
                        <div>
                          <div className="cp-prof-name" style={{ fontSize: 13.5 }}>
                            {nombreVisible(prof)}
                          </div>
                          {prof?.email && (
                            <div className="cp-prof-meta">{prof.email}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="cp-num">{formatoARS.format(p.montoTotal || 0)}</td>
                    <td className="cp-num" style={{ color: 'var(--cp-text-muted)' }}>
                      −{formatoARS.format(p.montoConsulpay || 0)}
                    </td>
                    <td className="cp-num" style={{ color: 'var(--cp-success)', fontWeight: 500 }}>
                      {formatoARS.format(p.montoConsultorio || 0)}
                    </td>
                    <td className="cp-num">{p.sesionesIds?.length || 0}</td>
                    <td>
                      <Badge tone={tonoEstadoPago(p.estado)}>
                        {labelEstadoPago(p.estado)}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {pagoSeleccionado && (
        <DetallePagoModal
          pago={pagoSeleccionado}
          profesional={mapaProfesionales[pagoSeleccionado.profesionalUid]}
          onClose={() => setPagoSeleccionado(null)}
        />
      )}
    </div>
  );
}

/* ============================================================
   Filtro de estado
   ============================================================ */
function FiltroEstado({ value, onChange, pagos }) {
  const counts = useMemo(() => {
    const c = { todos: pagos.length, pendiente: 0, aprobado: 0, rechazado: 0, cancelado: 0 };
    for (const p of pagos) {
      if (c[p.estado] !== undefined) c[p.estado] += 1;
    }
    return c;
  }, [pagos]);

  const opciones = [
    { value: 'todos', label: 'Todos', count: counts.todos },
    { value: 'aprobado', label: 'Aprobados', count: counts.aprobado },
    { value: 'pendiente', label: 'En proceso', count: counts.pendiente },
    { value: 'rechazado', label: 'Rechazados', count: counts.rechazado },
  ];

  return (
    <div className="cp-pagos-filtros__chips">
      {opciones.map((op) => (
        <button
          key={op.value}
          className={`cp-pagos-filtros__chip ${value === op.value ? 'cp-pagos-filtros__chip--active' : ''}`}
          onClick={() => onChange(op.value)}
        >
          {op.label}
          {op.count > 0 && <span className="cp-pagos-filtros__count">{op.count}</span>}
        </button>
      ))}
    </div>
  );
}

/* ============================================================
   Modal de detalle del pago
   ============================================================ */
function DetallePagoModal({ pago, profesional, onClose }) {
  return (
    <div className="cp-modal-overlay" onClick={onClose}>
      <div className="cp-modal cp-modal--detalle-pago" onClick={(e) => e.stopPropagation()}>
        <button className="cp-modal__close" onClick={onClose} aria-label="Cerrar">×</button>

        <h2 className="cp-modal__title">Detalle del pago</h2>

        <dl className="cp-detalle-pago">
          <div>
            <dt>Profesional</dt>
            <dd>{nombreVisible(profesional)}{profesional?.email ? ` · ${profesional.email}` : ''}</dd>
          </div>
          <div>
            <dt>Fecha de creación</dt>
            <dd>{formatoFechaHora(pago.createdAt)}</dd>
          </div>
          {pago.webhookRecibidoAt && (
            <div>
              <dt>Confirmación MP</dt>
              <dd>{formatoFechaHora(pago.webhookRecibidoAt)}</dd>
            </div>
          )}
          <div>
            <dt>Estado</dt>
            <dd>
              <Badge tone={tonoEstadoPago(pago.estado)}>
                {labelEstadoPago(pago.estado)}
              </Badge>
              {pago.mpStatusDetail && (
                <span className="cp-detalle-pago__mp-detail"> · {pago.mpStatusDetail}</span>
              )}
            </dd>
          </div>
          <div>
            <dt>Monto bruto</dt>
            <dd>{formatoARS.format(pago.montoTotal || 0)}</dd>
          </div>
          <div>
            <dt>Comisión ConsulPay ({pago.comisionPctAplicada ?? '—'}%)</dt>
            <dd style={{ color: 'var(--cp-text-muted)' }}>
              −{formatoARS.format(pago.montoConsulpay || 0)}
            </dd>
          </div>
          <div className="cp-detalle-pago__total">
            <dt>Recibido en tu cuenta MP</dt>
            <dd>{formatoARS.format(pago.montoConsultorio || 0)}</dd>
          </div>
          {pago.mpPaymentId && (
            <div>
              <dt>ID de pago Mercado Pago</dt>
              <dd>
                <code style={{ fontFamily: 'monospace', fontSize: 12 }}>
                  {pago.mpPaymentId}
                </code>
              </dd>
            </div>
          )}
          {pago.mpPreferenceId && (
            <div>
              <dt>ID de preferencia</dt>
              <dd>
                <code style={{ fontFamily: 'monospace', fontSize: 12 }}>
                  {pago.mpPreferenceId}
                </code>
              </dd>
            </div>
          )}
          <div>
            <dt>Sesiones incluidas</dt>
            <dd>{pago.sesionesIds?.length || 0} sesión{pago.sesionesIds?.length === 1 ? '' : 'es'}</dd>
          </div>
          {pago.rawPaymentData?.payment_method_id && (
            <div>
              <dt>Medio de pago usado</dt>
              <dd>{pago.rawPaymentData.payment_method_id}{pago.rawPaymentData.installments ? ` · ${pago.rawPaymentData.installments} cuotas` : ''}</dd>
            </div>
          )}
          {pago.errorCreacion && (
            <div>
              <dt>Error al crear</dt>
              <dd style={{ color: 'var(--cp-danger)', fontSize: 13 }}>{pago.errorCreacion}</dd>
            </div>
          )}
        </dl>
      </div>
    </div>
  );
}
