import { useEffect, useState } from 'react';

import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';
import Spinner from '../../components/ui/Spinner.jsx';

import { useAuth } from '../../hooks/useAuth.js';
import {
  CONFIG_GLOBAL_DEFAULT,
  actualizarConfigGlobal,
  obtenerConfigGlobal,
} from '../../lib/configGlobal.js';

import './ConfiguracionSuper.css';

/**
 * Panel de configuracion global de la plataforma (solo superadmin).
 *
 * Por ahora maneja las comisiones que se queda ConsulPay segun el plan
 * del consultorio. Cuando se cree un consultorio nuevo, esos valores
 * se usan para inicializar su `comisionConsulpay`.
 *
 * IMPORTANTE: cambiar estos valores NO actualiza consultorios existentes.
 * Los valores nuevos se aplican solo a consultorios que se creen DESPUES
 * del cambio. Esto es a proposito: no queremos cambiar silenciosamente
 * la comision de clientes que ya tienen un acuerdo.
 */
export default function ConfiguracionSuper() {
  const { user } = useAuth();

  const [comisionFree, setComisionFree] = useState('');
  const [comisionPro, setComisionPro] = useState('');
  const [valorOriginal, setValorOriginal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const cfg = await obtenerConfigGlobal();
        if (cancelado) return;
        setComisionFree(String(cfg.comisionFree));
        setComisionPro(String(cfg.comisionPro));
        setValorOriginal({
          comisionFree: cfg.comisionFree,
          comisionPro: cfg.comisionPro,
          updatedAt: cfg.updatedAt,
          updatedBy: cfg.updatedBy,
        });
      } catch (err) {
        if (!cancelado) setError('No se pudo cargar la configuración: ' + err.message);
      } finally {
        if (!cancelado) setLoading(false);
      }
    })();
    return () => { cancelado = true; };
  }, []);

  const dirty = valorOriginal !== null && (
    Number(comisionFree) !== valorOriginal.comisionFree
    || Number(comisionPro) !== valorOriginal.comisionPro
  );

  function validar() {
    const f = Number(comisionFree);
    const p = Number(comisionPro);
    if (!Number.isFinite(f) || f < 0 || f > 100) {
      return 'La comisión Free debe ser un número entre 0 y 100.';
    }
    if (!Number.isFinite(p) || p < 0 || p > 100) {
      return 'La comisión Pro debe ser un número entre 0 y 100.';
    }
    return '';
  }

  async function handleGuardar() {
    setError('');
    setSaved(false);

    const errMsg = validar();
    if (errMsg) {
      setError(errMsg);
      return;
    }

    setSaving(true);
    try {
      const f = Number(comisionFree);
      const p = Number(comisionPro);
      await actualizarConfigGlobal({
        comisionFree: f,
        comisionPro: p,
        callerUid: user.uid,
      });
      setValorOriginal({ comisionFree: f, comisionPro: p });
      setSaved(true);
      setTimeout(() => setSaved(false), 3500);
    } catch (err) {
      setError(err.message || 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="cp-super-config">
        <div style={{ padding: 60, display: 'flex', justifyContent: 'center' }}>
          <Spinner size={24} label="Cargando configuración…" />
        </div>
      </div>
    );
  }

  return (
    <div className="cp-super-config">
      <header className="cp-page-header">
        <div>
          <h1 className="cp-page-title">Configuración global</h1>
          <p className="cp-page-sub">
            Parámetros que afectan a toda la plataforma. Cambiarlos no
            modifica consultorios existentes — solo se aplican a los
            consultorios que se creen de ahora en adelante.
          </p>
        </div>
      </header>

      <section className="cp-super-config__section">
        <div className="cp-super-config__section-head">
          <h2 className="cp-super-config__section-title">Comisión de ConsulPay</h2>
          <p className="cp-super-config__section-hint">
            Porcentaje que se queda ConsulPay sobre cada pago de profesional →
            consultorio, según el plan que tenga ese consultorio. El resto va
            al consultorio.
          </p>
        </div>

        <div className="cp-super-config__row">
          <label className="cp-super-config__field">
            <span className="cp-super-config__label">Plan Free</span>
            <div className="cp-super-config__input-with-suffix">
              <Input
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={comisionFree}
                onChange={(e) => { setComisionFree(e.target.value); setSaved(false); }}
                disabled={saving}
              />
              <span className="cp-super-config__suffix">%</span>
            </div>
            <span className="cp-super-config__hint">
              Default de fábrica: {CONFIG_GLOBAL_DEFAULT.comisionFree}%
            </span>
          </label>

          <label className="cp-super-config__field">
            <span className="cp-super-config__label">Plan Pro</span>
            <div className="cp-super-config__input-with-suffix">
              <Input
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={comisionPro}
                onChange={(e) => { setComisionPro(e.target.value); setSaved(false); }}
                disabled={saving}
              />
              <span className="cp-super-config__suffix">%</span>
            </div>
            <span className="cp-super-config__hint">
              Default de fábrica: {CONFIG_GLOBAL_DEFAULT.comisionPro}%
            </span>
          </label>
        </div>

        {error && <div className="cp-config-error">{error}</div>}
        {saved && <div className="cp-config-ok">✓ Configuración guardada.</div>}

        <div className="cp-super-config__actions">
          <Button
            variant="primary"
            onClick={handleGuardar}
            disabled={!dirty || saving}
          >
            {saving ? <><Spinner size={14} /> Guardando…</> : 'Guardar cambios'}
          </Button>
        </div>
      </section>
    </div>
  );
}
