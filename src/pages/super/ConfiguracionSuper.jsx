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
import { migrarComisiones2026 } from '../../lib/superadminDelete.js';

import './ConfiguracionSuper.css';

/**
 * Panel de configuracion global de la plataforma (solo superadmin).
 *
 * Maneja las comisiones que se queda ConsulPay segun el plan del
 * consultorio. Cuando se crea un consultorio nuevo, esos valores se
 * usan para inicializar sus campos `comisionFree` y `comisionPro`.
 *
 * Modelo nuevo (2026): comision se calcula sobre el VALOR TOTAL inicial
 * de la sesion (lo que paga el paciente). Defaults: 1% Free / 0.5% Pro.
 *
 * IMPORTANTE: cambiar estos valores NO actualiza consultorios existentes.
 * Los valores nuevos se aplican solo a consultorios que se creen DESPUES
 * del cambio. Esto es a proposito: no queremos cambiar silenciosamente
 * la comision de clientes que ya tienen un acuerdo.
 *
 * Para migrar masivamente consultorios viejos, hay un boton "Ejecutar
 * migracion 2026" que llama al endpoint /api/super con accion
 * `migrar-comisiones-2026`.
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

  // Estado de la migracion 2026 (one-shot)
  const [migrating, setMigrating] = useState(false);
  const [migrateResult, setMigrateResult] = useState(null);
  const [migrateError, setMigrateError] = useState('');

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

  async function handleMigrar(dryRun) {
    setMigrateError('');
    setMigrateResult(null);
    setMigrating(true);
    try {
      const r = await migrarComisiones2026({ dryRun });
      setMigrateResult(r);
    } catch (err) {
      setMigrateError(err.message || 'Error al migrar.');
    } finally {
      setMigrating(false);
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
            Porcentaje que se queda ConsulPay sobre el <strong>valor total inicial</strong>{' '}
            de cada sesión (lo que paga el paciente al profesional), según el plan que
            tenga ese consultorio. Estos valores son <em>defaults de fábrica</em>: solo
            se usan al crear consultorios nuevos. Los consultorios ya existentes
            mantienen sus valores hasta que se editen manualmente.
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

      {/* ============================================================
          Migracion 2026: del modelo viejo (6%/2% sobre montoConsultorio)
          al modelo nuevo (1%/0.5% sobre valorTotal). One-shot.
          ============================================================ */}
      <section className="cp-super-config__section cp-super-config__section--migracion">
        <div className="cp-super-config__section-head">
          <h2 className="cp-super-config__section-title">Migración modelo 2026</h2>
          <p className="cp-super-config__section-hint">
            Migra todos los consultorios al modelo nuevo de comisiones (1% Free /
            0.5% Pro sobre el valor total inicial de cada sesión). <strong>Solo
            ejecutar una vez.</strong> Es idempotente, pero correrla varias veces
            no aporta nada. Recomendado: primero ejecutar como <em>dry-run</em>{' '}
            para previsualizar el impacto.
          </p>
        </div>

        <div className="cp-super-config__actions" style={{ gap: 12 }}>
          <Button
            variant="secondary"
            onClick={() => handleMigrar(true)}
            disabled={migrating}
          >
            {migrating ? <><Spinner size={14} /> Calculando…</> : 'Previsualizar (dry-run)'}
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              if (confirm('¿Ejecutar migración real? Esto va a modificar todos los consultorios.')) {
                handleMigrar(false);
              }
            }}
            disabled={migrating}
          >
            {migrating ? <><Spinner size={14} /> Migrando…</> : 'Ejecutar migración'}
          </Button>
        </div>

        {migrateError && <div className="cp-config-error">{migrateError}</div>}

        {migrateResult && (
          <div className={migrateResult.dryRun ? 'cp-config-ok' : 'cp-config-ok'} style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>
              {migrateResult.dryRun ? '🔍 Dry-run completado' : '✓ Migración aplicada'}
            </div>
            <div style={{ fontSize: 13, marginBottom: 8 }}>
              Consultorios afectados: <strong>{migrateResult.consultoriosActualizados}</strong>{' '}
              de {migrateResult.consultoriosTotal}.{' '}
              config/global: {migrateResult.configGlobalActualizado ? 'actualizado' : 'sin cambios'}.
            </div>
            {migrateResult.log && migrateResult.log.length > 0 && (
              <details style={{ fontSize: 12, fontFamily: 'monospace' }}>
                <summary style={{ cursor: 'pointer' }}>Ver detalle ({migrateResult.log.length} líneas)</summary>
                <ul style={{ marginTop: 8, paddingLeft: 20, lineHeight: 1.5 }}>
                  {migrateResult.log.map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
