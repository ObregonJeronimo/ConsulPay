import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar.jsx';
import './AppShell.css';

export default function AppShell() {
  return (
    <div className="cp-shell">
      <Sidebar />
      <main className="cp-shell__main">
        <Outlet />
      </main>
    </div>
  );
}
