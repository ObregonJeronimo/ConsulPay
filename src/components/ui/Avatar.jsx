import './Avatar.css';

/**
 * Avatar con iniciales y variante de color determinística
 */
export default function Avatar({ initials, size = 32, variant }) {
  // Si no se pasa variant, derivamos una de las iniciales para consistencia
  const autoVariant = variant || pickVariant(initials);

  return (
    <div
      className={`cp-avatar cp-avatar--${autoVariant}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
    >
      {initials}
    </div>
  );
}

const VARIANTS = ['sand', 'moss', 'clay', 'dusk', 'sky'];

function pickVariant(initials = '') {
  if (!initials) return VARIANTS[0];
  const code = initials.charCodeAt(0);
  return VARIANTS[code % VARIANTS.length];
}
