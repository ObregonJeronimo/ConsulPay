import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import Avatar from '../../components/ui/Avatar.jsx';
import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';
import Spinner from '../../components/ui/Spinner.jsx';

import { useAuth } from '../../hooks/useAuth.js';
import { useConsultorio } from '../../hooks/useConsultorio.js';
import {
  ESTADOS_USUARIO,
  formatoARS,
  LABELS_TIPO_METODO,
  ROLES,
  TIPOS_METODO_PAGO,
} from '../../lib/constants.js';
import {
  promoverAAdmin,
  removerAdmin,
  transferirOwnership,
} from '../../lib/admins.js';
import {
  actualizarDatosConsultorio,
  actualizarMetodosPago,
  slugFromNombre,
} from '../../lib/configuracion.js';
import {
  desconectarMP,
  diasHastaVencimiento,
  obtenerUrlConexionMP,
} from '../../lib/mpIntegracion.js';
import { suscribirMiembrosConsultorio } from '../../lib/profesionales.js';
import { comisionDeConsultorio } from '../../lib/superadmin.js';
import {
  cancelarSuscripcionPro,
  iniciarSuscripcionPro,
  labelEstadoSuscripcion,
  puedeCancelarPro,
  puedeContratarPro,
  suscribirPagosMensualidad,
} from '../../lib/suscripciones.js';
import {
  formatearCUIT,
  soloDigitosCBU,
  LARGOS,
} from '../../lib/validaciones.js';

import './Configuracion.css';

/* ============================================================
   Hook: advertencia de cambios sin guardar al cerrar / refrescar
   ============================================================ */
