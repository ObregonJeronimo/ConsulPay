import { useEffect, useMemo, useState } from 'react';

import Button from '../../components/ui/Button.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import { useAuth } from '../../hooks/useAuth.js';
import { useConsultorio } from '../../hooks/useConsultorio.js';
import { useOverlayClose } from '../../hooks/useOverlayClose.js';
import { getModeloReparto, MODELOS_REPARTO } from '../../lib/constants.js';
import { suscribirPacientesConsultorio } from '../../lib/pacientes.js';
import { suscribirProfesionales } from '../../lib/profesionales.js';
import {
  actualizarCita,
  aKey,
  calcularOcurrencias,
  crearCita,
  crearSerieCitas,
  desdeKey,
  describirRepeticion,
  eliminarCita,
  ESTADOS_CITA,
  grillaDelMes,
  marcarEstadoCita,
  suscribirCitas,
  TIPOS_FIN,
  TIPOS_REPETICION,
} from '../../lib/citas.js';

import './Calendario.css';

const DOW = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];
const DURACIONES = [15, 30, 45, 60, 90];

const LABEL_ESTADO = {
  [ESTADOS_CITA.AGENDADA]: 'Sin marcar',
  [ESTADOS_CITA.ASISTIO]: 'Asistió',
  [ESTADOS_CITA.AUSENTE]: 'No asistió',
  [ESTADOS_CITA.CANCELADA]: 'Cancelado',
};

/** Clase del chip segun el estado, para que se distinga de un vistazo. */
function claseEstado(estado) {
  if (estado === ESTADOS_CITA.ASISTIO) return 'cp-cal__cita--asistio';
  if (estado === ESTADOS_CITA.AUSENTE) return 'cp-cal__cita--ausente';
  if (estado === ESTADOS_CITA.CANCELADA) return 'cp-cal__cita--cancelada';
  return '';
}
const MAX_VISIBLES = 3;

/** Color estable por profesional segun su posicion en la lista. */
function claseColor(index) {
  return `cp-cal__c${(index % 5) + 1}`;
}

function nombreProfesional(p) {
  if (!p) return 'Profesional';
  return p.displayName || p.email || `Usuario ${p.uid.slice(0, 6)}`;
}

function nombrePaciente(p) {
  return `${p.nombre ?? ''} ${p.apellido ?? ''}`.trim();
}

const REPETICION_INICIAL = {
  tipo: TIPOS_REPETICION.SEMANAL,
  cada: 1,
  diasSemana: [],
  finTipo: TIPOS_FIN.CANTIDAD,
  cantidad: 8,
  hasta: '',
};

