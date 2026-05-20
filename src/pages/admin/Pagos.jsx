import { useEffect, useMemo, useState } from 'react';

import Avatar from '../../components/ui/Avatar.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Spinner from '../../components/ui/Spinner.jsx';

import { useAuth } from '../../hooks/useAuth.js';
import { useConsultorio } from '../../hooks/useConsultorio.js';
import { ESTADOS_PAGO_SESION, formatoARS } from '../../lib/constants.js';
import {
  labelEstadoPago,
  montoNetoEfectivo,
  suscribirPagosDelConsultorio,
  tieneFeeDetails,
  tonoEstadoPago,
} from '../../lib/pagos.js';
import { suscribirProfesionales } from '../../lib/profesionales.js';
import {
  finDeMes,
  inicioDeMes,
  nombreDelMes,
  suscribirSesionesConsultorio,
} from '../../lib/sesiones.js';

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
  const { consultorio } = useConsultorio();

  const [pagos, setPagos] = useState([]);
  const [sesiones, setSesiones] = useState([]);
  const [profesionales, setProfesionales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState('todos');
  const [filtroCanal, setFiltroCanal] = useState('manual'); // 'mp' | 'manual' | 'ambos'
  const [mes, setMes] = useState(() => inicioDeMes(new Date()));
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

  // Sesiones del mes para calcular las marcadas como pagadas manualmente
  useEffect(() => {
    if (!consultorioId) return;
    const desde = inicioDeMes(mes);
    const hasta = finDeMes(mes);
    return suscribirSesionesConsultorio(consultorioId, setSesiones, { desde, hasta });
  }, [consultorioId, mes]);

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

  // Pagos MP filtrados por el mes seleccionado
  const pagosDelMes = useMemo(() => {
    const desde = inicioDeMes(mes).getTime();
    const hasta = finDeMes(mes).getTime();
    return pagos.filter((p) => {
      const t = p.createdAt?.toDate ? p.createdAt.toDate().getTime() : 0;
      return t >= desde && t <= hasta;
    });
  }, [pagos, mes]);

  // Stats MP del mes seleccionado
  const stats = useMemo(() => {
    let aprobados = 0;
    let pendientes = 0;
    let totalRecibido = 0;
    let totalComision = 0;
    let totalFeeMP = 0;
    let pagosSinFeeDetails = 0;
    for (const p of pagosDelMes) {
      if (p.estado === 'aprobado') {
        aprobados += 1;
        totalRecibido += montoNetoEfectivo(p);
        totalComision += p.montoConsulpay || 0;
        if (tieneFeeDetails(p)) {
          totalFeeMP += p.feeMercadoPago || 0;
        } else {
          pagosSinFeeDetails += 1;
        }
      } else if (p.estado === 'pendiente') {
        pendientes += 1;
      }
    }
    return { aprobados, pendientes, totalRecibido, totalComision, totalFeeMP, pagosSinFeeDetails };
  }, [pagosDelMes]);

  // Stats de sesiones marcadas como "Pagadas" manualmente en el mes
  // (distinto de los pagos MP — estas se marcaron con el botón ✓ sin pasar por MP)
  const statsMes = useMemo(() => {
    let totalMarcadas = 0;      // monto que el consultorio recibe de sesiones marcadas
    let cantMarcadas = 0;
    let totalDebe = 0;          // lo que todavia deben (sesiones en estado 'debido')

    for (const s of sesiones) {
      if (s.estadoPago === ESTADOS_PAGO_SESION.PAGADO) {
        totalMarcadas += s.montoConsultorio || 0;
        cantMarcadas += 1;
      } else if (s.estadoPago === ESTADOS_PAGO_SESION.DEBIDO) {
        totalDebe += s.montoConsultorio || 0;
      }
    }

    const totalCombinado = stats.totalRecibido + totalMarcadas;
    return { totalMarcadas, cantMarcadas, totalDebe, totalCombinado };
  }, [sesiones, stats.totalRecibido]);

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
            Ingresos del consultorio por canal de cobro.
          </p>
        </div>
        <SelectorMes mes={mes} setMes={setMes} />
      </header>

      {/* Toggle canal + resumen del mes */}
      <div className="cp-pagos-canal-wrap">
        {/* Toggle MP / Manual / Ambos */}
        <div className="cp-pagos-canal-toggle">
          <button
            type="button"
            className={`cp-pagos-canal-btn ${filtroCanal === 'manual' ? 'cp-pagos-canal-btn--active' : ''}`}
            onClick={() => setFiltroCanal('manual')}
          >
            Pagos manuales
          </button>
          <button
            type="button"
            className={`cp-pagos-canal-btn ${filtroCanal === 'mp' ? 'cp-pagos-canal-btn--active' : ''}`}
            onClick={() => setFiltroCanal('mp')}
          >
            Mercado Pago
          </button>
          <button
            type="button"
            className={`cp-pagos-canal-btn ${filtroCanal === 'ambos' ? 'cp-pagos-canal-btn--active' : ''}`}
            onClick={() => setFiltroCanal('ambos')}
          >
            Ambos
          </button>
        </div>

        {/* Stats según canal seleccionado */}
        <div className="cp-pagos-resumen-mes">
          {(filtroCanal === 'ambos') && (
            <div className="cp-pagos-resumen-mes__card cp-pagos-resumen-mes__card--total">
              <div className="cp-pagos-resumen-mes__label">Total en {nombreDelMes(mes)}</div>
              <div className="cp-pagos-resumen-mes__value">
                {formatoARS.format(statsMes.totalCombinado)}
              </div>
              <div className="cp-pagos-resumen-mes__hint">MP + marcado pagado</div>
            </div>
          )}

          {(filtroCanal === 'mp' || filtroCanal === 'ambos') && (
            <>
              <div className="cp-pagos-resumen-mes__card">
                <div className="cp-pagos-resumen-mes__label">Vía Mercado Pago</div>
                <div className="cp-pagos-resumen-mes__value">
                  {formatoARS.format(stats.totalRecibido)}
                </div>
                <div className="cp-pagos-resumen-mes__hint">
                  {stats.aprobados} pago{stats.aprobados === 1 ? '' : 's'} aprobado{stats.aprobados === 1 ? '' : 's'}
                </div>
              </div>
              <div className="cp-pagos-resumen-mes__card">
                <div className="cp-pagos-resumen-mes__label">Comisión ConsulPay</div>
                <div className="cp-pagos-resumen-mes__value">
                  {formatoARS.format(stats.totalComision)}
                </div>
                <div className="cp-pagos-resumen-mes__hint">descontada antes de acreditar</div>
              </div>
              <div className="cp-pagos-resumen-mes__card">
                <div className="cp-pagos-resumen-mes__label">Cargo Mercado Pago</div>
                <div className="cp-pagos-resumen-mes__value">
                  {formatoARS.format(stats.totalFeeMP)}
                </div>
                <div className="cp-pagos-resumen-mes__hint">
                  {stats.pendientes > 0 && `${stats.pendientes} en proceso · `}tarifa MP
                </div>
              </div>
            </>
          )}

          {(filtroCanal === 'manual' || filtroCanal === 'ambos') && (
            <>
              <div className="cp-pagos-resumen-mes__card cp-pagos-resumen-mes__card--marcado">
                <div className="cp-pagos-resumen-mes__label">Marcado como pagado</div>
                <div className="cp-pagos-resumen-mes__value">
                  {formatoARS.format(statsMes.totalMarcadas)}
                </div>
                <div className="cp-pagos-resumen-mes__hint">
                  {statsMes.cantMarcadas} sesión{statsMes.cantMarcadas === 1 ? '' : 'es'} marcada{statsMes.cantMarcadas === 1 ? '' : 's'}
                </div>
              </div>
              <div className="cp-pagos-resumen-mes__card cp-pagos-resumen-mes__card--debe">
                <div className="cp-pagos-resumen-mes__label">Pendiente de cobro</div>
                <div className="cp-pagos-resumen-mes__value">
                  {formatoARS.format(statsMes.totalDebe)}
                </div>
                <div className="cp-pagos-resumen-mes__hint">sesiones que aún deben</div>
              </div>
            </>
          )}
        </div>

        {stats.pagosSinFeeDetails > 0 && (filtroCanal === 'mp' || filtroCanal === 'ambos') && (
          <p className="cp-pagos-nota-asterisco">
            * Hay {stats.pagosSinFeeDetails} pago{stats.pagosSinFeeDetails === 1 ? '' : 's'} sin desglose
            completo de cargos de Mercado Pago. El total es aproximado.
          </p>
        )}
      </div>

      {stats.pagosSinFeeDetails > 0 && (
        <p className="cp-pagos-nota-asterisco">
          * Hay {stats.pagosSinFeeDetails} pago{stats.pagosSinFeeDetails === 1 ? '' : 's'} sin desglose
          completo de cargos de Mercado Pago (pagos creados antes de esta versión). El total recibido
          de esos pagos es aproximado.
        </p>
      )}

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
        <div className="cp-compact-list cp-table-wrap">
          <table className="cp-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Profesional</th>
                <th className="cp-num-col">Bruto</th>
                <th className="cp-num-col">Comisión</th>
                <th className="cp-num-col">Cargo MP</th>
                <th className="cp-num-col">Recibido</th>
                <th className="cp-num-col" title="Cantidad de registros de sesiones incluidos. Cada registro puede representar 1 o varias sesiones agrupadas.">
                  Registros
                </th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {pagosFiltrados.map((p) => {
                const prof = mapaProfesionales[p.profesionalUid];
                const tieneFee = tieneFeeDetails(p);
                return (
                  <tr
                    key={p.id}
                    className="cp-pagos-row"
                    onClick={() => setPagoSeleccionado(p)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td data-label="Fecha">{formatoFechaCorta(p.createdAt)}</td>
                    <td data-label="Profesional">
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
                    <td data-label="Bruto" className="cp-num">{formatoARS.format(p.montoTotal || 0)}</td>
                    <td data-label="Comisión" className="cp-num" style={{ color: 'var(--cp-text-muted)' }}>
                      −{formatoARS.format(p.montoConsulpay || 0)}
                    </td>
                    <td data-label="Cargo MP" className="cp-num" style={{ color: 'var(--cp-text-muted)' }}>
                      {tieneFee
                        ? `−${formatoARS.format(p.feeMercadoPago || 0)}`
                        : <span style={{ color: 'var(--cp-text-faint)' }}>—</span>}
                    </td>
                    <td data-label="Recibido" className="cp-num" style={{ color: 'var(--cp-success)', fontWeight: 500 }}>
                      {formatoARS.format(montoNetoEfectivo(p))}
                    </td>
                    <td data-label="Registros" className="cp-num">{p.sesionesIds?.length || 0}</td>
                    <td data-label="Estado">
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
  const tieneFee = tieneFeeDetails(pago);
  const netoEfectivo = montoNetoEfectivo(pago);

  const overlayProps = useOverlayClose(onClose);

  return (
    <div className="cp-modal-overlay" {...overlayProps}>
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

          {/* Desglose financiero */}
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
          {tieneFee ? (
            <div>
              <dt>Cargo Mercado Pago</dt>
              <dd style={{ color: 'var(--cp-text-muted)' }}>
                −{formatoARS.format(pago.feeMercadoPago || 0)}
                <span className="cp-detalle-pago__hint"> · tarifa de procesamiento de MP</span>
              </dd>
            </div>
          ) : pago.estado === 'aprobado' && (
            <div>
              <dt>Cargo Mercado Pago</dt>
              <dd style={{ color: 'var(--cp-text-faint)', fontSize: 13 }}>
                No disponible (pago anterior a esta versión)
              </dd>
            </div>
          )}
          <div className="cp-detalle-pago__total">
            <dt>{tieneFee ? 'Recibido en tu cuenta MP' : 'Estimado a recibir*'}</dt>
            <dd>{formatoARS.format(netoEfectivo)}</dd>
          </div>
          {!tieneFee && pago.estado === 'aprobado' && (
            <div>
              <dd style={{ color: 'var(--cp-text-faint)', fontSize: 12, fontStyle: 'italic' }}>
                * Este monto no incluye el descuento del cargo de Mercado Pago. El monto real
                que recibís puede ser un poco menor.
              </dd>
            </div>
          )}

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
            <dt>Registros de sesiones incluidos</dt>
            <dd>
              {pago.sesionesIds?.length || 0} registro{pago.sesionesIds?.length === 1 ? '' : 's'}
              <span className="cp-detalle-pago__hint" style={{ display: 'block', marginTop: 2 }}>
                Cada registro puede representar 1 o varias sesiones agrupadas.
              </span>
            </dd>
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

/* ============================================================
   Selector de mes — mismo componente que en Sesiones
   ============================================================ */
function SelectorMes({ mes, setMes }) {
  function anterior() {
    setMes((m) => {
      const d = new Date(m);
      d.setMonth(d.getMonth() - 1);
      return inicioDeMes(d);
    });
  }
  function siguiente() {
    setMes((m) => {
      const d = new Date(m);
      d.setMonth(d.getMonth() + 1);
      return inicioDeMes(d);
    });
  }
  const esEsteMes = inicioDeMes(new Date()).getTime() === mes.getTime();

  return (
    <div className="cp-mes-selector">
      <button
        type="button"
        className="cp-mes-selector__btn"
        onClick={anterior}
        aria-label="Mes anterior"
      >
        ‹
      </button>
      <span className="cp-mes-selector__label">
        {nombreDelMes(mes)}
      </span>
      <button
        type="button"
        className="cp-mes-selector__btn"
        onClick={siguiente}
        disabled={esEsteMes}
        aria-label="Mes siguiente"
      >
        ›
      </button>
    </div>
  );
}
