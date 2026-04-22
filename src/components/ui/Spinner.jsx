import './Spinner.css';

export default function Spinner({ size = 20, label }) {
  return (
    <span className="cp-spinner-wrap" role="status" aria-label={label || 'Cargando'}>
      <span
        className="cp-spinner"
        style={{ width: size, height: size, borderWidth: Math.max(2, Math.round(size / 12)) }}
      />
      {label && <span className="cp-spinner__label">{label}</span>}
    </span>
  );
}
