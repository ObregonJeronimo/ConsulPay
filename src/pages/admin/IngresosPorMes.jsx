import { useEffect, useMemo, useState } from 'react';

import Avatar from '../../components/ui/Avatar.jsx';
import Button from '../../components/ui/Button.jsx';
import Spinner from '../../components/ui/Spinner.jsx';

import { formatoARS } from '../../lib/constants.js';
import { editarFechaPago, suscribirSesionesPagadas } from '../../lib/sesiones.js';

import './IngresosPorMes.css';

/* ============================================================
   Helpers de fecha
   ============================================================ */
function fechaDePago(sesion) {
  // Preferimos fechaPago; si no existe (sesiones pagadas antes de esta
  // feature), usamos updatedAt como respaldo razonable.
  const f = sesion.fechaPago || sesion.updatedAt;
  if (!f) return null;
  return f.toDate ? f.toDate() : new Date(f);
}
/* Fecha en que ocurrió la sesión (el encuentro con el paciente).
   Distinta de fechaDePago: un pago de julio puede corresponder a
   sesiones de marzo. Se usa para desglosar a qué mes pertenece
   el dinero que entró. */
function fechaDeSesion(sesion) {
  const f = sesion.fecha;
  if (!f) return null;
  if (f.toDate) return f.toDate();
  if (f.seconds !== undefined) return new Date(f.seconds * 1000);
  const d = new Date(f);
  return isNaN(d.getTime()) ? null : d;
}
function claveMes(d) {
  if (!d || typeof d.getFullYear !== 'function') return 'sin-fecha';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function claveDia(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
function nombreMesLargo(clave) {
  if (!clave || clave === 'sin-fecha') return 'Sin fecha';
  const [y, m] = clave.split('-').map(Number);
  if (!m || m < 1 || m > 12 || !y) return 'Sin fecha';
  return `${MESES[m - 1]} ${y}`;
}
function formatoDiaLargo(d) {
  return d.toLocaleDateString('es-AR', { weekday: 'short', day: '2-digit', month: 'short' });
}
function inputDeFecha(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function nombrePac(sesion, mapaPacientes) {
  const pac = mapaPacientes[sesion.pacienteId];
  if (pac) return `${pac.apellido ?? ''}${pac.apellido && pac.nombre ? ', ' : ''}${pac.nombre ?? ''}`;
  return sesion.pacienteNombre || 'Paciente';
}
function nombreProf(sesion, mapaProfesionales) {
  const prof = mapaProfesionales[sesion.profesionalUid];
  return prof?.displayName || prof?.email || sesion.profesionalNombre || 'Profesional';
}

/* ============================================================
   Iconos
   ============================================================ */
const Chevron = ({ abierto }) => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
    style={{ transform: abierto ? 'rotate(90deg)' : 'none', transition: 'transform 160ms' }}>
    <polyline points="9 18 15 12 9 6" />
  </svg>
);
const EditIcon = () => (
  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);

/* ============================================================
   Componente principal
   ============================================================ */
export default function IngresosPorMes({ consultorioId, uid, mapaProfesionales, mapaPacientes }) {
  const [sesiones, setSesiones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mesesAbiertos, setMesesAbiertos] = useState(() => new Set());
  const [vistaDetalle, setVistaDetalle] = useState({}); // claveMes -> 'profesional' | 'dia' | 'sueltas'
  const [editando, setEditando] = useState(null); // sesion en edición de fecha

  useEffect(() => {
    if (!consultorioId) return;
    setLoading(true);
    return suscribirSesionesPagadas(consultorioId, (data) => {
      setSesiones(data);
      setLoading(false);
    });
  }, [consultorioId]);

  // Agrupar por mes de fechaPago
  const meses = useMemo(() => {
    const map = {};
    for (const s of sesiones) {
      const d = fechaDePago(s);
      if (!d) continue;
      const km = claveMes(d);
      if (!map[km]) map[km] = { clave: km, sesiones: [], total: 0 };
      map[km].sesiones.push(s);
      map[km].total += s.montoConsultorio || 0;
    }
    return Object.values(map).sort((a, b) => b.clave.localeCompare(a.clave));
  }, [sesiones]);

  function toggleMes(clave) {
    setMesesAbiertos((prev) => {
      const n = new Set(prev);
      n.has(clave) ? n.delete(clave) : n.add(clave);
      return n;
    });
    setVistaDetalle((prev) => ({ ...prev, [clave]: prev[clave] || 'profesional' }));
  }

  if (loading && sesiones.length === 0) {
    return (
      <div style={{ padding: 50, display: 'flex', justifyContent: 'center' }}>
        <Spinner size={22} label="Cargando ingresos…" />
      </div>
    );
  }

  if (meses.length === 0) {
    return (
      <div className="cp-ingresos-empty">
        <p>Todavía no hay ingresos registrados.</p>
        <p className="cp-ingresos-empty__hint">
          Cuando marques sesiones como pagadas, vas a ver acá el registro de ingresos agrupado por mes.
        </p>
      </div>
    );
  }

  return (
    <div className="cp-ingresos">
      {meses.map((mes) => {
        const abierto = mesesAbiertos.has(mes.clave);
        const vista = vistaDetalle[mes.clave] || 'profesional';
        return (
          <div key={mes.clave} className={`cp-ingreso-mes ${abierto ? 'cp-ingreso-mes--abierto' : ''}`}>
            <button className="cp-ingreso-mes__head" onClick={() => toggleMes(mes.clave)}>
              <span className="cp-ingreso-mes__chevron"><Chevron abierto={abierto} /></span>
              <span className="cp-ingreso-mes__nombre">{nombreMesLargo(mes.clave)}</span>
              <span className="cp-ingreso-mes__meta">
                {mes.sesiones.length} sesión{mes.sesiones.length === 1 ? '' : 'es'}
              </span>
              <span className="cp-ingreso-mes__total">{formatoARS.format(mes.total)}</span>
            </button>

            {abierto && (
              <div className="cp-ingreso-mes__body">
                {/* Tabs de vista */}
                <div className="cp-ingreso-tabs">
                  <button
                    className={`cp-ingreso-tab ${vista === 'profesional' ? 'cp-ingreso-tab--active' : ''}`}
                    onClick={() => setVistaDetalle((p) => ({ ...p, [mes.clave]: 'profesional' }))}
                  >Por profesional</button>
                  <button
                    className={`cp-ingreso-tab ${vista === 'dia' ? 'cp-ingreso-tab--active' : ''}`}
                    onClick={() => setVistaDetalle((p) => ({ ...p, [mes.clave]: 'dia' }))}
                  >Por día</button>
                  <button
                    className={`cp-ingreso-tab ${vista === 'sueltas' ? 'cp-ingreso-tab--active' : ''}`}
                    onClick={() => setVistaDetalle((p) => ({ ...p, [mes.clave]: 'sueltas' }))}
                  >Sesiones sueltas</button>
                </div>

                {vista === 'profesional' && (
                  <VistaProfesional mes={mes} mapaProfesionales={mapaProfesionales} mapaPacientes={mapaPacientes} />
                )}
                {vista === 'dia' && (
                  <VistaDia mes={mes} mapaProfesionales={mapaProfesionales} />
                )}
                {vista === 'sueltas' && (
                  <VistaSueltas
                    mes={mes}
                    mapaProfesionales={mapaProfesionales}
                    mapaPacientes={mapaPacientes}
                    onEditarFecha={(s) => setEditando(s)}
                  />
                )}
              </div>
            )}
          </div>
        );
      })}

      {editando && (
        <EditarFechaModal
          sesion={editando}
          uid={uid}
          mapaPacientes={mapaPacientes}
          onClose={() => setEditando(null)}
        />
      )}
    </div>
  );
}

/* ============================================================
   Vista: resumen por profesional
   ----------------------------------------------------------------
   Cada profesional es desplegable. Al abrirlo se ve DE QUÉ MESES
   viene ese dinero: un pago que entró en julio puede corresponder a
   sesiones de marzo, abril y mayo. Sin esto el admin ve el total
   pero no sabe cómo se compone.
   ============================================================ */
function VistaProfesional({ mes, mapaProfesionales, mapaPacientes }) {
  const filas = useMemo(() => {
    const map = {};
    for (const s of mes.sesiones) {
      const uid = s.profesionalUid;
      if (!map[uid]) {
        map[uid] = {
          uid,
          nombre: nombreProf(s, mapaProfesionales),
          total: 0,
          pacientes: new Set(),
          sesiones: [],
        };
      }
      map[uid].total += s.montoConsultorio || 0;
      if (s.pacienteId) map[uid].pacientes.add(s.pacienteId);
      map[uid].sesiones.push(s);
    }
    return Object.values(map)
      .map((f) => ({ ...f, cantPacientes: f.pacientes.size }))
      .sort((a, b) => b.total - a.total);
  }, [mes, mapaProfesionales]);

  return (
    <div className="cp-ingreso-lista">
      {filas.map((f) => (
        <FilaProfesional
          key={f.uid}
          fila={f}
          mapaPacientes={mapaPacientes}
        />
      ))}
    </div>
  );
}

function FilaProfesional({ fila, mapaPacientes }) {
  const [abierto, setAbierto] = useState(false);

  // Desglose: a qué mes corresponde cada sesión que se cobró
  const desglose = useMemo(() => {
    const map = {};
    for (const s of fila.sesiones) {
      const d = fechaDeSesion(s);
      const km = claveMes(d);
      if (!map[km]) map[km] = { clave: km, total: 0, pacientes: new Set() };
      map[km].total += s.montoConsultorio || 0;
      if (s.pacienteId) map[km].pacientes.add(s.pacienteId);
    }
    return Object.values(map)
      .map((m) => ({ ...m, cantPacientes: m.pacientes.size }))
      .sort((a, b) => b.clave.localeCompare(a.clave));
  }, [fila]);

  const variosMeses = desglose.length > 1;

  return (
    <div className={`cp-ingreso-prof ${abierto ? 'cp-ingreso-prof--abierto' : ''}`}>
      <button className="cp-ingreso-fila cp-ingreso-fila--btn" onClick={() => setAbierto((v) => !v)}>
        <span className="cp-ingreso-fila__chev">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"
            strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
            style={{ transform: abierto ? 'rotate(90deg)' : 'none', transition: 'transform 160ms' }}>
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </span>
        <Avatar initials={(fila.nombre[0] || '?').toUpperCase()} size={30} />
        <div className="cp-ingreso-fila__main">
          <span className="cp-ingreso-fila__nombre">{fila.nombre}</span>
          <span className="cp-ingreso-fila__sub">
            {fila.cantPacientes} paciente{fila.cantPacientes === 1 ? '' : 's'}
            {variosMeses && (
              <span className="cp-ingreso-fila__badge">{desglose.length} meses</span>
            )}
          </span>
        </div>
        <span className="cp-ingreso-fila__monto">{formatoARS.format(fila.total)}</span>
      </button>

      {abierto && (
        <div className="cp-ingreso-prof__desglose">
          <div className="cp-ingreso-prof__desglose-titulo">
            De qué meses viene este dinero
          </div>
          {desglose.map((m) => (
            <div key={m.clave} className="cp-ingreso-desg">
              <span className="cp-ingreso-desg__mes">{nombreMesLargo(m.clave)}</span>
              <span className="cp-ingreso-desg__pac">
                {m.cantPacientes} paciente{m.cantPacientes === 1 ? '' : 's'}
              </span>
              <span className="cp-ingreso-desg__monto">{formatoARS.format(m.total)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   Vista: por día (con qué profesional aportó cada monto)
   ============================================================ */
function VistaDia({ mes, mapaProfesionales }) {
  const dias = useMemo(() => {
    const map = {};
    for (const s of mes.sesiones) {
      const d = fechaDePago(s);
      if (!d) continue;
      const kd = claveDia(d);
      if (!map[kd]) map[kd] = { clave: kd, fecha: d, total: 0, porProf: {} };
      map[kd].total += s.montoConsultorio || 0;
      const uid = s.profesionalUid;
      if (!map[kd].porProf[uid]) map[kd].porProf[uid] = { nombre: nombreProf(s, mapaProfesionales), monto: 0 };
      map[kd].porProf[uid].monto += s.montoConsultorio || 0;
    }
    return Object.values(map).sort((a, b) => b.clave.localeCompare(a.clave));
  }, [mes, mapaProfesionales]);

  return (
    <div className="cp-ingreso-dias">
      {dias.map((dia) => (
        <div key={dia.clave} className="cp-ingreso-dia">
          <div className="cp-ingreso-dia__head">
            <span className="cp-ingreso-dia__fecha">{formatoDiaLargo(dia.fecha)}</span>
            <span className="cp-ingreso-dia__total">{formatoARS.format(dia.total)}</span>
          </div>
          <div className="cp-ingreso-dia__profs">
            {Object.entries(dia.porProf)
              .sort((a, b) => b[1].monto - a[1].monto)
              .map(([uid, info]) => (
                <div key={uid} className="cp-ingreso-dia__prof">
                  <span className="cp-ingreso-dia__prof-nombre">{info.nombre}</span>
                  <span className="cp-ingreso-dia__prof-monto">{formatoARS.format(info.monto)}</span>
                </div>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ============================================================
   Vista: sesiones sueltas (detalle fino, con editar fecha)
   ============================================================ */
function VistaSueltas({ mes, mapaProfesionales, mapaPacientes, onEditarFecha }) {
  const ordenadas = useMemo(() => {
    return [...mes.sesiones].sort((a, b) => {
      const da = fechaDePago(a), dbb = fechaDePago(b);
      return (dbb?.getTime() || 0) - (da?.getTime() || 0);
    });
  }, [mes]);

  return (
    <div className="cp-ingreso-sueltas">
      {ordenadas.map((s) => {
        const d = fechaDePago(s);
        return (
          <div key={s.id} className="cp-ingreso-suelta">
            <div className="cp-ingreso-suelta__fecha">
              {d ? d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' }) : '—'}
            </div>
            <div className="cp-ingreso-suelta__main">
              <span className="cp-ingreso-suelta__pac">{nombrePac(s, mapaPacientes)}</span>
              <span className="cp-ingreso-suelta__prof">{nombreProf(s, mapaProfesionales)}</span>
            </div>
            <span className="cp-ingreso-suelta__monto">{formatoARS.format(s.montoConsultorio || 0)}</span>
            <button
              className="cp-ingreso-suelta__editar"
              onClick={() => onEditarFecha(s)}
              title="Editar fecha de pago"
              aria-label="Editar fecha de pago"
            >
              <EditIcon />
            </button>
          </div>
        );
      })}
    </div>
  );
}

/* ============================================================
   Modal: editar la fecha de pago de una sesión (ajuste a mano)
   ============================================================ */
function EditarFechaModal({ sesion, uid, mapaPacientes, onClose }) {
  const actual = fechaDePago(sesion);
  const [fecha, setFecha] = useState(() => inputDeFecha(actual || new Date()));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const nombre = nombrePac(sesion, mapaPacientes);

  async function handleGuardar() {
    setError('');
    setSubmitting(true);
    try {
      const nueva = new Date(fecha + 'T12:00:00');
      await editarFechaPago(sesion.id, nueva, uid);
      onClose();
    } catch (err) {
      setError(err.message || 'No se pudo guardar la fecha.');
      setSubmitting(false);
    }
  }

  return (
    <div className="cp-modal-overlay" onClick={onClose}>
      <div className="cp-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 380 }}>
        <button className="cp-modal__close" onClick={onClose} aria-label="Cerrar">×</button>
        <h2 className="cp-modal__title">Editar fecha de pago</h2>
        <p className="cp-modal__sub">
          Sesión de <strong>{nombre}</strong> · {formatoARS.format(sesion.montoConsultorio || 0)}
        </p>
        <div className="cp-modal__form">
          <div>
            <label className="cp-field__label" style={{ display: 'block', marginBottom: 6 }}>
              Fecha en que se pagó
            </label>
            <input
              className="cp-input"
              type="date"
              value={fecha}
              max={inputDeFecha(new Date())}
              onChange={(e) => setFecha(e.target.value)}
            />
            <div className="cp-hint" style={{ fontSize: 12, color: 'var(--cp-text-muted)', marginTop: 5 }}>
              Mover la fecha reubica este ingreso en el mes correcto.
            </div>
          </div>
          {error && <div className="cp-modal__error">{error}</div>}
          <div className="cp-modal__actions">
            <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>Cancelar</Button>
            <Button type="button" variant="primary" onClick={handleGuardar} disabled={submitting}>
              {submitting ? <><Spinner size={14} /> Guardando…</> : 'Guardar'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
