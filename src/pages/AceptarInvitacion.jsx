import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { doc, getDoc, writeBatch, serverTimestamp } from 'firebase/firestore';

import Button from '../components/ui/Button.jsx';
import Input from '../components/ui/Input.jsx';
import Spinner from '../components/ui/Spinner.jsx';

import {
  loginWithEmail,
  loginWithGoogle,
  registerWithEmail,
  traducirErrorAuth,
} from '../lib/auth.js';
import { useAuth } from '../hooks/useAuth.js';
import { auth, db } from '../lib/firebase.js';
import { ESTADOS_INVITACION, ESTADOS_USUARIO, ROLES } from '../lib/constants.js';

import './AceptarInvitacion.css';

/* ============================================================
   Estados del flow:
     cargando | invalida | expirada | ya_usada | lista | aceptando | aceptada | error
   ============================================================ */

const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.83z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.83c.87-2.6 3.3-4.52 6.16-4.52z"/>
  </svg>
);

export default function AceptarInvitacion() {
  const [searchParams] = useSearchParams();
  const invitacionId = searchParams.get('id');
  const { user, refresh } = useAuth();
  const navigate = useNavigate();

  const [invitacion, setInvitacion] = useState(null);
  const [phase, setPhase] = useState('cargando');
  const [error, setError] = useState('');

  // Cargar invitación
  useEffect(() => {
    if (!invitacionId) {
      setPhase('invalida');
      return;
    }

    (async () => {
      try {
        const snap = await getDoc(doc(db, 'invitaciones_profesional', invitacionId));
        if (!snap.exists()) {
          setPhase('invalida');
          return;
        }
        const data = { id: snap.id, ...snap.data() };
        setInvitacion(data);

        // Chequeos de validez
        if (data.estado === ESTADOS_INVITACION.ACEPTADA) {
          setPhase('ya_usada');
          return;
        }
        if (data.estado === ESTADOS_INVITACION.CANCELADA) {
          setPhase('invalida');
          return;
        }
        if (data.expiraAt) {
          const expira = data.expiraAt.toDate ? data.expiraAt.toDate() : new Date(data.expiraAt);
          if (expira.getTime() < Date.now()) {
            setPhase('expirada');
            return;
          }
        }
        setPhase('lista');
      } catch (err) {
        console.error(err);
        setPhase('error');
      }
    })();
  }, [invitacionId]);

  async function aceptar() {
    if (!invitacion || !user) return;

    // Validar que el email del usuario coincide con el de la invitación
    if (user.email?.toLowerCase() !== invitacion.email.toLowerCase()) {
      setError(
        `Esta invitación es para ${invitacion.email}, pero vos iniciaste sesión con ${user.email}. Cerrá sesión e iniciá con el email correcto.`,
      );
      return;
    }

    // Validar que el usuario no sea superadmin
    if (user.rol === 'superadmin') {
      setError(
        'Tu cuenta es de tipo superadmin y no puede ser profesional de un consultorio. Pedile al administrador que mande la invitación a otro email.',
      );
      return;
    }

    // Validar que el usuario no sea admin de otro consultorio
    if (user.rol === 'admin' && user.consultorioId) {
      setError(
        'Ya sos administrador de otro consultorio. Un usuario no puede ser profesional si ya es admin.',
      );
      return;
    }

    // Validar que el usuario no esté ya ligado a otro consultorio
    if (user.consultorioId && user.consultorioId !== invitacion.consultorioId) {
      setError(
        'Ya pertenecés a otro consultorio. No podés aceptar esta invitación mientras sigas en el otro.',
      );
      return;
    }

    setPhase('aceptando');
    setError('');

    try {
      const batch = writeBatch(db);

      // 1. Actualizar el doc del usuario: ligarlo al consultorio, activarlo
      const userRef = doc(db, 'usuarios', user.uid);
      batch.update(userRef, {
        consultorioId: invitacion.consultorioId,
        estado: ESTADOS_USUARIO.ACTIVO,
        porcentajeCustom: invitacion.porcentajeOverride ?? null,
        // rol queda como profesional (era profesional por default al crearse)
      });

      // 2. Marcar invitación como aceptada
      const invRef = doc(db, 'invitaciones_profesional', invitacion.id);
      batch.update(invRef, {
        estado: ESTADOS_INVITACION.ACEPTADA,
        aceptadaAt: serverTimestamp(),
        uidAceptante: user.uid,
      });

      await batch.commit();

      // Refrescar el doc de usuario
      await refresh();

      setPhase('aceptada');

      // Redirigir al panel después de 2 segundos
      setTimeout(() => navigate('/mi-panel', { replace: true }), 2000);
    } catch (err) {
      console.error('Error aceptando invitación:', err);
      setError(err.message || 'No se pudo aceptar la invitación.');
      setPhase('lista');
    }
  }

  /* ============================================================
     Renders por fase
     ============================================================ */

  if (phase === 'cargando') {
    return (
      <Shell>
        <div className="ai-center">
          <Spinner size={28} label="Cargando invitación…" />
        </div>
      </Shell>
    );
  }

  if (phase === 'invalida') {
    return (
      <Shell>
        <StateCard
          icon="x"
          title="Invitación inválida"
          desc="El link que usaste no corresponde a una invitación válida. Verificá que hayas copiado bien la URL o pedile una nueva al administrador."
        />
      </Shell>
    );
  }

  if (phase === 'expirada') {
    return (
      <Shell>
        <StateCard
          icon="clock"
          title="Invitación expirada"
          desc="Esta invitación ya venció. Pedile una nueva al administrador del consultorio."
        />
      </Shell>
    );
  }

  if (phase === 'ya_usada') {
    return (
      <Shell>
        <StateCard
          icon="check"
          title="Invitación ya aceptada"
          desc="Esta invitación ya fue usada. Iniciá sesión con tu cuenta para acceder al panel."
          action={<Button variant="primary" onClick={() => navigate('/login')}>Iniciar sesión</Button>}
        />
      </Shell>
    );
  }

  if (phase === 'error') {
    return (
      <Shell>
        <StateCard
          icon="x"
          title="Algo salió mal"
          desc="No pudimos cargar la invitación. Volvé a intentarlo en unos minutos."
        />
      </Shell>
    );
  }

  if (phase === 'aceptada') {
    return (
      <Shell>
        <StateCard
          icon="check"
          title="¡Bienvenido/a!"
          desc={`Te sumaste al consultorio. Te estamos redirigiendo a tu panel…`}
        />
      </Shell>
    );
  }

  // Phase 'lista' o 'aceptando' → mostrar detalle + CTA
  return (
    <Shell>
      <div className="ai-card">
        <div className="ai-eyebrow">Invitación</div>
        <h1 className="ai-title">
          Te invitaron a <em>{invitacion.consultorioNombre || 'un consultorio'}</em>
        </h1>
        {invitacion.invitadoPorNombre && (
          <p className="ai-sub">{invitacion.invitadoPorNombre} te sumó como profesional.</p>
        )}

        <div className="ai-detail">
          <div className="ai-detail__row">
            <span className="ai-detail__label">Email</span>
            <span className="ai-detail__value">{invitacion.email}</span>
          </div>
          <div className="ai-detail__row">
            <span className="ai-detail__label">% que cobra el consultorio</span>
            <span className="ai-detail__value">{invitacion.porcentajeOverride ?? '—'}%</span>
          </div>
        </div>

        {!user ? (
          <AuthInline emailEsperado={invitacion.email} />
        ) : user.email?.toLowerCase() !== invitacion.email.toLowerCase() ? (
          <div className="ai-warning">
            Esta invitación es para <strong>{invitacion.email}</strong>.
            Iniciaste sesión con <strong>{user.email}</strong>.
            <div style={{ marginTop: 12 }}>
              <Button variant="secondary" onClick={() => { auth.signOut().then(() => window.location.reload()); }}>
                Cerrar sesión e iniciar con el email correcto
              </Button>
            </div>
          </div>
        ) : (
          <>
            {error && <div className="ai-error">{error}</div>}
            <Button
              variant="primary"
              onClick={aceptar}
              disabled={phase === 'aceptando'}
              className="ai-cta"
            >
              {phase === 'aceptando' ? <><Spinner size={14} /> Aceptando…</> : 'Aceptar invitación'}
            </Button>
          </>
        )}
      </div>
    </Shell>
  );
}

