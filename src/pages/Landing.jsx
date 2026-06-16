import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { formatoARS } from '../lib/constants.js';
import './Landing.css';

/* ============================================================
   Landing pública de ConsulPay
   ============================================================ */

export default function Landing() {
  return (
    <div className="lp">
      <Nav />
      <Hero />
      <ComoFunciona />
      <Precios />
      <CTAFinal />
      <Footer />
    </div>
  );
}

/* ============================================================
   Nav
   ============================================================ */
function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Click en el logo:
  //   - Si ya estamos en la landing → scroll suave al top (hero section).
  //   - Si estamos en otra ruta → navegar a la landing.
  //
  // Sin esto, un <Link to="/inicio"> no hace nada visible cuando ya estas
  // en /inicio, porque React Router no dispara scroll al repetir la ruta.
  function onLogoClick(e) {
    const enLanding = location.pathname === '/inicio' || location.pathname === '/';
    if (enLanding) {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      // Dejamos que el Link maneje la navegación normalmente
      // (que nos llevará a /inicio y cargará el hero en el top).
    }
  }

  return (
    <nav className={`lp-nav ${scrolled ? 'lp-nav--scrolled' : ''}`}>
      <div className="lp-nav__inner">
        <Link to="/inicio" className="lp-nav__brand" onClick={onLogoClick}>
          <span className="lp-nav__mark">C</span>
          <span className="lp-nav__name">ConsulPay</span>
        </Link>

        <div className="lp-nav__links">
          <a href="#como-funciona" className="lp-nav__link">Cómo funciona</a>
          <a href="#precios" className="lp-nav__link">Precios</a>
        </div>

        <div className="lp-nav__cta">
          <Link to="/login" className="lp-nav__login">Iniciar sesión</Link>
          <Link to="/crear-consultorio" className="lp-btn lp-btn--primary lp-btn--sm">
            Crear consultorio
          </Link>
        </div>
      </div>
    </nav>
  );
}

/* ============================================================
   Hero
   ============================================================ */
function Hero() {
  return (
    <section className="lp-hero">
      {/* Decoración de fondo: círculo coral tenue y línea diagonal */}
      <div className="lp-hero__deco-1" aria-hidden="true" />
      <div className="lp-hero__deco-2" aria-hidden="true" />

      <div className="lp-hero__inner">
        <div className="lp-hero__text">
          <h1 className="lp-hero__title">
            El dinero del <em>consultorio</em>,
            <br />
            al día. <span className="lp-hero__title-alt">Siempre.</span>
          </h1>

          <p className="lp-hero__sub">
            Administrá profesionales, pacientes y sesiones desde un único lugar.
            Cada profesional sabe exactamente cuánto debe al consultorio, y paga con
            un click vía Mercado Pago o transferencia.
          </p>

          <div className="lp-hero__ctas">
            <Link to="/crear-consultorio" className="lp-btn lp-btn--primary">
              Crear consultorio
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M13 5l7 7-7 7" />
              </svg>
            </Link>
            <a href="#como-funciona" className="lp-btn lp-btn--secondary">
              Ver cómo funciona
            </a>
          </div>
        </div>

        <HeroCard />
      </div>
    </section>
  );
}

/* ------------------------------------------------------------
   Card "viviente" del hero — cicla entre meses con datos distintos.
   Un cursor falso se desliza al selector de mes y "hace click",
   y todos los datos (números, barras, profesionales) cambian.
   ------------------------------------------------------------ */

