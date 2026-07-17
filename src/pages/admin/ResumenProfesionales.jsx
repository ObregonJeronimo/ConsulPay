/*
  ResumenProfesionales — vista rápida para el admin: una matriz de
  profesionales (filas) × meses del año (columnas). Cada celda resume el
  estado de ese profesional en ese mes:
    - monto en coral  → lo que todavía debe al consultorio
    - check           → todo pagado y nada por liquidar
    - "?"             → tiene sesiones de obra social sin monto (a liquidar)
    - vacío           → no trabajó ese mes

  Está pensada para que entre todo en una pantalla. En móvil la tabla
  scrollea horizontal con la columna del profesional fija.
*/

import { useEffect, useMemo, useState } from 'react';

import Avatar from '../../components/ui/Avatar.jsx';
import Spinner from '../../components/ui/Spinner.jsx';

import { ESTADOS_PAGO_SESION, formatoARS } from '../../lib/constants.js';
import { suscribirSesionesConsultorio } from '../../lib/sesiones.js';

import './ResumenProfesionales.css';

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function fechaDeSesion(s) {
  const f = s.fecha;
  if (!f) return null;
  if (f.toDate) return f.toDate();
  if (f.seconds !== undefined) return new Date(f.seconds * 1000);
  const d = new Date(f);
  return isNaN(d.getTime()) ? null : d;
}

