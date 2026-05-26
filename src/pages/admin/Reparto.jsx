import { useEffect, useMemo, useState } from 'react';

import Spinner from '../../components/ui/Spinner.jsx';
import Button from '../../components/ui/Button.jsx';

import { useAuth } from '../../hooks/useAuth.js';
import { useConsultorio } from '../../hooks/useConsultorio.js';
import { ESTADOS_PAGO_SESION, formatoARS } from '../../lib/constants.js';
import { suscribirMiembrosConsultorio, suscribirProfesionales } from '../../lib/profesionales.js';
import {
  finDeMes,
  inicioDeMes,
  nombreDelMes,
  suscribirSesionesConsultorio,
} from '../../lib/sesiones.js';
import {
  ESTADOS_COMPENSACION,
  cerrarCiclo,
  confirmarRecibida,
  formatearPeriodoCiclo,
  generarUrlTransferenciaMP,
  marcarTransferida,
  recalcularCompensacion,
  requiereAccionDelUsuario,
  suscribirCompensaciones,
} from '../../lib/compensaciones.js';

import './Reparto.css';

/* ============================================================
   Helpers locales
   ============================================================ */

function nombreVisible(u) {
  if (!u) return null;
  return u.displayName || u.email || `Usuario ${u.uid?.slice(0, 6)}`;
}

