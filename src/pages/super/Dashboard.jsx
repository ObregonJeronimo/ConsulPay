import { useAuth } from '../../hooks/useAuth.js';

export default function DashboardSuper() {
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
          Panel de plataforma
        </h1>
        <p style={{ color: 'var(--cp-text-muted)', marginTop: 4 }}>
          Hola {user?.displayName || 'superadmin'}. Desde acá gestionás todos los consultorios de ConsulPay.
        </p>
      </header>

      <div style={{
        background: 'var(--cp-surface)',
        border: '1px solid var(--cp-border)',
        borderRadius: 'var(--cp-radius-lg)',
        padding: 32,
        textAlign: 'center',
        color: 'var(--cp-text-muted)',
      }}>
        <div style={{ fontSize: 15, marginBottom: 8, color: 'var(--cp-text)' }}>
          🚧 En construcción
        </div>
        Próximamente: lista de consultorios, configuración de credenciales MP/Ualá,
        pagos de mensualidad recibidos, suspensión manual.
      </div>
    </div>
  );
}