/* Monto compacto legible: 45.200 → "45 mil" (para que entren 12 columnas) */
function montoCompacto(n) {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1).replace('.', ',')} M`;
  if (n >= 1000) return `${Math.round(n / 1000)} mil`;
  return String(n);
}

const CheckMini = () => (
  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor"
    strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

export default function ResumenProfesionales({ consultorioId, profesionales }) {
  const [sesiones, setSesiones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [anio, setAnio] = useState(() => new Date().getFullYear());

  useEffect(() => {
    if (!consultorioId) return;
    setLoading(true);
    const desde = new Date(anio, 0, 1, 0, 0, 0);
    const hasta = new Date(anio, 11, 31, 23, 59, 59);
    const unsub = suscribirSesionesConsultorio(
      consultorioId,
      (data) => { setSesiones(data); setLoading(false); },
      { desde, hasta },
    );
    return unsub;
  }, [consultorioId, anio]);

  // Matriz: uid del profesional → array de 12 meses con su resumen
  const filas = useMemo(() => {
    const activos = (profesionales || []).filter((p) => p?.uid);
    const base = {};
    for (const p of activos) {
      base[p.uid] = {
        uid: p.uid,
        nombre: p.displayName || p.email || 'Profesional',
        meses: Array.from({ length: 12 }, () => ({ debe: 0, porLiquidar: 0, sesiones: 0 })),
        totalDebe: 0,
      };
    }
    for (const s of (sesiones || [])) {
      const fila = base[s.profesionalUid];
      if (!fila) continue;
      const d = fechaDeSesion(s);
      if (!d || d.getFullYear() !== anio) continue;
      const celda = fila.meses[d.getMonth()];
      celda.sesiones += 1;
      if (s.estadoPago === ESTADOS_PAGO_SESION.PENDIENTE_MONTO) {
        celda.porLiquidar += 1;
      } else if (s.estadoPago === ESTADOS_PAGO_SESION.DEBIDO) {
        const m = s.montoConsultorio || 0;
        celda.debe += m;
        fila.totalDebe += m;
      }
    }
    // Primero los que deben más, después alfabético
    return Object.values(base).sort((a, b) => {
      if (a.totalDebe !== b.totalDebe) return b.totalDebe - a.totalDebe;
      return a.nombre.localeCompare(b.nombre);
    });
  }, [sesiones, profesionales, anio]);

  const mesActual = new Date().getFullYear() === anio ? new Date().getMonth() : -1;
  const totalGeneral = filas.reduce((acc, f) => acc + f.totalDebe, 0);

  return (
    <section className="cp-rp">
      <header className="cp-rp__head">
        <div>
          <h2 className="cp-rp__title">Estado por profesional</h2>
          <p className="cp-rp__sub">
            Lo que cada profesional debe al consultorio, mes a mes.
          </p>
        </div>
        <div className="cp-rp__anio">
          <button
            className="cp-rp__anio-btn"
            onClick={() => setAnio((a) => a - 1)}
            aria-label="Año anterior"
          >‹</button>
          <span className="cp-rp__anio-val">{anio}</span>
          <button
            className="cp-rp__anio-btn"
            onClick={() => setAnio((a) => a + 1)}
            disabled={anio >= new Date().getFullYear()}
            aria-label="Año siguiente"
          >›</button>
        </div>
      </header>

      {loading && sesiones.length === 0 ? (
        <div className="cp-rp__loading"><Spinner size={20} label="Cargando…" /></div>
      ) : filas.length === 0 ? (
        <p className="cp-rp__empty">Todavía no hay profesionales en el consultorio.</p>
      ) : (
        <>
          <div className="cp-rp__scroll">
            <table className="cp-rp__tabla">
              <thead>
                <tr>
                  <th className="cp-rp__th-prof">Profesional</th>
                  {MESES_CORTOS.map((m, i) => (
                    <th
                      key={m}
                      className={`cp-rp__th-mes ${i === mesActual ? 'cp-rp__th-mes--actual' : ''}`}
                    >
                      {m}
                    </th>
                  ))}
                  <th className="cp-rp__th-total">Debe</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.uid}>
                    <td className="cp-rp__td-prof">
                      <Avatar initials={(f.nombre[0] || '?').toUpperCase()} size={24} />
                      <span className="cp-rp__prof-nombre" title={f.nombre}>{f.nombre}</span>
                    </td>
                    {f.meses.map((c, i) => (
                      <td
                        key={i}
                        className={`cp-rp__celda ${i === mesActual ? 'cp-rp__celda--actual' : ''}`}
                        title={
                          c.sesiones === 0
                            ? 'Sin sesiones'
                            : `${c.sesiones} sesión${c.sesiones === 1 ? '' : 'es'}`
                            + (c.debe > 0 ? ` · debe ${formatoARS.format(c.debe)}` : '')
                            + (c.porLiquidar > 0 ? ` · ${c.porLiquidar} a liquidar` : '')
                        }
                      >
                        {c.sesiones === 0 ? (
                          <span className="cp-rp__vacio">·</span>
                        ) : (
                          <span className="cp-rp__celda-in">
                            {c.debe > 0 && (
                              <span className="cp-rp__debe">{montoCompacto(c.debe)}</span>
                            )}
                            {c.debe === 0 && c.porLiquidar === 0 && (
                              <span className="cp-rp__ok"><CheckMini /></span>
                            )}
                            {c.porLiquidar > 0 && (
                              <span className="cp-rp__liq" title={`${c.porLiquidar} a liquidar`}>?</span>
                            )}
                          </span>
                        )}
                      </td>
                    ))}
                    <td className="cp-rp__td-total">
                      {f.totalDebe > 0
                        ? <span className="cp-rp__total-val">{formatoARS.format(f.totalDebe)}</span>
                        : <span className="cp-rp__total-ok"><CheckMini /> al día</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="cp-rp__td-prof cp-rp__foot-label">Total del año</td>
                  <td colSpan={12} />
                  <td className="cp-rp__td-total cp-rp__foot-total">
                    {formatoARS.format(totalGeneral)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="cp-rp__leyenda">
            <span className="cp-rp__leyenda-item">
              <span className="cp-rp__debe">45 mil</span> debe al consultorio
            </span>
            <span className="cp-rp__leyenda-item">
              <span className="cp-rp__ok"><CheckMini /></span> al día
            </span>
            <span className="cp-rp__leyenda-item">
              <span className="cp-rp__liq">?</span> a liquidar (obra social sin monto)
            </span>
          </div>
        </>
      )}
    </section>
  );
}
