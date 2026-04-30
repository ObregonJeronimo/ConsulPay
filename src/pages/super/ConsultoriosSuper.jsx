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
  cargarPanoramaSuper,
  nombreVisible,
  reactivarUsuarioSuper,
  suspenderUsuarioSuper,
} from '../../lib/usuariosSuper.js';

import './ConsultoriosSuper.css';

/**
 * Panel del superadmin: "Consultorios y usuarios".
 *
 * Estructura:
 *   1. CONSULTORIOS — paginados de a 5. Cada fila tiene:
 *        - Header del consultorio con nombre, plan, % comision actual,
 *          flag puedeVerPlanPro, y boton "Editar configuracion".
 *        - Al expandir: lista de miembros del consultorio + acciones
 *          (suspender/reactivar) sobre cada uno.
 *   2. SIN CONSULTORIO ASIGNADO — usuarios huerfanos (no paginado,
 *      se ven todos juntos abajo). Util para detectar problemas.
 *   3. SUPERADMINS — operadores (no paginado). Solo lectura.
 *
 * Decision: solo paginamos los CONSULTORIOS porque son los que pueden
 * crecer mucho (eventualmente cientos). Huerfanos y superadmins son
 * pocos por naturaleza, los mostramos todos.
 *
 * Por separacion de concerns:
 *   - lib/superadmin.js     -> paginacion + actualizar config
 *   - lib/usuariosSuper.js  -> panorama batch + acciones suspender/reactivar
 */
export default function ConsultoriosSuper() {
  // ---- Estado de paginacion de consultorios ----
  const [paginaActual, setPaginaActual] = useState(0); // 0-indexed
  const [paginas, setPaginas] = useState([]); // array de { items, lastDoc, hayMas }
  const [totalConsultorios, setTotalConsultorios] = useState(null);
  const [loadingPagina, setLoadingPagina] = useState(false);
  const [errorPagina, setErrorPagina] = useState('');

  // ---- Estado del panorama de huerfanos + superadmins ----
  // Los traemos UNA SOLA VEZ con cargarPanoramaSuper() y filtramos
  // localmente. No paginamos.
  const [panorama, setPanorama] = useState(null);
  const [loadingPanorama, setLoadingPanorama] = useState(true);

  // ---- Estado de modales y feedback ----
  const [editando, setEditando] = useState(null); // consultorio que se esta editando
  const [accionUsuario, setAccionUsuario] = useState(null); // {tipo, user}
  const [accionEnCurso, setAccionEnCurso] = useState(false);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');

  /* ---------- Carga inicial: total + primera pagina + panorama ---------- */

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

  /* ---------- Navegacion entre paginas ---------- */

  // Las paginas que ya cargamos quedan cacheadas en `paginas[]`. Si
  // el user va y vuelve, no las pedimos de nuevo. Si avanza a una
  // pagina nueva, la cargamos y agregamos al cache.
  async function irAPagina(idx) {
    if (idx < 0) return;
    if (idx < paginas.length) {
      setPaginaActual(idx);
      return;
    }
    // idx === paginas.length: avanzar a la siguiente pagina nueva
    if (idx !== paginas.length) return; // no podes saltear paginas

    const lastDoc = paginas[paginas.length - 1]?.lastDoc;
    if (!lastDoc) return; // no hay cursor -> no podemos avanzar

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

  /* ---------- Refrescar todo (despues de editar) ---------- */

  async function refrescar() {
    // Reseteamos paginas y empezamos de nuevo desde la primera. Hace
    // que la edicion del consultorio se vea reflejada en la lista.
    setPaginas([]);
    await cargarTodo();
  }

  /* ---------- Editar config de un consultorio ---------- */

  async function ejecutarEdicion(cambios) {
    if (!editando) return;
    setAccionEnCurso(true);
    setError('');
    try {
      await actualizarConfigSuper(editando.id, cambios);
      setMensaje(`Configuración de ${editando.nombre} actualizada.`);
      setEditando(null);
      // Refrescamos solo la pagina actual para mostrar los cambios.
      await refrescarPaginaActual();
      setTimeout(() => setMensaje(''), 4000);
    } catch (err) {
      setError(err.message || 'No se pudo guardar la configuración.');
    } finally {
      setAccionEnCurso(false);
    }
  }

  // Refresca SOLO la primera pagina (volvemos al inicio). Es mas
  // simple que intentar refrescar la pagina N en el medio: si el
  // user editaba un consultorio en la pagina 3, despues de guardar
  // queda en la pagina 1 con los cambios visibles si caen ahi.
  // Trade-off aceptable: editar es poco frecuente y es claro lo
  // que pasa.
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

  /* ---------- Acciones sobre usuarios (suspender / reactivar) ---------- */

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
      }
      setAccionUsuario(null);
      // Refrescamos el panorama (huerfanos/superadmins) que es donde
      // viene el estado del user. Los miembros de un consultorio se
      // recargan al re-expandir la fila (ver ConsultorioGrupo).
      const panoramaData = await cargarPanoramaSuper();
      setPanorama(panoramaData);
      setTimeout(() => setMensaje(''), 4000);
    } catch (err) {
      setError(err.message || 'No se pudo ejecutar la acción.');
    } finally {
      setAccionEnCurso(false);
    }
  }

  /* ---------- Render ---------- */

  // Datos derivados del panorama
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
            {' '}Editá comisiones y visibilidad del Plan Pro por consultorio.
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

      {/* ---------- LISTA PAGINADA DE CONSULTORIOS ---------- */}
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
            onAccionUsuario={(tipo, user) => setAccionUsuario({ tipo, user })}
          />
        ))}

        {/* Paginador */}
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

      {/* ---------- HUERFANOS (sin paginar) ---------- */}
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

      {/* ---------- SUPERADMINS (sin paginar, solo lectura) ---------- */}
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

      {/* ---------- MODALES ---------- */}
      {editando && (
        <EditarConsultorioModal
          consultorio={editando}
          submitting={accionEnCurso}
          onCancelar={() => !accionEnCurso && setEditando(null)}
          onConfirmar={ejecutarEdicion}
        />
      )}

      {accionUsuario && (
        <ConfirmarAccionSuperModal
          accion={accionUsuario}
          submitting={accionEnCurso}
          onCancelar={() => !accionEnCurso && setAccionUsuario(null)}
          onConfirmar={ejecutarAccionUsuario}
        />
      )}
    </div>
  );
}

