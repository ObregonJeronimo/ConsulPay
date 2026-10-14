/*
  ResumenPagos — la pestana con la que abre Pagos: como viene el
  consultorio, mes a mes, en un anio.

  Arriba cuatro cifras del anio y un grafico de barras; abajo el
  comparativo mensual (ingresos, egresos, saldo, a cobrar). Tocar un mes
  abre el detalle por caja y un atajo al libro de ese mes.

  No calcula nada por su cuenta: los ingresos y egresos salen de
  armarLibro, la misma funcion que arma el libro de caja, y serieAnual
  solo los reparte por mes. Asi el total de julio aca y el pie del libro
  de julio no pueden dar distinto.

  Pensada para entrar entera en una pantalla de notebook sin scrollear:
  los meses van como FILAS (cinco columnas con el numero completo entran
  en cualquier ancho) y los meses vacios seguidos se juntan en un renglon.
*/

import { useEffect, useMemo, useRef, useState } from 'react';

import Spinner from '../../components/ui/Spinner.jsx';
import { ESTADOS_PAGO_SESION, formatoARS } from '../../lib/constants.js';
import {
  armarLibro, CAJA_SIN_RECEPTOR, cuentasDeCaja, hayMPEnRango, serieAnual, suscribirGastos,
} from '../../lib/gastos.js';
import { mpHabilitado } from '../../lib/mpIntegracion.js';
import { montoNetoEfectivo, suscribirPagosDelConsultorio } from '../../lib/pagos.js';
import { suscribirMiembrosConsultorio } from '../../lib/profesionales.js';
import { suscribirSesionesConsultorio, suscribirSesionesPagadas } from '../../lib/sesiones.js';

import { MESES_CORTOS } from './resumenAnual.js';
import './ResumenPagos.css';

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const pesos = (v) => formatoARS.format(Math.round(v));
const firmado = (v) => `${v < 0 ? '−' : '+'}${formatoARS.format(Math.abs(Math.round(v)))}`;
const cantidad = (n, uno, varios) => `${n.toLocaleString('es-AR')} ${n === 1 ? uno : varios}`;
const mesVacio = (m) => !m.ingresos && !m.egresos && !m.aCobrar && !m.sinMonto;

/** 2.000.000 -> "2 M", 2.500.000 -> "2,5 M", 320.740 -> "321 mil". Para el eje. */
function etiquetaCorta(v) {
  if (v >= 1e6) return `${(v / 1e6).toFixed(1).replace('.', ',').replace(/,0$/, '')} M`;
  if (v >= 1e3) return `${Math.round(v / 1e3)} mil`;
  return String(Math.round(v));
}

