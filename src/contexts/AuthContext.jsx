/**
 * AuthContext
 *
 * Provee el estado de sesión globalmente:
 *  - loading: true mientras Firebase resuelve el estado inicial de auth
 *  - user: null si no hay sesión, o el doc completo de Firestore si hay
 *
 * Escucha los cambios con onAuthStateChanged y recarga el doc de Firestore
 * cuando cambia el usuario.
 *
 * El hook useAuth() vive en ../hooks/useAuth.js para que este archivo
 * solo exporte componentes (requerido por react-refresh).
 */

import { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';

import { auth } from '../lib/firebase.js';
import { getUserDoc, signOut as authSignOut } from '../lib/auth.js';
import { AuthContext } from './authContextValue.js';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null);
        setLoading(false);
        return;
      }

      try {
        const doc = await getUserDoc(firebaseUser);
        setUser(doc);
      } catch (err) {
        console.error('Error cargando doc de usuario:', err);
        setUser(null);
      } finally {
        setLoading(false);
      }
    });

    return unsub;
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      isAuthenticated: !!user,
      signOut: authSignOut,
      /** Refresca el doc del usuario desde Firestore sin cerrar sesión */
      refresh: async () => {
        if (auth.currentUser) {
          const doc = await getUserDoc(auth.currentUser);
          setUser(doc);
        }
      },
    }),
    [user, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
