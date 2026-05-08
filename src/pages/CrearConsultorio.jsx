import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import Button from '../components/ui/Button.jsx';
import Input from '../components/ui/Input.jsx';
import Spinner from '../components/ui/Spinner.jsx';
import {
  loginWithEmail,
  loginWithGoogle,
  registerWithEmail,
  traducirErrorAuth,
} from '../lib/auth.js';
import { crearConsultorio } from '../lib/consultorios.js';
import { useAuth } from '../hooks/useAuth.js';
import { ROLES } from '../lib/constants.js';
import './CrearConsultorio.css';

/* ============================================================
   Métodos de pago preseteados (el admin los puede ajustar después)
   ============================================================ */
const METODOS_DEFAULT = [
  { id: 'particular', nombre: 'Particular', tipo: 'inmediato', porcentajeConsultorio: 40, valorSesionDefault: 15000, activo: true },
  { id: 'obra_social_ioma', nombre: 'IOMA', tipo: 'diferido', porcentajeConsultorio: 30, valorSesionDefault: 8500, activo: true },
  { id: 'obra_social_apross', nombre: 'APROSS', tipo: 'diferido', porcentajeConsultorio: 22, valorSesionDefault: 9500, activo: true },
  { id: 'prepaga', nombre: 'Prepaga', tipo: 'diferido', porcentajeConsultorio: 33, valorSesionDefault: 12000, activo: true },
];

/* ============================================================
   Ícono de Google
   ============================================================ */
const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.83z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.83c.87-2.6 3.3-4.52 6.16-4.52z"/>
  </svg>
);

/* ============================================================
   Página principal
   ============================================================ */
