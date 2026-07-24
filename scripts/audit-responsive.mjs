/**
 * Auditoría responsive de tablas — mide con navegador real.
 *
 * Por qué existe: el modo tarjeta de .cp-compact-list oculta todos los td
 * normales y deja solo los cp-td-mobile-*. Arriba de ese corte la tabla se
 * muestra entera, y si no entra en el contenedor las columnas se recortan
 * contra el borde. A ojo no se nota (hay scroll horizontal); medido, sí.
 *
 * Qué hace: arma una tabla representativa por cada una de la app con el CSS
 * real, mide su ancho natural y calcula a partir de qué viewport entra
 * completa, descontando el sidebar.
 *
 * Uso:  npm i -D esbuild @sparticuz/chromium puppeteer-core --no-save
 *       node scripts/audit-responsive.mjs
 */
import * as esbuild from 'esbuild';
import { createServer } from 'http';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'fs';

const SIDEBAR = 240;   // ancho del sidebar de AppShell
const PADDING = 48;    // padding del contenido a cada lado

/* Columnas reales de cada tabla (extraídas de los thead de la app).
   El contenido es representativo del peor caso real: nombres largos,
   importes de 6 cifras y badges. */
const TABLAS = [
  { id: 'admin/Sesiones', desde: 1470, clase: 'cp-sesiones',
    cols: ['Fecha','Profesional','Paciente','Método','Valor','Consultorio','Profesional','Estado',''],
    fila: ['03-jul<br>12:00 a.m.','Lorena Arguello','MIRANDA CONTRERAS, JUAN IGNACIO','OBRA SOCIAL 24%','$ 145.889','$ 33.374','$ 110.876','<span class="cp-badge cp-badge--debido">Debe</span>','⋮'] },
  { id: 'profesional/MisSesiones', desde: 1470, clase: 'cp-sesiones',
    cols: ['Fecha','Paciente','Sesiones','Método','Valor','Mi parte','Al consultorio','Estado',''],
    fila: ['03-jul<br>12:00 a.m.','RAMÍREZ ETCHEGOYEN, SOFÍA MILAGROS','8','OBRA SOCIAL 24%','$ 145.889','$ 110.876','$ 33.374','<span class="cp-badge cp-badge--debido">Debe</span>','⋮'] },
  /* Variantes sin la columna "Método": es la de texto mas largo y el dato
     ya aparece en el detalle de cada sesion. Sirven para elegir hasta que
     ancho conviene ocultarla en vez de degradar la tabla a tarjetas. */
  { id: 'admin/Sesiones (sin Método)', diagnostico: true, clase: 'cp-sesiones',
    cols: ['Fecha','Profesional','Paciente','Valor','Consultorio','Profesional','Estado',''],
    fila: ['03-jul<br>12:00 a.m.','Lorena Arguello','MIRANDA CONTRERAS, JUAN IGNACIO','$ 145.889','$ 33.374','$ 110.876','<span class="cp-badge cp-badge--debido">Debe</span>','⋮'] },
  { id: 'profesional/MisSesiones (sin Método)', diagnostico: true, clase: 'cp-sesiones',
    cols: ['Fecha','Paciente','Sesiones','Valor','Mi parte','Al consultorio','Estado',''],
    fila: ['03-jul<br>12:00 a.m.','RAMÍREZ ETCHEGOYEN, SOFÍA MILAGROS','8','$ 145.889','$ 110.876','$ 33.374','<span class="cp-badge cp-badge--debido">Debe</span>','⋮'] },
  { id: 'admin/Sesiones (sin Método + compacta)', clase: 'cp-sesiones compacta',
    cols: ['Fecha','Profesional','Paciente','Valor','Consultorio','Profesional','Estado',''],
    fila: ['03-jul<br>12:00 a.m.','Lorena Arguello','MIRANDA CONTRERAS, JUAN IGNACIO','$ 145.889','$ 33.374','$ 110.876','<span class="cp-badge cp-badge--debido">Debe</span>','⋮'] },
  { id: 'profesional/MisSesiones (sin Método + compacta)', clase: 'cp-sesiones compacta',
    cols: ['Fecha','Paciente','Sesiones','Valor','Mi parte','Al consultorio','Estado',''],
    fila: ['03-jul<br>12:00 a.m.','RAMÍREZ ETCHEGOYEN, SOFÍA MILAGROS','8','$ 145.889','$ 110.876','$ 33.374','<span class="cp-badge cp-badge--debido">Debe</span>','⋮'] },
  { id: 'admin/LibroCaja (3 admins)', clase: 'cp-libro',
    cols: ['Fecha','Mercado Pago','Adriana','Romina','Carla','Detalle',''],
    fila: ['03/07','$ 141.447','−$ 19.000','$ 82.408','$ 205.000','Papitas, gaseosas, etc','×'] },
  { id: 'admin/Pagos', clase: 'cp-pagos-admin',
    cols: ['Fecha','Profesional','Bruto','Cargo MP','Recibido','Registros','Estado'],
    fila: ['23-jul-2026','Lorena Arguello','$ 145.889','−$ 8.900','$ 136.989','12','<span class="cp-badge cp-badge--pagada">Aprobado</span>'] },
  { id: 'admin/Profesionales', clase: 'cp-profesionales',
    cols: ['Profesional','Email','Estado','Edición directa','Carga pacientes','Marcar pagadas',''],
    fila: ['Lorena Arguello','lorena.arguello@consultorio.com.ar','<span class="cp-badge cp-badge--pagada">Activo</span>','Sí','Sí','No','⋮'] },
  { id: 'admin/Pacientes', clase: 'cp-pacientes',
    cols: ['Paciente','Profesional/es','Método','Valor sesión','Obra social Nº',''],
    fila: ['MIRANDA CONTRERAS, JUAN IGNACIO','Lorena Arguello','OBRA SOCIAL 24%','$ 18.236','4512-3387-9911/00','⋮'] },
  { id: 'admin/Solicitudes', clase: 'cp-solicitudes',
    cols: ['Tipo','Profesional','Paciente','Solicitada','Estado',''],
    fila: ['Marcar como pagada','Lorena Arguello','MIRANDA CONTRERAS, JUAN IGNACIO','20-may 07:23 p.m.','<span class="cp-badge cp-badge--pendiente-monto">Pendiente</span>','⋮'] },
  { id: 'profesional/MisPacientes', clase: 'cp-pacientes',
    cols: ['Paciente','Método','Valor sesión','Obra social Nº','Contacto'],
    fila: ['MIRANDA CONTRERAS, JUAN IGNACIO','OBRA SOCIAL 24%','$ 18.236','4512-3387-9911/00','+54 351 555-0199'] },
  { id: 'profesional/MisPagos', clase: 'cp-mis-pagos',
    cols: ['Fecha','Paciente','Método','Mi parte','Al consultorio',''],
    fila: ['23-jul-2026','MIRANDA CONTRERAS, JUAN IGNACIO','OBRA SOCIAL 24%','$ 110.876','$ 33.374','⋮'] },
];

