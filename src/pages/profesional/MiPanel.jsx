import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import Spinner from '../../components/ui/Spinner.jsx';

import { useAuth } from '../../hooks/useAuth.js';
import { useConsultorio } from '../../hooks/useConsultorio.js';
import { ESTADOS_PAGO_SESION, formatoARS } from '../../lib/constants.js';
import { suscribirPacientesProfesional } from '../../lib/pacientes.js';
import {
  finDeMes,
  inicioDeMes,
  nombreDelMes,
  suscribirSesionesProfesional,
} from '../../lib/sesiones.js';

import './MiPanel.css';

/* ============================================================
   Iconos para las cards
   ============================================================ */
const IconPacientes = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
  </svg>
);
const IconSesiones = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);
const IconDeuda = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
  </svg>
);
const IconIngresos = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
    <polyline points="17 6 23 6 23 12" />
  </svg>
);
const IconArrowRight = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="5" y1="12" x2="19" y2="12" />
    <polyline points="12 5 19 12 12 19" />
  </svg>
);

/* ============================================================
   MiPanel — pagina principal del profesional
   ----------------------------------------------------------------
   Resumen rapido con 4 cards:
     1. Pacientes activos
     2. Sesiones del mes en curso
     3. Lo que debe al consultorio (con cantidad de sesiones impagas)
     4. Lo que cobro del mes (su parte)
   + atajos a las paginas detalladas (Mis pacientes / Sesiones / Pagos)

   La opcion de "Salir del consultorio" se movio a /mi-panel/pagos
   (en una seccion de "Cuenta" al pie). Aca queremos que el resumen
   sea lo mas limpio posible y enfocado en datos del trabajo del
   profesional.
   ============================================================ */
