import { Link } from 'react-router-dom';

/**
 * Landing pública — placeholder.
 * La versión definitiva con hero/features/CTAs se arma en el siguiente paso.
 */
export default function Landing() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      background: 'var(--cp-bg)',
    }}>
      <div style={{
        maxWidth: 560,
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        gap: 24,
      }}>
        <div style={{
          width: 56,
          height: 56,
          borderRadius: 14,
          background: 'var(--cp-accent)',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'var(--cp-font-serif)',
          fontWeight: 600,
          fontSize: 28,
          margin: '0 auto',
        }}>C</div>

        <h1 style={{
          fontFamily: 'var(--cp-font-serif)',
          fontSize: 44,
          fontWeight: 500,
          letterSpacing: '-0.025em',
          lineHeight: 1.1,
        }}>
          ConsulPay
        </h1>

        <p style={{ color: 'var(--cp-text-muted)', fontSize: 17, lineHeight: 1.6 }}>
          Gestión simple para consultorios. Controlá profesionales, sesiones y pagos
          desde un único lugar.
        </p>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 12 }}>
          <Link
            to="/crear-consultorio"
            style={{
              background: 'var(--cp-accent)',
              color: '#fff',
              padding: '12px 24px',
              borderRadius: 'var(--cp-radius-md)',
              fontWeight: 500,
              textDecoration: 'none',
              fontSize: 14.5,
            }}
          >
            Crear consultorio
          </Link>
          <Link
            to="/login"
            style={{
              background: 'var(--cp-surface)',
              color: 'var(--cp-text)',
              padding: '12px 24px',
              borderRadius: 'var(--cp-radius-md)',
              fontWeight: 500,
              textDecoration: 'none',
              fontSize: 14.5,
              border: '1px solid var(--cp-border-strong)',
            }}
          >
            Iniciar sesión
          </Link>
        </div>

        <p style={{
          color: 'var(--cp-text-faint)',
          fontSize: 12.5,
          marginTop: 40,
        }}>
          🚧 Landing definitiva en construcción — próximamente hero editorial con features.
        </p>
      </div>
    </div>
  );
}
