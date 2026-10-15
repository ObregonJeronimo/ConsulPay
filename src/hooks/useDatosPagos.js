/**
 * Los datos de la seccion Pagos, pedidos UNA sola vez.
 *
 * Antes cada pestana (Resumen, Movimientos, Cobros por mes) se suscribia
 * por su cuenta a las sesiones, los gastos, los pagos, los miembros y los
 * pacientes. Firestore cobra una lectura por documento cada vez que se abre
 * una suscripcion, asi que abrir Pagos leia ~2.000 documentos en CALA y
 * cada cambio de pestana volvia a leer hasta otros tantos, porque la
 * pestana que se iba cerraba las suyas y la que llegaba las abria de nuevo.
 * El 14/10/2026 el proyecto se quedo sin cuota diaria gratuita.
 *
 * Ahora Pagos llama a este hook y le pasa el resultado a cada pestana:
 * cambiar de pestana no lee nada. Las pestanas siguen pudiendo usarse
 * solas (y los tests las montan asi): si no reciben `datos`, llaman al hook
 * con su consultorioId. Con un id vacio el hook no se suscribe a nada.
 *
 * Las sesiones se piden todas juntas, en cualquier estado: el Resumen
 * necesita las pagadas (ingresos) y las que se deben (a cobrar), y antes
 * eran dos suscripciones que se pisaban en ~740 documentos.
 */

import { useEffect, useMemo, useState } from 'react';

import { ESTADOS_PAGO_SESION } from '../lib/constants.js';
import { suscribirGastos } from '../lib/gastos.js';
import { suscribirPacientesConsultorio } from '../lib/pacientes.js';
import { suscribirPagosDelConsultorio } from '../lib/pagos.js';
import { suscribirMiembrosConsultorio } from '../lib/profesionales.js';
import { suscribirSesionesDelConsultorio } from '../lib/sesiones.js';

export function useDatosPagos(consultorioId) {
  // null = todavia no llego la primera respuesta (para mostrar el spinner).
  const [sesiones, setSesiones] = useState(null);
  const [pagos, setPagos] = useState(null);
  const [gastos, setGastos] = useState([]);
  const [miembros, setMiembros] = useState([]);
  const [pacientes, setPacientes] = useState([]);

  useEffect(() => {
    if (!consultorioId) return undefined;
    return suscribirSesionesDelConsultorio(consultorioId, setSesiones);
  }, [consultorioId]);

  useEffect(() => {
    if (!consultorioId) return undefined;
    return suscribirPagosDelConsultorio(consultorioId, setPagos);
  }, [consultorioId]);

  useEffect(() => {
    if (!consultorioId) return undefined;
    return suscribirGastos(consultorioId, setGastos);
  }, [consultorioId]);

  useEffect(() => {
    if (!consultorioId) return undefined;
    return suscribirMiembrosConsultorio(consultorioId, setMiembros);
  }, [consultorioId]);

  useEffect(() => {
    if (!consultorioId) return undefined;
    return suscribirPacientesConsultorio(consultorioId, setPacientes);
  }, [consultorioId]);

  return useMemo(() => {
    const todas = sesiones || [];
    const todosLosPagos = pagos || [];
    return {
      sesionesListas: sesiones !== null,
      pagosListos: pagos !== null,
      sesiones: todas,
      pagadas: todas.filter((s) => s.estadoPago === ESTADOS_PAGO_SESION.PAGADO),
      pagos: todosLosPagos,
      pagosAprobados: todosLosPagos.filter((p) => p.estado === 'aprobado'),
      gastos,
      miembros,
      pacientes,
    };
  }, [sesiones, pagos, gastos, miembros, pacientes]);
}
