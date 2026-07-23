import { Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import { AuthProvider } from './contexts/AuthContext.jsx';
import ProtectedRoute from './routes/ProtectedRoute.jsx';
import RootRedirect from './routes/RootRedirect.jsx';
import AppShell from './components/layout/AppShell.jsx';
import Spinner from './components/ui/Spinner.jsx';
import ChunkErrorBoundary from './components/ChunkErrorBoundary.jsx';

import Landing from './pages/Landing.jsx';
import Login from './pages/Login.jsx';

import { ROLES } from './lib/constants.js';
import lazyWithRetry, { clearChunkReloadFlag } from './lib/lazyWithRetry.js';

// Lazy: se cargan solo cuando el usuario navega a la ruta correspondiente.
// Esto parte el bundle en chunks más chicos: quien solo visita la landing
// no descarga el código del admin, y viceversa.
const CrearConsultorio = lazyWithRetry(() => import('./pages/CrearConsultorio.jsx'));
const AceptarInvitacion = lazyWithRetry(() => import('./pages/AceptarInvitacion.jsx'));
const Pendiente = lazyWithRetry(() => import('./pages/Pendiente.jsx'));
const DashboardSuper = lazyWithRetry(() => import('./pages/super/Dashboard.jsx'));
const ConfiguracionSuper = lazyWithRetry(() => import('./pages/super/ConfiguracionSuper.jsx'));
const ConsultoriosSuper = lazyWithRetry(() => import('./pages/super/ConsultoriosSuper.jsx'));
const DashboardAdmin = lazyWithRetry(() => import('./pages/admin/Dashboard.jsx'));
const Profesionales = lazyWithRetry(() => import('./pages/admin/Profesionales.jsx'));
const Configuracion = lazyWithRetry(() => import('./pages/admin/Configuracion.jsx'));
const Pacientes = lazyWithRetry(() => import('./pages/admin/Pacientes.jsx'));
const Sesiones = lazyWithRetry(() => import('./pages/admin/Sesiones.jsx'));
const Solicitudes = lazyWithRetry(() => import('./pages/admin/Solicitudes.jsx'));
const PagosAdmin = lazyWithRetry(() => import('./pages/admin/Pagos.jsx'));
const Reparto = lazyWithRetry(() => import('./pages/admin/Reparto.jsx'));
const Calendario = lazyWithRetry(() => import('./pages/admin/Calendario.jsx'));
const MiPanel = lazyWithRetry(() => import('./pages/profesional/MiPanel.jsx'));
const MisPacientes = lazyWithRetry(() => import('./pages/profesional/MisPacientes.jsx'));
const MisSesiones = lazyWithRetry(() => import('./pages/profesional/MisSesiones.jsx'));
const MisPagos = lazyWithRetry(() => import('./pages/profesional/MisPagos.jsx'));
const RetornoPago = lazyWithRetry(() => import('./pages/profesional/RetornoPago.jsx'));
const MiAgenda = lazyWithRetry(() => import('./pages/profesional/MiAgenda.jsx'));

// Paginas legales publicas (sin auth) — se incluyen como lazy igual
// que el resto, asi no engordan el bundle inicial. Quien viene a leer
// los terminos descarga solo ese chunk.
const PoliticaPrivacidad = lazyWithRetry(() => import('./pages/legal/PoliticaPrivacidad.jsx'));
const TerminosCondiciones = lazyWithRetry(() => import('./pages/legal/TerminosCondiciones.jsx'));

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
  // Si llegamos hasta aca sin pantalla en blanco, todo cargo bien.
  // Limpiamos el flag para que la proxima vez que falle un chunk (otro
  // deploy futuro) tambien tenga su retry+reload.
  useEffect(() => {
    clearChunkReloadFlag();
  }, []);

  return (
    <ChunkErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
            {/* ---------- Públicas ---------- */}
            <Route path="/inicio" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/crear-consultorio" element={<CrearConsultorio />} />
            <Route path="/aceptar-invitacion" element={<AceptarInvitacion />} />

            {/* Paginas legales — accesibles sin login para que cualquier
                visitante o cliente potencial pueda leerlas antes de
                registrarse. */}
            <Route path="/privacidad" element={<PoliticaPrivacidad />} />
            <Route path="/terminos" element={<TerminosCondiciones />} />

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
                <Route path="/admin/calendario" element={<Calendario />} />
                <Route path="/admin/sesiones" element={<Sesiones />} />
                <Route path="/admin/solicitudes" element={<Solicitudes />} />
                <Route path="/admin/pagos" element={<PagosAdmin />} />
                <Route path="/admin/reparto" element={<Reparto />} />
                <Route path="/admin/configuracion" element={<Configuracion />} />
              </Route>
            </Route>

            {/* ---------- Profesional ---------- */}
            <Route element={<ProtectedRoute requireRole={ROLES.PROFESIONAL} />}>
              <Route element={<AppShell />}>
                <Route path="/mi-panel" element={<MiPanel />} />
                <Route path="/mi-panel/pacientes" element={<MisPacientes />} />
                <Route path="/mi-panel/agenda" element={<MiAgenda />} />
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
    </ChunkErrorBoundary>
  );
}
