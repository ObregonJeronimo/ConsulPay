// ErrorBoundary especializado en errores de carga de chunks lazy.
//
// El flujo normal es:
//   chunk falla -> lazyWithRetry reintenta -> recarga la pagina -> ok.
//
// Pero hay un caso borde donde el segundo intento tambien falla y no
// queremos entrar en loop de recargas (ver lazyWithRetry.js). En ese caso
// dejamos que el error suba hasta aca, y mostramos una pantalla decente
// con un boton de "recargar" en vez de pantalla en blanco.

import { Component } from 'react';

function isChunkLoadError(error) {
  if (!error) return false;
  const message = (error.message || '').toLowerCase();
  return (
    message.includes('failed to fetch dynamically imported module') ||
    message.includes('failed to load module script') ||
    message.includes('importing a module script failed') ||
    message.includes('expected a javascript') ||
    error.name === 'ChunkLoadError'
  );
}

export default class ChunkErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    // Loguea solo si es relevante: errores de logica de la app no nos
    // interesan aca, los maneja el ErrorBoundary general (si lo hay).
    if (isChunkLoadError(error)) {
      console.error('[ChunkErrorBoundary] Chunk no se pudo cargar:', error);
    }
  }

  handleReload = () => {
    // Limpiamos el flag de retry antes de recargar para que si el usuario
    // todavia tiene el problema (ej: ya hubo dos deploys mientras tenia
    // la pestania abierta) tambien intente recuperar.
    try {
      sessionStorage.removeItem('cp:chunk-reload-attempted');
    } catch {
      // ignorar
    }
    window.location.reload();
  };

  render() {
    const { error } = this.state;

    if (!error) {
      return this.props.children;
    }

    // Si no es chunk load error, dejamos que se propague al ErrorBoundary
    // global de la app (si existe) o que React lo muestre.
    if (!isChunkLoadError(error)) {
      throw error;
    }

    return (
      <div
        style={{
          minHeight: '100vh',
          background: 'var(--cp-bg, #F5F4EE)',
          color: 'var(--cp-fg, #1d1d1d)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          fontFamily: "'Inter Tight', system-ui, sans-serif",
        }}
      >
        <div style={{ maxWidth: 420, textAlign: 'center' }}>
          <h1
            style={{
              fontFamily: "'Source Serif 4', Georgia, serif",
              fontSize: 28,
              marginBottom: 12,
              fontWeight: 500,
            }}
          >
            Hay una version nueva de ConsulPay
          </h1>
          <p
            style={{
              fontSize: 15,
              lineHeight: 1.5,
              opacity: 0.75,
              marginBottom: 24,
            }}
          >
            Acabamos de actualizar la app. Actualiza la pagina para
            seguir usandola con la version mas reciente.
          </p>
          <button
            type="button"
            onClick={this.handleReload}
            style={{
              padding: '10px 24px',
              fontSize: 15,
              fontWeight: 500,
              background: 'var(--cp-accent, #C15F3C)',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Recargar pagina
          </button>
        </div>
      </div>
    );
  }
}
