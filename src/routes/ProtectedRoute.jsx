/**
 * ProtectedRoute
 *
 * Guarda una ruta según el estado de auth y rol del usuario.
 *
 * Props:
 *  - requireRole: 'admin' | 'profesional' (opcional). Si se especifica,
 *    solo usuarios con ese rol pueden acceder.
 *  - requireAprobado: boolean. Si true, redirige a /pendiente cuando el
 *    usuario no está aprobado. (default: true para evitar exposición de
 *    datos a profesionales no aprobados)
 */

import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useAuth } from '../hooks/useAuth.js';
import { ESTADOS_USUARIO, ROLES } from '../lib/constants.js';
import Spinner from '../components/ui/Spinner.jsx';

export default function ProtectedRoute({ requireRole, requireAprobado = true }) {
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

  // El admin tiene carta blanca, sin pasar por "pendiente" ni filtros de rol
  if (user.rol === ROLES.ADMIN) {
    if (requireRole && requireRole !== ROLES.ADMIN) {
      // Un admin entrando a una ruta de profesional → llevarlo a su home
      return <Navigate to="/admin" replace />;
    }
    return <Outlet />;
  }

  // Usuario común: chequear aprobación
  if (requireAprobado && user.estado !== ESTADOS_USUARIO.APROBADO) {
    return <Navigate to="/pendiente" replace />;
  }

  // Chequeo de rol
  if (requireRole && user.rol !== requireRole) {
    return <Navigate to="/mi-panel" replace />;
  }

  return <Outlet />;
}
