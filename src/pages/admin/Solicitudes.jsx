import { useEffect, useMemo, useState } from 'react';

import Avatar from '../../components/ui/Avatar.jsx';
import DualScrollTable from '../../components/ui/DualScrollTable.jsx';
import Button from '../../components/ui/Button.jsx';
import Spinner from '../../components/ui/Spinner.jsx';

import { useAuth } from '../../hooks/useAuth.js';
import { useConsultorio } from '../../hooks/useConsultorio.js';
import { useOverlayClose } from '../../hooks/useOverlayClose.js';
import {
  ESTADOS_SOLICITUD_SESION,
  formatoARS,
  LABELS_TIPO_SOLICITUD,
  TIPOS_LOG_SESION,
  TIPOS_METODO_PAGO,
  TIPOS_SOLICITUD_SESION,
} from '../../lib/constants.js';
import { suscribirLogsDeSolicitud } from '../../lib/logs.js';
import { suscribirPacientesConsultorio } from '../../lib/pacientes.js';
import { suscribirMiembrosConsultorio, suscribirProfesionales } from '../../lib/profesionales.js';
import {
  aprobarSolicitud,
  aprobarSolicitudesEnLote,
  rechazarSolicitud,
  suscribirTodasSolicitudes,
} from '../../lib/solicitudes.js';

import { GroupBadge } from './Sesiones.jsx';
import './Solicitudes.css';
import './Solicitudes.receptor.css';
import './Sesiones.css';

/* ============================================================
   Iconos
   ============================================================ */
const UserIcon = () => (
  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);
const ClockIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);
const PlusIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 4v16m8-8H4" />
  </svg>
);
const EditIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);
const TrashIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-2 14a2 2 0 01-2 2H9a2 2 0 01-2-2L5 6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
  </svg>
);
const InfoIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="16" x2="12" y2="12" />
    <line x1="12" y1="8" x2="12.01" y2="8" />
  </svg>
);
const CheckIcon = () => (
  <svg viewBox="0 0 24 24" width="56" height="56" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

/* ============================================================
   Helpers
   ============================================================ */
function nombrePaciente(p) {
  if (!p) return null;
  return `${p.apellido ?? ''}${p.apellido && p.nombre ? ', ' : ''}${p.nombre ?? ''}`;
}
function inicialesPaciente(p) {
  return ((p.apellido?.[0] ?? '') + (p.nombre?.[0] ?? '')).toUpperCase() || '·';
}
function nombreProfesional(p) {
  return p?.displayName || p?.email || '—';
}
function formatoFechaCompleta(date) {
  if (!date) return '—';
  const d = date.toDate ? date.toDate() : new Date(date);
  return d.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }) + ' · ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}
function formatoRelativo(date) {
  if (!date) return '';
  const d = date.toDate ? date.toDate() : new Date(date);
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'recién';
  if (diffMin < 60) return `hace ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `hace ${diffH} h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `hace ${diffD} día${diffD === 1 ? '' : 's'}`;
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
}

function cantidadDePayload(payload) {
  const c = Number(payload?.cantidadSesiones);
  return Number.isFinite(c) && c >= 1 ? Math.floor(c) : 1;
}

function iconoTipo(tipo) {
  switch (tipo) {
    case TIPOS_SOLICITUD_SESION.CREAR: return <PlusIcon />;
    case TIPOS_SOLICITUD_SESION.MODIFICAR: return <EditIcon />;
    case TIPOS_SOLICITUD_SESION.ELIMINAR: return <TrashIcon />;
    case TIPOS_SOLICITUD_SESION.LIQUIDAR_MONTO: return <CheckIcon />;
    case TIPOS_SOLICITUD_SESION.CARGA_RAPIDA: return <span style={{ fontSize: 13 }}>⚡</span>;
    case TIPOS_SOLICITUD_SESION.CREAR_PACIENTE: return <UserIcon />;
    case TIPOS_SOLICITUD_SESION.MARCAR_PAGADA: return <CheckIcon />;
    case TIPOS_SOLICITUD_SESION.LIQUIDAR_OS: return <EditIcon />;
    default: return null;
  }
}

function badgeEstado(estado) {
  switch (estado) {
    case ESTADOS_SOLICITUD_SESION.PENDIENTE:
      return <span className="cp-badge cp-badge--debido"><ClockIcon />Pendiente</span>;
    case ESTADOS_SOLICITUD_SESION.APROBADA:
      return <span className="cp-badge cp-badge--pagada"><span className="cp-badge__dot" />Aprobada</span>;
    case ESTADOS_SOLICITUD_SESION.RECHAZADA:
      return <span className="cp-badge cp-badge--rechazada"><span className="cp-badge__dot" />Rechazada</span>;
    case ESTADOS_SOLICITUD_SESION.OBSOLETA:
      return <span className="cp-badge cp-badge--obsoleta"><span className="cp-badge__dot" />Obsoleta</span>;
    default:
      return <span className="cp-badge">{estado}</span>;
  }
}

/* ============================================================
   Pagina principal
   ============================================================ */
export default function Solicitudes() {
  const { user } = useAuth();
  const { consultorio } = useConsultorio();
  const mapaMetodos = useMemo(() => {
    const m = {};
    for (const met of consultorio?.metodosPagoPaciente ?? []) m[met.id] = met;
    return m;
  }, [consultorio]);
  const [solicitudes, setSolicitudes] = useState([]);
  const [pacientes, setPacientes] = useState([]);
  const [profesionales, setProfesionales] = useState([]);
  const [miembros, setMiembros] = useState([]);
  const [loading, setLoading] = useState(true);

  const [tab, setTab] = useState('pendientes');
  const [seleccionada, setSeleccionada] = useState(null);

  useEffect(() => {
    if (!user?.consultorioId) return;
    setLoading(true);
    const unsub = suscribirTodasSolicitudes(user.consultorioId, (data) => {
      setSolicitudes(data);
      setLoading(false);
    });
    return unsub;
  }, [user?.consultorioId]);

  useEffect(() => {
    if (!user?.consultorioId) return;
    return suscribirPacientesConsultorio(user.consultorioId, setPacientes);
  }, [user?.consultorioId]);

  useEffect(() => {
    if (!user?.consultorioId) return;
    return suscribirProfesionales(user.consultorioId, setProfesionales);
  }, [user?.consultorioId]);

  useEffect(() => {
    if (!user?.consultorioId) return;
    return suscribirMiembrosConsultorio(user.consultorioId, setMiembros);
  }, [user?.consultorioId]);

  const mapaPacientes = useMemo(() => {
    const m = {};
    for (const p of pacientes) m[p.id] = p;
    return m;
  }, [pacientes]);

  const mapaProfesionales = useMemo(() => {
    const m = {};
    for (const p of profesionales) m[p.uid] = p;
    return m;
  }, [profesionales]);

  // Lista de admins reales del consultorio (excluye coadmin del reparto).
  const admins = useMemo(
    () => miembros.filter((m) => m.rol === 'admin' || m.esAdminDelConsultorio),
    [miembros],
  );

  const pendientes = useMemo(
    () => solicitudes.filter((s) => s.estado === ESTADOS_SOLICITUD_SESION.PENDIENTE),
    [solicitudes],
  );
  const resueltas = useMemo(
    () => solicitudes.filter((s) => s.estado !== ESTADOS_SOLICITUD_SESION.PENDIENTE),
    [solicitudes],
  );

  const lista = tab === 'pendientes' ? pendientes : resueltas;

  useEffect(() => {
    if (!seleccionada) return;
    const fresh = solicitudes.find((s) => s.id === seleccionada.id);
    if (fresh && fresh !== seleccionada) {
      setSeleccionada(fresh);
    }
  }, [solicitudes]);   // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="cp-solicitudes">
      <header className="cp-page-header">
        <div>
          <h1 className="cp-page-title">Solicitudes</h1>
          <p className="cp-page-sub">
            Acciones que profesionales sin edición directa pidieron sobre sesiones.
            Aprobá o rechazá cada una para que se aplique (o no) sobre el consultorio.
          </p>
          <div className="cp-tabs-bar">
            <button
              className={`cp-tabs-bar__btn ${tab === 'pendientes' ? 'cp-tabs-bar__btn--active' : ''}`}
              onClick={() => setTab('pendientes')}
            >
              Pendientes
              {pendientes.length > 0 && (
                <span className="cp-tabs-bar__count">{pendientes.length}</span>
              )}
            </button>
            <button
              className={`cp-tabs-bar__btn ${tab === 'resueltas' ? 'cp-tabs-bar__btn--active' : ''}`}
              onClick={() => setTab('resueltas')}
            >
              Resueltas
              {resueltas.length > 0 && (
                <span className="cp-tabs-bar__count">{resueltas.length}</span>
              )}
            </button>
          </div>
        </div>
      </header>

      {loading ? (
        <div style={{ padding: 60, display: 'flex', justifyContent: 'center' }}>
          <Spinner size={24} label="Cargando solicitudes…" />
        </div>
      ) : lista.length === 0 && tab === 'pendientes' ? (
        <EmptyState tab={tab} />
      ) : tab === 'pendientes' ? (
        <TablaSolicitudes
          solicitudes={lista}
          mapaPacientes={mapaPacientes}
          mapaProfesionales={mapaProfesionales}
          onSeleccionar={setSeleccionada}
          admins={admins}
          adminUid={user.uid}
          adminNombre={user.displayName || user.email}
        />
      ) : (
        <ResueltasPorProfesional
          solicitudes={resueltas}
          profesionales={profesionales}
          mapaPacientes={mapaPacientes}
          mapaProfesionales={mapaProfesionales}
          onSeleccionar={setSeleccionada}
        />
      )}

      {seleccionada && (
        <DetalleModal
          solicitud={seleccionada}
          mapaPacientes={mapaPacientes}
          mapaProfesionales={mapaProfesionales}
          mapaMetodos={mapaMetodos}
          admins={admins}
          adminUid={user.uid}
          adminNombre={user.displayName || user.email}
          consultorioId={user.consultorioId}
          onClose={() => setSeleccionada(null)}
        />
      )}
    </div>
  );
}

