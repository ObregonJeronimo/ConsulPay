import { useEffect, useMemo, useState } from 'react';

import Spinner from '../../components/ui/Spinner.jsx';
import { useAuth } from '../../hooks/useAuth.js';
import { useConsultorio } from '../../hooks/useConsultorio.js';
import { getModeloReparto, MODELOS_REPARTO } from '../../lib/constants.js';
import {
  aKey,
  desdeKey,
  ESTADOS_CITA,
  grillaDelMes,
  suscribirCitasProfesional,
} from '../../lib/citas.js';

import '../admin/Calendario.css';

const DOW = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

const LABEL_ESTADO = {
  [ESTADOS_CITA.ASISTIO]: 'Asistió',
  [ESTADOS_CITA.AUSENTE]: 'No asistió',
  [ESTADOS_CITA.CANCELADA]: 'Cancelado',
};

/**
 * Agenda del profesional — solo lectura.
 *
 * En el modelo "recepcion cobra" la agenda la maneja la recepcion: el
 * profesional consulta sus turnos pero no los crea ni los edita. Por eso
 * esta pantalla es una lista por dia y no una grilla con acciones: lo que
 * el profesional necesita es "que tengo hoy y esta semana", no gestionar.
 */
export default function MiAgenda() {
  const { user } = useAuth();
  const { consultorio, loading: loadingConsultorio } = useConsultorio();
  const consultorioId = user?.consultorioId;

  const [mes, setMes] = useState(() => new Date());
  const [citas, setCitas] = useState([]);
  const [cargando, setCargando] = useState(true);

  const rango = useMemo(() => {
    const dias = grillaDelMes(mes);
    return { desde: aKey(dias[0]), hasta: aKey(dias[dias.length - 1]) };
  }, [mes]);

  useEffect(() => {
    if (!consultorioId || !user?.uid) return undefined;
    setCargando(true);
    return suscribirCitasProfesional(consultorioId, user.uid, rango, (data) => {
      setCitas(data);
      setCargando(false);
    });
  }, [consultorioId, user?.uid, rango]);

  // Solo los dias del mes que se esta mirando, agrupados.
  const porDia = useMemo(() => {
    const inicio = aKey(new Date(mes.getFullYear(), mes.getMonth(), 1));
    const fin = aKey(new Date(mes.getFullYear(), mes.getMonth() + 1, 0));
    const grupos = {};
    for (const c of citas) {
      if (c.fecha < inicio || c.fecha > fin) continue;
      (grupos[c.fecha] = grupos[c.fecha] || []).push(c);
    }
    return grupos;
  }, [citas, mes]);

  const fechas = useMemo(() => Object.keys(porDia).sort(), [porDia]);
  const hoyKey = aKey(new Date());

  if (loadingConsultorio) {
    return (
      <div className="cp-cal">
        <div style={{ padding: 60, display: 'flex', justifyContent: 'center' }}>
          <Spinner size={24} label="Cargando agenda…" />
        </div>
      </div>
    );
  }

  // La agenda existe solo en el modelo donde la recepcion maneja los turnos.
  if (getModeloReparto(consultorio) !== MODELOS_REPARTO.RECEPCION_COBRA) {
    return (
      <div className="cp-cal">
        <header className="cp-page-header">
          <div>
            <h1 className="cp-page-title">Mi agenda</h1>
            <p className="cp-page-sub">
              Tu consultorio no usa la agenda compartida. Consultá tus sesiones
              desde <strong>Mis sesiones</strong>.
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
          <h1 className="cp-page-title">Mi agenda</h1>
          <p className="cp-page-sub">
            Tus turnos del mes. Los gestiona la recepción del consultorio.
          </p>
        </div>
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

      <div className="cp-agenda">
        {cargando && fechas.length === 0 && (
          <div className="cp-agenda__vacio">
            <Spinner size={20} label="Cargando turnos…" />
          </div>
        )}

        {!cargando && fechas.length === 0 && (
          <div className="cp-agenda__vacio">
            No tenés turnos agendados este mes. Cuando la recepción te agende
            uno, aparece acá.
          </div>
        )}

        {fechas.map((f) => {
          const d = desdeKey(f);
          const iso = d.getDay() === 0 ? 7 : d.getDay();
          return (
            <div key={f} className="cp-agenda__day">
              <div className="cp-agenda__fecha">
                {DOW[iso - 1]}
                <strong>{d.getDate()}</strong>
                {MESES[d.getMonth()].slice(0, 3)}
                {f === hoyKey && ' · hoy'}
              </div>
              <div>
                {porDia[f].map((c) => (
                  <div
                    key={c.id}
                    className={`cp-agenda__item ${c.estado === ESTADOS_CITA.CANCELADA ? 'cp-agenda__item--cancelada' : ''}`}
                  >
                    <span className="cp-agenda__hora">{c.hora}</span>
                    <span className="cp-agenda__nom">{c.pacienteNombre}</span>
                    <span className="cp-agenda__meta">
                      {c.duracionMin} min
                      {c.serieId && ' · turno fijo'}
                      {LABEL_ESTADO[c.estado] && ` · ${LABEL_ESTADO[c.estado]}`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
