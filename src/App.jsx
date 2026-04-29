import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import { AuthProvider } from './contexts/AuthContext.jsx';
import ProtectedRoute from './routes/ProtectedRoute.jsx';
import RootRedirect from './routes/RootRedirect.jsx';
import AppShell from './components/layout/AppShell.jsx';
import Spinner from './components/ui/Spinner.jsx';

import Landing from './pages/Landing.jsx';
import Login from './pages/Login.jsx';

import { ROLES } from './lib/constants.js';

// Lazy: se cargan solo cuando el usuario navega a la ruta correspondiente.
// Esto parte el bundle en chunks más chicos: quien solo visita la landing
// no descarga el código del admin, y viceversa.
const CrearConsultorio = lazy(() => import('./pages/CrearConsultorio.jsx'));
const AceptarInvitacion = lazy(() => import('./pages/AceptarInvitacion.jsx'));
const Pendiente = lazy(() => import('./pages/Pendiente.jsx'));
const DashboardSuper = lazy(() => import('./pages/super/Dashboard.jsx'));
const ConfiguracionSuper = lazy(() => import('./pages/super/ConfiguracionSuper.jsx'));
const ConsultoriosSuper = lazy(() => import('./pages/super/ConsultoriosSuper.jsx'));
const DashboardAdmin = lazy(() => import('./pages/admin/Dashboard.jsx'));
const Profesionales = lazy(() => import('./pages/admin/Profesionales.jsx'));
const Configuracion = lazy(() => import('./pages/admin/Configuracion.jsx'));
const Pacientes = lazy(() => import('./pages/admin/Pacientes.jsx'));
const Sesiones = lazy(() => import('./pages/admin/Sesiones.jsx'));
const Solicitudes = lazy(() => import('./pages/admin/Solicitudes.jsx'));
const PagosAdmin = lazy(() => import('./pages/admin/Pagos.jsx'));
const MiPanel = lazy(() => import('./pages/profesional/MiPanel.jsx'));
const MisPacientes = lazy(() => import('./pages/profesional/MisPacientes.jsx'));
const MisSesiones = lazy(() => import('./pages/profesional/MisSesiones.jsx'));
const MisPagos = lazy(() => import('./pages/profesional/MisPagos.jsx'));
const RetornoPago = lazy(() => import('./pages/profesional/RetornoPago.jsx'));

/**
 * Fallback que se muestra mientras un chunk lazy está descargándose.
 * Con conexiones rápidas es imperceptible; con conexiones lentas
 * evita la pantalla en blanco.
 */
function RouteFallback() {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--cp-bg)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <Spinner size={28} />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            {/* ---------- Públicas ---------- */}
            <Route path="/inicio" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/crear-consultorio" element={<CrearConsultorio />} />
            <Route path="/aceptar-invitacion" element={<AceptarInvitacion />} />

            {/* ---------- Autenticadas sin shell ---------- */}
            <Route element={<ProtectedRoute requireActivo={false} />}>
              <Route path="/pendiente" element={<Pendiente />} />
            </Route>

            {/* ---------- Superadmin ---------- */}
            <Route element={<ProtectedRoute requireRole={ROLES.SUPERADMIN} />}>
              <Route element={<AppShell />}>
                <Route path="/super" element={<DashboardSuper />} />
                <Route path="/super/consultorios" element={<ConsultoriosSuper />} />
                <Route path="/super/configuracion" element={<ConfiguracionSuper />} />
              </Route>
            </Route>

            {/* ---------- Admin de consultorio ---------- */}
            <Route element={<ProtectedRoute requireRole={ROLES.ADMIN} />}>
              <Route element={<AppShell />}>
                <Route path="/admin" element={<DashboardAdmin />} />
                <Route path="/admin/profesionales" element={<Profesionales />} />
                <Route path="/admin/pacientes" element={<Pacientes />} />
                <Route path="/admin/sesiones" element={<Sesiones />} />
                <Route path="/admin/solicitudes" element={<Solicitudes />} />
                <Route path="/admin/pagos" element={<PagosAdmin />} />
                <Route path="/admin/configuracion" element={<Configuracion />} />
              </Route>
            </Route>

            {/* ---------- Profesional ---------- */}
            <Route element={<ProtectedRoute requireRole={ROLES.PROFESIONAL} />}>
              <Route element={<AppShell />}>
                <Route path="/mi-panel" element={<MiPanel />} />
                <Route path="/mi-panel/pacientes" element={<MisPacientes />} />
                <Route path="/mi-panel/sesiones" element={<MisSesiones />} />
                <Route path="/mi-panel/pagos" element={<MisPagos />} />
                <Route path="/mi-panel/pagos/retorno" element={<RetornoPago />} />
              </Route>
            </Route>

            {/* ---------- Root ---------- */}
            <Route path="/" element={<RootRedirect />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
}
