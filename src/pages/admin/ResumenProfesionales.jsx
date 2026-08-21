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
import { getCantidadSesiones, suscribirSesionesConsultorio } from '../../lib/sesiones.js';

import { MESES_CORTOS, fechaDeSesion, montoCompacto } from './resumenAnual.js';
import './ResumenProfesionales.css';

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
        meses: Array.from({ length: 12 }, () => ({
          debe: 0, porLiquidar: 0, pacientes: new Set(), encuentros: 0,
        })),
        totalDebe: 0,
      };
    }
    for (const s of (sesiones || [])) {
      const fila = base[s.profesionalUid];
      if (!fila) continue;
      const d = fechaDeSesion(s);
      if (!d || d.getFullYear() !== anio) continue;
      const celda = fila.meses[d.getMonth()];
      // Cada registro es un paciente con N sesiones adentro.
      if (s.pacienteId) celda.pacientes.add(s.pacienteId);
      celda.encuentros += getCantidadSesiones(s);
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

  /* Total de cada mes: cuanto debe el consultorio entero en esa columna.
     El pie de la tabla tenia un colSpan={12} vacio y solo mostraba el total
     del anio, asi que para saber cuanto se debia en, digamos, junio, habia
     que sumar la columna a ojo. */
  const totalesPorMes = useMemo(() => {
    const tot = Array.from({ length: 12 }, () => ({ debe: 0, porLiquidar: 0 }));
    for (const f of filas) {
      f.meses.forEach((c, i) => {
        tot[i].debe += c.debe;
        tot[i].porLiquidar += c.porLiquidar;
      });
    }
    return tot;
  }, [filas]);

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
                          c.pacientes.size === 0
                            ? 'Sin pacientes este mes'
                            : `${c.pacientes.size} paciente${c.pacientes.size === 1 ? '' : 's'}`
                            + ` · ${c.encuentros} ${c.encuentros === 1 ? 'sesión' : 'sesiones'}`
                            + (c.debe > 0 ? ` · debe ${formatoARS.format(c.debe)}` : '')
                            + (c.porLiquidar > 0 ? ` · ${c.porLiquidar} a liquidar` : '')
                        }
                      >
                        {c.pacientes.size === 0 ? (
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
                  <td className="cp-rp__td-prof cp-rp__foot-label">Total del mes</td>
                  {totalesPorMes.map((t, i) => (
                    <td
                      key={i}
                      className={`cp-rp__celda cp-rp__foot-mes ${i === mesActual ? 'cp-rp__celda--actual' : ''}`}
                      title={
                        t.debe === 0 && t.porLiquidar === 0
                          ? 'Sin deuda en este mes'
                          : `${formatoARS.format(t.debe)} de deuda`
                            + (t.porLiquidar > 0 ? ` · ${t.porLiquidar} a liquidar` : '')
                      }
                    >
                      {t.debe > 0
                        ? <span className="cp-rp__debe">{montoCompacto(t.debe)}</span>
                        : <span className="cp-rp__vacio">·</span>}
                    </td>
                  ))}
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
