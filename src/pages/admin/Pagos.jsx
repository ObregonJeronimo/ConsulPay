import { useEffect, useMemo, useState } from 'react';

import Avatar from '../../components/ui/Avatar.jsx';
import DualScrollTable from '../../components/ui/DualScrollTable.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Spinner from '../../components/ui/Spinner.jsx';

import { useAuth } from '../../hooks/useAuth.js';
import { useConsultorio } from '../../hooks/useConsultorio.js';
import { useDatosPagos } from '../../hooks/useDatosPagos.js';
import { useOverlayClose } from '../../hooks/useOverlayClose.js';
import { formatoARS } from '../../lib/constants.js';
import IngresosPorMes from './IngresosPorMes.jsx';
import LibroCaja from './LibroCaja.jsx';
import ResumenPagos from './ResumenPagos.jsx';
import { mpHabilitado } from '../../lib/mpIntegracion.js';
import {
  labelEstadoPago,
  montoNetoEfectivo,
  tieneFeeDetails,
  tonoEstadoPago,
} from '../../lib/pagos.js';
import {
  finDeMes,
  inicioDeMes,
  nombreDelMes,
} from '../../lib/sesiones.js';

import './Pagos.css';

/* ============================================================
   Helpers
   ============================================================ */
function nombreVisible(p, fallback) {
  if (!p) return fallback || '—';
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
  const { consultorio } = useConsultorio();
  const consultorioId = user?.consultorioId;

  /* Todo lo que usan las pestanas se pide una sola vez aca: cambiar de
     pestana no vuelve a leer Firestore (ver useDatosPagos). */
  const datos = useDatosPagos(consultorioId);
  const { pagos, pacientes } = datos;
  const loading = !datos.pagosListos;
  const [filtroEstado, setFiltroEstado] = useState('todos');
  /* Arranca en el Resumen: es la unica vista que contesta "como venimos"
     de un vistazo, con el anio entero. Las otras son para bajar al detalle.
       resumen     -> el anio mes a mes (ResumenPagos)
       movimientos -> el libro de caja de un mes (LibroCaja)
       cobros      -> que se cobro cada mes y de que sesiones (IngresosPorMes)
       mp          -> pagos por Mercado Pago, solo si MP esta habilitado
     "Pagos manuales" y "Ambos" se fueron: la primera listaba pagos de MP
     (sin MP quedaba siempre vacia) y sus dos cifras utiles — lo cobrado y
     lo pendiente — ahora estan en el Resumen. */
  const [vista, setVista] = useState('resumen');
  // MP solo se ofrece si TODOS los admins vincularon su cuenta. Ver
  // mpHabilitado(): con una sola conectada los cobros del mes que le toca
  // a la otra no tienen destino, asi que la opcion no debe existir.
  const mpActivo = mpHabilitado(consultorio);

  // Si MP se desvincula estando parado en esa pestana, la vista quedaria
  // mostrando un canal que ya no existe. Se vuelve al Resumen.
  useEffect(() => {
    if (!mpActivo && vista === 'mp') setVista('resumen');
  }, [mpActivo, vista]);

  /* Un solo periodo para todas las vistas: el Resumen mira el anio de este
     mes y Movimientos el mes. Asi "Ver movimientos de julio" desde el
     Resumen y volver no pierde el anio, y cambiar de anio en el Resumen
     deja Movimientos parado en ese mismo anio. */
  const [mes, setMes] = useState(() => inicioDeMes(new Date()));
  const anio = mes.getFullYear();
  const [pagoSeleccionado, setPagoSeleccionado] = useState(null);

  // Los miembros incluyen a los profesionales (y a los admins, que no molestan
  // en un mapa por uid): antes era una suscripcion aparte solo para esto.
  const mapaProfesionales = useMemo(() => {
    const m = {};
    for (const p of datos.miembros) m[p.uid] = p;
    return m;
  }, [datos.miembros]);

  const mapaPacientes = useMemo(() => {
    const m = {};
    for (const p of pacientes) m[p.id] = p;
    return m;
  }, [pacientes]);

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


  /* ---- Renders ---- */

  const SUBTITULOS = {
    resumen: 'Cómo viene el consultorio, mes a mes.',
    movimientos: 'Cada peso que entró y salió en el mes, por caja.',
    cobros: 'Qué cobró el consultorio cada mes, de qué profesional y de qué sesiones.',
    mp: 'Cobros por Mercado Pago del mes, con el cargo de MP descontado.',
  };
  const PESTANAS = [
    ['resumen', 'Resumen'],
    ['movimientos', 'Movimientos'],
    ['cobros', 'Cobros por mes'],
    ...(mpActivo ? [['mp', 'Mercado Pago']] : []),
  ];
  // Resumen y Cobros recorren el anio; Movimientos y MP, un mes.
  const porAnio = vista === 'resumen' || vista === 'cobros';

  return (
    <div className="cp-pagos-admin">
      <header className="cp-page-header">
        <div>
          <h1 className="cp-page-title">Pagos</h1>
          <p className="cp-page-sub">{SUBTITULOS[vista]}</p>
        </div>
        {porAnio
          ? <SelectorAnio mes={mes} setMes={setMes} />
          : <SelectorMes mes={mes} setMes={setMes} />}
      </header>

      <div className="cp-pagos-canal-wrap">
        <div className="cp-pagos-canal-toggle" role="tablist" aria-label="Vistas de pagos">
          {PESTANAS.map(([id, txt]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={vista === id}
              className={`cp-pagos-canal-btn ${vista === id ? 'cp-pagos-canal-btn--active' : ''}`}
              onClick={() => setVista(id)}
            >
              {txt}
            </button>
          ))}
        </div>
      </div>

      {vista === 'resumen' && (
        <ResumenPagos
          consultorioId={consultorioId}
          consultorio={consultorio}
          datos={datos}
          anio={anio}
          onVerMes={(m) => { setMes(new Date(anio, m, 1)); setVista('movimientos'); }}
        />
      )}

      {vista === 'movimientos' && (
        <LibroCaja
          consultorioId={consultorioId}
          consultorio={consultorio}
          datos={datos}
          uid={user?.uid}
          mes={mes}
        />
      )}

      {vista === 'cobros' && (
        <IngresosPorMes
          consultorioId={consultorioId}
          uid={user?.uid}
          datos={datos}
          anio={anio}
          mapaProfesionales={mapaProfesionales}
          mapaPacientes={mapaPacientes}
        />
      )}

      {vista === 'mp' && (loading && pagos.length === 0 ? (
        <div style={{ padding: 60, display: 'flex', justifyContent: 'center' }}>
          <Spinner size={24} label="Cargando pagos…" />
        </div>
      ) : (
      <>
      <div className="cp-pagos-resumen-mes">
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
          <div className="cp-pagos-resumen-mes__label">Cargo Mercado Pago</div>
          <div className="cp-pagos-resumen-mes__value">
            {formatoARS.format(stats.totalFeeMP)}
          </div>
          <div className="cp-pagos-resumen-mes__hint">
            {stats.pendientes > 0 && `${stats.pendientes} en proceso · `}tarifa MP
          </div>
        </div>
      </div>

      {stats.pagosSinFeeDetails > 0 && (
        <p className="cp-pagos-nota-asterisco">
          * Hay {stats.pagosSinFeeDetails} pago{stats.pagosSinFeeDetails === 1 ? '' : 's'} sin desglose
          completo de cargos de Mercado Pago. El total es aproximado.
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
        <DualScrollTable className="cp-compact-list">
          <table className="cp-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Profesional</th>
                <th className="cp-num-col">Bruto</th>
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

                    {/* Mobile: fila compacta */}
                    <td className="cp-td-mobile-main">
                      <div className="cp-row-mobile__top">
                        <div className="cp-prof-cell">
                          <Avatar initials={inicialesProfesional(prof)} size={26} />
                          <div className="cp-prof-name">{nombreVisible(prof)}</div>
                        </div>
                      </div>
                      <div className="cp-row-mobile__mid">
                        {formatoFechaCorta(p.createdAt)}
                        {' · '}
                        {p.sesionesIds?.length || 0} registro{(p.sesionesIds?.length || 0) === 1 ? '' : 's'}
                      </div>
                      <div className="cp-row-mobile__bot">
                        Recibido: {formatoARS.format(montoNetoEfectivo(p))}
                      </div>
                    </td>
                    <td className="cp-td-mobile-badge">
                      <Badge tone={tonoEstadoPago(p.estado)}>
                        {labelEstadoPago(p.estado)}
                      </Badge>
                    </td>
                    <td className="cp-td-mobile-actions" />
                  </tr>
                );
              })}
            </tbody>
          </table>
        </DualScrollTable>
      )}
      </>
      ))}

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
    <div className="cp-mes-selector cp-pagos-periodo">
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
      {!esEsteMes && (
        <button type="button" className="cp-mes-selector__hoy" onClick={() => setMes(inicioDeMes(new Date()))}>
          Hoy
        </button>
      )}
    </div>
  );
}

