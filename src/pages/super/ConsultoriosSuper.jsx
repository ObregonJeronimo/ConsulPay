import { useEffect, useMemo, useState } from 'react';

import Avatar from '../../components/ui/Avatar.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';
import Spinner from '../../components/ui/Spinner.jsx';

import { ESTADOS_USUARIO, formatoFechaLarga } from '../../lib/constants.js';
import {
  cargarMiembrosConsultorio,
  cargarPaginaConsultorios,
  comisionDeConsultorio,
  contarConsultorios,
  CONSULTORIOS_PAGE_SIZE,
  DEFAULTS_CONSULTORIO_SUPER,
  actualizarConfigSuper,
} from '../../lib/superadmin.js';
import {
  eliminarConsultorioSuper,
  eliminarProfesionalSuper,
  reautenticarConGoogle,
} from '../../lib/superadminDelete.js';
import {
  cargarPanoramaSuper,
  nombreVisible,
  reactivarUsuarioSuper,
  suspenderUsuarioSuper,
} from '../../lib/usuariosSuper.js';

import './ConsultoriosSuper.css';

export default function ConsultoriosSuper() {
  const [paginaActual, setPaginaActual] = useState(0);
  const [paginas, setPaginas] = useState([]);
  const [totalConsultorios, setTotalConsultorios] = useState(null);
  const [loadingPagina, setLoadingPagina] = useState(false);
  const [errorPagina, setErrorPagina] = useState('');

  const [panorama, setPanorama] = useState(null);
  const [loadingPanorama, setLoadingPanorama] = useState(true);

  const [editando, setEditando] = useState(null);
  const [eliminandoConsultorio, setEliminandoConsultorio] = useState(null);
  const [accionUsuario, setAccionUsuario] = useState(null);

  const [accionEnCurso, setAccionEnCurso] = useState(false);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');

  useEffect(() => {
    cargarTodo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function cargarTodo() {
    setError('');
    setLoadingPagina(true);
    setLoadingPanorama(true);
    try {
      const [primeraPagina, total, panoramaData] = await Promise.all([
        cargarPaginaConsultorios(),
        contarConsultorios(),
        cargarPanoramaSuper(),
      ]);
      setPaginas([primeraPagina]);
      setTotalConsultorios(total);
      setPanorama(panoramaData);
      setPaginaActual(0);
    } catch (err) {
      setError('No se pudo cargar el panorama: ' + err.message);
    } finally {
      setLoadingPagina(false);
      setLoadingPanorama(false);
    }
  }

  async function irAPagina(idx) {
    if (idx < 0) return;
    if (idx < paginas.length) {
      setPaginaActual(idx);
      return;
    }
    if (idx !== paginas.length) return;

    const lastDoc = paginas[paginas.length - 1]?.lastDoc;
    if (!lastDoc) return;

    setErrorPagina('');
    setLoadingPagina(true);
    try {
      const nueva = await cargarPaginaConsultorios({ lastDoc });
      setPaginas((prev) => [...prev, nueva]);
      setPaginaActual(idx);
    } catch (err) {
      setErrorPagina('No se pudo cargar la página: ' + err.message);
    } finally {
      setLoadingPagina(false);
    }
  }

  async function refrescar() {
    setPaginas([]);
    await cargarTodo();
  }

  async function refrescarPaginaActual() {
    setLoadingPagina(true);
    try {
      const primera = await cargarPaginaConsultorios();
      const total = await contarConsultorios();
      setPaginas([primera]);
      setPaginaActual(0);
      setTotalConsultorios(total);
    } catch (err) {
      setErrorPagina('No se pudo refrescar: ' + err.message);
    } finally {
      setLoadingPagina(false);
    }
  }

  async function ejecutarEdicion(cambios) {
    if (!editando) return;
    setAccionEnCurso(true);
    setError('');
    try {
      await actualizarConfigSuper(editando.id, cambios);
      setMensaje(`Configuración de ${editando.nombre} actualizada.`);
      setEditando(null);
      await refrescarPaginaActual();
      setTimeout(() => setMensaje(''), 4000);
    } catch (err) {
      setError(err.message || 'No se pudo guardar la configuración.');
    } finally {
      setAccionEnCurso(false);
    }
  }

  async function ejecutarEliminacionConsultorio() {
    if (!eliminandoConsultorio) return;
    setAccionEnCurso(true);
    setError('');
    try {
      const res = await eliminarConsultorioSuper(eliminandoConsultorio.id);
      const d = res.deleted || {};
      setMensaje(
        `Consultorio "${eliminandoConsultorio.nombre}" eliminado. ` +
        `Se borraron: ${d.usuarios || 0} usuarios, ${d.sesiones || 0} sesiones, ` +
        `${d.pacientes || 0} pacientes, ${d.pagos_consultorio || 0} pagos.`,
      );
      setEliminandoConsultorio(null);
      await refrescar();
      setTimeout(() => setMensaje(''), 8000);
    } catch (err) {
      setError(err.detalle?.error || err.message || 'No se pudo eliminar el consultorio.');
    } finally {
      setAccionEnCurso(false);
    }
  }

  async function ejecutarAccionUsuario() {
    if (!accionUsuario) return;
    setAccionEnCurso(true);
    setError('');
    try {
      if (accionUsuario.tipo === 'suspender') {
        await suspenderUsuarioSuper(accionUsuario.user.uid);
        setMensaje(`${nombreVisible(accionUsuario.user)} fue suspendido.`);
      } else if (accionUsuario.tipo === 'reactivar') {
        await reactivarUsuarioSuper(accionUsuario.user.uid);
        setMensaje(`${nombreVisible(accionUsuario.user)} fue reactivado.`);
      } else if (accionUsuario.tipo === 'retirar' || accionUsuario.tipo === 'eliminar') {
        if (!accionUsuario.consultorioId) {
          throw new Error('Falta consultorioId para esta acción.');
        }
        await eliminarProfesionalSuper({
          uid: accionUsuario.user.uid,
          consultorioId: accionUsuario.consultorioId,
          modo: accionUsuario.tipo,
        });
        const verbo = accionUsuario.tipo === 'retirar' ? 'retirado' : 'eliminado';
        setMensaje(`${nombreVisible(accionUsuario.user)} fue ${verbo}.`);
      }
      setAccionUsuario(null);
      const panoramaData = await cargarPanoramaSuper();
      setPanorama(panoramaData);
      await refrescarPaginaActual();
      setTimeout(() => setMensaje(''), 5000);
    } catch (err) {
      setError(err.detalle?.error || err.message || 'No se pudo ejecutar la acción.');
    } finally {
      setAccionEnCurso(false);
    }
  }

  const huerfanos = useMemo(() => {
    if (!panorama) return [];
    return panorama.usuarios
      .filter((u) => u.rol !== 'superadmin' && !u.consultorioId)
      .sort((a, b) => nombreVisible(a).localeCompare(nombreVisible(b), 'es'));
  }, [panorama]);

  const superadmins = useMemo(() => {
    if (!panorama) return [];
    return panorama.usuarios
      .filter((u) => u.rol === 'superadmin')
      .sort((a, b) => nombreVisible(a).localeCompare(nombreVisible(b), 'es'));
  }, [panorama]);

  if (loadingPagina && loadingPanorama && paginas.length === 0) {
    return (
      <div className="cp-super-tree">
        <div style={{ padding: 60, display: 'flex', justifyContent: 'center' }}>
          <Spinner size={24} label="Cargando panorama…" />
        </div>
      </div>
    );
  }

  const paginaItems = paginas[paginaActual]?.items ?? [];
  const hayMasPaginas = paginas[paginaActual]?.hayMas ?? false;
  const totalPaginas = totalConsultorios != null
    ? Math.ceil(totalConsultorios / CONSULTORIOS_PAGE_SIZE)
    : null;

  return (
    <div className="cp-super-tree">
      <header className="cp-page-header">
        <div>
          <h1 className="cp-page-title">Consultorios y usuarios</h1>
          <p className="cp-page-sub">
            {totalConsultorios != null
              ? `${totalConsultorios} consultorio${totalConsultorios === 1 ? '' : 's'} en la plataforma.`
              : 'Cargando…'}
            {' '}Editá comisiones, eliminá consultorios y gestioná profesionales.
          </p>
        </div>
        <Button variant="secondary" onClick={refrescar} disabled={loadingPagina || loadingPanorama}>
          {loadingPagina || loadingPanorama
            ? <><Spinner size={14} /> Refrescando…</>
            : 'Refrescar'}
        </Button>
      </header>

      {error && <div className="cp-config-error">{error}</div>}
      {mensaje && <div className="cp-config-ok">{mensaje}</div>}
      {errorPagina && <div className="cp-config-error">{errorPagina}</div>}

      <section className="cp-super-section">
        <div className="cp-super-section__head">
          <h2 className="cp-super-section__title">Consultorios</h2>
          {totalConsultorios != null && totalConsultorios > 0 && (
            <span className="cp-super-section__meta">
              Página {paginaActual + 1}
              {totalPaginas ? ` de ${totalPaginas}` : ''}
            </span>
          )}
        </div>

        {paginaItems.length === 0 && !loadingPagina && (
          <div className="cp-super-tree__empty">
            No hay consultorios en la plataforma todavía.
          </div>
        )}

        {paginaItems.map((cons) => (
          <ConsultorioCard
            key={cons.id}
            consultorio={cons}
            onEditar={() => { setError(''); setEditando(cons); }}
            onEliminarConsultorio={() => { setError(''); setEliminandoConsultorio(cons); }}
            onAccionUsuario={(tipo, user, consultorioId) =>
              setAccionUsuario({ tipo, user, consultorioId })
            }
          />
        ))}

        {(paginaActual > 0 || hayMasPaginas) && (
          <div className="cp-paginator">
            <Button
              variant="secondary"
              type="button"
              onClick={() => irAPagina(paginaActual - 1)}
              disabled={paginaActual === 0 || loadingPagina}
            >
              ← Anterior
            </Button>
            <span className="cp-paginator__label">
              {loadingPagina
                ? <><Spinner size={12} /> Cargando…</>
                : `Página ${paginaActual + 1}${totalPaginas ? ` de ${totalPaginas}` : ''}`}
            </span>
            <Button
              variant="secondary"
              type="button"
              onClick={() => irAPagina(paginaActual + 1)}
              disabled={!hayMasPaginas || loadingPagina}
            >
              Siguiente →
            </Button>
          </div>
        )}
      </section>

      {huerfanos.length > 0 && (
        <section className="cp-super-section cp-super-section--warn">
          <div className="cp-super-section__head">
            <h2 className="cp-super-section__title">⚠️ Sin consultorio asignado</h2>
            <span className="cp-super-section__meta">
              {huerfanos.length} usuario{huerfanos.length === 1 ? '' : 's'}
            </span>
          </div>
          <p className="cp-super-section__hint">
            Usuarios autenticados que todavía no aceptaron una invitación o
            quedaron huérfanos por error.
          </p>
          <ul className="cp-super-tree__users">
            {huerfanos.map((u) => (
              <UserRow
                key={u.uid}
                user={u}
                mostrarBadgeRol
                onAccion={(tipo, user) => setAccionUsuario({ tipo, user })}
              />
            ))}
          </ul>
        </section>
      )}

      {superadmins.length > 0 && (
        <section className="cp-super-section">
          <div className="cp-super-section__head">
            <h2 className="cp-super-section__title">👑 Superadmins</h2>
            <span className="cp-super-section__meta">
              {superadmins.length} usuario{superadmins.length === 1 ? '' : 's'}
            </span>
          </div>
          <p className="cp-super-section__hint">
            Operadores de la plataforma ConsulPay.
          </p>
          <ul className="cp-super-tree__users">
            {superadmins.map((u) => (
              <UserRow
                key={u.uid}
                user={u}
                mostrarBadgeRol
                soloLectura
                onAccion={() => {}}
              />
            ))}
          </ul>
        </section>
      )}

      {editando && (
        <EditarConsultorioModal
          consultorio={editando}
          submitting={accionEnCurso}
          onCancelar={() => !accionEnCurso && setEditando(null)}
          onConfirmar={ejecutarEdicion}
        />
      )}

      {eliminandoConsultorio && (
        <EliminarConsultorioModal
          consultorio={eliminandoConsultorio}
          submitting={accionEnCurso}
          onCancelar={() => !accionEnCurso && setEliminandoConsultorio(null)}
          onConfirmar={ejecutarEliminacionConsultorio}
        />
      )}

      {accionUsuario && (
        <AccionUsuarioModal
          accion={accionUsuario}
          submitting={accionEnCurso}
          onCancelar={() => !accionEnCurso && setAccionUsuario(null)}
          onConfirmar={ejecutarAccionUsuario}
        />
      )}
    </div>
  );
}

function ConsultorioCard({ consultorio, onEditar, onEliminarConsultorio, onAccionUsuario }) {
  const [expandido, setExpandido] = useState(false);
  const [miembros, setMiembros] = useState(null);
  const [loadingMiembros, setLoadingMiembros] = useState(false);

  async function toggle() {
    const nuevoExpandido = !expandido;
    setExpandido(nuevoExpandido);
    if (nuevoExpandido && miembros === null) {
      setLoadingMiembros(true);
      try {
        const data = await cargarMiembrosConsultorio(consultorio.id);
        setMiembros(data);
      } catch (err) {
        console.error('Error cargando miembros:', err);
        setMiembros([]);
      } finally {
        setLoadingMiembros(false);
      }
    }
  }

  const comision = comisionDeConsultorio(consultorio);
  const planLabel = consultorio.plan === 'pro' ? 'Pro' : 'Free';
  const planProDeshabilitado = consultorio.puedeVerPlanPro === false;

  const tieneSuscripcionActiva = consultorio.subscription && (
    consultorio.subscription.status === 'authorized'
    || consultorio.subscription.status === 'pending_authorization'
    || consultorio.subscription.status === 'in_grace'
  );
  const puedeEliminar = consultorio.plan === 'free' && !tieneSuscripcionActiva;

  const miembrosOrdenados = useMemo(() => {
    if (!miembros) return [];
    const adminUids = new Set(consultorio.adminUids || []);
    return miembros.map((m) => ({
      ...m,
      esAdminDelConsultorio: adminUids.has(m.uid),
      esOwner: m.uid === consultorio.ownerUid,
    })).sort((a, b) => {
      const peso = (m) => {
        if (m.esOwner) return 0;
        if (m.esAdminDelConsultorio) return 1;
        if (m.estado === 'activo') return 2;
        if (m.estado === 'pendiente') return 3;
        return 4;
      };
      const pa = peso(a);
      const pb = peso(b);
      if (pa !== pb) return pa - pb;
      return nombreVisible(a).localeCompare(nombreVisible(b), 'es');
    });
  }, [miembros, consultorio.adminUids, consultorio.ownerUid]);

  return (
    <div className="cp-cons-card">
      <div className="cp-cons-card__head">
        <button
          type="button"
          className="cp-cons-card__toggle"
          onClick={toggle}
          aria-expanded={expandido}
          aria-label={expandido ? 'Contraer miembros' : 'Ver miembros del consultorio'}
        >
          <span className="cp-cons-card__toggle-icon" aria-hidden="true">
            {expandido ? '▾' : '▸'}
          </span>
        </button>
        <div className="cp-cons-card__icon" aria-hidden="true">🏢</div>
        <div className="cp-cons-card__info">
          <div className="cp-cons-card__title">
            {consultorio.nombre || '(sin nombre)'}
            <span className={`cp-cons-card__plan-badge cp-cons-card__plan-badge--${consultorio.plan || 'free'}`}>
              {planLabel}
            </span>
            {planProDeshabilitado && (
              <span className="cp-cons-card__plan-badge cp-cons-card__plan-badge--off"
                title="El consultorio no puede ver/comprar el Plan Pro">
                Pro deshabilitado
              </span>
            )}
          </div>
          <div className="cp-cons-card__meta">
            <span>
              Comisión:{' '}
              <strong>
                {Number.isFinite(comision.pct) ? `${comision.pct}%` : '—'}
              </strong>
              {comision.etiqueta === 'Legacy' && (
                <span className="cp-cons-card__meta-hint" title="Configuración legacy. Editá para migrar a comisiones por plan.">
                  {' '}(legacy)
                </span>
              )}
            </span>
            <span className="cp-cons-card__meta-sep">·</span>
            <span>
              ID: <code>{consultorio.id.slice(0, 8)}…</code>
            </span>
            <span className="cp-cons-card__meta-sep">·</span>
            <button
              type="button"
              className="cp-cons-card__expand-link"
              onClick={toggle}
            >
              {expandido ? 'Ocultar miembros' : 'Ver miembros'}
            </button>
          </div>
        </div>
        <div className="cp-cons-card__actions">
          <Button variant="secondary" type="button" onClick={onEditar}>
            Editar configuración
          </Button>
        </div>
      </div>

      {expandido && (
        <div className="cp-cons-card__body">
          {loadingMiembros ? (
            <div style={{ padding: 20, display: 'flex', justifyContent: 'center' }}>
              <Spinner size={16} label="Cargando miembros…" />
            </div>
          ) : miembrosOrdenados.length === 0 ? (
            <div className="cp-super-tree__empty">
              Este consultorio no tiene miembros (caso raro).
            </div>
          ) : (
            <ul className="cp-super-tree__users">
              {miembrosOrdenados.map((u) => (
                <UserRow
                  key={u.uid}
                  user={u}
                  mostrarBadgeAdmin
                  mostrarBadgeOwner
                  consultorioId={consultorio.id}
                  permitirRetirarEliminar
                  onAccion={onAccionUsuario}
                />
              ))}
            </ul>
          )}

          <DangerZone
            consultorio={consultorio}
            puedeEliminar={puedeEliminar}
            tieneSuscripcionActiva={tieneSuscripcionActiva}
            onEliminar={onEliminarConsultorio}
          />
        </div>
      )}
    </div>
  );
}

function DangerZone({ consultorio, puedeEliminar, tieneSuscripcionActiva, onEliminar }) {
  const [abierto, setAbierto] = useState(false);

  let razonNoEliminar = null;
  if (!puedeEliminar) {
    if (consultorio.plan === 'pro') {
      razonNoEliminar = 'Este consultorio tiene Plan Pro activo. Pediile al dueño que cancele la suscripción primero.';
    } else if (tieneSuscripcionActiva) {
      razonNoEliminar = 'Este consultorio tiene una suscripción pendiente o en período de gracia. Pediile al dueño que la cancele primero.';
    }
  }

  return (
    <div className="cp-danger-zone">
      <button
        type="button"
        className="cp-danger-zone__head"
        onClick={() => setAbierto((p) => !p)}
        aria-expanded={abierto}
      >
        <span className="cp-danger-zone__icon" aria-hidden="true">⚠️</span>
        <span className="cp-danger-zone__title">Zona peligrosa</span>
        <span className="cp-danger-zone__toggle" aria-hidden="true">
          {abierto ? '▾' : '▸'}
        </span>
      </button>

      {abierto && (
        <div className="cp-danger-zone__body">
          <div className="cp-danger-zone__row">
            <div className="cp-danger-zone__info">
              <div className="cp-danger-zone__row-title">
                Eliminar consultorio
              </div>
              <div className="cp-danger-zone__row-desc">
                Borra el consultorio, todos sus pacientes, sesiones, pagos
                y profesionales asociados.{' '}
                <strong>Esta acción es irreversible.</strong>
              </div>
              {razonNoEliminar && (
                <div className="cp-danger-zone__warning">
                  {razonNoEliminar}
                </div>
              )}
            </div>
            <Button
              variant="danger"
              type="button"
              onClick={onEliminar}
              disabled={!puedeEliminar}
            >
              Eliminar consultorio
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function iniciales(nombre) {
  if (!nombre) return '·';
  const partes = nombre.trim().split(/\s+/);
  const first = partes[0]?.[0] ?? '';
  const last = partes.length > 1 ? partes[partes.length - 1][0] : '';
  return (first + last).toUpperCase();
}

function UserRow({
  user,
  mostrarBadgeAdmin = false,
  mostrarBadgeOwner = false,
  mostrarBadgeRol = false,
  soloLectura = false,
  consultorioId = null,
  permitirRetirarEliminar = false,
  onAccion,
}) {
  const nombre = nombreVisible(user);
  const puedeSuspender = !soloLectura && user.estado === ESTADOS_USUARIO.ACTIVO;
  const puedeReactivar = !soloLectura && (
    user.estado === ESTADOS_USUARIO.SUSPENDIDO
    || user.estado === ESTADOS_USUARIO.RETIRADO
  );
  const puedeRetirarEliminar = permitirRetirarEliminar
    && consultorioId
    && !user.esOwner
    && !soloLectura;

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
            className="cp-prof-action"
            onClick={() => onAccion('suspender', user, consultorioId)}
          >
            Suspender
          </button>
        )}
        {puedeReactivar && (
          <button
            type="button"
            className="cp-prof-action"
            onClick={() => onAccion('reactivar', user, consultorioId)}
          >
            Reactivar
          </button>
        )}
        {puedeRetirarEliminar && user.estado !== ESTADOS_USUARIO.RETIRADO && (
          <button
            type="button"
            className="cp-prof-action cp-prof-action--warn"
            onClick={() => onAccion('retirar', user, consultorioId)}
            title="Retirar del consultorio (soft delete - mantiene registros)"
          >
            Retirar
          </button>
        )}
        {puedeRetirarEliminar && (
          <button
            type="button"
            className="cp-prof-action cp-prof-action--danger"
            onClick={() => onAccion('eliminar', user, consultorioId)}
            title="Eliminar definitivamente (hard delete)"
          >
            Eliminar
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

function EditarConsultorioModal({ consultorio, submitting, onCancelar, onConfirmar }) {
  const valoresIniciales = useMemo(() => {
    const tieneNuevos = (
      Number.isFinite(Number(consultorio.comisionFree))
      && Number.isFinite(Number(consultorio.comisionPro))
    );
    if (tieneNuevos) {
      return {
        comisionFree: Number(consultorio.comisionFree),
        comisionPro: Number(consultorio.comisionPro),
        puedeVerPlanPro: consultorio.puedeVerPlanPro !== false,
      };
    }
    const legacy = Number(consultorio.comisionConsulpay);
    const tieneLegacy = Number.isFinite(legacy) && legacy >= 0 && legacy <= 100;
    return {
      comisionFree: consultorio.plan === 'free' && tieneLegacy
        ? legacy
        : DEFAULTS_CONSULTORIO_SUPER.comisionFree,
      comisionPro: consultorio.plan === 'pro' && tieneLegacy
        ? legacy
        : DEFAULTS_CONSULTORIO_SUPER.comisionPro,
      puedeVerPlanPro: consultorio.puedeVerPlanPro !== false,
    };
  }, [consultorio]);

  const [comisionFree, setComisionFree] = useState(String(valoresIniciales.comisionFree));
  const [comisionPro, setComisionPro] = useState(String(valoresIniciales.comisionPro));
  const [puedeVerPlanPro, setPuedeVerPlanPro] = useState(valoresIniciales.puedeVerPlanPro);
  const [errorLocal, setErrorLocal] = useState('');

  function validar() {
    const cF = Number(comisionFree);
    const cP = Number(comisionPro);
    if (!Number.isFinite(cF) || cF < 0 || cF > 100) {
      return 'La comisión Free debe ser un número entre 0 y 100.';
    }
    if (!Number.isFinite(cP) || cP < 0 || cP > 100) {
      return 'La comisión Pro debe ser un número entre 0 y 100.';
    }
    return null;
  }

  function handleSubmit(e) {
    e.preventDefault();
    const err = validar();
    if (err) {
      setErrorLocal(err);
      return;
    }
    setErrorLocal('');
    onConfirmar({
      comisionFree: Number(comisionFree),
      comisionPro: Number(comisionPro),
      puedeVerPlanPro,
    });
  }

  const huboCambios = useMemo(() => {
    return (
      Number(comisionFree) !== valoresIniciales.comisionFree
      || Number(comisionPro) !== valoresIniciales.comisionPro
      || puedeVerPlanPro !== valoresIniciales.puedeVerPlanPro
    );
  }, [comisionFree, comisionPro, puedeVerPlanPro, valoresIniciales]);

  return (
    <div className="cp-modal-overlay" onClick={onCancelar}>
      <div className="cp-modal cp-modal-edit-cons" onClick={(e) => e.stopPropagation()}>
        <button
          className="cp-modal__close"
          onClick={onCancelar}
          aria-label="Cerrar"
          disabled={submitting}
        >×</button>

        <h2 className="cp-modal__title">Editar configuración</h2>
        <div className="cp-modal__sub">
          <strong>{consultorio.nombre || '(sin nombre)'}</strong>
          {' · '}
          Plan actual: {consultorio.plan === 'pro' ? 'Pro' : 'Free'}
        </div>

        <form className="cp-modal__form" onSubmit={handleSubmit}>
          <div className="cp-modal-edit-cons__section">
            <h3 className="cp-modal-edit-cons__section-title">Comisiones</h3>
            <p className="cp-modal-edit-cons__section-hint">
              % que ConsulPay cobra sobre cada pago. Se aplica según el plan
              activo del consultorio. <strong>0% es válido</strong> para casos
              de cortesía.
            </p>

            <div className="cp-config-row">
              <Input
                name="comisionFree"
                type="number"
                label="Comisión Plan Free"
                value={comisionFree}
                onChange={(e) => setComisionFree(e.target.value)}
                min="0"
                max="100"
                step="0.5"
                disabled={submitting}
                hint={`Default: ${DEFAULTS_CONSULTORIO_SUPER.comisionFree}%`}
              />
              <Input
                name="comisionPro"
                type="number"
                label="Comisión Plan Pro"
                value={comisionPro}
                onChange={(e) => setComisionPro(e.target.value)}
                min="0"
                max="100"
                step="0.5"
                disabled={submitting}
                hint={`Default: ${DEFAULTS_CONSULTORIO_SUPER.comisionPro}%`}
              />
            </div>
          </div>

          <div className="cp-modal-edit-cons__section">
            <h3 className="cp-modal-edit-cons__section-title">Visibilidad del Plan Pro</h3>
            <p className="cp-modal-edit-cons__section-hint">
              Si lo deshabilitás, el consultorio no va a ver la pestaña "Plan"
              en su Configuración y no va a poder contratar Pro.
              {consultorio.plan === 'pro' && consultorio.subscription?.status === 'authorized' && (
                <>
                  {' '}
                  <strong>Atención:</strong> este consultorio ya está en Pro con suscripción activa.
                  Su suscripción actual sigue funcionando hasta el próximo vencimiento natural.
                </>
              )}
            </p>

            <label className="cp-toggle-row">
              <button
                type="button"
                className={`cc-toggle ${puedeVerPlanPro ? 'cc-toggle--on' : ''}`}
                onClick={() => setPuedeVerPlanPro(!puedeVerPlanPro)}
                aria-pressed={puedeVerPlanPro}
                disabled={submitting}
              >
                <span className="cc-toggle__thumb" />
              </button>
              <div className="cp-toggle-row__label">
                <strong>{puedeVerPlanPro ? 'Habilitado' : 'Deshabilitado'}</strong>
                <span>
                  {puedeVerPlanPro
                    ? 'El consultorio ve la pestaña "Plan" y puede contratar Pro.'
                    : 'El consultorio NO ve la pestaña "Plan".'}
                </span>
              </div>
            </label>
          </div>

          {errorLocal && <div className="cp-modal__error">{errorLocal}</div>}

          <div className="cp-modal__actions">
            <Button variant="secondary" type="button" onClick={onCancelar} disabled={submitting}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              type="submit"
              disabled={submitting || !huboCambios}
            >
              {submitting
                ? <><Spinner size={14} /> Guardando…</>
                : 'Guardar cambios'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EliminarConsultorioModal({ consultorio, submitting, onCancelar, onConfirmar }) {
  const [textoConfirmacion, setTextoConfirmacion] = useState('');
  const [reautenticando, setReautenticando] = useState(false);
  const [errorLocal, setErrorLocal] = useState('');

  const nombreEsperado = (consultorio.nombre || '').trim();
  const nombreCoincide = textoConfirmacion.trim() === nombreEsperado;

  async function handleConfirmar() {
    if (!nombreCoincide || submitting || reautenticando) return;
    setErrorLocal('');
    setReautenticando(true);
    try {
      await reautenticarConGoogle();
      setReautenticando(false);
      onConfirmar();
    } catch (err) {
      setReautenticando(false);
      if (err.codigo === 'CANCELADO') return;
      setErrorLocal(err.message || 'No se pudo confirmar tu identidad.');
    }
  }

  const procesando = submitting || reautenticando;

  return (
    <div className="cp-modal-overlay" onClick={onCancelar}>
      <div className="cp-modal cp-modal--danger" onClick={(e) => e.stopPropagation()}>
        <button
          className="cp-modal__close"
          onClick={onCancelar}
          aria-label="Cerrar"
          disabled={procesando}
        >×</button>

        <h2 className="cp-modal__title">⚠️ Eliminar consultorio</h2>

        <div className="cp-modal__sub">
          <p style={{ margin: '0 0 12px' }}>
            Vas a eliminar <strong>{consultorio.nombre || '(sin nombre)'}</strong> y todos sus datos
            asociados:
          </p>
          <ul style={{ margin: '0 0 12px 20px', fontSize: 13.5, color: 'var(--cp-text-muted)' }}>
            <li>Todos los profesionales y administradores</li>
            <li>Todos los pacientes</li>
            <li>Todas las sesiones y pagos del histórico</li>
            <li>Configuración del consultorio (Mercado Pago, métodos de pago, etc.)</li>
          </ul>
          <p style={{ margin: '0 0 12px', color: 'var(--cp-danger)', fontWeight: 500 }}>
            Esta acción es irreversible.
          </p>
          <p style={{ margin: 0, fontSize: 13.5 }}>
            Las cuentas de Firebase Auth de los usuarios <strong>no</strong> se eliminan —
            siguen pudiendo loguearse, pero quedarán como huérfanas hasta ser invitadas a
            otro consultorio.
          </p>
        </div>

        <div className="cp-modal-danger__confirm">
          <label className="cp-modal-danger__label">
            Para confirmar, escribí el nombre del consultorio:{' '}
            <strong>{nombreEsperado}</strong>
          </label>
          <Input
            name="confirm"
            value={textoConfirmacion}
            onChange={(e) => setTextoConfirmacion(e.target.value)}
            placeholder={nombreEsperado}
            disabled={procesando}
            autoFocus
          />
        </div>

        {errorLocal && <div className="cp-modal__error">{errorLocal}</div>}

        <div className="cp-modal__actions">
          <Button variant="secondary" type="button" onClick={onCancelar} disabled={procesando}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            type="button"
            onClick={handleConfirmar}
            disabled={!nombreCoincide || procesando}
          >
            {reautenticando
              ? <><Spinner size={14} /> Confirmando con Google…</>
              : submitting
                ? <><Spinner size={14} /> Eliminando…</>
                : 'Confirmar identidad y eliminar'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function AccionUsuarioModal({ accion, submitting, onCancelar, onConfirmar }) {
  const [reautenticando, setReautenticando] = useState(false);
  const [errorLocal, setErrorLocal] = useState('');

  const nombre = nombreVisible(accion.user);
  const requiereReauth = accion.tipo === 'retirar' || accion.tipo === 'eliminar';

  let titulo, desc, textoBoton, variante;
  switch (accion.tipo) {
    case 'suspender':
      titulo = `¿Suspender a ${nombre}?`;
      desc = 'El usuario va a perder el acceso al panel hasta que lo reactives. Sus datos se preservan y la acción es totalmente reversible.';
      textoBoton = 'Suspender';
      variante = 'danger';
      break;
    case 'reactivar':
      titulo = `¿Reactivar a ${nombre}?`;
      desc = 'El usuario va a recuperar el acceso al panel con su rol y consultorio actuales.';
      textoBoton = 'Reactivar';
      variante = 'primary';
      break;
    case 'retirar':
      titulo = `¿Retirar a ${nombre} del consultorio?`;
      desc = 'El usuario pasa a estado "retirado" y pierde el acceso. Sus sesiones y registros históricos se mantienen. Esta acción es reversible (podés reactivarlo después).';
      textoBoton = 'Retirar del consultorio';
      variante = 'danger';
      break;
    case 'eliminar':
      titulo = `⚠️ ¿Eliminar definitivamente a ${nombre}?`;
      desc = 'Se borra el doc del usuario completamente. Sus sesiones históricas se mantienen pero quedarán sin doc asociado (la UI mostrará "Profesional eliminado"). La cuenta de Firebase Auth NO se elimina — el usuario podría volver a loguearse pero quedaría como huérfano sin consultorio.';
      textoBoton = 'Eliminar definitivamente';
      variante = 'danger';
      break;
    default:
      titulo = '';
      desc = '';
      textoBoton = 'Confirmar';
      variante = 'primary';
  }

  async function handleConfirmar() {
    if (submitting || reautenticando) return;
    setErrorLocal('');

    if (requiereReauth) {
      setReautenticando(true);
      try {
        await reautenticarConGoogle();
        setReautenticando(false);
        onConfirmar();
      } catch (err) {
        setReautenticando(false);
        if (err.codigo === 'CANCELADO') return;
        setErrorLocal(err.message || 'No se pudo confirmar tu identidad.');
      }
    } else {
      onConfirmar();
    }
  }

  const procesando = submitting || reautenticando;

  return (
    <div className="cp-modal-overlay" onClick={onCancelar}>
      <div className={`cp-modal ${accion.tipo === 'eliminar' ? 'cp-modal--danger' : 'cp-modal--confirm-admin'}`}
        onClick={(e) => e.stopPropagation()}>
        <button
          className="cp-modal__close"
          onClick={onCancelar}
          aria-label="Cerrar"
          disabled={procesando}
        >×</button>

        <h2 className="cp-modal__title">{titulo}</h2>
        <div className="cp-modal__sub">
          {desc}
          {' '}
          <span style={{ display: 'block', marginTop: 8, fontSize: 13, color: 'var(--cp-text-muted)' }}>
            Email: <strong>{accion.user.email || '(sin email)'}</strong>
          </span>
        </div>

        {errorLocal && <div className="cp-modal__error">{errorLocal}</div>}

        <div className="cp-modal__actions">
          <Button variant="secondary" type="button" onClick={onCancelar} disabled={procesando}>
            Cancelar
          </Button>
          <Button variant={variante} type="button" onClick={handleConfirmar} disabled={procesando}>
            {reautenticando
              ? <><Spinner size={14} /> Confirmando con Google…</>
              : submitting
                ? <><Spinner size={14} /> Procesando…</>
                : textoBoton}
          </Button>
        </div>
      </div>
    </div>
  );
}
