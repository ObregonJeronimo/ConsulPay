/**
 * CargaRapidaModal — carga masiva de sesiones en una sola pantalla.
 *
 * Flujo Admin:
 *   Paso 1 → elegir profesional
 *   Paso 2 → ¿Todos los pacientes o algunos?
 *   Paso 3 → tabla editable de filas (una por paciente)
 *
 * Flujo Profesional:
 *   Paso 1 → ¿Todos tus pacientes o algunos?
 *   Paso 2 → tabla editable de filas
 *
 * Cada fila: paciente | fecha/hora | cantidad (1-64) | método | valor
 * Al guardar: batch de crearSesion(). Valida antes — subraya en rojo
 * las filas incompletas y hace scroll a la primera en mobile.
 */
import { useEffect, useMemo, useRef, useState } from 'react';

import Avatar from '../../components/ui/Avatar.jsx';
import Button from '../../components/ui/Button.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import { useOverlayClose } from '../../hooks/useOverlayClose.js';
import {
  ESTADOS_PACIENTE,
  TIPOS_METODO_PAGO,
  formatoARS,
} from '../../lib/constants.js';
import { getMetodosPaciente } from '../../lib/pacientes.js';
import { crearSesion } from '../../lib/sesiones.js';
import { solicitarCargaRapida } from '../../lib/solicitudes.js';

import './CargaRapida.css';