/** Paso "redondo" para las lineas del eje: 1, 2, 2.5 o 5 por la potencia de diez. */
function pasoRedondo(v) {
  if (!(v > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const f = v / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}

export default function ResumenPagos({ consultorioId, consultorio, anio, onVerMes }) {
  const [pagadas, setPagadas] = useState([]);
  const [delAnio, setDelAnio] = useState([]);
  const [gastos, setGastos] = useState([]);
  const [pagosMP, setPagosMP] = useState([]);
  const [miembros, setMiembros] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [abiertos, setAbiertos] = useState(() => new Set());

  useEffect(() => {
    if (!consultorioId) return undefined;
    setCargando(true);
    return suscribirSesionesPagadas(consultorioId, (d) => { setPagadas(d); setCargando(false); });
  }, [consultorioId]);

  // Lo que todavia se debe va por el mes de la sesion: hacen falta las
  // sesiones del anio en cualquier estado, no solo las pagadas.
  useEffect(() => {
    if (!consultorioId) return undefined;
    return suscribirSesionesConsultorio(consultorioId, setDelAnio, {
      desde: new Date(anio, 0, 1, 0, 0, 0),
      hasta: new Date(anio, 11, 31, 23, 59, 59),
    });
  }, [consultorioId, anio]);

  useEffect(() => {
    if (!consultorioId) return undefined;
    return suscribirGastos(consultorioId, setGastos);
  }, [consultorioId]);

  useEffect(() => {
    if (!consultorioId) return undefined;
    return suscribirPagosDelConsultorio(consultorioId, (data) => {
      setPagosMP(data.filter((p) => p.estado === 'aprobado'));
    });
  }, [consultorioId]);

  useEffect(() => {
    if (!consultorioId) return undefined;
    return suscribirMiembrosConsultorio(consultorioId, setMiembros);
  }, [consultorioId]);

  // Cambiar de anio cierra lo que estaba abierto: julio de otro anio es otro mes.
  useEffect(() => { setAbiertos(new Set()); }, [anio]);

  const cuentas = useMemo(() => cuentasDeCaja({
    adminUids: consultorio?.adminUids || [],
    miembros,
    conMP: mpHabilitado(consultorio) || hayMPEnRango(pagosMP, `${anio}-01-01`, `${anio}-12-31`),
  }), [consultorio, miembros, pagosMP, anio]);

  const { meses, total } = useMemo(() => {
    const libro = armarLibro({
      // Mismo filtro que el libro de caja, para que los dos sumen lo mismo.
      sesionesPagadas: pagadas.filter((s) => s.estadoPago === ESTADOS_PAGO_SESION.PAGADO),
      pagosMP: pagosMP.map((p) => ({ ...p, montoConsultorio: montoNetoEfectivo(p) })),
      gastos,
      cuentas,
    });
    return serieAnual({ movimientos: libro.movimientos, sesiones: delAnio, anio, cuentas });
  }, [pagadas, pagosMP, gastos, cuentas, delAnio, anio]);

  const hoy = new Date();
  const mesActual = hoy.getFullYear() === anio ? hoy.getMonth() : -1;
  const saldoAnio = total.ingresos - total.egresos;
  const mesesConGastos = meses.filter((m) => m.egresos > 0).length;

  function alternar(mes) {
    setAbiertos((prev) => {
      const n = new Set(prev);
      if (n.has(mes)) n.delete(mes); else n.add(mes);
      return n;
    });
  }

  if (cargando && pagadas.length === 0 && gastos.length === 0) {
    return (
      <div style={{ padding: 50, display: 'flex', justifyContent: 'center' }}>
        <Spinner size={22} label="Cargando el resumen…" />
      </div>
    );
  }

  return (
    <div className="cp-rs">
      <div className="cp-rs__banda">
        <div className="cp-rs__kpis">
          <Cifra
            etiqueta={`Ingresos ${anio}`} marca="in" valor={pesos(total.ingresos)}
            pista={cantidad(total.sesionesCobradas, 'sesión cobrada', 'sesiones cobradas')}
          />
          <Cifra
            etiqueta={`Egresos ${anio}`} marca="out" valor={pesos(total.egresos)}
            pista={mesesConGastos ? `gastos en ${cantidad(mesesConGastos, 'mes', 'meses')}` : 'sin gastos cargados'}
          />
          <Cifra
            etiqueta="Saldo" negativo={saldoAnio < 0}
            valor={`${saldoAnio < 0 ? '−' : ''}${pesos(Math.abs(saldoAnio))}`}
            pista="ingresos menos egresos"
          />
          <Cifra
            etiqueta="A cobrar" valor={pesos(total.aCobrar)}
            pista={total.sinMonto
              ? `+ ${cantidad(total.sinMonto, 'sesión sin monto', 'sesiones sin monto')}`
              : 'sesiones que todavía se deben'}
          />
        </div>
        <GraficoMensual
          meses={meses} anio={anio} mesActual={mesActual}
          onElegir={(m) => { if (!mesVacio(meses[m])) setAbiertos((p) => new Set(p).add(m)); }}
        />
      </div>

      <div className="cp-rs__tabla" role="table" aria-label={`Comparativo mensual ${anio}`}>
        <div className="cp-rs__grid" role="row">
          <span role="columnheader">Mes</span>
          <span role="columnheader" className="cp-rs__num"><i className="cp-rs__dot cp-rs__dot--in" aria-hidden="true" />Ingresos</span>
          <span role="columnheader" className="cp-rs__num"><i className="cp-rs__dot cp-rs__dot--out" aria-hidden="true" />Egresos</span>
          <span role="columnheader" className="cp-rs__num">Saldo</span>
          <span role="columnheader" className="cp-rs__num" title="Sesiones de ese mes que todavía se deben">A cobrar</span>
          <span aria-hidden="true" />
        </div>

        {tramos(meses).map((t) => (t.vacio
          ? <FilaVacia key={`v${t.desde}`} desde={t.desde} hasta={t.hasta} />
          : (
            <FilaMes
              key={t.mes.mes}
              m={t.mes}
              hoy={t.mes.mes === mesActual}
              abierto={abiertos.has(t.mes.mes)}
              cuentas={cuentas}
              onAlternar={() => alternar(t.mes.mes)}
              onVerMes={onVerMes}
            />
          )))}

        <div className="cp-rs__fila cp-rs__fila--total" role="row">
          <span className="cp-rs__mes" role="cell">Total {anio}</span>
          <span className="cp-rs__num cp-rs__c-in" role="cell">{pesos(total.ingresos)}</span>
          <span className="cp-rs__num cp-rs__c-out" role="cell">{pesos(total.egresos)}</span>
          <span className={`cp-rs__num cp-rs__c-saldo ${saldoAnio < 0 ? 'cp-rs__neg' : ''}`} role="cell">{firmado(saldoAnio)}</span>
          <span className="cp-rs__num cp-rs__c-cob" role="cell">{pesos(total.aCobrar)}</span>
          <LineaMobile m={total} />
          <span aria-hidden="true" />
        </div>
      </div>

      <p className="cp-rs__nota">
        Ingresos por fecha de cobro y egresos por fecha del gasto. <b>A cobrar</b> son sesiones de ese mes que
        todavía se deben; <b>sin monto</b>, sesiones de obra social que aún no liquidaron. Tocá un mes para ver cada caja.
      </p>
    </div>
  );
}

/* Los meses sin nada se juntan de a tramos: tres renglones de guiones no
   dicen mas que uno solo con "sin movimientos", y es el alto que hace
   falta para que la tabla entre sin scrollear. */
function tramos(meses) {
  const out = [];
  for (let i = 0; i < meses.length;) {
    if (!mesVacio(meses[i])) { out.push({ vacio: false, mes: meses[i] }); i += 1; continue; }
    let j = i;
    while (j + 1 < meses.length && mesVacio(meses[j + 1])) j += 1;
    out.push({ vacio: true, desde: i, hasta: j });
    i = j + 1;
  }
  return out;
}

function Cifra({ etiqueta, valor, pista, marca, negativo }) {
  return (
    <div className="cp-rs__kpi">
      <span className="cp-rs__kpi-label">
        {marca && <i className={`cp-rs__dot cp-rs__dot--${marca}`} aria-hidden="true" />}
        {etiqueta}
      </span>
      <span className={`cp-rs__kpi-valor ${negativo ? 'cp-rs__neg' : ''}`}>{valor}</span>
      <span className="cp-rs__kpi-pista">{pista}</span>
    </div>
  );
}

function FilaVacia({ desde, hasta }) {
  const nombre = desde === hasta ? MESES[desde] : `${MESES[desde]} – ${MESES[hasta].toLowerCase()}`;
  return (
    <div className="cp-rs__fila cp-rs__fila--vacia" role="row">
      <span className="cp-rs__mes" role="cell">{nombre}</span>
      <span className="cp-rs__vacio-txt" role="cell">Sin movimientos</span>
    </div>
  );
}

/* En celular las cuatro columnas no entran; cada mes pasa a dos renglones:
   arriba el saldo, abajo los otros tres numeros completos. No se esconde
   ninguno. En desktop esta linea no se ve (y no la lee un lector de
   pantalla, que ya tiene las celdas). */
function LineaMobile({ m }) {
  const v = (n) => (n ? pesos(n) : '—');
  return (
    <span className="cp-rs__m-linea" aria-hidden="true">
      Ing. <b>{v(m.ingresos)}</b> · Egr. <b>{v(m.egresos)}</b> · A cobrar <b>{v(m.aCobrar)}</b>
      {m.sinMonto > 0 && ` + ${m.sinMonto} sin monto`}
    </span>
  );
}

function FilaMes({ m, hoy, abierto, cuentas, onAlternar, onVerMes }) {
  const saldo = m.ingresos - m.egresos;
  const idDetalle = `cp-rs-detalle-${m.mes}`;
  // Las cajas de los admins, mas la de "no se marco quien cobro" si ese mes hubo.
  const cajas = [...cuentas, CAJA_SIN_RECEPTOR]
    .map((c) => ({ ...c, ...(m.porCuenta[c.id] || { ingresos: 0, egresos: 0 }) }))
    .filter((c) => c.id !== 'sin_asignar' || c.ingresos || c.egresos);

  return (
    <>
      <div
        className={`cp-rs__fila ${hoy ? 'cp-rs__fila--hoy' : ''} ${abierto ? 'cp-rs__fila--abierta' : ''}`}
        role="row"
        onClick={onAlternar}
      >
        <span className="cp-rs__mes" role="cell">
          {/* El boton es lo que se enfoca con teclado; el click en el resto
              de la fila es comodidad para el mouse. */}
          <button
            type="button"
            className="cp-rs__toggle"
            aria-expanded={abierto}
            aria-controls={abierto ? idDetalle : undefined}
            onClick={(e) => { e.stopPropagation(); onAlternar(); }}
          >
            {MESES[m.mes]}
          </button>
          {hoy && <span className="cp-rs__badge">en curso</span>}
        </span>
        <span className="cp-rs__num cp-rs__c-in" role="cell">{m.ingresos ? pesos(m.ingresos) : '—'}</span>
        <span className="cp-rs__num cp-rs__c-out" role="cell">{m.egresos ? pesos(m.egresos) : '—'}</span>
        <span className={`cp-rs__num cp-rs__c-saldo ${saldo < 0 ? 'cp-rs__neg' : ''}`} role="cell">
          {saldo ? firmado(saldo) : '—'}
        </span>
        <span className="cp-rs__num cp-rs__c-cob" role="cell">
          {m.aCobrar ? pesos(m.aCobrar) : (m.sinMonto ? '' : '—')}
          {m.sinMonto > 0 && <span className="cp-rs__sub">+ {m.sinMonto} sin monto</span>}
        </span>
        <LineaMobile m={m} />
        <span className={`cp-rs__chev ${abierto ? 'cp-rs__chev--on' : ''}`} aria-hidden="true">›</span>
      </div>

      {abierto && (
        <div className="cp-rs__detalle" role="row" id={idDetalle}>
          <div className="cp-rs__detalle-cuerpo" role="cell">
            {cajas.map((c) => {
              const s = c.ingresos - c.egresos;
              return (
                <div key={c.id} className="cp-rs__caja">
                  <span className="cp-rs__caja-nom" title={c.completo}>{c.nombre}</span>
                  <span className="cp-rs__caja-k">Ingresos</span>
                  <span className="cp-rs__caja-v">{c.ingresos ? pesos(c.ingresos) : '—'}</span>
                  <span className="cp-rs__caja-k">Egresos</span>
                  <span className="cp-rs__caja-v">{c.egresos ? `−${pesos(c.egresos)}` : '—'}</span>
                  <span className="cp-rs__caja-k">Saldo</span>
                  <span className={`cp-rs__caja-v ${s < 0 ? 'cp-rs__neg' : ''}`}>{s ? firmado(s) : '—'}</span>
                </div>
              );
            })}
            <div className="cp-rs__detalle-pie">
              <span>
                {cantidad(m.sesionesCobradas, 'sesión cobrada', 'sesiones cobradas')}
                {' · '}
                {cantidad(m.gastos, 'gasto cargado', 'gastos cargados')}
              </span>
              {onVerMes && (
                <button type="button" className="cp-rs__link" onClick={() => onVerMes(m.mes)}>
                  Ver movimientos de {MESES[m.mes].toLowerCase()} →
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ============================================================
   Grafico: barras agrupadas de ingresos y egresos por mes
   ----------------------------------------------------------------
   Un solo eje: las dos series son pesos. Barras finas con la punta
   redondeada y la base recta sobre el eje, 2px de aire entre las dos de
   un mes, y etiquetas solo en el pico de ingresos y en los egresos: un
   numero en cada barra tapa la forma. Al pasar el mouse por un mes sale
   el detalle; los mismos datos estan en la tabla de abajo, que es la
   version accesible.
   ============================================================ */
function GraficoMensual({ meses, anio, mesActual, onElegir }) {
  const ref = useRef(null);
  const [caja, setCaja] = useState({ w: 600, h: 150 });
  const [hover, setHover] = useState(null); // { i, x, y, ancho } relativo al contenedor

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const medir = () => {
      const svg = el.querySelector('svg');
      if (svg && svg.clientWidth) setCaja({ w: svg.clientWidth, h: svg.clientHeight || 150 });
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const W = Math.max(280, caja.w);
  const H = caja.h;
  const izq = 40; const der = 4; const arr = 14; const abj = 20;
  const pw = W - izq - der;
  const ph = H - arr - abj;
  const max = Math.max(...meses.map((m) => Math.max(m.ingresos, m.egresos)), 0);
  const paso = pasoRedondo(max / 3);
  const tope = max > 0 ? Math.ceil(max / paso) * paso : paso;
  const y = (v) => arr + ph - (v / tope) * ph;
  const gw = pw / 12;
  const bw = Math.max(4, Math.min(14, (gw - 10) / 2));
  const base = arr + ph;
  const pico = meses.reduce((a, m) => (m.ingresos > a.ingresos ? m : a), meses[0]);

  const barra = (x, v, cls) => {
    if (!(v > 0)) return null;
    const h = Math.max(2, (v / tope) * ph);
    const r = Math.min(4, bw / 2, h);
    const d = `M${x},${base} V${base - h + r} Q${x},${base - h} ${x + r},${base - h}`
      + ` H${x + bw - r} Q${x + bw},${base - h} ${x + bw},${base - h + r} V${base} Z`;
    return <path className={cls} d={d} />;
  };

  const lineas = [];
  for (let v = 0; v <= tope + 1e-6; v += paso) lineas.push(v);

  const mHover = hover ? meses[hover.i] : null;

  return (
    <div className="cp-rs__chart" ref={ref}>
      <div className="cp-rs__chart-head">
        <span className="cp-rs__chart-titulo">Ingresos y egresos por mes</span>
        <span className="cp-rs__leyenda">
          <span><i className="cp-rs__dot cp-rs__dot--in" aria-hidden="true" />Ingresos</span>
          <span><i className="cp-rs__dot cp-rs__dot--out" aria-hidden="true" />Egresos</span>
        </span>
      </div>
      <svg
        className="cp-rs__svg"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Ingresos y egresos por mes de ${anio}. Los mismos números están en la tabla de abajo.`}
        onMouseLeave={() => setHover(null)}
      >
        {lineas.map((v) => (
          <g key={v}>
            <line className={v === 0 ? 'cp-rs__base' : 'cp-rs__grid-l'} x1={izq} x2={W - der} y1={y(v)} y2={y(v)} />
            <text className="cp-rs__eje" x={izq - 6} y={y(v) + 3.5} textAnchor="end">{v === 0 ? '0' : etiquetaCorta(v)}</text>
          </g>
        ))}
        {meses.map((m, i) => {
          const gx = izq + i * gw;
          const cx = gx + gw / 2;
          return (
            <g key={m.mes}>
              <rect
                className={`cp-rs__hit ${hover?.i === i ? 'cp-rs__hit--on' : ''}`}
                x={gx + 1} y={arr} width={Math.max(0, gw - 2)} height={ph} rx="4"
                onMouseMove={(e) => {
                  // El ancho se toma aca y no al pintar: leer el ref en el render
                  // no se re-evalua cuando cambia.
                  const r = ref.current.getBoundingClientRect();
                  setHover({ i, x: e.clientX - r.left, y: e.clientY - r.top, ancho: r.width });
                }}
                onClick={() => onElegir(i)}
              />
              {barra(cx - bw - 1, m.ingresos, 'cp-rs__bar-in')}
              {barra(cx + 1, m.egresos, 'cp-rs__bar-out')}
              {m === pico && m.ingresos > 0 && (
                <text className="cp-rs__etq" x={cx - bw / 2 - 1} y={y(m.ingresos) - 4} textAnchor="middle">
                  {etiquetaCorta(m.ingresos)}
                </text>
              )}
              {m.egresos > 0 && (
                <text className="cp-rs__etq" x={cx + bw / 2 + 1} y={y(m.egresos) - 4} textAnchor="middle">
                  {etiquetaCorta(m.egresos)}
                </text>
              )}
              <text className={`cp-rs__mes-eje ${i === mesActual ? 'cp-rs__mes-eje--hoy' : ''}`} x={cx} y={H - 5} textAnchor="middle">
                {MESES_CORTOS[i]}
              </text>
            </g>
          );
        })}
      </svg>

      {mHover && (
        <div
          className="cp-rs__tip"
          role="tooltip"
          style={{
            left: Math.min(Math.max(8, hover.x + 14), hover.ancho - 200),
            top: Math.max(4, hover.y - 96),
          }}
        >
          <b>{MESES[mHover.mes]} {anio}</b>
          <span className="cp-rs__tip-r"><span><i className="cp-rs__dot cp-rs__dot--in" />Ingresos</span><span>{pesos(mHover.ingresos)}</span></span>
          <span className="cp-rs__tip-r"><span><i className="cp-rs__dot cp-rs__dot--out" />Egresos</span><span>{pesos(mHover.egresos)}</span></span>
          <span className="cp-rs__tip-r"><span>Saldo</span><span>{firmado(mHover.ingresos - mHover.egresos)}</span></span>
          {mHover.aCobrar > 0 && (
            <span className="cp-rs__tip-r"><span>A cobrar</span><span>{pesos(mHover.aCobrar)}</span></span>
          )}
        </div>
      )}
    </div>
  );
}
