import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';

import { useAuth } from '../../hooks/useAuth.js';
import { useConsultorio } from '../../hooks/useConsultorio.js';
import { PLANES, ROLES } from '../../lib/constants.js';
import { suscribirSolicitudesPendientes } from '../../lib/solicitudes.js';
import Avatar from '../ui/Avatar.jsx';
import PlanPill from '../ui/PlanPill.jsx';
import './Sidebar.css';

/* Íconos inline para tener control total del stroke-width */
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
  /*
    UserPlus: persona con un + al lado. Reemplaza al icono "Heart"
    anterior, que era inadecuado para representar pacientes (un
    consultorio es un contexto medico, no afectivo). Usamos el
    UserPlus de Feather Icons (mismo set visual que el resto del
    sidebar) para mantener coherencia.
  */
  UserPlus: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="8.5" cy="7" r="4" />
      <line x1="20" y1="8" x2="20" y2="14" />
      <line x1="23" y1="11" x2="17" y2="11" />
    </svg>
  ),
  Inbox: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z" />
    </svg>
  ),
  Settings: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  ),
  /*
    Split: dos flechas que se separan, simbolizando el "reparto" entre
    dos personas. Usado solo en el item de menu "Reparto" cuando hay
    2 administradores en el consultorio.
  */
  Split: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 3v4a4 4 0 004 4h6a4 4 0 014 4v6" />
      <path d="M5 3l-3 3M5 3l3 3" />
      <path d="M19 21l-3-3M19 21l3-3" />
    </svg>
  ),
  LogOut: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
    </svg>
  ),
};

function NavItem({ to, icon, children, end = false, badge }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => `cp-nav-item${isActive ? ' cp-nav-item--active' : ''}`}
    >
      <span className="cp-nav-item__icon">{icon}</span>
      <span className="cp-nav-item__label">{children}</span>
      {badge != null && badge > 0 && (
        <span className="cp-nav-item__badge" aria-label={`${badge} pendiente${badge === 1 ? '' : 's'}`}>
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </NavLink>
  );
}

function iniciales(nombre, email) {
  if (nombre) {
    const partes = nombre.trim().split(/\s+/);
    const first = partes[0]?.[0] ?? '';
    const last = partes.length > 1 ? partes[partes.length - 1][0] : '';
    return (first + last).toUpperCase();
  }
  if (email) return email[0].toUpperCase();
  return '·';
}

