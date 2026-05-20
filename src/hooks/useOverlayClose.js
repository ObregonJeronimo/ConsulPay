import { useRef } from 'react';

/**
 * useOverlayClose — hook para cerrar modales al hacer click en el overlay
 * SIN cerrarse cuando el usuario arrastra desde adentro del modal.
 *
 * Problema que resuelve:
 *   Si el usuario hace mousedown dentro del modal (ej: seleccionando
 *   texto en un input) y suelta el mouse afuera (en el overlay), el
 *   navegador dispara un click en el overlay y el modal se cierra
 *   aunque el usuario no haya querido cerrarlo.
 *
 * Solucion:
 *   Guardamos el target del mousedown. En el click del overlay, solo
 *   cerramos si el mousedown TAMBIEN ocurrio en el overlay (no dentro
 *   del modal).
 *
 * Uso:
 *   const overlayProps = useOverlayClose(onClose);
 *   <div className="cp-modal-overlay" {...overlayProps}>
 *     <div className="cp-modal" onClick={e => e.stopPropagation()}>
 *       ...
 *     </div>
 *   </div>
 */
export function useOverlayClose(onClose) {
  const mouseDownTarget = useRef(null);

  function handleMouseDown(e) {
    mouseDownTarget.current = e.target;
  }

  function handleClick(e) {
    // Solo cerramos si el click empezó Y terminó en el overlay mismo.
    // Si mousedown fue en el modal interno y el usuario arrastró hacia
    // afuera, e.target es el overlay pero mouseDownTarget.current
    // apunta a algo dentro del modal — NO cerramos.
    if (mouseDownTarget.current === e.currentTarget) {
      onClose();
    }
    mouseDownTarget.current = null;
  }

  return {
    onMouseDown: handleMouseDown,
    onClick: handleClick,
  };
}