/* ---- Helpers ---- */
function nombrePaciente(p) {
  return `${p.apellido ?? ''}${p.apellido && p.nombre ? ', ' : ''}${p.nombre ?? ''}`;
}
function inicialesPaciente(p) {
  return ((p.apellido?.[0] ?? '') + (p.nombre?.[0] ?? '')).toUpperCase() || '·';
}
function dateAInputValue(d) {
  if (!d) return '';
  const date = d instanceof Date ? d : new Date(d);
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function inputValueToDate(val) {
  if (!val) return null;
  return new Date(val);
}
function nombreProf(p) {
  return p?.displayName || p?.email || '—';
}

/* ---- Fila inicial para un paciente ---- */
function filaInicial(paciente, mapaMetodos, esAdmin) {
  const metodoIds = getMetodosPaciente(paciente);
  const tieneMulti = metodoIds.length > 1;
  // Si tiene 1 solo método → pre-llenamos. Si tiene 2+ → vacío (debe elegir)
  const metodoPagoId = tieneMulti ? '' : (metodoIds[0] || '');
  const metodo = mapaMetodos[metodoPagoId];
  const esDiferido = metodo?.tipo === TIPOS_METODO_PAGO.DIFERIDO;
  return {
    id: paciente.id,
    pacienteId: paciente.id,
    fechaInput: dateAInputValue(new Date()),
    cantidad: '',
    metodoPagoId,
    valorSesion: esDiferido ? '' : (metodo?.valorSesionDefault !== undefined ? String(metodo.valorSesionDefault) : ''),
    error: null,
    metodoIds,   // guardamos los ids disponibles para el selector
  };
}

/* ============================================================
   Componente principal
   ============================================================ */
export default function CargaRapidaModal({
  esAdmin,
  tieneConfianza = true,        // si es false → genera solicitud en vez de crear
  profesionalNombre = '',       // nombre del profesional (para la solicitud)
  profesionales,
  pacientes,
  mapaMetodos,
  metodos,
  consultorioId,
  profesionalUidFijo,
  uid,
  onClose,
}) {
  const overlayProps = useOverlayClose(onClose);

  // ---- Estado del wizard ----
  const [paso, setPaso] = useState(1);
  const [profUid, setProfUid] = useState(esAdmin ? '' : profesionalUidFijo);
  const [modoSeleccion, setModoSeleccion] = useState(null); // 'todos' | 'algunos'
  const [pacientesElegidos, setPacientesElegidos] = useState(new Set());
  const [filas, setFilas] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(null); // { ok, errores }
  const rowRefs = useRef({});

  // Pacientes del profesional seleccionado
  const pacientesDelProf = useMemo(() => {
    const uid = esAdmin ? profUid : profesionalUidFijo;
    if (!uid) return [];
    return pacientes.filter((p) => {
      if (p.estado !== ESTADOS_PACIENTE.ACTIVO) return false;
      const uids = p.profesionalesUids || (p.profesionalUid ? [p.profesionalUid] : []);
      return uids.includes(uid);
    });
  }, [pacientes, profUid, profesionalUidFijo, esAdmin]);

  // Cuando se arman las filas, inicializarlas
  function armarFilas(pacs) {
    setFilas(pacs.map((p) => filaInicial(p, mapaMetodos, esAdmin)));
  }

  // ---- Handlers del wizard ----
  function handleElegirProfesional(uid) {
    setProfUid(uid);
    setPaso(2);
  }

  function handleModoSeleccion(modo) {
    setModoSeleccion(modo);
    if (modo === 'todos') {
      armarFilas(pacientesDelProf);
      setPaso(esAdmin ? 3 : 2);
    } else if (modo === null) {
      // Volver a los botones de elección
      setModoSeleccion(null);
    }
    // Para 'algunos': no avanzamos el paso, PasoModoPacientes
    // muestra la lista de checkboxes internamente con modoSeleccion === 'algunos'
  }

  function handleConfirmarSeleccion() {
    const seleccionados = pacientesDelProf.filter((p) => pacientesElegidos.has(p.id));
    armarFilas(seleccionados);
    setPaso(esAdmin ? 3 : 2);
  }

  // ---- Editar una fila ----
  function updateFila(id, campo, valor) {
    setFilas((prev) => prev.map((f) => {
      if (f.id !== id) return f;
      const siguiente = { ...f, [campo]: valor, error: null };
      // Si cambia el paciente en el admin, actualizar método y valor
      if (campo === 'metodoPagoId') {
        const m = metodos.find((x) => x.id === valor);
        const esDif = m?.tipo === TIPOS_METODO_PAGO.DIFERIDO;
        siguiente.valorSesion = esDif ? '' : (m?.valorSesionDefault !== undefined ? String(m.valorSesionDefault) : '');
      }
      return siguiente;
    }));
  }

  function eliminarFila(id) {
    setFilas((prev) => prev.filter((f) => f.id !== id));
  }

  // ---- Validar y guardar ----
  function validar() {
    let primeraError = null;
    const filasValidadas = filas.map((f) => {
      const m = metodos.find((x) => x.id === f.metodoPagoId);
      const esDif = m?.tipo === TIPOS_METODO_PAGO.DIFERIDO;
      const errors = [];
      if (!f.pacienteId) errors.push('paciente');
      if (!f.fechaInput) errors.push('fecha');
      if (!f.cantidad || isNaN(Number(f.cantidad))) errors.push('cantidad');
      if (!f.metodoPagoId) errors.push('metodo');
      if (!esDif && (!f.valorSesion || isNaN(Number(f.valorSesion)))) errors.push('valor');
      const error = errors.length > 0 ? errors : null;
      if (error && !primeraError) primeraError = f.id;
      return { ...f, error };
    });
    setFilas(filasValidadas);
    return { valido: !primeraError, primeraError };
  }

  async function handleGuardar() {
    const { valido, primeraError } = validar();
    if (!valido) {
      if (primeraError && rowRefs.current[primeraError]) {
        rowRefs.current[primeraError].scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }

    setSubmitting(true);

    // Profesional sin edición directa → genera 1 solicitud con todo el batch
    if (!esAdmin && !tieneConfianza) {
      try {
        const sesionesPayload = filas.map((f) => {
          const m = metodos.find((x) => x.id === f.metodoPagoId);
          const esDif = m?.tipo === TIPOS_METODO_PAGO.DIFERIDO;
          const pac = pacientes.find((p) => p.id === f.pacienteId);
          return {
            pacienteId: f.pacienteId,
            pacienteNombre: pac ? `${pac.apellido || ''} ${pac.nombre || ''}`.trim() : '',
            fecha: inputValueToDate(f.fechaInput),
            metodoPagoId: f.metodoPagoId,
            metodoPagoNombre: m?.nombre || '',
            metodoPagoTipo: m?.tipo || '',
            cantidadSesiones: Number(f.cantidad),
            valorSesion: esDif ? 0 : Number(f.valorSesion),
            valorTotal: esDif ? 0 : Number(f.valorSesion) * Number(f.cantidad),
            estadoPago: esDif ? 'pendiente_monto' : 'debido',
          };
        });
        await solicitarCargaRapida({
          consultorioId,
          profesionalUid: profesionalUidFijo,
          profesionalNombre,
          sesiones: sesionesPayload,
        });
        setDone({ ok: filas.map((f) => f.id), errores: [], esSolicitud: true });
      } catch (err) {
        setDone({ ok: [], errores: [{ id: 'general', msg: err.message }], esSolicitud: true });
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // Admin o profesional con edición directa → crear sesiones directamente
    const ok = [];
    const errores = [];
    await Promise.all(filas.map(async (f) => {
      try {
        const m = metodos.find((x) => x.id === f.metodoPagoId);
        const esDif = m?.tipo === TIPOS_METODO_PAGO.DIFERIDO;
        const pac = pacientes.find((p) => p.id === f.pacienteId);
        const profUidFinal = esAdmin ? profUid : profesionalUidFijo;
        await crearSesion({
          consultorioId,
          profesionalUid: profUidFinal,
          profesionalNombre,
          pacienteId: f.pacienteId,
          pacienteNombre: pac ? `${pac.apellido || ''} ${pac.nombre || ''}`.trim() : '',
          fecha: inputValueToDate(f.fechaInput),
          metodo: m,
          valorSesion: esDif ? undefined : Number(f.valorSesion),
          cantidadSesiones: Number(f.cantidad),
          notas: null,
        }, uid);
        ok.push(f.id);
      } catch (err) {
        errores.push({ id: f.id, msg: err.message });
      }
    }));
    setSubmitting(false);
    setDone({ ok, errores, esSolicitud: false });
  }

  const pasoActual = esAdmin ? paso : paso + 1; // normalizar para render

  // ---- Render por paso ----
  return (
    <div className="cp-modal-overlay" {...overlayProps}>
      <div className="cp-modal cp-modal--wide cp-cr-modal" onClick={(e) => e.stopPropagation()}>
        <button className="cp-modal__close" onClick={onClose} aria-label="Cerrar">×</button>
        <h2 className="cp-modal__title">Carga rápida de sesiones</h2>

        {done ? (
          <PantallaDone done={done} filas={filas} onClose={onClose} />
        ) : (
          <>
            {/* ADMIN: Paso 1 — elegir profesional */}
            {esAdmin && paso === 1 && (
              <PasoElegirProfesional
                profesionales={profesionales}
                onElegir={handleElegirProfesional}
              />
            )}

            {/* Paso 2 (admin) / Paso 1 (prof) — ¿todos o algunos? */}
            {((esAdmin && paso === 2) || (!esAdmin && paso === 1)) && (
              <PasoModoPacientes
                pacientesDelProf={pacientesDelProf}
                modoSeleccion={modoSeleccion}
                pacientesElegidos={pacientesElegidos}
                setPacientesElegidos={setPacientesElegidos}
                onElegirModo={handleModoSeleccion}
                onConfirmarSeleccion={handleConfirmarSeleccion}
              />
            )}

            {/* Paso 3 (admin) o 4 (admin si algunos) / Paso 2-3 prof — tabla de filas */}
            {filas.length > 0 && ((esAdmin && paso >= 3) || (!esAdmin && paso >= 2)) && (
              <TablaFilas
                filas={filas}
                pacientes={pacientes}
                metodos={metodos}
                mapaMetodos={mapaMetodos}
                esAdmin={esAdmin}
                rowRefs={rowRefs}
                onUpdate={updateFila}
                onEliminar={eliminarFila}
                submitting={submitting}
                onGuardar={handleGuardar}
                onClose={onClose}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ---- Paso: elegir profesional (solo admin) ---- */
function PasoElegirProfesional({ profesionales, onElegir }) {
  return (
    <div className="cp-modal__form cp-cr-paso">
      <p className="cp-cr-paso__hint">¿Para qué profesional querés cargar sesiones?</p>
      <div className="cp-cr-prof-lista">
        {profesionales.map((p) => (
          <button
            key={p.uid}
            type="button"
            className="cp-cr-prof-btn"
            onClick={() => onElegir(p.uid)}
          >
            <Avatar initials={(p.displayName || p.email || '?')[0].toUpperCase()} size={36} />
            <div>
              <div className="cp-cr-prof-btn__nombre">{nombreProf(p)}</div>
              <div className="cp-cr-prof-btn__email">{p.email}</div>
            </div>
            <span className="cp-cr-prof-btn__arrow">›</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---- Paso: ¿todos o algunos? ---- */
function PasoModoPacientes({
  pacientesDelProf,
  modoSeleccion,
  pacientesElegidos,
  setPacientesElegidos,
  onElegirModo,
  onConfirmarSeleccion,
}) {
  function togglePaciente(id) {
    setPacientesElegidos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (pacientesDelProf.length === 0) {
    return (
      <div className="cp-modal__form cp-cr-paso">
        <p style={{ color: 'var(--cp-text-muted)', fontSize: 14, textAlign: 'center', padding: '32px 0' }}>
          Este profesional no tiene pacientes asignados.
        </p>
      </div>
    );
  }

  return (
    <div className="cp-modal__form cp-cr-paso">
      {!modoSeleccion ? (
        <>
          <p className="cp-cr-paso__hint">¿Para quién querés cargar sesiones?</p>
          <div className="cp-cr-modo-btns">
            <button type="button" className="cp-cr-modo-btn" onClick={() => onElegirModo('todos')}>
              <span className="cp-cr-modo-btn__icon">👥</span>
              <div>
                <div className="cp-cr-modo-btn__label">Todos los pacientes</div>
                <div className="cp-cr-modo-btn__sub">{pacientesDelProf.length} paciente{pacientesDelProf.length === 1 ? '' : 's'}</div>
              </div>
            </button>
            <button type="button" className="cp-cr-modo-btn" onClick={() => onElegirModo('algunos')}>
              <span className="cp-cr-modo-btn__icon">✓</span>
              <div>
                <div className="cp-cr-modo-btn__label">Elegir algunos</div>
                <div className="cp-cr-modo-btn__sub">Seleccioná los que quieras</div>
              </div>
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="cp-cr-paso__hint">
            Seleccioná los pacientes ({pacientesElegidos.size} elegido{pacientesElegidos.size === 1 ? '' : 's'})
          </p>
          <div className="cp-cr-pac-lista">
            {pacientesDelProf.map((p) => {
              const sel = pacientesElegidos.has(p.id);
              return (
                <label key={p.id} className={`cp-cr-pac-item ${sel ? 'cp-cr-pac-item--sel' : ''}`}>
                  <input
                    type="checkbox"
                    checked={sel}
                    onChange={() => togglePaciente(p.id)}
                  />
                  <Avatar initials={inicialesPaciente(p)} size={28} />
                  <span className="cp-cr-pac-item__nombre">{nombrePaciente(p)}</span>
                  {sel && <span className="cp-cr-pac-item__check">✓</span>}
                </label>
              );
            })}
          </div>
          <div className="cp-modal__actions">
            <Button type="button" variant="ghost" onClick={() => onElegirModo(null)}>
              Volver
            </Button>
            <Button
              type="button"
              variant="primary"
              disabled={pacientesElegidos.size === 0}
              onClick={onConfirmarSeleccion}
            >
              Continuar con {pacientesElegidos.size} paciente{pacientesElegidos.size === 1 ? '' : 's'}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

/* ---- Tabla de filas editables ---- */
function TablaFilas({ filas, pacientes, metodos, mapaMetodos, esAdmin, rowRefs, onUpdate, onEliminar, submitting, onGuardar, onClose }) {
  const hayErrores = filas.some((f) => f.error);

  return (
    <div className="cp-cr-tabla-wrap">
      {/* Header de columnas — solo desktop */}
      <div className="cp-cr-tabla-head">
        <span>Paciente</span>
        <span>Fecha y hora</span>
        <span>Cant.</span>
        <span>Método</span>
        <span>Valor/sesión</span>
        <span />
      </div>

      <div className="cp-cr-filas">
        {filas.map((f) => (
          <FilaEditable
            key={f.id}
            fila={f}
            paciente={pacientes.find((p) => p.id === f.pacienteId)}
            metodos={metodos}
            mapaMetodos={mapaMetodos}
            esAdmin={esAdmin}
            rowRef={(el) => { rowRefs.current[f.id] = el; }}
            onUpdate={onUpdate}
            onEliminar={onEliminar}
          />
        ))}
      </div>

      {hayErrores && (
        <div className="cp-cr-error-banner">
          Completá los campos marcados en rojo antes de guardar.
        </div>
      )}

      <div className="cp-cr-footer">
        <span className="cp-cr-footer__count">
          {filas.length} sesión{filas.length === 1 ? '' : 'es'} a registrar
        </span>
        <div className="cp-cr-footer__actions">
          <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button type="button" variant="primary" onClick={onGuardar} disabled={submitting || filas.length === 0}>
            {submitting
              ? <><Spinner size={14} /> Guardando…</>
              : `Guardar ${filas.length} sesión${filas.length === 1 ? '' : 'es'}`}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ---- Una fila editable ---- */
function FilaEditable({ fila, paciente, metodos, mapaMetodos, esAdmin, rowRef, onUpdate, onEliminar }) {
  const metodo = metodos.find((m) => m.id === fila.metodoPagoId) || mapaMetodos[fila.metodoPagoId];
  const esDiferido = metodo?.tipo === TIPOS_METODO_PAGO.DIFERIDO;
  const err = fila.error || [];
  const tieneError = (campo) => err.includes(campo);

  // Picker de cantidad: 1-64 en mobile, input numérico en desktop
  const [isMobile] = useState(() => window.innerWidth <= 640);

  return (
    <div
      ref={rowRef}
      className={`cp-cr-fila ${err.length > 0 ? 'cp-cr-fila--error' : ''}`}
    >
      {/* Paciente — siempre readonly en carga rápida (ya fue elegido) */}
      <div className="cp-cr-fila__cell cp-cr-fila__cell--pac">
        <span className="cp-cr-fila__label">Paciente</span>
        <div className="cp-prof-cell">
          <Avatar initials={paciente ? inicialesPaciente(paciente) : '?'} size={24} />
          <span className="cp-cr-pac-nombre">{paciente ? nombrePaciente(paciente) : '—'}</span>
        </div>
      </div>

      {/* Fecha/hora */}
      <div className={`cp-cr-fila__cell ${tieneError('fecha') ? 'cp-cr-fila__cell--err' : ''}`}>
        <span className="cp-cr-fila__label">Fecha y hora</span>
        <input
          type="datetime-local"
          className="cp-cr-input"
          value={fila.fechaInput}
          onChange={(e) => onUpdate(fila.id, 'fechaInput', e.target.value)}
        />
      </div>

      {/* Cantidad */}
      <div className={`cp-cr-fila__cell cp-cr-fila__cell--cant ${tieneError('cantidad') ? 'cp-cr-fila__cell--err' : ''}`}>
        <span className="cp-cr-fila__label">Cantidad</span>
        {isMobile ? (
          <CantidadPicker
            value={fila.cantidad}
            onChange={(v) => onUpdate(fila.id, 'cantidad', v)}
          />
        ) : (
          <input
            type="number"
            className="cp-cr-input cp-cr-input--cant"
            value={fila.cantidad}
            onChange={(e) => onUpdate(fila.id, 'cantidad', e.target.value)}
            min="1"
            max="64"
            placeholder="—"
          />
        )}
      </div>

      {/* Método */}
      <div className={`cp-cr-fila__cell ${tieneError('metodo') ? 'cp-cr-fila__cell--err' : ''}`}>
        <span className="cp-cr-fila__label">Método</span>
        {esAdmin ? (
          fila.metodoIds?.length > 1 ? (
            // Admin + paciente con múltiples métodos → selector
            <select
              className="cp-cr-input cp-cr-select"
              value={fila.metodoPagoId}
              onChange={(e) => onUpdate(fila.id, 'metodoPagoId', e.target.value)}
            >
              <option value="">Seleccionar método…</option>
              {metodos.filter((m) => fila.metodoIds.includes(m.id)).map((m) => (
                <option key={m.id} value={m.id}>{m.nombre}</option>
              ))}
            </select>
          ) : (
            // Admin + paciente con 1 método → mostrar nombre (no editable en carga rápida)
            <span className="cp-cr-metodo-info">
              {metodo?.nombre || '—'}
            </span>
          )
        ) : (
          // Profesional → siempre readonly
          fila.metodoIds?.length > 1 ? (
            <select
              className="cp-cr-input cp-cr-select"
              value={fila.metodoPagoId}
              onChange={(e) => onUpdate(fila.id, 'metodoPagoId', e.target.value)}
            >
              <option value="">Seleccionar método…</option>
              {metodos.filter((m) => fila.metodoIds.includes(m.id)).map((m) => (
                <option key={m.id} value={m.id}>{m.nombre}</option>
              ))}
            </select>
          ) : (
            <span className={`cp-cr-metodo-info ${esDiferido ? 'cp-cr-metodo-info--dif' : ''}`}>
              {metodo?.nombre || '—'}
              {esDiferido && <span className="cp-badge cp-badge--diferido" style={{ marginLeft: 6, fontSize: 11 }}>OS</span>}
            </span>
          )
        )}
      </div>

      {/* Valor */}
      <div className={`cp-cr-fila__cell ${tieneError('valor') ? 'cp-cr-fila__cell--err' : ''}`}>
        <span className="cp-cr-fila__label">Valor</span>
        {esDiferido ? (
          <span className="cp-cr-metodo-info" style={{ fontStyle: 'italic', color: 'var(--cp-text-faint)' }}>
            Lo decide la OS
          </span>
        ) : (
          <div className="cp-cr-valor-wrap">
            <span className="cp-cr-valor-prefix">$</span>
            <input
              type="number"
              className="cp-cr-input cp-cr-input--valor"
              value={fila.valorSesion}
              onChange={(e) => onUpdate(fila.id, 'valorSesion', e.target.value)}
              min="0"
              step="any"
              placeholder="0"
            />
          </div>
        )}
      </div>

      {/* Eliminar fila */}
      <div className="cp-cr-fila__cell cp-cr-fila__cell--del">
        <button
          type="button"
          className="cp-cr-del-btn"
          onClick={() => onEliminar(fila.id)}
          aria-label="Eliminar fila"
          title="Quitar este paciente"
        >
          ×
        </button>
      </div>
    </div>
  );
}

/* ---- Picker de cantidad (mobile) ---- */
function CantidadPicker({ value, onChange }) {
  const opciones = Array.from({ length: 64 }, (_, i) => i + 1);
  const listRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [startY, setStartY] = useState(0);
  const [startScroll, setStartScroll] = useState(0);

  // Hacer scroll al valor actual al montar
  useEffect(() => {
    if (!listRef.current || !value) return;
    const idx = Number(value) - 1;
    const item = listRef.current.children[idx];
    if (item) item.scrollIntoView({ block: 'center' });
  }, []);

  // Touch scroll para el picker
  function onTouchStart(e) {
    setDragging(true);
    setStartY(e.touches[0].clientY);
    setStartScroll(listRef.current.scrollTop);
  }
  function onTouchMove(e) {
    if (!dragging) return;
    const delta = startY - e.touches[0].clientY;
    listRef.current.scrollTop = startScroll + delta;
  }
  function onTouchEnd() {
    setDragging(false);
  }

  return (
    <div className="cp-cr-picker">
      <div className="cp-cr-picker__fade-top" />
      <div
        ref={listRef}
        className="cp-cr-picker__list"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {opciones.map((n) => (
          <div
            key={n}
            className={`cp-cr-picker__item ${String(n) === String(value) ? 'cp-cr-picker__item--sel' : ''}`}
            onClick={(e) => {
              onChange(String(n));
              e.currentTarget.scrollIntoView({ block: 'center', behavior: 'smooth' });
            }}
          >
            {n}
          </div>
        ))}
      </div>
      <div className="cp-cr-picker__fade-bot" />
      <div className="cp-cr-picker__sel-indicator" />
    </div>
  );
}

/* ---- Pantalla de resultado ---- */
function PantallaDone({ done, filas, onClose }) {
  const totalOk = done.ok.length;
  const totalErr = done.errores.length;

  if (done.esSolicitud) {
    return (
      <div className="cp-modal__form cp-cr-done">
        <div className="cp-cr-done__icon" style={{ color: totalErr > 0 ? 'var(--cp-danger)' : 'var(--cp-accent)' }}>
          {totalErr > 0 ? '⚠' : '📋'}
        </div>
        <div className="cp-cr-done__titulo">
          {totalErr > 0
            ? 'No se pudo enviar la solicitud'
            : `Solicitud enviada — ${totalOk} sesión${totalOk === 1 ? '' : 'es'}`}
        </div>
        <div style={{ fontSize: 13.5, color: 'var(--cp-text-muted)', textAlign: 'center', maxWidth: 320 }}>
          {totalErr > 0
            ? done.errores[0]?.msg
            : 'El administrador recibirá la solicitud y podrá aprobarla o rechazarla. Cuando se apruebe, las sesiones quedarán registradas.'}
        </div>
        <Button variant="primary" onClick={onClose}>Cerrar</Button>
      </div>
    );
  }

  return (
    <div className="cp-modal__form cp-cr-done">
      <div className="cp-cr-done__icon">{totalErr === 0 ? '✓' : '⚠'}</div>
      <div className="cp-cr-done__titulo">
        {totalErr === 0
          ? `${totalOk} sesión${totalOk === 1 ? '' : 'es'} registrada${totalOk === 1 ? '' : 's'} correctamente`
          : `${totalOk} guardada${totalOk === 1 ? '' : 's'}, ${totalErr} con error`}
      </div>
      {done.errores.length > 0 && (
        <div className="cp-cr-done__errores">
          {done.errores.map((e) => {
            const f = filas.find((x) => x.id === e.id);
            return (
              <div key={e.id} className="cp-cr-done__err-item">
                <strong>{f?.pacienteId || e.id}</strong>: {e.msg}
              </div>
            );
          })}
        </div>
      )}
      <Button variant="primary" onClick={onClose}>Cerrar</Button>
    </div>
  );
}
