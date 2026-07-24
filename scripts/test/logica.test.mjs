/**
 * Tests de la logica pura de negocio: motor de repeticion de citas y
 * armado del libro de caja. Sin DOM ni Firebase, corren en milisegundos.
 */
import { readFileSync } from 'fs';
import { crearTester } from './harness.mjs';

/** Carga un modulo quitandole los imports de Firebase, que no hacen falta. */
function cargarPuro(archivo, exportar) {
  const src = readFileSync(archivo, 'utf8')
    .replace(/^import[\s\S]*?from '[^']*firebase[^']*';/gm, '')
    .replace(/^import \{[\s\S]*?\} from 'firebase\/firestore';/m, '')
    .replace(/export async function [\s\S]*?\n\}/g, '')
    .replace(/export function suscribir[\s\S]*?\n\}/g, '')
    .replace(/export /g, '');
  return new Function(`${src}\nreturn { ${exportar.join(', ')} };`)();
}

const t = crearTester('Logica de negocio');

/* ---- Motor de repeticion de citas ---- */
const citas = cargarPuro('src/lib/citas.js',
  ['calcularOcurrencias', 'TIPOS_REPETICION', 'TIPOS_FIN', 'grillaDelMes', 'aKey']);
const { calcularOcurrencias: oc, TIPOS_REPETICION: TR, TIPOS_FIN: TF } = citas;

t.seccion('Repeticion de turnos');
t.ck('martes x8 arranca en la fecha dada',
  oc('2026-07-14', { tipo: TR.SEMANAL, cada: 1, diasSemana: [2] }, { tipo: TF.CANTIDAD, cantidad: 8 })[0] === '2026-07-14');
t.ck('lun+jue desde un martes NO retrocede al lunes previo',
  oc('2026-07-14', { tipo: TR.SEMANAL, cada: 1, diasSemana: [1, 4] }, { tipo: TF.CANTIDAD, cantidad: 6 })[0] === '2026-07-16');
t.ck('cada 2 semanas salta bien',
  oc('2026-07-14', { tipo: TR.SEMANAL, cada: 2, diasSemana: [2] }, { tipo: TF.CANTIDAD, cantidad: 3 })[1] === '2026-07-28');
t.ck('dia 31 mensual cae al ultimo dia de febrero',
  oc('2026-01-31', { tipo: TR.MENSUAL, cada: 1 }, { tipo: TF.CANTIDAD, cantidad: 2 })[1] === '2026-02-28');
t.ck('hasta una fecha no la pasa',
  oc('2026-07-14', { tipo: TR.SEMANAL, cada: 1, diasSemana: [2] }, { tipo: TF.FECHA, hasta: '2026-08-31' })
    .every((f) => f <= '2026-08-31'));
t.ck('sin fecha de fin genera ventana acotada, no infinito',
  oc('2026-07-14', { tipo: TR.SEMANAL, cada: 1, diasSemana: [2] }, { tipo: TF.SIN_FIN }).length < 30);
t.ck('sin dias marcados no explota',
  oc('2026-07-14', { tipo: TR.SEMANAL, cada: 1, diasSemana: [] }, { tipo: TF.CANTIDAD, cantidad: 5 }).length === 1);
t.ck('la grilla del mes siempre trae 42 celdas', citas.grillaDelMes(new Date(2026, 1, 1)).length === 42);

/* ---- Libro de caja ---- */
const gastos = cargarPuro('src/lib/gastos.js', ['armarLibro', 'validar', 'CUENTA_MP']);

t.seccion('Libro de caja');
const libro = gastos.armarLibro({
  sesionesPagadas: [
    { id: 's1', montoConsultorio: 100, receptorUid: 'a1', fechaPago: new Date(2026, 6, 5) },
    { id: 's2', montoConsultorio: 50, receptorUid: 'fantasma', fechaPago: new Date(2026, 6, 2) },
  ],
  pagosMP: [{ id: 'm1', montoConsultorio: 70, createdAt: new Date(2026, 6, 4) }],
  gastos: [{ id: 'g1', fecha: '2026-07-03', monto: 30, cuenta: 'a1', motivo: 'luz' }],
  cuentas: [{ id: 'a1' }, { id: 'mp' }],
});
t.ck('ordena cronologicamente',
  libro.movimientos.map((m) => m.fecha).join(',') === '2026-07-02,2026-07-03,2026-07-04,2026-07-05');
t.ck('saldo del admin = 100 - 30', libro.totales.a1.saldo === 70);
t.ck('los cobros de Mercado Pago entran a su caja', libro.totales.mp.ingresos === 70);
t.ck('un receptor desconocido no hace desaparecer la plata', libro.totales.sin_asignar.ingresos === 50);
t.ck('separa ingresos de egresos', libro.totales.a1.ingresos === 100 && libro.totales.a1.egresos === 30);

const malo = (d) => { try { gastos.validar(d); return false; } catch { return true; } };
const base = { fecha: '2026-07-01', cuenta: 'a1', motivo: 'x' };
t.ck('rechaza monto 0', malo({ ...base, monto: 0 }));
t.ck('rechaza monto negativo', malo({ ...base, monto: -5 }));
t.ck('rechaza monto no numerico', malo({ ...base, monto: 'abc' }));
t.ck('rechaza motivo vacio', malo({ ...base, monto: 10, motivo: '   ' }));
t.ck('guarda el monto positivo y redondeado',
  gastos.validar({ ...base, monto: 10.555 }).monto === 10.56);

console.log(t.fallas === 0 ? '\nTODO OK' : `\n${t.fallas} FALLA(S)`);
process.exit(t.fallas === 0 ? 0 : 1);
