import Spinner from './Spinner.jsx';
import './UnsavedChangesModal.css';

/**
 * UnsavedChangesModal
 *
 * Modal reutilizable que aparece cuando el usuario intenta navegar o
 * cambiar de contexto con cambios sin guardar. Ofrece tres acciones
 * claras en orden descendente de "deseabilidad":
 *
 *   1. Guardar y continuar — primario, coral. Dispara onSaveAndContinue.
 *   2. Cancelar            — secundario. Cierra el modal y se queda.
 *   3. Descartar cambios   — danger ghost. Dispara onDiscard.
 *
 * Props:
 *   open               : boolean                — si se muestra el modal
 *   saving             : boolean                — deshabilita botones y
 *                                                 muestra spinner en el
 *                                                 primario mientras guarda
 *   error              : string | null          — si hay, muestra banner
 *                                                 rojo dentro del modal
 *   title              : string (opcional)      — override del titulo default
 *   description        : string (opcional)      — override del desc default
 *   onSaveAndContinue  : () => void | Promise   — click del primario
 *   onCancel           : () => void             — click del secundario
 *   onDiscard          : () => void             — click del destructivo
 *
 * El modal no se cierra solo: quien lo usa decide cuando ponerlo en false.
 * Esto permite que ante error, el modal siga abierto.
 */
export default function UnsavedChangesModal({
  open,
  saving = false,
  error = null,
  title = 'Tenés cambios sin guardar',
  description = '¿Querés guardarlos antes de continuar o preferís descartarlos?',
  onSaveAndContinue,
  onCancel,
  onDiscard,
}) {
  if (!open) return null;

  // Click en el overlay = cancelar (solo si no estamos guardando,
  // para no interrumpir una operacion en curso).
  function onOverlayClick() {
    if (!saving) onCancel?.();
  }

  return (
    <div
      className="ucm-overlay"
      onClick={onOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="ucm-title"
      aria-describedby="ucm-desc"
    >
      <div className="ucm" onClick={(e) => e.stopPropagation()}>
        <div className="ucm__icon" aria-hidden="true">
          {/* Circle exclamation: signo de atencion sutil */}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>

        <h2 id="ucm-title" className="ucm__title">{title}</h2>
        <p id="ucm-desc" className="ucm__desc">{description}</p>

        {error && (
          <div className="ucm__error" role="alert">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        <div className="ucm__actions">
          <button
            type="button"
            className="ucm__btn ucm__btn--primary"
            onClick={onSaveAndContinue}
            disabled={saving}
            autoFocus
          >
            {saving ? (
              <>
                <Spinner size={14} />
                Guardando…
              </>
            ) : (
              'Guardar y continuar'
            )}
          </button>

          <button
            type="button"
            className="ucm__btn ucm__btn--secondary"
            onClick={onCancel}
            disabled={saving}
          >
            Cancelar
          </button>

          <button
            type="button"
            className="ucm__btn ucm__btn--danger"
            onClick={onDiscard}
            disabled={saving}
          >
            Descartar cambios
          </button>
        </div>
      </div>
    </div>
  );
}
