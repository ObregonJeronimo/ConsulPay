import { useEffect, useMemo, useState } from 'react';

import Button from '../../components/ui/Button.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import { useOverlayClose } from '../../hooks/useOverlayClose.js';
import { formatoARS } from '../../lib/constants.js';
import {
  armarLibro, crearGasto, CUENTA_MP, eliminarGasto, suscribirGastos,
} from '../../lib/gastos.js';
import { suscribirMiembrosConsultorio } from '../../lib/profesionales.js';
import { montoNetoEfectivo, suscribirPagosDelConsultorio } from '../../lib/pagos.js';
import { suscribirSesionesPagadas } from '../../lib/sesiones.js';

import './LibroCaja.css';

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function hoyISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function diaCorto(iso) {
  if (!iso) return '—';
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

function nombreCorto(u) {
  const n = u?.displayName || u?.email || '';
  return n.split(/\s+/)[0] || 'Admin';
}

/**
 * Libro de caja: ingresos y egresos en una sola vista.
 *
 * Una columna por caja — Mercado Pago mas cada administrador del
 * consultorio — armadas desde adminUids, no fijas: cada cliente tiene sus
 * propios duenos y pueden ser dos, tres o uno solo.
 *
 * Los ingresos no se cargan a mano: salen de las sesiones ya marcadas como
 * pagadas, que guardan quien recibio la plata. Lo unico que se carga son
 * los gastos, que el sistema no tiene forma de deducir.
 */
export default function LibroCaja({ consultorioId, consultorio, uid, mes }) {
  const [gastos, setGastos] = useState([]);
  const [sesiones, setSesiones] = useState([]);
  const [miembros, setMiembros] = useState([]);
  const [pagosMP, setPagosMP] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [nuevoAbierto, setNuevoAbierto] = useState(false);

  useEffect(() => {
    if (!consultorioId) return undefined;
    return suscribirGastos(consultorioId, setGastos);
  }, [consultorioId]);

  useEffect(() => {
    if (!consultorioId) return undefined;
    setCargando(true);
    return suscribirSesionesPagadas(consultorioId, (d) => { setSesiones(d); setCargando(false); });
  }, [consultorioId]);

  useEffect(() => {
    if (!consultorioId) return undefined;
    return suscribirMiembrosConsultorio(consultorioId, setMiembros);
  }, [consultorioId]);

  // Cobros por Mercado Pago: son la otra fuente de ingresos y van a su
  // propia caja. Sin esto la columna existia pero marcaba siempre cero.
  useEffect(() => {
    if (!consultorioId) return undefined;
    return suscribirPagosDelConsultorio(consultorioId, (data) => {
      setPagosMP(data.filter((p) => p.estado === 'aprobado'));
    });
  }, [consultorioId]);

  // Cuentas: Mercado Pago + un administrador por cada adminUid del
  // consultorio. Se resuelve el nombre contra los miembros; si todavia no
  // cargaron, se muestra el uid recortado en vez de dejar la columna muda.
  const cuentas = useMemo(() => {
    const porUid = Object.fromEntries(miembros.map((m) => [m.uid, m]));
    const admins = (consultorio?.adminUids || []).map((id) => ({
      id,
      nombre: porUid[id] ? nombreCorto(porUid[id]) : `Admin ${id.slice(0, 4)}`,
      completo: porUid[id]?.displayName || porUid[id]?.email || id,
    }));
    return [{ id: CUENTA_MP, nombre: 'Mercado Pago', completo: 'Cobros por Mercado Pago' }, ...admins];
  }, [consultorio?.adminUids, miembros]);

  const rangoMes = useMemo(() => {
    const y = mes.getFullYear(); const m = String(mes.getMonth() + 1).padStart(2, '0');
    const ultimo = new Date(y, mes.getMonth() + 1, 0).getDate();
    return { desde: `${y}-${m}-01`, hasta: `${y}-${m}-${String(ultimo).padStart(2, '0')}` };
  }, [mes]);

  const { movimientos, totales, columnas } = useMemo(() => {
    const libro = armarLibro({
      sesionesPagadas: sesiones,
      // Lo que efectivamente entro a la cuenta, ya descontado el cargo de MP.
      pagosMP: pagosMP.map((p) => ({ ...p, montoConsultorio: montoNetoEfectivo(p) })),
      gastos,
      cuentas,
    });
    const delMes = libro.movimientos.filter(
      (mv) => mv.fecha >= rangoMes.desde && mv.fecha <= rangoMes.hasta,
    );
    // Recalcular totales solo con lo del mes
    const tot = {};
    const cols = [...cuentas];
    if (delMes.some((mv) => mv.cuenta === 'sin_asignar')) {
      cols.push({ id: 'sin_asignar', nombre: 'Sin asignar', completo: 'Cobros sin receptor registrado' });
    }
    for (const c of cols) tot[c.id] = { ingresos: 0, egresos: 0, saldo: 0 };
    for (const mv of delMes) {
      const t = tot[mv.cuenta]; if (!t) continue;
      if (mv.tipo === 'ingreso') { t.ingresos += mv.monto; t.saldo += mv.monto; }
      else { t.egresos += mv.monto; t.saldo -= mv.monto; }
    }
    return { movimientos: delMes, totales: tot, columnas: cols };
  }, [sesiones, pagosMP, gastos, cuentas, rangoMes]);

  async function borrar(mv) {
    if (!confirm(`¿Eliminar el gasto "${mv.detalle}"?`)) return;
    try { await eliminarGasto(mv.gastoId); } catch (e) { alert(e.message); }
  }

  if (cargando && sesiones.length === 0 && gastos.length === 0 && pagosMP.length === 0) {
    return (
      <div style={{ padding: 50, display: 'flex', justifyContent: 'center' }}>
        <Spinner size={22} label="Cargando movimientos…" />
      </div>
    );
  }

  const totalIngresos = Object.values(totales).reduce((a, t) => a + t.ingresos, 0);
  const totalEgresos = Object.values(totales).reduce((a, t) => a + t.egresos, 0);

  return (
    <div className="cp-libro">
      {/* El mes lo manda Pagos.jsx. Antes LibroCaja tenia su propio state y
          se renderizaba un segundo selector que no hablaba con el de arriba. */}
      <div className="cp-libro__bar">
        <Button variant="primary" onClick={() => setNuevoAbierto(true)}>+ Registrar gasto</Button>
      </div>

      {/* Resumen por caja */}
      <div className="cp-libro__resumen">
        {columnas.map((c) => {
          const t = totales[c.id] || { ingresos: 0, egresos: 0, saldo: 0 };
          return (
            <div key={c.id} className="cp-libro__caja" title={c.completo}>
              <div className="cp-libro__caja-nombre">{c.nombre}</div>
              <div className={`cp-libro__caja-saldo ${t.saldo < 0 ? 'cp-libro__caja-saldo--neg' : ''}`}>
                {formatoARS.format(t.saldo)}
              </div>
              <div className="cp-libro__caja-detalle">
                <span className="cp-libro__in">+{formatoARS.format(t.ingresos)}</span>
                <span className="cp-libro__out">−{formatoARS.format(t.egresos)}</span>
              </div>
            </div>
          );
        })}
      </div>

      {movimientos.length === 0 ? (
        <div className="cp-libro__vacio">
          No hay movimientos en {MESES[mes.getMonth()]}. Los ingresos aparecen solos
          cuando marcás sesiones como pagadas; los gastos se cargan con el botón de arriba.
        </div>
      ) : (
        <div className="cp-table-wrap">
          <table className="cp-table cp-libro__tabla">
            <thead>
              <tr>
                <th className="cp-libro__th-fecha">Fecha</th>
                {columnas.map((c) => (
                  <th key={c.id} className="cp-num-col" title={c.completo}>{c.nombre}</th>
                ))}
                <th>Detalle</th>
                <th aria-label="Acciones" />
              </tr>
            </thead>
            <tbody>
              {movimientos.map((mv) => (
                <tr key={mv.id} className={mv.tipo === 'ingreso' ? 'cp-libro__row--in' : 'cp-libro__row--out'}>
                  <td data-label="Fecha" className="cp-libro__td-fecha">{diaCorto(mv.fecha)}</td>
                  {columnas.map((c) => (
                    <td key={c.id} data-label={c.nombre} className="cp-num">
                      {mv.cuenta === c.id
                        ? (mv.tipo === 'ingreso'
                          ? formatoARS.format(mv.monto)
                          : `−${formatoARS.format(mv.monto)}`)
                        : ''}
                    </td>
                  ))}
                  <td data-label="Detalle" className="cp-libro__td-detalle">{mv.detalle}</td>
                  <td>
                    {mv.origen === 'gasto' && (
                      <button type="button" className="cp-libro__del" onClick={() => borrar(mv)}
                        title="Eliminar gasto" aria-label="Eliminar gasto">×</button>
                    )}
                  </td>

                  <td className="cp-td-mobile-main">
                    <div className="cp-libro__m-top">
                      <span className="cp-libro__m-fecha">{diaCorto(mv.fecha)}</span>
                      <span className="cp-libro__m-detalle">{mv.detalle}</span>
                    </div>
                    <div className="cp-libro__m-bot">
                      {columnas.find((c) => c.id === mv.cuenta)?.nombre ?? 'Sin asignar'}
                    </div>
                  </td>
                  <td className="cp-td-mobile-badge">
                    <span className={mv.tipo === 'ingreso' ? 'cp-libro__in' : 'cp-libro__out'}>
                      {mv.tipo === 'ingreso' ? '' : '−'}{formatoARS.format(mv.monto)}
                    </span>
                  </td>
                  <td className="cp-td-mobile-actions" />
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="cp-libro__totales">
                <td>Total</td>
                {columnas.map((c) => (
                  <td key={c.id} className="cp-num">
                    {formatoARS.format((totales[c.id] || {}).saldo || 0)}
                  </td>
                ))}
                <td colSpan={2}>
                  <span className="cp-libro__in">+{formatoARS.format(totalIngresos)}</span>
                  {' · '}
                  <span className="cp-libro__out">−{formatoARS.format(totalEgresos)}</span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {nuevoAbierto && (
        <GastoModal
          consultorioId={consultorioId}
          uid={uid}
          cuentas={cuentas}
          onClose={() => setNuevoAbierto(false)}
        />
      )}
    </div>
  );
}

/* ============================================================
   Modal: registrar un gasto
   ============================================================ */
function GastoModal({ consultorioId, uid, cuentas, onClose }) {
  const overlayProps = useOverlayClose(onClose);
  const [fecha, setFecha] = useState(hoyISO());
  const [monto, setMonto] = useState('');
  const [cuenta, setCuenta] = useState(cuentas[0]?.id ?? '');
  const [motivo, setMotivo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function guardar() {
    setError('');
    setSubmitting(true);
    try {
      await crearGasto(consultorioId, { fecha, monto, cuenta, motivo }, uid);
      onClose();
    } catch (e) {
      setError(e.message || 'No se pudo registrar el gasto.');
      setSubmitting(false);
    }
  }

  return (
    <div className="cp-modal-overlay" {...overlayProps}>
      <div className="cp-modal" onClick={(e) => e.stopPropagation()}>
        <button className="cp-modal__close" onClick={onClose} aria-label="Cerrar">×</button>
        <h2 className="cp-modal__title">Registrar gasto</h2>
        <p className="cp-modal__sub">
          Queda anotado en el libro de caja del mes, restando de la cuenta que elijas.
        </p>

        <div className="cp-libro__form">
          <div className="cp-libro__row">
            <div className="cp-libro__field">
              <label htmlFor="g-fecha">Fecha</label>
              <input id="g-fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
            <div className="cp-libro__field">
              <label htmlFor="g-monto">Monto</label>
              <input id="g-monto" type="number" min="0" step="any" placeholder="0"
                value={monto} onChange={(e) => setMonto(e.target.value)} />
            </div>
          </div>

          <div className="cp-libro__field">
            <label htmlFor="g-cuenta">¿De qué caja salió?</label>
            <select id="g-cuenta" value={cuenta} onChange={(e) => setCuenta(e.target.value)}>
              {cuentas.map((c) => <option key={c.id} value={c.id}>{c.completo}</option>)}
            </select>
          </div>

          <div className="cp-libro__field">
            <label htmlFor="g-motivo">Motivo</label>
            <input id="g-motivo" value={motivo} placeholder="Ej: alquiler, EPEC, insumos"
              onChange={(e) => setMotivo(e.target.value)} />
          </div>
        </div>

        {error && <div className="cp-modal__error">{error}</div>}

        <div className="cp-modal__actions">
          <Button variant="ghost" onClick={onClose} disabled={submitting}>Cancelar</Button>
          <Button variant="primary" onClick={guardar} disabled={submitting}>
            {submitting ? <><Spinner size={14} /> Guardando…</> : 'Registrar gasto'}
          </Button>
        </div>
      </div>
    </div>
  );
}
