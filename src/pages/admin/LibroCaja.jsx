import { useEffect, useMemo, useState } from 'react';

import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';
import DualScrollTable from '../../components/ui/DualScrollTable.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import { useOverlayClose } from '../../hooks/useOverlayClose.js';
import { formatoARS } from '../../lib/constants.js';
import {
  armarLibro, crearGasto, CUENTA_MP, eliminarGasto, suscribirGastos,
} from '../../lib/gastos.js';
import { nombrePaciente, suscribirPacientesConsultorio } from '../../lib/pacientes.js';
import { suscribirMiembrosConsultorio } from '../../lib/profesionales.js';
import { montoNetoEfectivo, suscribirPagosDelConsultorio } from '../../lib/pagos.js';
import { mpHabilitado } from '../../lib/mpIntegracion.js';
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
  const [pacientes, setPacientes] = useState([]);
  const [filtroCaja, setFiltroCaja] = useState('todas');
  const [abiertos, setAbiertos] = useState(() => new Set());
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

  // Los movimientos de sesion guardan pacienteId, no el nombre. Sin esto el
  // detalle quedaba vacio o, peor, mostraba el nombre del admin receptor.
  useEffect(() => {
    if (!consultorioId) return undefined;
    return suscribirPacientesConsultorio(consultorioId, setPacientes);
  }, [consultorioId]);

  // Cobros por Mercado Pago: son la otra fuente de ingresos y van a su
  // propia caja. Sin esto la columna existia pero marcaba siempre cero.
  useEffect(() => {
    if (!consultorioId) return undefined;
    return suscribirPagosDelConsultorio(consultorioId, (data) => {
      setPagosMP(data.filter((p) => p.estado === 'aprobado'));
    });
  }, [consultorioId]);

  const rangoMes = useMemo(() => {
    const y = mes.getFullYear(); const m = String(mes.getMonth() + 1).padStart(2, '0');
    const ultimo = new Date(y, mes.getMonth() + 1, 0).getDate();
    return { desde: `${y}-${m}-01`, hasta: `${y}-${m}-${String(ultimo).padStart(2, '0')}` };
  }, [mes]);

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
    /* La caja de Mercado Pago solo existe si MP esta habilitado (todos los
       admins vincularon); si no, quedaba una card y una columna enteras
       clavadas en cero. Excepcion: si ESTE MES tuvo cobros por MP, la caja
       aparece igual, porque esconderla seria esconder plata que entro. Se
       mira el mes en curso y no toda la historia: con MP apagado, un cobro
       de marzo no tiene por que dejar una columna vacia en julio. */
    const hayMPEsteMes = pagosMP.some((pago) => {
      const f = pago.createdAt?.toDate ? pago.createdAt.toDate()
        : (pago.createdAt?.seconds !== undefined ? new Date(pago.createdAt.seconds * 1000) : null);
      if (!f) return false;
      const p2 = (n) => String(n).padStart(2, '0');
      const iso = `${f.getFullYear()}-${p2(f.getMonth() + 1)}-${p2(f.getDate())}`;
      return iso >= rangoMes.desde && iso <= rangoMes.hasta;
    });
    const mpVisible = mpHabilitado(consultorio) || hayMPEsteMes;
    const cajaMP = { id: CUENTA_MP, nombre: 'Mercado Pago', completo: 'Cobros por Mercado Pago' };
    return mpVisible ? [cajaMP, ...admins] : admins;
  }, [consultorio, miembros, pagosMP, rangoMes]);

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

  const mapaPacientes = useMemo(() => {
    const m = {};
    for (const p of pacientes) m[p.id] = p;
    return m;
  }, [pacientes]);

  /* Los movimientos ya resueltos para mostrar: el nombre del paciente sale
     del mapa; si el paciente fue borrado o la sesion no lo tiene, se dice
     "Sesión cobrada" y no el nombre de un administrador. */
  const conNombre = useMemo(() => movimientos.map((mv) => {
    if (mv.origen !== 'sesion') return mv;
    const pac = mapaPacientes[mv.pacienteId];
    const nombre = pac ? nombrePaciente(pac) : (mv.detalle || 'Sesión cobrada');
    return { ...mv, detalle: nombre };
  }), [movimientos, mapaPacientes]);

  const visibles = useMemo(
    () => (filtroCaja === 'todas' ? conNombre : conNombre.filter((mv) => mv.cuenta === filtroCaja)),
    [conNombre, filtroCaja],
  );

  /* Agrupacion: los cobros de sesiones del mismo dia y la misma caja se
     juntan en una linea sola. Un dia de cobranza son 14 sesiones sueltas y
     leerlas de a una no aporta nada; el desglose queda a un click. Los
     gastos y los cobros por MP NO se agrupan: cada uno tiene su motivo. */
  const filas = useMemo(() => {
    const out = [];
    const grupos = new Map();
    for (const mv of visibles) {
      if (mv.origen !== 'sesion') { out.push({ tipo: 'simple', mv }); continue; }
      const clave = `${mv.fecha}|${mv.cuenta}`;
      if (!grupos.has(clave)) {
        const g = { tipo: 'grupo', clave, fecha: mv.fecha, cuenta: mv.cuenta, monto: 0, sesiones: 0, items: [] };
        grupos.set(clave, g);
        out.push(g);
      }
      const g = grupos.get(clave);
      g.monto += mv.monto;
      g.sesiones += mv.cantidad || 1;
      g.items.push(mv);
    }
    // Un solo cobro en el dia no necesita fila de grupo.
    return out.map((f) => (f.tipo === 'grupo' && f.items.length === 1 ? { tipo: 'simple', mv: f.items[0] } : f));
  }, [visibles]);

  const totalesVisibles = useMemo(() => {
    let ingresos = 0; let egresos = 0;
    for (const mv of visibles) {
      if (mv.tipo === 'ingreso') ingresos += mv.monto; else egresos += mv.monto;
    }
    return { ingresos, egresos, saldo: ingresos - egresos };
  }, [visibles]);

  function alternar(clave) {
    setAbiertos((prev) => {
      const n = new Set(prev);
      if (n.has(clave)) n.delete(clave); else n.add(clave);
      return n;
    });
  }

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

      {/* Filtro por caja: reemplaza a la vieja matriz de una columna por
          caja. Aquella dejaba 2 de cada 3 celdas vacias y obligaba a barrer
          la fila para encontrar el numero. Ahora hay una sola columna de
          monto y, si queres leer una caja sola, la filtras. */}
      {columnas.length > 1 && (
        <div className="cp-libro__filtros" role="group" aria-label="Filtrar por caja">
          <button
            type="button"
            className={`cp-libro__chip ${filtroCaja === 'todas' ? 'cp-libro__chip--on' : ''}`}
            onClick={() => setFiltroCaja('todas')}
            aria-pressed={filtroCaja === 'todas'}
          >
            Todas
          </button>
          {columnas.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`cp-libro__chip ${filtroCaja === c.id ? 'cp-libro__chip--on' : ''}`}
              onClick={() => setFiltroCaja(c.id)}
              aria-pressed={filtroCaja === c.id}
              title={c.completo}
            >
              {c.nombre}
            </button>
          ))}
        </div>
      )}

      {visibles.length === 0 ? (
        <div className="cp-libro__vacio">
          {filtroCaja === 'todas'
            ? `No hay movimientos en ${MESES[mes.getMonth()]}. Los ingresos aparecen solos
               cuando marcás sesiones como pagadas; los gastos se cargan con el botón de arriba.`
            : 'Esa caja no tuvo movimientos este mes.'}
        </div>
      ) : (
        <>
          <DualScrollTable className="cp-compact-list">
            <table className="cp-table cp-libro__tabla">
              <thead>
                <tr>
                  <th className="cp-libro__th-fecha">Fecha</th>
                  <th>Concepto</th>
                  <th>Caja</th>
                  <th className="cp-num-col">Monto</th>
                  <th aria-label="Acciones" />
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => {
                  if (f.tipo === 'grupo') {
                    const abierto = abiertos.has(f.clave);
                    const caja = columnas.find((c) => c.id === f.cuenta)?.nombre ?? 'Sin asignar';
                    return [
                      <tr key={f.clave} className="cp-libro__fila cp-libro__fila--grupo">
                        <td data-label="Fecha" className="cp-libro__td-fecha">{diaCorto(f.fecha)}</td>
                        <td data-label="Concepto">
                          <button
                            type="button"
                            className="cp-libro__toggle"
                            onClick={() => alternar(f.clave)}
                            aria-expanded={abierto}
                          >
                            <span className={`cp-libro__chevron ${abierto ? 'cp-libro__chevron--on' : ''}`} aria-hidden="true">›</span>
                            {f.items.length} cobros · {f.sesiones} {f.sesiones === 1 ? 'sesión' : 'sesiones'}
                          </button>
                        </td>
                        <td data-label="Caja" className="cp-libro__td-caja">{caja}</td>
                        <td data-label="Monto" className="cp-num cp-libro__in">+{formatoARS.format(f.monto)}</td>
                        <td />
                        <td className="cp-td-mobile-main" onClick={() => alternar(f.clave)}>
                          <div className="cp-libro__m-top">
                            <span className="cp-libro__m-fecha">{diaCorto(f.fecha)}</span>
                            <span className="cp-libro__m-detalle">
                              {f.items.length} cobros · {f.sesiones} {f.sesiones === 1 ? 'sesión' : 'sesiones'}
                            </span>
                          </div>
                          <div className="cp-libro__m-bot">{caja}</div>
                        </td>
                        <td className="cp-td-mobile-badge">
                          <span className="cp-libro__in">+{formatoARS.format(f.monto)}</span>
                        </td>
                        <td className="cp-td-mobile-actions" />
                      </tr>,
                      ...(abierto ? f.items.map((mv) => (
                        <tr key={mv.id} className="cp-libro__fila cp-libro__fila--hija">
                          <td className="cp-libro__td-fecha" />
                          <td data-label="Concepto" className="cp-libro__td-detalle">
                            <span className="cp-libro__guion" aria-hidden="true">↳</span>
                            {mv.detalle}
                            {mv.cantidad > 1 && (
                              <span className="cp-libro__cant"> · {mv.cantidad} sesiones</span>
                            )}
                          </td>
                          <td />
                          <td data-label="Monto" className="cp-num cp-libro__in">+{formatoARS.format(mv.monto)}</td>
                          <td />
                          <td className="cp-td-mobile-main">
                            <div className="cp-libro__m-top">
                              <span className="cp-libro__m-detalle">↳ {mv.detalle}</span>
                            </div>
                          </td>
                          <td className="cp-td-mobile-badge">
                            <span className="cp-libro__in">+{formatoARS.format(mv.monto)}</span>
                          </td>
                          <td className="cp-td-mobile-actions" />
                        </tr>
                      )) : []),
                    ];
                  }

                  const mv = f.mv;
                  const esIngreso = mv.tipo === 'ingreso';
                  const caja = columnas.find((c) => c.id === mv.cuenta)?.nombre ?? 'Sin asignar';
                  const signo = esIngreso ? '+' : '−';
                  return (
                    <tr key={mv.id} className="cp-libro__fila">
                      <td data-label="Fecha" className="cp-libro__td-fecha">{diaCorto(mv.fecha)}</td>
                      <td data-label="Concepto">
                        {mv.detalle}
                        {mv.origen === 'sesion' && mv.cantidad > 1 && (
                          <span className="cp-libro__cant"> · {mv.cantidad} sesiones</span>
                        )}
                        {mv.origen === 'gasto' && <span className="cp-libro__tag">gasto</span>}
                        {mv.origen === 'mp' && <span className="cp-libro__tag">Mercado Pago</span>}
                      </td>
                      <td data-label="Caja" className="cp-libro__td-caja">{caja}</td>
                      <td data-label="Monto" className={`cp-num ${esIngreso ? 'cp-libro__in' : 'cp-libro__out'}`}>
                        {signo}{formatoARS.format(mv.monto)}
                      </td>
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
                        <div className="cp-libro__m-bot">{caja}</div>
                      </td>
                      <td className="cp-td-mobile-badge">
                        <span className={esIngreso ? 'cp-libro__in' : 'cp-libro__out'}>
                          {signo}{formatoARS.format(mv.monto)}
                        </span>
                      </td>
                      <td className="cp-td-mobile-actions" />
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </DualScrollTable>

          {/* Cierre del mes. Antes esto vivia en un tfoot con colSpan y los
              numeros terminaban pegados al ultimo total de columna. */}
          <div className="cp-libro__cierre">
            <div className="cp-libro__cierre-item">
              <span className="cp-libro__cierre-label">Ingresos</span>
              <span className="cp-libro__cierre-valor cp-libro__in">+{formatoARS.format(totalesVisibles.ingresos)}</span>
            </div>
            <div className="cp-libro__cierre-item">
              <span className="cp-libro__cierre-label">Egresos</span>
              <span className="cp-libro__cierre-valor cp-libro__out">−{formatoARS.format(totalesVisibles.egresos)}</span>
            </div>
            <div className="cp-libro__cierre-item cp-libro__cierre-item--saldo">
              <span className="cp-libro__cierre-label">Saldo</span>
              <span className={`cp-libro__cierre-valor ${totalesVisibles.saldo < 0 ? 'cp-libro__out' : ''}`}>
                {formatoARS.format(totalesVisibles.saldo)}
              </span>
            </div>
          </div>
        </>
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
          {/* 'caja' y no 'cuenta': es la palabra que usa toda la pantalla —el
              filtro, la columna de la tabla, las tarjetas de arriba—. Dos
              nombres para la misma cosa obligan a traducir mentalmente. */}
          Queda anotado en el libro del mes, restando de la caja que elijas.
        </p>

        {/* El orden sigue lo que la persona tiene en la cabeza al registrar
            un gasto: "pagué 85.000 de alquiler". El monto y el motivo son el
            contenido; la fecha ya viene en hoy y la caja casi siempre es la
            misma, asi que van despues, como contexto. */}
        <div className="cp-gasto__form">
          <div className="cp-field">
            <label className="cp-field__label" htmlFor="g-monto">Monto</label>
            {/* El signo va afuera del input y no como placeholder: tiene que
                seguir visible cuando la persona escribe. */}
            <div className="cp-gasto__monto">
              <span className="cp-gasto__signo" aria-hidden="true">$</span>
              <input
                id="g-monto"
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                placeholder="0"
                className="cp-gasto__monto-input"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
              />
            </div>
          </div>

          <Input
            id="g-motivo"
            label="Motivo"
            value={motivo}
            placeholder="Ej: alquiler, EPEC, insumos"
            onChange={(e) => setMotivo(e.target.value)}
          />

          <div className="cp-gasto__fila">
            <Input
              id="g-fecha"
              label="Fecha"
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
            />
            <div className="cp-field">
              <label className="cp-field__label" htmlFor="g-cuenta">Caja</label>
              <select
                id="g-cuenta"
                className="cp-select"
                value={cuenta}
                onChange={(e) => setCuenta(e.target.value)}
              >
                {cuentas.map((c) => <option key={c.id} value={c.id}>{c.completo}</option>)}
              </select>
            </div>
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
