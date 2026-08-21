/*
  ResumenPacientes — la misma matriz que ResumenProfesionales pero un nivel
  más abajo: se elige un profesional y las filas pasan a ser sus pacientes.
  Responde "¿de quién viene lo que este profesional debe?", que la tabla de
  arriba no puede contestar porque agrega todo en un número por mes.

  Comparte el CSS y los criterios de celda con ResumenProfesionales (ver
  resumenAnual.js): monto en coral es deuda, check es saldado, "?" es obra
  social sin liquidar, punto es que no hubo sesiones.
*/

import { useEffect, useMemo, useState } from 'react';

import Avatar from '../../components/ui/Avatar.jsx';
import Spinner from '../../components/ui/Spinner.jsx';

import { ESTADOS_PAGO_SESION, formatoARS } from '../../lib/constants.js';
import { suscribirPacientesConsultorio } from '../../lib/pacientes.js';
import { getCantidadSesiones, suscribirSesionesConsultorio } from '../../lib/sesiones.js';

import { MESES_CORTOS, acumularSesion, celdaVacia, fechaDeSesion, montoCompacto } from './resumenAnual.js';
import './ResumenProfesionales.css';

const CheckMini = () => (
  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor"
    strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

function nombreDePaciente(p, fallback) {
  if (!p) return fallback || 'Paciente';
  const s = `${p.apellido ?? ''}${p.apellido && p.nombre ? ', ' : ''}${p.nombre ?? ''}`.trim();
  return s || fallback || 'Paciente';
}

export default function ResumenPacientes({ consultorioId, profesionales }) {
  const [sesiones, setSesiones] = useState([]);
  const [pacientes, setPacientes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [anio, setAnio] = useState(() => new Date().getFullYear());

  /* Arranca en el profesional que más debe. Es el que se va a mirar primero
     y evita abrir la tabla en un estado vacío pidiendo que elijas. */
  const [profUid, setProfUid] = useState('');

  const activos = useMemo(
    () => (profesionales || []).filter((p) => p?.uid && p.estado === 'activo'),
    [profesionales],
  );

  useEffect(() => {
    if (!consultorioId) return undefined;
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

  useEffect(() => {
    if (!consultorioId) return undefined;
    return suscribirPacientesConsultorio(consultorioId, setPacientes);
  }, [consultorioId]);

  const mapaPacientes = useMemo(() => {
    const m = {};
    for (const p of pacientes) m[p.id] = p;
    return m;
  }, [pacientes]);

  /* Cuánto debe cada profesional en el año, solo para elegir el inicial y
     para mostrarlo al lado de su nombre en el selector. */
  const deudaPorProfesional = useMemo(() => {
    const tot = {};
    for (const s of (sesiones || [])) {
      if (!s.profesionalUid) continue;
      if (s.estadoPago !== ESTADOS_PAGO_SESION.DEBIDO) continue;
      tot[s.profesionalUid] = (tot[s.profesionalUid] || 0) + (s.montoConsultorio || 0);
    }
    return tot;
  }, [sesiones]);

  /* La eleccion inicial espera a que carguen las sesiones. Sin el chequeo
     de loading, este efecto corria con deudaPorProfesional todavia vacio,
     elegia al primero de la lista y despues ya no volvia a tocar nada:
     prometia "el que mas debe" y abria en cualquiera. */
  const [yaEligio, setYaEligio] = useState(false);
  useEffect(() => {
    if (yaEligio || loading || activos.length === 0) return;
    const conMasDeuda = [...activos].sort(
      (a, b) => (deudaPorProfesional[b.uid] || 0) - (deudaPorProfesional[a.uid] || 0),
    )[0];
    setProfUid(conMasDeuda.uid);
    setYaEligio(true);
  }, [activos, deudaPorProfesional, loading, yaEligio]);

  // Si el profesional elegido deja de estar activo, se vuelve al primero.
  useEffect(() => {
    if (!profUid || activos.length === 0) return;
    if (!activos.some((p) => p.uid === profUid)) setProfUid(activos[0].uid);
  }, [activos, profUid]);

  // Matriz: paciente → 12 meses, solo con las sesiones del profesional elegido.
  const filas = useMemo(() => {
    if (!profUid) return [];
    const base = {};

    for (const s of (sesiones || [])) {
      if (s.profesionalUid !== profUid) continue;
      const d = fechaDeSesion(s);
      if (!d || d.getFullYear() !== anio) continue;

      /* Las sesiones sin pacienteId (paciente borrado) se juntan en una
         fila sola en vez de descartarse: esa plata existe igual y si no
         apareciera, los totales no cerrarían con la tabla de arriba. */
      const clave = s.pacienteId || '__sin_paciente__';
      if (!base[clave]) {
        const pac = mapaPacientes[clave];
        base[clave] = {
          id: clave,
          /* Si el paciente ya no existe se dice, en vez de un 'Paciente'
             generico que parece un dato faltante. La sesion sigue contando:
             esa plata se debe igual y sin la fila los totales no cerrarian
             con la tabla de arriba. */
          nombre: pac
            ? nombreDePaciente(pac)
            : (s.pacienteNombre || 'Paciente eliminado'),
          meses: Array.from({ length: 12 }, celdaVacia),
          totalDebe: 0,
        };
      }
      const fila = base[clave];
      fila.totalDebe += acumularSesion(
        fila.meses[d.getMonth()], s, getCantidadSesiones(s), ESTADOS_PAGO_SESION,
      );
    }

    // Primero los que más deben, después alfabético, igual que la de arriba.
    return Object.values(base).sort((a, b) => {
      if (a.totalDebe !== b.totalDebe) return b.totalDebe - a.totalDebe;
      return a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' });
    });
  }, [sesiones, profUid, anio, mapaPacientes]);

  const mesActual = new Date().getFullYear() === anio ? new Date().getMonth() : -1;
  const totalGeneral = filas.reduce((acc, f) => acc + f.totalDebe, 0);

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

  const profElegido = activos.find((p) => p.uid === profUid);

  return (
    <section className="cp-rp">
      <header className="cp-rp__head">
        <div>
          <h2 className="cp-rp__title">Estado por paciente</h2>
          <p className="cp-rp__sub">
            De quién viene lo que un profesional debe al consultorio, mes a mes.
          </p>
        </div>
        <div className="cp-rp__anio">
          <button className="cp-rp__anio-btn" onClick={() => setAnio((a) => a - 1)} aria-label="Año anterior">‹</button>
          <span className="cp-rp__anio-val">{anio}</span>
          <button className="cp-rp__anio-btn" onClick={() => setAnio((a) => a + 1)} aria-label="Año siguiente">›</button>
        </div>
      </header>

      <div className="cp-rp__selector">
        <label className="cp-field__label" htmlFor="rp-prof">Profesional</label>
        <select
          id="rp-prof"
          className="cp-select"
          value={profUid}
          onChange={(e) => setProfUid(e.target.value)}
        >
          {activos.length === 0 && <option value="">Sin profesionales activos</option>}
          {activos.map((p) => {
            const debe = deudaPorProfesional[p.uid] || 0;
            return (
              <option key={p.uid} value={p.uid}>
                {p.displayName || p.email}
                {debe > 0 ? ` — debe ${formatoARS.format(debe)}` : ' — al día'}
              </option>
            );
          })}
        </select>
      </div>

      {loading ? (
        <div className="cp-rp__loading"><Spinner size={22} /></div>
      ) : activos.length === 0 ? (
        <p className="cp-rp__empty">Todavía no hay profesionales activos en el consultorio.</p>
      ) : filas.length === 0 ? (
        <p className="cp-rp__empty">
          {profElegido?.displayName || 'Este profesional'} no registró sesiones en {anio}.
        </p>
      ) : (
        <>
          <div className="cp-rp__scroll">
            <table className="cp-rp__tabla">
              <thead>
                <tr>
                  <th className="cp-rp__th-prof">Paciente</th>
                  {MESES_CORTOS.map((m, i) => (
                    <th key={m} className={`cp-rp__th-mes ${i === mesActual ? 'cp-rp__th-mes--actual' : ''}`}>
                      {m}
                    </th>
                  ))}
                  <th className="cp-rp__th-total">Debe</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.id}>
                    <td className="cp-rp__td-prof">
                      <Avatar initials={(f.nombre[0] || '?').toUpperCase()} size={24} />
                      <span className="cp-rp__prof-nombre" title={f.nombre}>{f.nombre}</span>
                    </td>
                    {f.meses.map((c, i) => (
                      <td
                        key={i}
                        className={`cp-rp__celda ${i === mesActual ? 'cp-rp__celda--actual' : ''}`}
                        title={
                          c.registros === 0
                            ? 'Sin sesiones este mes'
                            : `${c.encuentros} ${c.encuentros === 1 ? 'sesión' : 'sesiones'}`
                              + (c.debe > 0 ? ` · debe ${formatoARS.format(c.debe)}` : '')
                              + (c.porLiquidar > 0 ? ` · ${c.porLiquidar} a liquidar` : '')
                        }
                      >
                        {c.registros === 0 ? (
                          <span className="cp-rp__vacio">·</span>
                        ) : (
                          <span className="cp-rp__celda-in">
                            {c.debe > 0 && <span className="cp-rp__debe">{montoCompacto(c.debe)}</span>}
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

          <p className="cp-rp__leyenda">
            <span className="cp-rp__debe">45 mil</span> debe al consultorio
            <span className="cp-rp__ok"><CheckMini /> al día</span>
            <span className="cp-rp__liq">?</span> a liquidar (obra social sin monto)
          </p>
        </>
      )}
    </section>
  );
}
