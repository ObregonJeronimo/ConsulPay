import './Metric.css';

/**
 * Card de métrica (KPI)
 */
export default function Metric({ label, value, trend, trendDirection, sub }) {
  return (
    <div className="cp-metric">
      <div className="cp-metric__label">{label}</div>
      <div className="cp-metric__value">{value}</div>
      {(trend || sub) && (
        <div className="cp-metric__sub">
          {trend && (
            <span className={`cp-metric__trend cp-metric__trend--${trendDirection || 'neutral'}`}>
              {trendDirection === 'up' ? '↑' : trendDirection === 'down' ? '↓' : '·'} {trend}
            </span>
          )}
          {trend && sub && ' '}
          {sub}
        </div>
      )}
    </div>
  );
}
