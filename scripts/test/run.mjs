/**
 * Corre toda la bateria. Sale con 1 si algo falla, asi sirve de pre-push.
 *
 *   node scripts/test/run.mjs
 *
 * Los tests de layout necesitan navegador y se saltean solos si no estan
 * las dependencias, para que la bateria corra igual en cualquier maquina:
 *   npm i -D esbuild @sparticuz/chromium puppeteer-core --no-save
 */
import { execSync, spawnSync } from 'child_process';
import { existsSync } from 'fs';

const pasos = [];
const correr = (nombre, cmd, opcional = false) => {
  const r = spawnSync('node', cmd, { stdio: 'inherit' });
  pasos.push({ nombre, ok: r.status === 0, opcional });
};

console.log('\n########## LINT Y BUILD ##########');
let lintOk = true;
try { execSync('npx eslint src/', { stdio: 'inherit' }); } catch { lintOk = false; }
pasos.push({ nombre: 'ESLint', ok: lintOk });

let buildOk = true;
try { execSync('npx vite build', { stdio: 'pipe' }); } catch { buildOk = false; }
pasos.push({ nombre: 'vite build', ok: buildOk });

console.log('\n########## FIRMAS Y LOGICA ##########');
correr('Firmas de stubs', ['scripts/test/firmas.test.mjs']);
correr('Logica de negocio', ['scripts/test/logica.test.mjs']);

console.log('\n########## LAYOUT (necesita navegador) ##########');
if (existsSync('node_modules/@sparticuz/chromium') && existsSync('node_modules/puppeteer-core')) {
  correr('Responsive de tablas', ['scripts/audit-responsive.mjs']);
} else {
  console.log('  (salteado: falta chromium; ver encabezado de este archivo)');
  pasos.push({ nombre: 'Responsive de tablas', ok: true, salteado: true });
}

console.log('\n########## RESUMEN ##########');
for (const p of pasos) {
  console.log(`  ${p.salteado ? '--  ' : p.ok ? 'OK  ' : 'FALLA'} ${p.nombre}`);
}
const fallo = pasos.some((p) => !p.ok);
console.log(fallo ? '\nHAY FALLAS\n' : '\nTODO VERDE\n');
process.exit(fallo ? 1 : 0);