// Datos de cada mes. El ciclo recorre este array en loop.
const MESES_DEMO = [
  {
    mes: 'enero · 2026',
    porCobrar: 312400,
    cobrado: 845600,
    sesiones: 218,
    profesionales: 8,
    barras: [38, 44, 41, 52, 49, 61],
    equipo: [
      { nombre: 'Lucía Fernández', rubro: 'Fonoaudiología', monto: 184200 },
      { nombre: 'Martín Gómez', rubro: 'Kinesiología', monto: 156800 },
      { nombre: 'Sofía Ramírez', rubro: 'Psicología', monto: 142500 },
    ],
  },
  {
    mes: 'febrero · 2026',
    porCobrar: 398100,
    cobrado: 967300,
    sesiones: 264,
    profesionales: 9,
    barras: [42, 50, 47, 58, 55, 68],
    equipo: [
      { nombre: 'Martín Gómez', rubro: 'Kinesiología', monto: 201400 },
      { nombre: 'Lucía Fernández', rubro: 'Fonoaudiología', monto: 178900 },
      { nombre: 'Diego Suárez', rubro: 'Nutrición', monto: 134600 },
    ],
  },
  {
    mes: 'marzo · 2026',
    porCobrar: 441700,
    cobrado: 1102500,
    sesiones: 301,
    profesionales: 11,
    barras: [40, 53, 49, 62, 67, 74],
    equipo: [
      { nombre: 'Sofía Ramírez', rubro: 'Psicología', monto: 223100 },
      { nombre: 'Martín Gómez', rubro: 'Kinesiología', monto: 198700 },
      { nombre: 'Valentina Ruiz', rubro: 'Psicopedagogía', monto: 167300 },
    ],
  },
  {
    mes: 'abril · 2026',
    porCobrar: 485200,
    cobrado: 1237800,
    sesiones: 347,
    profesionales: 12,
    barras: [45, 58, 52, 67, 73, 82],
    equipo: [
      { nombre: 'Lucía Fernández', rubro: 'Fonoaudiología', monto: 248600 },
      { nombre: 'Sofía Ramírez', rubro: 'Psicología', monto: 231900 },
      { nombre: 'Martín Gómez', rubro: 'Kinesiología', monto: 215400 },
    ],
  },
];

function HeroCard() {
  const [idx, setIdx] = useState(0);
  const [swapping, setSwapping] = useState(false);

  useEffect(() => {
    // Cada ciclo: mover cursor (swapping=true) → cambiar mes → soltar.
    const DURACION = 3400;
    const id = setInterval(() => {
      setSwapping(true);
      // pequeño delay para simular el "click" del cursor antes de cambiar datos
      setTimeout(() => {
        setIdx((i) => (i + 1) % MESES_DEMO.length);
        setSwapping(false);
      }, 520);
    }, DURACION);
    return () => clearInterval(id);
  }, []);

  const data = MESES_DEMO[idx];

  return (
    <div className="lp-hero-card" aria-hidden="true">
      {/* Cursor falso que se desliza al selector de mes */}
      <div className={`lp-hero-card__cursor ${swapping ? 'lp-hero-card__cursor--active' : ''}`}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path d="M5 3l4.5 16 2.5-6.5L18.5 10 5 3z" fill="var(--cp-text)" stroke="var(--cp-surface)" strokeWidth="1.2" strokeLinejoin="round" />
        </svg>
      </div>

      <div className="lp-hero-card__top">
        <div>
          <div className="lp-hero-card__label">Resumen del mes</div>
          <div className={`lp-hero-card__title lp-hero-card__monthtab ${swapping ? 'lp-hero-card__monthtab--press' : ''}`}>
            <span className="lp-hero-card__monthtab-arrow">‹</span>
            <span key={data.mes} className="lp-hero-card__monthlabel">{data.mes}</span>
            <span className="lp-hero-card__monthtab-arrow">›</span>
          </div>
        </div>
        <div className="lp-hero-card__pill">
          <span className="lp-hero-card__pulse" /> En vivo
        </div>
      </div>

      <div className="lp-hero-card__metrics">
        <Counter label="Por cobrar" value={data.porCobrar} formatter={(n) => formatoARS.format(n)} />
        <Counter label="Cobrado" value={data.cobrado} formatter={(n) => formatoARS.format(n)} />
        <Counter label="Sesiones" value={data.sesiones} />
        <Counter label="Profesionales" value={data.profesionales} />
      </div>

      <div className="lp-hero-card__chart">
        {data.barras.map((h, i) => (
          <div
            key={i}
            className={`lp-hero-card__bar ${i === data.barras.length - 1 ? 'lp-hero-card__bar--active' : ''}`}
            style={{ height: `${h}%` }}
          />
        ))}
      </div>

      {/* Mini-tabla de profesionales */}
      <div className="lp-hero-card__team">
        <div className="lp-hero-card__team-label">Profesionales</div>
        <div className="lp-hero-card__team-list">
          {data.equipo.map((p) => (
            <div className="lp-hero-card__team-row" key={p.nombre + data.mes}>
              <span className="lp-hero-card__team-avatar">
                {p.nombre.split(' ').map((w) => w[0]).join('').slice(0, 2)}
              </span>
              <span className="lp-hero-card__team-name">{p.nombre}</span>
              <span className="lp-hero-card__team-rubro">{p.rubro}</span>
              <span className="lp-hero-card__team-monto">{formatoARS.format(p.monto)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="lp-hero-card__foot">
        <div className="lp-hero-card__dots">
          {MESES_DEMO.map((_, i) => (
            <span key={i} className={i === idx ? 'lp-hero-card__dot--on' : ''} />
          ))}
        </div>
        <div className="lp-hero-card__url">consulpay.com/admin</div>
      </div>
    </div>
  );
}

/* Contador que hace tween suave al cambiar de value */
function Counter({ label, value, formatter = (n) => String(n) }) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);

  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (from === to) return;
    const duration = 800;
    const start = performance.now();
    const step = (now) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (progress < 1) requestAnimationFrame(step);
      else fromRef.current = to;
    };
    const id = requestAnimationFrame(step);
    return () => cancelAnimationFrame(id);
  }, [value]);

  return (
    <div className="lp-hero-card__metric">
      <div className="lp-hero-card__metric-label">{label}</div>
      <div className="lp-hero-card__metric-value">{formatter(display)}</div>
    </div>
  );
}