export default function Sidebar() {
  const { user, signOut } = useAuth();
  const { consultorio } = useConsultorio();

  const esSuperadmin = user?.rol === ROLES.SUPERADMIN;
  const esAdmin = user?.rol === ROLES.ADMIN;

  // El item "Reparto" solo aparece cuando hay 2 admins en el consultorio
  // (que es la condicion para que aplique el flow multi-admin con doble
  // cuenta MP). Si solo hay 1, esa pagina no tiene contenido para mostrar.
  const mostrarReparto = esAdmin && (consultorio?.adminUids?.length || 0) >= 2;

  // Conteo live de solicitudes pendientes (solo para admin).
  // Suscribimos siempre que sea admin con consultorioId; el unsub es seguro
  // si la suscripcion devuelve una funcion vacia (cuando faltan datos).
  const [solicitudesPendientes, setSolicitudesPendientes] = useState(0);
  useEffect(() => {
    if (!esAdmin || !user?.consultorioId) return;
    const unsub = suscribirSolicitudesPendientes(user.consultorioId, (lista) => {
      setSolicitudesPendientes(lista.length);
    });
    return unsub;
  }, [esAdmin, user?.consultorioId]);

  const nombre = user?.displayName || user?.email?.split('@')[0] || 'Usuario';
  const rolLabel = esSuperadmin
    ? 'Superadmin · ConsulPay'
    : esAdmin
      ? 'Admin · Consultorio'
      : 'Profesional';

  return (
    <aside className="cp-sidebar">
      {/* Badge Plan Ultra: arriba de todo, como un "sello" del workspace.
          Pro tambien se muestra aca arriba con su propio estilo. Free no
          muestra nada. */}
      {consultorio && (consultorio.plan === PLANES.ULTRA || consultorio.plan === PLANES.PRO) && (
        <div className="cp-sidebar__plan-header">
          <PlanPill plan={consultorio.plan} size="lg" />
        </div>
      )}

      <div className="cp-sidebar__brand">
        <div className="cp-sidebar__brand-mark">C</div>
        <div className="cp-sidebar__brand-name">ConsulPay</div>
      </div>

      {esSuperadmin ? (
        <nav className="cp-sidebar__section">
          <div className="cp-sidebar__label">Plataforma</div>
          <NavItem to="/super" end icon={<Icon.Home />}>Resumen</NavItem>
          <NavItem to="/super/consultorios" icon={<Icon.Users />}>Consultorios y usuarios</NavItem>
          <NavItem to="/super/pagos" icon={<Icon.Wallet />}>Pagos recibidos</NavItem>
          <NavItem to="/super/configuracion" icon={<Icon.Settings />}>Configuración</NavItem>
        </nav>
      ) : esAdmin ? (
        <>
          <nav className="cp-sidebar__section">
            <div className="cp-sidebar__label">General</div>
            <NavItem to="/admin" end icon={<Icon.Home />}>Resumen</NavItem>
            <NavItem to="/admin/profesionales" icon={<Icon.Users />}>Profesionales</NavItem>
            <NavItem to="/admin/sesiones" icon={<Icon.Calendar />}>Sesiones</NavItem>
            <NavItem
              to="/admin/solicitudes"
              icon={<Icon.Inbox />}
              badge={solicitudesPendientes}
            >
              Solicitudes
            </NavItem>
            <NavItem to="/admin/pagos" icon={<Icon.Wallet />}>Pagos</NavItem>
            <NavItem to="/admin/pacientes" icon={<Icon.UserPlus />}>Pacientes</NavItem>
          </nav>

          <nav className="cp-sidebar__section">
            <div className="cp-sidebar__label">Gestión</div>
            {mostrarReparto && (
              <NavItem to="/admin/reparto" icon={<Icon.Split />}>Reparto</NavItem>
            )}
            <NavItem to="/admin/configuracion" icon={<Icon.Settings />}>Configuración</NavItem>
          </nav>
        </>
      ) : (
        <nav className="cp-sidebar__section">
          <div className="cp-sidebar__label">Mi cuenta</div>
          <NavItem to="/mi-panel" end icon={<Icon.Home />}>Resumen</NavItem>
          <NavItem to="/mi-panel/pacientes" icon={<Icon.UserPlus />}>Mis pacientes</NavItem>
          {user?.permitirCargaPacientes && (
            <NavItem to="/mi-panel/pacientes/nuevo" icon={<Icon.UserPlus />}>Cargar paciente</NavItem>
          )}
          <NavItem to="/mi-panel/sesiones" icon={<Icon.Calendar />}>Mis sesiones</NavItem>
          <NavItem to="/mi-panel/pagos" icon={<Icon.Wallet />}>Mis pagos</NavItem>
        </nav>
      )}

      <div className="cp-sidebar__footer">
        <div className="cp-sidebar__footer-user">
          <Avatar initials={iniciales(user?.displayName, user?.email)} size={30} />
          <div className="cp-sidebar__user">
            <div className="cp-sidebar__user-name">{nombre}</div>
            <div className="cp-sidebar__user-role">{rolLabel}</div>
          </div>
          <button
            type="button"
            onClick={signOut}
            className="cp-sidebar__logout"
            aria-label="Cerrar sesión"
            title="Cerrar sesión"
          >
            <Icon.LogOut />
          </button>
        </div>
      </div>
    </aside>
  );
}
