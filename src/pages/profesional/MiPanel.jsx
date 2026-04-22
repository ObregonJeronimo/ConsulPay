import { useAuth } from '../../hooks/useAuth.js';

export default function MiPanel() {
  const { user } = useAuth();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <header>
        <h1 style={{
          fontFamily: 'var(--cp-font-serif)',
          fontSize: 32,
          fontWeight: 500,
          letterSpacing: '-0.02em',
          lineHeight: 1.1,
        }}>
          Hola, {user?.displayName || 'profesional'}
        </h1>
        <p style={{ color: 'var(--cp-text-muted)', marginTop: 4 }}>
          Tu panel de autogestión — próximamente.
        </p>
      </header>

      <div style={{
        background: 'var(--cp-surface)',
        border: '1px solid var(--cp-border)',
        borderRadius: 'var(--cp-radius-lg)',
        padding: '32px',
        textAlign: 'center',
        color: 'var(--cp-text-muted)',
      }}>
        Aquí vas a ver tus pacientes, sesiones del mes y cuánto le debés al consultorio.
      </div>
    </div>
  );
}
