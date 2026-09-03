/**
 * PlanillaAnualModal — cargar un año entero de sesiones en una sola tabla.
 *
 * El caso real: un consultorio que viene trabajando hace meses y carga todo
 * junto, o un profesional que entrega su planilla del año en papel. Con
 * "Carga rápida" hay que repetir el flujo mes por mes; acá se elige el
 * profesional una vez y se llena una grilla de pacientes × meses.
 *
 * Cada fila es un paciente con su método y su valor por sesión. Cada celda
 * es un mes: se escribe cuántas sesiones tuvo. Al guardar se crea UN
 * registro por celda con cantidadSesiones = lo que se escribió, que es la
 * misma forma que usa el resto de la app para las sesiones agrupadas.
 *
 * Obra social: si el valor queda vacío, las sesiones nacen en
 * "pendiente de monto" como siempre (todavía no se sabe cuánto liquida).
 * Si se carga el valor, se liquidan en el acto — que es lo que hace falta
 * cuando la obra social ya informó y no tiene sentido cargarlas a ciegas
 * para liquidarlas después.
 *
 * Lo ya cargado se muestra en cada celda para no duplicar: la grilla
 * escucha las sesiones del año en vivo, así que se actualiza sola después
 * de guardar.
 */
import { useEffect, useMemo, useState } from 'react';

import Avatar from '../../components/ui/Avatar.jsx';
import Button from '../../components/ui/Button.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import { useOverlayClose } from '../../hooks/useOverlayClose.js';
import { ESTADOS_PACIENTE, TIPOS_METODO_PAGO, formatoARS } from '../../lib/constants.js';
import { getMetodosPaciente, nombrePaciente } from '../../lib/pacientes.js';
import {
  calcularSplit,
  crearSesion,
  getCantidadSesiones,
  suscribirSesionesConsultorio,
} from '../../lib/sesiones.js';

import { MESES_CORTOS, fechaDeSesion } from './resumenAnual.js';
import './PlanillaAnual.css';

/* Mismo techo que la carga rápida: más que esto en un solo registro es casi
   siempre un error de tipeo, no un mes de 80 sesiones. */
const MAX_SESIONES = 64;

function nombreProf(p) {
  return p?.displayName || p?.email || '—';
}

function inicialesPaciente(p) {
  return ((p?.apellido?.[0] ?? '') + (p?.nombre?.[0] ?? '')).toUpperCase() || '·';
}

/* El día del mes que se elige arriba puede no existir en todos los meses:
   un 31 en febrero cae en marzo si se construye a lo bruto. Se recorta al
   último día real de cada mes. */
function fechaDeCelda(anio, mes, dia) {
  const ultimo = new Date(anio, mes + 1, 0).getDate();
  const d = Math.min(Math.max(1, Number(dia) || 1), ultimo);
  return new Date(anio, mes, d, 10, 0, 0);
}

function filaInicial(paciente, mapaMetodos) {
  const ids = getMetodosPaciente(paciente);
  // Con un solo método no hay nada que elegir; con dos o más se decide.
  const metodoPagoId = ids.length === 1 ? ids[0] : '';
  const metodo = mapaMetodos[metodoPagoId];
  const esDiferido = metodo?.tipo === TIPOS_METODO_PAGO.DIFERIDO;
  return {
    metodoPagoId,
    /* El default del método solo se precarga para los inmediatos. En obra
       social el valor no se sabe todavía, y precargarlo haría que se
       liquide sin querer. */
    valorSesion: !esDiferido && metodo?.valorSesionDefault !== undefined
      ? String(metodo.valorSesionDefault)
      : '',
    meses: Array.from({ length: 12 }, () => ''),
    metodoIds: ids,
  };
}