/* ============================================================
   Cómo funciona — grid asimétrico
   ============================================================ */
function ComoFunciona() {
  return (
    <section id="como-funciona" className="lp-section">
      <div className="lp-section__inner">
        <div className="lp-section__head">
          <div className="lp-section__eyebrow">Cómo funciona</div>
          <h2 className="lp-section__title">
            Tres pasos.
            <br />
            <em>Sin fricciones.</em>
          </h2>
        </div>

        <div className="lp-steps">
          <article className="lp-step lp-step--large">
            <div className="lp-step__num">01</div>
            <h3 className="lp-step__title">Creás tu consultorio en minutos</h3>
            <p className="lp-step__desc">
              Registrate con Google o email, definí el nombre del consultorio, los métodos
              de pago que aceptás (obra social, prepaga, particular) y los valores de
              sesión. Listo, ya podés empezar.
            </p>
            <div className="lp-step__decor" aria-hidden="true">
              <span className="lp-step__chip">Obra social</span>
              <span className="lp-step__chip lp-step__chip--accent">Particular · $15.000</span>
              <span className="lp-step__chip">APROSS · 35%</span>
            </div>
          </article>

          <article className="lp-step">
            <div className="lp-step__num">02</div>
            <h3 className="lp-step__title">Invitás a tus profesionales</h3>
            <p className="lp-step__desc">
              Enviás una invitación por email con el porcentaje que cobra el consultorio.
              Cada profesional tiene su propio panel de autogestión.
            </p>
          </article>

          <article className="lp-step">
            <div className="lp-step__num">03</div>
            <h3 className="lp-step__title">Gestionás y cobrás</h3>
            <p className="lp-step__desc">
              Registrás sesiones, el sistema calcula automáticamente cuánto debe cada profesional.
              Ellos pagan con un click vía Mercado Pago, Ualá o transferencia.
            </p>
          </article>
        </div>
      </div>
    </section>
  );
}

/* ============================================================
   Precios — tabla editorial
   ============================================================ */
