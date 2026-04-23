import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import UnsavedChangesModal from '../../components/ui/UnsavedChangesModal.jsx';

import { useAuth } from '../../hooks/useAuth.js';
import { useConsultorio } from '../../hooks/useConsultorio.js';
import { useUnsavedNavigationGuard } from '../../hooks/useUnsavedNavigationGuard.js';
import {
  formatoARS,
  LABELS_TIPO_METODO,
  TIPOS_METODO_PAGO,
} from '../../lib/constants.js';
import {
  actualizarDatosConsultorio,
  actualizarMetodosPago,
  slugFromNombre,
} from '../../lib/configuracion.js';
import {
  formatearCUIT,
  soloDigitosCBU,
  LARGOS,
} from '../../lib/validaciones.js';

import './Configuracion.css';

/* ============================================================
   Página principal
   ----------------------------------------------------------------
   Esta página tiene dos tabs (Datos del consultorio / Métodos de pago),
   cada uno con su propio formulario editable. La protección contra
   perdida de cambios se centraliza acá via useUnsavedNavigationGuard,
   que cubre:

     1. Navegacion interna (click en sidebar, boton atras) → useBlocker
     2. Cerrar/refrescar la pestaña                        → beforeunload
     3. Cambio de tab dentro de Configuracion              → requestNavigation

   Los tabs hijos exponen sus funciones de guardado via ref; el guard
   invoca el guardado del tab que tiene el dirty activo cuando el
   usuario elige "Guardar y continuar" en el modal.
   ============================================================ */
export default function Configuracion() {
  const { user } = useAuth();
  const { consultorio, loading } = useConsultorio();
  const [tab, setTab] = useState('datos');

  // Dirty de cada tab, reportado hacia arriba por onDirtyChange.
  const [dirtyDatos, setDirtyDatos] = useState(false);
  const [dirtyMetodos, setDirtyMetodos] = useState(false);
  const anyDirty = dirtyDatos || dirtyMetodos;

  // Refs a los "save handlers" expuestos por cada tab. Cada tab, al
  // montarse, registra su funcion de guardado aca. El guard las usa
  // para ejecutar "Guardar y continuar" sin conocer los detalles del
  // formulario interno.
  const saveDatosRef = useRef(null);
  const saveMetodosRef = useRef(null);

  // Refs a los "discard handlers" de cada tab. Si el usuario elige
  // "Descartar cambios", reseteamos el tab correspondiente para que
  // dirty vuelva a false y no quede un estado zombie.
  const discardDatosRef = useRef(null);
  const discardMetodosRef = useRef(null);

  // El onSave del guard: guarda el tab que esta sucio. Si ambos
  // estan sucios (caso raro), guarda primero el activo; el otro
  // queda dirty para la proxima vez.
  const onSaveDesdeGuard = useCallback(async () => {
    // Prioridad: guardar el tab activo primero si esta dirty.
    if (tab === 'datos' && dirtyDatos && saveDatosRef.current) {
      await saveDatosRef.current();
    } else if (tab === 'metodos' && dirtyMetodos && saveMetodosRef.current) {
      await saveMetodosRef.current();
    } else if (dirtyDatos && saveDatosRef.current) {
      await saveDatosRef.current();
    } else if (dirtyMetodos && saveMetodosRef.current) {
      await saveMetodosRef.current();
    }
  }, [tab, dirtyDatos, dirtyMetodos]);

  const guard = useUnsavedNavigationGuard({
    dirty: anyDirty,
    onSave: onSaveDesdeGuard,
  });

  // Cambio de tab: si el tab actual esta sucio, pasamos por el modal.
  // El guard decide si ejecuta el cambio (post-guardar o descartar) o
  // lo cancela (el usuario elige quedarse).
  function intentarCambiarTab(nuevoTab) {
    if (nuevoTab === tab) return;
    const dirtyDelTabActual = tab === 'datos' ? dirtyDatos : dirtyMetodos;

    guard.requestNavigation(() => {
      // Si el modal nos trajo aca via "Descartar", reseteamos el form
      // del tab que dejamos para que no quede dirty zombie.
      if (dirtyDelTabActual) {
        if (tab === 'datos' && discardDatosRef.current) discardDatosRef.current();
        else if (tab === 'metodos' && discardMetodosRef.current) discardMetodosRef.current();
      }
      setTab(nuevoTab);
    });
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
      </div>

      {tab === 'datos' && (
        <TabDatos
          consultorio={consultorio}
          consultorioId={user.consultorioId}
          onDirtyChange={setDirtyDatos}
          saveRef={saveDatosRef}
          discardRef={discardDatosRef}
        />
      )}

      {tab === 'metodos' && (
        <TabMetodos
          metodos={consultorio.metodosPagoPaciente ?? []}
          consultorioId={user.consultorioId}
          onDirtyChange={setDirtyMetodos}
          saveRef={saveMetodosRef}
          discardRef={discardMetodosRef}
        />
      )}

      {/* Modal centralizado: cubre navegacion de sidebar, cambio de tab
          interno y cualquier otra accion que pase por requestNavigation. */}
      <UnsavedChangesModal
        open={guard.modalOpen}
        saving={guard.saving}
        error={guard.error}
        onSaveAndContinue={guard.onSaveAndContinue}
        onCancel={guard.onCancel}
        onDiscard={guard.onDiscard}
      />
    </div>
  );
}

