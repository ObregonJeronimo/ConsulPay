import { NavLink } from 'react-router-dom';
import './Sidebar.css';

/* Íconos inline como componentes para mantener control total del stroke-width */
const Icon = {
  Home: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12l2-2 7-7 7 7 2 2v9a2 2 0 01-2 2h-4v-7H9v7H5a2 2 0 01-2-2v-9z" />
    </svg>
  ),
  Users: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-5.13a4 4 0 11-8 0 4 4 0 018 0zm6 3a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  Calendar: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 7V3m8 4V3M3 11h18M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  ),
  Wallet: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 10h18M7 15h2m4 0h4M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  ),
  Heart: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
    </svg>
  ),
  Settings: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  ),
};

function NavItem({ to, icon, children, end = false }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => `cp-nav-item${isActive ? ' cp-nav-item--active' : ''}`}
    >
      <span className="cp-nav-item__icon">{icon}</span>
      <span>{children}</span>
    </NavLink>
  );
}

export default function Sidebar() {
  return (
    <aside className="cp-sidebar">
      <div className="cp-sidebar__brand">
        <div className="cp-sidebar__brand-mark">C</div>
        <div className="cp-sidebar__brand-name">ConsulPay</div>
      </div>

      <nav className="cp-sidebar__section">
        <div className="cp-sidebar__label">General</div>
        <NavItem to="/admin" end icon={<Icon.Home />}>Resumen</NavItem>
        <NavItem to="/admin/profesionales" icon={<Icon.Users />}>Profesionales</NavItem>
        <NavItem to="/admin/sesiones" icon={<Icon.Calendar />}>Sesiones</NavItem>
        <NavItem to="/admin/pagos" icon={<Icon.Wallet />}>Pagos</NavItem>
        <NavItem to="/admin/pacientes" icon={<Icon.Heart />}>Pacientes</NavItem>
      </nav>

      <nav className="cp-sidebar__section">
        <div className="cp-sidebar__label">Gestión</div>
        <NavItem to="/admin/configuracion" icon={<Icon.Settings />}>Configuración</NavItem>
      </nav>

      <div className="cp-sidebar__footer">
        <div className="cp-sidebar__avatar">JO</div>
        <div className="cp-sidebar__user">
          <div className="cp-sidebar__user-name">Jerónimo Obregón</div>
          <div className="cp-sidebar__user-role">Admin · Consultorio</div>
        </div>
      </div>
    </aside>
  );
}
