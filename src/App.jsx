import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import { AuthProvider } from './contexts/AuthContext.jsx';
import ProtectedRoute from './routes/ProtectedRoute.jsx';
import RootRedirect from './routes/RootRedirect.jsx';
import AppShell from './components/layout/AppShell.jsx';

import Landing from './pages/Landing.jsx';
import Login from './pages/Login.jsx';
import CrearConsultorio from './pages/CrearConsultorio.jsx';
import AceptarInvitacion from './pages/AceptarInvitacion.jsx';
import Pendiente from './pages/Pendiente.jsx';
import DashboardSuper from './pages/super/Dashboard.jsx';
import DashboardAdmin from './pages/admin/Dashboard.jsx';
import Profesionales from './pages/admin/Profesionales.jsx';
import MiPanel from './pages/profesional/MiPanel.jsx';

import { ROLES } from './lib/constants.js';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
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
            </Route>
          </Route>

          {/* ---------- Admin de consultorio ---------- */}
          <Route element={<ProtectedRoute requireRole={ROLES.ADMIN} />}>
            <Route element={<AppShell />}>
              <Route path="/admin" element={<DashboardAdmin />} />
              <Route path="/admin/profesionales" element={<Profesionales />} />
            </Route>
          </Route>

          {/* ---------- Profesional ---------- */}
          <Route element={<ProtectedRoute requireRole={ROLES.PROFESIONAL} />}>
            <Route element={<AppShell />}>
              <Route path="/mi-panel" element={<MiPanel />} />
            </Route>
          </Route>

          {/* ---------- Root: redirige según el estado de sesión ---------- */}
          <Route path="/" element={<RootRedirect />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
