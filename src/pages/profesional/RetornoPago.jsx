import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import Button from '../../components/ui/Button.jsx';
import Spinner from '../../components/ui/Spinner.jsx';

import { formatoARS } from '../../lib/constants.js';
import { consultarEstadoPago } from '../../lib/pagos.js';

import './MisPagos.css';

/**
 * Pagina de retorno post-checkout MP.
 *
 * Cuando el profesional termina (o cancela) en el checkout de MP,
 * MP redirige a:
 *   /mi-panel/pagos/retorno?pagoId=xxx&status=success|failure|pending
 *
 * Mostramos un mensaje provisorio segun el query param y hacemos
 * polling al backend (consultarEstadoPago) hasta que el webhook
 * actualice el estado del pago en Firestore.
 *
 * El webhook puede tardar entre 2 segundos y 1 minuto, asi que el
 * polling es una UX mucho mejor que pedirle al user que recargue.
 */

const POLLING_INTERVAL_MS = 2500;
const POLLING_MAX_INTENTOS = 30; // 30 * 2.5s = 75 segundos max

export default function RetornoPago() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const pagoId = searchParams.get('pagoId');
  const statusParam = searchParams.get('status');

  const [estado, setEstado] = useState(null); // pendiente | aprobado | rechazado | cancelado
  const [pagoData, setPagoData] = useState(null);
  const [intentos, setIntentos] = useState(0);
  const [error, setError] = useState('');
  const [polling, setPolling] = useState(true);

  useEffect(() => {
    if (!pagoId) {
      setError('No se recibió el ID del pago.');
      setPolling(false);
      return;
    }

    let cancelado = false;
    let timeoutId = null;

    async function tick(intento) {
      if (cancelado) return;
      try {
        const data = await consultarEstadoPago(pagoId);
        if (cancelado) return;
        setPagoData(data);
        setEstado(data.estado);

        // Si llegamos a un estado final, paramos el polling
        const estadoFinal = ['aprobado', 'rechazado', 'cancelado', 'reembolsado'].includes(data.estado);
        if (estadoFinal) {
          setPolling(false);
          return;
        }

        // Si seguimos pendientes y todavia no llegamos al limite, otro tick
        if (intento < POLLING_MAX_INTENTOS) {
          timeoutId = setTimeout(() => {
            setIntentos(intento + 1);
            tick(intento + 1);
          }, POLLING_INTERVAL_MS);
        } else {
          // Llegamos al limite — dejamos de hacer polling pero
          // mostramos un mensaje claro
          setPolling(false);
        }
      } catch (err) {
        if (cancelado) return;
        setError(err.message || 'No se pudo consultar el estado del pago.');
        setPolling(false);
      }
    }

    tick(0);

    return () => {
      cancelado = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagoId]);

  /* ---- Renders ---- */

  if (!pagoId) {
    return (
      <div className="cp-mis-pagos cp-retorno-pago">
        <div className="cp-retorno-card cp-retorno-card--error">
          <h1>Pago no encontrado</h1>
          <p>No se recibió la información necesaria para identificar el pago.</p>
          <Button variant="primary" onClick={() => navigate('/mi-panel/pagos')}>
            Volver a mis pagos
          </Button>
        </div>
      </div>
    );
  }

  // Estado: aun pendiente y haciendo polling
  if (polling && (estado === null || estado === 'pendiente')) {
    return (
      <div className="cp-mis-pagos cp-retorno-pago">
        <div className="cp-retorno-card cp-retorno-card--pending">
          <Spinner size={36} />
          <h1>Procesando tu pago…</h1>
          <p>
            {statusParam === 'success'
              ? 'Mercado Pago confirmó la operación. Estamos esperando la notificación final para acreditar las sesiones.'
              : 'Estamos consultando el estado del pago. Esto puede tardar hasta un minuto.'}
          </p>
          <p className="cp-retorno-card__hint">
            No cierres esta página. Si tarda mucho, podés volver a Mis pagos y refrescar.
          </p>
        </div>
      </div>
    );
  }

  // Estado: aprobado
  if (estado === 'aprobado') {
    return (
      <div className="cp-mis-pagos cp-retorno-pago">
        <div className="cp-retorno-card cp-retorno-card--ok">
          <div className="cp-retorno-card__icon">
            <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h1>¡Pago aprobado!</h1>
          <p>
            Pagaste <strong>{formatoARS.format(pagoData?.montoTotal || 0)}</strong> al
            consultorio. Las {pagoData?.sesionesIds?.length || 0} sesion
            {pagoData?.sesionesIds?.length === 1 ? '' : 'es'} quedaron marcadas como pagadas.
          </p>
          <div className="cp-retorno-card__detalle">
            <div>
              <span>ID de operación MP</span>
              <strong>{pagoData?.mpPaymentId || '—'}</strong>
            </div>
            <div>
              <span>Comisión ConsulPay</span>
              <strong>{formatoARS.format(pagoData?.marketplaceFee || 0)}</strong>
            </div>
            <div>
              <span>Recibe el consultorio</span>
              <strong>{formatoARS.format(pagoData?.montoConsultorio || 0)}</strong>
            </div>
          </div>
          <div className="cp-retorno-card__actions">
            <Button variant="primary" onClick={() => navigate('/mi-panel/pagos')}>
              Volver a Mis pagos
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Estado: rechazado o cancelado
  if (estado === 'rechazado' || estado === 'cancelado') {
    const titulo = estado === 'rechazado' ? 'Pago rechazado' : 'Pago cancelado';
    const desc = estado === 'rechazado'
      ? 'Mercado Pago rechazó la operación. No se cobró nada y las sesiones siguen pendientes.'
      : 'Cancelaste la operación. No se cobró nada y las sesiones siguen pendientes.';

    return (
      <div className="cp-mis-pagos cp-retorno-pago">
        <div className="cp-retorno-card cp-retorno-card--error">
          <div className="cp-retorno-card__icon cp-retorno-card__icon--error">
            <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </div>
          <h1>{titulo}</h1>
          <p>{desc}</p>
          {pagoData?.mpStatusDetail && (
            <p className="cp-retorno-card__hint">
              Detalle: {pagoData.mpStatusDetail}
            </p>
          )}
          <div className="cp-retorno-card__actions">
            <Button variant="primary" onClick={() => navigate('/mi-panel/pagos')}>
              Volver y reintentar
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Estado: error de polling o agotamos intentos
  if (error || (!polling && estado === 'pendiente')) {
    return (
      <div className="cp-mis-pagos cp-retorno-pago">
        <div className="cp-retorno-card">
          <h1>Tu pago está en proceso</h1>
          <p>
            Mercado Pago todavía no confirmó la operación. Esto suele resolverse en
            pocos minutos. Volvé en un rato a Mis pagos para ver el estado actualizado.
          </p>
          {error && (
            <p className="cp-retorno-card__hint" style={{ color: 'var(--cp-danger)' }}>
              {error}
            </p>
          )}
          <div className="cp-retorno-card__actions">
            <Button variant="primary" onClick={() => navigate('/mi-panel/pagos')}>
              Volver a Mis pagos
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Reembolsado o estado raro
  return (
    <div className="cp-mis-pagos cp-retorno-pago">
      <div className="cp-retorno-card">
        <h1>Estado del pago: {estado}</h1>
        <Button variant="primary" onClick={() => navigate('/mi-panel/pagos')}>
          Volver a Mis pagos
        </Button>
      </div>
    </div>
  );
}