export default function CrearConsultorio() {
  const { user, loading, refresh } = useAuth();
  const navigate = useNavigate();

  // Estado del wizard
  const [step, setStep] = useState(1);

  // Datos del consultorio
  const [nombreConsultorio, setNombreConsultorio] = useState('');
  const [direccion, setDireccion] = useState('');
  const [telefono, setTelefono] = useState('');
  const [cuit, setCuit] = useState('');
  const [cbu, setCbu] = useState('');
  const [alias, setAlias] = useState('');
  const [metodos, setMetodos] = useState(METODOS_DEFAULT);

  // Estados globales
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (loading) {
    return (
      <div className="cc-loading">
        <Spinner size={28} label="Cargando…" />
      </div>
    );
  }

  // Si el usuario ya tiene un consultorio, redirigirlo a su panel
  if (user?.consultorioId) {
    navigate('/admin', { replace: true });
    return null;
  }

  // Superadmin no debería crear consultorio
  if (user?.rol === ROLES.SUPERADMIN) {
    navigate('/super', { replace: true });
    return null;
  }

  const totalSteps = user ? 2 : 3;
  const stepDisplay = user ? step - 1 : step;

  async function onFinalizar() {
    if (!user) return;

    const metodosActivos = metodos.filter((m) => m.activo);
    if (metodosActivos.length === 0) {
      setError('Tenés que activar al menos un método de pago.');
      return;
    }

    setError('');
    setSubmitting(true);
    try {
      const { consultorioId } = await crearConsultorio({
        ownerUid: user.uid,
        nombreConsultorio,
        direccion,
        telefono,
        cuit,
        cbuTransferencia: cbu,
        aliasTransferencia: alias,
        metodosPagoPaciente: metodosActivos,
      });

      // Refresco el doc del user para que AuthContext tenga rol=admin y el nuevo consultorioId.
      // Esto dispara setUser en el provider, pero React no garantiza que el siguiente
      // render lo vea sincrono — y el navigate('/admin') de abajo evalua el ProtectedRoute
      // potencialmente con el state viejo (rol=profesional) y termina mandando al user a
      // /pendiente. Como red de seguridad, /pendiente.jsx detecta si el user ya es admin
      // y redirige a /admin solo. Pero igual hacemos lo correcto aca: no navegar hasta
      // que el doc reciente tenga rol=admin.
      let intentos = 0;
      while (intentos < 10) {
        await refresh();
        // En este punto, el call a refresh ya escribio el nuevo user en el state
        // del provider. Como leerCache lee localStorage, podemos chequearlo via
        // el cache que escribio el refresh (el cache se sincroniza en cada setUser).
        // Pero como no tenemos acceso directo al state actualizado dentro de este
        // closure, usamos un pequeno wait y reintentamos. Si despues de 10 intentos
        // (1.5s) no se actualizo, navegamos igual y dejamos que /pendiente redirija.
        await new Promise((r) => setTimeout(r, 150));
        intentos++;
        // Heuristica: si el localStorage del cache muestra rol=admin, cortamos.
        try {
          const cached = JSON.parse(localStorage.getItem('cp_user_cache') || 'null');
          if (cached?.rol === 'admin') break;
        } catch { /* ignore */ }
      }

      // Redirigir al dashboard admin
      navigate('/admin', { replace: true, state: { justCreated: consultorioId } });
    } catch (err) {
      console.error('Error creando consultorio:', err);
      setError(err.message || 'Ocurrió un error creando el consultorio. Intentá de nuevo.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="cc">
      {/* Nav minimal */}
      <header className="cc-nav">
        <button type="button" className="cc-nav__back" onClick={() => navigate(-1)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Volver
        </button>

        <div className="cc-nav__brand">
          <span className="cc-nav__mark">C</span>
          <span className="cc-nav__name">ConsulPay</span>
        </div>

        <div className="cc-nav__progress">
          Paso <strong>{stepDisplay}</strong> de {totalSteps}
        </div>
      </header>

      <main className="cc-main">
        <div className="cc-shell">

          {/* Paso 1: Autenticación (solo si no hay sesión) */}
          {!user && step === 1 && (
            <AuthStep onAuthenticated={() => setStep(2)} />
          )}

          {/* Paso 2: Datos del consultorio */}
          {user && step < 3 && (
            <DatosStep
              nombreConsultorio={nombreConsultorio}
              setNombreConsultorio={setNombreConsultorio}
              direccion={direccion}
              setDireccion={setDireccion}
              telefono={telefono}
              setTelefono={setTelefono}
              cuit={cuit}
              setCuit={setCuit}
              cbu={cbu}
              setCbu={setCbu}
              alias={alias}
              setAlias={setAlias}
              onNext={() => {
                if (!nombreConsultorio.trim()) {
                  setError('El nombre del consultorio es obligatorio.');
                  return;
                }
                setError('');
                setStep(3);
              }}
              error={error}
            />
          )}

          {/* Paso 3: Métodos de pago iniciales */}
          {user && step === 3 && (
            <MetodosStep
              metodos={metodos}
              setMetodos={setMetodos}
              onBack={() => setStep(2)}
              onFinalizar={onFinalizar}
              submitting={submitting}
              error={error}
            />
          )}

        </div>
      </main>
    </div>
  );
}

/* ============================================================
   Paso 1 — Autenticación
   ============================================================ */
function AuthStep({ onAuthenticated }) {
  const [mode, setMode] = useState('register');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(null);
  const [error, setError] = useState('');

  const isRegister = mode === 'register';

  async function onGoogle() {
    setError('');
    setLoading('google');
    try {
      await loginWithGoogle();
      onAuthenticated();
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
      onAuthenticated();
    } catch (err) {
      setError(traducirErrorAuth(err));
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="cc-step">
      <div className="cc-step__eyebrow">Paso 1 · Cuenta</div>
      <h1 className="cc-step__title">
        {isRegister ? 'Creá tu cuenta' : 'Iniciá sesión'}
      </h1>
      <p className="cc-step__sub">
        Usás tu cuenta para entrar siempre al panel de tu consultorio. Podés usar Google
        o crear una cuenta con email y contraseña.
      </p>

      <div className="cc-step__body">
        <Button
          variant="secondary"
          onClick={onGoogle}
          disabled={loading !== null}
          className="cc-google-btn"
          icon={loading === 'google' ? <Spinner size={14} /> : <GoogleIcon />}
        >
          {loading === 'google' ? 'Abriendo Google…' : 'Continuar con Google'}
        </Button>

        <div className="cc-divider"><span>o con email</span></div>

        <form onSubmit={onSubmitEmail} className="cc-form" noValidate>
          {isRegister && (
            <Input
              name="displayName"
              label="Tu nombre"
              placeholder="Jerónimo Obregón"
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

          {error && <div className="cc-error">{error}</div>}

          <Button
            type="submit"
            variant="primary"
            disabled={loading !== null}
            className="cc-submit"
          >
            {loading === 'email'
              ? (isRegister ? 'Creando cuenta…' : 'Ingresando…')
              : (isRegister ? 'Crear cuenta y continuar' : 'Ingresar y continuar')}
          </Button>
        </form>

        <div className="cc-switch">
          {isRegister ? '¿Ya tenés cuenta?' : '¿No tenés cuenta todavía?'}
          {' '}
          <button
            type="button"
            className="cc-switch-btn"
            onClick={() => { setMode(isRegister ? 'login' : 'register'); setError(''); }}
            disabled={loading !== null}
          >
            {isRegister ? 'Iniciar sesión' : 'Crear cuenta'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Paso 2 — Datos del consultorio
   ============================================================ */
function DatosStep({
  nombreConsultorio, setNombreConsultorio,
  direccion, setDireccion,
  telefono, setTelefono,
  cuit, setCuit,
  cbu, setCbu,
  alias, setAlias,
  onNext,
  error,
}) {
  return (
    <div className="cc-step">
      <div className="cc-step__eyebrow">Datos del consultorio</div>
      <h1 className="cc-step__title">Contanos sobre tu consultorio</h1>
      <p className="cc-step__sub">
        Podés editar toda esta información después desde el panel de configuración.
      </p>

      <div className="cc-step__body">
        <div className="cc-fieldset">
          <h3 className="cc-fieldset__title">Información básica</h3>
          <Input
            name="nombreConsultorio"
            label="Nombre del consultorio"
            placeholder="Ej: Consultorio Integral Córdoba"
            value={nombreConsultorio}
            onChange={(e) => setNombreConsultorio(e.target.value)}
            required
            autoFocus
          />
          <div className="cc-row">
            <Input
              name="direccion"
              label="Dirección"
              placeholder="Ej: Av. Siempre Viva 1234"
              value={direccion}
              onChange={(e) => setDireccion(e.target.value)}
            />
            <Input
              name="telefono"
              label="Teléfono"
              placeholder="+54 351 ..."
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
            />
          </div>
          <Input
            name="cuit"
            label="CUIT (opcional)"
            placeholder="30-XXXXXXXX-X"
            value={cuit}
            onChange={(e) => setCuit(e.target.value)}
          />
        </div>

        <div className="cc-fieldset">
          <h3 className="cc-fieldset__title">
            Datos para transferencia bancaria
            <span className="cc-fieldset__tag">Opcional</span>
          </h3>
          <p className="cc-fieldset__hint">
            Tus profesionales van a ver estos datos cuando elijan pagar por transferencia manual.
            Si todavía no los tenés, podés completarlos después.
          </p>
          <div className="cc-row">
            <Input
              name="cbu"
              label="CBU / CVU"
              placeholder="0000003100000000000000"
              value={cbu}
              onChange={(e) => setCbu(e.target.value)}
            />
            <Input
              name="alias"
              label="Alias"
              placeholder="mi.consultorio.mp"
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
            />
          </div>
        </div>

        {error && <div className="cc-error">{error}</div>}

        <div className="cc-actions">
          <Button variant="primary" onClick={onNext}>
            Continuar
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M13 5l7 7-7 7" />
            </svg>
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Paso 3 — Métodos de pago iniciales
   ============================================================ */
function MetodosStep({ metodos, setMetodos, onBack, onFinalizar, submitting, error }) {

  function toggleActivo(id) {
    setMetodos((prev) => prev.map((m) => m.id === id ? { ...m, activo: !m.activo } : m));
  }

  function updateField(id, field, value) {
    setMetodos((prev) => prev.map((m) => m.id === id ? { ...m, [field]: value } : m));
  }

  return (
    <div className="cc-step">
      <div className="cc-step__eyebrow">Métodos de pago del paciente</div>
      <h1 className="cc-step__title">Configurá tus métodos y valores</h1>
      <p className="cc-step__sub">
        Estos son los métodos de pago que aceptás de tus pacientes. El porcentaje es lo
        que se queda el consultorio de cada sesión. Podés editar todo esto después.
      </p>

      <div className="cc-step__body">
        <div className="cc-metodos">
          <div className="cc-metodos__head">
            <div>Método</div>
            <div>Valor por sesión</div>
            <div>% consultorio</div>
            <div>Activo</div>
          </div>

          {metodos.map((m) => (
            <div key={m.id} className={`cc-metodo ${m.activo ? '' : 'cc-metodo--off'}`}>
              <div className="cc-metodo__nombre">
                <input
                  type="text"
                  value={m.nombre}
                  onChange={(e) => updateField(m.id, 'nombre', e.target.value)}
                  className="cc-metodo__input"
                />
              </div>
              <div className="cc-metodo__cell">
                <span className="cc-metodo__prefix">$</span>
                <input
                  type="number"
                  value={m.valorSesionDefault}
                  onChange={(e) => updateField(m.id, 'valorSesionDefault', Number(e.target.value) || 0)}
                  className="cc-metodo__input cc-metodo__input--num"
                  min="0"
                  step="any"
                />
              </div>
              <div className="cc-metodo__cell">
                <input
                  type="number"
                  value={m.porcentajeConsultorio}
                  onChange={(e) => updateField(m.id, 'porcentajeConsultorio', Number(e.target.value) || 0)}
                  className="cc-metodo__input cc-metodo__input--num"
                  min="0"
                  max="100"
                  step="any"
                />
                <span className="cc-metodo__suffix">%</span>
              </div>
              <div>
                <button
                  type="button"
                  className={`cc-toggle ${m.activo ? 'cc-toggle--on' : ''}`}
                  onClick={() => toggleActivo(m.id)}
                  aria-pressed={m.activo}
                  aria-label={`Activar ${m.nombre}`}
                >
                  <span className="cc-toggle__thumb" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {error && <div className="cc-error">{error}</div>}

        <div className="cc-actions cc-actions--between">
          <Button variant="secondary" onClick={onBack} disabled={submitting}>
            Volver
          </Button>
          <Button variant="primary" onClick={onFinalizar} disabled={submitting}>
            {submitting ? (
              <>
                <Spinner size={14} />
                Creando consultorio…
              </>
            ) : (
              <>
                Crear consultorio
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