/* ============================================================
   Tab: Datos del consultorio
   ============================================================ */
function TabDatos({ consultorio, consultorioId, onDirtyChange, saveRef, discardRef }) {
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

  // Dirty = algún campo cambió respecto al valor inicial
  const dirty = useMemo(() => {
    return Object.keys(valorInicial).some((k) => form[k] !== valorInicial[k]);
  }, [form, valorInicial]);

  // Reportar el dirty al padre para el guard de navegacion
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  // Cuando llega un consultorio nuevo (ej: Firestore update externo), resetear form.
  useEffect(() => {
    setForm(valorInicial);
    // Intencional: solo queremos resetear el form cuando cambia el consultorio
    // completo (nueva instancia), no cuando el admin edita un campo del form.
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

  // Handler de guardado: usamos useCallback para que la referencia sea
  // estable y el saveRef del padre no apunte a una funcion vieja que
  // capturo un form anterior.
  const guardar = useCallback(async () => {
    if (!form.nombre.trim()) {
      const msg = 'El nombre del consultorio es obligatorio.';
      setError(msg);
      throw new Error(msg); // para que el modal muestre el error
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
      throw err; // propagar para que el modal lo muestre
    } finally {
      setSaving(false);
    }
  }, [form, consultorioId]);

  const descartar = useCallback(() => {
    setForm(valorInicial);
    setError('');
    setSaved(false);
  }, [valorInicial]);

  // Exponer guardar/descartar al padre via refs para el guard.
  useEffect(() => {
    saveRef.current = guardar;
    discardRef.current = descartar;
    return () => {
      saveRef.current = null;
      discardRef.current = null;
    };
  }, [guardar, descartar, saveRef, discardRef]);

  // Handler del submit del form (boton "Guardar cambios" propio del tab).
  // Internamente llama a guardar, ignorando el throw porque ya setea error en state.
  async function onSubmit(e) {
    e.preventDefault();
    try {
      await guardar();
    } catch {
      // Error ya esta en state local, no hace falta mas.
    }
  }

  return (
    <form className="cp-config-section" onSubmit={onSubmit}>
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
            <Button variant="secondary" type="button" onClick={descartar} disabled={saving}>
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
function TabMetodos({ metodos: metodosOriginales, consultorioId, onDirtyChange, saveRef, discardRef }) {
  const [metodos, setMetodos] = useState(metodosOriginales);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [openNuevo, setOpenNuevo] = useState(false);

  // Reportar dirty al padre
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    // Al recibir métodos del consultorio, normalizo los que no tienen tipo.
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

    // Si hubo que normalizar algo, el form queda dirty para que al guardar
    // se persistan los tipos inferidos.
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
    // Evitar duplicados de id
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

  const guardar = useCallback(async () => {
    setError('');
    setSaving(true);
    try {
      // Normalización final: convertimos los strings parciales que pueda
      // haber dejado el usuario mientras editaba a numeros bien formados.
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
      throw err;
    } finally {
      setSaving(false);
    }
  }, [metodos, consultorioId]);

  const descartar = useCallback(() => {
    setMetodos(metodosOriginales);
    setDirty(false);
    setError('');
    setSaved(false);
  }, [metodosOriginales]);

  useEffect(() => {
    saveRef.current = guardar;
    discardRef.current = descartar;
    return () => {
      saveRef.current = null;
      discardRef.current = null;
    };
  }, [guardar, descartar, saveRef, discardRef]);

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
            <Button variant="secondary" onClick={descartar} disabled={saving}>
              Descartar
            </Button>
            <Button variant="primary" onClick={() => guardar().catch(() => {})} disabled={saving}>
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