/* ============================================================
   ConsultorioCard — fila expandible con info + acciones
   ----------------------------------------------------------------
   Muestra el header SIEMPRE visible (con boton Editar) y el body
   con miembros se carga al expandir (lazy). Esto es importante para
   no traer miembros de los 5 consultorios todos juntos al cargar
   la pagina — solo se traen cuando el user expande.
   ============================================================ */
function ConsultorioCard({ consultorio, onEditar, onAccionUsuario }) {
  const [expandido, setExpandido] = useState(false);
  const [miembros, setMiembros] = useState(null);
  const [loadingMiembros, setLoadingMiembros] = useState(false);

  // Cargar miembros la primera vez que se expande, NO live.
  // Si el user contrae y vuelve a expandir, no recargamos (los datos
  // ya estan en memoria). Para forzar refresh, usar el boton
  // "Refrescar" del header de la pagina.
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

  // Enriquecer miembros con esOwner / esAdmin para el badge
  const miembrosOrdenados = useMemo(() => {
    if (!miembros) return [];
    const adminUids = new Set(consultorio.adminUids || []);
    return miembros.map((m) => ({
      ...m,
      esAdminDelConsultorio: adminUids.has(m.uid),
      esOwner: m.uid === consultorio.ownerUid,
    })).sort((a, b) => {
      // owner primero, luego admins, luego activos, luego resto
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
          aria-label={expandido ? 'Contraer' : 'Expandir'}
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
                <span className="cp-cons-card__meta-hint" title="El consultorio no tiene los campos nuevos comisionFree/Pro definidos. Esta usando el campo viejo comisionConsulpay como fallback. Editalo desde aca para migrar a los campos nuevos.">
                  {' '}(legacy)
                </span>
              )}
            </span>
            <span className="cp-cons-card__meta-sep">·</span>
            <span>
              ID: <code>{consultorio.id.slice(0, 8)}…</code>
            </span>
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
                  onAccion={onAccionUsuario}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   UserRow — fila de un usuario con acciones
   ============================================================ */
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
  onAccion,
}) {
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
   EditarConsultorioModal
   ----------------------------------------------------------------
   3 campos editables: comisionFree, comisionPro, puedeVerPlanPro.
   - Validacion de los % en el cliente (0-100, valido) ademas de
     la del backend en lib/superadmin.js.
   - Si el consultorio no tiene comisionFree/Pro definidos
     (consultorios viejos), pre-rellenamos con los defaults
     (6% / 2%) para que el super sepa que valores se aplicarian.
   - Muestra info contextual: plan actual, % comision en uso, etc.
   ============================================================ */
function EditarConsultorioModal({ consultorio, submitting, onCancelar, onConfirmar }) {
  // Defaults: si el consultorio ya tiene los campos nuevos, usarlos.
  // Si no, fallback a los defaults del modulo + (si hay comisionConsulpay
  // legacy y el plan coincide, usar ese como hint razonable).
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
    // Fallback a defaults. Si tiene comisionConsulpay legacy, lo usamos
    // para el campo del plan que esta activo, y el otro queda en default.
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

  // Indica si los valores cambiaron respecto al original. Si todavia
  // no cambio nada el "Guardar" queda deshabilitado.
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
        >
          ×
        </button>

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
                  Si lo deshabilitás, su suscripción actual sigue funcionando hasta el próximo
                  vencimiento natural — pero no va a poder renovar ni recontratar después.
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

/* ============================================================
   ConfirmarAccionSuperModal — para suspender/reactivar usuarios
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
