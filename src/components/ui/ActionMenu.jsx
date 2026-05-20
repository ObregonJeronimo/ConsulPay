/**
 * ActionMenu — menu contextual tipo ⋮ para tablas en mobile.
 *
 * Muestra un boton de tres puntos que al hacer tap abre una lista
 * de acciones flotante. Se cierra al tocar afuera o al elegir
 * una accion. Ideal para tablas en mobile donde los botones de
 * accion no entran en la fila.
 *
 * Props:
 *   items: Array<{ label: string, icon?: ReactNode, onClick: fn,
 *                  danger?: boolean, disabled?: boolean }>
 *   align?: 'left' | 'right'  (posicion del dropdown, default 'right')
 *
 * Uso:
 *   <ActionMenu items={[
 *     { label: 'Editar', icon: <EditIcon />, onClick: () => handleEditar(s) },
 *     { label: 'Eliminar', icon: <TrashIcon />, onClick: () => handleEliminar(s), danger: true },
 *   ]} />
 */
import { useEffect, useRef, useState } from 'react';
import './ActionMenu.css';

export default function ActionMenu({ items = [], align = 'right' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Cerrar al clickear afuera
  useEffect(() => {
    if (!open) return;
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [open]);

  // Cerrar con Escape
  useEffect(() => {
    if (!open) return;
    function handler(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  return (
    <div className="cp-action-menu" ref={ref}>
      <button
        type="button"
        className={`cp-action-menu__trigger ${open ? 'cp-action-menu__trigger--open' : ''}`}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        aria-label="Más acciones"
        aria-expanded={open}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
          <circle cx="8" cy="3" r="1.5" />
          <circle cx="8" cy="8" r="1.5" />
          <circle cx="8" cy="13" r="1.5" />
        </svg>
      </button>

      {open && (
        <ul
          className={`cp-action-menu__dropdown cp-action-menu__dropdown--${align}`}
          role="menu"
        >
          {items.map((item, i) => (
            <li key={i} role="none">
              <button
                type="button"
                role="menuitem"
                className={`cp-action-menu__item ${item.danger ? 'cp-action-menu__item--danger' : ''}`}
                disabled={item.disabled}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  item.onClick();
                }}
              >
                {item.icon && <span className="cp-action-menu__item-icon">{item.icon}</span>}
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