function useUnsavedChangesWarning(dirty) {
  useEffect(() => {
    if (!dirty) return;
    function onBeforeUnload(e) {
      e.preventDefault();
      e.returnValue = '';
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);
}

/* ============================================================
   Página principal
   ============================================================ */
export default function Configuracion() {
  const { user } = useAuth();
  const { consultorio, loading } = useConsultorio();
  const [tab, setTab] = useState('datos');
  const [searchParams, setSearchParams] = useSearchParams();

  const [dirtyDatos, setDirtyDatos] = useState(false);
  const [dirtyMetodos, setDirtyMetodos] = useState(false);

  const anyDirty = dirtyDatos || dirtyMetodos;
  useUnsavedChangesWarning(anyDirty);

  // Si volvemos del callback OAuth de MP, abrimos la pestania Pagos.
  // Si volvemos del flow de suscripcion, abrimos la pestania Plan
  // (siempre que el consultorio aun pueda verla — si el superadmin
  // deshabilito Plan Pro entre que se inicio el flow y volvio, no
  // forzamos la pestania a abrirse).
  useEffect(() => {
    const mp = searchParams.get('mp');
    const sus = searchParams.get('suscripcion');
    if (mp === 'connected' || mp === 'error') {
      setTab('pagos');
    } else if (sus && consultorio?.puedeVerPlanPro !== false) {
      setTab('plan');
    }
  }, [searchParams, consultorio?.puedeVerPlanPro]);

  function intentarCambiarTab(nuevoTab) {
    if (nuevoTab === tab) return;
    const dirtyDelTabActual = tab === 'datos' ? dirtyDatos : (tab === 'metodos' ? dirtyMetodos : false);
    if (dirtyDelTabActual) {
      const ok = confirm(
        'Tenés cambios sin guardar en esta sección. Si cambiás de pestaña, se van a perder.\n\n¿Querés continuar de todas formas?',
      );
      if (!ok) return;
      if (tab === 'datos') setDirtyDatos(false);
      else setDirtyMetodos(false);
    }
    setTab(nuevoTab);
  }

  if (loading) {
    return (
      <div className="cp-config">
        <div style={{ padding: 60, display: 'flex', justifyContent: 'center' }}>
          <Spinner size={24} label="Cargando…" />
        </div>
      </div>
    );
  }

  if (!consultorio) {
    return (
      <div className="cp-config">
        <p style={{ color: 'var(--cp-text-muted)' }}>
          No se pudo cargar la configuración del consultorio.
        </p>
      </div>
    );
  }

  // El owner es el unico que ve la pestania "Plan". Los otros admins
  // ven el plan actual reflejado en la comision de la pestania Pagos
  // pero no pueden contratar/cancelar.
  const esOwner = user.uid === consultorio.ownerUid;

  // Adicional: el superadmin puede deshabilitar el Plan Pro para un
  // consultorio especifico via /super/consultorios. Si esta deshabilitado
  // (puedeVerPlanPro === false), la pestania "Plan" NO se renderiza
  // aunque el caller sea owner. Si el campo no existe (consultorios
  // viejos), permite por backwards compat — solo se bloquea si esta
  // explicitamente en false.
  const puedeVerTabPlan = esOwner && consultorio.puedeVerPlanPro !== false;

  return (
    <div className="cp-config">
      <header className="cp-page-header">
        <div>
          <h1 className="cp-page-title">Configuración</h1>
          <p className="cp-page-sub">
            Datos y métodos de pago de <strong>{consultorio.nombre}</strong>.
          </p>
        </div>
      </header>

      <div className="cp-tabs">
        <button
          className={`cp-tab ${tab === 'datos' ? 'cp-tab--active' : ''}`}
          onClick={() => intentarCambiarTab('datos')}
        >
          Datos del consultorio
          {dirtyDatos && <span className="cp-tab__dot" aria-label="cambios sin guardar" />}
        </button>
        <button
          className={`cp-tab ${tab === 'metodos' ? 'cp-tab--active' : ''}`}
          onClick={() => intentarCambiarTab('metodos')}
        >
          Métodos de pago
          <span className="cp-tab__count">{consultorio.metodosPagoPaciente?.length ?? 0}</span>
          {dirtyMetodos && <span className="cp-tab__dot" aria-label="cambios sin guardar" />}
        </button>
        <button
          className={`cp-tab ${tab === 'admins' ? 'cp-tab--active' : ''}`}
          onClick={() => intentarCambiarTab('admins')}
        >
          Administradores
          <span className="cp-tab__count">{consultorio.adminUids?.length ?? 0}</span>
        </button>
        <button
          className={`cp-tab ${tab === 'pagos' ? 'cp-tab--active' : ''}`}
          onClick={() => intentarCambiarTab('pagos')}
        >
          Pagos
          {consultorio.mpIntegrado && <span className="cp-tab__count cp-tab__count--ok">✓</span>}
        </button>
        {puedeVerTabPlan && (
          <button
            className={`cp-tab ${tab === 'plan' ? 'cp-tab--active' : ''}`}
            onClick={() => intentarCambiarTab('plan')}
          >
            Plan
            {consultorio.plan === 'pro' && (
              <span className="cp-tab__count cp-tab__count--ok">PRO</span>
            )}
          </button>
        )}
      </div>

      {tab === 'datos' && (
        <TabDatos
          consultorio={consultorio}
          consultorioId={user.consultorioId}
          onDirtyChange={setDirtyDatos}
        />
      )}

      {tab === 'metodos' && (
        <TabMetodos
          metodos={consultorio.metodosPagoPaciente ?? []}
          consultorio={consultorio}
          consultorioId={user.consultorioId}
          onDirtyChange={setDirtyMetodos}
        />
      )}

      {tab === 'admins' && (
        <TabAdministradores
          consultorio={consultorio}
          callerUid={user.uid}
        />
      )}

      {tab === 'pagos' && (
        <TabPagos
          consultorio={consultorio}
          searchParams={searchParams}
          onLimpiarParams={() => setSearchParams({})}
        />
      )}

      {tab === 'plan' && puedeVerTabPlan && (
        <TabPlan
          consultorio={consultorio}
          searchParams={searchParams}
          onLimpiarParams={() => setSearchParams({})}
        />
      )}
    </div>
  );
}

/* ============================================================
   Tab: Datos del consultorio
   ============================================================ */
function TabDatos({ consultorio, consultorioId, onDirtyChange }) {
  const valorInicial = useMemo(() => ({
    nombre: consultorio.nombre || '',
    direccion: consultorio.direccion || '',
    telefono: consultorio.telefono || '',
    email: consultorio.email || '',
    cuit: consultorio.cuit || '',
    cbuTransferencia: consultorio.cbuTransferencia || '',
    aliasTransferencia: consultorio.aliasTransferencia || '',
  }), [consultorio]);

  const [form, setForm] = useState(valorInicial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const dirty = useMemo(() => {
    return Object.keys(valorInicial).some((k) => form[k] !== valorInicial[k]);
  }, [form, valorInicial]);

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    setForm(valorInicial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consultorio.id]);

  function onChange(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setSaved(false);
  }

  function onChangeCUIT(e) {
    onChange('cuit', formatearCUIT(e.target.value));
  }

  function onChangeCBU(e) {
    onChange('cbuTransferencia', soloDigitosCBU(e.target.value));
  }

  function onDescartar() {
    setForm(valorInicial);
    setError('');
    setSaved(false);
  }

  async function onGuardar(e) {
    e.preventDefault();
    if (!form.nombre.trim()) {
      setError('El nombre del consultorio es obligatorio.');
      return;
    }
    setError('');
    setSaving(true);
    try {
      await actualizarDatosConsultorio(consultorioId, form);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error(err);
      setError(err.message || 'No se pudieron guardar los cambios.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="cp-config-section" onSubmit={onGuardar}>
      <div className="cp-config-block">
        <h2 className="cp-config-block__title">Información general</h2>
        <Input
          name="nombre"
          label="Nombre del consultorio"
          value={form.nombre}
          onChange={(e) => onChange('nombre', e.target.value)}
          required
        />
        <div className="cp-config-row">
          <Input
            name="direccion"
            label="Dirección"
            value={form.direccion}
            onChange={(e) => onChange('direccion', e.target.value)}
          />
          <Input
            name="telefono"
            label="Teléfono"
            value={form.telefono}
            onChange={(e) => onChange('telefono', e.target.value)}
          />
        </div>
        <div className="cp-config-row">
          <Input
            name="email"
            type="email"
            label="Email de contacto"
            value={form.email}
            onChange={(e) => onChange('email', e.target.value)}
          />
          <Input
            name="cuit"
            label="CUIT"
            placeholder="20-12345678-9"
            value={form.cuit}
            onChange={onChangeCUIT}
            inputMode="numeric"
            maxLength={13}
          />
        </div>
      </div>

      <div className="cp-config-block">
        <h2 className="cp-config-block__title">Datos para transferencia bancaria</h2>
        <p className="cp-config-block__hint">
          Los profesionales van a ver estos datos cuando elijan pagar por transferencia manual.
        </p>
        <div className="cp-config-row">
          <Input
            name="cbu"
            label="CBU / CVU"
            placeholder="22 dígitos"
            value={form.cbuTransferencia}
            onChange={onChangeCBU}
            inputMode="numeric"
            maxLength={LARGOS.CBU}
            hint={
              form.cbuTransferencia && form.cbuTransferencia.length < LARGOS.CBU
                ? `${form.cbuTransferencia.length}/${LARGOS.CBU} dígitos`
                : undefined
            }
          />
          <Input
            name="alias"
            label="Alias"
            value={form.aliasTransferencia}
            onChange={(e) => onChange('aliasTransferencia', e.target.value)}
          />
        </div>
      </div>

      {error && <div className="cp-config-error">{error}</div>}

      {dirty ? (
        <div className="cp-config-footer cp-config-footer--sticky">
          <span className="cp-config-unsaved">Tenés cambios sin guardar.</span>
          <div style={{ display: 'flex', gap: 10, marginLeft: 'auto' }}>
            <Button variant="secondary" type="button" onClick={onDescartar} disabled={saving}>
              Descartar
            </Button>
            <Button variant="primary" type="submit" disabled={saving}>
              {saving ? <><Spinner size={14} /> Guardando…</> : 'Guardar cambios'}
            </Button>
          </div>
        </div>
      ) : (
        saved && (
          <div className="cp-config-footer">
            <span className="cp-config-saved">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Cambios guardados
            </span>
          </div>
        )
      )}
    </form>
  );
}

/* ============================================================
   Tab: Métodos de pago
   ============================================================ */
function TabMetodos({ metodos: metodosOriginales, consultorio, consultorioId, onDirtyChange }) {
  const [metodos, setMetodos] = useState(metodosOriginales);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [openNuevo, setOpenNuevo] = useState(false);

  // Comision Consulpay segun plan actual del consultorio. Se muestra junto
  // al % del metodo para que el admin entienda cuanto se queda Consulpay
  // sobre el valor total de la sesion.
  const consulpay = useMemo(() => comisionDeConsultorio(consultorio), [consultorio]);
  const consulpayPct = Number.isFinite(consulpay.pct) ? consulpay.pct : 0;
  const planLabel = consultorio.plan === 'pro' ? 'Pro' : 'Free';

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    const normalizados = (metodosOriginales ?? []).map((m) => {
      if (m.tipo) return m;
      const idLower = (m.id || '').toLowerCase();
      const pareceDiferido = idLower.startsWith('obra_social')
        || idLower.includes('prepaga')
        || idLower.includes('apross')
        || idLower.includes('ioma')
        || idLower.includes('pami')
        || idLower.includes('osde')
        || idLower.includes('swiss');
      return {
        ...m,
        tipo: pareceDiferido ? 'diferido' : 'inmediato',
      };
    });
    setMetodos(normalizados);

    const cambio = (metodosOriginales ?? []).some((m) => !m.tipo);
    setDirty(cambio);
  }, [metodosOriginales]);

  function updateMetodo(id, field, value) {
    setMetodos((prev) => prev.map((m) => m.id === id ? { ...m, [field]: value } : m));
    setDirty(true);
    setSaved(false);
  }

  function eliminarMetodo(id) {
    if (!confirm('¿Eliminar este método de pago? Si tenés pacientes asignados a este método, se van a quedar sin método válido.')) return;
    setMetodos((prev) => prev.filter((m) => m.id !== id));
    setDirty(true);
    setSaved(false);
  }

  function agregarMetodo(nuevo) {
    let id = nuevo.id;
    let suffix = 2;
    while (metodos.some((m) => m.id === id)) {
      id = `${nuevo.id}_${suffix++}`;
    }
    setMetodos((prev) => [...prev, { ...nuevo, id, activo: true }]);
    setDirty(true);
    setOpenNuevo(false);
    setSaved(false);
  }

  async function onGuardar() {
    setError('');
    setSaving(true);
    try {
      const metodosLimpios = metodos.map((m) => ({
        ...m,
        porcentajeConsultorio: Number(m.porcentajeConsultorio) || 0,
        valorSesionDefault: Number(m.valorSesionDefault) || 0,
      }));
      await actualizarMetodosPago(consultorioId, metodosLimpios);
      setDirty(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error(err);
      setError(err.message || 'No se pudieron guardar los métodos.');
    } finally {
      setSaving(false);
    }
  }

  const inmediatos = metodos.filter((m) => m.tipo === TIPOS_METODO_PAGO.INMEDIATO);
  const diferidos = metodos.filter((m) => m.tipo === TIPOS_METODO_PAGO.DIFERIDO);

  return (
    <div className="cp-config-section">
      <div className="cp-metodos-intro">
        <div>
          <h2 className="cp-config-block__title" style={{ marginBottom: 4 }}>Métodos de pago del paciente</h2>
          <p className="cp-config-block__hint" style={{ marginTop: 0 }}>
            Definí los métodos que aceptan tus pacientes. El <strong>tipo</strong> decide cuándo se
            genera la deuda: los <em>inmediatos</em> (particular, efectivo) cobran en el momento;
            los <em>diferidos</em> (obra social) se cobran cuando la obra social paga el lote.
          </p>
        </div>
        <Button variant="secondary" onClick={() => setOpenNuevo(true)}>
          + Nuevo método
        </Button>
      </div>

      {metodos.length === 0 && (
        <div className="cp-metodos-empty">
          <p>No hay métodos configurados. Agregá al menos uno para poder registrar sesiones.</p>
          <Button variant="primary" onClick={() => setOpenNuevo(true)}>Agregar primer método</Button>
        </div>
      )}

      {metodos.length > 0 && consulpayPct > 0 && (
        <BannerComisionConsulpay
          consulpayPct={consulpayPct}
          planLabel={planLabel}
        />
      )}

      {inmediatos.length > 0 && (
        <MetodosGrupo
          titulo="Pago inmediato"
          hint="El paciente paga al profesional en el momento."
          metodos={inmediatos}
          consulpayPct={consulpayPct}
          planLabel={planLabel}
          onUpdate={updateMetodo}
          onDelete={eliminarMetodo}
        />
      )}

      {diferidos.length > 0 && (
        <MetodosGrupo
          titulo="Pago diferido (obra social)"
          hint="El dinero llega meses después. La deuda se activa al liquidar el lote."
          metodos={diferidos}
          consulpayPct={consulpayPct}
          planLabel={planLabel}
          onUpdate={updateMetodo}
          onDelete={eliminarMetodo}
        />
      )}

      {error && <div className="cp-config-error">{error}</div>}

      {dirty && (
        <div className="cp-config-footer cp-config-footer--sticky">
          <span className="cp-config-unsaved">Tenés cambios sin guardar.</span>
          <div style={{ display: 'flex', gap: 10, marginLeft: 'auto' }}>
            <Button variant="secondary" onClick={() => { setMetodos(metodosOriginales); setDirty(false); }} disabled={saving}>
              Descartar
            </Button>
            <Button variant="primary" onClick={onGuardar} disabled={saving}>
              {saving ? <><Spinner size={14} /> Guardando…</> : 'Guardar cambios'}
            </Button>
          </div>
        </div>
      )}

      {!dirty && saved && (
        <div className="cp-config-footer">
          <span className="cp-config-saved">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Cambios guardados
          </span>
        </div>
      )}

      {openNuevo && (
        <ModalNuevoMetodo
          consulpayPct={consulpayPct}
          planLabel={planLabel}
          onClose={() => setOpenNuevo(false)}
          onAgregar={agregarMetodo}
        />
      )}
    </div>
  );
}

/* ============================================================
   Grupo de métodos (inmediatos o diferidos)
   ============================================================ */
function MetodosGrupo({ titulo, hint, metodos, consulpayPct, planLabel, onUpdate, onDelete }) {
  return (
    <div className="cp-metodos-group">
      <div className="cp-metodos-group__head">
        <h3 className="cp-metodos-group__title">{titulo}</h3>
        <p className="cp-metodos-group__hint">{hint}</p>
      </div>

      <div className="cp-metodos-tabla">
        <div className="cp-metodos-tabla__head">
          <div>Nombre</div>
          <div>Valor sesión default</div>
          <div>% consultorio</div>
          <div>Estado</div>
          <div aria-label="Acciones" />
        </div>

        {metodos.map((m) => (
          <div key={m.id} className={`cp-metodo-row ${m.activo ? '' : 'cp-metodo-row--off'}`}>
            <div className="cp-metodo-row__cell">
              <input
                className="cp-metodo-row__input"
                value={m.nombre}
                onChange={(e) => onUpdate(m.id, 'nombre', e.target.value)}
              />
            </div>

            <div className="cp-metodo-row__cell">
              <span className="cp-metodo-row__prefix">$</span>
              <input
                className="cp-metodo-row__input cp-metodo-row__input--num"
                type="number"
                value={m.valorSesionDefault ?? ''}
                min="0"
                step="500"
                onChange={(e) => {
                  const v = e.target.value;
                  onUpdate(m.id, 'valorSesionDefault', v === '' ? '' : Number(v));
                }}
              />
            </div>

            <div className="cp-metodo-row__cell cp-metodo-row__cell--pct">
              <PorcentajeConConsulpay
                value={m.porcentajeConsultorio}
                consulpayPct={consulpayPct}
                planLabel={planLabel}
                onChange={(v) => onUpdate(m.id, 'porcentajeConsultorio', v)}
              />
            </div>

            <div>
              <button
                type="button"
                className={`cc-toggle ${m.activo ? 'cc-toggle--on' : ''}`}
                onClick={() => onUpdate(m.id, 'activo', !m.activo)}
                aria-pressed={m.activo}
              >
                <span className="cc-toggle__thumb" />
              </button>
            </div>

            <div style={{ textAlign: 'right' }}>
              <button
                type="button"
                className="cp-metodo-row__delete"
                onClick={() => onDelete(m.id)}
                aria-label={`Eliminar ${m.nombre}`}
                title="Eliminar"
              >
                ×
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============================================================
   Componente: input de porcentaje con badge de comision Consulpay
   ----------------------------------------------------------------
   El admin escribe el % que le cobra al profesional (ej: 22). Adentro
   del mismo "textbox visual", al lado del numero, mostramos un badge
   naranja con "+ 0.5%" (o "+ 1%") indicando la comision Consulpay
   segun el plan del consultorio. Esto le permite al admin ver de un
   vistazo cuanto suma realmente entre lo que se queda el y lo que se
   queda Consulpay. La decision de absorber esa comision o trasladarla
   al profesional la toma el dueno del consultorio.
   ============================================================ */
function PorcentajeConConsulpay({ value, consulpayPct, planLabel, onChange }) {
  const num = Number(value);
  const tieneValor = Number.isFinite(num) && num >= 0;
  const total = tieneValor && consulpayPct > 0
    ? Math.round((num + consulpayPct) * 100) / 100
    : null;

  return (
    <div className="cp-pct-wrapper">
      <div className="cp-pct-input-box">
        <input
          className="cp-pct-input"
          type="number"
          value={value ?? ''}
          min="0"
          max="100"
          step="0.5"
          onChange={(e) => {
            const v = e.target.value;
            onChange(v === '' ? '' : Number(v));
          }}
        />
        <span className="cp-pct-input__suffix">%</span>
        {consulpayPct > 0 && (
          <span
            className="cp-pct-input__consulpay"
            title={`Comisión ConsulPay (plan ${planLabel}): ${consulpayPct}% sobre el valor total de la sesión`}
          >
            + {consulpayPct}%
          </span>
        )}
      </div>
      {consulpayPct > 0 && tieneValor && (
        <div className="cp-pct-breakdown">
          {num}% (consultorio) + {consulpayPct}% (ConsulPay) ={' '}
          <strong>{total}% total</strong>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   Banner explicativo arriba de los métodos de pago
   ============================================================ */
function BannerComisionConsulpay({ consulpayPct, planLabel }) {
  return (
    <div className="cp-comision-banner" role="note">
      <div className="cp-comision-banner__icon" aria-hidden>i</div>
      <div className="cp-comision-banner__body">
        <div className="cp-comision-banner__title">
          Sobre la comisión ConsulPay (plan {planLabel}: {consulpayPct}%)
        </div>
        <p className="cp-comision-banner__text">
          Tu plan {planLabel} paga <strong>{consulpayPct}%</strong> sobre el{' '}
          <strong>valor total inicial</strong> de cada sesión (lo que pagó el paciente).
          Esto se suma al porcentaje que cobrás al profesional. Por ejemplo, si en{' '}
          <em>APROSS</em> ponés <strong>22%</strong>, el total que se descuenta del valor
          total es <strong>{(22 + consulpayPct).toFixed(consulpayPct % 1 === 0 ? 0 : 1)}%</strong>:{' '}
          22% queda para el consultorio y {consulpayPct}% para ConsulPay.
        </p>
        <p className="cp-comision-banner__text" style={{ marginTop: 8 }}>
          Vos decidís: dejás el % del método como está y absorbés el {consulpayPct}% del
          valor total, o lo subís {consulpayPct}% para que lo pague el profesional. Eso es
          parte de la negociación con tus profesionales.
        </p>
      </div>
    </div>
  );
}

/* ============================================================
   Modal: Nuevo método
   ============================================================ */
function ModalNuevoMetodo({ onClose, onAgregar, consulpayPct, planLabel }) {
  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState(TIPOS_METODO_PAGO.INMEDIATO);
  const [porcentaje, setPorcentaje] = useState('25');
  const [valorSesion, setValorSesion] = useState('10000');
  const [error, setError] = useState('');

  const porcentajeNum = Number(porcentaje);
  const totalConConsulpay = Number.isFinite(porcentajeNum) && porcentajeNum >= 0 && consulpayPct > 0
    ? Math.round((porcentajeNum + consulpayPct) * 100) / 100
    : null;

  function onSubmit(e) {
    e.preventDefault();
    if (!nombre.trim()) {
      setError('El nombre es obligatorio.');
      return;
    }
    const p = Number(porcentaje);
    if (!Number.isFinite(p) || p < 0 || p > 100) {
      setError('El porcentaje debe estar entre 0 y 100.');
      return;
    }
    onAgregar({
      id: slugFromNombre(nombre),
      nombre: nombre.trim(),
      tipo,
      porcentajeConsultorio: p,
      valorSesionDefault: Number(valorSesion) || 0,
    });
  }

  return (
    <div className="cp-modal-overlay" onClick={onClose}>
      <div className="cp-modal" onClick={(e) => e.stopPropagation()}>
        <button className="cp-modal__close" onClick={onClose} aria-label="Cerrar">×</button>
        <h2 className="cp-modal__title">Nuevo método de pago</h2>
        <p className="cp-modal__sub">
          Agregá un método custom para tu consultorio. Podés editarlo después.
        </p>

        <form className="cp-modal__form" onSubmit={onSubmit}>
          <Input
            name="nombre"
            label="Nombre del método"
            placeholder="Ej: Particular Especial"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            required
            autoFocus
          />

          <div>
            <label className="cp-field__label" style={{ marginBottom: 8, display: 'block' }}>
              Tipo
            </label>
            <div className="cp-tipo-options">
              {Object.values(TIPOS_METODO_PAGO).map((t) => (
                <label key={t} className={`cp-tipo-option ${tipo === t ? 'cp-tipo-option--active' : ''}`}>
                  <input
                    type="radio"
                    name="tipo"
                    value={t}
                    checked={tipo === t}
                    onChange={() => setTipo(t)}
                  />
                  <div>
                    <div className="cp-tipo-option__name">{LABELS_TIPO_METODO[t]}</div>
                    <div className="cp-tipo-option__desc">
                      {t === TIPOS_METODO_PAGO.INMEDIATO
                        ? 'El paciente paga al profesional en el momento.'
                        : 'Se cobra cuando la obra social libera el lote.'}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="cp-config-row">
            <Input
              name="porcentaje"
              type="number"
              label="% que cobra el consultorio"
              value={porcentaje}
              onChange={(e) => setPorcentaje(e.target.value)}
              min="0"
              max="100"
              step="0.5"
              hint={
                consulpayPct > 0 && totalConConsulpay !== null
                  ? `+ ${consulpayPct}% ConsulPay (plan ${planLabel}) = ${totalConConsulpay}% total sobre el valor de la sesión`
                  : undefined
              }
            />
            <Input
              name="valorSesion"
              type="number"
              label="Valor por sesión (default)"
              value={valorSesion}
              onChange={(e) => setValorSesion(e.target.value)}
              min="0"
              step="500"
              hint={`Actualmente ${formatoARS.format(Number(valorSesion) || 0)}`}
            />
          </div>

          {error && <div className="cp-modal__error">{error}</div>}

          <div className="cp-modal__actions">
            <Button variant="secondary" type="button" onClick={onClose}>Cancelar</Button>
            <Button variant="primary" type="submit">Agregar método</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ============================================================
   Tab: Administradores
   ============================================================ */

function inicialesNombre(p) {
  const nombre = p.displayName || p.email || '';
  const partes = nombre.trim().split(/\s+/);
  if (partes.length >= 2) {
    return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
  }
  return (nombre[0] || '·').toUpperCase();
}

function nombreVisible(p) {
  return p.displayName || p.email || `Usuario ${p.uid.slice(0, 6)}`;
}

function TabAdministradores({ consultorio, callerUid }) {
  const [miembros, setMiembros] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [accion, setAccion] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const [profesionalAPromover, setProfesionalAPromover] = useState('');

  useEffect(() => {
    const unsub = suscribirMiembrosConsultorio(consultorio.id, (lista) => {
      setMiembros(lista);
      setCargando(false);
    });
    return unsub;
  }, [consultorio.id]);

  const adminUids = useMemo(() => consultorio.adminUids || [], [consultorio.adminUids]);
  const ownerUid = consultorio.ownerUid;

  const mapMiembros = useMemo(() => {
    const m = {};
    for (const x of miembros) m[x.uid] = x;
    return m;
  }, [miembros]);

  const admins = useMemo(() => {
    const owner = mapMiembros[ownerUid];
    const otros = adminUids
      .filter((uid) => uid !== ownerUid)
      .map((uid) => mapMiembros[uid])
      .filter(Boolean)
      .sort((a, b) => nombreVisible(a).localeCompare(nombreVisible(b), 'es'));
    return owner ? [owner, ...otros] : otros;
  }, [adminUids, ownerUid, mapMiembros]);

  const profesionalesPromocionables = useMemo(() => {
    return miembros.filter((m) =>
      m.rol === ROLES.PROFESIONAL
      && m.estado === ESTADOS_USUARIO.ACTIVO
      && !adminUids.includes(m.uid)
    );
  }, [miembros, adminUids]);

  const callerEsOwner = callerUid === ownerUid;

  function limpiarFeedback() {
    setError('');
    setOkMsg('');
  }

  async function handlePromover() {
    if (!profesionalAPromover) return;
    limpiarFeedback();
    setSubmitting(true);
    try {
      const profesional = mapMiembros[profesionalAPromover];
      const nombre = profesional ? nombreVisible(profesional) : 'el profesional';
      await promoverAAdmin({
        consultorioId: consultorio.id,
        callerUid,
        nuevoUid: profesionalAPromover,
      });
      setOkMsg(`${nombre} fue promovido a administrador.`);
      setProfesionalAPromover('');
    } catch (err) {
      // Caso especial: si ya hay 2 admins, mostramos un mensaje mas
      // suave indicando que es un limite en evolucion, no un error.
      const esLimiteAdmins = err.message?.includes('máximo de 2 administradores')
        || err.message?.includes('máximo de');
      if (esLimiteAdmins) {
        setError('No puede haber más de 2 administradores en un consultorio. Estamos trabajando en ello…');
      } else {
        setError(err.message || 'No se pudo promover.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRemover() {
    if (!accion || accion.tipo !== 'remover') return;
    limpiarFeedback();
    setSubmitting(true);
    try {
      await removerAdmin({
        consultorioId: consultorio.id,
        callerUid,
        uidARemover: accion.uid,
      });
      const removido = mapMiembros[accion.uid];
      const nombre = removido ? nombreVisible(removido) : 'El administrador';
      setOkMsg(`${nombre} ya no es administrador.`);
      setAccion(null);
    } catch (err) {
      setError(err.message || 'No se pudo remover.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleTransferir() {
    if (!accion || accion.tipo !== 'transferir') return;
    limpiarFeedback();
    setSubmitting(true);
    try {
      await transferirOwnership({
        consultorioId: consultorio.id,
        callerUid,
        nuevoOwnerUid: accion.uid,
      });
      const nuevo = mapMiembros[accion.uid];
      const nombre = nuevo ? nombreVisible(nuevo) : 'El nuevo dueño';
      setOkMsg(`Ahora ${nombre} es el dueño del consultorio.`);
      setAccion(null);
    } catch (err) {
      setError(err.message || 'No se pudo transferir.');
    } finally {
      setSubmitting(false);
    }
  }

  if (cargando) {
    return (
      <div style={{ padding: 40, display: 'flex', justifyContent: 'center' }}>
        <Spinner size={20} label="Cargando administradores…" />
      </div>
    );
  }

  return (
    <section className="cp-config-section">
      <header className="cp-config-section__head">
        <h2 className="cp-config-section__title">Administradores del consultorio</h2>
        <p className="cp-config-section__sub">
          Las personas con acceso completo a la gestión del consultorio.
          {callerEsOwner
            ? ' Sos el dueño del consultorio.'
            : ' Sos administrador del consultorio.'}
        </p>
      </header>

      {error && <div className="cp-config-error" role="alert">{error}</div>}
      {okMsg && <div className="cp-config-ok" role="status">{okMsg}</div>}

      <ul className="cp-admins-list">
        {admins.map((admin) => {
          const esOwner = admin.uid === ownerUid;
          const esCaller = admin.uid === callerUid;
          const puedeRemover = !esOwner;
          const puedeTransferirA = callerEsOwner && !esOwner;

          return (
            <li key={admin.uid} className="cp-admin-row">
              <div className="cp-admin-row__main">
                <Avatar initials={inicialesNombre(admin)} size={36} />
                <div className="cp-admin-row__info">
                  <div className="cp-admin-row__name">
                    {nombreVisible(admin)}
                    {esOwner && <span className="cp-admin-badge cp-admin-badge--owner">Dueño</span>}
                    {esCaller && <span className="cp-admin-badge cp-admin-badge--you">Vos</span>}
                  </div>
                  <div className="cp-admin-row__email">{admin.email}</div>
                </div>
              </div>

              <div className="cp-admin-row__actions">
                {puedeTransferirA && (
                  <button
                    type="button"
                    className="cp-admin-action cp-admin-action--neutral"
                    onClick={() => { limpiarFeedback(); setAccion({ tipo: 'transferir', uid: admin.uid }); }}
                  >
                    Transferir ownership
                  </button>
                )}
                {puedeRemover && (
                  <button
                    type="button"
                    className="cp-admin-action cp-admin-action--danger"
                    onClick={() => { limpiarFeedback(); setAccion({ tipo: 'remover', uid: admin.uid }); }}
                  >
                    {esCaller ? 'Salir como admin' : 'Remover admin'}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <hr className="cp-admins-divider" />

      <div className="cp-admins-promote">
        <h3 className="cp-admins-promote__title">Promover a un profesional a administrador</h3>
        <p className="cp-admins-promote__hint">
          Solo aparecen los profesionales activos del consultorio. Si querés invitar a alguien
          de afuera, primero invítalo como profesional desde la sección de Profesionales.
        </p>

        {profesionalesPromocionables.length === 0 ? (
          <div className="cp-admins-promote__empty">
            No hay profesionales activos para promover en este momento.
          </div>
        ) : (
          <div className="cp-admins-promote__row">
            <select
              className="cp-select"
              value={profesionalAPromover}
              onChange={(e) => setProfesionalAPromover(e.target.value)}
              disabled={submitting}
            >
              <option value="">Elegí un profesional…</option>
              {profesionalesPromocionables.map((p) => (
                <option key={p.uid} value={p.uid}>
                  {nombreVisible(p)} {p.email ? `· ${p.email}` : ''}
                </option>
              ))}
            </select>
            <Button
              variant="primary"
              type="button"
              onClick={handlePromover}
              disabled={!profesionalAPromover || submitting}
            >
              {submitting && accion === null ? 'Promoviendo…' : 'Promover a admin'}
            </Button>
          </div>
        )}
      </div>

      {accion?.tipo === 'remover' && (
        <ConfirmarAccionAdminModal
          titulo={
            accion.uid === callerUid
              ? '¿Salir como administrador?'
              : `¿Remover a ${nombreVisible(mapMiembros[accion.uid] || {})} como administrador?`
          }
          descripcion={
            accion.uid === callerUid
              ? 'Vas a perder el acceso al panel de administración del consultorio. Volverás a ser un profesional, pero seguirás trabajando en el consultorio. Otro administrador podrá volver a promoverte si querés.'
              : 'El usuario va a dejar de ser administrador y volverá a ser profesional del consultorio. Sus sesiones, pacientes y registros se mantienen intactos.'
          }
          textoAccion={accion.uid === callerUid ? 'Salir' : 'Remover'}
          onCancelar={() => setAccion(null)}
          onConfirmar={handleRemover}
          submitting={submitting}
          variantePeligrosa
        />
      )}

      {accion?.tipo === 'transferir' && (
        <ConfirmarAccionAdminModal
          titulo={`¿Transferir ownership a ${nombreVisible(mapMiembros[accion.uid] || {})}?`}
          descripcion={
            <>
              Vas a dejar de ser el dueño del consultorio. {nombreVisible(mapMiembros[accion.uid] || {})}{' '}
              pasará a ser el nuevo dueño y va a poder, entre otras cosas, transferir
              el ownership a otra persona o expulsarte del rol de administrador.
              <br /><br />
              <strong>Esta acción no se puede deshacer salvo que el nuevo dueño te transfiera el ownership de vuelta.</strong>
            </>
          }
          textoAccion="Transferir"
          onCancelar={() => setAccion(null)}
          onConfirmar={handleTransferir}
          submitting={submitting}
        />
      )}
    </section>
  );
}

function ConfirmarAccionAdminModal({
  titulo,
  descripcion,
  textoAccion,
  onCancelar,
  onConfirmar,
  submitting,
  variantePeligrosa = false,
}) {
  return (
    <div className="cp-modal-overlay" onClick={onCancelar}>
      <div
        className="cp-modal cp-modal--confirm-admin"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="cp-modal__close"
          onClick={onCancelar}
          aria-label="Cerrar"
          disabled={submitting}
        >×</button>

        <h2 className="cp-modal__title">{titulo}</h2>
        <div className="cp-modal__sub">{descripcion}</div>

        <div className="cp-modal__actions">
          <Button
            variant="secondary"
            type="button"
            onClick={onCancelar}
            disabled={submitting}
          >
            Cancelar
          </Button>
          <Button
            variant={variantePeligrosa ? 'danger' : 'primary'}
            type="button"
            onClick={onConfirmar}
            disabled={submitting}
          >
            {submitting
              ? <><Spinner size={14} /> Procesando…</>
              : textoAccion}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Tab: Pagos (integracion Mercado Pago)
   ============================================================ */

const REASON_LABELS = {
  access_denied: 'Cancelaste la autorización en Mercado Pago.',
  state_invalido: 'El enlace de autorización no es válido o ya fue usado.',
  state_ya_usado: 'El enlace de autorización ya fue usado.',
  state_expirado: 'El enlace de autorización expiró. Volvé a intentarlo.',
  intercambio_fallido: 'Mercado Pago rechazó la autorización. Intentá de nuevo.',
  encriptacion_fallida: 'Error interno guardando las credenciales.',
  guardado_fallido: 'Error guardando la integración. Intentá de nuevo.',
  servidor_no_configurado: 'El servidor no está bien configurado.',
  consultorio_no_existe: 'El consultorio ya no existe.',
  metodo_invalido: 'Método HTTP inválido.',
  faltan_parametros: 'Faltan parámetros en la respuesta de Mercado Pago.',
  state_proveedor_invalido: 'Tipo de proveedor inválido.',
  state_corrupto: 'El estado del flow está corrupto.',
};

function TabPagos({ consultorio, searchParams, onLimpiarParams }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const [desconectarSlot, setDesconectarSlot] = useState(null);  // 'primary' | 'secondary' | null
  const [conectarSlot, setConectarSlot] = useState(null);  // 'primary' | 'secondary' | null

  const { user } = useAuth();
  const callerUid = user?.uid;

  // Cargar miembros del consultorio para resolver nombres de admins
  // (cada slot tiene un ownerAdminUid; queremos mostrar a quien pertenece)
  const [miembros, setMiembros] = useState([]);
  useEffect(() => {
    if (!consultorio?.id) return;
    return suscribirMiembrosConsultorio(consultorio.id, (lista) => {
      setMiembros(lista);
    });
  }, [consultorio?.id]);

  const mapMiembros = useMemo(() => {
    const m = {};
    for (const mb of miembros) m[mb.uid] = mb;
    return m;
  }, [miembros]);

  useEffect(() => {
    const mp = searchParams.get('mp');
    if (mp === 'connected') {
      const slot = searchParams.get('slot');
      const slotLabel = slot === 'secondary' ? 'segunda cuenta' : 'cuenta principal';
      setOkMsg(`Mercado Pago conectado correctamente (${slotLabel}).`);
      onLimpiarParams();
    } else if (mp === 'error') {
      const reason = searchParams.get('reason') || '';
      const msg = REASON_LABELS[reason] || `No se pudo conectar (${reason || 'error desconocido'}).`;
      setError(msg);
      onLimpiarParams();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleDesconectar(slot) {
    setError('');
    setOkMsg('');
    setSubmitting(true);
    try {
      await desconectarMP(consultorio.id, slot);
      const label = slot === 'secondary' ? 'segunda cuenta' : 'cuenta principal';
      setOkMsg(`Se desconectó la ${label} de Mercado Pago.`);
      setDesconectarSlot(null);
    } catch (err) {
      setError(err.message || 'No se pudo desconectar.');
    } finally {
      setSubmitting(false);
    }
  }

  // Lectura de slots (con fallback a legacy mpConfig para primary).
  // Esta logica es la misma que tiene leerMpConfigDelSlot del backend
  // — la replicamos aca porque no podemos importar de api/_lib en el
  // frontend.
  const primaryConfig = consultorio.mpConfigs?.primary
    || (consultorio.mpIntegrado && consultorio.mpConfig
        ? { ...consultorio.mpConfig, ownerAdminUid: consultorio.mpConfig.connectedByUid }
        : null);
  const secondaryConfig = consultorio.mpConfigs?.secondary || null;

  const cantidadAdmins = (consultorio.adminUids || []).length;
  const esMultiAdmin = cantidadAdmins >= 2;

  // Comision Consulpay segun plan actual del consultorio.
  const comisionInfo = comisionDeConsultorio(consultorio);
  const comisionPctTxt = Number.isFinite(comisionInfo.pct)
    ? `${comisionInfo.pct}%`
    : '—';

  // Aviso post-conexion del primer slot cuando hay 2 admins:
  // mostrar mensaje invitando al segundo a conectar
  const necesitaSegundaCuenta = esMultiAdmin && primaryConfig && !secondaryConfig;
  const repartoActivo = !!consultorio.repartoActivado;
  const repartoIniciaEn = consultorio.repartoIniciaEn?.toDate
    ? consultorio.repartoIniciaEn.toDate()
    : null;

  return (
    <section className="cp-config-section">
      <header className="cp-config-section__head">
        <h2 className="cp-config-section__title">Mercado Pago</h2>
        <p className="cp-config-section__sub">
          {esMultiAdmin
            ? <>Cada administrador puede vincular su cuenta de Mercado Pago. Cuando ambos
              tengan su cuenta conectada, ConsulPay alterna los cobros mes a mes (del 15 al 14)
              entre las dos cuentas. Comisión ConsulPay: {comisionPctTxt} sobre el valor total de cada sesión.</>
            : <>Vinculá tu cuenta de Mercado Pago para que los profesionales puedan pagarte
              su parte de las sesiones automáticamente. ConsulPay procesa el pago y se
              queda con su comisión ({comisionPctTxt} sobre el valor total de cada sesión).</>
          }
        </p>
      </header>

      {error && <div className="cp-config-error" role="alert">{error}</div>}
      {okMsg && <div className="cp-config-ok" role="status">{okMsg}</div>}

      {/* Caso 1 admin: una sola card como antes */}
      {!esMultiAdmin ? (
        primaryConfig ? (
          <MPSlotCard
            slot="primary"
            mpConfig={primaryConfig}
            mapMiembros={mapMiembros}
            callerUid={callerUid}
            mostrarOwner={false}
            onDesconectar={() => setDesconectarSlot('primary')}
            submitting={submitting}
          />
        ) : (
          <MPSlotEmptyCard
            slot="primary"
            mostrarOwner={false}
            onConectar={() => { setError(''); setConectarSlot('primary'); }}
          />
        )
      ) : (
        /* Caso 2 admins: dos cards lado a lado */
        <div className="cp-mp-slots">
          {primaryConfig ? (
            <MPSlotCard
              slot="primary"
              mpConfig={primaryConfig}
              mapMiembros={mapMiembros}
              callerUid={callerUid}
              mostrarOwner={true}
              onDesconectar={() => setDesconectarSlot('primary')}
              submitting={submitting}
            />
          ) : (
            <MPSlotEmptyCard
              slot="primary"
              mostrarOwner={true}
              onConectar={() => { setError(''); setConectarSlot('primary'); }}
            />
          )}

          {secondaryConfig ? (
            <MPSlotCard
              slot="secondary"
              mpConfig={secondaryConfig}
              mapMiembros={mapMiembros}
              callerUid={callerUid}
              mostrarOwner={true}
              onDesconectar={() => setDesconectarSlot('secondary')}
              submitting={submitting}
            />
          ) : (
            <MPSlotEmptyCard
              slot="secondary"
              mostrarOwner={true}
              onConectar={() => { setError(''); setConectarSlot('secondary'); }}
            />
          )}
        </div>
      )}

      {/* Aviso cuando hay 2 admins y solo se conecto la primera cuenta */}
      {necesitaSegundaCuenta && (
        <div className="cp-mp-aviso cp-mp-aviso--info">
          <strong>Falta que se conecte la segunda cuenta.</strong>
          <p>
            Cuando el otro administrador vincule su Mercado Pago, vamos a activar
            automáticamente el reparto de cobros entre las dos cuentas.
          </p>
        </div>
      )}

      {/* Aviso cuando ambas estan conectadas pero el reparto todavia no arranca */}
      {esMultiAdmin && primaryConfig && secondaryConfig && repartoActivo && repartoIniciaEn && new Date() < repartoIniciaEn && (
        <div className="cp-mp-aviso cp-mp-aviso--success">
          <strong>Reparto activado.</strong>
          <p>
            La rotación de cobros entre las dos cuentas arranca el{' '}
            {repartoIniciaEn.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })}.
            Hasta esa fecha, los cobros van a la cuenta principal.
          </p>
        </div>
      )}

      {esMultiAdmin && primaryConfig && secondaryConfig && repartoActivo && repartoIniciaEn && new Date() >= repartoIniciaEn && (
        <div className="cp-mp-aviso cp-mp-aviso--success">
          <strong>Reparto activo.</strong>
          <p>
            Los cobros se alternan entre ambas cuentas según el ciclo (del 15 al 14).
            Mirá el detalle del reparto y cómo compensar diferencias en{' '}
            <a href="/admin/reparto" className="cp-mp-aviso__link">Reparto entre administradores</a>.
          </p>
        </div>
      )}

      {/* Panel informativo sobre la comision de Mercado Pago. Aparece
          siempre que haya al menos una cuenta vinculada — antes no tiene
          sentido. Es un <details> para que arranque colapsado: el admin
          que ya sabe esto no se distrae con un bloque grande. */}
      {(primaryConfig || secondaryConfig) && (
        <SobreComisionMP />
      )}

      {desconectarSlot && (
        <DesconectarMPModal
          slot={desconectarSlot}
          tieneSecondary={!!secondaryConfig}
          onCancelar={() => setDesconectarSlot(null)}
          onConfirmar={() => handleDesconectar(desconectarSlot)}
          submitting={submitting}
        />
      )}

      {conectarSlot && (
        <ConectarMPModal
          consultorioId={consultorio.id}
          slot={conectarSlot}
          onCancelar={() => setConectarSlot(null)}
          onError={(msg) => { setError(msg); setConectarSlot(null); }}
        />
      )}
    </section>
  );
}

/**
 * Panel informativo sobre la comisión que cobra Mercado Pago.
 *
 * MP cobra su propia comisión (~6% si es al instante, baja con plazos
 * más largos) que es independiente y se suma a la comisión de
 * ConsulPay. Como esto es una fuente común de confusión ("¿por qué
 * recibí menos plata de la que esperaba?"), explicamos el modelo
 * y cómo el admin puede bajarla configurando un plazo más largo.
 *
 * Es un <details> para arrancar colapsado: el admin que ya sabe
 * esto no se distrae; el que no, lo encuentra cuando pregunta.
 */
function SobreComisionMP() {
  return (
    <details className="cp-mp-info">
      <summary className="cp-mp-info__summary">
        <span className="cp-mp-info__icon" aria-hidden>?</span>
        <span className="cp-mp-info__title">Sobre la comisión de Mercado Pago</span>
        <svg className="cp-mp-info__chevron" viewBox="0 0 24 24" width="16" height="16"
          fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
          strokeLinejoin="round" aria-hidden>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </summary>
      <div className="cp-mp-info__body">
        <p>
          Además de la comisión de ConsulPay, <strong>Mercado Pago cobra su
          propia comisión</strong> por procesar el cobro. Se descuenta
          automáticamente del monto que recibís en tu cuenta MP — es independiente
          de lo que cobra ConsulPay.
        </p>

        <p>
          <strong>El porcentaje depende del plazo de acreditación</strong> que
          tengas configurado en tu cuenta de Mercado Pago:
        </p>

        <ul className="cp-mp-info__list">
          <li>
            <strong>Al instante</strong> · ~6.29% + IVA
            <span className="cp-mp-info__note">la plata cae enseguida pero pagás más</span>
          </li>
          <li>
            <strong>14 días</strong> · ~3.49% + IVA
            <span className="cp-mp-info__note">balance común entre tiempo y costo</span>
          </li>
          <li>
            <strong>30 días</strong> · ~1.99% + IVA
            <span className="cp-mp-info__note">la opción más económica si podés esperar</span>
          </li>
        </ul>

        <p className="cp-mp-info__hint">
          <strong>¿Cómo cambiarlo?</strong> Entrá a tu cuenta de Mercado Pago →{' '}
          <em>Tu negocio → Costos por cobrar</em> y elegí el plazo que prefieras.
          Es un ajuste tuyo, no de ConsulPay. Si tenés flujo de caja para esperar,
          mover de "al instante" a 14 o 30 días te puede ahorrar varios puntos
          porcentuales en cada cobro.
        </p>

        <p className="cp-mp-info__hint cp-mp-info__hint--small">
          Los porcentajes son orientativos y pueden variar según el tipo de
          cuenta, rubro, antigüedad y volumen mensual. Los valores oficiales y
          actualizados están en el{' '}
          <a href="https://www.mercadopago.com.ar/ayuda/tarifas-cobrar-mercado-pago_280"
             target="_blank" rel="noopener noreferrer"
             className="cp-mp-info__link">tarifario de Mercado Pago</a>.
        </p>
      </div>
    </details>
  );
}

/**
 * Card cuando el slot esta vacio (no hay cuenta MP vinculada).
 *
 * Si mostrarOwner=true (caso multi-admin), incluye el label "Cuenta
 * principal" o "Segunda cuenta" para diferenciar visualmente los dos
 * slots. Si mostrarOwner=false (caso 1 admin), se ve igual que la
 * card original — sin label de slot.
 */
function MPSlotEmptyCard({ slot, mostrarOwner, onConectar }) {
  const labelSlot = slot === 'secondary' ? 'Segunda cuenta' : 'Cuenta principal';

  return (
    <div className="cp-mp-card cp-mp-card--off">
      <div className="cp-mp-card__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor"
          strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="6" width="20" height="14" rx="2" />
          <line x1="2" y1="11" x2="22" y2="11" />
          <line x1="6" y1="15" x2="10" y2="15" />
        </svg>
      </div>
      <div className="cp-mp-card__body">
        {mostrarOwner && (
          <div className="cp-mp-card__slot-label">{labelSlot}</div>
        )}
        <h3 className="cp-mp-card__title">Cuenta no vinculada</h3>
        <p className="cp-mp-card__hint">
          {mostrarOwner
            ? 'El administrador que use esta cuenta puede vincularla acá. Una vez conectada, los cobros que le toquen le caen directo a su MP.'
            : 'Al conectar Mercado Pago, los pagos de tus profesionales caen directamente en tu cuenta de MP. ConsulPay solo procesa la transacción y se queda con su comisión.'
          }
        </p>

        <div className="cp-mp-card__actions">
          <Button variant="primary" onClick={onConectar}>
            Conectar Mercado Pago
          </Button>
        </div>
      </div>
    </div>
  );
}

function ConectarMPModal({ consultorioId, slot, onCancelar, onError }) {
  const [authorizeUrl, setAuthorizeUrl] = useState(null);
  const [loadingUrl, setLoadingUrl] = useState(true);

  useEffect(() => {
    let cancelado = false;
    obtenerUrlConexionMP(consultorioId, slot)
      .then(({ authorizeUrl }) => {
        if (cancelado) return;
        setAuthorizeUrl(authorizeUrl);
        setLoadingUrl(false);
      })
      .catch((err) => {
        if (cancelado) return;
        onError(err.message || 'No se pudo iniciar la conexión con Mercado Pago.');
      });
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consultorioId, slot]);

  function handleAbrirMP() {
    window.open('https://www.mercadopago.com.ar/', '_blank', 'noopener,noreferrer');
  }

  function handleContinuar() {
    if (!authorizeUrl) return;
    window.location.assign(authorizeUrl);
  }

  return (
    <div className="cp-modal-overlay" onClick={onCancelar}>
      <div className="cp-modal cp-modal--conectar-mp" onClick={(e) => e.stopPropagation()}>
        <button className="cp-modal__close" onClick={onCancelar} aria-label="Cerrar">×</button>

        <h2 className="cp-modal__title">Antes de continuar a Mercado Pago</h2>

        <div className="cp-modal__sub">
          <p style={{ margin: '0 0 14px' }}>
            Te vamos a llevar a Mercado Pago para autorizar la conexión a tu consultorio.
            <strong> Asegurate de tener sesión activa en Mercado Pago con la cuenta correcta</strong>
            {' '}— la cuenta donde querés recibir los pagos de tus profesionales.
          </p>

          <ol className="cp-modal-conectar__steps">
            <li>
              <strong>Si todavía no estás logueado en Mercado Pago:</strong>
              {' '}clickeá <em>Abrir Mercado Pago</em> abajo. Se abre en una pestaña nueva.
              Iniciá sesión ahí, y después volvé a esta pestaña.
            </li>
            <li>
              <strong>Cuando estés logueado en MP en otra pestaña</strong>{' '}
              (o si ya lo estabas), clickeá <em>Continuar a Mercado Pago</em> y vas a ver la
              pantalla de "Autorizar a consulpay".
            </li>
          </ol>
        </div>

        <div className="cp-modal__actions cp-modal-conectar__actions">
          <Button variant="secondary" type="button" onClick={handleAbrirMP}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6 }}>
              <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
            Abrir Mercado Pago
          </Button>
          <Button
            variant="primary"
            type="button"
            onClick={handleContinuar}
            disabled={loadingUrl}
          >
            {loadingUrl
              ? <><Spinner size={14} /> Preparando…</>
              : 'Continuar a Mercado Pago'}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Card cuando el slot tiene cuenta MP vinculada.
 *
 * Si mostrarOwner=true (caso multi-admin), muestra:
 *   - Label del slot (Cuenta principal / Segunda cuenta)
 *   - A que admin pertenece este slot (con tag "Vos" si es el caller)
 * Si mostrarOwner=false (caso 1 admin), se ve igual que antes.
 *
 * Solo el admin DUEÑO del slot puede desconectar (boton oculto para
 * los otros). Esto evita que un admin desconecte la cuenta del otro.
 */
function MPSlotCard({ slot, mpConfig, mapMiembros, callerUid, mostrarOwner, onDesconectar, submitting }) {
  const venc = diasHastaVencimiento(mpConfig.expiresAt);
  const conectadoAt = mpConfig.connectedAt?.toDate
    ? mpConfig.connectedAt.toDate()
    : (mpConfig.connectedAt instanceof Date ? mpConfig.connectedAt : null);

  const labelSlot = slot === 'secondary' ? 'Segunda cuenta' : 'Cuenta principal';

  // Resolver el admin dueño del slot. ownerAdminUid es el campo nuevo;
  // connectedByUid es el legacy (para mpConfig migrado).
  const ownerUid = mpConfig.ownerAdminUid || mpConfig.connectedByUid;
  const owner = ownerUid ? mapMiembros[ownerUid] : null;
  const ownerLabel = owner
    ? (owner.displayName || owner.email || `Usuario ${ownerUid.slice(0, 6)}`)
    : 'Administradora';
  const callerEsOwner = ownerUid === callerUid;

  return (
    <div className="cp-mp-card cp-mp-card--on">
      <div className="cp-mp-card__icon cp-mp-card__icon--ok" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
      <div className="cp-mp-card__body">
        {mostrarOwner && (
          <div className="cp-mp-card__slot-label">{labelSlot}</div>
        )}

        <h3 className="cp-mp-card__title">
          Cuenta vinculada
          {mpConfig.livemode === false && (
            <span className="cp-admin-badge cp-admin-badge--you">Sandbox</span>
          )}
        </h3>

        {mostrarOwner && (
          <div className="cp-mp-card__owner">
            <span className="cp-mp-card__owner-label">Pertenece a</span>
            <span className="cp-mp-card__owner-name">
              {ownerLabel}
              {callerEsOwner && (
                <span className="cp-admin-badge cp-admin-badge--you" style={{ marginLeft: 8 }}>Vos</span>
              )}
            </span>
          </div>
        )}

        <dl className="cp-mp-card__meta">
          <div>
            <dt>User ID de Mercado Pago</dt>
            <dd>{mpConfig.userIdMP}</dd>
          </div>
          {conectadoAt && (
            <div>
              <dt>Conectada el</dt>
              <dd>{conectadoAt.toLocaleDateString('es-AR', {
                day: 'numeric', month: 'long', year: 'numeric',
              })}</dd>
            </div>
          )}
          {venc && (
            <div>
              <dt>Vencimiento del token</dt>
              <dd>
                {venc.vencido
                  ? <span style={{ color: 'var(--cp-danger)' }}>Vencido — reconectá</span>
                  : `${venc.dias} días`}
                {!venc.vencido && venc.dias < 14 && (
                  <span className="cp-mp-card__warn"> · se renovará automáticamente</span>
                )}
              </dd>
            </div>
          )}
        </dl>

        <div className="cp-mp-card__actions">
          {/* Solo el dueño del slot puede desconectar.
              En caso 1 admin (mostrarOwner=false) siempre se muestra. */}
          {(!mostrarOwner || callerEsOwner) ? (
            <Button
              variant="secondary"
              onClick={onDesconectar}
              disabled={submitting}
            >
              Desconectar
            </Button>
          ) : (
            <span className="cp-mp-card__nota-readonly">
              Solo {ownerLabel.split(' ')[0]} puede desconectar esta cuenta.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function DesconectarMPModal({ slot, tieneSecondary, onCancelar, onConfirmar, submitting }) {
  // Mensajes claros segun el slot que se desconecta y el estado actual:
  // - primary cuando NO hay secondary: vuelve al estado "sin MP" (caso comun)
  // - primary cuando SI hay secondary: secondary se promueve a primary
  //   (esto lo hace buildUpdateParaDesconectarSlot del helper backend)
  // - secondary: el reparto se desactiva, vuelve a flow de 1 cuenta
  const labelSlot = slot === 'secondary' ? 'segunda cuenta' : 'cuenta principal';

  let descripcion;
  if (slot === 'secondary') {
    descripcion = (
      <>
        Vas a desconectar la <strong>segunda cuenta de Mercado Pago</strong>.
        El reparto entre administradores se va a desactivar y todos los cobros nuevos
        van a caer en la cuenta principal.
        <br /><br />
        Las compensaciones de ciclos pasados se preservan en el historial.
        Podés volver a conectar la cuenta cuando quieras.
      </>
    );
  } else if (tieneSecondary) {
    descripcion = (
      <>
        Vas a desconectar la <strong>cuenta principal de Mercado Pago</strong>.
        Como hay una segunda cuenta conectada, va a pasar a ser la principal
        automáticamente.
        <br /><br />
        El reparto entre administradores se va a desactivar hasta que vuelva a haber
        2 cuentas vinculadas.
      </>
    );
  } else {
    descripcion = (
      <>
        Los profesionales van a dejar de poder pagarte por ConsulPay hasta que
        reconectes. Verán un mensaje "El método de pago está deshabilitado,
        contactá al dueño del consultorio".
        <br /><br />
        Tus pagos en curso (si hubiera) se mantienen intactos. Podés reconectar
        cuando quieras.
      </>
    );
  }

  return (
    <div className="cp-modal-overlay" onClick={onCancelar}>
      <div className="cp-modal cp-modal--confirm-admin" onClick={(e) => e.stopPropagation()}>
        <button className="cp-modal__close" onClick={onCancelar} aria-label="Cerrar"
          disabled={submitting}>×</button>

        <h2 className="cp-modal__title">¿Desconectar la {labelSlot}?</h2>
        <div className="cp-modal__sub">
          {descripcion}
        </div>

        <div className="cp-modal__actions">
          <Button variant="secondary" type="button" onClick={onCancelar} disabled={submitting}>
            Cancelar
          </Button>
          <Button variant="danger" type="button" onClick={onConfirmar} disabled={submitting}>
            {submitting ? <><Spinner size={14} /> Desconectando…</> : 'Desconectar'}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Tab: Plan (suscripcion al Plan Pro)
   ----------------------------------------------------------------
   Solo visible para el OWNER del consultorio Y si el superadmin no
   deshabilito explicitamente puedeVerPlanPro.

   Permite:
     - Ver plan actual (Free / Pro) + comision vigente
     - Si Free: contratar Plan Pro (redirige a MP)
     - Si Pro: ver detalles + cancelar (sigue activo hasta fin de periodo)
     - Ver historial de pagos mensualidad

   Maneja query params del retorno de MP:
     ?suscripcion=autorizada  -> Pro fue activado (toast de exito)
     ?suscripcion=pendiente   -> sigue en proceso de autorizacion
     ?suscripcion=cancelada   -> el user cancelo en el flow MP

   IMPORTANTE: el cambio de plan='pro' lo hace el WEBHOOK cuando MP
   confirma la autorizacion. La pestaña suscribe live al consultorio
   (via useConsultorio en el componente padre) asi que apenas el
   webhook actualice Firestore, la UI se actualiza sola.
   ============================================================ */

function TabPlan({ consultorio, searchParams, onLimpiarParams }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const [openCancelar, setOpenCancelar] = useState(false);
  const [openContratar, setOpenContratar] = useState(false);
  const [pagosMensualidad, setPagosMensualidad] = useState([]);

  // Suscripcion live al historial de pagos mensualidad
  useEffect(() => {
    if (!consultorio?.id) return;
    return suscribirPagosMensualidad(consultorio.id, setPagosMensualidad);
  }, [consultorio?.id]);

  // Procesar resultado del callback del flow de suscripcion
  useEffect(() => {
    const sus = searchParams.get('suscripcion');
    if (!sus) return;

    if (sus === 'autorizada') {
      setOkMsg(
        'Suscripción autorizada. Mercado Pago va a confirmar el cobro en unos segundos. '
        + 'La pantalla se actualiza sola cuando el plan esté activo.',
      );
    } else if (sus === 'pendiente') {
      setOkMsg(
        'Tu autorización está siendo procesada por Mercado Pago. '
        + 'Vas a ver el plan activo en unos minutos.',
      );
    } else if (sus === 'cancelada') {
      setError('Cancelaste el flujo de autorización. No se aplicó ningún cargo.');
    }
    onLimpiarParams();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleContratar() {
    setError('');
    setOkMsg('');
    setSubmitting(true);
    try {
      // iniciarSuscripcionPro redirige a MP, no devuelve nada local
      await iniciarSuscripcionPro(consultorio.id);
    } catch (err) {
      setSubmitting(false);
      const detalleMP = err.detalle?.detalleMP;
      let mensaje = err.message || 'No se pudo iniciar la suscripción.';
      if (detalleMP?.message) {
        mensaje += ` (MP: ${detalleMP.message})`;
      }
      setError(mensaje);
      setOpenContratar(false);
    }
  }

  async function handleCancelar() {
    setError('');
    setOkMsg('');
    setSubmitting(true);
    try {
      const res = await cancelarSuscripcionPro(consultorio.id);
      setOkMsg(res?.mensaje || 'Suscripción cancelada.');
      setOpenCancelar(false);
    } catch (err) {
      setError(err.message || 'No se pudo cancelar la suscripción.');
    } finally {
      setSubmitting(false);
    }
  }

  const esPro = consultorio.plan === 'pro';
  const sub = consultorio.subscription;
  const puedeContratar = puedeContratarPro(consultorio);
  const puedeCancelar = puedeCancelarPro(consultorio);

  return (
    <section className="cp-config-section">
      <header className="cp-config-section__head">
        <h2 className="cp-config-section__title">Plan de tu consultorio</h2>
        <p className="cp-config-section__sub">
          Manejá tu suscripción a ConsulPay. Solo el dueño del consultorio puede contratar
          o cancelar. La comisión que cobra ConsulPay sobre los pagos depende del plan activo.
        </p>
      </header>

      {error && <div className="cp-config-error" role="alert">{error}</div>}
      {okMsg && <div className="cp-config-ok" role="status">{okMsg}</div>}

      {/* Card del plan actual */}
      <PlanActualCard
        consultorio={consultorio}
        esPro={esPro}
        sub={sub}
        onContratar={() => { setError(''); setOpenContratar(true); }}
        onCancelar={() => { setError(''); setOpenCancelar(true); }}
        puedeContratar={puedeContratar}
        puedeCancelar={puedeCancelar}
        submitting={submitting}
      />

      {/* Comparativa Free vs Pro */}
      {!esPro && <ComparativaPlanes consultorio={consultorio} />}

      {/* Historial de cobros */}
      {pagosMensualidad.length > 0 && (
        <HistorialMensualidades pagos={pagosMensualidad} />
      )}

      {/* Modales */}
      {openContratar && (
        <ContratarProModal
          precio={sub?.transactionAmount || 50000}
          consultorio={consultorio}
          onCancelar={() => setOpenContratar(false)}
          onConfirmar={handleContratar}
          submitting={submitting}
        />
      )}

      {openCancelar && (
        <CancelarProModal
          consultorio={consultorio}
          currentPeriodEnd={sub?.currentPeriodEnd}
          onCancelar={() => setOpenCancelar(false)}
          onConfirmar={handleCancelar}
          submitting={submitting}
        />
      )}
    </section>
  );
}

function PlanActualCard({
  consultorio,
  esPro,
  sub,
  onContratar,
  onCancelar,
  puedeContratar,
  puedeCancelar,
  submitting,
}) {
  const estadoLabel = labelEstadoSuscripcion(consultorio);
  const fechaRenovacion = sub?.currentPeriodEnd?.toDate
    ? sub.currentPeriodEnd.toDate()
    : (sub?.currentPeriodEnd instanceof Date ? sub.currentPeriodEnd : null);

  // Comision Consulpay segun plan actual del consultorio (modelo nuevo).
  const comisionInfo = comisionDeConsultorio(consultorio);
  const comisionPctTxt = Number.isFinite(comisionInfo.pct)
    ? `${comisionInfo.pct}%`
    : '—';

  return (
    <div className={`cp-plan-card ${esPro ? 'cp-plan-card--pro' : 'cp-plan-card--free'}`}>
      <div className="cp-plan-card__head">
        <div>
          <div className="cp-plan-card__plan-label">Plan actual</div>
          <h3 className="cp-plan-card__plan-name">
            {esPro ? 'Pro' : 'Free'}
            {esPro && <span className="cp-plan-card__badge">PRO</span>}
          </h3>
        </div>
        <div className="cp-plan-card__comision">
          <div className="cp-plan-card__comision-label">Comisión ConsulPay</div>
          <div className="cp-plan-card__comision-value">
            {comisionPctTxt}
          </div>
          <div className="cp-plan-card__comision-hint">
            sobre el valor total de la sesión
          </div>
        </div>
      </div>

      {/* Detalles solo si hay suscripcion activa */}
      {esPro && sub && (
        <dl className="cp-plan-card__meta">
          <div>
            <dt>Estado</dt>
            <dd>{estadoLabel}</dd>
          </div>
          {sub.transactionAmount && (
            <div>
              <dt>Monto mensual</dt>
              <dd>{formatoARS.format(sub.transactionAmount)}</dd>
            </div>
          )}
          {fechaRenovacion && (
            <div>
              <dt>{sub.cancelRequested ? 'Vence el' : 'Próxima renovación'}</dt>
              <dd>
                {fechaRenovacion.toLocaleDateString('es-AR', {
                  day: 'numeric', month: 'long', year: 'numeric',
                })}
              </dd>
            </div>
          )}
          {sub.lastChargedAt && (
            <div>
              <dt>Último cobro</dt>
              <dd>
                {(sub.lastChargedAt.toDate ? sub.lastChargedAt.toDate() : new Date(sub.lastChargedAt))
                  .toLocaleDateString('es-AR', {
                    day: 'numeric', month: 'long', year: 'numeric',
                  })}
              </dd>
            </div>
          )}
        </dl>
      )}

      {/* Estado de pendiente de autorizacion */}
      {!esPro && sub?.status === 'pending_authorization' && (
        <div className="cp-plan-card__pending">
          <Spinner size={14} />
          <span>
            Esperando que confirmes la autorización en Mercado Pago. Si ya lo hiciste,
            puede demorar unos segundos en activarse.
          </span>
        </div>
      )}

      {/* Acciones */}
      <div className="cp-plan-card__actions">
        {puedeContratar && (
          <Button variant="primary" onClick={onContratar} disabled={submitting}>
            {submitting ? <><Spinner size={14} /> Iniciando…</> : 'Contratar Plan Pro'}
          </Button>
        )}
        {puedeCancelar && (
          <Button variant="secondary" onClick={onCancelar} disabled={submitting}>
            Cancelar suscripción
          </Button>
        )}
      </div>

      {/* Aviso de cancelacion vigente */}
      {esPro && sub?.cancelRequested && fechaRenovacion && (
        <div className="cp-plan-card__cancel-notice">
          Cancelaste la suscripción. Mantenés los beneficios del Plan Pro hasta el{' '}
          <strong>
            {fechaRenovacion.toLocaleDateString('es-AR', {
              day: 'numeric', month: 'long', year: 'numeric',
            })}
          </strong>
          . Después, el plan vuelve a Free automáticamente.
        </div>
      )}
    </div>
  );
}

function ComparativaPlanes({ consultorio }) {
  // Modelo nuevo: comision se calcula sobre el VALOR TOTAL de la sesion.
  // Por defecto Free=1%, Pro=0.5% (cada consultorio puede tener su propio
  // valor configurado por el superadmin).
  const comisionFree = Number.isFinite(Number(consultorio.comisionFree))
    ? Number(consultorio.comisionFree)
    : 1;
  const comisionPro = Number.isFinite(Number(consultorio.comisionPro))
    ? Number(consultorio.comisionPro)
    : 0.5;

  // Punto de equilibrio: a partir de qué facturación mensual de pagos
  // ya conviene pasarse a Pro. Resolvemos: 50000 = (free - pro)% * X / 100
  //   => X = 50000 * 100 / (free - pro)
  const diferenciaPct = comisionFree - comisionPro;
  const puntoEquilibrio = diferenciaPct > 0
    ? 50000 * 100 / diferenciaPct
    : null;

  return (
    <div className="cp-plan-compare">
      <h3 className="cp-plan-compare__title">¿Por qué subir a Pro?</h3>
      <div className="cp-plan-compare__grid">
        <div className="cp-plan-compare__card">
          <div className="cp-plan-compare__card-name">Free</div>
          <div className="cp-plan-compare__price">$0/mes</div>
          <ul className="cp-plan-compare__list">
            <li>Comisión {comisionFree}% sobre el valor total de cada sesión</li>
            <li>Acceso completo al consultorio</li>
            <li>Multi-admin y multi-profesional</li>
          </ul>
        </div>
        <div className="cp-plan-compare__card cp-plan-compare__card--pro">
          <div className="cp-plan-compare__card-name">
            Pro <span className="cp-plan-card__badge">RECOMENDADO</span>
          </div>
          <div className="cp-plan-compare__price">{formatoARS.format(50000)}/mes</div>
          <ul className="cp-plan-compare__list">
            <li><strong>Comisión {comisionPro}%</strong> sobre el valor total de cada sesión</li>
            <li>Acceso completo al consultorio</li>
            <li>Multi-admin y multi-profesional</li>
            <li>Prioridad en soporte</li>
          </ul>
        </div>
      </div>
      {puntoEquilibrio !== null && (
        <p className="cp-plan-compare__hint">
          Si tu consultorio factura más de {formatoARS.format(puntoEquilibrio)} por mes
          en pagos por ConsulPay, el Plan Pro ya te conviene.
        </p>
      )}
    </div>
  );
}

function HistorialMensualidades({ pagos }) {
  return (
    <div className="cp-plan-historial">
      <h3 className="cp-plan-historial__title">Historial de cobros</h3>
      <div className="cp-table-wrap">
        <table className="cp-table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th className="cp-num-col">Monto</th>
              <th>Estado</th>
              <th>Detalle</th>
            </tr>
          </thead>
          <tbody>
            {pagos.map((p) => {
              const fecha = p.fechaCobro?.toDate
                ? p.fechaCobro.toDate()
                : (p.fechaCobro instanceof Date ? p.fechaCobro : null);
              return (
                <tr key={p.id}>
                  <td>
                    {fecha
                      ? fecha.toLocaleDateString('es-AR', {
                        day: '2-digit', month: 'short', year: 'numeric',
                      })
                      : '—'}
                  </td>
                  <td className="cp-num">{formatoARS.format(p.monto || 0)}</td>
                  <td>
                    <span className={`cp-plan-historial__status cp-plan-historial__status--${p.status}`}>
                      {p.status === 'approved' ? 'Aprobado'
                        : p.status === 'rejected' ? 'Rechazado'
                          : p.status === 'pending' ? 'Pendiente'
                            : (p.status || '—')}
                    </span>
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--cp-text-muted)' }}>
                    {p.statusDetail || '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ContratarProModal({ precio, consultorio, onCancelar, onConfirmar, submitting }) {
  // Modelo nuevo: leer comisiones del consultorio (con fallbacks).
  const comisionFreeActual = Number.isFinite(Number(consultorio?.comisionFree))
    ? Number(consultorio.comisionFree)
    : 1;
  const comisionProActual = Number.isFinite(Number(consultorio?.comisionPro))
    ? Number(consultorio.comisionPro)
    : 0.5;

  return (
    <div className="cp-modal-overlay" onClick={onCancelar}>
      <div className="cp-modal cp-modal--conectar-mp" onClick={(e) => e.stopPropagation()}>
        <button className="cp-modal__close" onClick={onCancelar} aria-label="Cerrar"
          disabled={submitting}>×</button>

        <h2 className="cp-modal__title">Contratar Plan Pro</h2>

        <div className="cp-modal__sub">
          <p style={{ margin: '0 0 14px' }}>
            Te vamos a llevar a Mercado Pago para que autorices un débito mensual de{' '}
            <strong>{formatoARS.format(precio)}</strong>. Va a debitarse desde tu tarjeta
            de crédito todos los meses, en la fecha en que se efectúe el primer cobro.
          </p>

          <ul className="cp-modal-conectar__steps" style={{ paddingLeft: 20 }}>
            <li>
              <strong>Comisión actual (Free):</strong> {comisionFreeActual}% sobre el valor total de cada sesión.
            </li>
            <li>
              <strong>Comisión nueva (Pro):</strong> {comisionProActual}% sobre el valor total de cada sesión.
            </li>
            <li>
              Podés cancelar cuando quieras. Si cancelás, mantenés los beneficios hasta el
              final del período que ya pagaste.
            </li>
            <li>
              Solo vos (el dueño del consultorio) podés contratar y cancelar el plan.
            </li>
          </ul>
        </div>

        <div className="cp-modal__actions">
          <Button variant="secondary" type="button" onClick={onCancelar} disabled={submitting}>
            Cancelar
          </Button>
          <Button variant="primary" type="button" onClick={onConfirmar} disabled={submitting}>
            {submitting
              ? <><Spinner size={14} /> Redirigiendo…</>
              : 'Continuar a Mercado Pago'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function CancelarProModal({ currentPeriodEnd, onCancelar, onConfirmar, submitting }) {
  const fechaFin = currentPeriodEnd?.toDate
    ? currentPeriodEnd.toDate()
    : (currentPeriodEnd instanceof Date ? currentPeriodEnd : null);

  return (
    <div className="cp-modal-overlay" onClick={onCancelar}>
      <div className="cp-modal cp-modal--confirm-admin" onClick={(e) => e.stopPropagation()}>
        <button className="cp-modal__close" onClick={onCancelar} aria-label="Cerrar"
          disabled={submitting}>×</button>

        <h2 className="cp-modal__title">¿Cancelar Plan Pro?</h2>

        <div className="cp-modal__sub">
          <p style={{ margin: '0 0 12px' }}>
            Si cancelás ahora, <strong>mantenés los beneficios del Plan Pro</strong>{' '}
            (comisión 2%) hasta
            {fechaFin
              ? <> el <strong>{fechaFin.toLocaleDateString('es-AR', {
                day: 'numeric', month: 'long', year: 'numeric',
              })}</strong></>
              : ' el final del período actual'}
            . Después, el plan vuelve automáticamente a Free (comisión 6%).
          </p>
          <p style={{ margin: 0, color: 'var(--cp-text-muted)', fontSize: 13 }}>
            Mercado Pago no te va a cobrar la próxima renovación. Podés volver a contratar Pro
            cuando quieras.
          </p>
        </div>

        <div className="cp-modal__actions">
          <Button variant="secondary" type="button" onClick={onCancelar} disabled={submitting}>
            Mantener suscripción
          </Button>
          <Button variant="danger" type="button" onClick={onConfirmar} disabled={submitting}>
            {submitting
              ? <><Spinner size={14} /> Cancelando…</>
              : 'Sí, cancelar'}
          </Button>
        </div>
      </div>
    </div>
  );
}
