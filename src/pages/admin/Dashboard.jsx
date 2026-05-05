import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import Metric from '../../components/ui/Metric.jsx';
import Button from '../../components/ui/Button.jsx';
import { SkeletonBox } from '../../components/ui/Skeleton.jsx';

import { useAuth } from '../../hooks/useAuth.js';
import { useConsultorio } from '../../hooks/useConsultorio.js';
import { formatoARS, PLANES } from '../../lib/constants.js';
import { suscribirProfesionales } from '../../lib/profesionales.js';
import { suscribirInvitaciones } from '../../lib/invitaciones.js';

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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.consultorioId) return;

    let done = 0;
    const check = () => { done++; if (done >= 2) setLoading(false); };

    const unsubP = suscribirProfesionales(user.consultorioId, (data) => { setProfesionales(data); check(); });
    const unsubI = suscribirInvitaciones(user.consultorioId, (data) => { setInvitaciones(data); check(); });

    return () => { unsubP(); unsubI(); };
  }, [user?.consultorioId]);

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
            <PlanBadge plan={consultorio?.plan} />
          </p>
        </div>
        <Link to="/admin/sesiones/nueva">
          <Button variant="primary" icon={<PlusIcon />}>
            Registrar sesión
          </Button>
        </Link>
      </header>

      {/* Métricas — por ahora 0 en todos, se llenan cuando haya sesiones */}
      <section className="cp-metrics-grid">
        <Metric label="Por cobrar" value={formatoARS.format(0)} sub="Sin sesiones todavía" />
        <Metric label="Cobrado este mes" value={formatoARS.format(0)} sub="Sin sesiones todavía" />
        <Metric
          label="Profesionales activos"
          value={profesionalesActivos.length}
          sub={invitacionesPendientes.length > 0 ? `${invitacionesPendientes.length} pendiente${invitacionesPendientes.length === 1 ? '' : 's'}` : null}
        />
        <Metric label="Sesiones del mes" value={0} sub="Sin registros todavía" />
      </section>

      {/* Placeholder hasta tener sesiones */}
      <section className="cp-section">
        <div className="cp-section-head">
          <h2 className="cp-section-title">Profesionales con deuda abierta</h2>
          <Link to="/admin/profesionales" className="cp-section-link">Ver todos →</Link>
        </div>
        <div className="cp-placeholder-box">
          <p style={{ color: 'var(--cp-text-muted)', fontSize: 14 }}>
            Todavía no se registraron sesiones este mes. Cuando tus profesionales hagan
            sesiones con pacientes, la deuda acumulada va a aparecer acá.
          </p>
        </div>
      </section>
    </div>
  );
}

/* ============================================================
   Onboarding: 3 pasos para arrancar
   ============================================================ */
function OnboardingPasos() {
  const { consultorio } = useConsultorio();

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
            Usás ConsulPay sin pagar mensualidad. Cuando tus profesionales paguen vía Mercado Pago,
            se queda un 6% ConsulPay. Podés cambiar al Plan Pago en cualquier momento desde Configuración.
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   Plan badge
   ============================================================ */
function PlanBadge({ plan }) {
  if (!plan) return null;
  return (
    <span className={`cp-plan-badge cp-plan-badge--${plan}`}>
      {plan === PLANES.FREE ? 'Plan Free' : 'Plan Pago'}
    </span>
  );
}