function formatoFechaCorta(date) {
  if (!date) return '—';
  const d = date?.toDate ? date.toDate() : (date instanceof Date ? date : new Date(date));
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function calcularRangoCicloActual() {
  // Reproduce calcularRangoDelCiclo del helper backend (no podemos
  // importar el de api/_lib desde frontend porque es server-only).
  const fecha = new Date();
  const dia = fecha.getDate();
  let desde, hasta;
  if (dia >= 15) {
    desde = new Date(fecha.getFullYear(), fecha.getMonth(), 15, 0, 0, 0);
    hasta = new Date(fecha.getFullYear(), fecha.getMonth() + 1, 14, 23, 59, 59);
  } else {
    desde = new Date(fecha.getFullYear(), fecha.getMonth() - 1, 15, 0, 0, 0);
    hasta = new Date(fecha.getFullYear(), fecha.getMonth(), 14, 23, 59, 59);
  }
  return { desde, hasta };
}

function calcularIdCicloActual() {
  const { desde } = calcularRangoCicloActual();
  const yyyy = desde.getFullYear();
  const mm = String(desde.getMonth() + 1).padStart(2, '0');
  return `${yyyy}-${mm}-15`;
}

/* ============================================================
   Pagina principal
   ============================================================ */

export default function RepartoEntreSocias() {
  const { user } = useAuth();
  const { consultorio, loading: loadingCons } = useConsultorio();
  const [profesionales, setProfesionales] = useState([]);
  const [compensaciones, setCompensaciones] = useState([]);
  const [loadingComps, setLoadingComps] = useState(true);
  const [miembros, setMiembros] = useState([]);
  const [mes, setMes] = useState(() => inicioDeMes(new Date()));
  const [sesiones, setSesiones] = useState([]);

  // Cargar miembros (admins para mostrar en el reparto)
  useEffect(() => {
    if (!consultorio?.id) return;
    return suscribirMiembrosConsultorio(consultorio.id, setMiembros);
  }, [consultorio?.id]);

  // Sesiones del mes para pagos manuales
  useEffect(() => {
    if (!consultorio?.id) return;
    const desde = inicioDeMes(mes);
    const hasta = finDeMes(mes);
    return suscribirSesionesConsultorio(consultorio.id, setSesiones, { desde, hasta });
  }, [consultorio?.id, mes]);

  // Cargar profesionales (para mostrar nombres de admins en lugar de UIDs)
  useEffect(() => {
    if (!consultorio?.id) return;
    return suscribirProfesionales(consultorio.id, (lista) => {
      setProfesionales(lista);
    });
  }, [consultorio?.id]);

  // Suscribir a compensaciones
  useEffect(() => {
    if (!consultorio?.id) return;
    setLoadingComps(true);
    const unsub = suscribirCompensaciones(consultorio.id, (lista) => {
      setCompensaciones(lista);
      setLoadingComps(false);
    });
    return unsub;
  }, [consultorio?.id]);

  const mapAdminsByUid = useMemo(() => {
    const m = {};
    for (const p of profesionales) m[p.uid] = p;
    return m;
  }, [profesionales]);

  if (loadingCons) {
    return (
      <div className="cp-reparto">
        <div className="cp-reparto__loading">
          <Spinner size={24} label="Cargando consultorio…" />
        </div>
      </div>
    );
  }

  if (!consultorio) {
    return (
      <div className="cp-reparto">
        <p>No se pudo cargar el consultorio.</p>
      </div>
    );
  }

  // El reparto solo aplica si hay 2 admins. Si solo hay 1, esta pagina
  // no deberia ser accesible — pero por las dudas mostramos un mensaje
  // claro en lugar de romper.
  const cantidadAdmins = (consultorio.adminUids || []).length;
  if (cantidadAdmins < 2) {
    return <RepartoNoDisponible consultorio={consultorio} />;
  }

  const repartoActivo = !!consultorio.repartoActivado;
  const repartoIniciaEn = consultorio.repartoIniciaEn?.toDate
    ? consultorio.repartoIniciaEn.toDate()
    : null;

  return (
    <div className="cp-reparto">
      <header className="cp-page-header">
        <div>
          <h1 className="cp-page-title">Reparto entre administradores</h1>
          <p className="cp-page-sub">
            Cuando ambos administradores tienen su Mercado Pago conectado,
            ConsulPay alterna a quién le caen los cobros mes a mes (del 15 al 14)
            y te ayuda a calcular la compensación al final de cada ciclo.
          </p>
        </div>
      </header>

      {!repartoActivo ? (
        <RepartoEsperandoSegundaCuenta consultorio={consultorio} />
      ) : repartoIniciaEn && new Date() < repartoIniciaEn ? (
        <RepartoEsperandoInicio fechaInicio={repartoIniciaEn} />
      ) : (
        <CicloActual
          consultorio={consultorio}
          mapAdminsByUid={mapAdminsByUid}
        />
      )}

      <RepartoPagosManuales
        sesiones={sesiones}
        profesionales={profesionales}
        miembros={miembros}
        mes={mes}
        setMes={setMes}
        consultorioId={consultorio.id}
      />

      <section className="cp-reparto__historial">
        <header className="cp-reparto__section-head">
          <h2 className="cp-reparto__section-title">Compensaciones pasadas</h2>
          <p className="cp-reparto__section-sub">
            Cierre de ciclos previos. Cada uno mantiene su historial aunque
            se desconecten cuentas o se vayan administradores.
          </p>
        </header>

        {loadingComps ? (
          <div className="cp-reparto__loading"><Spinner size={20} /></div>
        ) : compensaciones.length === 0 ? (
          <div className="cp-reparto__empty">
            Todavía no hay compensaciones cerradas. Cuando termine el primer ciclo,
            vas a poder cerrarlo desde acá.
          </div>
        ) : (
          <ul className="cp-reparto__lista">
            {compensaciones.map((c) => (
              <CompensacionCard
                key={c.id}
                compensacion={c}
                consultorioId={consultorio.id}
                userUid={user?.uid}
                mapAdminsByUid={mapAdminsByUid}
                aliasReceptor={consultorio.aliasTransferencia || null}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/* ============================================================
   Estados especiales (sin reparto activo / esperando inicio)
   ============================================================ */

function RepartoNoDisponible({ consultorio }) {
  const cantidadAdmins = consultorio.adminUids?.length || 1;
  return (
    <div className="cp-reparto">
      <header className="cp-page-header">
        <h1 className="cp-page-title">Reparto entre administradores</h1>
      </header>
      <div className="cp-reparto__aviso cp-reparto__aviso--neutral">
        <strong>Esta función se activa cuando hay 2 administradores en el consultorio.</strong>
        <p>
          Tu consultorio "{consultorio.nombre}" tiene actualmente
          {cantidadAdmins === 1 ? ' 1 administrador' : ` ${cantidadAdmins} administradores`}.
          Para usar el reparto entre administradores, sumá un segundo administrador desde Configuración.
        </p>
      </div>
    </div>
  );
}

function RepartoEsperandoSegundaCuenta({ consultorio }) {
  return (
    <div className="cp-reparto__aviso cp-reparto__aviso--info">
      <strong>Esperando que el segundo administrador conecte su Mercado Pago.</strong>
      <p>
        El reparto se activa cuando ambos administradores tienen su cuenta MP vinculada.
        Mientras tanto, todos los cobros van a la cuenta principal.
      </p>
    </div>
  );
}

function RepartoEsperandoInicio({ fechaInicio }) {
  return (
    <div className="cp-reparto__aviso cp-reparto__aviso--info">
      <strong>El reparto arranca el {formatoFechaCorta(fechaInicio)}.</strong>
      <p>
        Hasta esa fecha todos los cobros caen en la cuenta principal. El primer ciclo
        de rotación va del {formatoFechaCorta(fechaInicio)} al 14 del mes siguiente.
      </p>
    </div>
  );
}

/* ============================================================
   Vista del ciclo actual
   ============================================================ */

function CicloActual({ consultorio, mapAdminsByUid }) {
  const { desde, hasta } = calcularRangoCicloActual();
  const idCicloActual = calcularIdCicloActual();
  const ahora = new Date();
  const cicloTerminado = ahora > hasta;

  // Aviso: el ciclo actual no se cierra hasta que termine
  // (los pagos pueden seguir entrando hasta el dia 14 23:59)
  return (
    <section className="cp-reparto__ciclo-actual">
      <header className="cp-reparto__section-head">
        <div>
          <div className="cp-reparto__eyebrow">Ciclo actual</div>
          <h2 className="cp-reparto__section-title">
            {formatearPeriodoCiclo(desde, hasta)}
          </h2>
        </div>
        <div className="cp-reparto__ciclo-id">
          <span className="cp-reparto__chip">{idCicloActual}</span>
        </div>
      </header>

      {!cicloTerminado ? (
        <div className="cp-reparto__aviso cp-reparto__aviso--neutral">
          <strong>El ciclo todavía no terminó.</strong>
          <p>
            Vas a poder cerrarlo a partir del {formatoFechaCorta(hasta)} a las 23:59.
            Hasta entonces, los pagos siguen acumulándose en cada cuenta.
          </p>
        </div>
      ) : (
        <CerrarCicloCard
          consultorioId={consultorio.id}
          idCiclo={idCicloActual}
        />
      )}

      <p className="cp-reparto__nota">
        En este ciclo le toca cobrar a la cuenta {' '}
        <strong>{nombreSlotPorRotacion(consultorio, mapAdminsByUid)}</strong>.
        El próximo ciclo rota.
      </p>
    </section>
  );
}

function nombreSlotPorRotacion(consultorio, mapAdminsByUid) {
  // Reproduce la lógica del helper backend para mostrar al usuario
  // a quién le toca cobrar
  const repartoIniciaEn = consultorio.repartoIniciaEn?.toDate
    ? consultorio.repartoIniciaEn.toDate()
    : null;
  if (!repartoIniciaEn) return 'principal';

  const fecha = new Date();
  const diffMeses = (fecha.getFullYear() - repartoIniciaEn.getFullYear()) * 12
    + (fecha.getMonth() - repartoIniciaEn.getMonth());
  const cicloIndex = fecha.getDate() < 15 ? Math.max(0, diffMeses - 1) : diffMeses;
  const slot = cicloIndex % 2 === 0 ? 'primary' : 'secondary';

  const slotConfig = consultorio.mpConfigs?.[slot];
  const ownerUid = slotConfig?.ownerAdminUid || slotConfig?.connectedByUid;
  const owner = mapAdminsByUid[ownerUid];
  return nombreVisible(owner) || (slot === 'primary' ? 'principal' : 'secundaria');
}

function CerrarCicloCard({ consultorioId, idCiclo }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleCerrar() {
    setError('');
    setSubmitting(true);
    try {
      await cerrarCiclo(consultorioId, idCiclo);
      // La compensación va a aparecer en el listado por el suscriptor live
    } catch (err) {
      setError(err.message || 'No se pudo cerrar el ciclo.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="cp-reparto__cerrar-card">
      <p>
        El ciclo terminó. Cerralo para calcular cuánto cobró cada cuenta y
        determinar quién tiene que transferirle a quién.
      </p>
      {error && <div className="cp-reparto__error">{error}</div>}
      <Button variant="primary" onClick={handleCerrar} disabled={submitting}>
        {submitting ? 'Calculando…' : 'Cerrar ciclo y calcular compensación'}
      </Button>
    </div>
  );
}

/* ============================================================
   Card de una compensación (en el historial)
   ============================================================ */

function CompensacionCard({ compensacion: c, consultorioId, userUid, mapAdminsByUid, aliasReceptor }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const adminPagante = mapAdminsByUid[c.ownerAdminUidPagante];
  const adminReceptor = mapAdminsByUid[c.ownerAdminUidReceptor];
  const nombrePagante = nombreVisible(adminPagante) || 'Pagante';
  const nombreReceptor = nombreVisible(adminReceptor) || 'Receptor';

  const userEsPagante = userUid === c.ownerAdminUidPagante;
  const userEsReceptor = userUid === c.ownerAdminUidReceptor;
  const requiereAccion = requiereAccionDelUsuario(c, userUid);

  async function handleMarcarTransferida() {
    setError('');
    setSubmitting(true);
    try {
      await marcarTransferida(consultorioId, c.id);
    } catch (err) {
      setError(err.message || 'No se pudo marcar como transferida.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirmarRecibida() {
    setError('');
    setSubmitting(true);
    try {
      await confirmarRecibida(consultorioId, c.id);
    } catch (err) {
      setError(err.message || 'No se pudo confirmar.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRecalcular() {
    if (!confirm('¿Recalcular los totales de este ciclo? Solo se puede si está pendiente.')) return;
    setError('');
    setSubmitting(true);
    try {
      await recalcularCompensacion(consultorioId, c.id);
    } catch (err) {
      setError(err.message || 'No se pudo recalcular.');
    } finally {
      setSubmitting(false);
    }
  }

  function handleAbrirMP() {
    const url = generarUrlTransferenciaMP({
      monto: c.montoATransferir,
      aliasReceptor: aliasReceptor || undefined,
    });
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  return (
    <li className={`cp-comp-card cp-comp-card--${c.estado} ${requiereAccion ? 'cp-comp-card--accion' : ''}`}>
      <header className="cp-comp-card__head">
        <div>
          <div className="cp-comp-card__period">
            {formatearPeriodoCiclo(c.desde, c.hasta)}
          </div>
          <div className="cp-comp-card__id">{c.id}</div>
        </div>
        <EstadoBadge estado={c.estado} emparejado={c.estaEmparejado} />
      </header>

      {c.estaEmparejado ? (
        <div className="cp-comp-card__emparejado">
          Las dos cuentas cobraron lo mismo en este ciclo. Sin transferencia pendiente.
        </div>
      ) : (
        <>
          <ComparativaSlots compensacion={c} mapAdminsByUid={mapAdminsByUid} />

          <div className="cp-comp-card__resumen">
            <div className="cp-comp-card__diferencia">
              <span className="cp-comp-card__diferencia-label">Diferencia neta</span>
              <span className="cp-comp-card__diferencia-amount">{formatoARS.format(c.diferenciaNeta)}</span>
            </div>
            <div className="cp-comp-card__transfer">
              <span className="cp-comp-card__transfer-arrow">→</span>
              <span>
                <strong>{nombrePagante}</strong> tiene que transferir{' '}
                <strong>{formatoARS.format(c.montoATransferir)}</strong> a{' '}
                <strong>{nombreReceptor}</strong>
              </span>
            </div>
          </div>

          {error && <div className="cp-reparto__error">{error}</div>}

          <div className="cp-comp-card__actions">
            {c.estado === ESTADOS_COMPENSACION.PENDIENTE && userEsPagante && (
              <>
                <Button variant="secondary" onClick={handleAbrirMP}>
                  Abrir Mercado Pago
                </Button>
                <Button variant="primary" onClick={handleMarcarTransferida} disabled={submitting}>
                  {submitting ? 'Marcando…' : 'Ya transferí'}
                </Button>
              </>
            )}
            {c.estado === ESTADOS_COMPENSACION.PENDIENTE && !userEsPagante && (
              <div className="cp-comp-card__esperando">
                Esperando a que <strong>{nombrePagante}</strong> haga la transferencia.
              </div>
            )}
            {c.estado === ESTADOS_COMPENSACION.TRANSFERIDO && userEsReceptor && (
              <Button variant="primary" onClick={handleConfirmarRecibida} disabled={submitting}>
                {submitting ? 'Confirmando…' : 'Confirmar que recibí'}
              </Button>
            )}
            {c.estado === ESTADOS_COMPENSACION.TRANSFERIDO && !userEsReceptor && (
              <div className="cp-comp-card__esperando">
                Marcaste como transferida.{' '}
                Esperando a que <strong>{nombreReceptor}</strong> confirme la recepción.
              </div>
            )}
            {c.estado === ESTADOS_COMPENSACION.SALDADO && (
              <div className="cp-comp-card__saldado">
                Saldada el {formatoFechaCorta(c.saldadoEn || c.updatedAt)}
              </div>
            )}
            {c.estado === ESTADOS_COMPENSACION.PENDIENTE && (
              <button
                type="button"
                className="cp-comp-card__recalcular"
                onClick={handleRecalcular}
                disabled={submitting}
                title="Recalcular si llegaron pagos tarde o hubo refunds"
              >
                Recalcular totales
              </button>
            )}
          </div>
        </>
      )}
    </li>
  );
}

function EstadoBadge({ estado, emparejado }) {
  if (emparejado) {
    return <span className="cp-comp-badge cp-comp-badge--saldado">Emparejado</span>;
  }
  if (estado === ESTADOS_COMPENSACION.PENDIENTE) {
    return <span className="cp-comp-badge cp-comp-badge--pendiente">Pendiente</span>;
  }
  if (estado === ESTADOS_COMPENSACION.TRANSFERIDO) {
    return <span className="cp-comp-badge cp-comp-badge--transferido">Transferido</span>;
  }
  if (estado === ESTADOS_COMPENSACION.SALDADO) {
    return <span className="cp-comp-badge cp-comp-badge--saldado">Saldado</span>;
  }
  return <span className="cp-comp-badge">{estado}</span>;
}

/* ============================================================
   Comparativa de slots (las 2 columnas con totales)
   ============================================================ */

function ComparativaSlots({ compensacion: c, mapAdminsByUid }) {
  const slotPrimary = c.totales?.primary || {};
  const slotSecondary = c.totales?.secondary || {};

  const adminPrimary = mapAdminsByUid[slotPrimary.ownerAdminUid];
  const adminSecondary = mapAdminsByUid[slotSecondary.ownerAdminUid];

  return (
    <div className="cp-comp-comparativa">
      <SlotColumna
        nombre={nombreVisible(adminPrimary) || 'Cuenta principal'}
        totales={slotPrimary}
        esPagante={c.paganteSlot === 'primary'}
      />
      <SlotColumna
        nombre={nombreVisible(adminSecondary) || 'Cuenta secundaria'}
        totales={slotSecondary}
        esPagante={c.paganteSlot === 'secondary'}
      />
    </div>
  );
}

function SlotColumna({ nombre, totales, esPagante }) {
  return (
    <div className={`cp-slot-col ${esPagante ? 'cp-slot-col--pagante' : ''}`}>
      <div className="cp-slot-col__head">
        <span className="cp-slot-col__nombre">{nombre}</span>
        {esPagante && <span className="cp-slot-col__tag">+ alta</span>}
      </div>

      <div className="cp-slot-col__lineas">
        <Linea
          label={`${totales.cantidadPagos || 0} ${(totales.cantidadPagos === 1) ? 'cobro' : 'cobros'}`}
          value={formatoARS.format(totales.totalBruto || 0)}
          subtle
        />
        <Linea
          label="Comisión MP"
          value={`-${formatoARS.format(totales.comisionMP || 0)}`}
          subtle
        />
        <Linea
          label="Comisión ConsulPay"
          value={`-${formatoARS.format(totales.comisionConsulpay || 0)}`}
          subtle
        />
      </div>

      <div className="cp-slot-col__divider" />

      <div className="cp-slot-col__neto">
        <span className="cp-slot-col__neto-label">Neto en cuenta</span>
        <span className="cp-slot-col__neto-amount">
          {formatoARS.format(totales.totalNetoReal || 0)}
        </span>
      </div>
    </div>
  );
}

function Linea({ label, value, subtle }) {
  return (
    <div className={`cp-slot-linea ${subtle ? 'cp-slot-linea--subtle' : ''}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

/* ============================================================
   Sección: Reparto de pagos manuales (marcados con receptor)
   Muestra cuánto cobró cada admin en el mes seleccionado,
   desglosado por profesional, con filtro de mes.
   ============================================================ */
function RepartoPagosManuales({ sesiones, profesionales, miembros, mes, setMes, consultorioId }) {
  const admins = useMemo(
    () => miembros.filter((m) => m.rol === 'admin' || m.esAdminDelConsultorio),
    [miembros],
  );

  const mapaProfesionales = useMemo(
    () => Object.fromEntries(profesionales.map((p) => [p.uid, p])),
    [profesionales],
  );

  // Sesiones pagadas con receptor registrado
  const sesionesConReceptor = useMemo(
    () => sesiones.filter((s) => s.estadoPago === ESTADOS_PAGO_SESION.PAGADO && s.receptorUid),
    [sesiones],
  );

  // Agrupar por receptor (admin)
  const porReceptor = useMemo(() => {
    const map = {};
    for (const s of sesionesConReceptor) {
      const uid = s.receptorUid;
      if (!map[uid]) map[uid] = { uid, nombre: s.receptorNombre || uid, sesiones: [], total: 0 };
      map[uid].sesiones.push(s);
      map[uid].total += s.montoConsultorio || 0;
    }
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [sesionesConReceptor]);

  // Detalle expandible por admin → por profesional
  const [expandido, setExpandido] = useState(null);

  const totalMes = porReceptor.reduce((acc, r) => acc + r.total, 0);
  const sinReceptor = sesiones.filter(
    (s) => s.estadoPago === ESTADOS_PAGO_SESION.PAGADO && !s.receptorUid,
  ).length;

  return (
    <section className="cp-reparto__manuales">
      <header className="cp-reparto__section-head">
        <div>
          <h2 className="cp-reparto__section-title">Pagos manuales cobrados</h2>
          <p className="cp-reparto__section-sub">
            Sesiones marcadas como pagadas con la opción "¿Quién recibió?".
            Filtrá por mes para ver cuánto cobró cada administrador.
          </p>
        </div>
        <SelectorMesReparto mes={mes} setMes={setMes} />
      </header>

      {/* Cards resumen por admin */}
      <div className="cp-reparto__admins-grid">
        {admins.map((admin) => {
          const datos = porReceptor.find((r) => r.uid === admin.uid);
          const total = datos?.total ?? 0;
          const cant = datos?.sesiones?.length ?? 0;
          const pct = totalMes > 0 ? Math.round(total / totalMes * 100) : 0;
          return (
            <div
              key={admin.uid}
              className={`cp-reparto__admin-card ${expandido === admin.uid ? 'cp-reparto__admin-card--active' : ''}`}
              onClick={() => setExpandido((v) => v === admin.uid ? null : admin.uid)}
            >
              <div className="cp-reparto__admin-name">{admin.displayName || admin.email}</div>
              <div className="cp-reparto__admin-total">{formatoARS.format(total)}</div>
              <div className="cp-reparto__admin-meta">
                {cant} sesión{cant === 1 ? '' : 'es'} · {pct}% del mes
              </div>
              {/* Barra de progreso */}
              <div className="cp-reparto__admin-bar">
                <div className="cp-reparto__admin-bar-fill" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
        {admins.length === 0 && (
          <div style={{ color: 'var(--cp-text-muted)', fontSize: 13.5 }}>
            No hay admins registrados.
          </div>
        )}
      </div>

      {/* Total del mes */}
      {totalMes > 0 && (
        <div className="cp-reparto__manuales-total">
          Total cobrado en {nombreDelMes(mes)}: <strong>{formatoARS.format(totalMes)}</strong>
          {sinReceptor > 0 && (
            <span style={{ marginLeft: 12, fontSize: 12, color: 'var(--cp-warning, #b8860b)' }}>
              ⚠ {sinReceptor} sesión{sinReceptor === 1 ? '' : 'es'} sin receptor registrado
            </span>
          )}
        </div>
      )}

      {/* Detalle expandido por admin */}
      {expandido && (() => {
        const datos = porReceptor.find((r) => r.uid === expandido);
        if (!datos || !datos.sesiones.length) return (
          <div className="cp-reparto__detalle">
            <p style={{ color: 'var(--cp-text-muted)', fontSize: 13.5 }}>Sin cobros en {nombreDelMes(mes)}.</p>
          </div>
        );

        // Agrupar por profesional
        const porProf = {};
        for (const s of datos.sesiones) {
          const uid = s.profesionalUid;
          if (!porProf[uid]) porProf[uid] = { sesiones: [], total: 0 };
          porProf[uid].sesiones.push(s);
          porProf[uid].total += s.montoConsultorio || 0;
        }

        return (
          <div className="cp-reparto__detalle">
            <div className="cp-reparto__detalle-titulo">
              Detalle de cobros — {datos.nombre}
            </div>
            {Object.entries(porProf).map(([profUid, { sesiones: ss, total }]) => {
              const prof = mapaProfesionales[profUid];
              const nombreProf = prof?.displayName || prof?.email || ss[0]?.profesionalNombre || profUid;
              return (
                <div key={profUid} className="cp-reparto__detalle-row">
                  <div className="cp-reparto__detalle-prof">{nombreProf}</div>
                  <div className="cp-reparto__detalle-info">
                    {ss.length} sesión{ss.length === 1 ? '' : 'es'}
                  </div>
                  <div className="cp-reparto__detalle-monto">{formatoARS.format(total)}</div>
                </div>
              );
            })}
            <div className="cp-reparto__detalle-total">
              <span>Total</span>
              <span />
              <span>{formatoARS.format(datos.total)}</span>
            </div>
          </div>
        );
      })()}

      {sesionesConReceptor.length === 0 && (
        <div className="cp-reparto__empty">
          No hay pagos manuales registrados en {nombreDelMes(mes)}.
          Al marcar sesiones como pagadas indicando quién recibió, aparecen acá.
        </div>
      )}
    </section>
  );
}

function SelectorMesReparto({ mes, setMes }) {
  function anterior() {
    setMes((m) => { const d = new Date(m); d.setMonth(d.getMonth() - 1); return inicioDeMes(d); });
  }
  function siguiente() {
    setMes((m) => { const d = new Date(m); d.setMonth(d.getMonth() + 1); return inicioDeMes(d); });
  }
  const esEsteMes = inicioDeMes(new Date()).getTime() === mes.getTime();
  return (
    <div className="cp-mes-selector">
      <button type="button" className="cp-mes-selector__btn" onClick={anterior}>‹</button>
      <span className="cp-mes-selector__label">{nombreDelMes(mes)}</span>
      <button type="button" className="cp-mes-selector__btn" onClick={siguiente} disabled={esEsteMes}>›</button>
    </div>
  );
}
