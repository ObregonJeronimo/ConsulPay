import { useEffect } from 'react';
import { Link, Navigate } from 'react-router-dom';

import Button from '../components/ui/Button.jsx';
import { useAuth } from '../hooks/useAuth.js';
import { ESTADOS_USUARIO, ROLES } from '../lib/constants.js';
import './Pendiente.css';

export default function Pendiente() {
  const { user, signOut, refresh } = useAuth();

  // Si el user paso a ser admin/superadmin (porque acaba de crear su
  // consultorio o porque el sistema cambio su rol), redirigimos al
  // panel correspondiente. Esto evita quedar atrapado en /pendiente
  // despues de crear el consultorio mientras el state termina de
  // propagarse desde el onSnapshot.
  if (user?.rol === ROLES.ADMIN) {
    return <Navigate to="/admin" replace />;
  }
  if (user?.rol === ROLES.SUPERADMIN) {
    return <Navigate to="/super" replace />;
  }
  // Y si es profesional ya activo, al panel de profesional.
  if (user?.rol === ROLES.PROFESIONAL && user?.estado === ESTADOS_USUARIO.ACTIVO) {
    return <Navigate to="/mi-panel" replace />;
  }

  // Refresco automatico cada 4 segundos para detectar cambios del lado
  // del backend (admin aprobo, rol subio, etc.) sin que el user tenga que
  // tocar "Volver a comprobar" manualmente. La suscripcion live del
  // AuthContext deberia hacer esto solo, pero como red de seguridad
  // forzamos un poll por las dudas.
  useEffect(() => {
    const id = setInterval(() => {
      refresh().catch(() => {});
    }, 4000);
    return () => clearInterval(id);
  }, [refresh]);

  const rechazado = user?.estado === ESTADOS_USUARIO.RECHAZADO;
  const suspendido = user?.estado === ESTADOS_USUARIO.SUSPENDIDO;
  const retirado = user?.estado === ESTADOS_USUARIO.RETIRADO;

  /*
    Caso "sin consultorio": el usuario se logueo con un mail que no fue
    invitado a ningun consultorio. El doc se crea con consultorioId: null
    y estado pendiente, pero NO hay ningun admin que lo vaya a aprobar.
    Antes quedaban varados viendo "esperá la aprobación del admin", que es
    engañoso. Les mostramos que no pertenecen a ningun consultorio y les
    ofrecemos crear el suyo.
  */
  const sinConsultorio = !user?.consultorioId && !rechazado && !suspendido && !retirado;

  const titulo = sinConsultorio
    ? 'Todavía no estás en ningún consultorio'
    : retirado
      ? 'Acceso al consultorio cerrado'
      : rechazado
        ? 'Cuenta rechazada'
        : suspendido
          ? 'Cuenta suspendida'
          : 'Cuenta pendiente de aprobación';

  const mensaje = sinConsultorio
    ? 'Tu mail no está registrado en ningún consultorio. Puede ser que todavía no te hayan invitado como profesional: pedile al consultorio donde trabajás que te envíe una invitación a este mismo mail.'
    : retirado
      ? 'Ya no formás parte de este consultorio. Tus datos y registros se preservan, pero no podés iniciar sesión en el panel. Si querés volver a trabajar acá, contactá al administrador del consultorio para que te invite nuevamente.'
      : rechazado
        ? 'Tu solicitud de acceso no fue aprobada por el administrador.'
        : suspendido
          ? 'Tu cuenta fue suspendida. Contactá al administrador del consultorio para más información.'
          : 'Gracias por registrarte. Un administrador debe aprobar tu cuenta antes de que puedas acceder al panel.';

  // El estado "retirado" es definitivo desde el punto de vista del profesional:
  // no tiene sentido ofrecer "Volver a comprobar" porque solo el admin puede
  // reincorporarlo (y aun asi necesita iniciar sesion de nuevo).
  const mostrarVolverAComprobar = !rechazado && !suspendido && !retirado;

  return (
    <div className="cp-pendiente">
      <div className="cp-pendiente__card">
        <div className="cp-pendiente__icon" aria-hidden="true">
          {sinConsultorio ? (
            /* Edificio: "no perteneces a ningun consultorio" */
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 21h18" />
              <path d="M5 21V7l7-4 7 4v14" />
              <path d="M9 21v-5h6v5" />
              <line x1="9" y1="10" x2="9.01" y2="10" />
              <line x1="15" y1="10" x2="15.01" y2="10" />
            </svg>
          ) : (
            /* Reloj: esperando aprobacion */
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          )}
        </div>

        <h1 className="cp-pendiente__title">{titulo}</h1>
        <p className="cp-pendiente__msg">{mensaje}</p>

        {user?.email && (
          <div className="cp-pendiente__email">{user.email}</div>
        )}

        {sinConsultorio && (
          <div className="cp-pendiente__cta">
            <p className="cp-pendiente__cta-texto">
              ¿Querés probar el sistema? Podés crear tu propio consultorio ahora.
            </p>
            <Link to="/crear-consultorio" className="cp-pendiente__cta-btn">
              Crear mi consultorio
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </Link>
          </div>
        )}

        <div className="cp-pendiente__actions">
          {mostrarVolverAComprobar && (
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
