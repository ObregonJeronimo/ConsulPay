/**
 * PlanPill — chip que indica el plan del consultorio.
 *
 * Visualmente:
 *   - Free  -> gris neutro (sutil, default)
 *   - Pro   -> dorado con estrella ★ (distintivo pero sobrio)
 *   - Ultra -> morado degradado con ✦ (premium, llamativo)
 *
 * Uso:
 *   <PlanPill plan={consultorio.plan} />
 *   <PlanPill plan="ultra" size="lg" />
 */
import { PLANES } from '../../lib/constants.js';

export default function PlanPill({ plan, size = 'sm' }) {
  const tipo = plan || PLANES.FREE;

  const label =
    tipo === PLANES.ULTRA ? 'Plan Ultra'
    : tipo === PLANES.PRO ? 'Plan Pro'
    : 'Plan Free';

  const className = [
    'cp-plan-pill',
    tipo === PLANES.ULTRA && 'cp-plan-pill--ultra',
    tipo === PLANES.PRO && 'cp-plan-pill--pro',
    size === 'lg' && 'cp-plan-pill--lg',
  ].filter(Boolean).join(' ');

  return <span className={className}>{label}</span>;
}