function Precios() {
  return (
    <section id="precios" className="lp-section lp-section--alt">
      <div className="lp-section__inner">
        <div className="lp-section__head">
          <div className="lp-section__eyebrow">Precios</div>
          <h2 className="lp-section__title">
            Pagás por lo que usás.
            <br />
            <em>Sin sorpresas.</em>
          </h2>
          <p className="lp-section__lead">
            Empezás gratis. Cuando tu consultorio crece, pasás al Plan Pago y reducís
            la comisión por transacción.
          </p>
        </div>

        <div className="lp-pricing">
          {/* Plan Free */}
          <div className="lp-price-card">
            <div className="lp-price-card__top">
              <div className="lp-price-card__name">Free</div>
              <div className="lp-price-card__tagline">Para empezar sin compromiso</div>
            </div>

            <div className="lp-price-card__price">
              <span className="lp-price-card__amount">$0</span>
              <span className="lp-price-card__period">/ mes</span>
            </div>

            <ul className="lp-price-card__features">
              <li><CheckIcon /> Profesionales y pacientes ilimitados</li>
              <li><CheckIcon /> Cálculo automático de deuda</li>
              <li><CheckIcon /> Panel de autogestión para profesionales</li>
              <li><CheckIcon /> Pagos vía transferencia manual</li>
              <li className="lp-price-card__muted">
                <CheckIcon /> 1% comisión ConsulPay sobre el valor total de cada sesión
              </li>
            </ul>

            <Link to="/crear-consultorio" className="lp-btn lp-btn--secondary lp-btn--full">
              Empezar gratis
            </Link>
          </div>

          {/* Plan Pago */}
          <div className="lp-price-card lp-price-card--featured">
            <div className="lp-price-card__badge">Recomendado</div>

            <div className="lp-price-card__top">
              <div className="lp-price-card__name">Pago</div>
            </div>

            <div className="lp-price-card__price">
              <span className="lp-price-card__amount">$100.000</span>
              <span className="lp-price-card__period">/ 30 días</span>
            </div>

            <ul className="lp-price-card__features">
              <li><CheckIcon /> Todo lo del plan Free</li>
              <li><CheckIcon /> Integración con Mercado Pago y Ualá</li>
              <li><CheckIcon /> Split automático de pagos</li>
              <li><CheckIcon /> Soporte prioritario</li>
            </ul>

            <Link to="/crear-consultorio" className="lp-btn lp-btn--primary lp-btn--full">
              Empezar con plan Pago
            </Link>
          </div>
        </div>

        {/* Nota de comisión oculta — se comunica directamente al cliente */}
      </div>
    </section>
  );
}

/* ============================================================
   CTA final
   ============================================================ */
function CTAFinal() {
  return (
    <section className="lp-cta-final">
      <div className="lp-cta-final__inner">
        <h2 className="lp-cta-final__title">
          Empezá hoy.
          <br />
          <em>Tardás cinco minutos.</em>
        </h2>
        <div className="lp-cta-final__buttons">
          <Link to="/crear-consultorio" className="lp-btn lp-btn--primary lp-btn--lg">
            Crear consultorio
          </Link>
          <Link to="/login" className="lp-btn lp-btn--ghost lp-btn--lg">
            Ya tengo cuenta
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ============================================================
   Footer
   ============================================================ */
function Footer() {
  return (
    <footer className="lp-footer">
      <div className="lp-footer__inner">
        <div className="lp-footer__brand">
          <span className="lp-nav__mark">C</span>
          <span className="lp-nav__name">ConsulPay</span>
        </div>

        <div className="lp-footer__text">
          © {new Date().getFullYear()} ConsulPay · Todos los derechos reservados
        </div>

        <div className="lp-footer__links">
          <a href="#precios">Precios</a>
          <a href="#como-funciona">Cómo funciona</a>
          <Link to="/login">Iniciar sesión</Link>
        </div>
      </div>
    </footer>
  );
}

/* ============================================================
   Ícono de check
   ============================================================ */
function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
