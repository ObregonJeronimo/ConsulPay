import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import Spinner from '../../components/ui/Spinner.jsx';

import { useAuth } from '../../hooks/useAuth.js';
import { useConsultorio } from '../../hooks/useConsultorio.js';
import { ESTADOS_PAGO_SESION, formatoARS } from '../../lib/constants.js';
import { suscribirPacientesProfesional } from '../../lib/pacientes.js';
import ResumenAnual from './ResumenAnual.jsx';
import {
  aceptarInstancia,
  suscribirInstanciasProfesional,
} from '../../lib/recordatorios.js';
import {
  ESTADOS_PERMISO,
  activarNotificaciones,
  desactivarNotificaciones,
  estadoPermiso,
} from '../../lib/notificaciones.js';
import {
  finDeMes,
  getCantidadSesiones,
  inicioDeMes,
  nombreDelMes,
  suscribirSesionesProfesional,
  totalesGlobales,
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
     2. Sesiones del mes en curso (encuentros, no registros)
     3. Lo que debe al consultorio (con cantidad de encuentros impagos)
     4. Lo que cobro del mes (su parte)

   IMPORTANTE: ahora con sesiones agrupadas, "cantidad de sesiones"
   significa cantidad de ENCUENTROS (suma de cantidadSesiones), no
   cantidad de docs en Firestore. Si el profesional carga 8 sesiones
   en 1 registro agrupado, la card muestra 8 (no 1).

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
  const [instancias, setInstancias] = useState([]);
  const [loadingSesiones, setLoadingSesiones] = useState(true);
  const [loadingPacientes, setLoadingPacientes] = useState(true);
  const [recordatoriosOpen, setRecordatoriosOpen] = useState(false);

  // El mes en curso para mostrar "Sesiones de [mes]" e ingresos del mes.
  // Se calcula una sola vez al montar — si el user deja la pagina abierta
  // hasta el cambio de mes, va a tener que recargar. No es un problema
  // real porque el dashboard se cierra y abre con frecuencia.
  const mesActual = useMemo(() => inicioDeMes(new Date()), []);

  /* ---- Suscripciones live ---- */

  useEffect(() => {
    if (!user?.uid || !user?.consultorioId) return;
    return suscribirInstanciasProfesional(user.uid, user.consultorioId, setInstancias);
  }, [user?.uid, user?.consultorioId]);

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
     Usamos totalesGlobales() que ya distingue entre cantidadSesiones
     (encuentros sumando cantidadSesiones) y cantidadRegistros (docs).
     La card "Sesiones del mes" muestra ENCUENTROS para que un profesional
     que cargo 8 sesiones en un solo registro agrupado vea "8" y no "1".
  */

  const stats = useMemo(() => totalesGlobales(sesiones), [sesiones]);

  const sesionesDebidas = useMemo(
    () => sesiones.filter((s) => s.estadoPago === ESTADOS_PAGO_SESION.DEBIDO),
    [sesiones],
  );

  // Cantidad de encuentros debidos (no de docs)
  const cantidadEncuentrosDebidos = useMemo(
    () => sesionesDebidas.reduce((acc, s) => acc + getCantidadSesiones(s), 0),
    [sesionesDebidas],
  );

  const deudaMes = useMemo(
    () => sesionesDebidas.reduce((acc, s) => acc + (s.montoConsultorio || 0), 0),
    [sesionesDebidas],
  );

  const cantidadPacientesActivos = pacientes.length;

  const mapaPacientes = useMemo(() => {
    const m = {};
    for (const p of pacientes) m[p.id] = p;
    return m;
  }, [pacientes]);

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
        <div>
          <h1 className="cp-panel__title">
            Hola, {user?.displayName || 'profesional'}
          </h1>
          <p className="cp-panel__sub">
            {consultorio?.nombre
              ? `Resumen de tu actividad en ${consultorio.nombre}.`
              : 'Resumen de tu actividad.'}
          </p>
        </div>
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            className={`cp-recordatorios-btn ${instancias.filter((i) => i.estado === 'pendiente').length > 0 ? 'cp-recordatorios-btn--activo' : ''}`}
            onClick={() => setRecordatoriosOpen((v) => !v)}
          >
            <BellIcon />
            <span>Recordatorios</span>
            {instancias.filter((i) => i.estado === 'pendiente').length > 0 && (
              <span className="cp-recordatorios-btn__badge">
                {instancias.filter((i) => i.estado === 'pendiente').length}
              </span>
            )}
          </button>
          {recordatoriosOpen && (
            <>
              {/* Overlay semitransparente — solo en mobile */}
              <div
                className="cp-recordatorios-backdrop"
                onClick={() => setRecordatoriosOpen(false)}
              />
              <PanelRecordatorios
                instancias={instancias}
                uid={user.uid}
                onClose={() => setRecordatoriosOpen(false)}
              />
            </>
          )}
        </div>
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
          value={stats.cantidad}
          hint={stats.cantidad === 0
            ? 'Sin sesiones registradas este mes'
            : stats.cantidad !== stats.cantidadRegistros
              ? `${stats.cantidadRegistros} registro${stats.cantidadRegistros === 1 ? '' : 's'} (algunos agrupados)`
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
          hint={cantidadEncuentrosDebidos === 0
            ? 'Estás al día este mes'
            : `${cantidadEncuentrosDebidos} sesión${cantidadEncuentrosDebidos === 1 ? '' : 'es'} sin pagar`
          }
          to="/mi-panel/pagos"
          ctaLabel="Pagar al consultorio"
          mono
        />

        <Card
          icon={<IconIngresos />}
          label={`Tus ingresos de ${nombreDelMes(mesActual)}`}
          value={formatoARS.format(stats.totalProfesional)}
          tone="success"
          hint={stats.cantidad === 0
            ? 'Sin movimientos este mes'
            : 'Tu parte de las sesiones del mes'
          }
          mono
        />
      </section>

      {/* ---- Resumen anual: 12 cards ---- */}
      <ResumenAnual sesiones={sesiones} mapaPacientes={mapaPacientes} />

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

/* ============================================================
   Botón e ícono de recordatorios
   ============================================================ */
function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

/* ============================================================
   Activar / desactivar las notificaciones push
   ----------------------------------------------------------------
   Vive dentro del panel de recordatorios porque es ahi donde el
   profesional esta pensando en el tema. Un banner suelto en el panel
   principal seria una interrupcion mas.

   El permiso se pide SOLO cuando aprieta el boton. Pedirlo al entrar
   es la forma mas rapida de que el navegador se lo guarde como "no"
   para siempre.
   ============================================================ */
function ControlNotificaciones({ uid }) {
  const [estado, setEstado] = useState(() => estadoPermiso());
  const [trabajando, setTrabajando] = useState(false);
  const [aviso, setAviso] = useState('');

  async function activar() {
    setTrabajando(true);
    setAviso('');
    const r = await activarNotificaciones(uid);
    setEstado(r.estado);
    if (!r.ok && r.estado === ESTADOS_PERMISO.BLOQUEADO) {
      setAviso('Las bloqueaste en este navegador. Se habilitan desde el candado de la barra de direcciones.');
    } else if (!r.ok && r.error) {
      setAviso('No se pudieron activar. Probá de nuevo en un rato.');
    }
    setTrabajando(false);
  }

  async function desactivar() {
    setTrabajando(true);
    await desactivarNotificaciones(uid);
    setEstado(estadoPermiso());
    setAviso('Este dispositivo ya no va a recibir avisos.');
    setTrabajando(false);
  }

  if (estado === ESTADOS_PERMISO.NO_SOPORTADO) return null;

  return (
    <div className="cp-notif-control">
      {estado === ESTADOS_PERMISO.REQUIERE_INSTALAR ? (
        <>
          <span className="cp-notif-control__label">Avisos en este iPhone</span>
          <p className="cp-notif-control__hint">
            Para recibirlos, tocá Compartir y después &quot;Agregar a inicio&quot;. Apple
            solo permite avisos a las apps agregadas a la pantalla de inicio.
          </p>
        </>
      ) : estado === ESTADOS_PERMISO.CONCEDIDO ? (
        <>
          <span className="cp-notif-control__label">Avisos activados en este dispositivo</span>
          <button
            type="button"
            className="cp-notif-control__btn"
            onClick={desactivar}
            disabled={trabajando}
          >
            {trabajando ? 'Desactivando…' : 'Desactivar'}
          </button>
        </>
      ) : (
        <>
          <span className="cp-notif-control__label">Avisos en el celular o la compu</span>
          <p className="cp-notif-control__hint">
            Te llega una notificación cuando tengas un recordatorio nuevo, sin
            necesidad de tener ConsulPay abierta.
          </p>
          <button
            type="button"
            className="cp-notif-control__btn cp-notif-control__btn--primary"
            onClick={activar}
            disabled={trabajando || estado === ESTADOS_PERMISO.BLOQUEADO}
          >
            {trabajando ? 'Activando…' : 'Activar avisos'}
          </button>
        </>
      )}
      {aviso && <p className="cp-notif-control__aviso">{aviso}</p>}
    </div>
  );
}

/* ============================================================
   Panel desplegable de recordatorios
   ============================================================ */
function PanelRecordatorios({ instancias, uid, onClose }) {
  const ref = useRef(null);

  // Cerrar al click afuera
  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    }
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [onClose]);

  const pendientes = instancias.filter((i) => i.estado === 'pendiente');
  const aceptados = instancias.filter((i) => i.estado === 'aceptado');

  async function handleAceptar(inst) {
    // El ciclo viene en la instancia como snapshot; si no, pasamos null
    await aceptarInstancia(inst.id, inst, inst.ciclo ?? null);
  }

  return (
    <div ref={ref} className="cp-panel-recordatorios">
      <div className="cp-panel-recordatorios__header">
        <span className="cp-panel-recordatorios__titulo">Recordatorios y avisos</span>
        <button type="button" className="cp-panel-recordatorios__close" onClick={onClose} aria-label="Cerrar">×</button>
      </div>

      {instancias.length === 0 ? (
        <div className="cp-panel-recordatorios__empty">
          No hay recordatorios activos 🎉
        </div>
      ) : (
        <div className="cp-panel-recordatorios__lista">
          {pendientes.map((inst) => (
            <div key={inst.id} className="cp-panel-recordatorios__item cp-panel-recordatorios__item--pendiente">
              <div className="cp-panel-recordatorios__item-titulo">{inst.titulo}</div>
              {inst.descripcion && (
                <div className="cp-panel-recordatorios__item-desc">{inst.descripcion}</div>
              )}
              <button
                type="button"
                className="cp-panel-recordatorios__aceptar"
                onClick={() => handleAceptar(inst)}
              >
                ✓ Aceptar
              </button>
            </div>
          ))}
          {aceptados.length > 0 && (
            <>
              {pendientes.length > 0 && <div className="cp-panel-recordatorios__sep" />}
              <div className="cp-panel-recordatorios__seccion-label">Vistos recientemente</div>
              {aceptados.map((inst) => {
                const expira = inst.expiraEn?.toDate
                  ? inst.expiraEn.toDate()
                  : inst.expiraEn?.seconds
                    ? new Date(inst.expiraEn.seconds * 1000)
                    : null;
                const diasRestantes = expira
                  ? Math.max(0, Math.ceil((expira - new Date()) / (1000 * 60 * 60 * 24)))
                  : null;
                return (
                  <div key={inst.id} className="cp-panel-recordatorios__item cp-panel-recordatorios__item--aceptado">
                    <div className="cp-panel-recordatorios__item-titulo">{inst.titulo}</div>
                    {diasRestantes !== null && (
                      <div className="cp-panel-recordatorios__item-expira">
                        Desaparece en {diasRestantes} día{diasRestantes === 1 ? '' : 's'}
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}

      <ControlNotificaciones uid={uid} />
    </div>
  );
}
