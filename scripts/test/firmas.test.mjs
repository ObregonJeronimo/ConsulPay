/**
 * Verifica que los stubs de los tests no se hayan desincronizado de las
 * funciones reales. Es el agujero clasico de testear con mocks: el test
 * queda verde y la app rompe en produccion.
 */
import { verificarFirmas } from './harness.mjs';

const fallas = verificarFirmas([
  ['src/lib/sesiones.js', 'suscribirSesionesPagadas', 2],
  ['src/lib/sesiones.js', 'suscribirSesionesProfesional', 4],
  ['src/lib/sesiones.js', 'suscribirSesionesConsultorio', 3],
  ['src/lib/sesiones.js', 'editarFechaPago', 3],
  ['src/lib/profesionales.js', 'suscribirMiembrosConsultorio', 2],
  ['src/lib/profesionales.js', 'suscribirProfesionales', 2],
  ['src/lib/pacientes.js', 'suscribirPacientesConsultorio', 2],
  ['src/lib/pagos.js', 'suscribirPagosDelConsultorio', 2],
  ['src/lib/gastos.js', 'suscribirGastos', 2],
  ['src/lib/gastos.js', 'crearGasto', 3],
  ['src/lib/citas.js', 'suscribirCitas', 3],
  ['src/lib/citas.js', 'suscribirCitasProfesional', 4],
  ['src/lib/citas.js', 'crearCita', 3],
  ['src/lib/citas.js', 'crearSerieCitas', 4],
]);

console.log('=== Firmas: stubs vs funciones reales ===');
if (fallas.length === 0) {
  console.log('  OK    las 14 firmas coinciden');
  process.exit(0);
}
fallas.forEach((f) => console.log('  FALLA ' + f));
process.exit(1);
