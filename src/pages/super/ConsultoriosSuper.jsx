import { useEffect, useMemo, useState } from 'react';

import Avatar from '../../components/ui/Avatar.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import Spinner from '../../components/ui/Spinner.jsx';

import { ESTADOS_USUARIO, formatoFechaLarga } from '../../lib/constants.js';
import {
  agruparUsuariosPorConsultorio,
  cargarPanoramaSuper,
  nombreVisible,
  reactivarUsuarioSuper,
  suspenderUsuarioSuper,
} from '../../lib/usuariosSuper.js';

import './ConsultoriosSuper.css';

/**
 * Panel de "Consultorios y usuarios" del superadmin.
 *
 * Muestra el panorama completo de la plataforma: todos los consultorios
 * con sus miembros, usuarios huerfanos (sin consultorio asignado) y
 * superadmins. Cada usuario tiene acciones simples (suspender/reactivar).
 *
 * Carga UNA SOLA VEZ al abrir + boton refrescar. No live (ver
 * usuariosSuper.js para la justificacion).
 */
export default function ConsultoriosSuper() {
  const [datos, setDatos] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [accion, setAccion] = useState(null); // {tipo: 'suspender'|'reactivar', user: User}
  const [accionEnCurso, setAccionEnCurso] = useState(false);
  const [mensaje, setMensaje] = useState('');

  async function refrescar() {
    setLoading(true);
    setError('');
    try {
      const panorama = await cargarPanoramaSuper();
      setDatos(panorama);
    } catch (err) {
      setError('No se pudo cargar el panorama: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refrescar();
  }, []);

  const grupos = useMemo(() => {
    if (!datos) return null;
    return agruparUsuariosPorConsultorio(datos.usuarios, datos.consultorios);
  }, [datos]);

  async function ejecutarAccion() {
    if (!accion) return;
    setAccionEnCurso(true);
    setError('');
    try {
      if (accion.tipo === 'suspender') {
        await suspenderUsuarioSuper(accion.user.uid);
        setMensaje(`${nombreVisible(accion.user)} fue suspendido.`);
      } else if (accion.tipo === 'reactivar') {
        await reactivarUsuarioSuper(accion.user.uid);
        setMensaje(`${nombreVisible(accion.user)} fue reactivado.`);
      }
      setAccion(null);
      await refrescar();
      setTimeout(() => setMensaje(''), 4000);
    } catch (err) {
      setError(err.message || 'No se pudo ejecutar la acción.');
    } finally {
      setAccionEnCurso(false);
    }
  }

  if (loading && !datos) {
    return (
      <div className="cp-super-tree">
        <div style={{ padding: 60, display: 'flex', justifyContent: 'center' }}>
          <Spinner size={24} label="Cargando panorama…" />
        </div>
      </div>
    );
  }

  const totalUsuarios = datos
    ? datos.usuarios.length
    : 0;
  const totalConsultorios = datos
    ? datos.consultorios.length
    : 0;

  return (
    <div className="cp-super-tree">
      <header className="cp-page-header">
        <div>
          <h1 className="cp-page-title">Consultorios y usuarios</h1>
          <p className="cp-page-sub">
            Panorama completo de la plataforma. {totalUsuarios} usuario{totalUsuarios === 1 ? '' : 's'}
            {' · '}{totalConsultorios} consultorio{totalConsultorios === 1 ? '' : 's'}.
          </p>
        </div>
        <Button variant="secondary" onClick={refrescar} disabled={loading}>
          {loading ? <><Spinner size={14} /> Refrescando…</> : 'Refrescar'}
        </Button>
      </header>

      {error && <div className="cp-config-error">{error}</div>}
      {mensaje && <div className="cp-config-ok">{mensaje}</div>}

      {grupos && (
        <div className="cp-super-tree__content">
          {/* Consultorios */}
          {grupos.porConsultorio.map(({ consultorio, miembros }) => (
            <ConsultorioGrupo
              key={consultorio.id}
              consultorio={consultorio}
              miembros={miembros}
              onAccion={(tipo, user) => setAccion({ tipo, user })}
            />
          ))}

          {/* Huerfanos */}
          {grupos.huerfanos.length > 0 && (
            <GrupoEspecial
              titulo="Sin consultorio asignado"
              hint="Usuarios autenticados que todavía no aceptaron una invitación o quedaron huérfanos por error."
              icono="⚠️"
              clase="cp-super-tree__group--warn"
              miembros={grupos.huerfanos}
              mostrarBadgeRol
              onAccion={(tipo, user) => setAccion({ tipo, user })}
            />
          )}

          {/* Superadmins */}
          {grupos.superadmins.length > 0 && (
            <GrupoEspecial
              titulo="Superadmins"
              hint="Operadores de la plataforma ConsulPay (vos y Thiago)."
              icono="👑"
              miembros={grupos.superadmins}
              soloLectura
              onAccion={(tipo, user) => setAccion({ tipo, user })}
            />
          )}
        </div>
      )}

      {accion && (
        <ConfirmarAccionSuperModal
          accion={accion}
          submitting={accionEnCurso}
          onCancelar={() => !accionEnCurso && setAccion(null)}
          onConfirmar={ejecutarAccion}
        />
      )}
    </div>
  );
}

/* ============================================================
   Grupo: un consultorio
   ============================================================ */
function ConsultorioGrupo({ consultorio, miembros, onAccion }) {
  return (
    <details className="cp-super-tree__group" open>
      <summary className="cp-super-tree__group-head">
        <span className="cp-super-tree__group-icon" aria-hidden="true">🏢</span>
        <div className="cp-super-tree__group-title">
          <strong>{consultorio.nombre || '(sin nombre)'}</strong>
          <div className="cp-super-tree__group-meta">
            Plan {consultorio.plan || '—'} · {consultorio.comisionConsulpay ?? '—'}% comisión ·{' '}
            {miembros.length} miembro{miembros.length === 1 ? '' : 's'}
          </div>
        </div>
        <span className="cp-super-tree__group-toggle" aria-hidden="true">▾</span>
      </summary>

      <div className="cp-super-tree__group-body">
        {miembros.length === 0 ? (
          <div className="cp-super-tree__empty">
            Este consultorio no tiene miembros (caso raro).
          </div>
        ) : (
          <ul className="cp-super-tree__users">
            {miembros.map((u) => (
              <UserRow
                key={u.uid}
                user={u}
                mostrarBadgeAdmin
                mostrarBadgeOwner
                onAccion={onAccion}
              />
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}

/* ============================================================
   Grupo especial: huerfanos / superadmins
   ============================================================ */
function GrupoEspecial({ titulo, hint, icono, clase = '', miembros, mostrarBadgeRol = false, soloLectura = false, onAccion }) {
  return (
    <details className={`cp-super-tree__group ${clase}`} open>
      <summary className="cp-super-tree__group-head">
        <span className="cp-super-tree__group-icon" aria-hidden="true">{icono}</span>
        <div className="cp-super-tree__group-title">
          <strong>{titulo}</strong>
          <div className="cp-super-tree__group-meta">
            {hint} · {miembros.length} usuario{miembros.length === 1 ? '' : 's'}
          </div>
        </div>
        <span className="cp-super-tree__group-toggle" aria-hidden="true">▾</span>
      </summary>

      <div className="cp-super-tree__group-body">
        <ul className="cp-super-tree__users">
          {miembros.map((u) => (
            <UserRow
              key={u.uid}
              user={u}
              mostrarBadgeRol={mostrarBadgeRol}
              soloLectura={soloLectura}
              onAccion={onAccion}
            />
          ))}
        </ul>
      </div>
    </details>
  );
}

/* ============================================================
   Fila de un usuario
   ============================================================ */
function iniciales(nombre) {
  if (!nombre) return '·';
  const partes = nombre.trim().split(/\s+/);
  const first = partes[0]?.[0] ?? '';
  const last = partes.length > 1 ? partes[partes.length - 1][0] : '';
  return (first + last).toUpperCase();
}

function UserRow({ user, mostrarBadgeAdmin = false, mostrarBadgeOwner = false, mostrarBadgeRol = false, soloLectura = false, onAccion }) {
  const nombre = nombreVisible(user);
  const puedeSuspender = !soloLectura && user.estado === ESTADOS_USUARIO.ACTIVO;
  const puedeReactivar = !soloLectura && (
    user.estado === ESTADOS_USUARIO.SUSPENDIDO
    || user.estado === ESTADOS_USUARIO.RETIRADO
  );

  return (
    <li className="cp-super-tree__user">
      <div className="cp-super-tree__user-main">
        <Avatar initials={iniciales(nombre)} size={32} />
        <div className="cp-super-tree__user-info">
          <div className="cp-super-tree__user-name">
            {nombre}
            {mostrarBadgeOwner && user.esOwner && (
              <span className="cp-admin-badge cp-admin-badge--owner">Owner</span>
            )}
            {mostrarBadgeAdmin && user.esAdminDelConsultorio && !user.esOwner && (
              <span className="cp-admin-badge cp-admin-badge--owner">Admin</span>
            )}
            {mostrarBadgeRol && (
              <span className="cp-admin-badge cp-admin-badge--you">{user.rol}</span>
            )}
            <BadgeEstado estado={user.estado} />
          </div>
          <div className="cp-super-tree__user-email">
            {user.email || <span style={{ fontStyle: 'italic' }}>sin email</span>}
            {user.createdAt?.toDate && (
              <span className="cp-super-tree__user-since">
                {' · creado '}{formatoFechaLarga.format(user.createdAt.toDate())}
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="cp-super-tree__user-actions">
        {puedeSuspender && (
          <button
            type="button"
            className="cp-prof-action cp-prof-action--danger"
            onClick={() => onAccion('suspender', user)}
          >
            Suspender
          </button>
        )}
        {puedeReactivar && (
          <button
            type="button"
            className="cp-prof-action"
            onClick={() => onAccion('reactivar', user)}
          >
            Reactivar
          </button>
        )}
      </div>
    </li>
  );
}

function BadgeEstado({ estado }) {
  switch (estado) {
    case ESTADOS_USUARIO.ACTIVO:
      return <Badge tone="success">Activo</Badge>;
    case ESTADOS_USUARIO.PENDIENTE:
      return <Badge tone="warning">Pendiente</Badge>;
    case ESTADOS_USUARIO.SUSPENDIDO:
      return <Badge tone="danger">Suspendido</Badge>;
    case ESTADOS_USUARIO.RETIRADO:
      return <Badge tone="neutral">Retirado</Badge>;
    default:
      return <Badge tone="neutral">{estado || '—'}</Badge>;
  }
}

/* ============================================================
   Modal de confirmacion (super-admin)
   ============================================================ */
function ConfirmarAccionSuperModal({ accion, submitting, onCancelar, onConfirmar }) {
  const nombre = nombreVisible(accion.user);
  const titulo = accion.tipo === 'suspender'
    ? `¿Suspender a ${nombre}?`
    : `¿Reactivar a ${nombre}?`;
  const desc = accion.tipo === 'suspender'
    ? 'El usuario va a perder el acceso al panel hasta que lo reactives. Sus datos se preservan.'
    : 'El usuario va a recuperar el acceso al panel con su rol y consultorio actuales.';
  const textoBoton = accion.tipo === 'suspender' ? 'Suspender' : 'Reactivar';

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
        <div className="cp-modal__sub">{desc}</div>

        <div className="cp-modal__actions">
          <Button variant="secondary" type="button" onClick={onCancelar} disabled={submitting}>
            Cancelar
          </Button>
          <Button
            variant={accion.tipo === 'suspender' ? 'danger' : 'primary'}
            type="button"
            onClick={onConfirmar}
            disabled={submitting}
          >
            {submitting ? <><Spinner size={14} /> Procesando…</> : textoBoton}
          </Button>
        </div>
      </div>
    </div>
  );
}
