import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AppShell from './components/layout/AppShell.jsx';
import DashboardAdmin from './pages/admin/Dashboard.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Por ahora mostramos el dashboard admin directo, sin auth.
            Las rutas protegidas y login las agregamos en el próximo paso. */}
        <Route element={<AppShell />}>
          <Route path="/" element={<Navigate to="/admin" replace />} />
          <Route path="/admin" element={<DashboardAdmin />} />
        </Route>

        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
