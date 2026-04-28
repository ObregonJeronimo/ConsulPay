/**
 * ProtectedRoute
 *
 * Guarda una ruta según el estado de auth y rol del usuario.
 *
 * JERARQUÍA DE ROLES:
 *   superadmin — puede entrar a cualquier ruta protegida (vos y Thiago)
 *   admin      — acceso a rutas admin del consultorio
 *   profesional — acceso a rutas profesional (requiere estado=activo)
 *
 * Props:
 *   requireRole: uno de 'superadmin' | 'admin' | 'profesional'.
 *                Superadmin pasa por cualquier requireRole.
 *   requireActivo: si true, exige estado=activo. (default: true)
 */

import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useAuth } from '../hooks/useAuth.js';
import { ESTADOS_USUARIO, ROLES } from '../lib/constants.js';
import Spinner from '../components/ui/Spinner.jsx';

export default function ProtectedRoute({ requireRole, requireActivo = true }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <Spinner size={28} label="Cargando…" />
      </div>
    );
  }

  // No autenticado → al login
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  /*
    Estado 'retirado': el usuario ya no forma parte del consultorio.
    Lo redirigimos a /pendiente (que detecta el estado y muestra
    el mensaje apropiado: 'Acceso al consultorio cerrado').

    Lo chequeamos ANTES del corte por rol porque queremos que aplique
    a cualquier rol (admin retirado, profesional retirado, etc.). El
    superadmin no entra a este caso porque su flujo no permite
    retirarse.
  */
  if (user.rol !== ROLES.SUPERADMIN && user.estado === ESTADOS_USUARIO.RETIRADO) {
    return <Navigate to="/pendiente" replace />;
  }

  // Superadmin: carta blanca siempre
  if (user.rol === ROLES.SUPERADMIN) {
    return <Outlet />;
  }

  // Admin: acceso libre a cualquier ruta admin (independiente de estado)
  if (user.rol === ROLES.ADMIN) {
    if (requireRole && requireRole !== ROLES.ADMIN) {
      return <Navigate to="/admin" replace />;
    }
    return <Outlet />;
  }

  // Profesional: tiene que estar activo y pertenecer a un consultorio
  if (requireActivo && user.estado !== ESTADOS_USUARIO.ACTIVO) {
    return <Navigate to="/pendiente" replace />;
  }

  // Chequeo de rol específico
  if (requireRole && user.rol !== requireRole) {
    return <Navigate to="/mi-panel" replace />;
  }

  return <Outlet />;
}
