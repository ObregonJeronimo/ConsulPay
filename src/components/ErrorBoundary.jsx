// ErrorBoundary genérico: captura errores de render de sus hijos y
// muestra un mensaje legible (con el detalle del error) en vez de dejar
// la pantalla en blanco. Útil para aislar fallos por datos inesperados.

import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Log para que quede en la consola del navegador
    console.error('ErrorBoundary capturó un error:', error, info);
  }

  handleReset = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      const msg = this.state.error?.message || String(this.state.error);
      return (
        <div style={{
          padding: '40px 24px',
          maxWidth: 560,
          margin: '40px auto',
          textAlign: 'center',
          background: 'var(--cp-surface, #fff)',
          border: '1px solid var(--cp-border, rgba(28,27,23,0.08))',
          borderRadius: 14,
        }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
          <h2 style={{
            fontFamily: 'var(--cp-font-serif, Georgia, serif)',
            fontSize: 20, fontWeight: 600, marginBottom: 8,
            color: 'var(--cp-text, #1C1B17)',
          }}>
            {this.props.title || 'Ocurrió un error al mostrar esta sección'}
          </h2>
          <p style={{
            fontSize: 13.5, color: 'var(--cp-text-muted, #6B6960)',
            marginBottom: 16, lineHeight: 1.5,
          }}>
            Podés reintentar. Si el problema sigue, pasale este detalle al equipo:
          </p>
          <pre style={{
            fontSize: 11.5, textAlign: 'left', background: 'var(--cp-bg, #F5F4EE)',
            padding: '10px 12px', borderRadius: 8, overflow: 'auto',
            color: 'var(--cp-danger, #A04436)', marginBottom: 16,
            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}>
            {msg}
          </pre>
          <button
            onClick={this.handleReset}
            style={{
              padding: '9px 18px', border: 'none', borderRadius: 10,
              background: 'var(--cp-accent, #C15F3C)', color: '#fff',
              fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
            }}
          >
            Reintentar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
