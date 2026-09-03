import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import Metric from '../../components/ui/Metric.jsx';
import Button from '../../components/ui/Button.jsx';
import { SkeletonBox } from '../../components/ui/Skeleton.jsx';

import { useAuth } from '../../hooks/useAuth.js';
import { useConsultorio } from '../../hooks/useConsultorio.js';
import { ESTADOS_PACIENTE } from '../../lib/constants.js';
import { suscribirProfesionales } from '../../lib/profesionales.js';
import { suscribirInvitaciones } from '../../lib/invitaciones.js';
import { getMetodosPagoIds, suscribirPacientesConsultorio } from '../../lib/pacientes.js';

import PlanillaAnualModal from './PlanillaAnualModal.jsx';
import ResumenProfesionales from './ResumenProfesionales.jsx';
import ResumenPacientes from './ResumenPacientes.jsx';
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
  const [pacientes, setPacientes] = useState([]);
  const [loading, setLoading] = useState(true);
  /* { profUid, anio } de la planilla abierta, o null. Vive acá y no dentro
     de la matriz porque el modal necesita pacientes y metodos, que ya los
     tiene esta pagina. */
  const [planilla, setPlanilla] = useState(null);

  useEffect(() => {
    if (!user?.consultorioId) return;

    let done = 0;
    const check = () => { done++; if (done >= 2) setLoading(false); };

    const unsubP = suscribirProfesionales(user.consultorioId, (data) => { setProfesionales(data); check(); });
    const unsubI = suscribirInvitaciones(user.consultorioId, (data) => { setInvitaciones(data); check(); });

    const unsubPac = suscribirPacientesConsultorio(user.consultorioId, setPacientes);

    return () => { unsubP(); unsubI(); unsubPac(); };
  }, [user?.consultorioId]);

  const profesionalesActivos = profesionales.filter((p) => p.estado === 'activo');

  /* Pacientes activos y como se reparten por metodo de pago. Un paciente
     con dos metodos suma en los dos, asi que el desglose puede dar mas que
     el total: es la misma logica que la planilla de Pacientes. */
  const pacientesActivos = useMemo(
    () => pacientes.filter((p) => p.estado === ESTADOS_PACIENTE.ACTIVO),
    [pacientes],
  );

  const mapaMetodos = useMemo(
    () => Object.fromEntries((consultorio?.metodosPagoPaciente ?? []).map((m) => [m.id, m])),
    [consultorio?.metodosPagoPaciente],
  );

  const porMetodo = useMemo(() => {
    const metodos = consultorio?.metodosPagoPaciente ?? [];
    return metodos
      .map((m) => ({
        id: m.id,
        nombre: m.nombre,
        cantidad: pacientesActivos.filter((p) => getMetodosPagoIds(p).includes(m.id)).length,
      }))
      .filter((m) => m.cantidad > 0)
      .sort((a, b) => b.cantidad - a.cantidad);
  }, [consultorio?.metodosPagoPaciente, pacientesActivos]);
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

  if (loadingConsultorio || loading) {
    /* Skeleton que reserva el espacio del dashboard real para evitar CLS.
       El titulo se pinta ya con el nombre del consultorio si esta, asi que
       ese elemento sigue siendo el LCP y no espera a Firestore. */
    return (
      <div className="cp-dashboard">
        <header className="cp-page-header">
          <div style={{ flex: 1 }}>
            {consultorio?.nombre
              ? <h1 className="cp-page-title">{consultorio.nombre}</h1>
              : <SkeletonBox width="260px" height="32px" />}
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

  return (
    <div className="cp-dashboard">
      <header className="cp-page-header">
        <div>
          {/* El titulo es el consultorio. Antes decia "Resumen de agosto",
              pero lo que hay abajo no es del mes: la tabla es anual. */}
          <h1 className="cp-page-title">{consultorio?.nombre}</h1>
        </div>
        <Link to="/admin/sesiones" state={{ abrirNueva: true }}>
          <Button variant="primary" icon={<PlusIcon />}>
            Registrar sesión
          </Button>
        </Link>
      </header>

      {/* Metricas del consultorio, no del mes: las de "este mes" (por cobrar,
          cobrado, sesiones) daban una foto parcial al lado de una tabla que
          muestra el ano entero, y para el mes ya esta /admin/sesiones. */}
      <section className="cp-metrics-grid">
        <Metric
          label="Profesionales activos"
          value={profesionalesActivos.length}
          sub={invitacionesPendientes.length > 0
            ? `${invitacionesPendientes.length} invitación${invitacionesPendientes.length === 1 ? '' : 'es'} pendiente${invitacionesPendientes.length === 1 ? '' : 's'}`
            : null}
        />
        <Metric
          label="Pacientes activos"
          value={pacientesActivos.length}
          sub={pacientes.length > pacientesActivos.length
            ? `${pacientes.length - pacientesActivos.length} archivado${pacientes.length - pacientesActivos.length === 1 ? '' : 's'}`
            : null}
        />
      </section>

      {/* Todos los metodos con el mismo peso. Antes los dos primeros iban
          como cards grandes y el resto como chips chicos, lo que sugeria que
          APROSS importaba mas que OBRA SOCIAL cuando el corte era arbitrario.
          La grilla se acomoda sola: con tres metodos ocupan una fila, con
          diez se reparten en las que hagan falta. */}
      {porMetodo.length > 0 && (
        <section className="cp-metodos">
          <h2 className="cp-metodos__titulo">Pacientes por método de pago</h2>
          <div className="cp-metodos__grid">
            {porMetodo.map((m) => (
              <div key={m.id} className="cp-metodos__item">
                <span className="cp-metodos__nombre" title={m.nombre}>{m.nombre}</span>
                <span className="cp-metodos__valor">{m.cantidad}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Resumen rápido: estado de cada profesional, mes a mes */}
      {profesionales.length > 0 && (
        <>
          <ResumenProfesionales
            consultorioId={user?.consultorioId}
            profesionales={profesionales}
          />
          {/* Un nivel mas abajo: la misma matriz pero de los pacientes de un
              profesional. La de arriba dice cuanto debe cada uno; esta, de
              quien viene. */}
          <ResumenPacientes
            consultorioId={user?.consultorioId}
            profesionales={profesionales}
            onCargarSesiones={(profUid, anio) => setPlanilla({ profUid, anio })}
          />
        </>
      )}

      {planilla && (
        <PlanillaAnualModal
          consultorioId={user?.consultorioId}
          profesionales={profesionalesActivos}
          pacientes={pacientes}
          mapaMetodos={mapaMetodos}
          uid={user?.uid}
          profUidInicial={planilla.profUid}
          anioContexto={planilla.anio}
          onClose={() => setPlanilla(null)}
        />
      )}
    </div>
  );
}

/* ============================================================
   Onboarding: 3 pasos para arrancar
   ============================================================ */
function OnboardingPasos() {
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
    </div>
  );
}


