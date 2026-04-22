import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import { AuthProvider } from './contexts/AuthContext.jsx';
import ProtectedRoute from './routes/ProtectedRoute.jsx';
import AppShell from './components/layout/AppShell.jsx';

import Login from './pages/Login.jsx';
import Pendiente from './pages/Pendiente.jsx';
import DashboardAdmin from './pages/admin/Dashboard.jsx';
import MiPanel from './pages/profesional/MiPanel.jsx';
import RootRedirect from './routes/RootRedirect.jsx';

import { ROLES } from './lib/constants.js';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Pública: login */}
          <Route path="/login" element={<Login />} />

          {/* Autenticada pero sin AppShell (sin sidebar): pantalla de espera */}
          <Route element={<ProtectedRoute requireAprobado={false} />}>
            <Route path="/pendiente" element={<Pendiente />} />
          </Route>

          {/* Admin: protegida por rol */}
          <Route element={<ProtectedRoute requireRole={ROLES.ADMIN} />}>
            <Route element={<AppShell />}>
              <Route path="/admin" element={<DashboardAdmin />} />
              {/* Las otras rutas admin (profesionales, sesiones, etc) se irán agregando */}
            </Route>
          </Route>

          {/* Profesional: protegida, requiere aprobación */}
          <Route element={<ProtectedRoute requireRole={ROLES.PROFESIONAL} />}>
            <Route element={<AppShell />}>
              <Route path="/mi-panel" element={<MiPanel />} />
            </Route>
          </Route>

          {/* Root: redirige según el estado de sesión */}
          <Route path="/" element={<RootRedirect />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
