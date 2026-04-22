import './Button.css';

/**
 * Botón genérico
 * @param {'primary' | 'secondary' | 'ghost'} variant
 * @param {'sm' | 'md'} size
 */
export default function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  children,
  className = '',
  ...rest
}) {
  return (
    <button
      className={`cp-btn cp-btn--${variant} cp-btn--${size} ${className}`}
      {...rest}
    >
      {icon && <span className="cp-btn__icon">{icon}</span>}
      {children}
    </button>
  );
}
