import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';

import Sidebar from './Sidebar.jsx';
import './AppShell.css';
import { useAuth } from '../../hooks/useAuth.js';
import { sincronizarDirectorioAdmins } from '../../lib/consultorios.js';

/**
 * AppShell — wrapper de layout (sidebar + main).
 *
 * Desktop (>900px): sidebar siempre visible a la izquierda, main a la derecha.
 *
 * Mobile (<=900px): sidebar oculto por default, se abre como drawer slide-in
 * desde la izquierda con backdrop oscuro al tocar el boton hamburguesa del
 * header sticky. Cierra:
 *   - Al tocar el backdrop
 *   - Al tocar la X del drawer
 *   - Al navegar a otra ruta (lo manejamos via location)
 *   - Al presionar Escape
 *
 * El header sticky en mobile tiene logo + hamburger. En desktop el header
 * no se renderiza (display: none) — el sidebar fijo cumple esa funcion.
 */

function HamburgerIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export default function AppShell() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const { user } = useAuth();

  /* El profesional no puede leer /usuarios de otros miembros, asi que los
     nombres de los administradores viven denormalizados en el doc del
     consultorio. Cada admin publica el suyo al entrar; si no es admin, la
     funcion corta sola. Falla en silencio a proposito: es un dato de
     conveniencia, no puede romperle la sesion a nadie. */
  useEffect(() => {
    if (!user?.uid || !user?.consultorioId) return;
    const nombre = user.displayName || user.email;
    if (!nombre) return;
    sincronizarDirectorioAdmins(user.consultorioId, { uid: user.uid, nombre })
      .catch(() => {});
  }, [user?.uid, user?.consultorioId, user?.displayName, user?.email]);

  // Cerrar drawer al cambiar de ruta (cuando el user toca un NavItem)
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  // Cerrar con Escape
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const onKey = (e) => { if (e.key === 'Escape') setMobileMenuOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileMenuOpen]);

  // Bloquear scroll del body cuando el drawer esta abierto. Si no, el
  // contenido de atras se puede scrollear con el dedo y se ve raro.
  useEffect(() => {
    if (mobileMenuOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [mobileMenuOpen]);

  return (
    <div className={`cp-shell ${mobileMenuOpen ? 'cp-shell--menu-open' : ''}`}>
      {/* Header sticky solo visible en mobile (display:none en desktop via CSS) */}
      <header className="cp-shell__mobile-header">
        <button
          type="button"
          className="cp-shell__hamburger"
          onClick={() => setMobileMenuOpen(true)}
          aria-label="Abrir menú"
          aria-expanded={mobileMenuOpen}
        >
          <HamburgerIcon />
        </button>
        <div className="cp-shell__mobile-brand">
          <div className="cp-shell__mobile-brand-mark">C</div>
          <span className="cp-shell__mobile-brand-name">ConsulPay</span>
        </div>
        {/* Spacer para balancear visualmente con el hamburger a la izquierda.
            Mantiene el brand centrado opticamente. */}
        <div className="cp-shell__mobile-spacer" aria-hidden />
      </header>

      {/* Backdrop: solo aparece cuando el drawer esta abierto en mobile.
          Click cierra el drawer. */}
      {mobileMenuOpen && (
        <button
          type="button"
          className="cp-shell__backdrop"
          onClick={() => setMobileMenuOpen(false)}
          aria-label="Cerrar menú"
        />
      )}

      {/* Sidebar — drawer en mobile, fijo en desktop. La clase --open la
          activa el drawer mobile (transform: translateX(0)). */}
      <aside className={`cp-shell__sidebar ${mobileMenuOpen ? 'cp-shell__sidebar--open' : ''}`}>
        {/* Boton de cerrar visible solo en mobile (display:none desktop). */}
        <button
          type="button"
          className="cp-shell__sidebar-close"
          onClick={() => setMobileMenuOpen(false)}
          aria-label="Cerrar menú"
        >
          <CloseIcon />
        </button>
        <Sidebar />
      </aside>

      <main className="cp-shell__main">
        <Outlet />
      </main>
    </div>
  );
}
