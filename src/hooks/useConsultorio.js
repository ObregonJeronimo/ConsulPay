/**
 * useConsultorio
 *
 * Suscripción en vivo al documento del consultorio al que pertenece el usuario.
 * Retorna null si el usuario no tiene consultorioId, o si todavía está cargando.
 */

import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';

import { db } from '../lib/firebase.js';
import { useAuth } from './useAuth.js';

export function useConsultorio() {
  const { user } = useAuth();
  const [consultorio, setConsultorio] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.consultorioId) {
      setConsultorio(null);
      setLoading(false);
      return;
    }

    const ref = doc(db, 'consultorios', user.consultorioId);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          setConsultorio({ id: snap.id, ...snap.data() });
        } else {
          setConsultorio(null);
        }
        setLoading(false);
      },
      (err) => {
        console.error('Error leyendo consultorio:', err);
        setConsultorio(null);
        setLoading(false);
      },
    );

    return unsub;
  }, [user?.consultorioId]);

  return { consultorio, loading };
}
