/**
 * RootRedirect
 *
 * En "/" decidimos a dónde mandar al usuario según su estado:
 *  - Cargando → spinner
 *  - Sin sesión → /login
 *  - Admin → /admin
 *  - Profesional aprobado → /mi-panel
 *  - Profesional no aprobado → /pendiente
 */

import { Navigate } from 'react-router-dom';

import { useAuth } from '../hooks/useAuth.js';
import { ESTADOS_USUARIO, ROLES } from '../lib/constants.js';
import Spinner from '../components/ui/Spinner.jsx';

export default function RootRedirect() {
  const { user, loading } = useAuth();

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

  if (!user) return <Navigate to="/login" replace />;
  if (user.rol === ROLES.ADMIN) return <Navigate to="/admin" replace />;
  if (user.estado !== ESTADOS_USUARIO.APROBADO) return <Navigate to="/pendiente" replace />;
  return <Navigate to="/mi-panel" replace />;
}