/**
 * Mismo control que el de mes, pero de a un anio. Mueve el mismo `mes` que
 * usa Movimientos (ver PagosAdmin): pasar a otro anio deja el mismo mes del
 * calendario, salvo que en el anio en curso ese mes todavia no haya llegado.
 */
function SelectorAnio({ mes, setMes }) {
  const hoy = new Date();
  const anio = mes.getFullYear();
  const esEsteAnio = anio === hoy.getFullYear();

  function ir(a) {
    const m = a === hoy.getFullYear() ? Math.min(mes.getMonth(), hoy.getMonth()) : mes.getMonth();
    setMes(new Date(a, m, 1));
  }

  return (
    <div className="cp-mes-selector cp-pagos-periodo">
      <button type="button" className="cp-mes-selector__btn" onClick={() => ir(anio - 1)} aria-label="Año anterior">
        ‹
      </button>
      <span className="cp-mes-selector__label">{anio}</span>
      <button
        type="button"
        className="cp-mes-selector__btn"
        onClick={() => ir(anio + 1)}
        disabled={esEsteAnio}
        aria-label="Año siguiente"
      >
        ›
      </button>
      {!esEsteAnio && (
        <button type="button" className="cp-mes-selector__hoy" onClick={() => setMes(inicioDeMes(new Date()))}>
          Hoy
        </button>
      )}
    </div>
  );
}
