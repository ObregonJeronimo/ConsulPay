import { useEffect, useMemo, useState } from 'react';

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
import { suscribirMiembrosConsultorio } from '../../lib/profesionales.js';
import {
  formatearCUIT,
  soloDigitosCBU,
  LARGOS,
} from '../../lib/validaciones.js';

import './Configuracion.css';

/* ============================================================
   Hook: advertencia de cambios sin guardar al cerrar / refrescar
   la pestaña. No cubre navegación interna por React Router (eso lo
   manejamos con un confirm() manual en los click de tabs/links).
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

  const [dirtyDatos, setDirtyDatos] = useState(false);
  const [dirtyMetodos, setDirtyMetodos] = useState(false);

  const anyDirty = dirtyDatos || dirtyMetodos;
  useUnsavedChangesWarning(anyDirty);

  function intentarCambiarTab(nuevoTab) {
    if (nuevoTab === tab) return;
    const dirtyDelTabActual = tab === 'datos' ? dirtyDatos : dirtyMetodos;
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
function TabMetodos({ metodos: metodosOriginales, consultorioId, onDirtyChange }) {
  const [metodos, setMetodos] = useState(metodosOriginales);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [openNuevo, setOpenNuevo] = useState(false);

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

      {inmediatos.length > 0 && (
        <MetodosGrupo
          titulo="Pago inmediato"
          hint="El paciente paga al profesional en el momento."
          metodos={inmediatos}
          onUpdate={updateMetodo}
          onDelete={eliminarMetodo}
        />
      )}

      {diferidos.length > 0 && (
        <MetodosGrupo
          titulo="Pago diferido (obra social)"
          hint="El dinero llega meses después. La deuda se activa al liquidar el lote."
          metodos={diferidos}
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
function MetodosGrupo({ titulo, hint, metodos, onUpdate, onDelete }) {
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

            <div className="cp-metodo-row__cell">
              <input
                className="cp-metodo-row__input cp-metodo-row__input--num"
                type="number"
                value={m.porcentajeConsultorio ?? ''}
                min="0"
                max="100"
                step="0.5"
                onChange={(e) => {
                  const v = e.target.value;
                  onUpdate(m.id, 'porcentajeConsultorio', v === '' ? '' : Number(v));
                }}
              />
              <span className="cp-metodo-row__suffix">%</span>
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
   Modal: Nuevo método
   ============================================================ */
function ModalNuevoMetodo({ onClose, onAgregar }) {
  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState(TIPOS_METODO_PAGO.INMEDIATO);
  const [porcentaje, setPorcentaje] = useState('25');
  const [valorSesion, setValorSesion] = useState('10000');
  const [error, setError] = useState('');

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
   ----------------------------------------------------------------
   Permite gestionar quienes son admins del consultorio. Tres acciones:
     - Promover a un profesional a admin
     - Remover a un admin (ex-admin baja a profesional)
     - Transferir ownership (solo el owner actual puede)

   Reglas de permisos en la UI:
     - Cualquier admin ve la lista y puede promover/remover
     - Solo el owner ve el boton "Transferir ownership"
     - Nadie puede remover al owner (las rules tambien lo bloquean)
     - Si quedaria un solo admin, no se puede remover (las rules lo bloquean)
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
  const [accion, setAccion] = useState(null); // { tipo: 'remover'|'transferir'|'promover', uid? }
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

  // Mapa uid -> miembro para lookups rapidos
  const mapMiembros = useMemo(() => {
    const m = {};
    for (const x of miembros) m[x.uid] = x;
    return m;
  }, [miembros]);

  // Lista ordenada de admins: owner primero, despues el resto por nombre
  const admins = useMemo(() => {
    const owner = mapMiembros[ownerUid];
    const otros = adminUids
      .filter((uid) => uid !== ownerUid)
      .map((uid) => mapMiembros[uid])
      .filter(Boolean)
      .sort((a, b) => nombreVisible(a).localeCompare(nombreVisible(b), 'es'));
    return owner ? [owner, ...otros] : otros;
  }, [adminUids, ownerUid, mapMiembros]);

  // Profesionales activos del consultorio que NO son admins (candidatos a promover)
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

  /* ---- Handlers ---- */

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
          const puedeRemover = !esOwner; // El owner no se puede remover
          const puedeTransferirA = callerEsOwner && !esOwner; // Solo el owner transfiere, y solo a no-owner

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

      {/* Modal de confirmacion de remover admin */}
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

      {/* Modal de confirmacion de transferencia de ownership */}
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

/**
 * Modal generico de confirmacion para acciones de gestion de admins.
 * Sigue el mismo patron visual que ConfirmarArchivadoModal en Pacientes,
 * pero generalizado para reutilizar entre "remover admin" y "transferir
 * ownership".
 */
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
