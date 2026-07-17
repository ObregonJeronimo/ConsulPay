import { useEffect, useMemo, useState } from 'react';

import Avatar from '../../components/ui/Avatar.jsx';
import DualScrollTable from '../../components/ui/DualScrollTable.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import Spinner from '../../components/ui/Spinner.jsx';

import { useAuth } from '../../hooks/useAuth.js';
import { useConsultorio } from '../../hooks/useConsultorio.js';
import { ESTADOS_PAGO_SESION, ESTADOS_SOLICITUD_SESION, TIPOS_SOLICITUD_SESION, formatoARS } from '../../lib/constants.js';
import { suscribirPacientesProfesional } from '../../lib/pacientes.js';
import {
  iniciarPagoAlConsultorio,
  labelEstadoPago,
  suscribirPagosDelProfesional,
  tonoEstadoPago,
} from '../../lib/pagos.js';
import { calcularDeudaProfesional, retirarProfesional } from '../../lib/profesionales.js';
import {
  finDeMes,
  inicioDeMes,
  nombreDelMes,
  suscribirSesionesProfesional,
} from '../../lib/sesiones.js';
import {
  solicitarMarcarPagada,
  suscribirSolicitudesDelProfesional,
} from '../../lib/solicitudes.js';

import './MisPagos.css';

/* ============================================================
   Helpers
   ============================================================ */
function nombrePaciente(p) {
  if (!p) return '—';
  return `${p.apellido ?? ''}${p.apellido && p.nombre ? ', ' : ''}${p.nombre ?? ''}`;
}
function inicialesPaciente(p) {
  if (!p) return '·';
  return ((p.apellido?.[0] ?? '') + (p.nombre?.[0] ?? '')).toUpperCase() || '·';
}
function formatoFechaCorta(date) {
  if (!date) return '—';
  const d = date.toDate ? date.toDate() : new Date(date);
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
}

/* ============================================================
   Pagina principal
   ============================================================ */
