import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import Avatar from '../../components/ui/Avatar.jsx';
import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';
import Spinner from '../../components/ui/Spinner.jsx';

import { useAuth } from '../../hooks/useAuth.js';
import { useConsultorio } from '../../hooks/useConsultorio.js';
import { useOverlayClose } from '../../hooks/useOverlayClose.js';
import {
  ESTADOS_USUARIO,
  formatoARS,
  LABELS_TIPO_METODO,
  ROLES,
  TIPOS_METODO_PAGO,
} from '../../lib/constants.js';
import {
  promoverACoadmin,
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
import {
  crearRecordatorio,
  actualizarRecordatorio,
  eliminarRecordatorio,
  labelCiclo,
  suscribirRecordatoriosConsultorio,
  TIPOS_CICLO,
} from '../../lib/recordatorios.js';
import { comisionDeConsultorio } from '../../lib/superadmin.js';
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
  useEffect(() => {
    const mp = searchParams.get('mp');
    if (mp === 'connected' || mp === 'error') {
      setTab('pagos');
    }
  }, [searchParams]);

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
        <button
          className={`cp-tab ${tab === 'recordatorios' ? 'cp-tab--active' : ''}`}
          onClick={() => intentarCambiarTab('recordatorios')}
        >
          Recordatorios
        </button>
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

      {tab === 'recordatorios' && (
        <TabRecordatorios
          consultorioId={user.consultorioId}
          adminUid={user.uid}
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
  // comisionDeConsultorio ya devuelve la etiqueta correcta para el plan
  // activo: 'Ultra' / 'Pro' / 'Free' / 'Legacy'. Usar eso aca evita
  // re-calcular y soporta automaticamente nuevos planes.
  const planLabel = consulpay.etiqueta || 'Free';

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
          tipo="inmediato"
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
          tipo="diferido"
          titulo="Pago diferido (obra social)"
          hint="El dinero llega meses después. La deuda se activa cuando el profesional liquide el monto en cada sesión."
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
   ----------------------------------------------------------------
   Los métodos diferidos (obras sociales) NO tienen "Valor sesión default"
   porque el monto se decide al liquidar cada sesión específica (la obra
   social informa el monto meses después de la sesión). El header y las
   rows se renderizan con menos columnas en ese caso.
   ============================================================ */
function MetodosGrupo({ tipo, titulo, hint, metodos, consulpayPct, planLabel, onUpdate, onDelete }) {
  const esDiferido = tipo === 'diferido';

  return (
    <div className={`cp-metodos-group ${esDiferido ? 'cp-metodos-group--diferido' : ''}`}>
      <div className="cp-metodos-group__head">
        <h3 className="cp-metodos-group__title">{titulo}</h3>
        <p className="cp-metodos-group__hint">{hint}</p>
      </div>

      <div className={`cp-metodos-tabla ${esDiferido ? 'cp-metodos-tabla--diferido' : ''}`}>
        <div className="cp-metodos-tabla__head">
          <div>Nombre</div>
          {!esDiferido && <div>Valor sesión default</div>}
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

            {!esDiferido && (
              <div className="cp-metodo-row__cell">
                <span className="cp-metodo-row__prefix">$</span>
                <input
                  className="cp-metodo-row__input cp-metodo-row__input--num"
                  type="number"
                  value={m.valorSesionDefault ?? ''}
                  min="0"
                  step="any"
                  onChange={(e) => {
                    const v = e.target.value;
                    onUpdate(m.id, 'valorSesionDefault', v === '' ? '' : Number(v));
                  }}
                />
              </div>
            )}

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
          step="any"
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
    const esDiferido = tipo === TIPOS_METODO_PAGO.DIFERIDO;
    onAgregar({
      id: slugFromNombre(nombre),
      nombre: nombre.trim(),
      tipo,
      porcentajeConsultorio: p,
      // Diferido: NO se guarda valorSesionDefault. El valor lo decide
      // el profesional al liquidar cada sesion (boton ✓ con el monto
      // que informa la obra social). Guardamos 0 explicito por compat
      // pero la UI no lo muestra ni lo usa.
      valorSesionDefault: esDiferido ? 0 : (Number(valorSesion) || 0),
    });
  }

  const overlayProps = useOverlayClose(onClose);

  return (
    <div className="cp-modal-overlay" {...overlayProps}>
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
              step="any"
              hint={
                consulpayPct > 0 && totalConConsulpay !== null
                  ? `+ ${consulpayPct}% ConsulPay (plan ${planLabel}) = ${totalConConsulpay}% total sobre el valor de la sesión`
                  : undefined
              }
            />
            {tipo === TIPOS_METODO_PAGO.DIFERIDO ? (
              // Obras sociales no tienen valor default: cada liquidacion
              // de la obra social informa un monto distinto. El profesional
              // carga el monto al liquidar la sesion.
              <div className="cp-aviso-diferido cp-aviso-diferido--compact">
                <div className="cp-aviso-diferido__icon" aria-hidden>ⓘ</div>
                <div className="cp-aviso-diferido__body">
                  <div className="cp-aviso-diferido__title">Sin valor por defecto</div>
                  <div className="cp-aviso-diferido__text">
                    Las obras sociales no tienen un valor fijo. El monto se
                    carga después en cada sesión cuando la obra social
                    informa lo que liquidó.
                  </div>
                </div>
              </div>
            ) : (
              <Input
                name="valorSesion"
                type="number"
                label="Valor por sesión (default)"
                value={valorSesion}
                onChange={(e) => setValorSesion(e.target.value)}
                min="0"
                step="any"
                hint={`Actualmente ${formatoARS.format(Number(valorSesion) || 0)}`}
              />
            )}
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
      await promoverACoadmin({
        consultorioId: consultorio.id,
        callerUid,
        nuevoUid: profesionalAPromover,
      });
      setOkMsg(`${nombre} fue promovido a co-administrador.`);
      setProfesionalAPromover('');
    } catch (err) {
      setError(err.message || 'No se pudo promover.');
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
        <h3 className="cp-admins-promote__title">Promover un profesional a co-administrador</h3>
        <p className="cp-admins-promote__hint">
          El co-admin tiene acceso completo al panel igual que el admin, pero no participa del reparto ni de pagos.
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
              {submitting && accion === null ? 'Promoviendo…' : 'Promover a co-admin'}
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
   Tab Recordatorios y avisos
   ============================================================ */
function TabRecordatorios({ consultorioId, adminUid }) {
  const [recordatorios, setRecordatorios] = useState([]);
  const [miembros, setMiembros] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editando, setEditando] = useState(null); // null | recordatorio

  const profesionalesActivos = useMemo(
    () => miembros.filter((m) => m.rol === 'profesional' && m.estado === 'activo'),
    [miembros],
  );

  useEffect(() => {
    return suscribirRecordatoriosConsultorio(consultorioId, setRecordatorios);
  }, [consultorioId]);

  useEffect(() => {
    return suscribirMiembrosConsultorio(consultorioId, setMiembros);
  }, [consultorioId]);

  async function handleEliminar(r) {
    if (!confirm(`¿Eliminar "${r.titulo}"? Las instancias ya enviadas seguirán visibles hasta que expiren.`)) return;
    await eliminarRecordatorio(r.id);
  }

  return (
    <div className="cp-tab-recordatorios">
      <div className="cp-tab-recordatorios__header">
        <div>
          <h2 className="cp-section-title">Recordatorios y avisos</h2>
          <p className="cp-section-sub">
            Creá recordatorios periódicos para uno o varios profesionales. Se mostrarán en su dashboard.
          </p>
        </div>
        <Button variant="primary" icon={<PlusIcon />} onClick={() => { setEditando(null); setModalOpen(true); }}>
          Nuevo recordatorio
        </Button>
      </div>

      {recordatorios.length === 0 ? (
        <div className="cp-empty-state">
          <p>No hay recordatorios configurados todavía.</p>
        </div>
      ) : (
        <div className="cp-recordatorios-lista">
          {recordatorios.map((r) => {
            const profs = (r.destinatarios || [])
              .map((uid) => miembros.find((m) => m.uid === uid))
              .filter(Boolean);
            return (
              <div key={r.id} className={`cp-recordatorio-card ${!r.activo ? 'cp-recordatorio-card--inactivo' : ''}`}>
                <div className="cp-recordatorio-card__body">
                  <div className="cp-recordatorio-card__titulo">{r.titulo}</div>
                  {r.descripcion && (
                    <div className="cp-recordatorio-card__desc">{r.descripcion}</div>
                  )}
                  <div className="cp-recordatorio-card__meta">
                    <span>🔁 {labelCiclo(r.ciclo)}</span>
                    <span>·</span>
                    <span>
                      {profs.length === 0
                        ? 'Sin destinatarios'
                        : profs.length === 1
                          ? (profs[0].displayName || profs[0].email)
                          : `${profs.length} profesionales`}
                    </span>
                    {!r.activo && <span className="cp-badge cp-badge--obsoleta">Inactivo</span>}
                  </div>
                </div>
                <div className="cp-recordatorio-card__actions">
                  <button
                    className="cp-icon-btn"
                    onClick={() => { setEditando(r); setModalOpen(true); }}
                    title="Editar"
                  >
                    <EditIcon />
                  </button>
                  <button
                    className="cp-icon-btn cp-icon-btn--danger"
                    onClick={() => handleEliminar(r)}
                    title="Eliminar"
                  >
                    <TrashIcon />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modalOpen && (
        <RecordatorioModal
          recordatorio={editando}
          profesionales={profesionalesActivos}
          consultorioId={consultorioId}
          adminUid={adminUid}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  );
}

/* ---- Modal crear/editar recordatorio ---- */
function RecordatorioModal({ recordatorio, profesionales, consultorioId, adminUid, onClose }) {
  const overlayProps = useOverlayClose(onClose);
  const esNuevo = !recordatorio;

  const [titulo, setTitulo] = useState(recordatorio?.titulo ?? '');
  const [descripcion, setDescripcion] = useState(recordatorio?.descripcion ?? '');
  const [tipoCiclo, setTipoCiclo] = useState(recordatorio?.ciclo?.tipo ?? TIPOS_CICLO.SEMANAL);
  const [cadaN, setCadaN] = useState(String(recordatorio?.ciclo?.cada ?? 1));
  const [diaDelMes, setDiaDelMes] = useState(String(recordatorio?.ciclo?.dia ?? 1));
  const [modoDestinatarios, setModoDestinatarios] = useState(
    () => recordatorio ? (recordatorio.destinatarios?.length > 1 ? 'multiple' : 'individual') : 'individual',
  );
  const [destinatariosElegidos, setDestinatariosElegidos] = useState(
    new Set(recordatorio?.destinatarios ?? []),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  function toggleDestinatario(uid) {
    setDestinatariosElegidos((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  }

  function buildCiclo() {
    switch (tipoCiclo) {
      case TIPOS_CICLO.SEMANAL: return { tipo: TIPOS_CICLO.SEMANAL, cada: Math.max(1, Number(cadaN) || 1) };
      case TIPOS_CICLO.QUINCENAL: return { tipo: TIPOS_CICLO.QUINCENAL };
      case TIPOS_CICLO.MENSUAL: return { tipo: TIPOS_CICLO.MENSUAL, cada: Math.max(1, Number(cadaN) || 1) };
      case TIPOS_CICLO.DIA_DEL_MES: return { tipo: TIPOS_CICLO.DIA_DEL_MES, dia: Math.min(28, Math.max(1, Number(diaDelMes) || 1)) };
      default: return { tipo: TIPOS_CICLO.SEMANAL, cada: 1 };
    }
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    if (!titulo.trim()) { setError('El título es obligatorio.'); return; }
    if (destinatariosElegidos.size === 0) { setError('Elegí al menos un profesional.'); return; }

    setSubmitting(true);
    try {
      if (esNuevo) {
        await crearRecordatorio({
          consultorioId,
          titulo,
          descripcion,
          destinatarios: [...destinatariosElegidos],
          ciclo: buildCiclo(),
          creadoPorUid: adminUid,
        });
      } else {
        await actualizarRecordatorio(recordatorio.id, {
          titulo,
          descripcion,
          ciclo: buildCiclo(),
        });
      }
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="cp-modal-overlay" {...overlayProps}>
      <div className="cp-modal cp-modal--wide" onClick={(e) => e.stopPropagation()}>
        <button className="cp-modal__close" onClick={onClose} aria-label="Cerrar">×</button>
        <h2 className="cp-modal__title">{esNuevo ? 'Nuevo recordatorio' : 'Editar recordatorio'}</h2>
        <p className="cp-modal__sub">
          {esNuevo
            ? 'El recordatorio aparecerá en el dashboard del profesional según la frecuencia configurada.'
            : 'Los cambios aplican a las próximas instancias generadas.'}
        </p>

        <form className="cp-modal__form" onSubmit={onSubmit}>
          <Input
            label="Título"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Ej: Cargar sesiones de la semana"
            required
          />

          <div>
            <label className="cp-field__label" style={{ display: 'block', marginBottom: 6 }}>
              Descripción <span style={{ color: 'var(--cp-text-faint)', fontWeight: 400 }}>(opcional)</span>
            </label>
            <textarea
              className="cp-input"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Detalles del recordatorio…"
              rows={3}
              style={{ resize: 'vertical', width: '100%', boxSizing: 'border-box' }}
            />
          </div>

          {/* Frecuencia */}
          <div>
            <label className="cp-field__label" style={{ display: 'block', marginBottom: 6 }}>Frecuencia</label>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
              {[
                { value: TIPOS_CICLO.SEMANAL, label: 'Semanal' },
                { value: TIPOS_CICLO.QUINCENAL, label: 'Quincenal' },
                { value: TIPOS_CICLO.MENSUAL, label: 'Mensual' },
                { value: TIPOS_CICLO.DIA_DEL_MES, label: 'Día del mes' },
              ].map((op) => (
                <label key={op.value} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '7px 14px', border: `1.5px solid ${tipoCiclo === op.value ? 'var(--cp-accent)' : 'var(--cp-border)'}`,
                  borderRadius: 'var(--cp-radius-md)', cursor: 'pointer', fontSize: 13.5,
                  background: tipoCiclo === op.value ? 'var(--cp-accent-bg)' : 'transparent',
                }}>
                  <input type="radio" name="ciclo" value={op.value} checked={tipoCiclo === op.value}
                    onChange={() => setTipoCiclo(op.value)} style={{ display: 'none' }} />
                  {op.label}
                </label>
              ))}
            </div>

            {(tipoCiclo === TIPOS_CICLO.SEMANAL) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 13.5, color: 'var(--cp-text-muted)' }}>Cada</span>
                <input type="number" className="cp-input" value={cadaN}
                  onChange={(e) => setCadaN(e.target.value)} min="1" max="52"
                  style={{ width: 70, textAlign: 'center' }} />
                <span style={{ fontSize: 13.5, color: 'var(--cp-text-muted)' }}>semana{Number(cadaN) === 1 ? '' : 's'}</span>
              </div>
            )}
            {tipoCiclo === TIPOS_CICLO.MENSUAL && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 13.5, color: 'var(--cp-text-muted)' }}>Cada</span>
                <input type="number" className="cp-input" value={cadaN}
                  onChange={(e) => setCadaN(e.target.value)} min="1" max="12"
                  style={{ width: 70, textAlign: 'center' }} />
                <span style={{ fontSize: 13.5, color: 'var(--cp-text-muted)' }}>mes{Number(cadaN) === 1 ? '' : 'es'}</span>
              </div>
            )}
            {tipoCiclo === TIPOS_CICLO.DIA_DEL_MES && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 13.5, color: 'var(--cp-text-muted)' }}>El día</span>
                <input
                  type="number"
                  className="cp-input"
                  value={diaDelMes}
                  onChange={(e) => setDiaDelMes(e.target.value)}
                  onKeyDown={(e) => {
                    // Bloquear punto, coma, e, +, -
                    if (['.', ',', 'e', 'E', '+', '-'].includes(e.key)) e.preventDefault();
                  }}
                  onBlur={(e) => {
                    const v = Math.min(31, Math.max(1, parseInt(e.target.value) || 1));
                    setDiaDelMes(String(v));
                  }}
                  min="1"
                  max="31"
                  step="1"
                  style={{ width: 70, textAlign: 'center' }}
                />
                <span style={{ fontSize: 13.5, color: 'var(--cp-text-muted)' }}>de cada mes (máx. 31)</span>
              </div>
            )}
          </div>

          {/* Destinatarios — solo al crear */}
          {esNuevo && (
            <div>
              <label className="cp-field__label" style={{ display: 'block', marginBottom: 8 }}>Destinatarios</label>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                {[
                  { value: 'individual', label: 'Individual' },
                  { value: 'multiple', label: 'Varios profesionales' },
                ].map((op) => (
                  <label key={op.value} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '7px 14px', border: `1.5px solid ${modoDestinatarios === op.value ? 'var(--cp-accent)' : 'var(--cp-border)'}`,
                    borderRadius: 'var(--cp-radius-md)', cursor: 'pointer', fontSize: 13.5,
                    background: modoDestinatarios === op.value ? 'var(--cp-accent-bg)' : 'transparent',
                  }}>
                    <input type="radio" name="modo" value={op.value} checked={modoDestinatarios === op.value}
                      onChange={() => { setModoDestinatarios(op.value); setDestinatariosElegidos(new Set()); }}
                      style={{ display: 'none' }} />
                    {op.label}
                  </label>
                ))}
              </div>

              {modoDestinatarios === 'individual' ? (
                <div className="cp-rec-prof-lista">
                  {profesionales.map((p) => {
                    const sel = [...destinatariosElegidos][0] === p.uid;
                    return (
                      <label key={p.uid} className={`cp-rec-prof-item ${sel ? 'cp-rec-prof-item--sel' : ''}`}>
                        <input
                          type="radio"
                          name="destinatario-individual"
                          checked={sel}
                          onChange={() => setDestinatariosElegidos(new Set([p.uid]))}
                        />
                        <Avatar initials={(p.displayName || p.email || '?')[0].toUpperCase()} size={32} />
                        <span className="cp-rec-prof-item__nombre">{p.displayName || p.email}</span>
                        <span className="cp-rec-prof-item__check">{sel ? '✓' : ''}</span>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <div className="cp-rec-prof-lista">
                  {profesionales.map((p) => {
                    const sel = destinatariosElegidos.has(p.uid);
                    return (
                      <label key={p.uid} className={`cp-rec-prof-item ${sel ? 'cp-rec-prof-item--sel' : ''}`}>
                        <input type="checkbox" checked={sel} onChange={() => toggleDestinatario(p.uid)} />
                        <Avatar initials={(p.displayName || p.email || '?')[0].toUpperCase()} size={32} />
                        <span className="cp-rec-prof-item__nombre">{p.displayName || p.email}</span>
                        <span className="cp-rec-prof-item__check">{sel ? '✓' : ''}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {error && <p style={{ color: 'var(--cp-danger)', fontSize: 13 }}>{error}</p>}

          <div className="cp-modal__actions">
            <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>Cancelar</Button>
            <Button type="submit" variant="primary" disabled={submitting}>
              {submitting ? <><Spinner size={14} /> Guardando…</> : (esNuevo ? 'Crear recordatorio' : 'Guardar cambios')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}
function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}
function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" />
    </svg>
  );
}