mkdirSync('.audit', { recursive: true });

await esbuild.build({
  stdin: {
    contents: `import './src/styles/tokens.css'; import './src/styles/shared-ui.css';`,
    resolveDir: '.', loader: 'js',
  },
  bundle: true, loader: { '.css': 'css' }, outfile: '.audit/app.js', logLevel: 'silent',
});

const html = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="app.css"><style>body{margin:0;background:var(--cp-bg)}
.cp-table-wrap{overflow:visible}
.caja{padding:24px;width:320px}
.compacta .cp-table th,.compacta .cp-table td{padding-left:10px;padding-right:10px}   /* angosto a proposito: asi scrollWidth
   devuelve el ancho MINIMO que la tabla necesita, no el estirado al 100% */
</style></head><body>
${TABLAS.map((t) => `<div class="caja ${t.clase}" data-id="${t.id}" data-diagnostico="${t.diagnostico ? 1 : 0}" data-desde="${t.desde || 0}">
  <div class="cp-table-wrap"><table class="cp-table">
    <thead><tr>${t.cols.map((c) => `<th>${c}</th>`).join('')}</tr></thead>
    <tbody><tr>${t.fila.map((c) => `<td>${c}</td>`).join('')}</tr></tbody>
  </table></div></div>`).join('')}
</body></html>`;
writeFileSync('.audit/index.html', html);

const srv = createServer((q, s) => {
  const f = q.url === '/' ? '/index.html' : q.url.split('?')[0];
  try {
    const b = readFileSync('.audit' + f);
    s.writeHead(200, { 'Content-Type': f.endsWith('.css') ? 'text/css' : 'text/html' });
    s.end(b);
  } catch { s.writeHead(404); s.end(); }
});
await new Promise((r) => srv.listen(4399, r));

const m = await import('@sparticuz/chromium');
const chromium = m.default || m;
const pt = await import('puppeteer-core');
const browser = await pt.default.launch({
  args: [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox'],
  executablePath: await chromium.executablePath(), headless: true,
});
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080 });
await page.goto('http://localhost:4399/', { waitUntil: 'networkidle0' });

const medidas = await page.evaluate(() =>
  [...document.querySelectorAll('[data-id]')].map((d) => ({
    id: d.dataset.id,
    diagnostico: d.dataset.diagnostico === '1',
    desde: Number(d.dataset.desde || 0),
    ancho: Math.ceil(d.querySelector('table').scrollWidth),
    cols: d.querySelectorAll('th').length,
  })));

await browser.close(); srv.close(); rmSync('.audit', { recursive: true, force: true });

console.log('tabla'.padEnd(28) + 'cols'.padStart(5) + 'ancho'.padStart(8) + 'viewport min'.padStart(14) + '  1280  1366  1536');
console.log('-'.repeat(78));
let alertas = 0;
for (const t of medidas.sort((a, b) => b.ancho - a.ancho)) {
  const min = t.ancho + SIDEBAR + PADDING;
  const ok = (w) => (w >= min ? ' ok  ' : ' ✗   ');
  // Las variantes son solo para decidir; y una tabla con "desde" declarado
  // se muestra completa recien a partir de ese ancho (abajo va compacta).
  const umbral = t.desde || 1280;
  if (!t.diagnostico && min > umbral) alertas++;
  console.log((t.diagnostico ? '  · ' + t.id : t.id).padEnd(28) + String(t.cols).padStart(5) + (t.ancho + 'px').padStart(8)
    + (min + 'px').padStart(14) + '  ' + ok(1280) + ok(1366) + ok(1536));
}
console.log(alertas === 0
  ? '\nOK: cada tabla entra en el ancho donde se muestra.'
  : `\n${alertas} tabla(s) se recortan: revisar prioridad de columnas.`);
console.log('(las filas con · son variantes de diagnostico, no configuraciones reales)');
process.exit(alertas === 0 ? 0 : 1);
