import Button from '../components/ui/Button.jsx';
import { useAuth } from '../hooks/useAuth.js';
import { ESTADOS_USUARIO } from '../lib/constants.js';
import './Pendiente.css';

export default function Pendiente() {
  const { user, signOut, refresh } = useAuth();

  const rechazado = user?.estado === ESTADOS_USUARIO.RECHAZADO;
  const suspendido = user?.estado === ESTADOS_USUARIO.SUSPENDIDO;

  const titulo = rechazado
    ? 'Cuenta rechazada'
    : suspendido
      ? 'Cuenta suspendida'
      : 'Cuenta pendiente de aprobación';

  const mensaje = rechazado
    ? 'Tu solicitud de acceso no fue aprobada por el administrador.'
    : suspendido
      ? 'Tu cuenta fue suspendida. Contactá al administrador del consultorio para más información.'
      : 'Gracias por registrarte. Un administrador debe aprobar tu cuenta antes de que puedas acceder al panel.';

  return (
    <div className="cp-pendiente">
      <div className="cp-pendiente__card">
        <div className="cp-pendiente__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        </div>

        <h1 className="cp-pendiente__title">{titulo}</h1>
        <p className="cp-pendiente__msg">{mensaje}</p>

        {user?.email && (
          <div className="cp-pendiente__email">{user.email}</div>
        )}

        <div className="cp-pendiente__actions">
          {!rechazado && !suspendido && (
            <Button variant="secondary" onClick={refresh}>
              Volver a comprobar
            </Button>
          )}
          <Button variant="ghost" onClick={signOut}>
            Cerrar sesión
          </Button>
        </div>
      </div>
    </div>
  );
}
