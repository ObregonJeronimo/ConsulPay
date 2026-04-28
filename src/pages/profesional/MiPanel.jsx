import { useEffect, useState } from 'react';

import Button from '../../components/ui/Button.jsx';
import Spinner from '../../components/ui/Spinner.jsx';

import { useAuth } from '../../hooks/useAuth.js';
import { useConsultorio } from '../../hooks/useConsultorio.js';
import { calcularDeudaProfesional, retirarProfesional } from '../../lib/profesionales.js';

export default function MiPanel() {
  const { user, signOut } = useAuth();
  const { consultorio } = useConsultorio();

  const [openSalir, setOpenSalir] = useState(false);

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

      {/*
        Boton para salir del consultorio (auto-retiro).
        Lo ponemos en la parte de abajo y discreto (ghost), porque es una
        accion poco frecuente y delicada. El propio modal le va a explicar
        las consecuencias y validar deuda pendiente.
      */}
      <footer style={{
        borderTop: '1px solid var(--cp-border)',
        marginTop: 24,
        paddingTop: 24,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 12,
      }}>
        <p style={{ fontSize: 13, color: 'var(--cp-text-faint)', margin: 0 }}>
          {consultorio?.nombre
            ? `Trabajás en ${consultorio.nombre}.`
            : 'Estás vinculado a un consultorio.'}
        </p>
        <Button
          variant="ghost"
          type="button"
          onClick={() => setOpenSalir(true)}
        >
          Salir del consultorio
        </Button>
      </footer>

      {openSalir && (
        <SalirConsultorioModal
          consultorioId={user.consultorioId}
          consultorioNombre={consultorio?.nombre || 'el consultorio'}
          uid={user.uid}
          onCancelar={() => setOpenSalir(false)}
          onCompletado={async () => {
            // Despues de retirarse, cerramos sesion para que la guardia
            // no muestre el panel "fantasma" mientras el AuthContext
            // detecta el cambio.
            await signOut();
          }}
        />
      )}
    </div>
  );
}

/* ============================================================
   Modal de auto-retiro
   ----------------------------------------------------------------
   1. Al abrir, calcula la deuda del profesional con el consultorio.
   2. Si tiene deuda > 0: muestra aviso bloqueante con cantidad y total
      formateado, y desactiva el boton de salir. El profesional debe
      saldar primero (o pedir al admin que lo retire por su lado).
   3. Si no tiene deuda: muestra mensaje OK y boton 'Salir del consultorio'.
   4. Al confirmar: llama a retirarProfesional con esAutoRetiro=true.
      Si por algun motivo la rule rechaza, mostramos error y permitimos
      reintentar.
   ============================================================ */
function SalirConsultorioModal({ consultorioId, consultorioNombre, uid, onCancelar, onCompletado }) {
  const [deuda, setDeuda] = useState(null);
  const [cargandoDeuda, setCargandoDeuda] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const d = await calcularDeudaProfesional(consultorioId, uid);
        if (!cancelado) {
          setDeuda(d);
          setCargandoDeuda(false);
        }
      } catch (err) {
        if (!cancelado) {
          console.error('Error calculando deuda:', err);
          // Si no podemos leer la deuda, no la usamos como bloqueo —
          // el caller maneja el error. Pero el boton queda habilitado.
          setDeuda({ cantidad: 0, total: 0 });
          setCargandoDeuda(false);
        }
      }
    })();
    return () => { cancelado = true; };
  }, [consultorioId, uid]);

  async function handleSalir() {
    setError('');
    setSubmitting(true);
    try {
      await retirarProfesional({
        uid,
        consultorioId,
        esAutoRetiro: true,
      });
      onCompletado();
    } catch (err) {
      // Si la deuda volvio a aparecer entre el render del modal y el
      // submit (race condition rara), el error trae codigoDeuda.
      setError(err.message || 'No se pudo salir del consultorio.');
      setSubmitting(false);
    }
  }

  const tieneDeuda = deuda && deuda.cantidad > 0;

  return (
    <div className="cp-modal-overlay" onClick={onCancelar}>
      <div className="cp-modal cp-modal--confirm-archive" onClick={(e) => e.stopPropagation()}>
        <button
          className="cp-modal__close"
          onClick={onCancelar}
          aria-label="Cerrar"
          disabled={submitting}
        >
          ×
        </button>

        <h2 className="cp-modal__title">¿Salir de {consultorioNombre}?</h2>
        <div className="cp-modal__sub">
          Vas a perder el acceso al panel del consultorio. Tus sesiones, pacientes
          y registros se mantienen guardados, pero no vas a poder iniciar sesión
          ni crear nuevas sesiones desde acá.
          {' '}Si querés volver más adelante, el administrador del consultorio
          tendrá que invitarte de nuevo.

          {cargandoDeuda ? (
            <div style={{ marginTop: 16, color: 'var(--cp-text-faint)', fontSize: 13 }}>
              Calculando deuda…
            </div>
          ) : tieneDeuda ? (
            <div className="cp-retiro-deuda-aviso">
              <strong>No podés salir mientras tengas deuda pendiente.</strong>
              {' '}Tenés <strong>{deuda.cantidad} sesión{deuda.cantidad === 1 ? '' : 'es'}</strong>{' '}
              sin pagar al consultorio por un total de{' '}
              <strong>${deuda.total.toLocaleString('es-AR')}</strong>.
              {' '}Saldá la deuda con el administrador y volvé a intentar, o
              pedile al admin que te retire desde su lado.
            </div>
          ) : (
            <div className="cp-retiro-deuda-ok">
              ✓ No tenés deuda pendiente con el consultorio. Podés salir tranquilo.
            </div>
          )}
        </div>

        {error && <div className="cp-modal__error">{error}</div>}

        <div className="cp-modal__actions">
          <Button variant="secondary" type="button" onClick={onCancelar} disabled={submitting}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            type="button"
            onClick={handleSalir}
            disabled={submitting || cargandoDeuda || tieneDeuda}
          >
            {submitting ? <><Spinner size={14} /> Saliendo…</> : 'Salir del consultorio'}
          </Button>
        </div>
      </div>
    </div>
  );
}