export default function MiPanel() {
  const { user } = useAuth();
  const { consultorio, loading: loadingConsultorio } = useConsultorio();

  const [sesiones, setSesiones] = useState([]);
  const [pacientes, setPacientes] = useState([]);
  const [loadingSesiones, setLoadingSesiones] = useState(true);
  const [loadingPacientes, setLoadingPacientes] = useState(true);

  // El mes en curso para mostrar "Sesiones de [mes]" e ingresos del mes.
  // Se calcula una sola vez al montar — si el user deja la pagina abierta
  // hasta el cambio de mes, va a tener que recargar. No es un problema
  // real porque el dashboard se cierra y abre con frecuencia.
  const mesActual = useMemo(() => inicioDeMes(new Date()), []);

  /* ---- Suscripciones live ---- */

  useEffect(() => {
    if (!user?.uid || !user?.consultorioId) {
      setLoadingSesiones(false);
      return;
    }
    setLoadingSesiones(true);
    const desde = inicioDeMes(mesActual);
    const hasta = finDeMes(mesActual);
    const unsub = suscribirSesionesProfesional(
      user.uid,
      user.consultorioId,
      (data) => {
        setSesiones(data);
        setLoadingSesiones(false);
      },
      { desde, hasta },
    );
    return unsub;
  }, [user?.uid, user?.consultorioId, mesActual]);

  useEffect(() => {
    if (!user?.uid || !user?.consultorioId) {
      setLoadingPacientes(false);
      return;
    }
    setLoadingPacientes(true);
    const unsub = suscribirPacientesProfesional(
      user.uid,
      user.consultorioId,
      (data) => {
        setPacientes(data);
        setLoadingPacientes(false);
      },
    );
    return unsub;
  }, [user?.uid, user?.consultorioId]);

  /* ---- Calculos derivados ----
     Las sesiones del mes en curso ya vienen filtradas por la query
     (con desde/hasta). Los demas calculos son sobre ese set:
     - cantidad: total de sesiones del mes
     - ingresoMes: suma de montoProfesional (lo que cobro el prof)
       de todas las sesiones del mes, INDEPENDIENTEMENTE del estado
       de pago al consultorio (porque la parte del prof la cobro
       directamente del paciente, no depende de que haya saldado
       la deuda). Asi el card refleja ingresos brutos del mes.

     La deuda al consultorio se calcula sobre TODAS las sesiones
     debidas, no solo las del mes en curso, porque podes deber sesiones
     viejas. Para eso necesitamos una query separada... pero como ya
     trajimos solo las del mes, hacemos un calculo aproximado: la
     deuda del MES en curso. Si quisieramos la deuda historica completa,
     habria que hacer otra suscripcion sin filtro de fecha.

     Decision: por ahora mostramos "deuda del mes" — es lo mas
     comun y mas relevante. Si el user quiere la deuda total, la ve
     en /mi-panel/pagos (que ya tiene esa logica completa).
     Tambien le agregamos un hint en el card que dice
     "Ver detalle →" para que sepa que hay mas info.
  */

  const cantidadSesionesMes = sesiones.length;

  const ingresoMes = useMemo(
    () => sesiones.reduce((acc, s) => acc + (s.montoProfesional || 0), 0),
    [sesiones],
  );

  const sesionesDebidasMes = useMemo(
    () => sesiones.filter((s) => s.estadoPago === ESTADOS_PAGO_SESION.DEBIDO),
    [sesiones],
  );

  const deudaMes = useMemo(
    () => sesionesDebidasMes.reduce((acc, s) => acc + (s.montoConsultorio || 0), 0),
    [sesionesDebidasMes],
  );

  const cantidadPacientesActivos = pacientes.length;

  const cargando = loadingConsultorio || loadingSesiones || loadingPacientes;

  /* ---- Render ---- */

  if (cargando) {
    return (
      <div className="cp-panel">
        <div style={{ padding: 60, display: 'flex', justifyContent: 'center' }}>
          <Spinner size={24} label="Cargando tu resumen…" />
        </div>
      </div>
    );
  }

  return (
    <div className="cp-panel">
      {/* ---- Header con saludo personalizado ---- */}
      <header className="cp-panel__header">
        <h1 className="cp-panel__title">
          Hola, {user?.displayName || 'profesional'}
        </h1>
        <p className="cp-panel__sub">
          {consultorio?.nombre
            ? `Resumen de tu actividad en ${consultorio.nombre}.`
            : 'Resumen de tu actividad.'}
        </p>
      </header>

      {/* ---- Cards de stats ---- */}
      <section className="cp-panel__cards" aria-label="Resumen del mes">
        <Card
          icon={<IconPacientes />}
          label="Pacientes activos"
          value={cantidadPacientesActivos}
          hint={cantidadPacientesActivos === 0
            ? 'Todavía no tenés pacientes asignados'
            : `Asignado${cantidadPacientesActivos === 1 ? '' : 's'} a vos`
          }
          to="/mi-panel/pacientes"
          ctaLabel="Ver pacientes"
        />

        <Card
          icon={<IconSesiones />}
          label={`Sesiones de ${nombreDelMes(mesActual)}`}
          value={cantidadSesionesMes}
          hint={cantidadSesionesMes === 0
            ? 'Sin sesiones registradas este mes'
            : 'Sesiones del mes en curso'
          }
          to="/mi-panel/sesiones"
          ctaLabel="Ver sesiones"
        />

        <Card
          icon={<IconDeuda />}
          label="Le debés al consultorio"
          value={formatoARS.format(deudaMes)}
          tone={deudaMes > 0 ? 'debido' : 'success'}
          hint={sesionesDebidasMes.length === 0
            ? 'Estás al día este mes'
            : `${sesionesDebidasMes.length} sesión${sesionesDebidasMes.length === 1 ? '' : 'es'} sin pagar`
          }
          to="/mi-panel/pagos"
          ctaLabel="Pagar al consultorio"
          mono
        />

        <Card
          icon={<IconIngresos />}
          label={`Tus ingresos de ${nombreDelMes(mesActual)}`}
          value={formatoARS.format(ingresoMes)}
          tone="success"
          hint={cantidadSesionesMes === 0
            ? 'Sin movimientos este mes'
            : 'Tu parte de las sesiones del mes'
          }
          mono
        />
      </section>

      {/* ---- Atajos ---- */}
      <section className="cp-panel__shortcuts" aria-label="Accesos rápidos">
        <h2 className="cp-panel__shortcuts-title">Accesos rápidos</h2>
        <div className="cp-panel__shortcut-grid">
          <Link to="/mi-panel/pacientes" className="cp-panel__shortcut">
            <IconPacientes />
            <div>
              <div className="cp-panel__shortcut-name">Mis pacientes</div>
              <div className="cp-panel__shortcut-meta">
                Ver pacientes asignados
              </div>
            </div>
            <IconArrowRight />
          </Link>
          <Link to="/mi-panel/sesiones" className="cp-panel__shortcut">
            <IconSesiones />
            <div>
              <div className="cp-panel__shortcut-name">Mis sesiones</div>
              <div className="cp-panel__shortcut-meta">
                Registrar y ver sesiones
              </div>
            </div>
            <IconArrowRight />
          </Link>
          <Link to="/mi-panel/pagos" className="cp-panel__shortcut">
            <IconDeuda />
            <div>
              <div className="cp-panel__shortcut-name">Mis pagos</div>
              <div className="cp-panel__shortcut-meta">
                Saldar deuda con el consultorio
              </div>
            </div>
            <IconArrowRight />
          </Link>
        </div>
      </section>
    </div>
  );
}

/* ============================================================
   Card individual
   ----------------------------------------------------------------
   - icon: SVG decorativo
   - label: texto chico arriba (uppercase)
   - value: numero/string grande del medio
   - hint: linea chica de ayuda abajo
   - tone: variante visual (success | debido | default). Cambia el
     color del valor.
   - to: si esta presente, agrega un footer con "ctaLabel →" linkeado
   - mono: si true, formatea el valor con la fuente mono (mejor para
     numeros)
   ============================================================ */
function Card({ icon, label, value, hint, tone = 'default', to, ctaLabel, mono = false }) {
  const card = (
    <div className={`cp-card cp-card--${tone}`}>
      <div className="cp-card__top">
        <div className="cp-card__icon">{icon}</div>
        <div className="cp-card__label">{label}</div>
      </div>
      <div className={`cp-card__value ${mono ? 'cp-card__value--mono' : ''}`}>
        {value}
      </div>
      <div className="cp-card__hint">{hint}</div>
      {to && ctaLabel && (
        <div className="cp-card__cta">
          {ctaLabel} <IconArrowRight />
        </div>
      )}
    </div>
  );

  if (to) {
    return (
      <Link to={to} className="cp-card-link" aria-label={`${label}: ${value}`}>
        {card}
      </Link>
    );
  }
  return card;
}
