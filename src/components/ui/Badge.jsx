import './Badge.css';

/**
 * Badge con punto indicador
 * @param {'success' | 'warning' | 'danger' | 'info' | 'neutral'} tone
 */
export default function Badge({ tone = 'neutral', children, className = '' }) {
  return <span className={`cp-badge cp-badge--${tone} ${className}`}>{children}</span>;
}
