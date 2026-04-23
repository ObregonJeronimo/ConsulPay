import { useCallback, useEffect, useRef, useState } from 'react';
import { useBlocker } from 'react-router-dom';

/**
 * useUnsavedNavigationGuard
 *
 * Hook que protege al usuario contra la perdida de cambios sin guardar.
 * Maneja dos tipos de intentos de salida:
 *
 *   1. Navegacion interna (React Router): click en un Link del sidebar,
 *      navigate() programatico, boton atras del navegador. Se intercepta
 *      con useBlocker de React Router v7 y se resuelve por codigo (no hay
 *      dialog nativo, nosotros mostramos nuestro modal).
 *
 *   2. Salida de la pestaña: cerrar tab, refrescar (F5), cerrar ventana,
 *      escribir otra URL en la barra. Eso lo intercepta beforeunload,
 *      que solo puede mostrar el dialog nativo del navegador (no se puede
 *      customizar por seguridad del usuario). Ahi seguimos usando
 *      beforeunload, es el unico camino posible.
 *
 * Contrato:
 *
 *   const guard = useUnsavedNavigationGuard({ dirty, onSave });
 *
 *   - dirty: boolean. Si es true, se activa la proteccion.
 *   - onSave: async function. Se invoca al apretar "Guardar y continuar".
 *             Debe guardar los cambios y lanzar error si falla.
 *
 * Retorna un objeto con:
 *
 *   - modalOpen, saving, error: estado para pasar al <UnsavedChangesModal />
 *   - onSaveAndContinue, onCancel, onDiscard: handlers para el modal
 *   - requestNavigation(fn): helper para proteger acciones que NO son
 *     rutas de React Router (ej: cambio de tab interno, logout, etc).
 *     Devuelve true si puede proceder inmediatamente, false si abrio el
 *     modal (la accion se ejecuta despues de "Guardar/Descartar").
 */
export function useUnsavedNavigationGuard({ dirty, onSave }) {
  // Estado del modal
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // ============================================================
  // Pieza 1: proteccion contra cerrar/refrescar la pestaña
  // ============================================================
  useEffect(() => {
    if (!dirty) return;
    function onBeforeUnload(e) {
      e.preventDefault();
      // Chrome requiere returnValue seteado para mostrar el prompt.
      // El texto no se puede customizar por seguridad (lo dice el browser).
      e.returnValue = '';
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  // ============================================================
  // Pieza 2: bloqueo de navegacion interna via React Router
  // ============================================================
  // useBlocker recibe una funcion que decide si bloquear el intento
  // de navegacion. Devuelve un objeto `blocker` con:
  //   - blocker.state: 'unblocked' | 'blocked' | 'proceeding'
  //   - blocker.proceed(): confirma y deja pasar la navegacion
  //   - blocker.reset(): cancela y se queda donde estaba
  //
  // Solo bloqueamos si hay cambios sin guardar Y es una navegacion a
  // otra ruta (no queremos bloquearnos a nosotros mismos con una
  // actualizacion de query params, por ejemplo).
  const blocker = useBlocker(
    useCallback(
      ({ currentLocation, nextLocation }) => {
        return dirty && currentLocation.pathname !== nextLocation.pathname;
      },
      [dirty],
    ),
  );

  // Cuando el blocker bloquea una navegacion, abrimos el modal.
  useEffect(() => {
    if (blocker.state === 'blocked') {
      setModalOpen(true);
      setError(null);
    }
  }, [blocker.state]);

  // ============================================================
  // Pieza 3: proteccion para acciones que no son rutas
  // ============================================================
  // Guardamos el callback a ejecutar "despues de resolver el modal"
  // para acciones internas que no involucran un cambio de ruta
  // (ej: cambio de tab, logout, abrir un modal destructivo, etc).
  const pendingActionRef = useRef(null);

  const requestNavigation = useCallback(
    (action) => {
      if (!dirty) {
        // Sin cambios, ejecutamos directo y avisamos al caller que puede proceder.
        action?.();
        return true;
      }
      // Con cambios, guardamos la accion y abrimos el modal.
      pendingActionRef.current = action;
      setModalOpen(true);
      setError(null);
      return false;
    },
    [dirty],
  );

  // ============================================================
  // Handlers del modal
  // ============================================================

  /**
   * Ejecuta la accion pendiente (ruta bloqueada por blocker, o accion
   * pasada a requestNavigation). Se llama despues de guardar o descartar.
   */
  const ejecutarAccionPendiente = useCallback(() => {
    if (blocker.state === 'blocked') {
      // Dejar que React Router siga con la navegacion bloqueada.
      blocker.proceed();
    } else if (pendingActionRef.current) {
      // Ejecutar la accion custom (ej: cambiar de tab).
      const action = pendingActionRef.current;
      pendingActionRef.current = null;
      action();
    }
  }, [blocker]);

  const onSaveAndContinue = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave();
      // Guardado OK: cerramos modal y ejecutamos la accion pendiente.
      setModalOpen(false);
      ejecutarAccionPendiente();
    } catch (err) {
      console.error('Error al guardar antes de continuar:', err);
      // Mantenemos el modal abierto y mostramos el error para reintentar.
      setError(err?.message || 'No se pudieron guardar los cambios.');
    } finally {
      setSaving(false);
    }
  }, [onSave, ejecutarAccionPendiente]);

  const onCancel = useCallback(() => {
    setModalOpen(false);
    setError(null);
    // Si era una navegacion bloqueada, cancelarla para que el usuario
    // se quede donde estaba. Si era una accion custom, simplemente
    // descartamos la referencia.
    if (blocker.state === 'blocked') {
      blocker.reset();
    }
    pendingActionRef.current = null;
  }, [blocker]);

  const onDiscard = useCallback(() => {
    setModalOpen(false);
    setError(null);
    // No guardamos, pero dejamos pasar. El caller es responsable de
    // que `dirty` vuelva a false (ej: resetear su form) si lo necesita
    // antes del proximo render, aunque en la practica al navegar a
    // otra ruta el componente se desmonta y no importa.
    ejecutarAccionPendiente();
  }, [ejecutarAccionPendiente]);

  return {
    // Estado para el modal
    modalOpen,
    saving,
    error,
    // Handlers para el modal
    onSaveAndContinue,
    onCancel,
    onDiscard,
    // Helper para acciones no-ruta
    requestNavigation,
  };
}