export default function MisPagos() {
  const { user, signOut } = useAuth();
  const { consultorio, loading: loadingConsultorio } = useConsultorio();

  const [sesiones, setSesiones] = useState([]);
  const [pacientes, setPacientes] = useState([]);
  const [pagos, setPagos] = useState([]);
  const [solicitudes, setSolicitudes] = useState([]);
  const [loadingSesiones, setLoadingSesiones] = useState(true);
  const [mes, setMes] = useState(() => inicioDeMes(new Date()));

  const [seleccionadas, setSeleccionadas] = useState(new Set());
  const [modoSeleccion, setModoSeleccion] = useState(false);
  const [modoSeleccionManual, setModoSeleccionManual] = useState(false);
  const [seleccionadasManual, setSeleccionadasManual] = useState(new Set());

  const [iniciando, setIniciando] = useState(false);
  const [enviandoSolicitud, setEnviandoSolicitud] = useState(false);
  const [error, setError] = useState('');

  const [openSalir, setOpenSalir] = useState(false);

  /* ---- Suscripciones live ---- */

  useEffect(() => {
    if (!user?.uid || !user?.consultorioId) return;
    setLoadingSesiones(true);
    const unsub = suscribirSesionesProfesional(
      user.uid,
      user.consultorioId,
      (data) => {
        setSesiones(data);
        setLoadingSesiones(false);
      },
    );
    return unsub;
  }, [user?.uid, user?.consultorioId]);

  useEffect(() => {
    if (!user?.uid || !user?.consultorioId) return;
    return suscribirPacientesProfesional(user.uid, user.consultorioId, setPacientes);
  }, [user?.uid, user?.consultorioId]);

  useEffect(() => {
    if (!user?.uid || !user?.consultorioId) return;
    return suscribirSolicitudesDelProfesional(user.consultorioId, user.uid, setSolicitudes);
  }, [user?.uid, user?.consultorioId]);

  useEffect(() => {
    if (!user?.uid || !user?.consultorioId) return;
    return suscribirPagosDelProfesional(user.uid, user.consultorioId, setPagos);
  }, [user?.uid, user?.consultorioId]);

  const mapaPacientes = useMemo(() => {
    const m = {};
    for (const p of pacientes) m[p.id] = p;
    return m;
  }, [pacientes]);

  /* ---- Calculos derivados ---- */

  const sesionesDelMes = useMemo(() => {
    const desde = inicioDeMes(mes).getTime();
    const hasta = finDeMes(mes).getTime();
    return sesiones.filter((s) => {
      const t = s.fecha?.toDate ? s.fecha.toDate().getTime()
        : s.fecha?.seconds ? s.fecha.seconds * 1000 : 0;
      return t >= desde && t <= hasta;
    });
  }, [sesiones, mes]);

  const sesionesDebidas = useMemo(
    () => sesionesDelMes.filter((s) => s.estadoPago === ESTADOS_PAGO_SESION.DEBIDO),
    [sesionesDelMes],
  );

  const deudaTotal = useMemo(
    () => sesionesDebidas.reduce((acc, s) => acc + (s.montoConsultorio || 0), 0),
    [sesionesDebidas],
  );

  const subtotalSeleccionado = useMemo(() => {
    if (!modoSeleccion) return deudaTotal;
    return sesionesDebidas
      .filter((s) => seleccionadas.has(s.id))
      .reduce((acc, s) => acc + (s.montoConsultorio || 0), 0);
  }, [modoSeleccion, seleccionadas, sesionesDebidas, deudaTotal]);

  const sesionesIdsParaPagar = useMemo(() => {
    if (modoSeleccion) {
      return sesionesDebidas
        .filter((s) => seleccionadas.has(s.id))
        .map((s) => s.id);
    }
    return sesionesDebidas.map((s) => s.id);
  }, [modoSeleccion, seleccionadas, sesionesDebidas]);

  const pagosFiltrados = useMemo(() => {
    return pagos.filter((p) => p.estado !== 'rechazado' || p.mpPaymentId);
  }, [pagos]);

  // Realtime: solicitudes de marcar_pagada pendientes en el mes actual.
  // TODOS los useMemo/useState/useEffect deben ir ANTES de cualquier return.
  const hayPendienteManual = useMemo(() => {
    const desde = inicioDeMes(mes).getTime();
    const hasta = finDeMes(mes).getTime();
    return solicitudes.some((s) =>
      s.tipo === TIPOS_SOLICITUD_SESION.MARCAR_PAGADA &&
      s.estado === ESTADOS_SOLICITUD_SESION.PENDIENTE &&
      (() => {
        const t = s.createdAt?.toDate ? s.createdAt.toDate().getTime()
          : s.createdAt?.seconds ? s.createdAt.seconds * 1000 : 0;
        return t >= desde && t <= hasta;
      })()
    );
  }, [solicitudes, mes]);

  const puedeMarcarPagadas = !!user?.permitirMarcarPagadas;
  const mpDeshabilitado = !consultorio?.mpIntegrado;

  /* ---- Handlers ---- */

  function toggleSesion(id) {
    setSeleccionadas((prev) => {
      const nuevo = new Set(prev);
      if (nuevo.has(id)) nuevo.delete(id);
      else nuevo.add(id);
      return nuevo;
    });
  }

  function toggleSeleccionarTodas() {
    if (seleccionadas.size === sesionesDebidas.length) {
      setSeleccionadas(new Set());
    } else {
      setSeleccionadas(new Set(sesionesDebidas.map((s) => s.id)));
    }
  }

  function entrarModoSeleccion() {
    setModoSeleccion(true);
    setSeleccionadas(new Set());
  }

  function salirModoSeleccion() {
    setModoSeleccion(false);
    setSeleccionadas(new Set());
  }

  async function handlePagar() {
    setError('');
    if (sesionesIdsParaPagar.length === 0) {
      setError(modoSeleccion
        ? 'Elegí al menos una sesión para pagar.'
        : 'No tenés sesiones debidas para pagar.');
      return;
    }
    if (!consultorio?.mpIntegrado) {
      setError('El método de pago está deshabilitado. Contactá al dueño del consultorio.');
      return;
    }
    setIniciando(true);
    try {
      await iniciarPagoAlConsultorio({
        consultorioId: user.consultorioId,
        sesionesIds: sesionesIdsParaPagar,
      });
    } catch (err) {
      setIniciando(false);
      const detalleMP = err.detalle?.detalleMP;
      let mensaje = err.message || 'No se pudo iniciar el pago.';
      if (detalleMP?.message) {
        mensaje += ` (MP: ${detalleMP.message})`;
      }
      setError(mensaje);
    }
  }

  async function handlePagarManual(sesionIds) {
    if (!sesionIds?.length || !puedeMarcarPagadas) return;
    setEnviandoSolicitud(true);
    try {
      await Promise.all(sesionIds.map((id) => {
        const s = sesiones.find((x) => x.id === id);
        if (!s) return;
        const pac = mapaPacientes[s.pacienteId];
        return solicitarMarcarPagada({
          consultorioId: user.consultorioId,
          profesionalUid: user.uid,
          profesionalNombre: user.displayName || user.email || '',
          sesionId: id,
          sesionSnapshot: {
            pacienteNombre: pac ? nombrePaciente(pac) : (s.pacienteNombre || ''),
            fecha: s.fecha,
            metodoPagoNombre: s.metodoPagoNombre || '',
            valorTotal: s.valorTotal || 0,
            porcentajeConsultorio: s.porcentajeConsultorio ?? null,
            montoConsultorio: s.montoConsultorio ?? null,
            montoProfesional: s.montoProfesional ?? null,
          },
          receptor: { uid: user.uid, nombre: user.displayName || user.email || user.uid },
        });
      }));
      setModoSeleccionManual(false);
      setSeleccionadasManual(new Set());
    } catch (err) {
      setError(err.message || 'No se pudo enviar la solicitud.');
    } finally {
      setEnviandoSolicitud(false);
    }
  }

  /* ---- Render ---- */

  if (loadingConsultorio) {
    return (
      <div className="cp-mis-pagos">
        <div style={{ padding: 60, display: 'flex', justifyContent: 'center' }}>
          <Spinner size={24} />
        </div>
      </div>
    );
  }

  return (
    <div className="cp-mis-pagos">
      <header className="cp-page-header">
        <div>
          <h1 className="cp-page-title">Mis pagos al consultorio</h1>
          <p className="cp-page-sub">
            Saldá tu deuda con el consultorio cuando quieras. Los pagos se procesan
            por Mercado Pago.
          </p>
        </div>
      </header>

      {error && (
        <div className="cp-config-error" role="alert">{error}</div>
      )}

      {/* Selector de mes */}
      <div className="cp-mispagos-mes">
        <button className="cp-mes-selector__btn" onClick={() => setMes((m) => { const d = new Date(m); d.setMonth(d.getMonth() - 1); return inicioDeMes(d); })}>‹</button>
        <span className="cp-mes-selector__label">{nombreDelMes(mes)}</span>
        <button className="cp-mes-selector__btn" onClick={() => setMes((m) => { const d = new Date(m); d.setMonth(d.getMonth() + 1); return inicioDeMes(d); })} disabled={inicioDeMes(new Date()).getTime() === mes.getTime()}>›</button>
      </div>

      {/* Recuadro 1: Mercado Pago */}
      <section className={`cp-pagos-recuadro ${mpDeshabilitado ? 'cp-pagos-recuadro--disabled' : ''}`}>
        <div className="cp-pagos-recuadro__header">
          <span className="cp-pagos-recuadro__titulo">Pagos con Mercado Pago</span>
          {mpDeshabilitado && (
            <span className="cp-pagos-recuadro__badge-off">Pagos online deshabilitados</span>
          )}
        </div>
        <div className="cp-pagos-recuadro__body">
          <div className="cp-deuda-card__monto" style={{ marginBottom: 6 }}>
            {formatoARS.format(modoSeleccion ? subtotalSeleccionado : deudaTotal)}
          </div>
          <div className="cp-deuda-card__hint" style={{ marginBottom: 16 }}>
            {sesionesDebidas.length === 0
              ? 'No tenés pacientes pendientes en este mes'
              : modoSeleccion
                ? seleccionadas.size === 0
                  ? `Elegí cuáles de los ${sesionesDebidas.length} pacientes`
                  : `${seleccionadas.size} de ${sesionesDebidas.length} pacientes seleccionados`
                : `${sesionesDebidas.length} paciente${sesionesDebidas.length === 1 ? '' : 's'} pendiente${sesionesDebidas.length === 1 ? '' : 's'}`}
          </div>
          {sesionesDebidas.length > 0 && (
            <div className="cp-pagos-recuadro__actions">
              {!modoSeleccion ? (
                <>
                  {sesionesDebidas.length > 1 && (
                    <Button variant="secondary" onClick={entrarModoSeleccion} disabled={mpDeshabilitado || iniciando}>
                      Elegir cuáles pagar
                    </Button>
                  )}
                  <Button variant="primary" onClick={handlePagar} disabled={mpDeshabilitado || iniciando}>
                    {iniciando ? <><Spinner size={14} /> Redirigiendo…</> : `Pagar ${formatoARS.format(deudaTotal)}`}
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="secondary" onClick={salirModoSeleccion} disabled={iniciando}>Cancelar</Button>
                  <Button variant="primary" onClick={handlePagar} disabled={mpDeshabilitado || iniciando || seleccionadas.size === 0}>
                    {iniciando ? <><Spinner size={14} /> Redirigiendo…</> : seleccionadas.size === 0 ? 'Elegí pacientes' : `Pagar ${formatoARS.format(subtotalSeleccionado)}`}
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Recuadro 2: Pagos manuales */}
      <section className={`cp-pagos-recuadro ${!puedeMarcarPagadas ? 'cp-pagos-recuadro--disabled' : ''}`}>
        <div className="cp-pagos-recuadro__header">
          <span className="cp-pagos-recuadro__titulo">Pagos manuales</span>
          {!puedeMarcarPagadas && (
            <span className="cp-pagos-recuadro__badge-off">Sin permiso para marcar pagadas</span>
          )}
        </div>
        <div className="cp-pagos-recuadro__body">
          <div className="cp-deuda-card__hint" style={{ marginBottom: 16 }}>
            {sesionesDebidas.length === 0
              ? 'No hay sesiones pendientes en este mes'
              : hayPendienteManual
                ? 'Solicitud pendiente de aprobación por el administrador'
                : modoSeleccionManual
                  ? seleccionadasManual.size === 0
                    ? `Elegí cuáles de los ${sesionesDebidas.length} pacientes`
                    : `${seleccionadasManual.size} de ${sesionesDebidas.length} pacientes seleccionados`
                  : `Marcar ${sesionesDebidas.length} sesión${sesionesDebidas.length === 1 ? '' : 'es'} como pagadas manualmente`}
          </div>
          {sesionesDebidas.length > 0 && !hayPendienteManual && (
            <div className="cp-pagos-recuadro__actions">
              {!modoSeleccionManual ? (
                <>
                  {sesionesDebidas.length > 1 && (
                    <Button variant="secondary" onClick={() => setModoSeleccionManual(true)} disabled={!puedeMarcarPagadas || enviandoSolicitud}>
                      Elegir cuáles pagar
                    </Button>
                  )}
                  <Button variant="primary" onClick={() => handlePagarManual(sesionesDebidas.map((s) => s.id))} disabled={!puedeMarcarPagadas || enviandoSolicitud}>
                    {enviandoSolicitud ? <><Spinner size={14} /> Enviando…</> : `Solicitar pagar ${formatoARS.format(deudaTotal)}`}
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="secondary" onClick={() => { setModoSeleccionManual(false); setSeleccionadasManual(new Set()); }} disabled={enviandoSolicitud}>Cancelar</Button>
                  <Button variant="primary" onClick={() => handlePagarManual([...seleccionadasManual])} disabled={!puedeMarcarPagadas || enviandoSolicitud || seleccionadasManual.size === 0}>
                    {enviandoSolicitud ? <><Spinner size={14} /> Enviando…</> : seleccionadasManual.size === 0 ? 'Elegí pacientes' : `Solicitar pagar ${seleccionadasManual.size}`}
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Lista de sesiones debidas */}
      {loadingSesiones ? (
        <div style={{ padding: 40, display: 'flex', justifyContent: 'center' }}>
          <Spinner size={20} label="Cargando sesiones…" />
        </div>
      ) : sesionesDebidas.length > 0 && (
        <section className="cp-debe-section">
          <div className="cp-debe-section__head">
            <h2 className="cp-debe-section__title">Sesiones a pagar — {nombreDelMes(mes)}</h2>
            {(modoSeleccion || modoSeleccionManual) && (
              <button
                type="button"
                className="cp-debe-section__select-all"
                onClick={() => {
                  if (modoSeleccion) toggleSeleccionarTodas();
                  else {
                    setSeleccionadasManual((prev) =>
                      prev.size === sesionesDebidas.length
                        ? new Set()
                        : new Set(sesionesDebidas.map((s) => s.id))
                    );
                  }
                }}
              >
                {(modoSeleccion ? seleccionadas : seleccionadasManual).size === sesionesDebidas.length
                  ? 'Deseleccionar todas'
                  : 'Seleccionar todas'}
              </button>
            )}
          </div>
          <DualScrollTable className="cp-compact-list">
            <table className="cp-table cp-debe-tabla">
              <thead>
                <tr>
                  {(modoSeleccion || modoSeleccionManual) && <th aria-label="Seleccionar" style={{ width: 40 }} />}
                  <th>Fecha</th>
                  <th>Paciente</th>
                  <th>Método</th>
                  <th className="cp-num-col">Mi parte</th>
                  <th className="cp-num-col">Al consultorio</th>
                </tr>
              </thead>
              <tbody>
                {sesionesDebidas.map((s) => {
                  const pac = mapaPacientes[s.pacienteId];
                  const seleccionada = seleccionadas.has(s.id);
                  return (
                    <tr
                      key={s.id}
                      className={(modoSeleccion && seleccionada) || (modoSeleccionManual && seleccionadasManual.has(s.id)) ? 'cp-debe-tabla__row--selected' : ''}
                      onClick={modoSeleccion ? () => toggleSesion(s.id) : modoSeleccionManual ? () => setSeleccionadasManual((prev) => { const n = new Set(prev); n.has(s.id) ? n.delete(s.id) : n.add(s.id); return n; }) : undefined}
                      style={(modoSeleccion || modoSeleccionManual) ? { cursor: 'pointer' } : undefined}
                    >
                      {modoSeleccion && (
                        <td>
                          <input type="checkbox" checked={seleccionada} onChange={() => toggleSesion(s.id)} onClick={(e) => e.stopPropagation()} />
                        </td>
                      )}
                      {modoSeleccionManual && (
                        <td>
                          <input
                            type="checkbox"
                            checked={seleccionadasManual.has(s.id)}
                            onChange={() => setSeleccionadasManual((prev) => { const n = new Set(prev); n.has(s.id) ? n.delete(s.id) : n.add(s.id); return n; })}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </td>
                      )}
                      <td data-label="Fecha">{formatoFechaCorta(s.fecha)}</td>
                      <td data-label="Paciente">
                        {pac ? (
                          <div className="cp-prof-cell">
                            <Avatar initials={inicialesPaciente(pac)} size={26} />
                            <span style={{ fontSize: 13.5 }}>{nombrePaciente(pac)}</span>
                          </div>
                        ) : <span style={{ color: 'var(--cp-text-muted)', fontSize: 13 }}>{s.pacienteNombre || '—'}</span>}
                      </td>
                      <td data-label="Método" style={{ fontSize: 13 }}>{s.metodoPagoNombre}</td>
                      <td data-label="Mi parte" className="cp-num" style={{ color: 'var(--cp-success)' }}>
                        {formatoARS.format(s.montoProfesional)}
                      </td>
                      <td data-label="Al consultorio" className="cp-num" style={{ color: 'var(--cp-accent)' }}>
                        {formatoARS.format(s.montoConsultorio)}
                      </td>

                      {/* Mobile: fila compacta */}
                      <td className="cp-td-mobile-main">
                        <div className="cp-row-mobile__top">
                          {pac ? (
                            <div className="cp-prof-cell">
                              <Avatar initials={inicialesPaciente(pac)} size={26} />
                              <div className="cp-prof-name">{nombrePaciente(pac)}</div>
                            </div>
                          ) : <span style={{ color: 'var(--cp-text-muted)', fontSize: 13 }}>{s.pacienteNombre || '—'}</span>}
                        </div>
                        <div className="cp-row-mobile__mid">
                          {formatoFechaCorta(s.fecha)} · {s.metodoPagoNombre}
                        </div>
                        <div className="cp-row-mobile__bot">
                          Mi parte: {formatoARS.format(s.montoProfesional)}
                          {' · '}
                          Consultorio: {formatoARS.format(s.montoConsultorio)}
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
        </section>
      )}

      {/* Historial de pagos previos */}
      {pagosFiltrados.length > 0 && (
        <section className="cp-historial-section">
          <h2 className="cp-historial-section__title">Historial de pagos</h2>
          <DualScrollTable className="cp-compact-list">
            <table className="cp-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th className="cp-num-col">Monto pagado</th>
                  <th className="cp-num-col">Sesiones</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {pagosFiltrados.map((p) => (
                  <tr key={p.id}>
                    <td data-label="Fecha">{formatoFechaCorta(p.createdAt)}</td>
                    <td data-label="Monto pagado" className="cp-num">{formatoARS.format(p.montoTotal || 0)}</td>
                    <td data-label="Sesiones" className="cp-num">{p.sesionesIds?.length || 0}</td>
                    <td data-label="Estado">
                      <Badge tone={tonoEstadoPago(p.estado)}>
                        {labelEstadoPago(p.estado)}
                      </Badge>
                    </td>

                    {/* Mobile: fila compacta */}
                    <td className="cp-td-mobile-main">
                      <div className="cp-row-mobile__top">
                        <span style={{ fontWeight: 500 }}>{formatoARS.format(p.montoTotal || 0)}</span>
                      </div>
                      <div className="cp-row-mobile__mid">
                        {formatoFechaCorta(p.createdAt)}
                        {' · '}
                        {p.sesionesIds?.length || 0} paciente{(p.sesionesIds?.length || 0) === 1 ? '' : 's'}
                      </div>
                    </td>
                    <td className="cp-td-mobile-badge">
                      <Badge tone={tonoEstadoPago(p.estado)}>
                        {labelEstadoPago(p.estado)}
                      </Badge>
                    </td>
                    <td className="cp-td-mobile-actions" />
                  </tr>
                ))}
              </tbody>
            </table>
          </DualScrollTable>
        </section>
      )}

      {openSalir && (
        <SalirConsultorioModal
          consultorioId={user.consultorioId}
          consultorioNombre={consultorio?.nombre || 'el consultorio'}
          uid={user.uid}
          onCancelar={() => setOpenSalir(false)}
          onCompletado={async () => {
            await signOut();
          }}
        />
      )}
    </div>
  );
}

/* ============================================================
   Modal de auto-retiro
   ============================================================ */
function SalirConsultorioModal({ consultorioId, consultorioNombre, uid, onCancelar, onCompletado }) {
  const [deuda, setDeuda] = useState(null);
  const [cargandoDeuda, setCargandoDeuda] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const d = await calcularDeudaProfesional(consultorioId, uid);
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
  }, [consultorioId, uid]);

  async function handleSalir() {
    setError('');
    setSubmitting(true);
    try {
      await retirarProfesional({
        uid,
        consultorioId,
        esAutoRetiro: true,
      });
      onCompletado();
    } catch (err) {
      setError(err.message || 'No se pudo salir del consultorio.');
      setSubmitting(false);
    }
  }

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

        <h2 className="cp-modal__title">¿Salir de {consultorioNombre}?</h2>
        <div className="cp-modal__sub">
          Vas a perder el acceso al panel del consultorio. Tus sesiones, pacientes
          y registros se mantienen guardados, pero no vas a poder iniciar sesión
          ni crear nuevas sesiones desde acá.
          {' '}Si querés volver más adelante, el administrador del consultorio
          tendrá que invitarte de nuevo.

          {cargandoDeuda ? (
            <div style={{ marginTop: 16, color: 'var(--cp-text-faint)', fontSize: 13 }}>
              Calculando deuda…
            </div>
          ) : tieneDeuda ? (
            <div className="cp-retiro-deuda-aviso">
              <strong>No podés salir mientras tengas deuda pendiente.</strong>
              {' '}Tenés <strong>{deuda.cantidad} sesión{deuda.cantidad === 1 ? '' : 'es'}</strong>{' '}
              sin pagar al consultorio por un total de{' '}
              <strong>${deuda.total.toLocaleString('es-AR')}</strong>.
              {' '}Saldá la deuda con el administrador y volvé a intentar, o
              pedile al admin que te retire desde su lado.
            </div>
          ) : (
            <div className="cp-retiro-deuda-ok">
              ✓ No tenés deuda pendiente con el consultorio. Podés salir tranquilo.
            </div>
          )}
        </div>

        {error && <div className="cp-modal__error">{error}</div>}

        <div className="cp-modal__actions">
          <Button variant="secondary" type="button" onClick={onCancelar} disabled={submitting}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            type="button"
            onClick={handleSalir}
            disabled={submitting || cargandoDeuda || tieneDeuda}
          >
            {submitting ? <><Spinner size={14} /> Saliendo…</> : 'Salir del consultorio'}
          </Button>
        </div>
      </div>
    </div>
  );
}