export default function PlanillaAnualModal({
  consultorioId,
  profesionales,
  pacientes,
  mapaMetodos,
  uid,
  profUidInicial,
  anioContexto,
  onClose,
}) {
  const overlayProps = useOverlayClose(onClose);

  /* Se abre desde la matriz de "Estado por paciente", que ya tiene elegido
     un profesional y un año: repetir esa eleccion seria trabajo de mas. */
  const [profUid, setProfUid] = useState(profUidInicial || '');
  const [anio, setAnio] = useState(() => anioContexto || new Date().getFullYear());
  const [dia, setDia] = useState('15');
  const [busqueda, setBusqueda] = useState('');
  const [filas, setFilas] = useState({});
  const [sesiones, setSesiones] = useState([]);
  const [loadingSes, setLoadingSes] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [progreso, setProgreso] = useState(0);
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState('');

  const prof = useMemo(
    () => (profesionales || []).find((p) => p.uid === profUid) || null,
    [profesionales, profUid],
  );

  const pacientesDelProf = useMemo(() => {
    if (!profUid) return [];
    return (pacientes || [])
      .filter((p) => {
        if (p.estado !== ESTADOS_PACIENTE.ACTIVO) return false;
        const uids = p.profesionalesUids || (p.profesionalUid ? [p.profesionalUid] : []);
        return uids.includes(profUid);
      })
      .sort((a, b) => nombrePaciente(a).localeCompare(nombrePaciente(b), 'es', { sensitivity: 'base' }));
  }, [pacientes, profUid]);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return pacientesDelProf;
    return pacientesDelProf.filter((p) => nombrePaciente(p).toLowerCase().includes(q));
  }, [pacientesDelProf, busqueda]);

  /* Las filas por defecto se derivan del paciente. Se guardan aparte de lo
     editado para que la lista de pacientes pueda refrescarse en vivo sin
     pisar lo que se esté escribiendo. */
  const filasIniciales = useMemo(() => {
    const m = {};
    for (const p of pacientesDelProf) m[p.id] = filaInicial(p, mapaMetodos);
    return m;
  }, [pacientesDelProf, mapaMetodos]);

  const FILA_VACIA = useMemo(
    () => ({ metodoPagoId: '', valorSesion: '', meses: Array.from({ length: 12 }, () => ''), metodoIds: [] }),
    [],
  );
  const getFila = (id) => filas[id] || filasIniciales[id] || FILA_VACIA;

  // Cambiar de profesional o de año empieza de cero.
  useEffect(() => {
    setFilas({});
    setResultado(null);
    setError('');
    setBusqueda('');
  }, [profUid, anio]);

  useEffect(() => {
    if (!profUid || !consultorioId) { setSesiones([]); return undefined; }
    setLoadingSes(true);
    const desde = new Date(anio, 0, 1, 0, 0, 0);
    const hasta = new Date(anio, 11, 31, 23, 59, 59);
    return suscribirSesionesConsultorio(
      consultorioId,
      (data) => {
        setSesiones(data.filter((s) => s.profesionalUid === profUid));
        setLoadingSes(false);
      },
      { desde, hasta },
    );
  }, [consultorioId, profUid, anio]);

  /* Cuántas sesiones ya tiene cada paciente en cada mes. Sin esto la
     planilla invita a cargar de nuevo lo que ya está. */
  const yaCargado = useMemo(() => {
    const m = {};
    for (const s of sesiones) {
      const d = fechaDeSesion(s);
      if (!d || d.getFullYear() !== anio) continue;
      const k = `${s.pacienteId}|${d.getMonth()}`;
      m[k] = (m[k] || 0) + getCantidadSesiones(s);
    }
    return m;
  }, [sesiones, anio]);

  function editarFila(id, campo, valor) {
    setResultado(null);
    setFilas((prev) => {
      const base = prev[id] || filasIniciales[id] || FILA_VACIA;
      const siguiente = { ...base, [campo]: valor };
      /* Cambiar el método reencuadra el valor: pasar a obra social lo
         limpia (si no, se liquidaría sola con el valor del método
         anterior) y pasar a uno inmediato trae su default. */
      if (campo === 'metodoPagoId') {
        const metodo = mapaMetodos[valor];
        const esDiferido = metodo?.tipo === TIPOS_METODO_PAGO.DIFERIDO;
        siguiente.valorSesion = !esDiferido && metodo?.valorSesionDefault !== undefined
          ? String(metodo.valorSesionDefault)
          : '';
      }
      return { ...prev, [id]: siguiente };
    });
  }

  function editarMes(id, i, valor) {
    setResultado(null);
    setFilas((prev) => {
      const base = prev[id] || filasIniciales[id] || FILA_VACIA;
      const meses = [...base.meses];
      meses[i] = valor;
      return { ...prev, [id]: { ...base, meses } };
    });
  }

  /* Una celda con número válido es un registro a crear. Se recorre sobre
     pacientesDelProf y no sobre lo visible: filtrar por nombre esconde
     filas, no las descarta. */
  const aCrear = useMemo(() => {
    const items = [];
    for (const p of pacientesDelProf) {
      const f = filas[p.id] || filasIniciales[p.id];
      if (!f) continue;
      f.meses.forEach((v, i) => {
        if (v === '' || v === null || v === undefined) return;
        const n = Number(v);
        if (!Number.isInteger(n) || n < 1 || n > MAX_SESIONES) return;
        items.push({ paciente: p, mes: i, cantidad: n, fila: f });
      });
    }
    return items;
  }, [pacientesDelProf, filas, filasIniciales]);

  const validacion = useMemo(() => {
    const porFila = {};
    const celdas = new Set();
    for (const p of pacientesDelProf) {
      const f = filas[p.id] || filasIniciales[p.id];
      if (!f) continue;
      let tieneAlgo = false;
      f.meses.forEach((v, i) => {
        if (v === '' || v === null || v === undefined) return;
        const n = Number(v);
        if (!Number.isInteger(n) || n < 1 || n > MAX_SESIONES) { celdas.add(`${p.id}|${i}`); return; }
        tieneAlgo = true;
      });
      if (!tieneAlgo) continue;

      const metodo = mapaMetodos[f.metodoPagoId];
      if (!metodo) { porFila[p.id] = 'Elegí el método de pago'; continue; }
      if (f.valorSesion === '') {
        /* Sin valor solo se puede cargar obra social: queda pendiente de
           monto. Un método inmediato sin valor no es una sesión válida. */
        if (metodo.tipo !== TIPOS_METODO_PAGO.DIFERIDO) {
          porFila[p.id] = 'Falta el valor por sesión';
        }
        continue;
      }
      const valor = Number(f.valorSesion);
      if (!Number.isFinite(valor) || valor < 0) porFila[p.id] = 'El valor por sesión no es válido';
    }
    return { porFila, celdas };
  }, [pacientesDelProf, filas, filasIniciales, mapaMetodos]);

  const hayErrores = Object.keys(validacion.porFila).length > 0 || validacion.celdas.size > 0;

  const resumen = useMemo(() => {
    let totalSesiones = 0;
    let facturado = 0;
    let alConsultorio = 0;
    let sinMonto = 0;
    for (const it of aCrear) {
      const metodo = mapaMetodos[it.fila.metodoPagoId];
      if (!metodo) continue;
      totalSesiones += it.cantidad;
      if (it.fila.valorSesion === '') {
        if (metodo.tipo === TIPOS_METODO_PAGO.DIFERIDO) sinMonto += it.cantidad;
        continue;
      }
      const valor = Number(it.fila.valorSesion);
      if (!Number.isFinite(valor)) continue;
      const total = valor * it.cantidad;
      facturado += total;
      alConsultorio += calcularSplit(total, Number(metodo.porcentajeConsultorio) || 0).montoConsultorio;
    }
    return { registros: aCrear.length, sesiones: totalSesiones, facturado, alConsultorio, sinMonto };
  }, [aCrear, mapaMetodos]);

  // Cuántas sesiones se cargan en cada mes, para el pie de la tabla.
  const totalesPorMes = useMemo(() => {
    const tot = Array.from({ length: 12 }, () => 0);
    for (const it of aCrear) tot[it.mes] += it.cantidad;
    return tot;
  }, [aCrear]);

  async function handleGuardar() {
    if (aCrear.length === 0 || submitting) return;
    if (hayErrores) {
      setError('Revisá lo marcado en rojo antes de guardar.');
      return;
    }
    setError('');
    setSubmitting(true);
    setProgreso(0);
    const fallidas = [];
    let ok = 0;
    for (const it of aCrear) {
      const metodo = mapaMetodos[it.fila.metodoPagoId];
      try {
        await crearSesion({
          consultorioId,
          profesionalUid: profUid,
          profesionalNombre: nombreProf(prof),
          pacienteId: it.paciente.id,
          pacienteNombre: nombrePaciente(it.paciente),
          fecha: fechaDeCelda(anio, it.mes, dia),
          metodo,
          /* Vacío para obra social = pendiente de monto. Con valor, la
             sesión nace liquidada aunque el método sea diferido. */
          valorSesion: it.fila.valorSesion === '' ? undefined : Number(it.fila.valorSesion),
          cantidadSesiones: it.cantidad,
        }, uid);
        ok += 1;
      } catch (err) {
        fallidas.push(`${nombrePaciente(it.paciente)} · ${MESES_CORTOS[it.mes]}: ${err.message || 'no se pudo crear'}`);
      }
      setProgreso((n) => n + 1);
    }
    setSubmitting(false);
    setResultado({ ok, fallidas });
    /* Lo cargado se limpia: la grilla ya refleja lo nuevo en "ya cargado" y
       dejar los números puestos invita a guardar dos veces lo mismo. */
    if (ok > 0) setFilas({});
  }

  const anioActual = new Date().getFullYear();

  return (
    <div className="cp-modal-overlay" {...overlayProps}>
      <div className="cp-modal cp-planilla" onClick={(e) => e.stopPropagation()}>
        <button className="cp-modal__close" onClick={onClose} aria-label="Cerrar">×</button>
        <h2 className="cp-modal__title">Planilla anual</h2>
        <p className="cp-modal__sub">
          Elegí un profesional y cargá, mes a mes, cuántas sesiones tuvo cada paciente.
          Se crea un registro por celda.
        </p>

        <div className="cp-modal__form">
          <div className="cp-pa__filtros">
            <div className="cp-pa__campo cp-pa__campo--prof">
              <label className="cp-field__label" htmlFor="pa-prof">Profesional</label>
              <select
                id="pa-prof"
                className="cp-select"
                value={profUid}
                onChange={(e) => setProfUid(e.target.value)}
                disabled={submitting}
              >
                <option value="">Elegir profesional…</option>
                {(profesionales || []).map((p) => (
                  <option key={p.uid} value={p.uid}>{nombreProf(p)}</option>
                ))}
              </select>
            </div>

            <div className="cp-pa__campo">
              <span className="cp-field__label">Año</span>
              <div className="cp-pa__anio">
                <button
                  type="button"
                  className="cp-pa__anio-btn"
                  onClick={() => setAnio((a) => a - 1)}
                  disabled={submitting}
                  aria-label="Año anterior"
                >‹</button>
                <span className="cp-pa__anio-val">{anio}</span>
                <button
                  type="button"
                  className="cp-pa__anio-btn"
                  onClick={() => setAnio((a) => a + 1)}
                  disabled={submitting || anio >= anioActual + 1}
                  aria-label="Año siguiente"
                >›</button>
              </div>
            </div>

            <div className="cp-pa__campo cp-pa__campo--dia">
              <label className="cp-field__label" htmlFor="pa-dia">Día</label>
              <input
                id="pa-dia"
                className="cp-input"
                type="number"
                min="1"
                max="31"
                value={dia}
                onChange={(e) => setDia(e.target.value)}
                disabled={submitting}
                title="Día del mes con el que se guardan las sesiones"
              />
            </div>
          </div>

          {!profUid ? (
            <p className="cp-pa__vacio">Elegí un profesional para ver sus pacientes.</p>
          ) : loadingSes && sesiones.length === 0 ? (
            <div className="cp-pa__cargando"><Spinner size={20} label="Cargando…" /></div>
          ) : pacientesDelProf.length === 0 ? (
            <p className="cp-pa__vacio">
              {nombreProf(prof)} no tiene pacientes activos asignados.
            </p>
          ) : (
            <>
              <input
                className="cp-input cp-pa__buscar"
                type="text"
                placeholder="Buscar paciente…"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                disabled={submitting}
              />

              <div className="cp-pa__scroll">
                <table className="cp-pa__tabla">
                  <thead>
                    <tr>
                      <th className="cp-pa__th-pac">Paciente</th>
                      <th className="cp-pa__th-met">Método</th>
                      <th className="cp-pa__th-val">Valor c/u</th>
                      {MESES_CORTOS.map((m) => (
                        <th key={m} className="cp-pa__th-mes">{m}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibles.map((p) => {
                      const f = getFila(p.id);
                      const metodo = mapaMetodos[f.metodoPagoId];
                      const esDiferido = metodo?.tipo === TIPOS_METODO_PAGO.DIFERIDO;
                      const errorFila = validacion.porFila[p.id];
                      const opciones = f.metodoIds?.length ? f.metodoIds : Object.keys(mapaMetodos);
                      return (
                        <tr key={p.id} className={errorFila ? 'cp-pa__fila cp-pa__fila--error' : 'cp-pa__fila'}>
                          <td className="cp-pa__td-pac">
                            <Avatar initials={inicialesPaciente(p)} size={24} />
                            <span className="cp-pa__pac-nombre" title={nombrePaciente(p)}>
                              {nombrePaciente(p)}
                            </span>
                            {errorFila && <span className="cp-pa__error-fila">{errorFila}</span>}
                          </td>
                          <td className="cp-pa__td-met">
                            <select
                              className="cp-select cp-pa__select"
                              value={f.metodoPagoId}
                              onChange={(e) => editarFila(p.id, 'metodoPagoId', e.target.value)}
                              disabled={submitting}
                              aria-label={`Método de ${nombrePaciente(p)}`}
                            >
                              <option value="">Elegir…</option>
                              {opciones.map((id) => (
                                <option key={id} value={id}>{mapaMetodos[id]?.nombre || id}</option>
                              ))}
                            </select>
                          </td>
                          <td className="cp-pa__td-val">
                            <input
                              className="cp-input cp-pa__valor"
                              type="number"
                              min="0"
                              step="1"
                              value={f.valorSesion}
                              onChange={(e) => editarFila(p.id, 'valorSesion', e.target.value)}
                              disabled={submitting}
                              placeholder={esDiferido ? 'a liquidar' : '—'}
                              title={esDiferido
                                ? 'Vacío deja las sesiones pendientes de monto. Con valor se liquidan ahora.'
                                : 'Valor de cada sesión'}
                              aria-label={`Valor por sesión de ${nombrePaciente(p)}`}
                            />
                          </td>
                          {f.meses.map((v, i) => {
                            const ya = yaCargado[`${p.id}|${i}`] || 0;
                            const mal = validacion.celdas.has(`${p.id}|${i}`);
                            return (
                              <td key={i} className="cp-pa__celda">
                                <input
                                  className={`cp-pa__cant ${mal ? 'cp-pa__cant--error' : ''} ${v !== '' && !mal ? 'cp-pa__cant--llena' : ''}`}
                                  type="number"
                                  min="1"
                                  max={MAX_SESIONES}
                                  value={v}
                                  onChange={(e) => editarMes(p.id, i, e.target.value)}
                                  disabled={submitting}
                                  aria-label={`${nombrePaciente(p)} · ${MESES_CORTOS[i]}`}
                                />
                                {ya > 0 && (
                                  <span
                                    className="cp-pa__ya"
                                    title={`Ya hay ${ya} ${ya === 1 ? 'sesión cargada' : 'sesiones cargadas'} en ${MESES_CORTOS[i]}`}
                                  >
                                    {ya}
                                  </span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                    {visibles.length === 0 && (
                      <tr>
                        <td colSpan={15} className="cp-pa__sin-match">
                          Ningún paciente coincide con «{busqueda}».
                        </td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td className="cp-pa__td-pac cp-pa__foot-label">A cargar</td>
                      <td className="cp-pa__td-met" />
                      <td className="cp-pa__td-val" />
                      {totalesPorMes.map((t, i) => (
                        <td key={i} className="cp-pa__celda cp-pa__foot-mes">
                          {t > 0 ? t : <span className="cp-pa__foot-cero">·</span>}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="cp-pa__resumen">
                <div className="cp-pa__resumen-linea">
                  <strong>{resumen.registros}</strong> registro{resumen.registros === 1 ? '' : 's'}
                  {' · '}
                  <strong>{resumen.sesiones}</strong> {resumen.sesiones === 1 ? 'sesión' : 'sesiones'}
                </div>
                <div className="cp-pa__resumen-linea cp-pa__resumen-linea--plata">
                  {formatoARS.format(resumen.facturado)} facturado
                  {' · '}
                  <span className="cp-pa__al-consultorio">
                    {formatoARS.format(resumen.alConsultorio)} al consultorio
                  </span>
                </div>
                {resumen.sinMonto > 0 && (
                  <div className="cp-pa__resumen-nota">
                    {resumen.sinMonto} {resumen.sinMonto === 1 ? 'sesión' : 'sesiones'} de obra social sin valor:
                    quedan pendientes de monto. Si ya sabés cuánto liquidó, cargá el valor y salen cobradas.
                  </div>
                )}
              </div>
            </>
          )}

          {error && <div className="cp-pa__error">{error}</div>}

          {resultado && (
            <div className={`cp-pa__resultado ${resultado.fallidas.length === 0 ? 'cp-pa__resultado--ok' : 'cp-pa__resultado--parcial'}`}>
              <strong>
                {resultado.ok > 0
                  ? `Se cargaron ${resultado.ok} registro${resultado.ok === 1 ? '' : 's'}.`
                  : 'No se pudo cargar ningún registro.'}
              </strong>
              {resultado.fallidas.length > 0 && (
                <ul className="cp-pa__fallidas">
                  {resultado.fallidas.map((f) => <li key={f}>{f}</li>)}
                </ul>
              )}
            </div>
          )}

          <div className="cp-modal__actions">
            <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
              {resultado ? 'Cerrar' : 'Cancelar'}
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={handleGuardar}
              disabled={submitting || aCrear.length === 0 || hayErrores}
            >
              {submitting
                ? <><Spinner size={14} /> Cargando {progreso}/{aCrear.length}…</>
                : `Cargar ${aCrear.length} registro${aCrear.length === 1 ? '' : 's'}`}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
