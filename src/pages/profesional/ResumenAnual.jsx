import { useMemo, useState } from 'react';

import { ESTADOS_PAGO_SESION, formatoARS } from '../../lib/constants.js';

import './ResumenAnual.css';

/* ============================================================
   Resumen anual del profesional — 12 cards (una por mes)
   ----------------------------------------------------------------
   Por cada mes del año muestra el estado de las sesiones del
   profesional según la FECHA DE LA SESIÓN:
     - Todo pagado y nada por liquidar → estado OK (ícono check)
     - Sesiones debidas (con valor, sin pagar) → lista de pacientes
       con el monto que se debe al consultorio
     - Sesiones por liquidar (obra social sin valor todavía) →
       lista de pacientes con un símbolo de pregunta en el valor
   ============================================================ */

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const MESES_CORTO = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function fechaDeSesion(s) {
  const f = s.fecha;
  if (!f) return null;
  if (f.toDate) return f.toDate();
  if (f.seconds !== undefined) return new Date(f.seconds * 1000);
  const d = new Date(f);
  return isNaN(d.getTime()) ? null : d;
}

function nombrePac(s, mapaPacientes) {
  const pac = mapaPacientes?.[s.pacienteId];
  if (pac) return `${pac.apellido ?? ''}${pac.apellido && pac.nombre ? ', ' : ''}${pac.nombre ?? ''}`.trim();
  return s.pacienteNombre || 'Paciente';
}

const IconOk = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

export default function ResumenAnual({ sesiones, mapaPacientes, anio }) {
  const [expandido, setExpandido] = useState(null); // índice de mes expandido en móvil
  const year = anio || new Date().getFullYear();

  const meses = useMemo(() => {
    // Inicializar 12 meses
    const arr = Array.from({ length: 12 }, (_, i) => ({
      mes: i,
      debidas: [],       // { nombre, monto }
      porLiquidar: [],   // { nombre }
      totalDebido: 0,
    }));

    for (const s of sesiones) {
      const d = fechaDeSesion(s);
      if (!d || d.getFullYear() !== year) continue;
      const m = d.getMonth();
      if (s.estadoPago === ESTADOS_PAGO_SESION.DEBIDO) {
        arr[m].debidas.push({ nombre: nombrePac(s, mapaPacientes), monto: s.montoConsultorio || 0 });
        arr[m].totalDebido += s.montoConsultorio || 0;
      } else if (s.estadoPago === ESTADOS_PAGO_SESION.PENDIENTE_MONTO) {
        arr[m].porLiquidar.push({ nombre: nombrePac(s, mapaPacientes) });
      }
    }
    return arr;
  }, [sesiones, mapaPacientes, year]);

  const hoy = new Date();
  const mesActual = hoy.getFullYear() === year ? hoy.getMonth() : -1;

  return (
    <section className="cp-resumen-anual" aria-label={`Resumen ${year}`}>
      <div className="cp-resumen-anual__head">
        <h2 className="cp-resumen-anual__title">Tu año {year}</h2>
        <p className="cp-resumen-anual__sub">
          Estado mes a mes: lo que debés al consultorio y lo que falta liquidar de obra social.
        </p>
      </div>

      <div className="cp-resumen-anual__grid">
        {meses.map((m) => {
          const tienePendientes = m.debidas.length > 0 || m.porLiquidar.length > 0;
          const estaOk = !tienePendientes;
          const esActual = m.mes === mesActual;
          const abierto = expandido === m.mes;

          return (
            <div
              key={m.mes}
              className={`cp-mes-card ${estaOk ? 'cp-mes-card--ok' : 'cp-mes-card--pend'} ${esActual ? 'cp-mes-card--actual' : ''} ${abierto ? 'cp-mes-card--abierto' : ''}`}
              onClick={() => tienePendientes && setExpandido(abierto ? null : m.mes)}
            >
              <div className="cp-mes-card__head">
                <span className="cp-mes-card__nombre">
                  {MESES[m.mes]}
                  {esActual && <span className="cp-mes-card__actual-dot" title="Mes actual" />}
                </span>
                {estaOk ? (
                  <span className="cp-mes-card__ok"><IconOk /></span>
                ) : (
                  <span className="cp-mes-card__badge">
                    {m.debidas.length + m.porLiquidar.length}
                  </span>
                )}
              </div>

              {estaOk ? (
                <div className="cp-mes-card__ok-text">Todo al día</div>
              ) : (
                <div className="cp-mes-card__body">
                  {m.debidas.length > 0 && (
                    <div className="cp-mes-card__seccion">
                      <div className="cp-mes-card__seccion-label">Debés</div>
                      <ul className="cp-mes-card__lista">
                        {m.debidas.map((p, i) => (
                          <li key={i} className="cp-mes-card__item">
                            <span className="cp-mes-card__pac">{p.nombre}</span>
                            <span className="cp-mes-card__monto">{formatoARS.format(p.monto)}</span>
                          </li>
                        ))}
                      </ul>
                      <div className="cp-mes-card__subtotal">
                        <span>Total</span>
                        <span>{formatoARS.format(m.totalDebido)}</span>
                      </div>
                    </div>
                  )}

                  {m.porLiquidar.length > 0 && (
                    <div className="cp-mes-card__seccion">
                      <div className="cp-mes-card__seccion-label">Por liquidar (obra social)</div>
                      <ul className="cp-mes-card__lista">
                        {m.porLiquidar.map((p, i) => (
                          <li key={i} className="cp-mes-card__item">
                            <span className="cp-mes-card__pac">{p.nombre}</span>
                            <span className="cp-mes-card__monto cp-mes-card__monto--q">?</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