function EmptyState({ tab }) {
  if (tab === 'pendientes') {
    return (
      <div className="cp-solicitudes-empty">
        <div className="cp-solicitudes-empty__mark">
          <CheckIcon />
        </div>
        <h2 className="cp-solicitudes-empty__title">Todo al día</h2>
        <p className="cp-solicitudes-empty__desc">
          No hay solicitudes pendientes de aprobación. Cuando un profesional sin
          edición directa cree, modifique o elimine una sesión, vas a verla acá.
        </p>
      </div>
    );
  }
  return (
    <div className="cp-solicitudes-empty">
      <div className="cp-solicitudes-empty__mark" style={{ background: 'var(--cp-bg)', color: 'var(--cp-text-faint)' }}>
        <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
          <path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z" />
        </svg>
      </div>
      <h2 className="cp-solicitudes-empty__title">Sin solicitudes resueltas</h2>
      <p className="cp-solicitudes-empty__desc">
        Cuando aprobés o rechacés solicitudes, vas a verlas acá como historial.
      </p>
    </div>
  );
}

/* Extrae la fecha de la sesión (para agrupar por mes) desde el snapshot */
function fechaSesionDeSolicitud(s) {
  const f = s.payloadPropuesto?.sesionSnapshot?.fecha
    || s.payloadPropuesto?.fecha
    || s.payloadAnterior?.fecha;
  if (!f) return null;
  if (f.toDate) return f.toDate();
  if (f.seconds !== undefined) return new Date(f.seconds * 1000);
  const d = new Date(f);
  return isNaN(d.getTime()) ? null : d;
}
function montoConsultorioDeSolicitud(s) {
  const snap = s.payloadPropuesto?.sesionSnapshot;
  if (!snap) return 0;
  if (snap.montoConsultorio != null) return snap.montoConsultorio;
  if (snap.valorTotal != null && snap.porcentajeConsultorio != null) {
    return Math.round(snap.valorTotal * snap.porcentajeConsultorio / 100);
  }
  return 0;
}
const MESES_LARGO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MESES_TITULO = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
function claveMesSol(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function nombreMesSol(clave) {
  const [y, m] = clave.split('-').map(Number);
  return `${MESES_LARGO[m - 1]} ${y}`;
}

const ChevronSol = ({ abierto }) => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
    style={{ transform: abierto ? 'rotate(90deg)' : 'none', transition: 'transform 160ms' }}>
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

function TablaSolicitudes({ solicitudes, mapaPacientes, mapaProfesionales, onSeleccionar, admins, adminUid, adminNombre }) {
  // Separar solicitudes agrupables (marcar_pagada / liquidar_os, que tienen
  // fecha de sesión) de las sueltas (crear, modificar, eliminar, etc.).
  const { porProfesional, sueltas } = useMemo(() => {
    const agrupables = [];
    const otras = [];
    for (const s of solicitudes) {
      const esAgrupable = (s.tipo === TIPOS_SOLICITUD_SESION.MARCAR_PAGADA
        || s.tipo === TIPOS_SOLICITUD_SESION.LIQUIDAR_OS)
        && fechaSesionDeSolicitud(s);
      if (esAgrupable) agrupables.push(s);
      else otras.push(s);
    }
    // 1er nivel: profesional. 2do nivel: grupos por mes + tipo.
    const map = {};
    for (const s of agrupables) {
      const d = fechaSesionDeSolicitud(s);
      const km = claveMesSol(d);
      const gkey = `${km}__${s.tipo}`;
      const puid = s.profesionalUid;
      if (!map[puid]) {
        map[puid] = {
          profesionalUid: puid,
          profesionalNombre: s.profesionalNombre || nombreProfesional(mapaProfesionales[puid]),
          grupos: {},
        };
      }
      if (!map[puid].grupos[gkey]) {
        map[puid].grupos[gkey] = {
          key: `${puid}__${gkey}`,
          tipo: s.tipo,
          profesionalUid: puid,
          profesionalNombre: map[puid].profesionalNombre,
          mesClave: km,
          solicitudes: [],
          total: 0,
        };
      }
      map[puid].grupos[gkey].solicitudes.push(s);
      map[puid].grupos[gkey].total += montoConsultorioDeSolicitud(s);
    }
    // Ordenar: profesionales alfabéticamente; dentro, grupos por mes desc y tipo
    const profesionalesArr = Object.values(map)
      .map((p) => ({
        ...p,
        gruposArr: Object.values(p.grupos).sort((a, b) => {
          if (a.mesClave !== b.mesClave) return b.mesClave.localeCompare(a.mesClave);
          return a.tipo.localeCompare(b.tipo);
        }),
      }))
      .sort((a, b) => a.profesionalNombre.localeCompare(b.profesionalNombre));
    return { porProfesional: profesionalesArr, sueltas: otras };
  }, [solicitudes, mapaProfesionales]);

  return (
    <div className="cp-solicitudes-agrupadas">
      {porProfesional.map((prof) => (
        <div key={prof.profesionalUid} className="cp-sol-prof-bloque">
          <div className="cp-sol-prof-bloque__head">
            <Avatar initials={(prof.profesionalNombre?.[0] || '?').toUpperCase()} size={26} />
            <span className="cp-sol-prof-bloque__nombre">{prof.profesionalNombre}</span>
          </div>
          {prof.gruposArr.map((g) => (
            <GrupoSolicitudes
              key={g.key}
              grupo={g}
              mapaPacientes={mapaPacientes}
              mapaProfesionales={mapaProfesionales}
              onSeleccionar={onSeleccionar}
              admins={admins}
              adminUid={adminUid}
              adminNombre={adminNombre}
            />
          ))}
        </div>
      ))}

      {sueltas.length > 0 && (
        <>
          {grupos.length > 0 && (
            <div className="cp-solicitudes-sueltas-titulo">Otras solicitudes</div>
          )}
          <DualScrollTable className="cp-compact-list">
            <table className="cp-table cp-solicitudes-tabla">
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Profesional</th>
                  <th>Paciente</th>
                  <th>Solicitada</th>
                  <th>Estado</th>
                  <th aria-label="Acciones" />
                </tr>
              </thead>
              <tbody>
                {sueltas.map((s) => (
                  <FilaSolicitud
                    key={s.id}
                    s={s}
                    mapaPacientes={mapaPacientes}
                    mapaProfesionales={mapaProfesionales}
                    onSeleccionar={onSeleccionar}
                  />
                ))}
              </tbody>
            </table>
          </DualScrollTable>
        </>
      )}
    </div>
  );
}

/* ============================================================
   RESUELTAS: Profesional → Mes → Solicitudes (dos niveles desplegables)
   Lista TODOS los profesionales del consultorio; los que no tienen
   resueltas muestran un estado vacío.
   ============================================================ */
function ResueltasPorProfesional({ solicitudes, profesionales, mapaPacientes, mapaProfesionales, onSeleccionar }) {
  const bloques = useMemo(() => {
    // Agrupar resueltas por profesional
    const porProf = {};
    for (const s of solicitudes) {
      const puid = s.profesionalUid || '__sin__';
      if (!porProf[puid]) porProf[puid] = [];
      porProf[puid].push(s);
    }
    // Construir bloque por cada profesional del consultorio
    const arr = profesionales.map((p) => {
      const sols = porProf[p.uid] || [];
      // Agrupar por mes de la sesión (o de resolución si no hay fecha de sesión)
      const meses = {};
      for (const s of sols) {
        const d = fechaSesionDeSolicitud(s) || (s.resolvedAt?.toDate ? s.resolvedAt.toDate() : null);
        const km = d ? claveMesSol(d) : 'sin-fecha';
        if (!meses[km]) meses[km] = [];
        meses[km].push(s);
      }
      const mesesArr = Object.entries(meses)
        .map(([clave, lista]) => ({
          clave,
          lista: lista.sort((a, b) => (tsMs(b.resolvedAt) - tsMs(a.resolvedAt))),
        }))
        .sort((a, b) => b.clave.localeCompare(a.clave));
      return {
        uid: p.uid,
        nombre: nombreProfesional(p) || p.displayName || p.email || 'Profesional',
        cant: sols.length,
        meses: mesesArr,
      };
    });
    // Ordenar: primero los que tienen resueltas, luego alfabético
    return arr.sort((a, b) => {
      if ((a.cant > 0) !== (b.cant > 0)) return b.cant - a.cant > 0 ? 1 : -1;
      return a.nombre.localeCompare(b.nombre);
    });
  }, [solicitudes, profesionales, mapaProfesionales]);

  if (bloques.length === 0) {
    return <EmptyState tab="resueltas" />;
  }

  return (
    <div className="cp-resueltas">
      {bloques.map((b) => (
        <ProfesionalResueltas
          key={b.uid}
          bloque={b}
          mapaPacientes={mapaPacientes}
          onSeleccionar={onSeleccionar}
        />
      ))}
    </div>
  );
}

function tsMs(ts) {
  if (!ts) return 0;
  if (ts.toDate) return ts.toDate().getTime();
  if (ts.seconds) return ts.seconds * 1000;
  return 0;
}

/* Nivel 1: profesional (desplegable) */
function ProfesionalResueltas({ bloque, mapaPacientes, onSeleccionar }) {
  const [abierto, setAbierto] = useState(false);
  const vacio = bloque.cant === 0;

  return (
    <div className={`cp-res-prof ${abierto ? 'cp-res-prof--abierto' : ''} ${vacio ? 'cp-res-prof--vacio' : ''}`}>
      <button
        className="cp-res-prof__head"
        onClick={() => !vacio && setAbierto((v) => !v)}
        disabled={vacio}
      >
        <span className="cp-res-prof__chevron">
          {!vacio && <ChevronSol abierto={abierto} />}
        </span>
        <Avatar initials={(bloque.nombre?.[0] || '?').toUpperCase()} size={28} />
        <span className="cp-res-prof__nombre">{bloque.nombre}</span>
        {vacio ? (
          <span className="cp-res-prof__vacio-txt">Sin solicitudes resueltas</span>
        ) : (
          <span className="cp-res-prof__cant">{bloque.cant} resuelta{bloque.cant === 1 ? '' : 's'}</span>
        )}
      </button>

      {abierto && !vacio && (
        <div className="cp-res-prof__meses">
          {bloque.meses.map((m) => (
            <MesResueltas
              key={m.clave}
              mes={m}
              mapaPacientes={mapaPacientes}
              onSeleccionar={onSeleccionar}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* Nivel 2: mes (desplegable) */
function MesResueltas({ mes, mapaPacientes, onSeleccionar }) {
  const [abierto, setAbierto] = useState(false);
  const nombreMes = mes.clave === 'sin-fecha' ? 'Sin fecha' : nombreMesSol(mes.clave);

  return (
    <div className={`cp-res-mes ${abierto ? 'cp-res-mes--abierto' : ''}`}>
      <button className="cp-res-mes__head" onClick={() => setAbierto((v) => !v)}>
        <span className="cp-res-mes__chevron"><ChevronSol abierto={abierto} /></span>
        <span className="cp-res-mes__nombre">{nombreMes}</span>
        <span className="cp-res-mes__cant">{mes.lista.length}</span>
      </button>
      {abierto && (
        <DualScrollTable className="cp-compact-list">
          <table className="cp-table cp-solicitudes-tabla">
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Paciente</th>
                <th>Resuelta</th>
                <th>Estado</th>
                <th aria-label="Acciones" />
              </tr>
            </thead>
            <tbody>
              {mes.lista.map((s) => (
                <FilaResuelta
                  key={s.id}
                  s={s}
                  mapaPacientes={mapaPacientes}
                  onSeleccionar={onSeleccionar}
                />
              ))}
            </tbody>
          </table>
        </DualScrollTable>
      )}
    </div>
  );
}

/* Fila de una solicitud resuelta */
function FilaResuelta({ s, mapaPacientes, onSeleccionar }) {
  const snap = s.payloadPropuesto?.sesionSnapshot || {};
  const nombrePac = snap.pacienteNombre
    || (s.payloadPropuesto?.datosPaciente
      ? `${s.payloadPropuesto.datosPaciente.apellido || ''} ${s.payloadPropuesto.datosPaciente.nombre || ''}`.trim()
      : '—');

  return (
    <tr className="cp-solicitudes-tabla__row cp-solicitudes-tabla__row--resuelta" onClick={() => onSeleccionar(s)}>
      <td data-label="Tipo">
        <span className={`cp-solicitud-tipo cp-solicitud-tipo--${s.tipo}`}>
          {iconoTipo(s.tipo)}
          {LABELS_TIPO_SOLICITUD[s.tipo]}
        </span>
      </td>
      <td data-label="Paciente">
        <span style={{ fontSize: 13.5, fontWeight: 500 }}>{nombrePac}</span>
      </td>
      <td data-label="Resuelta" style={{ fontSize: 13, color: 'var(--cp-text-muted)' }}>
        {formatoRelativo(s.resolvedAt)}
      </td>
      <td data-label="Estado">{badgeEstado(s.estado)}</td>
      <td className="cp-solicitudes-tabla__action-cell" style={{ textAlign: 'right' }}>
        <button
          type="button"
          className="cp-prof-action"
          onClick={(e) => { e.stopPropagation(); onSeleccionar(s); }}
        >
          Ver detalle
        </button>
      </td>

      {/* Mobile */}
      <td className="cp-td-mobile-main" onClick={() => onSeleccionar(s)}>
        <div className="cp-row-mobile__top">
          <span style={{ fontSize: 13.5, fontWeight: 500 }}>{nombrePac}</span>
        </div>
        <div className="cp-row-mobile__mid">{LABELS_TIPO_SOLICITUD[s.tipo]}</div>
        <div className="cp-row-mobile__bot">{formatoRelativo(s.resolvedAt)}</div>
      </td>
      <td className="cp-td-mobile-badge">{badgeEstado(s.estado)}</td>
      <td className="cp-td-mobile-actions" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="cp-action-menu__trigger"
          onClick={() => onSeleccionar(s)}
          aria-label="Ver detalle"
          style={{ fontSize: 12, width: 'auto', padding: '4px 8px' }}
        >
          →
        </button>
      </td>
    </tr>
  );
}

/* Grupo colapsable: profesional + mes + tipo, con total y aprobar en lote */
function GrupoSolicitudes({ grupo, mapaPacientes, mapaProfesionales, onSeleccionar, admins, adminUid, adminNombre }) {
  const [abierto, setAbierto] = useState(false);
  const [modalLote, setModalLote] = useState(false);
  const cant = grupo.solicitudes.length;
  const esMarcarPagada = grupo.tipo === TIPOS_SOLICITUD_SESION.MARCAR_PAGADA;

  // Solo se pueden aprobar en lote las que están pendientes
  const pendientesDelGrupo = grupo.solicitudes.filter(
    (s) => s.estado === ESTADOS_SOLICITUD_SESION.PENDIENTE,
  );
  const puedeAprobarLote = pendientesDelGrupo.length > 0;

  const labelBoton = esMarcarPagada ? 'Marcar pagado' : 'Aprobar';

  return (
    <div className={`cp-sol-grupo ${abierto ? 'cp-sol-grupo--abierto' : ''}`}>
      <div className="cp-sol-grupo__head-wrap">
        <button className="cp-sol-grupo__head" onClick={() => setAbierto((v) => !v)}>
          <span className="cp-sol-grupo__chevron"><ChevronSol abierto={abierto} /></span>
          <span className={`cp-sol-grupo__tipo-icon cp-sol-grupo__tipo-icon--${esMarcarPagada ? 'pago' : 'liq'}`}>
            {iconoTipo(grupo.tipo)}
          </span>
          <div className="cp-sol-grupo__info">
            <span className="cp-sol-grupo__prof">
              {nombreMesSol(grupo.mesClave)}
            </span>
            <span className="cp-sol-grupo__mes">
              {esMarcarPagada ? 'Marcar como pagado' : 'Liquidar sesiones'}
            </span>
          </div>
          <span className="cp-sol-grupo__cant">{cant}</span>
          <span className="cp-sol-grupo__total">{formatoARS.format(grupo.total)}</span>
        </button>
        {puedeAprobarLote && (
          <button
            className="cp-sol-grupo__aprobar-btn"
            onClick={() => setModalLote(true)}
            title={esMarcarPagada ? 'Marcar el mes como pagado' : 'Aprobar todas las liquidaciones'}
          >
            {iconoTipo(grupo.tipo)}
            <span className="cp-sol-grupo__aprobar-btn-txt">{labelBoton}</span>
          </button>
        )}
      </div>

      {abierto && (
        <DualScrollTable className="cp-compact-list">
          <table className="cp-table cp-solicitudes-tabla">
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Paciente</th>
                <th className="cp-num-col">Al consultorio</th>
                <th>Solicitada</th>
                <th>Estado</th>
                <th aria-label="Acciones" />
              </tr>
            </thead>
            <tbody>
              {grupo.solicitudes.map((s) => (
                <FilaSolicitudGrupo
                  key={s.id}
                  s={s}
                  onSeleccionar={onSeleccionar}
                />
              ))}
            </tbody>
          </table>
        </DualScrollTable>
      )}

      {modalLote && (
        <AprobarGrupoModal
          grupo={grupo}
          pendientes={pendientesDelGrupo}
          esMarcarPagada={esMarcarPagada}
          admins={admins}
          adminUid={adminUid}
          adminNombre={adminNombre}
          onClose={() => setModalLote(false)}
        />
      )}
    </div>
  );
}

/* ============================================================
   Modal: aprobar un grupo de solicitudes en lote
   ----------------------------------------------------------------
   - MARCAR_PAGADA: muestra resumen (mes, total, cantidad) + selector
     de quién recibió y cuándo se pagó, y aprueba todas.
   - LIQUIDAR_OS: muestra resumen de los montos que el profesional
     cargó, sin receptor ni fecha, y aprueba todas.
   Procesa cada una por separado; al final informa cuántas se
   aprobaron y cuántas fallaron (p.ej. ya estaban pagadas).
   ============================================================ */
function AprobarGrupoModal({ grupo, pendientes, esMarcarPagada, admins, adminUid, adminNombre, onClose }) {
  const overlayProps = useOverlayClose(onClose);
  const [receptorUid, setReceptorUid] = useState(admins?.[0]?.uid ?? adminUid);
  const [fechaPagoInput, setFechaPagoInput] = useState(() => {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  });
  const [submitting, setSubmitting] = useState(false);
  const [resultado, setResultado] = useState(null);

  const total = pendientes.reduce((acc, s) => acc + montoConsultorioDeSolicitud(s), 0);
  const maxHoy = (() => {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  })();

  async function handleAprobar() {
    setSubmitting(true);
    try {
      const payload = {
        solicitudIds: pendientes.map((s) => s.id),
        adminUid,
        adminNombre,
      };
      if (esMarcarPagada) {
        const adminElegido = admins.find((a) => a.uid === receptorUid);
        payload.receptorOverride = {
          uid: receptorUid,
          nombre: adminElegido?.displayName || adminElegido?.email || receptorUid,
        };
        payload.fechaPagoOverride = fechaPagoInput ? new Date(fechaPagoInput + 'T12:00:00') : new Date();
      }
      const res = await aprobarSolicitudesEnLote(payload);
      setResultado(res);
      // Si se aprobaron todas sin fallos, cerramos solo
      if (res.fallidas.length === 0) {
        setTimeout(onClose, 900);
      }
    } catch (err) {
      setResultado({ ok: 0, fallidas: [{ motivo: err.message || 'Error inesperado' }] });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="cp-modal-overlay" {...overlayProps}>
      <div className="cp-modal cp-modal--detalle" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
        <button className="cp-modal__close" onClick={onClose} aria-label="Cerrar">×</button>
        <h2 className="cp-modal__title">
          {esMarcarPagada ? 'Marcar mes como pagado' : 'Aprobar liquidaciones'}
        </h2>
        <p className="cp-modal__sub">
          {grupo.profesionalNombre} · {nombreMesSol(grupo.mesClave)}
        </p>

        {/* Resumen */}
        <div className="cp-lote-resumen">
          <div className="cp-lote-resumen__fila">
            <span>Solicitudes</span>
            <strong>{pendientes.length}</strong>
          </div>
          <div className="cp-lote-resumen__fila">
            <span>{esMarcarPagada ? 'Total al consultorio' : 'Total a liquidar'}</span>
            <strong className="cp-lote-resumen__total">{formatoARS.format(total)}</strong>
          </div>
        </div>

        {/* Lista de pacientes */}
        <div className="cp-lote-lista">
          {pendientes.map((s) => {
            const snap = s.payloadPropuesto?.sesionSnapshot || {};
            return (
              <div key={s.id} className="cp-lote-item">
                <span className="cp-lote-item__pac">{snap.pacienteNombre || 'Paciente'}</span>
                <span className="cp-lote-item__monto">{formatoARS.format(montoConsultorioDeSolicitud(s))}</span>
              </div>
            );
          })}
        </div>

        {/* Solo para marcar pagada: receptor + fecha */}
        {esMarcarPagada && !resultado && (
          <>
            <div className="cp-receptor-selector">
              <label className="cp-receptor-selector__label">¿Quién recibió el dinero?</label>
              <p className="cp-receptor-selector__hint">
                Se asigna a esta persona en todas las sesiones del grupo.
              </p>
              <div className="cp-receptor-selector__opciones">
                {admins.map((a) => (
                  <button
                    key={a.uid}
                    className={`cp-receptor-opcion ${receptorUid === a.uid ? 'cp-receptor-opcion--sel' : ''}`}
                    onClick={() => setReceptorUid(a.uid)}
                    type="button"
                  >
                    <Avatar initials={(a.displayName || a.email || '?')[0].toUpperCase()} size={30} />
                    <span className="cp-receptor-opcion__nombre">{a.displayName || a.email}</span>
                    {receptorUid === a.uid && <span className="cp-receptor-opcion__check">✓</span>}
                  </button>
                ))}
              </div>
            </div>
            <div className="cp-receptor-selector" style={{ marginTop: 12 }}>
              <label className="cp-receptor-selector__label">¿Cuándo se pagó?</label>
              <p className="cp-receptor-selector__hint">
                Por defecto es hoy. Podés poner una fecha anterior si el pago entró otro día.
              </p>
              <input
                type="date"
                value={fechaPagoInput}
                max={maxHoy}
                onChange={(e) => setFechaPagoInput(e.target.value)}
                style={{
                  padding: '9px 12px', border: '1px solid var(--cp-border-strong)',
                  borderRadius: 'var(--cp-radius-md, 10px)', fontSize: 14,
                  fontFamily: 'inherit', color: 'var(--cp-text)', background: 'var(--cp-surface)',
                }}
              />
            </div>
          </>
        )}

        {/* Resultado */}
        {resultado && (
          <div className={`cp-lote-resultado ${resultado.fallidas.length === 0 ? 'cp-lote-resultado--ok' : 'cp-lote-resultado--parcial'}`}>
            <strong>
              {resultado.ok > 0 && `Se aprobaron ${resultado.ok} solicitud${resultado.ok === 1 ? '' : 'es'}.`}
            </strong>
            {resultado.fallidas.length > 0 && (
              <div style={{ marginTop: 4 }}>
                {resultado.fallidas.length} no se pudo{resultado.fallidas.length === 1 ? '' : 'ieron'} aprobar
                {' '}(probablemente ya estaban pagadas o cambiaron). Quedaron marcadas como obsoletas.
              </div>
            )}
          </div>
        )}

        <div className="cp-modal__actions">
          <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
            {resultado ? 'Cerrar' : 'Cancelar'}
          </Button>
          {!resultado && (
            <Button type="button" variant="primary" onClick={handleAprobar} disabled={submitting || (esMarcarPagada && !receptorUid)}>
              {submitting
                ? <><Spinner size={14} /> Aprobando…</>
                : `Aprobar ${pendientes.length}`}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/* Fila dentro de un grupo (sin columna profesional, con monto) */
function FilaSolicitudGrupo({ s, onSeleccionar }) {
  const snap = s.payloadPropuesto?.sesionSnapshot || {};
  const nombrePac = snap.pacienteNombre || '—';
  const resuelta = s.estado !== ESTADOS_SOLICITUD_SESION.PENDIENTE;
  const monto = montoConsultorioDeSolicitud(s);
  const d = fechaSesionDeSolicitud(s);

  return (
    <tr
      className={`cp-solicitudes-tabla__row ${resuelta ? 'cp-solicitudes-tabla__row--resuelta' : ''}`}
      onClick={() => onSeleccionar(s)}
    >
      <td data-label="Tipo">
        <span className={`cp-solicitud-tipo cp-solicitud-tipo--${s.tipo}`}>
          {iconoTipo(s.tipo)}
          {LABELS_TIPO_SOLICITUD[s.tipo]}
        </span>
      </td>
      <td data-label="Paciente">
        <span style={{ fontSize: 13.5, fontWeight: 500 }}>{nombrePac}</span>
        {d && (
          <span style={{ display: 'block', fontSize: 11.5, color: 'var(--cp-text-muted)' }}>
            {d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })}
          </span>
        )}
      </td>
      <td data-label="Al consultorio" className="cp-num" style={{ color: 'var(--cp-accent)' }}>
        {formatoARS.format(monto)}
      </td>
      <td data-label="Solicitada" style={{ fontSize: 13, color: 'var(--cp-text-muted)' }}>
        {formatoRelativo(s.createdAt)}
      </td>
      <td data-label="Estado">{badgeEstado(s.estado)}</td>
      <td className="cp-solicitudes-tabla__action-cell" style={{ textAlign: 'right' }}>
        <button
          type="button"
          className="cp-prof-action"
          onClick={(e) => { e.stopPropagation(); onSeleccionar(s); }}
        >
          Ver detalle
        </button>
      </td>

      {/* Mobile */}
      <td className="cp-td-mobile-main" onClick={() => onSeleccionar(s)}>
        <div className="cp-row-mobile__top">
          <span style={{ fontSize: 13.5, fontWeight: 500 }}>{nombrePac}</span>
        </div>
        <div className="cp-row-mobile__mid">
          {LABELS_TIPO_SOLICITUD[s.tipo]} · {formatoARS.format(monto)}
        </div>
        <div className="cp-row-mobile__bot">
          {formatoRelativo(s.createdAt)}
        </div>
      </td>
      <td className="cp-td-mobile-badge">{badgeEstado(s.estado)}</td>
      <td className="cp-td-mobile-actions" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="cp-action-menu__trigger"
          onClick={() => onSeleccionar(s)}
          aria-label="Ver detalle"
          style={{ fontSize: 12, width: 'auto', padding: '4px 8px' }}
        >
          →
        </button>
      </td>
    </tr>
  );
}

/* Fila normal (solicitudes sueltas: crear, modificar, etc.) */
function FilaSolicitud({ s, mapaPacientes, mapaProfesionales, onSeleccionar }) {
  const prof = mapaProfesionales[s.profesionalUid];
  const pacienteId = s.payloadPropuesto?.pacienteId || s.payloadAnterior?.pacienteId;
  const pac = pacienteId ? mapaPacientes[pacienteId] : null;
  const nombrePacDesdePayload = s.tipo === TIPOS_SOLICITUD_SESION.CREAR_PACIENTE
    ? `${s.payloadPropuesto?.datosPaciente?.apellido || ''} ${s.payloadPropuesto?.datosPaciente?.nombre || ''}`.trim()
    : s.tipo === TIPOS_SOLICITUD_SESION.MARCAR_PAGADA || s.tipo === TIPOS_SOLICITUD_SESION.LIQUIDAR_OS
      ? s.payloadPropuesto?.sesionSnapshot?.pacienteNombre || ''
      : null;
  const resuelta = s.estado !== ESTADOS_SOLICITUD_SESION.PENDIENTE;
  const cantidad = cantidadDePayload(s.payloadPropuesto || s.payloadAnterior);

  return (
    <tr
      className={`cp-solicitudes-tabla__row ${resuelta ? 'cp-solicitudes-tabla__row--resuelta' : ''}`}
      onClick={() => onSeleccionar(s)}
    >
      <td data-label="Tipo">
        <span className={`cp-solicitud-tipo cp-solicitud-tipo--${s.tipo}`}>
          {iconoTipo(s.tipo)}
          {LABELS_TIPO_SOLICITUD[s.tipo]}
        </span>
      </td>
      <td data-label="Profesional" style={{ fontSize: 13.5 }}>
        {s.profesionalNombre || nombreProfesional(prof)}
      </td>
      <td data-label="Paciente">
        {nombrePacDesdePayload ? (
          <span style={{ fontSize: 13.5, fontWeight: 500 }}>{nombrePacDesdePayload}</span>
        ) : pac ? (
          <div className="cp-prof-cell">
            <Avatar initials={inicialesPaciente(pac)} size={28} />
            <div className="cp-prof-name" style={{ fontSize: 13.5 }}>
              {nombrePaciente(pac)}
              <GroupBadge cantidad={cantidad} />
            </div>
          </div>
        ) : (
          <span style={{ color: 'var(--cp-text-faint)', fontSize: 13.5 }}>—</span>
        )}
      </td>
      <td data-label="Solicitada" style={{ fontSize: 13, color: 'var(--cp-text-muted)' }}>
        {formatoRelativo(s.createdAt)}
      </td>
      <td data-label="Estado">{badgeEstado(s.estado)}</td>
      <td className="cp-solicitudes-tabla__action-cell" style={{ textAlign: 'right' }}>
        <button
          type="button"
          className="cp-prof-action"
          onClick={(e) => { e.stopPropagation(); onSeleccionar(s); }}
        >
          Ver detalle
        </button>
      </td>

      <td className="cp-td-mobile-main" onClick={() => onSeleccionar(s)}>
        <div className="cp-row-mobile__top">
          {pac ? (
            <div className="cp-prof-cell">
              <Avatar initials={inicialesPaciente(pac)} size={26} />
              <div className="cp-prof-name">
                {nombrePaciente(pac)}
                <GroupBadge cantidad={cantidad} />
              </div>
            </div>
          ) : (
            <span className={`cp-solicitud-tipo cp-solicitud-tipo--${s.tipo}`}>
              {iconoTipo(s.tipo)} {LABELS_TIPO_SOLICITUD[s.tipo]}
            </span>
          )}
        </div>
        <div className="cp-row-mobile__mid">
          {LABELS_TIPO_SOLICITUD[s.tipo]}
          {pac ? ` · ${s.profesionalNombre || nombreProfesional(prof)}` : ''}
        </div>
        <div className="cp-row-mobile__bot">
          {formatoRelativo(s.createdAt)}
        </div>
      </td>
      <td className="cp-td-mobile-badge">
        {badgeEstado(s.estado)}
      </td>
      <td className="cp-td-mobile-actions" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="cp-action-menu__trigger"
          onClick={() => onSeleccionar(s)}
          aria-label="Ver detalle"
          style={{ fontSize: 12, width: 'auto', padding: '4px 8px' }}
        >
          →
        </button>
      </td>
    </tr>
  );
}

function DetalleModal({ solicitud, mapaPacientes, mapaProfesionales, mapaMetodos, admins, adminUid, adminNombre, consultorioId, onClose }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [mostrandoMotivo, setMostrandoMotivo] = useState(false);
  const [motivo, setMotivo] = useState('');

  const [receptorUid, setReceptorUid] = useState(() => {
    if (admins && admins.length > 0) return admins[0].uid;
    return adminUid;
  });

  const [fechaPagoInput, setFechaPagoInput] = useState(() => {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  });

  useEffect(() => {
    if (admins && admins.length > 0 && !admins.find((a) => a.uid === receptorUid)) {
      setReceptorUid(admins[0].uid);
    }
  }, [admins]); // eslint-disable-line react-hooks/exhaustive-deps

  const esPendiente = solicitud.estado === ESTADOS_SOLICITUD_SESION.PENDIENTE;
  const esMarcarPagada = solicitud.tipo === TIPOS_SOLICITUD_SESION.MARCAR_PAGADA;
  const prof = mapaProfesionales[solicitud.profesionalUid];

  const pacienteId = solicitud.payloadPropuesto?.pacienteId || solicitud.payloadAnterior?.pacienteId;
  const pac = pacienteId ? mapaPacientes[pacienteId] : null;
  const nombrePac = solicitud.tipo === TIPOS_SOLICITUD_SESION.CREAR_PACIENTE
    ? `${solicitud.payloadPropuesto?.datosPaciente?.apellido || ''} ${solicitud.payloadPropuesto?.datosPaciente?.nombre || ''}`.trim() || 'Nuevo paciente'
    : (nombrePaciente(pac) || solicitud.payloadPropuesto?.sesionSnapshot?.pacienteNombre || 'paciente');

  const cantidad = cantidadDePayload(solicitud.payloadPropuesto || solicitud.payloadAnterior);

  // Mes de la sesión (para el título), solo en solicitudes agrupables con fecha.
  const esAgrupable = solicitud.tipo === TIPOS_SOLICITUD_SESION.MARCAR_PAGADA
    || solicitud.tipo === TIPOS_SOLICITUD_SESION.LIQUIDAR_OS;
  const fechaSesionTitulo = esAgrupable ? fechaSesionDeSolicitud(solicitud) : null;
  const mesTitulo = fechaSesionTitulo
    ? MESES_TITULO[fechaSesionTitulo.getMonth()]
    : null;

  async function handleAprobar() {
    setError('');
    setSubmitting(true);
    try {
      const payload = {
        solicitudId: solicitud.id,
        adminUid,
        adminNombre,
      };
      if (esMarcarPagada) {
        const adminElegido = admins.find((a) => a.uid === receptorUid);
        payload.receptorOverride = {
          uid: receptorUid,
          nombre: adminElegido?.displayName || adminElegido?.email || receptorUid,
        };
        payload.fechaPagoOverride = fechaPagoInput
          ? new Date(fechaPagoInput + 'T12:00:00')
          : new Date();
      }
      await aprobarSolicitud(payload);
      onClose();
    } catch (err) {
      setError(err.message || 'No se pudo aprobar la solicitud.');
      setSubmitting(false);
    }
  }

  async function handleRechazar() {
    if (!mostrandoMotivo) {
      setMostrandoMotivo(true);
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      await rechazarSolicitud({
        solicitudId: solicitud.id,
        adminUid,
        adminNombre,
        motivo,
      });
      onClose();
    } catch (err) {
      setError(err.message || 'No se pudo rechazar la solicitud.');
      setSubmitting(false);
    }
  }

  const overlayProps = useOverlayClose(onClose);

  return (
    <div className="cp-modal-overlay" {...overlayProps}>
      <div className="cp-modal cp-modal--wide cp-modal--detalle" onClick={(e) => e.stopPropagation()}>
        <button className="cp-modal__close" onClick={onClose} aria-label="Cerrar">×</button>

        <h2 className="cp-modal__title">
          <span className={`cp-solicitud-tipo cp-solicitud-tipo--${solicitud.tipo}`}>
            {iconoTipo(solicitud.tipo)}
          </span>
          {' '}
          {solicitud.tipo === TIPOS_SOLICITUD_SESION.CARGA_RAPIDA
            ? `Carga rápida — ${solicitud.payloadPropuesto?.sesiones?.length ?? 0} sesiones`
            : <>{LABELS_TIPO_SOLICITUD[solicitud.tipo]}{mesTitulo ? ` · ${mesTitulo}` : ''} · {nombrePac}<GroupBadge cantidad={cantidad} /></>}
        </h2>

        {cantidad > 1 && esPendiente && (
          <div className="cp-detalle-aviso" style={{ background: 'var(--cp-accent-bg)', color: 'var(--cp-accent-dark)', marginBottom: 14 }}>
            <InfoIcon />
            <div>
              <strong>Sesiones agrupadas: {cantidad}</strong>
              Este registro representa <strong>{cantidad} encuentros</strong> con el paciente,
              cargados juntos. Aprobar o rechazar afecta al grupo entero.
            </div>
          </div>
        )}

        <div className="cp-detalle-header">
          <div className="cp-detalle-header__autor">
            Solicitada por <strong>{solicitud.profesionalNombre || nombreProfesional(prof)}</strong>
          </div>
          <div className="cp-detalle-header__fecha">
            {formatoFechaCompleta(solicitud.createdAt)}
          </div>
          <div style={{ marginTop: 6 }}>{badgeEstado(solicitud.estado)}</div>
        </div>

        <Diff solicitud={solicitud} pac={pac} mapaMetodos={mapaMetodos} />

        {esMarcarPagada && esPendiente && (
          <div className="cp-receptor-selector">
            <label className="cp-receptor-selector__label">
              ¿Quién recibió el dinero?
            </label>
            <p className="cp-receptor-selector__hint">
              Elegí cuál de los administradores cobró este pago. Al aprobar la solicitud,
              el dinero se asigna a esa persona.
            </p>
            {admins && admins.length > 0 ? (
              <div className="cp-receptor-selector__opciones">
                {admins.map((admin) => {
                  const sel = receptorUid === admin.uid;
                  return (
                    <button
                      key={admin.uid}
                      type="button"
                      className={`cp-receptor-opcion ${sel ? 'cp-receptor-opcion--sel' : ''}`}
                      onClick={() => setReceptorUid(admin.uid)}
                    >
                      <Avatar
                        initials={(admin.displayName || admin.email || '?')[0].toUpperCase()}
                        size={28}
                      />
                      <div className="cp-receptor-opcion__nombre">
                        {admin.displayName || admin.email}
                      </div>
                      {sel && <span className="cp-receptor-opcion__check">✓</span>}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div style={{ color: 'var(--cp-text-faint)', fontSize: 13 }}>
                No hay administradores cargados. El pago se asignará a vos.
              </div>
            )}
          </div>
        )}

        {esMarcarPagada && esPendiente && (
          <div className="cp-receptor-selector" style={{ marginTop: 12 }}>
            <label className="cp-receptor-selector__label">
              ¿Cuándo se pagó?
            </label>
            <p className="cp-receptor-selector__hint">
              Por defecto es hoy. Podés poner una fecha anterior si el pago entró otro día.
            </p>
            <input
              type="date"
              value={fechaPagoInput}
              max={(() => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`; })()}
              onChange={(e) => setFechaPagoInput(e.target.value)}
              style={{
                padding: '9px 12px',
                border: '1px solid var(--cp-border-strong)',
                borderRadius: 'var(--cp-radius-md, 10px)',
                fontSize: 14,
                fontFamily: 'inherit',
                color: 'var(--cp-text)',
                background: 'var(--cp-surface)',
              }}
            />
          </div>
        )}

        {solicitud.estado === ESTADOS_SOLICITUD_SESION.OBSOLETA && (
          <div className="cp-detalle-aviso">
            <InfoIcon />
            <div>
              <strong>Esta solicitud quedó obsoleta</strong>
              La sesión fue modificada o eliminada por otro camino antes de que se resolviera.
              No es posible aplicarla.
            </div>
          </div>
        )}

        {solicitud.estado === ESTADOS_SOLICITUD_SESION.RECHAZADA && (
          <div className="cp-detalle-aviso cp-detalle-aviso--rechazada">
            <InfoIcon />
            <div>
              <strong>Solicitud rechazada</strong>
              {solicitud.motivoRechazo
                ? `Motivo: "${solicitud.motivoRechazo}"`
                : 'No se especificó motivo.'}
              {solicitud.resolvedByNombre && ` — Por ${solicitud.resolvedByNombre}.`}
            </div>
          </div>
        )}

        {solicitud.estado === ESTADOS_SOLICITUD_SESION.APROBADA && (
          <div className="cp-detalle-aviso" style={{ background: 'var(--cp-success-bg)', color: 'var(--cp-success)' }}>
            <InfoIcon />
            <div>
              <strong>Solicitud aprobada</strong>
              Los cambios fueron aplicados {solicitud.resolvedByNombre && `por ${solicitud.resolvedByNombre}`}.
            </div>
          </div>
        )}

        {esPendiente && mostrandoMotivo && (
          <div className="cp-rechazo-form">
            <label className="cp-rechazo-form__label">
              Motivo del rechazo (opcional)
            </label>
            <textarea
              className="cp-textarea"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows="2"
              placeholder="Ej: el valor declarado no coincide con la sesión real, faltan datos, etc."
              autoFocus
            />
          </div>
        )}

        {error && <div className="cp-modal__error" style={{ marginTop: 12 }}>{error}</div>}

        <HistorialPanel consultorioId={consultorioId} solicitudId={solicitud.id} />

        <div className="cp-modal__actions">
          {esPendiente ? (
            <>
              <Button variant="secondary" type="button" onClick={onClose} disabled={submitting}>
                Cerrar
              </Button>
              <Button
                variant="secondary"
                type="button"
                onClick={handleRechazar}
                disabled={submitting}
                style={{
                  color: 'var(--cp-danger)',
                  borderColor: mostrandoMotivo ? 'var(--cp-danger)' : undefined,
                }}
              >
                {mostrandoMotivo
                  ? (submitting ? <><Spinner size={14} /> Rechazando…</> : 'Confirmar rechazo')
                  : 'Rechazar'}
              </Button>
              <Button variant="primary" type="button" onClick={handleAprobar} disabled={submitting || mostrandoMotivo}>
                {submitting && !mostrandoMotivo
                  ? <><Spinner size={14} /> Aprobando…</>
                  : (cantidad > 1 ? `Aprobar (${cantidad} sesiones)` : 'Aprobar')}
              </Button>
            </>
          ) : (
            <Button variant="primary" type="button" onClick={onClose}>
              Cerrar
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function HistorialPanel({ consultorioId, solicitudId }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!consultorioId || !solicitudId) return;
    setLoading(true);
    const unsub = suscribirLogsDeSolicitud(consultorioId, solicitudId, (data) => {
      setLogs(data);
      setLoading(false);
    });
    return unsub;
  }, [consultorioId, solicitudId]);

  if (loading) {
    return (
      <div className="cp-historial">
        <h3 className="cp-historial__title">Historial</h3>
        <div style={{ padding: 16, display: 'flex', justifyContent: 'center' }}>
          <Spinner size={16} />
        </div>
      </div>
    );
  }

  if (logs.length === 0) return null;

  return (
    <div className="cp-historial">
      <h3 className="cp-historial__title">
        Historial
        <span className="cp-historial__count">{logs.length} evento{logs.length === 1 ? '' : 's'}</span>
      </h3>
      <ol className="cp-historial__list">
        {logs.map((log) => (
          <li key={log.id} className="cp-historial__item">
            <span className={`cp-historial__dot cp-historial__dot--${tipoColor(log.tipo)}`} />
            <div className="cp-historial__contenido">
              <div className="cp-historial__descripcion">{log.descripcion}</div>
              <div className="cp-historial__meta">
                {log.actorNombre || 'Usuario'} · {formatoFechaCompleta(log.createdAt)}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function tipoColor(tipo) {
  switch (tipo) {
    case TIPOS_LOG_SESION.SOLICITUD_CREADA: return 'pendiente';
    case TIPOS_LOG_SESION.SOLICITUD_APROBADA: return 'success';
    case TIPOS_LOG_SESION.SOLICITUD_RECHAZADA: return 'danger';
    case TIPOS_LOG_SESION.SOLICITUD_OBSOLETA: return 'muted';
    default: return 'muted';
  }
}

function Diff({ solicitud, pac, mapaMetodos }) {
  const { tipo, payloadPropuesto, payloadAnterior } = solicitud;

  if (tipo === TIPOS_SOLICITUD_SESION.CARGA_RAPIDA) {
    return <DiffCargaRapida sesiones={payloadPropuesto?.sesiones ?? []} />;
  }

  if (tipo === TIPOS_SOLICITUD_SESION.CREAR_PACIENTE) {
    return <DiffCrearPaciente datos={payloadPropuesto?.datosPaciente ?? {}} mapaMetodos={mapaMetodos} />;
  }

  if (tipo === TIPOS_SOLICITUD_SESION.MARCAR_PAGADA) {
    return <DiffMarcarPagada payload={payloadPropuesto} />;
  }

  if (tipo === TIPOS_SOLICITUD_SESION.LIQUIDAR_OS) {
    return <DiffLiquidarOS payload={payloadPropuesto} />;
  }

  if (tipo === TIPOS_SOLICITUD_SESION.CREAR) {
    return <DiffSingle payload={payloadPropuesto} pac={pac} encabezado="Datos propuestos" tono="despues" />;
  }

  if (tipo === TIPOS_SOLICITUD_SESION.ELIMINAR) {
    return <DiffSingle payload={payloadAnterior} pac={pac} encabezado="Sesión a eliminar" tono="eliminar" />;
  }

  return <DiffDoble anterior={payloadAnterior} propuesto={payloadPropuesto} pac={pac} />;
}

function DiffMarcarPagada({ payload }) {
  const snap = payload?.sesionSnapshot ?? {};
  const total = snap.valorTotal ?? 0;
  const pct = snap.porcentajeConsultorio ?? null;
  const montoConsultorio = snap.montoConsultorio ?? (pct != null ? Math.round(total * pct / 100) : null);
  const montoProfesional = snap.montoProfesional ?? (montoConsultorio != null ? total - montoConsultorio : null);

  const filas = [
    { label: 'Paciente', valor: snap.pacienteNombre || '—' },
    { label: 'Método', valor: snap.metodoPagoNombre || '—' },
    { label: 'Total sesión', valor: total != null ? formatoARS.format(total) : '—' },
    ...(montoConsultorio != null ? [{ label: `Al consultorio${pct != null ? ` (${pct}%)` : ''}`, valor: formatoARS.format(montoConsultorio) }] : []),
    ...(montoProfesional != null ? [{ label: 'Al profesional', valor: formatoARS.format(montoProfesional) }] : []),
  ];
  return (
    <div className="cp-diff">
      {filas.map(({ label, valor }) => (
        <div key={label} className="cp-diff__row cp-diff__row--single">
          <div className="cp-diff__campo">{label.toUpperCase()}</div>
          <div className="cp-diff__valor cp-diff__valor--despues">{valor}</div>
        </div>
      ))}
    </div>
  );
}

function DiffLiquidarOS({ payload }) {
  const snap = payload?.sesionSnapshot ?? {};
  const filas = [
    { label: 'Paciente', valor: snap.pacienteNombre || '—' },
    { label: 'Método', valor: snap.metodoPagoNombre || '—' },
    { label: 'Monto a liquidar', valor: payload?.monto != null ? formatoARS.format(payload.monto) : '—' },
  ];
  return (
    <div className="cp-diff">
      {filas.map(({ label, valor }) => (
        <div key={label} className="cp-diff__row cp-diff__row--single">
          <div className="cp-diff__campo">{label.toUpperCase()}</div>
          <div className="cp-diff__valor cp-diff__valor--despues">{valor}</div>
        </div>
      ))}
    </div>
  );
}

function DiffCrearPaciente({ datos, mapaMetodos }) {
  const filas = [
    { label: 'Apellido y nombre', valor: `${datos.apellido || ''} ${datos.nombre || ''}`.trim() || '—' },
    { label: 'DNI', valor: datos.dni || '—' },
    { label: 'Teléfono', valor: datos.telefono || '—' },
    { label: 'Email', valor: datos.email || '—' },
    {
      label: 'Métodos de pago',
      valor: (datos.metodosPagoIds || [])
        .map((id) => mapaMetodos?.[id]?.nombre || id)
        .join(', ') || '—',
    },
    { label: 'Notas internas', valor: datos.notas || '—' },
  ];

  return (
    <div className="cp-diff">
      {filas.map(({ label, valor }) => (
        <div key={label} className="cp-diff__row cp-diff__row--single">
          <div className="cp-diff__campo">{label.toUpperCase()}</div>
          <div className="cp-diff__valor cp-diff__valor--despues">{valor}</div>
        </div>
      ))}
    </div>
  );
}

function DiffCargaRapida({ sesiones }) {
  if (!sesiones || sesiones.length === 0) {
    return <p style={{ color: 'var(--cp-text-faint)', fontSize: 13.5 }}>Sin sesiones en esta solicitud.</p>;
  }

  function parseFecha(v) {
    if (!v) return null;
    if (typeof v.toDate === 'function') return v.toDate();
    if (v.seconds !== undefined) return new Date(v.seconds * 1000);
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }

  const total = sesiones.reduce((acc, s) => acc + (s.valorTotal || 0), 0);
  const sinValor = sesiones.filter((s) => s.estadoPago === 'pendiente_monto').length;

  return (
    <div className="cp-cr-solicitud">
      <div className="cp-cr-solicitud__head">
        <span className="cp-cr-solicitud__count">
          {sesiones.length} sesión{sesiones.length === 1 ? '' : 'es'} a registrar
        </span>
        {total > 0 && (
          <span className="cp-cr-solicitud__total">
            Total: {formatoARS.format(total)}
          </span>
        )}
      </div>
      <div className="cp-cr-solicitud__tabla">
        {sesiones.map((s, i) => {
          const d = parseFecha(s.fecha);
          const fecha = d
            ? d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })
              + ' · ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
            : '—';
          return (
            <div key={i} className="cp-cr-solicitud__row">
              <div className="cp-cr-solicitud__pac">{s.pacienteNombre || '—'}</div>
              <div className="cp-cr-solicitud__meta">
                {fecha} · {s.metodoPagoNombre}
                {s.cantidadSesiones > 1 && ` · ×${s.cantidadSesiones}`}
              </div>
              <div className="cp-cr-solicitud__valor">
                {s.estadoPago === 'pendiente_monto'
                  ? <span style={{ color: 'var(--cp-warning, #b8860b)', fontSize: 12 }}>OS sin liquidar</span>
                  : formatoARS.format(s.valorTotal || 0)}
              </div>
            </div>
          );
        })}
      </div>
      {sinValor > 0 && (
        <div style={{ fontSize: 12.5, color: 'var(--cp-warning, #b8860b)', marginTop: 10 }}>
          ⚠ {sinValor} sesión{sinValor === 1 ? '' : 'es'} de obra social sin monto aún. Se crearán en estado "A liquidar".
        </div>
      )}
    </div>
  );
}

const CAMPOS_DIFF = [
  { key: 'fecha',                label: 'Fecha y hora' },
  { key: 'cantidadSesiones',     label: 'Cantidad de sesiones' },
  { key: 'metodoPagoNombre',     label: 'Método de pago' },
  { key: 'valorSesion',          label: 'Valor por sesión' },
  { key: 'valorTotal',           label: 'Valor total' },
  { key: 'porcentajeConsultorio', label: '% consultorio' },
  { key: 'montoConsultorio',     label: 'Al consultorio' },
  { key: 'montoProfesional',     label: 'Al profesional' },
  { key: 'notas',                label: 'Notas' },
];

function valorFormateado(payload, key) {
  if (!payload) return null;
  const v = payload[key];
  if (v == null || v === '') {
    if (key === 'cantidadSesiones') return '1';
    return null;
  }
  switch (key) {
    case 'fecha': {
      const d = v.toDate ? v.toDate() : new Date(v);
      return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })
        + ' · ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    }
    case 'valorTotal':
    case 'valorSesion':
    case 'montoConsultorio':
    case 'montoProfesional':
      return formatoARS.format(v);
    case 'porcentajeConsultorio':
      return `${v}%`;
    case 'cantidadSesiones':
      return String(v);
    case 'metodoPagoNombre':
      return (
        <>
          {v}
          {payload.metodoPagoTipo === TIPOS_METODO_PAGO.DIFERIDO && (
            <span className="cp-badge cp-badge--diferido" style={{ marginLeft: 6 }}>diferido</span>
          )}
        </>
      );
    default:
      return v;
  }
}

function compararValor(a, b, key) {
  if (key === 'fecha') {
    const ma = a?.toMillis ? a.toMillis() : (a ? new Date(a).getTime() : null);
    const mb = b?.toMillis ? b.toMillis() : (b ? new Date(b).getTime() : null);
    return ma === mb;
  }
  if (key === 'cantidadSesiones') {
    const na = Number(a) || 1;
    const nb = Number(b) || 1;
    return na === nb;
  }
  return (a ?? null) === (b ?? null);
}

function DiffSingle({ payload, pac, encabezado, tono }) {
  return (
    <div className="cp-diff">
      <div className="cp-diff__head cp-diff__head--single">
        <div className={`cp-diff__head-cell ${tono === 'eliminar' ? 'cp-diff__head-cell--eliminar' : 'cp-diff__head-cell--despues'}`}>
          {encabezado}
        </div>
      </div>
      <div className="cp-diff__body">
        {pac && (
          <div className={`cp-diff__row cp-diff__row--single ${tono === 'eliminar' ? 'cp-diff__row--eliminar' : ''}`}>
            <div className="cp-diff__campo">Paciente</div>
            <div className="cp-diff__valor">{nombrePaciente(pac)}</div>
          </div>
        )}
        {CAMPOS_DIFF.map(({ key, label }) => {
          const v = valorFormateado(payload, key);
          if (v == null && key !== 'notas') return null;
          return (
            <div
              key={key}
              className={`cp-diff__row cp-diff__row--single ${tono === 'eliminar' ? 'cp-diff__row--eliminar' : ''}`}
            >
              <div className="cp-diff__campo">{label}</div>
              <div className="cp-diff__valor">
                {v ?? <span className="cp-diff__valor--vacio">—</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DiffDoble({ anterior, propuesto, pac }) {
  return (
    <div className="cp-diff">
      <div className="cp-diff__head">
        <div className="cp-diff__head-cell">Antes</div>
        <div className="cp-diff__head-cell cp-diff__head-cell--despues">Después</div>
      </div>
      <div className="cp-diff__body">
        {pac && (
          <div className="cp-diff__row">
            <div className="cp-diff__campo">Paciente</div>
            <div className="cp-diff__valor">{nombrePaciente(pac)}</div>
            <div className="cp-diff__valor">{nombrePaciente(pac)}</div>
          </div>
        )}
        {CAMPOS_DIFF.map(({ key, label }) => {
          const vAnt = valorFormateado(anterior, key);
          const vNue = valorFormateado(propuesto, key);
          if (vAnt == null && vNue == null && key !== 'notas') return null;

          const cambio = !compararValor(anterior?.[key], propuesto?.[key], key);

          return (
            <div key={key} className={`cp-diff__row ${cambio ? 'cp-diff__row--changed' : ''}`}>
              <div className="cp-diff__campo">{label}</div>
              <div className={`cp-diff__valor ${cambio ? 'cp-diff__valor--anterior' : ''}`}>
                {vAnt ?? <span className="cp-diff__valor--vacio">—</span>}
              </div>
              <div className={`cp-diff__valor ${cambio ? 'cp-diff__valor--despues' : ''}`}>
                {vNue ?? <span className="cp-diff__valor--vacio">—</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
