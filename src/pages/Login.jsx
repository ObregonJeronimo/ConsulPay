import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

import Button from '../components/ui/Button.jsx';
import Input from '../components/ui/Input.jsx';
import Spinner from '../components/ui/Spinner.jsx';
import {
  loginWithEmail,
  loginWithGoogle,
  registerWithEmail,
  traducirErrorAuth,
} from '../lib/auth.js';
import './Login.css';

const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.83z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.83c.87-2.6 3.3-4.52 6.16-4.52z"/>
  </svg>
);

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from ?? null;

  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(null); // null | 'google' | 'email'
  const [error, setError] = useState('');

  const isRegister = mode === 'register';

  function irAlDestino() {
    if (from) {
      navigate(from, { replace: true });
      return;
    }
    // Redirigir siempre a la raíz y que RootRedirect se encargue de
    // elegir el destino según rol/estado. Así centralizamos esa lógica.
    navigate('/', { replace: true });
  }

  async function onGoogle() {
    setError('');
    setLoading('google');
    try {
      await loginWithGoogle();
      irAlDestino();
    } catch (err) {
      setError(traducirErrorAuth(err));
    } finally {
      setLoading(null);
    }
  }

  async function onSubmitEmail(e) {
    e.preventDefault();
    setError('');
    setLoading('email');
    try {
      if (isRegister) {
        await registerWithEmail(email, password, displayName);
      } else {
        await loginWithEmail(email, password);
      }
      irAlDestino();
    } catch (err) {
      setError(traducirErrorAuth(err));
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="cp-login">
      {/* ---------- Panel izquierdo: form ---------- */}
      <div className="cp-login__form-side">
        <div className="cp-login__container">
          <div className="cp-login__brand">
            <div className="cp-login__brand-mark">C</div>
            <div className="cp-login__brand-name">ConsulPay</div>
          </div>

          <div className="cp-login__heading">
            <h1 className="cp-login__title">
              {isRegister ? 'Crear cuenta' : 'Bienvenido'}
            </h1>
            <p className="cp-login__sub">
              {isRegister
                ? 'Registrate como profesional. Un admin debe aprobar tu cuenta antes de acceder.'
                : 'Ingresá a tu panel de ConsulPay.'}
            </p>
          </div>

          {/* Botón Google */}
          <Button
            variant="secondary"
            onClick={onGoogle}
            disabled={loading !== null}
            className="cp-login__google"
            icon={loading === 'google' ? <Spinner size={14} /> : <GoogleIcon />}
          >
            {loading === 'google' ? 'Abriendo Google…' : 'Continuar con Google'}
          </Button>

          <div className="cp-login__divider">
            <span>o con email</span>
          </div>

          {/* Form email/password */}
          <form onSubmit={onSubmitEmail} className="cp-login__form" noValidate>
            {isRegister && (
              <Input
                name="displayName"
                label="Nombre completo"
                placeholder="María Rodríguez"
                autoComplete="name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                disabled={loading !== null}
                required
              />
            )}

            <Input
              name="email"
              type="email"
              label="Email"
              placeholder="tu@email.com"
              autoComplete={isRegister ? 'email' : 'username'}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading !== null}
              required
            />

            <Input
              name="password"
              type="password"
              label="Contraseña"
              placeholder={isRegister ? 'Mínimo 6 caracteres' : '••••••••'}
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading !== null}
              minLength={6}
              required
            />

            {error && <div className="cp-login__error">{error}</div>}

            <Button
              type="submit"
              variant="primary"
              disabled={loading !== null}
              className="cp-login__submit"
            >
              {loading === 'email'
                ? (isRegister ? 'Creando cuenta…' : 'Ingresando…')
                : (isRegister ? 'Crear cuenta' : 'Ingresar')}
            </Button>
          </form>

          <div className="cp-login__switch">
            {isRegister ? '¿Ya tenés cuenta?' : '¿Nuevo en ConsulPay?'}
            {' '}
            <button
              type="button"
              className="cp-login__switch-btn"
              onClick={() => {
                setMode(isRegister ? 'login' : 'register');
                setError('');
              }}
              disabled={loading !== null}
            >
              {isRegister ? 'Iniciar sesión' : 'Crear cuenta'}
            </button>
          </div>
        </div>
      </div>

      {/* ---------- Panel derecho: hero editorial ---------- */}
      <aside className="cp-login__hero" aria-hidden="true">
        <div className="cp-login__hero-content">
          <blockquote className="cp-login__quote">
            Gestión simple del consultorio.
            <br />
            <em>Pagos claros.</em> Profesionales al día.
          </blockquote>
          <div className="cp-login__hero-foot">ConsulPay · {new Date().getFullYear()}</div>
        </div>
        <div className="cp-login__hero-deco" />
      </aside>
    </div>
  );
}
