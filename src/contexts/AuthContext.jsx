/**
 * AuthContext
 *
 * Provee el estado de sesión globalmente:
 *  - loading: true mientras Firebase resuelve el estado inicial de auth
 *  - user: null si no hay sesión, o el doc completo de Firestore si hay
 *
 * COMPORTAMIENTO LIVE:
 * Escucha onAuthStateChanged para detectar login/logout, y por cada
 * usuario logueado se suscribe en vivo al doc /usuarios/{uid} con
 * onSnapshot. Esto significa que cualquier cambio en el doc del usuario
 * (rol, estado, consultorioId, permitirEdicionSesiones, etc.) se
 * refleja al instante en useAuth().user, sin necesidad de re-login.
 *
 * OPTIMIZACIÓN LCP (render optimista):
 * El doc del usuario se cachea en localStorage. En visitas recurrentes,
 * se usa ese cache como estado inicial (loading=false desde el primer
 * render) y se actualiza silenciosamente cuando Firebase resuelve.
 * Esto elimina el blank state de ~800ms que causaba LCP alto.
 *
 * El hook useAuth() vive en ../hooks/useAuth.js para que este archivo
 * solo exporte componentes (requerido por react-refresh).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';

import { auth } from '../lib/firebase.js';
import { getUserDoc, signOut as authSignOut, suscribirUserDoc } from '../lib/auth.js';
import { AuthContext } from './authContextValue.js';

const USER_CACHE_KEY = 'cp_user_cache';

function leerCache() {
  try {
    const raw = localStorage.getItem(USER_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function escribirCache(userData) {
  try {
    if (userData) {
      localStorage.setItem(USER_CACHE_KEY, JSON.stringify(userData));
    } else {
      localStorage.removeItem(USER_CACHE_KEY);
    }
  } catch {
    // localStorage puede estar bloqueado en modo privado — no es crítico
  }
}

export function AuthProvider({ children }) {
  // Arrancar con el cache si existe: loading=false y user del cache.
  // Firebase va a confirmar/invalidar esto en background via onAuthStateChanged.
  const cachedUser = leerCache();
  const [user, setUser] = useState(cachedUser);
  const [loading, setLoading] = useState(!cachedUser);

  /*
    Ref a la suscripcion al doc del usuario. La guardamos aca (no en
    state) porque no necesitamos re-renderizar cuando cambia, y porque
    necesitamos poder limpiarla desde varios lugares:
    - cuando cambia el firebaseUser (logout o switch de cuenta)
    - cuando se desmonta el provider
    Sin esto, cada login/logout dejaria suscripciones zombies vivas.
  */
  const unsubDocRef = useRef(null);

  useEffect(() => {
    function limpiarUnsubDoc() {
      if (unsubDocRef.current) {
        unsubDocRef.current();
        unsubDocRef.current = null;
      }
    }

    const unsubAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      // Cualquier cambio de auth invalida la suscripcion anterior
      limpiarUnsubDoc();

      if (!firebaseUser) {
        // No hay sesion: limpiar cache y estado
        escribirCache(null);
        setUser(null);
        setLoading(false);
        return;
      }

      try {
        /*
          Paso 1: lectura one-shot via getUserDoc para garantizar que el
          doc exista (lo crea si no existe — caso primer login). Asi cuando
          enganchemos el onSnapshot abajo, el primer callback siempre va a
          venir con datos validos y no con snap.exists() === false.
        */
        const initial = await getUserDoc(firebaseUser);
        escribirCache(initial);
        setUser(initial);
        setLoading(false);

        /*
          Paso 2: suscripcion live. A partir de aca, cualquier cambio en
          /usuarios/{uid} actualiza el state automaticamente. Si el doc
          se borra (caso borde, alguien lo elimino desde Console), el
          callback recibe null y dejamos al user en null para que la app
          reaccione (probablemente cierre sesion).
        */
        unsubDocRef.current = suscribirUserDoc(firebaseUser.uid, (docData) => {
          escribirCache(docData);
          setUser(docData);
        });
      } catch (err) {
        console.error('Error cargando doc de usuario:', err);
        escribirCache(null);
        setUser(null);
        setLoading(false);
      }
    });

    return () => {
      unsubAuth();
      limpiarUnsubDoc();
    };
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      isAuthenticated: !!user,
      signOut: authSignOut,
      /*
        refresh ya no es necesario en la mayoria de los casos porque la
        suscripcion live mantiene el doc actualizado solo. Lo dejamos
        por compatibilidad con codigo viejo que pudiera llamarlo. Hace
        una lectura one-shot y machaca el state — si justo en ese momento
        habia un cambio en vuelo, el siguiente snapshot lo va a corregir.
      */
      refresh: async () => {
        if (auth.currentUser) {
          const doc = await getUserDoc(auth.currentUser);
          escribirCache(doc);
          setUser(doc);
        }
      },
    }),
    [user, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
