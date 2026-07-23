import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { collection, getDocs, onSnapshot, query, where } from 'firebase/firestore';

import Button from '../components/ui/Button.jsx';
import Spinner from '../components/ui/Spinner.jsx';
import { useAuth } from '../hooks/useAuth.js';
import { db } from '../lib/firebase.js';
import { ESTADOS_INVITACION, ESTADOS_USUARIO, ROLES } from '../lib/constants.js';
import './Pendiente.css';

/*
  Devuelve la primera invitacion pendiente y no vencida de una lista de
  docs crudos. Filtramos estado y vencimiento en memoria (y no en el
  query) para no depender de un indice compuesto de Firestore.
*/
function primeraInvitacionVigente(docs) {
  const vigentes = docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((inv) => {
      if (inv.estado !== ESTADOS_INVITACION.PENDIENTE) return false;
      if (!inv.expiraAt) return true;
      const expira = inv.expiraAt.toDate ? inv.expiraAt.toDate() : new Date(inv.expiraAt);
      return expira.getTime() > Date.now();
    });
  return vigentes[0] ?? null;
}

export default function Pendiente() {
  const { user, signOut, refresh } = useAuth();

  const [invitacion, setInvitacion] = useState(null);
  const [comprobando, setComprobando] = useState(false);
  const [sinNovedades, setSinNovedades] = useState(false);

  const email = user?.email?.toLowerCase() ?? null;
  const yaTieneConsultorio = !!user?.consultorioId;

  /*
    Invitaciones dirigidas a este mail.

    Invitar a un profesional NO modifica su documento de usuario: crea un
    doc aparte en invitaciones_profesional y manda un mail con el link para
    aceptarla. Por eso, si el profesional ya esta logueado esperando en esta
    pantalla, refrescar su usuario no alcanza — no cambia nada hasta que
    entra al link. Con esta suscripcion la invitacion aparece sola apenas el
    admin la envia, sin depender del mail.
  */
  useEffect(() => {
    if (!email || yaTieneConsultorio) {
      setInvitacion(null);
      return undefined;
    }

    const q = query(
      collection(db, 'invitaciones_profesional'),
      where('email', '==', email),
    );

    return onSnapshot(
      q,
      (snap) => setInvitacion(primeraInvitacionVigente(snap.docs)),
      (err) => {
        console.error('Error buscando invitaciones:', err);
        setInvitacion(null);
      },
    );
  }, [email, yaTieneConsultorio]);

  // Refresco automatico del usuario para detectar cambios del backend
  // (el admin lo aprobo, le cambiaron el rol, etc.).
  useEffect(() => {
    const id = setInterval(() => {
      refresh().catch(() => {});
    }, 4000);
    return () => clearInterval(id);
  }, [refresh]);

  /*
    "Volver a comprobar" ahora relee el usuario Y busca invitaciones nuevas,
    y siempre da una respuesta visible: antes releia solo el usuario, que en
    el caso de un profesional recien invitado nunca cambia, y el boton
    parecia estar roto.
  */
  const comprobarAhora = useCallback(async () => {
    setComprobando(true);
    setSinNovedades(false);
    try {
      await refresh().catch(() => {});

      let encontrada = null;
      if (email) {
        try {
          const snap = await getDocs(query(
            collection(db, 'invitaciones_profesional'),
            where('email', '==', email),
          ));
          encontrada = primeraInvitacionVigente(snap.docs);
          setInvitacion(encontrada);
        } catch (err) {
          console.error('Error buscando invitaciones:', err);
        }
      }

      if (!encontrada) setSinNovedades(true);
    } finally {
      setComprobando(false);
    }
  }, [email, refresh]);

  // Ocultamos el aviso de "sin novedades" apenas llega una invitacion.
  useEffect(() => {
    if (invitacion) setSinNovedades(false);
  }, [invitacion]);

  // --- A partir de aca, redirecciones. Van despues de los hooks para no
  // romper el orden de hooks entre renders. ---

  // Si el user paso a ser admin/superadmin (porque acaba de crear su
  // consultorio o porque el sistema cambio su rol), lo mandamos al panel
  // que corresponde.
  if (user?.rol === ROLES.ADMIN) {
    return <Navigate to="/admin" replace />;
  }
  if (user?.rol === ROLES.SUPERADMIN) {
    return <Navigate to="/super" replace />;
  }
  if (user?.rol === ROLES.PROFESIONAL && user?.estado === ESTADOS_USUARIO.ACTIVO) {
    return <Navigate to="/mi-panel" replace />;
  }

  const rechazado = user?.estado === ESTADOS_USUARIO.RECHAZADO;
  const suspendido = user?.estado === ESTADOS_USUARIO.SUSPENDIDO;
  const retirado = user?.estado === ESTADOS_USUARIO.RETIRADO;

  /*
    Caso "sin consultorio": el usuario se logueo con un mail que no fue
    invitado a ningun consultorio. El doc se crea con consultorioId: null
    y estado pendiente, pero NO hay ningun admin que lo vaya a aprobar.
  */
  const sinConsultorio = !user?.consultorioId && !rechazado && !suspendido && !retirado;

  // Si hay una invitacion esperando, esa es la historia principal de la
  // pantalla: el resto del contenido pasa a segundo plano.
  const tieneInvitacion = sinConsultorio && !!invitacion;
  const nombreConsultorio = invitacion?.consultorioNombre?.trim();

  const titulo = tieneInvitacion
    ? 'Tenés una invitación esperándote'
    : sinConsultorio
      ? 'Todavía no estás en ningún consultorio'
      : retirado
        ? 'Acceso al consultorio cerrado'
        : rechazado
          ? 'Cuenta rechazada'
          : suspendido
            ? 'Cuenta suspendida'
            : 'Cuenta pendiente de aprobación';

  const mensaje = tieneInvitacion
    ? `${nombreConsultorio || 'Un consultorio'} te invitó a sumarte como profesional. Aceptá la invitación para entrar al panel.`
    : sinConsultorio
      ? 'Tu mail no está registrado en ningún consultorio. Puede ser que todavía no te hayan invitado como profesional: pedile al consultorio donde trabajás que te envíe una invitación a este mismo mail.'
      : retirado
        ? 'Ya no formás parte de este consultorio. Tus datos y registros se preservan, pero no podés iniciar sesión en el panel. Si querés volver a trabajar acá, contactá al administrador del consultorio para que te invite nuevamente.'
        : rechazado
          ? 'Tu solicitud de acceso no fue aprobada por el administrador.'
          : suspendido
            ? 'Tu cuenta fue suspendida. Contactá al administrador del consultorio para más información.'
            : 'Gracias por registrarte. Un administrador debe aprobar tu cuenta antes de que puedas acceder al panel.';

  // El estado "retirado" es definitivo desde el punto de vista del profesional:
  // no tiene sentido ofrecer "Volver a comprobar" porque solo el admin puede
  // reincorporarlo (y aun asi necesita iniciar sesion de nuevo).
  const mostrarVolverAComprobar = !rechazado && !suspendido && !retirado;

  return (
    <div className="cp-pendiente">
      <div className="cp-pendiente__card">
        <div
          className={`cp-pendiente__icon ${tieneInvitacion ? 'cp-pendiente__icon--invitacion' : ''}`}
          aria-hidden="true"
        >
          {tieneInvitacion ? (
            /* Sobre: hay una invitacion esperando */
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2.5" y="5" width="19" height="14" rx="2" />
              <path d="M3 6.5l9 6 9-6" />
            </svg>
          ) : sinConsultorio ? (
            /* Edificio: "no perteneces a ningun consultorio" */
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 21h18" />
              <path d="M5 21V7l7-4 7 4v14" />
              <path d="M9 21v-5h6v5" />
              <line x1="9" y1="10" x2="9.01" y2="10" />
              <line x1="15" y1="10" x2="15.01" y2="10" />
            </svg>
          ) : (
            /* Reloj: esperando aprobacion */
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          )}
        </div>

        <h1 className="cp-pendiente__title">{titulo}</h1>
        <p className="cp-pendiente__msg">{mensaje}</p>

        {user?.email && (
          <div className="cp-pendiente__email">{user.email}</div>
        )}

        {/* Invitacion encontrada: accion principal de la pantalla */}
        {tieneInvitacion && (
          <div className="cp-pendiente__cta">
            <Link
              to={`/aceptar-invitacion?id=${invitacion.id}`}
              className="cp-pendiente__cta-btn"
            >
              Aceptar invitación
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </Link>
          </div>
        )}

        {/* Sin invitacion a la vista: ofrecer crear su propio consultorio */}
        {sinConsultorio && !tieneInvitacion && (
          <div className="cp-pendiente__cta">
            <p className="cp-pendiente__cta-texto">
              ¿Querés probar el sistema? Podés crear tu propio consultorio ahora.
            </p>
            <Link to="/crear-consultorio" className="cp-pendiente__cta-btn">
              Crear mi consultorio
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </Link>
          </div>
        )}

        {sinNovedades && !tieneInvitacion && (
          <p className="cp-pendiente__nota" role="status">
            Todavía no hay novedades. Si te acaban de invitar, la invitación
            aparece acá sola.
          </p>
        )}

        <div className="cp-pendiente__actions">
          {mostrarVolverAComprobar && (
            <Button variant="secondary" onClick={comprobarAhora} disabled={comprobando}>
              {comprobando ? (
                <>
                  <Spinner size={14} />
                  Comprobando…
                </>
              ) : (
                'Volver a comprobar'
              )}
            </Button>
          )}
          <Button variant="ghost" onClick={signOut}>
            Cerrar sesión
          </Button>
        </div>
      </div>
    </div>
  );
}