/* ============================================================
   Shell: nav + fondo
   ============================================================ */
function Shell({ children }) {
  return (
    <div className="ai">
      <header className="ai-nav">
        <div className="ai-nav__brand">
          <span className="ai-nav__mark">C</span>
          <span className="ai-nav__name">ConsulPay</span>
        </div>
      </header>
      <main className="ai-main">{children}</main>
    </div>
  );
}

/* ============================================================
   State card (invalida / expirada / aceptada)
   ============================================================ */
function StateCard({ icon, title, desc, action }) {
  return (
    <div className="ai-card ai-card--center">
      <div className={`ai-icon ai-icon--${icon}`}>
        {icon === 'x' && (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 18L18 6M6 6l12 12"/></svg>
        )}
        {icon === 'check' && (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        )}
        {icon === 'clock' && (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
        )}
      </div>
      <h1 className="ai-title">{title}</h1>
      <p className="ai-sub">{desc}</p>
      {action && <div style={{ marginTop: 20 }}>{action}</div>}
    </div>
  );
}

/* ============================================================
   Auth inline (si no hay sesión)
   ============================================================ */
function AuthInline({ emailEsperado }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState(emailEsperado);
  const [password, setPassword] = useState('');
  const [nombre, setNombre] = useState('');
  const [loading, setLoading] = useState(null);
  const [error, setError] = useState('');

  const isRegister = mode === 'register';

  async function onGoogle() {
    setError(''); setLoading('google');
    try {
      await loginWithGoogle();
    } catch (err) {
      setError(traducirErrorAuth(err));
    } finally {
      setLoading(null);
    }
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError(''); setLoading('email');
    try {
      if (isRegister) {
        await registerWithEmail(email, password, nombre);
      } else {
        await loginWithEmail(email, password);
      }
    } catch (err) {
      setError(traducirErrorAuth(err));
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="ai-auth">
      <div className="ai-auth__title">
        Iniciá sesión con <strong>{emailEsperado}</strong> para aceptar
      </div>

      <Button
        variant="secondary"
        onClick={onGoogle}
        disabled={loading !== null}
        icon={loading === 'google' ? <Spinner size={14} /> : <GoogleIcon />}
        className="ai-auth__google"
      >
        {loading === 'google' ? 'Abriendo…' : 'Continuar con Google'}
      </Button>

      <div className="ai-divider"><span>o con email</span></div>

      <form onSubmit={onSubmit} className="ai-form" noValidate>
        {isRegister && (
          <Input
            name="nombre"
            label="Tu nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            required
          />
        )}
        <Input
          name="email"
          type="email"
          label="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={loading !== null}
        />
        <Input
          name="password"
          type="password"
          label="Contraseña"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          disabled={loading !== null}
        />
        {error && <div className="ai-error">{error}</div>}
        <Button variant="primary" type="submit" disabled={loading !== null} className="ai-cta">
          {loading === 'email' ? <><Spinner size={14} /> Procesando…</> : (isRegister ? 'Crear cuenta' : 'Ingresar')}
        </Button>
      </form>

      <div className="ai-switch">
        {isRegister ? '¿Ya tenés cuenta?' : '¿No tenés cuenta?'}{' '}
        <button type="button" className="ai-switch__btn" onClick={() => { setMode(isRegister ? 'login' : 'register'); setError(''); }}>
          {isRegister ? 'Iniciar sesión' : 'Crear una'}
        </button>
      </div>
    </div>
  );
}
