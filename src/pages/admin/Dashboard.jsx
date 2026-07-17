import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import Metric from '../../components/ui/Metric.jsx';
import Button from '../../components/ui/Button.jsx';
import PlanPill from '../../components/ui/PlanPill.jsx';
import { SkeletonBox } from '../../components/ui/Skeleton.jsx';

import { useAuth } from '../../hooks/useAuth.js';
import { useConsultorio } from '../../hooks/useConsultorio.js';
import { ESTADOS_PAGO_SESION, formatoARS, PLANES } from '../../lib/constants.js';
import { suscribirProfesionales } from '../../lib/profesionales.js';
import { suscribirInvitaciones } from '../../lib/invitaciones.js';
import {
  finDeMes,
  getCantidadSesiones,
  inicioDeMes,
  suscribirSesionesConsultorio,
  totalesGlobales,
} from '../../lib/sesiones.js';

import ResumenProfesionales from './ResumenProfesionales.jsx';
import './Dashboard.css';

const PlusIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 4v16m8-8H4" />
  </svg>
);

const UsersIcon = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-5.13a4 4 0 11-8 0 4 4 0 018 0zm6 3a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

export default function Dashboard() {
  const { user } = useAuth();
  const { consultorio, loading: loadingConsultorio } = useConsultorio();

  const [profesionales, setProfesionales] = useState([]);
  const [invitaciones, setInvitaciones] = useState([]);
  const [sesionesMes, setSesionesMes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.consultorioId) return;

    let done = 0;
    const check = () => { done++; if (done >= 2) setLoading(false); };

    const unsubP = suscribirProfesionales(user.consultorioId, (data) => { setProfesionales(data); check(); });
    const unsubI = suscribirInvitaciones(user.consultorioId, (data) => { setInvitaciones(data); check(); });

    return () => { unsubP(); unsubI(); };
  }, [user?.consultorioId]);

  // Suscripcion a sesiones del mes en curso para alimentar las metricas.
  // Se filtra en el query por rango [inicioDeMes, finDeMes] para no
  // traer datos de meses anteriores. Cuando alguien marca/desmarca
  // pagada, el snapshot se actualiza solo y las metricas refrescan.
  useEffect(() => {
    if (!user?.consultorioId) return;
    const ahora = new Date();
    const desde = inicioDeMes(ahora);
    const hasta = finDeMes(ahora);
    const unsub = suscribirSesionesConsultorio(
      user.consultorioId,
      (data) => setSesionesMes(data),
      { desde, hasta },
    );
    return unsub;
  }, [user?.consultorioId]);

  // Stats del mes (mismas reglas que la pagina de Sesiones):
  // - porCobrar = suma de montoConsultorio de sesiones DEBIDA
  //   (lo que el profesional aun no le pago al consultorio)
  // - cobrado   = suma de montoConsultorio de sesiones PAGADA
  // - cantidad  = cantidad de "encuentros" (con cantidadSesiones)
  const stats = useMemo(() => totalesGlobales(sesionesMes), [sesionesMes]);
  const cobrado = stats.totalConsultorio - stats.debido;
  const porCobrar = stats.debido;
  const cantidadEncuentros = stats.cantidad;
  const cantidadRegistros = stats.cantidadRegistros;

  // Profesionales con deuda abierta del mes (agrupado).
  // Mostramos los top 5 con mayor deuda, cada uno con su monto y cantidad
  // de sesiones impagas. Si hay 0, fallback al placeholder original.
  const deudaPorProfesional = useMemo(() => {
    const mapa = new Map();
    for (const s of sesionesMes) {
      if (s.estadoPago !== ESTADOS_PAGO_SESION.DEBIDO) continue;
      const uid = s.profesionalUid;
      if (!uid) continue;
      const prev = mapa.get(uid) || { uid, monto: 0, pacientes: new Set(), encuentros: 0 };
      prev.monto += Number(s.montoConsultorio || 0);
      // La unidad de deuda es el paciente (cada registro es un paciente con
      // sus N sesiones adentro). Los encuentros se muestran como contexto.
      if (s.pacienteId) prev.pacientes.add(s.pacienteId);
      prev.encuentros += getCantidadSesiones(s);
      mapa.set(uid, prev);
    }
    const arr = Array.from(mapa.values());
    arr.sort((a, b) => b.monto - a.monto);
    return arr.slice(0, 5);
  }, [sesionesMes]);

  // Mapa profesionalUid -> displayName/email para mostrar nombres
  const mapaProfesionales = useMemo(() => {
    const m = {};
    for (const p of profesionales) m[p.uid] = p;
    return m;
  }, [profesionales]);

  // Calcular el mes una sola vez, sin Firestore. Se usa en el skeleton y en el render final.
  const mesActual = new Intl.DateTimeFormat('es-AR', { month: 'long' }).format(new Date());

  if (loadingConsultorio || loading) {
    // Skeleton que reserva el espacio del dashboard real para evitar CLS.
    // El h1 se muestra inmediatamente con el mes calculado localmente (sin esperar Firestore),
    // lo que convierte ese elemento en el LCP real y lo adelanta de ~6.7s a ~2s.
    return (
      <div className="cp-dashboard">
        <header className="cp-page-header">
          <div style={{ flex: 1 }}>
            <h1 className="cp-page-title">Resumen de {mesActual}</h1>
            <SkeletonBox width="180px" height="16px" style={{ marginTop: 12 }} />
          </div>
          <SkeletonBox width="151px" height="38px" radius="8px" />
        </header>
        <section className="cp-metrics-grid">
          <SkeletonBox height="100px" radius="12px" />
          <SkeletonBox height="100px" radius="12px" />
          <SkeletonBox height="100px" radius="12px" />
          <SkeletonBox height="100px" radius="12px" />
        </section>
        <section className="cp-section" style={{ marginTop: 32 }}>
          <SkeletonBox width="240px" height="22px" style={{ marginBottom: 16 }} />
          <SkeletonBox height="120px" radius="12px" />
        </section>
      </div>
    );
  }

  const profesionalesActivos = profesionales.filter((p) => p.estado === 'activo');
  const invitacionesPendientes = invitaciones.filter((i) => i.estado === 'pendiente');

  // Si no hay profesionales ni invitaciones, mostrar onboarding
  if (profesionales.length === 0 && invitaciones.length === 0) {
    return (
      <div className="cp-dashboard">
        <header className="cp-page-header">
          <div>
            <h1 className="cp-page-title">
              Bienvenido{user?.displayName ? `, ${user.displayName.split(' ')[0]}` : ''}
            </h1>
            <p className="cp-page-sub">
              Tu consultorio <strong>{consultorio?.nombre || ''}</strong> está listo para arrancar.
            </p>
          </div>
        </header>

        <OnboardingPasos />
      </div>
    );
  }

  return (
    <div className="cp-dashboard">
      <header className="cp-page-header">
        <div>
          <h1 className="cp-page-title">Resumen de {mesActual}</h1>
          <p className="cp-page-sub">
            {consultorio?.nombre}
            {' · '}
            {consultorio?.plan === 'ultra' ? (
              // Ultra ya se muestra como badge llamativo en el sidebar.
              // Aca solo dejamos texto sutil para evitar duplicacion visual.
              <span className="cp-page-sub__ultra-text">Plan Ultra</span>
            ) : (
              <PlanPill plan={consultorio?.plan} />
            )}
          </p>
        </div>
        <Link to="/admin/sesiones" state={{ abrirNueva: true }}>
          <Button variant="primary" icon={<PlusIcon />}>
            Registrar sesión
          </Button>
        </Link>
      </header>

      {/* Metricas del mes en curso. Las sesiones se suscriben en useEffect
          y se totalizan con totalesGlobales(), igual que en /admin/sesiones.
          Si no hay sesiones todavia, mostramos el sub helper "Sin sesiones
          todavía" para no dejar cards en blanco. */}
      <section className="cp-metrics-grid">
        <Metric
          label="Por cobrar"
          value={formatoARS.format(porCobrar)}
          sub={cantidadRegistros === 0
            ? 'Sin sesiones todavía'
            : (porCobrar > 0
              ? `${deudaPorProfesional.length} ${deudaPorProfesional.length === 1 ? 'profesional debe' : 'profesionales deben'}`
              : 'Todo cobrado este mes')}
        />
        <Metric
          label="Cobrado este mes"
          value={formatoARS.format(cobrado)}
          sub={cantidadRegistros === 0 ? 'Sin sesiones todavía' : 'ya recibido por el consultorio'}
        />
        <Metric
          label="Profesionales activos"
          value={profesionalesActivos.length}
          sub={invitacionesPendientes.length > 0 ? `${invitacionesPendientes.length} pendiente${invitacionesPendientes.length === 1 ? '' : 's'}` : null}
        />
        <Metric
          label="Sesiones del mes"
          value={cantidadEncuentros}
          sub={cantidadRegistros === 0
            ? 'Sin registros todavía'
            : `${cantidadRegistros} ${cantidadRegistros === 1 ? 'registro' : 'registros'}`}
        />
      </section>

      {/* Profesionales con deuda abierta */}
      <section className="cp-section">
        <div className="cp-section-head">
          <h2 className="cp-section-title">Profesionales con deuda abierta</h2>
          <Link to="/admin/sesiones" className="cp-section-link">Ver todos →</Link>
        </div>
        {deudaPorProfesional.length === 0 ? (
          <div className="cp-placeholder-box">
            <p style={{ color: 'var(--cp-text-muted)', fontSize: 14 }}>
              {cantidadRegistros === 0
                ? 'Todavía no se registraron sesiones este mes. Cuando tus profesionales hagan sesiones con pacientes, la deuda acumulada va a aparecer acá.'
                : '✓ No hay deuda abierta este mes. Todos los profesionales están al día con sus pagos.'}
            </p>
          </div>
        ) : (
          <ul className="cp-deuda-list">
            {deudaPorProfesional.map((d) => {
              const prof = mapaProfesionales[d.uid];
              const nombre = prof?.displayName || prof?.email || 'Profesional sin nombre';
              return (
                <li key={d.uid} className="cp-deuda-item">
                  <div className="cp-deuda-item__info">
                    <div className="cp-deuda-item__name">{nombre}</div>
                    <div className="cp-deuda-item__sub">
                      {d.pacientes.size} {d.pacientes.size === 1 ? 'paciente impago' : 'pacientes impagos'}
                      {d.encuentros !== d.pacientes.size && ` · ${d.encuentros} ${d.encuentros === 1 ? 'sesión' : 'sesiones'}`}
                    </div>
                  </div>
                  <div className="cp-deuda-item__monto">
                    {formatoARS.format(d.monto)}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Resumen rápido: estado de cada profesional, mes a mes */}
      {profesionales.length > 0 && (
        <ResumenProfesionales
          consultorioId={user?.consultorioId}
          profesionales={profesionales}
        />
      )}
    </div>
  );
}

/* ============================================================
   Onboarding: 3 pasos para arrancar
   ============================================================ */
function OnboardingPasos() {
  const { consultorio } = useConsultorio();

  // Comisiones del modelo nuevo: leemos los valores reales del consultorio
  // (o el helper devuelve el default si no estan seteados). Esto se actualiza
  // automaticamente si el superadmin cambia las comisiones, sin necesidad
  // de re-deployar.
  const comisionFreePct = Number.isFinite(Number(consultorio?.comisionFree))
    ? Number(consultorio.comisionFree)
    : 1;
  const comisionProPct = Number.isFinite(Number(consultorio?.comisionPro))
    ? Number(consultorio.comisionPro)
    : 0.5;

  const pasos = [
    {
      num: '01',
      titulo: 'Invitá a tus profesionales',
      desc: 'Sumá a los profesionales que trabajan en tu consultorio vía email. Ellos reciben un link para activar su cuenta.',
      cta: 'Ir a Profesionales',
      href: '/admin/profesionales',
      activo: true,
    },
    {
      num: '02',
      titulo: 'Cargá los pacientes',
      desc: 'Cada profesional carga sus pacientes con obra social y valor de sesión. Podés hacerlo vos también desde el admin.',
      cta: 'Próximamente',
      disabled: true,
    },
    {
      num: '03',
      titulo: 'Registrá sesiones',
      desc: 'Cada sesión se registra con un click. El sistema calcula automáticamente cuánto debe cada profesional al consultorio.',
      cta: 'Próximamente',
      disabled: true,
    },
  ];

  return (
    <div className="cp-onboarding">
      <div className="cp-onboarding__intro">
        <div className="cp-onboarding__eyebrow">Primeros pasos</div>
        <h2 className="cp-onboarding__title">
          Tres pasos para que <em>ConsulPay</em> trabaje por vos.
        </h2>
      </div>

      <div className="cp-onboarding__grid">
        {pasos.map((p) => (
          <article key={p.num} className={`cp-onboarding-step ${p.disabled ? 'cp-onboarding-step--disabled' : ''}`}>
            <div className="cp-onboarding-step__num">{p.num}</div>
            <h3 className="cp-onboarding-step__title">{p.titulo}</h3>
            <p className="cp-onboarding-step__desc">{p.desc}</p>
            {p.activo && p.href && (
              <Link to={p.href} className="cp-onboarding-step__cta">
                {p.cta} →
              </Link>
            )}
            {p.disabled && <div className="cp-onboarding-step__cta--disabled">{p.cta}</div>}
          </article>
        ))}
      </div>

      {consultorio?.plan === PLANES.FREE && (
        <div className="cp-onboarding__plan">
          <div>
            <div className="cp-onboarding__plan-label">Estás en el plan</div>
            <div className="cp-onboarding__plan-name">Free</div>
          </div>
          <div className="cp-onboarding__plan-desc">
            Usás ConsulPay sin pagar mensualidad. Cuando tus profesionales cobren vía
            Mercado Pago, se descuenta una comisión del{' '}
            <strong>{comisionFreePct}%</strong> sobre el valor total de cada sesión.
            Si querés bajar la comisión, podés pasarte al{' '}
            <strong>Plan Pro ({comisionProPct}%)</strong> en cualquier momento desde Configuración.
          </div>
        </div>
      )}
    </div>
  );
}


