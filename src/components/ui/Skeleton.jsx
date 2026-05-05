// Componentes Skeleton para reservar espacio mientras se cargan datos.
//
// Por que existen:
// Antes de esto, las paginas mostraban un Spinner chiquito de ~60px y
// despues, cuando llegaban los datos de Firestore, se renderizaba el
// contenido completo. Eso provocaba un Cumulative Layout Shift (CLS)
// de ~0.30 en el dashboard porque el contenido empujaba el resto de
// la pagina hacia abajo (Lighthouse mide 'good' < 0.1).
//
// Los skeletons reservan el espacio exacto que va a ocupar el contenido
// real, asi cuando los datos llegan no hay shift visible. Mejora CLS y
// la sensacion percibida de carga.

import './Skeleton.css';

// Bloque rectangular generico. Usalo para textos, cards, lo que sea.
//
// Props:
//   width:  CSS valido (default: 100%)
//   height: CSS valido (default: 16px)
//   radius: CSS border-radius (default: 6px)
//   className: para overrides puntuales
//
// Tip: si ya tenes una altura conocida (ej: una Metric mide 100px),
// usala. Eso es lo que evita el CLS.
export function SkeletonBox({
  width = '100%',
  height = '16px',
  radius = '6px',
  className = '',
  style: extraStyle = {},
}) {
  return (
    <div
      className={`cp-skel ${className}`}
      style={{
        width,
        height,
        borderRadius: radius,
        ...extraStyle,
      }}
      aria-hidden="true"
    />
  );
}

// Linea de texto con un ancho aleatorio dentro de un rango. Util para
// simular parrafos sin que todas las lineas queden del mismo ancho
// (verse mas natural).
export function SkeletonLine({
  height = '14px',
  minWidth = 60,
  maxWidth = 95,
  className = '',
}) {
  // Determinismo por dia: para que el skeleton no parpadee al re-render,
  // usamos un seed estable por componente. Usar Math.random aqui no es
  // optimo porque cada render genera un ancho distinto.
  const widthPercent = minWidth + ((maxWidth - minWidth) / 2);
  return (
    <SkeletonBox
      width={`${widthPercent}%`}
      height={height}
      radius="4px"
      className={className}
    />
  );
}