export default function Calendario() {
  const { user } = useAuth();
  const { consultorio, loading: loadingConsultorio } = useConsultorio();
  const consultorioId = user?.consultorioId;

  const [mes, setMes] = useState(() => new Date());
  const [citas, setCitas] = useState([]);
  const [profesionales, setProfesionales] = useState([]);
  const [pacientes, setPacientes] = useState([]);
  const [ocultos, setOcultos] = useState(() => new Set());
  const [modal, setModal] = useState(null); // { fecha } | { cita }
  const [cargando, setCargando] = useState(true);

  const rango = useMemo(() => {
    const dias = grillaDelMes(mes);
    return { desde: aKey(dias[0]), hasta: aKey(dias[dias.length - 1]) };
  }, [mes]);

  useEffect(() => {
    if (!consultorioId) return undefined;
    setCargando(true);
    return suscribirCitas(consultorioId, rango, (data) => {
      setCitas(data);
      setCargando(false);
    });
  }, [consultorioId, rango]);

  useEffect(() => {
    if (!consultorioId) return undefined;
    return suscribirProfesionales(consultorioId, setProfesionales);
  }, [consultorioId]);

  useEffect(() => {
    if (!consultorioId) return undefined;
    return suscribirPacientesConsultorio(consultorioId, setPacientes);
  }, [consultorioId]);

  const activos = useMemo(
    () => profesionales.filter((p) => p.estado === 'activo'),
    [profesionales],
  );

  // uid -> { profesional, clase de color }
  const mapaProf = useMemo(() => {
    const m = {};
    activos.forEach((p, i) => { m[p.uid] = { prof: p, clase: claseColor(i) }; });
    return m;
  }, [activos]);

  const citasPorDia = useMemo(() => {
    const m = {};
    for (const c of citas) {
      if (ocultos.has(c.profesionalUid)) continue;
      (m[c.fecha] = m[c.fecha] || []).push(c);
    }
    return m;
  }, [citas, ocultos]);

  const dias = useMemo(() => grillaDelMes(mes), [mes]);
  const hoyKey = aKey(new Date());

  function toggleProf(uid) {
    setOcultos((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  }

  if (loadingConsultorio) {
    return (
      <div className="cp-cal">
        <div style={{ padding: 60, display: 'flex', justifyContent: 'center' }}>
          <Spinner size={24} label="Cargando agenda…" />
        </div>
      </div>
    );
  }

  // Guarda defensiva: la agenda es exclusiva del modelo "recepcion cobra".
  // La ruta y el item de menu ya se ocultan, esto cubre el acceso directo.
  if (getModeloReparto(consultorio) !== MODELOS_REPARTO.RECEPCION_COBRA) {
    return (
      <div className="cp-cal">
        <header className="cp-page-header">
          <div>
            <h1 className="cp-page-title">Calendario</h1>
            <p className="cp-page-sub">
              La agenda está disponible para consultorios donde la recepción cobra
              y reparte. Podés cambiar el modelo desde Configuración.
            </p>
          </div>
        </header>
      </div>
    );
  }

  return (
    <div className="cp-cal">
      <header className="cp-page-header">
        <div>
          <h1 className="cp-page-title">Calendario</h1>
          <p className="cp-page-sub">
            Agenda del consultorio. Hacé clic en un día para agendar un turno.
          </p>
        </div>
        <Button variant="primary" onClick={() => setModal({ fecha: hoyKey })}>
          Agendar turno
        </Button>
      </header>

      <div className="cp-cal__bar">
        <div className="cp-cal__nav">
          <button
            type="button"
            className="cp-cal__navbtn"
            aria-label="Mes anterior"
            onClick={() => setMes((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
          >
            ‹
          </button>
          <span className="cp-cal__mes">
            {MESES[mes.getMonth()]} {mes.getFullYear()}
          </span>
          <button
            type="button"
            className="cp-cal__navbtn"
            aria-label="Mes siguiente"
            onClick={() => setMes((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
          >
            ›
          </button>
          <button type="button" className="cp-cal__hoy" onClick={() => setMes(new Date())}>
            Hoy
          </button>
        </div>
      </div>

      {activos.length > 0 && (
        <div className="cp-cal__filtros">
          <span className="cp-cal__filtros-lbl">Profesionales</span>
          {activos.map((p) => {
            const visible = !ocultos.has(p.uid);
            return (
              <button
                key={p.uid}
                type="button"
                className={`cp-cal__chip ${mapaProf[p.uid].clase} ${visible ? 'cp-cal__chip--on' : ''}`}
                onClick={() => toggleProf(p.uid)}
                aria-pressed={visible}
              >
                <span className="cp-cal__chip-dot" />
                {nombreProfesional(p)}
              </button>
            );
          })}
        </div>
      )}

      <div className="cp-cal__grid">
        <div className="cp-cal__dow">
          {DOW.map((d) => <div key={d}>{d}</div>)}
        </div>
        <div className="cp-cal__days">
          {dias.map((d) => {
            const key = aKey(d);
            const fuera = d.getMonth() !== mes.getMonth();
            const delDia = citasPorDia[key] || [];
            return (
              <button
                key={key}
                type="button"
                disabled={fuera}
                className={`cp-cal__cell ${fuera ? 'cp-cal__cell--out' : ''} ${key === hoyKey ? 'cp-cal__cell--hoy' : ''}`}
                onClick={() => !fuera && setModal({ fecha: key })}
              >
                <span className="cp-cal__num">{d.getDate()}</span>
                {!fuera && <span className="cp-cal__add" aria-hidden="true">+</span>}

                {delDia.slice(0, MAX_VISIBLES).map((c) => {
                  const info = mapaProf[c.profesionalUid];
                  return (
                    <span
                      key={c.id}
                      role="button"
                      tabIndex={0}
                      title={`${c.hora} · ${c.pacienteNombre} · ${LABEL_ESTADO[c.estado] ?? ''}`}
                      className={`cp-cal__cita ${info?.clase ?? ''} ${claseEstado(c.estado)}`}
                      onClick={(e) => { e.stopPropagation(); setModal({ cita: c }); }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          e.stopPropagation();
                          setModal({ cita: c });
                        }
                      }}
                    >
                      <span className="cp-cal__cita-h">{c.hora}</span>
                      <span className="cp-cal__cita-n">{c.pacienteNombre}</span>
                      {c.estado === ESTADOS_CITA.ASISTIO && (
                        <span className="cp-cal__cita-marca" aria-label="Asistió">✓</span>
                      )}
                      {c.estado === ESTADOS_CITA.AUSENTE && (
                        <span className="cp-cal__cita-marca" aria-label="No asistió">✕</span>
                      )}
                      {c.serieId && <span className="cp-cal__cita-rep" title="Turno fijo">↻</span>}
                    </span>
                  );
                })}

                {delDia.length > MAX_VISIBLES && (
                  <span className="cp-cal__mas">+{delDia.length - MAX_VISIBLES} más</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {cargando && (
        <p className="cp-cal__hint" style={{ marginTop: 12 }}>Cargando turnos…</p>
      )}

      <TurnosDeHoy
        citas={citas}
        hoyKey={hoyKey}
        mapaProf={mapaProf}
        onAbrir={(c) => setModal({ cita: c })}
      />

      {modal && (
        <CitaModal
          consultorioId={consultorioId}
          creadaPorUid={user?.uid}
          fechaInicial={modal.fecha}
          cita={modal.cita}
          profesionales={activos}
          pacientes={pacientes}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

/* ============================================================
   Turnos de hoy
   ----------------------------------------------------------------
   La grilla del mes sirve para planificar; para trabajar hace falta
   saber que hay HOY, en orden y con los datos completos. Se muestra
   siempre, aunque estes mirando otro mes: es la pregunta que la
   recepcion se hace todo el tiempo.
   ============================================================ */
function TurnosDeHoy({ citas, hoyKey, mapaProf, onAbrir }) {
  const delDia = useMemo(
    () => citas
      .filter((c) => c.fecha === hoyKey)
      .sort((a, b) => a.hora.localeCompare(b.hora)),
    [citas, hoyKey],
  );

  const fecha = desdeKey(hoyKey);
  const activos = delDia.filter((c) => c.estado !== ESTADOS_CITA.CANCELADA);
  const pendientes = activos.filter((c) => c.estado === ESTADOS_CITA.AGENDADA).length;

  return (
    <section className="cp-hoy">
      <header className="cp-hoy__head">
        <div>
          <h2 className="cp-hoy__title">Turnos de hoy</h2>
          <p className="cp-hoy__sub">
            {DOW[(fecha.getDay() === 0 ? 7 : fecha.getDay()) - 1]}{' '}
            {fecha.getDate()} de {MESES[fecha.getMonth()]}
          </p>
        </div>
        {delDia.length > 0 && (
          <span className="cp-hoy__contador">
            {activos.length} turno{activos.length === 1 ? '' : 's'}
            {pendientes !== activos.length && ` · ${pendientes} sin marcar`}
          </span>
        )}
      </header>

      {delDia.length === 0 ? (
        <div className="cp-hoy__vacio">No hay turnos agendados para hoy.</div>
      ) : (
        <ul className="cp-hoy__lista">
          {delDia.map((c) => {
            const info = mapaProf[c.profesionalUid];
            const fin = sumarMinutos(c.hora, c.duracionMin);
            return (
              <li key={c.id}>
                <button
                  type="button"
                  className={`cp-hoy__item ${info?.clase ?? ''} ${claseEstado(c.estado)}`}
                  onClick={() => onAbrir(c)}
                >
                  <span className="cp-hoy__hora">
                    <strong>{c.hora}</strong>
                    <span className="cp-hoy__hora-fin">{fin}</span>
                  </span>
                  <span className="cp-hoy__datos">
                    <span className="cp-hoy__pac">{c.pacienteNombre}</span>
                    <span className="cp-hoy__meta">
                      {nombreProfesional(info?.prof)}
                      {' · '}{c.duracionMin} min
                      {c.serieId && ' · turno fijo'}
                      {c.notas && ` · ${c.notas}`}
                    </span>
                  </span>
                  <span className={`cp-hoy__estado cp-hoy__estado--${c.estado}`}>
                    {LABEL_ESTADO[c.estado] ?? ''}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Hora de fin de un turno, para mostrar la franja completa. */
function sumarMinutos(hora, minutos) {
  const [h, m] = String(hora || '00:00').split(':').map(Number);
  const total = (h * 60 + m + (Number(minutos) || 0)) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/* ============================================================
   Modal: crear / editar turno
   ============================================================ */
function CitaModal({
  consultorioId, creadaPorUid, fechaInicial, cita,
  profesionales, pacientes, onClose,
}) {
  const editando = !!cita;
  const overlayProps = useOverlayClose(onClose);

  const [profesionalUid, setProfesionalUid] = useState(
    cita?.profesionalUid ?? profesionales[0]?.uid ?? '',
  );
  const [pacienteNombre, setPacienteNombre] = useState(cita?.pacienteNombre ?? '');
  const [pacienteId, setPacienteId] = useState(cita?.pacienteId ?? null);
  const [fecha, setFecha] = useState(cita?.fecha ?? fechaInicial ?? aKey(new Date()));
  const [hora, setHora] = useState(cita?.hora ?? '09:00');
  const [duracionMin, setDuracionMin] = useState(cita?.duracionMin ?? 45);
  const [notas, setNotas] = useState(cita?.notas ?? '');

  const [estadoActual, setEstadoActual] = useState(cita?.estado ?? ESTADOS_CITA.AGENDADA);
  const [buscando, setBuscando] = useState(false);
  const [repOn, setRepOn] = useState(false);
  const [rep, setRep] = useState(REPETICION_INICIAL);
  const [alcance, setAlcance] = useState('una');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Al abrir sobre un dia, preseleccionamos ese dia de la semana: es lo que
  // la recepcion quiere el 90% de las veces ("todos los martes como hoy").
  useEffect(() => {
    const d = desdeKey(fecha);
    const iso = d.getDay() === 0 ? 7 : d.getDay();
    setRep((r) => (r.diasSemana.length === 0 ? { ...r, diasSemana: [iso] } : r));
  }, [fecha]);

  const sugerencias = useMemo(() => {
    const q = pacienteNombre.trim().toLowerCase();
    if (!q) return pacientes.slice(0, 5);
    return pacientes.filter((p) => nombrePaciente(p).toLowerCase().includes(q)).slice(0, 5);
  }, [pacienteNombre, pacientes]);

  const reglaActual = {
    tipo: rep.tipo,
    cada: rep.cada,
    diasSemana: rep.diasSemana,
  };
  const finActual = {
    tipo: rep.finTipo,
    cantidad: rep.cantidad,
    hasta: rep.hasta,
  };

  const previewCantidad = repOn && !editando
    ? calcularOcurrencias(fecha, reglaActual, finActual).length
    : 0;

  async function guardar() {
    setError('');
    setSubmitting(true);
    try {
      const datos = { profesionalUid, pacienteId, pacienteNombre, fecha, hora, duracionMin, notas };
      if (editando) {
        await actualizarCita(cita, datos, alcance);
      } else if (repOn) {
        await crearSerieCitas(consultorioId, datos, { regla: reglaActual, fin: finActual }, creadaPorUid);
      } else {
        await crearCita(consultorioId, datos, creadaPorUid);
      }
      onClose();
    } catch (err) {
      setError(err.message || 'No se pudo guardar el turno.');
      setSubmitting(false);
    }
  }

  async function borrar() {
    const texto = cita.serieId && alcance !== 'una'
      ? '¿Eliminar los turnos seleccionados de esta serie?'
      : '¿Eliminar este turno?';
    if (!confirm(texto)) return;
    setError('');
    setSubmitting(true);
    try {
      await eliminarCita(cita, alcance);
      onClose();
    } catch (err) {
      setError(err.message || 'No se pudo eliminar.');
      setSubmitting(false);
    }
  }

  /*
    Marcar la asistencia NO cierra el modal: actualiza el estado a la
    vista. Antes cerraba y, como el chip del calendario no mostraba el
    estado, parecia que el boton no hacia nada.
  */
  async function cambiarEstado(estado) {
    setError('');
    setSubmitting(true);
    try {
      await marcarEstadoCita(cita.id, estado);
      setEstadoActual(estado);
    } catch (err) {
      setError(err.message || 'No se pudo actualizar el estado.');
    } finally {
      setSubmitting(false);
    }
  }

  function toggleDia(iso) {
    setRep((r) => ({
      ...r,
      diasSemana: r.diasSemana.includes(iso)
        ? r.diasSemana.filter((x) => x !== iso)
        : [...r.diasSemana, iso],
    }));
  }

  return (
    <div className="cp-modal-overlay" {...overlayProps}>
      <div className="cp-modal cp-cal__modal" onClick={(e) => e.stopPropagation()}>
        <button className="cp-modal__close" onClick={onClose} aria-label="Cerrar">×</button>

        <h2 className="cp-modal__title">{editando ? 'Editar turno' : 'Nuevo turno'}</h2>
        <p className="cp-modal__sub">
          {editando
            ? 'Modificá los datos, marcá la asistencia o eliminá el turno.'
            : 'Completá los datos del turno.'}
        </p>

        {editando && cita.serieId && (
          <div className="cp-cal__scope">
            <p><strong>Este turno es parte de un turno fijo.</strong> ¿Sobre qué aplicamos el cambio?</p>
            {[
              ['una', 'Solo este turno'],
              ['siguientes', 'Este y los siguientes'],
              ['serie', 'Toda la serie'],
            ].map(([v, label]) => (
              <label key={v}>
                <input
                  type="radio"
                  name="alcance"
                  value={v}
                  checked={alcance === v}
                  onChange={() => setAlcance(v)}
                />
                {label}
              </label>
            ))}
          </div>
        )}

        {editando && (
          <div className="cp-cal__estado">
            <div className="cp-cal__estado-head">
              <span className="cp-cal__estado-lbl">Asistencia</span>
              <span className={`cp-cal__estado-badge cp-cal__estado-badge--${estadoActual}`}>
                {LABEL_ESTADO[estadoActual] ?? estadoActual}
              </span>
            </div>
            <div className="cp-cal__estado-btns">
              <Button
                variant={estadoActual === ESTADOS_CITA.ASISTIO ? 'primary' : 'secondary'}
                onClick={() => cambiarEstado(ESTADOS_CITA.ASISTIO)}
                disabled={submitting}
              >
                Asistió
              </Button>
              <Button
                variant={estadoActual === ESTADOS_CITA.AUSENTE ? 'primary' : 'secondary'}
                onClick={() => cambiarEstado(ESTADOS_CITA.AUSENTE)}
                disabled={submitting}
              >
                No asistió
              </Button>
              {estadoActual !== ESTADOS_CITA.AGENDADA && (
                <button
                  type="button"
                  className="cp-cal__estado-reset"
                  onClick={() => cambiarEstado(ESTADOS_CITA.AGENDADA)}
                  disabled={submitting}
                >
                  Desmarcar
                </button>
              )}
            </div>
          </div>
        )}

        <div className="cp-cal__field">
          <label htmlFor="cal-prof">Profesional</label>
          <select
            id="cal-prof"
            value={profesionalUid}
            onChange={(e) => setProfesionalUid(e.target.value)}
          >
            {profesionales.length === 0 && <option value="">No hay profesionales activos</option>}
            {profesionales.map((p) => (
              <option key={p.uid} value={p.uid}>{nombreProfesional(p)}</option>
            ))}
          </select>
        </div>

        <div className="cp-cal__field cp-cal__ac">
          <label htmlFor="cal-pac">Paciente</label>
          <input
            id="cal-pac"
            value={pacienteNombre}
            autoComplete="off"
            placeholder="Buscá por nombre o escribí uno nuevo"
            onChange={(e) => { setPacienteNombre(e.target.value); setPacienteId(null); setBuscando(true); }}
            onFocus={() => setBuscando(true)}
            onBlur={() => setTimeout(() => setBuscando(false), 150)}
          />
          {buscando && (sugerencias.length > 0 || pacienteNombre.trim()) && (
            <div className="cp-cal__aclist">
              {sugerencias.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="cp-cal__acit"
                  onMouseDown={() => {
                    setPacienteNombre(nombrePaciente(p));
                    setPacienteId(p.id);
                    setBuscando(false);
                  }}
                >
                  <span>{nombrePaciente(p)}</span>
                  {p.obraSocialNumero && <small>{p.obraSocialNumero}</small>}
                </button>
              ))}
              {pacienteNombre.trim() && !pacienteId && (
                <button
                  type="button"
                  className="cp-cal__acit cp-cal__acit--nuevo"
                  onMouseDown={() => setBuscando(false)}
                >
                  Agendar como paciente nuevo: “{pacienteNombre.trim()}”
                </button>
              )}
            </div>
          )}
          <div className="cp-cal__hint">
            Buscá un paciente ya cargado, o escribí el nombre para agendar a alguien
            que todavía no tiene ficha.
          </div>
        </div>

        <div className="cp-cal__row">
          <div className="cp-cal__field">
            <label htmlFor="cal-fecha">Fecha</label>
            <input id="cal-fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
          <div className="cp-cal__field">
            <label htmlFor="cal-hora">Hora</label>
            <input id="cal-hora" type="time" step="300" value={hora} onChange={(e) => setHora(e.target.value)} />
          </div>
        </div>

        <div className="cp-cal__row">
          <div className="cp-cal__field">
            <label htmlFor="cal-dur">Duración</label>
            <select id="cal-dur" value={duracionMin} onChange={(e) => setDuracionMin(Number(e.target.value))}>
              {DURACIONES.map((d) => <option key={d} value={d}>{d} min</option>)}
            </select>
          </div>
          <div className="cp-cal__field">
            <label htmlFor="cal-notas">Nota (opcional)</label>
            <input
              id="cal-notas"
              value={notas}
              placeholder="Ej: primera consulta"
              onChange={(e) => setNotas(e.target.value)}
            />
          </div>
        </div>

        {!editando && (
          <>
            <button
              type="button"
              className={`cp-cal__reptg ${repOn ? 'cp-cal__reptg--on' : ''}`}
              onClick={() => setRepOn((v) => !v)}
            >
              <span>↻ {repOn ? 'Turno fijo activado' : 'Convertir en turno fijo'}</span>
              <span>{repOn ? 'Quitar' : '+'}</span>
            </button>

            <div className={`cp-cal__reppanel ${repOn ? 'cp-cal__reppanel--on' : ''}`}>
              <div className="cp-cal__repinner">
                <div className="cp-cal__repbox">
                  <span className="cp-cal__replbl">¿Cada cuánto se repite?</span>
                  <div className="cp-cal__opts">
                    {[
                      [TIPOS_REPETICION.SEMANAL, 'Por día de la semana'],
                      [TIPOS_REPETICION.CADA_N_DIAS, 'Cada X días'],
                      [TIPOS_REPETICION.MENSUAL, 'Día fijo del mes'],
                    ].map(([v, label]) => (
                      <button
                        key={v}
                        type="button"
                        className={`cp-cal__opt ${rep.tipo === v ? 'cp-cal__opt--on' : ''}`}
                        onClick={() => setRep((r) => ({ ...r, tipo: v, cada: v === TIPOS_REPETICION.CADA_N_DIAS ? 15 : 1 }))}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {rep.tipo === TIPOS_REPETICION.SEMANAL && (
                    <>
                      <div className="cp-cal__dows">
                        {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((l, i) => (
                          <button
                            key={l}
                            type="button"
                            className={`cp-cal__dw ${rep.diasSemana.includes(i + 1) ? 'cp-cal__dw--on' : ''}`}
                            onClick={() => toggleDia(i + 1)}
                            aria-pressed={rep.diasSemana.includes(i + 1)}
                          >
                            {l}
                          </button>
                        ))}
                      </div>
                      <div className="cp-cal__field">
                        <label htmlFor="cal-semanas">Cada cuántas semanas</label>
                        <input
                          id="cal-semanas"
                          type="number"
                          min="1"
                          max="8"
                          value={rep.cada}
                          onChange={(e) => setRep((r) => ({ ...r, cada: Math.max(1, Number(e.target.value) || 1) }))}
                        />
                      </div>
                    </>
                  )}

                  {rep.tipo !== TIPOS_REPETICION.SEMANAL && (
                    <div className="cp-cal__field">
                      <label htmlFor="cal-cada">
                        {rep.tipo === TIPOS_REPETICION.CADA_N_DIAS ? 'Cada cuántos días' : 'Cada cuántos meses'}
                      </label>
                      <input
                        id="cal-cada"
                        type="number"
                        min="1"
                        value={rep.cada}
                        onChange={(e) => setRep((r) => ({ ...r, cada: Math.max(1, Number(e.target.value) || 1) }))}
                      />
                    </div>
                  )}

                  <span className="cp-cal__replbl">¿Hasta cuándo?</span>
                  <div className="cp-cal__opts">
                    {[
                      [TIPOS_FIN.CANTIDAD, 'Una cantidad de veces'],
                      [TIPOS_FIN.FECHA, 'Hasta una fecha'],
                      [TIPOS_FIN.SIN_FIN, 'Sin fecha de fin'],
                    ].map(([v, label]) => (
                      <button
                        key={v}
                        type="button"
                        className={`cp-cal__opt ${rep.finTipo === v ? 'cp-cal__opt--on' : ''}`}
                        onClick={() => setRep((r) => ({ ...r, finTipo: v }))}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {rep.finTipo === TIPOS_FIN.CANTIDAD && (
                    <div className="cp-cal__field">
                      <label htmlFor="cal-cant">Cantidad de turnos</label>
                      <input
                        id="cal-cant"
                        type="number"
                        min="1"
                        max="60"
                        value={rep.cantidad}
                        onChange={(e) => setRep((r) => ({ ...r, cantidad: Math.max(1, Number(e.target.value) || 1) }))}
                      />
                    </div>
                  )}

                  {rep.finTipo === TIPOS_FIN.FECHA && (
                    <div className="cp-cal__field">
                      <label htmlFor="cal-hasta">Repetir hasta</label>
                      <input
                        id="cal-hasta"
                        type="date"
                        value={rep.hasta}
                        onChange={(e) => setRep((r) => ({ ...r, hasta: e.target.value }))}
                      />
                    </div>
                  )}

                  <div className="cp-cal__resumen">
                    {describirRepeticion(reglaActual, finActual, fecha)}
                    {previewCantidad > 0 && ` · se van a crear ${previewCantidad} turnos ahora.`}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {error && <div className="cp-modal__error">{error}</div>}

        <div className="cp-cal__acts">
          {editando && (
            <Button variant="danger" onClick={borrar} disabled={submitting}>
              Eliminar
            </Button>
          )}
          <div className="cp-cal__acts-right">
            <Button variant="ghost" onClick={onClose} disabled={submitting}>Cancelar</Button>
            <Button variant="primary" onClick={guardar} disabled={submitting}>
              {submitting ? <><Spinner size={14} /> Guardando…</> : 'Guardar turno'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
