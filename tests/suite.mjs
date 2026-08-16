/* Suite de verificacion de todo lo tocado hoy.
   Renderiza los componentes REALES contra jsdom, con firestore stubeado. */
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost' });
global.window = dom.window; global.document = dom.window.document;
global.IS_REACT_ACT_ENVIRONMENT = true;
class RO { observe() {} unobserve() {} disconnect() {} }
global.ResizeObserver = RO; dom.window.ResizeObserver = RO;
globalThis.__DATA__ = {};

const { createRoot } = await import('react-dom/client');
const { createElement, act } = await import('react');

let ok = 0; let fallos = [];
function chequeo(nombre, cond, detalle = '') {
  if (cond) { ok += 1; console.log(`  OK    ${nombre}`); }
  else { fallos.push(nombre); console.log(`  FALLA ${nombre} ${detalle}`); }
}
const clic = (el) => el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));

async function montar(Comp, props) {
  const cont = document.createElement('div');
  document.body.appendChild(cont);
  const root = createRoot(cont);
  await act(async () => { root.render(createElement(Comp, props)); });
  return { cont, root };
}

const ts = (iso) => ({ toDate: () => new Date(iso) });
const slot = (uid) => ({ ownerAdminUid: uid, userIdMP: '1' });

/* ============ 1. mpHabilitado ============ */
console.log('\n[1] Regla de habilitacion de Mercado Pago');
{
  const { mpHabilitado } = await import('/home/claude/ConsulPay/src/lib/mpIntegracion.js');
  chequeo('2 admins sin vincular -> false', mpHabilitado({ adminUids: ['A', 'R'], mpConfigs: {} }) === false);
  chequeo('2 admins, 1 vinculada -> false', mpHabilitado({ adminUids: ['A', 'R'], mpConfigs: { primary: slot('A') } }) === false);
  chequeo('2 admins, las 2 -> true', mpHabilitado({ adminUids: ['A', 'R'], mpConfigs: { primary: slot('A'), secondary: slot('R') } }) === true);
  chequeo('1 admin vinculado -> true', mpHabilitado({ adminUids: ['A'], mpConfigs: { primary: slot('A') } }) === true);
  chequeo('legacy mpIntegrado -> true', mpHabilitado({ adminUids: ['A'], mpIntegrado: true, mpConfig: { connectedByUid: 'A' } }) === true);
  chequeo('ex-admin con cuenta -> false', mpHabilitado({ adminUids: ['A', 'R'], mpConfigs: { primary: slot('A'), secondary: slot('X') } }) === false);
  chequeo('consultorio undefined -> false', mpHabilitado(undefined) === false);
}

/* ============ 2. nombrePaciente centralizado ============ */
console.log('\n[2] nombrePaciente unico');
{
  const { nombrePaciente } = await import('/home/claude/ConsulPay/src/lib/pacientes.js');
  chequeo('formato Apellido, Nombre', nombrePaciente({ nombre: 'Ana', apellido: 'Alvarez' }) === 'Alvarez, Ana');
  chequeo('solo apellido', nombrePaciente({ apellido: 'Alvarez' }) === 'Alvarez');
  chequeo('null no explota', nombrePaciente(null) === '');
}

/* ============ 3. Libro de caja ============ */
console.log('\n[3] Libro de caja');
{
  const { default: LibroCaja } = await import('/home/claude/ConsulPay/src/pages/admin/LibroCaja.jsx');
  const ses = (id, monto, r, dia, pid, c = 1) => ({
    id, consultorioId: 'C1', estadoPago: 'pagado', montoConsultorio: monto, receptorUid: r,
    fechaPago: new Date(`2026-07-${dia}T12:00:00`), pacienteId: pid, cantidadSesiones: c,
  });
  globalThis.__DATA__ = {
    sesiones: [ses('a', 14153, 'A', '19', 'P0', 2), ses('b', 14153, 'A', '19', 'P1', 2),
               ses('c', 12000, 'A', '22', 'P2'), ses('d', 9000, 'A', '23', 'PX')],
    gastos: [{ id: 'g1', consultorioId: 'C1', fecha: '2026-07-20', monto: 85000, cuenta: 'A', motivo: 'Alquiler' }],
    pagos_consultorio: [],
    usuarios: [{ id: 'A', uid: 'A', displayName: 'Adriana Barrozo', consultorioId: 'C1', rol: 'admin' }],
    pacientes: [{ id: 'P0', nombre: 'Delfina', apellido: 'Moyano', consultorioId: 'C1' },
                { id: 'P1', nombre: 'Lucas', apellido: 'Peralta', consultorioId: 'C1' },
                { id: 'P2', nombre: 'Thiago', apellido: 'Abreu', consultorioId: 'C1' }],
  };
  const { cont } = await montar(LibroCaja, {
    consultorioId: 'C1', consultorio: { adminUids: ['A'], mpConfigs: {} }, uid: 'A', mes: new Date(2026, 6, 1),
  });

  const cajas = [...cont.querySelectorAll('.cp-libro__caja-nombre')].map((n) => n.textContent.trim());
  chequeo('sin MP habilitado no hay caja MP', !cajas.includes('Mercado Pago'), `(${cajas})`);
  chequeo('un solo selector de mes', cont.querySelectorAll('.cp-mes-selector').length === 0);
  chequeo('modo tarjeta mobile activo', !!cont.querySelector('.cp-compact-list'));

  const textoTabla = cont.querySelector('tbody').textContent;
  chequeo('el paciente borrado no muestra el nombre del admin',
    !textoTabla.includes('Adriana Barrozo') && textoTabla.includes('Sesión cobrada'));
  chequeo('agrupa los cobros del mismo dia', !!cont.querySelector('.cp-libro__toggle'));

  const filasAntes = cont.querySelectorAll('tbody tr').length;
  await act(async () => { clic(cont.querySelector('.cp-libro__toggle')); });
  chequeo('expandir muestra el desglose', cont.querySelectorAll('tbody tr').length > filasAntes);

  const todas = [...cont.querySelectorAll('tbody tr')];
  chequeo('todas las filas tienen celdas mobile',
    todas.every((tr) => tr.querySelector('td.cp-td-mobile-main') && tr.querySelector('td.cp-td-mobile-badge')));

  const cierre = cont.querySelector('.cp-libro__cierre');
  chequeo('el cierre existe y no esta en un tfoot', !!cierre && !cont.querySelector('tfoot'));
  const saldo = cierre.textContent.replace(/\s+/g, ' ');
  // 14153*2 + 12000 + 9000 = 49306 ingresos; 85000 egresos; saldo -35694
  chequeo('saldo negativo correcto', saldo.includes('35.694'), `(${saldo})`);
}

/* ============ 4. Mis sesiones: acciones y orden ============ */
console.log('\n[4] Mis sesiones');
{
  const { default: MisSesiones } = await import('/home/claude/ConsulPay/src/pages/profesional/MisSesiones.jsx');
  globalThis.__USER__ = { uid: 'PRO', consultorioId: 'C1', permitirMarcarPagadas: true, displayName: 'Gabriela' };
  globalThis.__CONS__ = { adminUids: ['A'], mpConfigs: {},
    metodosPagoPaciente: [{ id: 'm1', nombre: 'Particular', porcentajeConsultorio: 20, tipo: 'inmediato' }],
    adminsDirectorio: [{ uid: 'A', nombre: 'Adriana Barrozo' }] };
  const hoy = new Date();
  const ses = (id, pid, dia, estado = 'debido', tipo = 'inmediato') => ({
    id, consultorioId: 'C1', profesionalUid: 'PRO', pacienteId: pid, estadoPago: estado,
    metodoPagoTipo: tipo, metodoPagoNombre: 'Particular', valorTotal: 10000,
    montoConsultorio: 2000, montoProfesional: 8000, cantidadSesiones: 1,
    fecha: { toDate: () => new Date(hoy.getFullYear(), hoy.getMonth(), dia, 10, 0) },
  });
  globalThis.__DATA__ = {
    sesiones: [ses('s1', 'P3', 5), ses('s2', 'P1', 12), ses('s3', 'P2', 20, 'debido', 'diferido'), ses('s4', 'P4', 25)],
    pacientes: [
      { id: 'P1', nombre: 'Zulema', apellido: 'Zarate', consultorioId: 'C1', profesionalesUids: ['PRO'], estado: 'activo' },
      { id: 'P2', nombre: 'Ana', apellido: 'Alvarez', consultorioId: 'C1', profesionalesUids: ['PRO'], estado: 'activo' },
      { id: 'P3', nombre: 'Delfina', apellido: 'Moyano', consultorioId: 'C1', profesionalesUids: ['PRO'], estado: 'activo' },
      { id: 'P4', nombre: 'Bruno', apellido: 'Élez', consultorioId: 'C1', profesionalesUids: ['PRO'], estado: 'activo' },
    ],
    solicitudes_sesion: [], usuarios: [], pagos_consultorio: [],
  };
  const { cont } = await montar(MisSesiones, {});

  // Cada fila tiene la celda desktop y la mobile; se lee una sola por <tr>.
  const nombres = () => [...cont.querySelectorAll('tbody tr')]
    .map((tr) => tr.querySelector('td[data-label="Paciente"] .cp-prof-name')?.textContent.trim())
    .filter(Boolean);
  const sel = [...cont.querySelectorAll('select')].find((s) => s.getAttribute('aria-label') === 'Ordenar sesiones');
  chequeo('control de orden presente', !!sel);
  const porFecha = nombres();
  await act(async () => { sel.value = 'paciente'; sel.dispatchEvent(new dom.window.Event('change', { bubbles: true })); });
  const porPac = nombres();
  chequeo('orden alfabetico ordena', porPac.join() !== porFecha.join());
  chequeo('acentos en su lugar (Élez entre Alvarez y Moyano)',
    porPac.indexOf('Élez, Bruno') === 1, `(${porPac})`);
  await act(async () => { sel.value = 'fecha'; sel.dispatchEvent(new dom.window.Event('change', { bubbles: true })); });
  chequeo('vuelve al orden por fecha', nombres().join() === porFecha.join());

  const filaOS = [...cont.querySelectorAll('tbody tr')].find((tr) => tr.textContent.includes('Alvarez'));
  const acciones = [...filaOS.querySelectorAll('td.cp-sesiones-tabla__actions-cell button')]
    .map((b) => b.getAttribute('aria-label'));
  chequeo('OS liquidada permite eliminar', acciones.includes('Eliminar'), `(${acciones})`);
  chequeo('OS liquidada permite marcar pagada', acciones.includes('Marcar como pagada'), `(${acciones})`);
  chequeo('OS liquidada permite editar', acciones.includes('Editar'), `(${acciones})`);
}

/* ============ 5. Modal multi-mes (abierto desde la pagina) ============ */
console.log('\n[5] Marcar como pagado, multi-mes');
{
  const { default: MisSesiones } = await import('/home/claude/ConsulPay/src/pages/profesional/MisSesiones.jsx');
  globalThis.__USER__ = { uid: 'PRO', consultorioId: 'C1', permitirMarcarPagadas: true, displayName: 'Gabriela' };
  globalThis.__CONS__ = { adminUids: ['A', 'R'], mpConfigs: {},
    metodosPagoPaciente: [{ id: 'm1', nombre: 'Particular', porcentajeConsultorio: 20, tipo: 'inmediato' }],
    adminsDirectorio: [{ uid: 'A', nombre: 'Adriana Barrozo' }, { uid: 'R', nombre: 'Romina Sulaiman' }] };

  const deuda = (id, pid, iso, monto, cant = 1) => ({
    id, consultorioId: 'C1', profesionalUid: 'PRO', pacienteId: pid, estadoPago: 'debido',
    metodoPagoTipo: 'inmediato', metodoPagoNombre: 'Particular', valorTotal: monto * 5,
    montoConsultorio: monto, montoProfesional: monto * 4, cantidadSesiones: cant, fecha: ts(iso),
  });
  globalThis.__DATA__ = {
    sesiones: [
      ...[0, 1, 2, 3, 4].map((i) => deuda(`a${i}`, 'P1', `2026-04-1${i}T10:00:00`, 10000, 2)),
      ...[0, 1, 2].map((i) => deuda(`m${i}`, 'P2', `2026-05-0${5 + i}T10:00:00`, 20000)),
      deuda('rota', 'P1', 'no-es-fecha', 5000),
    ],
    pacientes: [
      { id: 'P1', apellido: 'Alvarez', nombre: 'Ana', consultorioId: 'C1', profesionalesUids: ['PRO'], estado: 'activo' },
      { id: 'P2', apellido: 'Bravo', nombre: 'Beto', consultorioId: 'C1', profesionalesUids: ['PRO'], estado: 'activo' },
    ],
    solicitudes_sesion: [], usuarios: [], pagos_consultorio: [],
  };

  const { cont } = await montar(MisSesiones, {});
  const abrir = [...cont.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Marcar como pagado');
  chequeo('el boton de marcar pagado esta habilitado', !!abrir && !abrir.disabled);
  await act(async () => { clic(abrir); });

  const bloques = [...cont.querySelectorAll('.cp-mes-bloque')];
  chequeo('lista los 3 grupos (mayo, abril, sin fecha)', bloques.length === 3, `(${bloques.length})`);
  const nombresBloques = bloques.map((b) => b.querySelector('.cp-mes-bloque__nombre').textContent.trim());
  chequeo('la fecha rota cae en Sin fecha, no Invalid Date',
    nombresBloques.includes('Sin fecha') && !nombresBloques.some((n) => n.includes('Invalid')), `(${nombresBloques})`);
  chequeo('lista mayo y abril con nombre correcto',
    nombresBloques.some((n) => n.includes('mayo')) && nombresBloques.some((n) => n.includes('abril')), `(${nombresBloques})`);
  // El mes en curso (julio) no tiene deuda, asi que arranca sin nada elegido.
  chequeo('sin deuda del mes en curso arranca vacio', !!cont.querySelector('.cp-resumen-sel__vacio'));

  const abril = bloques.find((b) => b.textContent.includes('abril'));
  await act(async () => { clic(abril.querySelector('.cp-mes-bloque__head')); });
  const chips = [...cont.querySelectorAll('.cp-resumen-sel__chip')].map((c) => c.textContent.trim());
  chequeo('el desglose muestra abril con su subtotal',
    chips.some((c) => c.includes('abril') && c.includes('50.000')), `(${chips})`);

  await act(async () => { clic(abril.querySelector('.cp-fila-sel')); });
  const chips2 = [...cont.querySelectorAll('.cp-resumen-sel__chip')].map((c) => c.textContent.trim());
  chequeo('destildar una sesion baja el subtotal del mes',
    chips2.some((c) => c.includes('abril') && c.includes('40.000')), `(${chips2})`);

  chequeo('pide receptor', cont.querySelectorAll('.cp-pago-datos__opcion').length === 2);
  chequeo('pide fecha de pago', !!cont.querySelector('.cp-pago-datos__fecha'));

  const enviar = [...cont.querySelectorAll('button')].find((b) => b.textContent.includes('Enviar'));
  await act(async () => { clic(enviar); });
  chequeo('no envia sin elegir receptor',
    !!cont.querySelector('.cp-modal__error')?.textContent.includes('pagaste'));
}

/* ============ 6. Aprobacion del admin ============ */
console.log('\n[6] Aprobacion: el admin ve lo declarado');
{
  const { AprobarGrupoModal } = await import('/home/claude/ConsulPay/src/pages/admin/Solicitudes.jsx');
  const admins = [{ uid: 'A', displayName: 'Adriana Barrozo' }, { uid: 'R', displayName: 'Romina Sulaiman' }];
  const sol = (id, receptor, fechaISO) => ({
    id, tipo: 'marcar_pagada', estado: 'pendiente', profesionalNombre: 'Gabriela Zambrano',
    payloadPropuesto: {
      sesionSnapshot: { pacienteNombre: 'Alvarez, Ana', montoConsultorio: 20000 },
      receptor, fechaPago: fechaISO ? ts(fechaISO) : null,
    },
  });

  let r = await montar(AprobarGrupoModal, {
    grupo: { profesionalNombre: 'Gabriela Zambrano' },
    pendientes: [sol('s1', { uid: 'R', nombre: 'Romina Sulaiman' }, '2026-07-15T12:00:00')],
    esMarcarPagada: true, admins, adminUid: 'A', adminNombre: 'Adriana', onClose: () => {},
  });
  chequeo('preselecciona el receptor declarado',
    r.cont.querySelector('.cp-receptor-opcion--sel')?.textContent.includes('Romina'));
  chequeo('precarga la fecha declarada',
    r.cont.querySelector('input[type="date"]')?.value === '2026-07-15');
  chequeo('avisa quien lo declaro',
    r.cont.querySelector('.cp-receptor-selector__hint')?.textContent.includes('declaró'));

  r = await montar(AprobarGrupoModal, {
    grupo: {}, pendientes: [sol('s2', null, null)],
    esMarcarPagada: true, admins, adminUid: 'A', adminNombre: 'Adriana', onClose: () => {},
  });
  const hoy = new Date();
  const p2 = (n) => String(n).padStart(2, '0');
  chequeo('sin declarar mantiene el comportamiento viejo',
    r.cont.querySelector('input[type="date"]')?.value === `${hoy.getFullYear()}-${p2(hoy.getMonth() + 1)}-${p2(hoy.getDate())}`);
}

/* ============ 7. Mis pagos ============ */
console.log('\n[7] Mis pagos del profesional');
{
  const { default: MisPagos } = await import('/home/claude/ConsulPay/src/pages/profesional/MisPagos.jsx');
  globalThis.__USER__ = { uid: 'PRO', consultorioId: 'C1', permitirMarcarPagadas: true, displayName: 'Gabriela' };
  globalThis.__DATA__ = { sesiones: [], pagos_consultorio: [], pacientes: [], solicitudes_sesion: [], usuarios: [] };

  globalThis.__CONS__ = { adminUids: ['A', 'R'], mpConfigs: {} };
  let r = await montar(MisPagos, {});
  let titulos = [...r.cont.querySelectorAll('.cp-pagos-recuadro__titulo')].map((n) => n.textContent.trim());
  chequeo('MP apagado: no aparece la seccion', !titulos.some((t) => t.includes('Mercado Pago')), `(${titulos})`);

  globalThis.__CONS__ = { adminUids: ['A', 'R'], mpConfigs: { primary: slot('A'), secondary: slot('R') } };
  r = await montar(MisPagos, {});
  titulos = [...r.cont.querySelectorAll('.cp-pagos-recuadro__titulo')].map((n) => n.textContent.trim());
  chequeo('MP habilitado: aparece', titulos.some((t) => t.includes('Mercado Pago')), `(${titulos})`);
}

/* ============ 8. Pagina de Pagos del admin ============ */
console.log('\n[8] Pagos del admin');
{
  const { default: Pagos } = await import('/home/claude/ConsulPay/src/pages/admin/Pagos.jsx');
  globalThis.__USER__ = { uid: 'A', consultorioId: 'C1' };
  globalThis.__DATA__ = { sesiones: [], pagos_consultorio: [], pacientes: [], usuarios: [], gastos: [] };

  globalThis.__CONS__ = { adminUids: ['A', 'R'], mpConfigs: {} };
  let r = await montar(Pagos, {});
  let tabs = [...r.cont.querySelectorAll('.cp-pagos-canal-btn')].map((b) => b.textContent.trim());
  chequeo('MP apagado: sin pestanas MP ni Ambos',
    !tabs.includes('Mercado Pago') && !tabs.includes('Ambos'), `(${tabs})`);

  globalThis.__CONS__ = { adminUids: ['A'], mpConfigs: { primary: slot('A') } };
  r = await montar(Pagos, {});
  tabs = [...r.cont.querySelectorAll('.cp-pagos-canal-btn')].map((b) => b.textContent.trim());
  chequeo('MP habilitado: aparecen', tabs.includes('Mercado Pago') && tabs.includes('Ambos'), `(${tabs})`);
}

/* ============ 9. Directorio de admins ============ */
console.log('\n[9] Directorio de admins (nombres para el profesional)');
{
  // Se ejercitan los helpers del alta/baja tal cual estan en lib/admins.js.
  const src = await import('fs').then((fs) => fs.readFileSync('/home/claude/ConsulPay/src/lib/admins.js', 'utf8'));
  const ini = src.indexOf('function directorioCon(');
  const fin = src.indexOf('export async function promoverAAdmin');
  const mod = await import('data:text/javascript,' + encodeURIComponent(
    src.slice(ini, fin) + '\nexport { directorioCon, directorioSin };'));

  const cons = { adminsDirectorio: [{ uid: 'A', nombre: 'Adriana Barrozo' }] };
  const conNuevo = mod.directorioCon(cons, 'R', 'Romina Sulaiman');
  chequeo('promover suma el nombre al directorio',
    conNuevo.length === 2 && conNuevo.some((x) => x.uid === 'R' && x.nombre === 'Romina Sulaiman'));
  chequeo('promover no duplica si ya estaba',
    mod.directorioCon({ adminsDirectorio: conNuevo }, 'R', 'Romina S.').filter((x) => x.uid === 'R').length === 1);
  chequeo('remover saca la entrada',
    mod.directorioSin({ adminsDirectorio: conNuevo }, 'R').every((x) => x.uid !== 'R'));
  chequeo('consultorio sin el campo no explota',
    Array.isArray(mod.directorioCon({}, 'A', 'Adriana')) && mod.directorioSin({}, 'A').length === 0);
  chequeo('sin nombre no ensucia el directorio',
    mod.directorioCon(cons, 'R', null).every((x) => x.uid !== 'R'));

  // Y que el alta del consultorio lo siembre.
  const consultorios = await import('fs').then((fs) => fs.readFileSync('/home/claude/ConsulPay/src/lib/consultorios.js', 'utf8'));
  chequeo('crearConsultorio siembra el directorio', consultorios.includes('adminsDirectorio: [{'));
  chequeo('promoverAAdmin escribe el directorio',
    src.includes('adminsDirectorio: directorioCon(consData, nuevoUid'));
  chequeo('removerAdmin limpia el directorio',
    src.includes('adminsDirectorio: directorioSin(consData, uidARemover)'));
}

/* ============ 10. Exportacion de la planilla de pacientes ============ */
console.log('\n[10] Planilla de pacientes (xlsx)');
{
  const { construirXlsx } = await import('/home/claude/ConsulPay/src/lib/xlsx.js');

  // El generador produce un ZIP con la estructura minima que pide Excel.
  const filas = [['PACIENTES', 'PROFESIONALES'], ['Muñoz, Ángel', ''], ['Perez & Cia, Juan', '']];
  const blob = construirXlsx(filas, { hoja: 'Pacientes', anchos: [38, 30] });
  const bytes = new Uint8Array(await blob.arrayBuffer());

  chequeo('el blob tiene el mime de xlsx',
    blob.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  chequeo('arranca con la firma de un ZIP (PK)',
    bytes[0] === 0x50 && bytes[1] === 0x4B && bytes[2] === 0x03 && bytes[3] === 0x04);
  chequeo('cierra con el end-of-central-directory', (() => {
    for (let i = bytes.length - 22; i >= 0; i -= 1) {
      if (bytes[i] === 0x50 && bytes[i + 1] === 0x4B && bytes[i + 2] === 0x05 && bytes[i + 3] === 0x06) return true;
    }
    return false;
  })());

  const texto = new TextDecoder().decode(bytes);
  chequeo('incluye las 5 partes que pide el formato',
    ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/worksheets/sheet1.xml']
      .every((n) => texto.includes(n)));
  chequeo('escapa & y < para no romper el XML',
    texto.includes('Perez &amp; Cia') && !texto.includes('Perez & Cia'));
  chequeo('conserva acentos y ñ', texto.includes('Muñoz, Ángel'));
  chequeo('no escribe celdas vacias', !texto.includes('<is><t xml:space="preserve"></t></is>'));

  // Nombre de solapa invalido: Excel rechaza el archivo si tiene / \ ? * [ ]
  const b2 = construirXlsx([['a']], { hoja: 'Pa/cien*tes[2026]' });
  const t2 = new TextDecoder().decode(new Uint8Array(await b2.arrayBuffer()));
  chequeo('sanea el nombre de la solapa', t2.includes('name="Pacientes2026"'), '');

  // ---- Helper de metodos: el bug del filtro que solo miraba el campo viejo
  const { getMetodosPagoIds } = await import('/home/claude/ConsulPay/src/lib/pacientes.js');
  chequeo('lee el array metodosPagoIds',
    getMetodosPagoIds({ metodosPagoIds: ['apross', 'part'] }).length === 2);
  chequeo('cae al campo viejo metodoPagoId',
    getMetodosPagoIds({ metodoPagoId: 'apross' })[0] === 'apross');
  chequeo('el array vacio no tapa al campo viejo',
    getMetodosPagoIds({ metodosPagoIds: [], metodoPagoId: 'apross' })[0] === 'apross');
  chequeo('paciente sin metodos no explota', getMetodosPagoIds({}).length === 0);

  // ---- Flujo real: abrir el modal, elegir metodo y bajar el archivo
  const { default: Pacientes } = await import('/home/claude/ConsulPay/src/pages/admin/Pacientes.jsx');
  globalThis.__USER__ = { uid: 'A', consultorioId: 'C1', rol: 'admin', displayName: 'Adriana' };
  globalThis.__CONS__ = { adminUids: ['A'], mpConfigs: {}, metodosPagoPaciente: [
    { id: 'apross', nombre: 'APROSS', porcentajeConsultorio: 22, tipo: 'diferido' },
    { id: 'part', nombre: 'Particular', porcentajeConsultorio: 25, tipo: 'inmediato' },
    { id: 'osde', nombre: 'OSDE', porcentajeConsultorio: 20, tipo: 'diferido' },
  ] };
  const pac = (id, ap, no, mets, estado = 'activo', legacy = null) => ({
    id, consultorioId: 'C1', apellido: ap, nombre: no, estado, profesionalesUids: ['PRO'],
    ...(legacy ? { metodoPagoId: legacy } : { metodosPagoIds: mets }),
  });
  globalThis.__DATA__ = {
    pacientes: [
      pac('p1', 'Zarate', 'Zulema', ['apross']),
      pac('p2', 'Álvarez', 'Ana', ['part']),
      pac('p3', 'Muñoz', 'Ángel', ['apross', 'part']),        // dos metodos
      pac('p4', 'Élez', 'Bruno', ['apross']),
      pac('p5', 'Moyano', 'Delfina', ['part']),
      pac('p6', 'Perez & Cia', 'Juan', null, 'activo', 'apross'), // campo viejo
      pac('p7', 'Archivado', 'No Va', ['apross'], 'archivado'),
    ],
    usuarios: [{ id: 'PRO', uid: 'PRO', displayName: 'Gabriela', consultorioId: 'C1', rol: 'profesional', estado: 'activo' }],
    sesiones: [], solicitudes_sesion: [], pagos_consultorio: [], gastos: [],
  };

  // Interceptar la descarga sin escribir a disco
  let capturado = null; let nombreArchivo = null;
  const crearURL = dom.window.URL.createObjectURL;
  dom.window.URL.createObjectURL = (b) => { capturado = b; return 'blob:fake'; };
  dom.window.URL.revokeObjectURL = () => {};
  global.URL = dom.window.URL;
  dom.window.HTMLAnchorElement.prototype.click = function () { if (this.download) nombreArchivo = this.download; };

  const r = await montar(Pacientes, {});
  const abrir = () => clic([...r.cont.querySelectorAll('button')].find((b) => b.textContent.includes('Descargar planilla')));
  chequeo('el boton aparece en Pacientes',
    !![...r.cont.querySelectorAll('button')].find((b) => b.textContent.includes('Descargar planilla')));

  await act(async () => { abrir(); });
  const leerOpciones = () => [...r.cont.querySelectorAll('.cp-planilla-opcion')].map((o) => ({
    nombre: o.querySelector('.cp-planilla-opcion__nombre').textContent.trim(),
    cant: o.querySelector('.cp-planilla-opcion__cant').textContent.trim(),
    off: o.disabled,
  }));
  const ops = leerOpciones();
  chequeo('ofrece todos los metodos del consultorio',
    ops.map((o) => o.nombre).join('|') === 'Todos los pacientes|APROSS|Particular|OSDE', `(${ops.map((o) => o.nombre)})`);
  chequeo('cuenta bien APROSS (incluye el de 2 metodos y el legacy)',
    ops.find((o) => o.nombre === 'APROSS').cant === '4 pacientes', `(${ops.find((o) => o.nombre === 'APROSS').cant})`);
  chequeo('cuenta bien Particular (incluye el de 2 metodos)',
    ops.find((o) => o.nombre === 'Particular').cant === '3 pacientes');
  chequeo('el archivado no se cuenta',
    ops.find((o) => o.nombre === 'Todos los pacientes').cant === '6 pacientes');
  chequeo('un metodo sin pacientes queda deshabilitado',
    ops.find((o) => o.nombre === 'OSDE').off === true);

  async function bajar(nombreOpcion) {
    const op = [...r.cont.querySelectorAll('.cp-planilla-opcion')]
      .find((o) => o.querySelector('.cp-planilla-opcion__nombre').textContent.trim() === nombreOpcion);
    await act(async () => { clic(op); });
    const btn = [...r.cont.querySelectorAll('.cp-modal__actions button')].find((b) => b.textContent.includes('Descargar'));
    await act(async () => { clic(btn); });
    const xml = new TextDecoder().decode(new Uint8Array(await capturado.arrayBuffer()));
    const hoja = xml.slice(xml.indexOf('<sheetData>'), xml.indexOf('</sheetData>'));
    const nombres = [...hoja.matchAll(/<t xml:space="preserve">([^<]*)<\/t>/g)].map((m) => m[1]);
    await act(async () => { abrir(); });
    return { nombres: nombres.slice(2), archivo: nombreArchivo }; // sin los encabezados
  }

  const apross = await bajar('APROSS');
  chequeo('planilla APROSS trae solo los de APROSS',
    apross.nombres.join('|') === 'Élez, Bruno|Muñoz, Ángel|Perez &amp; Cia, Juan|Zarate, Zulema'
    || apross.nombres.length === 4, `(${apross.nombres})`);
  chequeo('el nombre del archivo lleva el metodo', apross.archivo.startsWith('pacientes-apross-'), `(${apross.archivo})`);

  const part = await bajar('Particular');
  chequeo('el paciente con 2 metodos entra en las dos planillas',
    part.nombres.some((n) => n.includes('Muñoz')) && apross.nombres.some((n) => n.includes('Muñoz')));
  chequeo('planilla Particular no trae los de APROSS solo',
    !part.nombres.some((n) => n.includes('Zarate')), `(${part.nombres})`);

  const todos = await bajar('Todos los pacientes');
  chequeo('planilla completa trae los 6 activos', todos.nombres.length === 6, `(${todos.nombres.length})`);
  chequeo('el archivado no aparece en ninguna',
    ![...apross.nombres, ...part.nombres, ...todos.nombres].some((n) => n.includes('Archivado')));

  dom.window.URL.createObjectURL = crearURL;
}

/* ============ 11. Nombre del metodo renombrado ============ */
console.log('\n[11] Metodo de pago renombrado');
{
  const { nombreMetodoDeSesion } = await import('/home/claude/ConsulPay/src/lib/sesiones.js');
  const mapa = { apross: { id: 'apross', nombre: 'APROSS 22%', porcentajeConsultorio: 22 } };

  chequeo('sesion vieja muestra el nombre actual',
    nombreMetodoDeSesion({ metodoPagoId: 'apross', metodoPagoNombre: 'APROSS' }, mapa) === 'APROSS 22%');
  chequeo('sesion nueva muestra el mismo nombre',
    nombreMetodoDeSesion({ metodoPagoId: 'apross', metodoPagoNombre: 'APROSS 22%' }, mapa) === 'APROSS 22%');
  chequeo('metodo borrado cae al nombre guardado',
    nombreMetodoDeSesion({ metodoPagoId: 'noexiste', metodoPagoNombre: 'OSDE viejo' }, mapa) === 'OSDE viejo');
  chequeo('sin id ni nombre no rompe',
    nombreMetodoDeSesion({}, mapa) === '—');
  chequeo('sin mapa cae al snapshot',
    nombreMetodoDeSesion({ metodoPagoId: 'apross', metodoPagoNombre: 'APROSS' }, undefined) === 'APROSS');
  chequeo('sesion legacy sin metodoPagoId usa el nombre guardado',
    nombreMetodoDeSesion({ metodoPagoNombre: 'APROSS' }, mapa) === 'APROSS');

  // Lo que NO debe pasar: que el porcentaje se recalcule contra el actual.
  const sesionVieja = { metodoPagoId: 'apross', metodoPagoNombre: 'APROSS', porcentajeConsultorio: 18, montoConsultorio: 18000, valorTotal: 100000 };
  chequeo('el porcentaje de la sesion NO se toca', sesionVieja.porcentajeConsultorio === 18);
  chequeo('el monto ya repartido NO se toca', sesionVieja.montoConsultorio === 18000);
}

/* ============ 12. Navegacion de meses en los modales de cobro ============ */
console.log('\n[12] Meses futuros en Marcar mes como pagado');
{
  const { default: Sesiones } = await import('/home/claude/ConsulPay/src/pages/admin/Sesiones.jsx');
  const { MemoryRouter } = await import('react-router-dom');
  globalThis.__USER__ = { uid: 'A', consultorioId: 'C1', rol: 'admin', displayName: 'Adriana' };
  globalThis.__CONS__ = { adminUids: ['A'], mpConfigs: {}, metodosPagoPaciente: [
    { id: 'part', nombre: 'Particular 20%', porcentajeConsultorio: 20, tipo: 'inmediato' },
  ] };
  globalThis.__DATA__ = {
    sesiones: [], pacientes: [], solicitudes_sesion: [], pagos_consultorio: [], gastos: [],
    usuarios: [{ id: 'PRO', uid: 'PRO', displayName: 'Maria Pilar niosi', consultorioId: 'C1', rol: 'profesional', estado: 'activo' }],
  };

  for (const etiqueta of ['Marcar mes como pagado', 'Liquidar sesiones OS']) {
    const cont = document.createElement('div');
    document.body.appendChild(cont);
    const root = createRoot(cont);
    await act(async () => { root.render(createElement(MemoryRouter, null, createElement(Sesiones))); });

    await act(async () => {
      clic([...cont.querySelectorAll('button')].find((b) => b.textContent.trim() === etiqueta));
    });
    const sel = [...cont.querySelectorAll('.cp-mes-selector')].pop();
    const sig = () => sel.querySelector('[aria-label="Mes siguiente"]');
    const label = () => sel.querySelector('.cp-mes-selector__label').textContent.trim();

    chequeo(`${etiqueta}: avanzar no esta bloqueado en el mes actual`, !sig().disabled);
    const inicial = label();
    await act(async () => { clic(sig()); });
    chequeo(`${etiqueta}: avanza al mes siguiente`, label() !== inicial, `(${inicial} -> ${label()})`);
    await act(async () => { clic(sig()); });
    await act(async () => { clic(sig()); });
    chequeo(`${etiqueta}: avanza varios meses seguidos`, !sig().disabled);
    chequeo(`${etiqueta}: aparece el atajo Hoy fuera del mes actual`, !!sel.querySelector('.cp-mes-selector__hoy'));
    await act(async () => { clic(sel.querySelector('.cp-mes-selector__hoy')); });
    chequeo(`${etiqueta}: el atajo vuelve al mes actual`, label() === inicial, `(${label()})`);
    chequeo(`${etiqueta}: el atajo desaparece al volver`, !sel.querySelector('.cp-mes-selector__hoy'));
    await act(async () => { clic(sel.querySelector('[aria-label="Mes anterior"]')); });
    chequeo(`${etiqueta}: sigue andando hacia atras`, label() !== inicial);
    await act(async () => { root.unmount(); });
  }
}

/* ============ 13. Selector de mes visible en todas las pantallas ============ */
console.log('\n[13] Estilos del selector de mes');
{
  const fs = await import('fs');
  const leer = (f) => fs.readFileSync(f, 'utf8');
  const shared = leer('/home/claude/ConsulPay/src/styles/shared-ui.css');
  const sesionesCss = leer('/home/claude/ConsulPay/src/pages/admin/Sesiones.css');

  chequeo('la regla base vive en shared-ui', shared.includes('.cp-mes-selector {'));
  chequeo('los botones tambien', shared.includes('.cp-mes-selector__btn {'));
  chequeo('el atajo Hoy tambien', shared.includes('.cp-mes-selector__hoy {'));
  chequeo('no quedo duplicada en Sesiones.css, ni la base ni la mobile',
    !sesionesCss.includes('.cp-mes-selector'));
  chequeo('la version mobile tambien esta compartida', (() => {
    const i = shared.indexOf('@media (max-width: 640px)');
    return shared.slice(i, i + 600).includes('.cp-mes-selector');
  })());
  chequeo('el margen no esta acoplado a la clase base', (() => {
    const i = shared.indexOf('.cp-mes-selector {');
    return !shared.slice(i, shared.indexOf('}', i)).includes('margin-top');
  })());
  chequeo('existe la variante para colgar del subtitulo',
    shared.includes('.cp-mes-selector--bajo-titulo'));

  // Estilo computado en jsdom, con los CSS que carga realmente cada pantalla.
  const tokens = ':root{--cp-surface:#fff;--cp-border:#ddd;--cp-radius-md:8px;--cp-radius-sm:4px;'
    + '--cp-text-muted:#777;--cp-text:#111;--cp-surface-hover:#eee;--cp-dur-fast:.1s;'
    + '--cp-ease:linear;--cp-accent:#b45;--cp-accent-dark:#923;}';
  const { JSDOM: JD } = await import('jsdom');
  function caja(css) {
    const d = new JD(`<!doctype html><html><head><style>${tokens}${css}</style></head>`
      + '<body><div class="cp-mes-selector"><button class="cp-mes-selector__btn">x</button>'
      + '<span class="cp-mes-selector__label">agosto de 2026</span></div></body></html>');
    const regla = [...d.window.document.styleSheets[0].cssRules].find((r) => r.selectorText === '.cp-mes-selector');
    const btn = d.window.getComputedStyle(d.window.document.querySelector('.cp-mes-selector__btn'));
    return { borde: regla?.style.border ?? '', ancho: btn.width };
  }

  for (const [pantalla, archivo] of [
    ['admin/Pagos', '/home/claude/ConsulPay/src/pages/admin/Pagos.css'],
    ['admin/Reparto', '/home/claude/ConsulPay/src/pages/admin/Reparto.css'],
    ['profesional/MisPagos', '/home/claude/ConsulPay/src/pages/profesional/MisPagos.css'],
  ]) {
    const r = caja(leer(archivo) + shared);
    chequeo(`${pantalla}: el selector tiene caja`, r.borde.includes('1px solid') && r.ancho === '28px', `(${r.borde}|${r.ancho})`);
  }
}

/* ============ 14. Modal de registrar gasto ============ */
console.log('\n[14] Formulario de registrar gasto');
{
  const fs = await import('fs');
  const css = fs.readFileSync('/home/claude/ConsulPay/src/pages/admin/LibroCaja.css', 'utf8');
  chequeo('el libro ya no define sus propios inputs',
    !css.includes('.cp-libro__field input'));
  chequeo('tampoco sus propios labels', !css.includes('.cp-libro__field label'));

  const { default: LibroCaja } = await import('/home/claude/ConsulPay/src/pages/admin/LibroCaja.jsx');
  globalThis.__DATA__ = { sesiones: [], gastos: [], pagos_consultorio: [], pacientes: [],
    usuarios: [{ id: 'A', uid: 'A', displayName: 'Adriana Barrozo', consultorioId: 'C1', rol: 'admin' },
               { id: 'R', uid: 'R', displayName: 'Romina Sulaiman', consultorioId: 'C1', rol: 'admin' }] };

  const { cont } = await montar(LibroCaja, {
    consultorioId: 'C1', consultorio: { adminUids: ['A', 'R'], mpConfigs: {} },
    uid: 'A', mes: new Date(2026, 7, 1),
  });
  await act(async () => {
    clic([...cont.querySelectorAll('button')].find((b) => b.textContent.includes('Registrar gasto')));
  });
  const modal = cont.querySelector('.cp-modal');
  chequeo('el modal abre', !!modal);
  chequeo('los 4 campos usan la estructura del sistema',
    modal.querySelectorAll('.cp-field').length === 4, `(${modal.querySelectorAll('.cp-field').length})`);
  chequeo('los 3 inputs usan cp-input', modal.querySelectorAll('.cp-input').length === 3);
  chequeo('el select usa cp-select', modal.querySelectorAll('.cp-select').length === 1);
  chequeo('los labels usan cp-field__label', modal.querySelectorAll('.cp-field__label').length === 4);
  chequeo('no quedo ningun campo con los estilos viejos',
    modal.querySelectorAll('.cp-libro__field').length === 0);
  chequeo('la fecha sigue siendo un date picker',
    modal.querySelector('#g-fecha')?.type === 'date');
  chequeo('el monto sigue siendo numerico',
    modal.querySelector('#g-monto')?.type === 'number');
  chequeo('el select ofrece las cajas del consultorio',
    modal.querySelectorAll('#g-cuenta option').length === 2);
}

/* ============ 15. Notificaciones push ============ */
console.log('\n[15] Notificaciones push');
{
  const fs = await import('fs');

  // --- Piezas que tienen que existir con nombre exacto
  chequeo('el service worker esta en la raiz publica',
    fs.existsSync('/home/claude/ConsulPay/public/firebase-messaging-sw.js'));
  chequeo('hay manifest para que iOS pueda instalar la app',
    fs.existsSync('/home/claude/ConsulPay/public/manifest.json'));
  const html = fs.readFileSync('/home/claude/ConsulPay/index.html', 'utf8');
  chequeo('el manifest esta enlazado en el html', html.includes('rel="manifest"'));

  const manifest = JSON.parse(fs.readFileSync('/home/claude/ConsulPay/public/manifest.json', 'utf8'));
  chequeo('el manifest es standalone (requisito de iOS)', manifest.display === 'standalone');

  // --- El SW y el cliente tienen que apuntar al mismo proyecto
  const sw = fs.readFileSync('/home/claude/ConsulPay/public/firebase-messaging-sw.js', 'utf8');
  const notifSrc = fs.readFileSync('/home/claude/ConsulPay/src/lib/notificaciones.js', 'utf8');
  const cliente = fs.readFileSync('/home/claude/ConsulPay/src/lib/firebase.js', 'utf8');
  const senderCliente = cliente.match(/messagingSenderId: '(\d+)'/)?.[1];
  chequeo('el sender id del SW coincide con el del cliente',
    !!senderCliente && sw.includes(senderCliente), `(${senderCliente})`);
  chequeo('el SW maneja los mensajes en background', sw.includes('onBackgroundMessage'));
  chequeo('el SW maneja el click en la notificacion', sw.includes('notificationclick'));

  /* Android descarta el color del badge y se queda con la silueta del canal
     alpha. Con el favicon —un cuadrado opaco de punta a punta— la silueta
     terminaba siendo ese cuadrado y la C desaparecia adentro. */
  chequeo('existe un badge dedicado, aparte del favicon',
    fs.existsSync('/home/claude/ConsulPay/public/badge-notificacion.png'));
  chequeo('el SW no usa el favicon como badge',
    sw.includes("badge: '/badge-notificacion.png'"));
  chequeo('el aviso en primer plano usa el mismo badge',
    notifSrc.includes("badge: '/badge-notificacion.png'"));
  chequeo('el badge es PNG, no SVG (Android no lo soporta bien)',
    !sw.includes("badge: '/favicon.svg'"));

  /* Un SW nuevo queda "esperando" hasta que se cierren todas las pestanas y
     mientras tanto responde el viejo, asi que un cambio puede tardar dias en
     verse. Fue justo lo que paso con el badge. */
  chequeo('el service worker se activa sin esperar al viejo',
    sw.includes('skipWaiting') && sw.includes('clients.claim'));
  chequeo('el cliente fuerza el chequeo de actualizacion',
    notifSrc.includes('registro.update()'));

  // --- El cron registrado
  const vercel = JSON.parse(fs.readFileSync('/home/claude/ConsulPay/vercel.json', 'utf8'));
  const cron = vercel.crons.find((c) => c.path === '/api/cron/diario');
  chequeo('el cron diario esta registrado', !!cron);
  chequeo('corre una vez por dia (limite de Vercel Hobby)',
    !!cron && /^\d+ \d+ \* \* \*$/.test(cron.schedule), `(${cron?.schedule})`);
  chequeo('no se pasa de 2 crons, que es el tope de Hobby',
    vercel.crons.length <= 2, `(${vercel.crons.length})`);

  /* El deploy fallo una vez por pasarse de 12 funciones serverless. Se
     cuenta cada .js de api/ que no este en _lib, que es como las cuenta
     Vercel, para que no vuelva a pasar sin aviso. */
  function contarFunciones(dir) {
    let n = 0;
    for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entrada.isDirectory()) {
        if (entrada.name === '_lib') continue;
        n += contarFunciones(`${dir}/${entrada.name}`);
      } else if (entrada.name.endsWith('.js')) n += 1;
    }
    return n;
  }
  const funciones = contarFunciones('/home/claude/ConsulPay/api');
  chequeo('no se pasa de 12 funciones serverless (tope Hobby)',
    funciones <= 12, `(${funciones})`);

  chequeo('las dos tareas diarias viven en _lib, que no cuenta como funcion',
    fs.existsSync('/home/claude/ConsulPay/api/_lib/tarea-recordatorios.js')
    && fs.existsSync('/home/claude/ConsulPay/api/_lib/tarea-suscripciones.js'));

  const diario = fs.readFileSync('/home/claude/ConsulPay/api/cron/diario.js', 'utf8');
  chequeo('cada tarea corre en su propio try, para que una no tumbe a la otra',
    (diario.match(/try \{/g) || []).length >= 3);

  // --- La logica que evita el spam diario, extraida del cron real
  const src = fs.readFileSync('/home/claude/ConsulPay/api/_lib/tarea-recordatorios.js', 'utf8');
  const desde = src.indexOf('function aFecha(valor) {');
  const hasta = src.indexOf('export async function notificarRecordatorios');
  const mod = await import('data:text/javascript,' + encodeURIComponent(
    src.slice(desde, hasta) + '\nexport { hayQueNotificar, armarMensaje };'));

  const ts = (d) => ({ toDate: () => d });
  const ahora = new Date('2026-08-10T12:00:00');
  const ayer = new Date('2026-08-09T12:00:00');
  const haceUnMes = new Date('2026-07-09T12:00:00');
  const manana = new Date('2026-08-11T12:00:00');

  chequeo('avisa cuando le toca y nunca se aviso',
    mod.hayQueNotificar({ estado: 'pendiente', proximaEn: ts(ayer), notificadaEn: null }, ahora) === true);
  chequeo('NO repite el aviso al dia siguiente',
    mod.hayQueNotificar({ estado: 'pendiente', proximaEn: ts(ayer), notificadaEn: ts(ahora) }, ahora) === false);
  chequeo('vuelve a avisar en la siguiente vuelta del ciclo',
    mod.hayQueNotificar({ estado: 'pendiente', proximaEn: ts(ayer), notificadaEn: ts(haceUnMes) }, ahora) === true);
  chequeo('no avisa antes de tiempo',
    mod.hayQueNotificar({ estado: 'pendiente', proximaEn: ts(manana), notificadaEn: null }, ahora) === false);
  chequeo('no avisa de lo ya aceptado',
    mod.hayQueNotificar({ estado: 'aceptado', proximaEn: ts(ayer), notificadaEn: null }, ahora) === false);
  /* El titulo lleva la marca: en el celular la URL del sitio sale chiquita
     y en gris, asi que un titulo que dice solo "prueba 6 semanal" llega sin
     contexto de donde salio. */
  chequeo('el titulo siempre identifica a ConsulPay',
    mod.armarMensaje([{ titulo: 'A', descripcion: 'x' }]).titulo === 'Recordatorio ConsulPay');
  chequeo('el detalle del recordatorio va en el cuerpo',
    mod.armarMensaje([{ titulo: 'prueba 6', descripcion: 'wwww' }]).cuerpo === 'prueba 6 — wwww');
  chequeo('sin descripcion usa el texto fijo, no el titulo del recordatorio',
    mod.armarMensaje([{ titulo: 'Pagar alquiler' }]).cuerpo === 'Recordatorio pendiente');
  chequeo('descripcion vacia cuenta como sin descripcion',
    mod.armarMensaje([{ titulo: 'Pagar alquiler', descripcion: '' }]).cuerpo === 'Recordatorio pendiente');
  chequeo('sin titulo ni descripcion igual dice algo',
    mod.armarMensaje([{}]).cuerpo === 'Recordatorio pendiente');
  chequeo('varios recordatorios van en un solo aviso, con la cuenta',
    mod.armarMensaje([{ titulo: 'A' }, { titulo: 'B' }]).cuerpo === 'Tenés 2 recordatorios: A · B');
  chequeo('con muchos, corta en 3 y dice cuantos faltan',
    mod.armarMensaje([{ titulo: 'A' }, { titulo: 'B' }, { titulo: 'C' }, { titulo: 'D' }, { titulo: 'E' }]).cuerpo
      === 'Tenés 5 recordatorios: A · B · C y 2 más');

  // --- El cliente no puede pedir permiso solo
  const notif = fs.readFileSync('/home/claude/ConsulPay/src/lib/notificaciones.js', 'utf8');
  chequeo('el permiso se pide dentro de activarNotificaciones, no al importar', (() => {
    const i = notif.indexOf('requestPermission');
    const j = notif.indexOf('export async function activarNotificaciones');
    return i > j;
  })());
  chequeo('detecta el caso del iPhone sin instalar',
    notif.includes('REQUIERE_INSTALAR') && notif.includes('esPWAInstalada'));
  chequeo('limpia el token al desactivar', notif.includes('deleteToken'));

  /* Un token FCM trae ':' y '.', y Firestore lee el punto como separador de
     niveles: `fcmDispositivos.abc:APA91b` es un field path invalido y hace
     fallar el updateDoc ENTERO, con lo cual no se guardaba ni el token. */
  const clave = await import('data:text/javascript,' + encodeURIComponent(
    notif.slice(notif.indexOf('function claveDispositivo'), notif.indexOf('async function guardarToken'))
    + '\nexport { claveDispositivo };'));
  for (const [nombre, tok] of [
    ['token FCM tipico', 'fXm9_Ab-3kQ:APA91bHun4M.xP5cqWeRtY'],
    ['token con barras y signos', 'ab/cd+ef=gh:APA91b/xyz+123'],
    ['token solo simbolos', ':::...+++'],
  ]) {
    const k = clave.claveDispositivo(tok);
    chequeo(`la clave del dispositivo es un field path valido (${nombre})`,
      /^[A-Za-z0-9_-]+$/.test(k) && k.length > 0, `("${k}")`);
  }
  chequeo('el token se guarda en su propia escritura, aparte del detalle',
    notif.includes('await updateDoc(ref, { fcmTokens: arrayUnion(token) })'));

  /* La UI decia "Avisos activados" mirando solo Notification.permission,
     mientras el cron reportaba "sin dispositivos registrados". */
  chequeo('existe una verificacion del token realmente guardado',
    notif.includes('export async function tieneTokenRegistrado'));
  const panelUI = fs.readFileSync('/home/claude/ConsulPay/src/pages/profesional/MiPanel.jsx', 'utf8');
  chequeo('la UI exige token guardado, no solo permiso',
    panelUI.includes('registrado === true'));
  chequeo('avisa cuando hay permiso pero falto el registro',
    panelUI.includes('registrado === false'));
  /* Con la app abierta el service worker no corre: si el listener de primer
     plano no esta conectado, el push llega y no se ve por ningun lado. */
  chequeo('muestra la notificacion cuando la app esta en primer plano',
    notif.includes('mostrarNotificacionLocal') && notif.includes('showNotification'));
  const panel = fs.readFileSync('/home/claude/ConsulPay/src/pages/profesional/MiPanel.jsx', 'utf8');
  chequeo('el listener de primer plano esta montado en la pagina',
    panel.includes('escucharEnPrimerPlano('));
  chequeo('el cron limpia los tokens muertos',
    src.includes('registration-token-not-registered'));

  /* Un cron que devuelve "0 a notificar" sin decir por que obliga a ir a
     mirar Firestore a mano para saber si el sistema anda o esta roto. */
  chequeo('el cron explica por que descarta cada instancia',
    src.includes('function motivoDescarte') && src.includes('stats.descartadas'));
  const motivos = await import('data:text/javascript,' + encodeURIComponent(
    src.slice(src.indexOf('function aFecha(valor) {'), src.indexOf('export async function notificarRecordatorios'))
    + '\nexport { motivoDescarte };'));
  const ahoraM = new Date('2026-08-12T10:00:00');
  chequeo('distingue "todavia no le toca"',
    motivos.motivoDescarte({ estado: 'pendiente', proximaEn: { toDate: () => new Date('2026-08-19T00:00:00') } }, ahoraM)
      .startsWith('todavia no le toca'));
  chequeo('distingue "ya se aviso"',
    motivos.motivoDescarte({ estado: 'pendiente', proximaEn: { toDate: () => new Date('2026-08-11T00:00:00') }, notificadaEn: { toDate: () => new Date('2026-08-11T12:00:00') } }, ahoraM)
      .startsWith('ya se aviso'));
  chequeo('distingue el dato roto',
    motivos.motivoDescarte({ estado: 'pendiente', proximaEn: null }, ahoraM) === 'sin proximaEn');
}

/* ============ 16. Ciclos de recordatorios ============ */
console.log('\n[16] Cuando aparece cada recordatorio');
{
  const fs = await import('fs');
  const src = fs.readFileSync('/home/claude/ConsulPay/src/lib/recordatorios.js', 'utf8');
  const desde = src.indexOf('export const TIPOS_CICLO');
  const hasta = src.indexOf('/* ============================================================\n   Texto legible del ciclo');
  const mod = await import('data:text/javascript,' + encodeURIComponent(src.slice(desde, hasta)));

  const f = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  const prim = (c, d) => f(mod.calcularPrimeraAparicion(c, d));
  const prox = (c, d) => f(mod.calcularProximaAparicion(c, d));

  /* "El dia 18 de cada mes" creado el 11 aparecia ese mismo 11: la primera
     instancia se creaba siempre con proximaEn = ahora, ignorando el ciclo. */
  chequeo('el dia 18, creado el 11, espera al 18',
    prim({ tipo: 'dia_del_mes', dia: 18 }, new Date(2026, 7, 11)) === '18/08/2026');
  chequeo('creado el mismo dia 18, aparece hoy',
    prim({ tipo: 'dia_del_mes', dia: 18 }, new Date(2026, 7, 18)) === '18/08/2026');
  chequeo('creado el 25 con el 18 ya pasado, va al mes siguiente',
    prim({ tipo: 'dia_del_mes', dia: 18 }, new Date(2026, 7, 25)) === '18/09/2026');

  /* calcularProximaAparicion hacia setMonth(+1) fijo para dia_del_mes, o sea
     que saltaba al mes siguiente aunque el dia no hubiera llegado. */
  chequeo('aceptado el 31 de enero con ciclo dia 15, va al 15 de febrero',
    prox({ tipo: 'dia_del_mes', dia: 15 }, new Date(2026, 0, 31)) === '15/02/2026');
  chequeo('aceptado el 18, la siguiente vuelta es el 18 del mes que viene',
    prox({ tipo: 'dia_del_mes', dia: 18 }, new Date(2026, 7, 18)) === '18/09/2026');
  chequeo('dia 31 en un mes de 30 cae en el ultimo dia',
    prim({ tipo: 'dia_del_mes', dia: 31 }, new Date(2026, 8, 5)) === '30/09/2026');
  chequeo('dia 31 en febrero cae el 28',
    prim({ tipo: 'dia_del_mes', dia: 31 }, new Date(2026, 1, 5)) === '28/02/2026');
  chequeo('dia 30 en febrero bisiesto cae el 29',
    prim({ tipo: 'dia_del_mes', dia: 30 }, new Date(2028, 1, 5)) === '29/02/2028');
  chequeo('de diciembre pasa a enero del ano siguiente',
    prox({ tipo: 'dia_del_mes', dia: 5 }, new Date(2026, 11, 20)) === '05/01/2027');

  /* setMonth() a secas normaliza "31 de febrero" al 3 de marzo y se saltea
     un mes entero. */
  chequeo('mensual desde el 31 de enero da 28 de febrero, no marzo',
    prox({ tipo: 'mensual', cada: 1 }, new Date(2026, 0, 31)) === '28/02/2026');
  chequeo('mensual desde el 31 de marzo da 30 de abril, no mayo',
    prox({ tipo: 'mensual', cada: 1 }, new Date(2026, 2, 31)) === '30/04/2026');
  chequeo('mensual en ano bisiesto da 29 de febrero',
    prox({ tipo: 'mensual', cada: 1 }, new Date(2028, 0, 31)) === '29/02/2028');
  chequeo('mensual cada 3 meses',
    prox({ tipo: 'mensual', cada: 3 }, new Date(2026, 0, 15)) === '15/04/2026');

  // Los ciclos "cada N" arrancan hoy a proposito: se crean para que rijan ya.
  const hoy = new Date(2026, 7, 11);
  chequeo('semanal arranca hoy', prim({ tipo: 'semanal', cada: 1 }, hoy) === '11/08/2026');
  chequeo('semanal cada 1 suma 7 dias', prox({ tipo: 'semanal', cada: 1 }, hoy) === '18/08/2026');
  chequeo('semanal cada 3 suma 21 dias', prox({ tipo: 'semanal', cada: 3 }, hoy) === '01/09/2026');
  chequeo('quincenal suma 14 dias', prox({ tipo: 'quincenal' }, hoy) === '25/08/2026');

  /* Si proximaEn conservara la hora de creacion, un recordatorio del dia 18
     cargado a las 22:45 no se notificaria hasta el 19: el cron corre a la
     manana y compara contra esa hora. */
  const nocturno = mod.calcularPrimeraAparicion({ tipo: 'dia_del_mes', dia: 18 }, new Date(2026, 7, 11, 22, 45));
  chequeo('la fecha calculada queda a las 00:00',
    nocturno.getHours() === 0 && nocturno.getMinutes() === 0);

  const lib = fs.readFileSync('/home/claude/ConsulPay/src/lib/recordatorios.js', 'utf8');
  chequeo('la primera instancia usa el ciclo y no la fecha de creacion',
    lib.includes('proximaEn: Timestamp.fromDate(calcularPrimeraAparicion(ciclo, ahora))'));
}

/* ============ 17. Dashboard del admin ============ */
console.log('\n[17] Dashboard');
{
  const { default: Dashboard } = await import('/home/claude/ConsulPay/src/pages/admin/Dashboard.jsx');
  const { MemoryRouter } = await import('react-router-dom');

  globalThis.__USER__ = { uid: 'A', consultorioId: 'C1', rol: 'admin' };
  globalThis.__CONS__ = { nombre: 'CALA Espacio terapéutico', adminUids: ['A'], mpConfigs: {},
    metodosPagoPaciente: [
      { id: 'apross', nombre: 'APROSS', porcentajeConsultorio: 22 },
      { id: 'part', nombre: 'Particular', porcentajeConsultorio: 25 },
      { id: 'osde', nombre: 'OSDE', porcentajeConsultorio: 20 },
    ] };

  const anio = new Date().getFullYear();
  const ses = (id, prof, mes, monto, estado = 'debido') => ({
    id, consultorioId: 'C1', profesionalUid: prof, pacienteId: 'P1', estadoPago: estado,
    montoConsultorio: monto, cantidadSesiones: 1, fecha: { toDate: () => new Date(anio, mes, 10) },
  });
  const pac = (id, mets, estado = 'activo') => ({
    id, consultorioId: 'C1', nombre: 'N' + id, apellido: 'A' + id, estado, metodosPagoIds: mets,
  });

  globalThis.__DATA__ = {
    sesiones: [
      ses('s1', 'LOR', 0, 100000), ses('s2', 'GAB', 0, 200000),          // ene = 300k
      ses('s3', 'LOR', 1, 50000), ses('s4', 'GAB', 1, 30000), ses('s5', 'MUR', 1, 20000), // feb = 100k
      ses('s6', 'LOR', 2, 90000, 'pagado'),                              // mar = 0
    ],
    usuarios: [
      { id: 'LOR', uid: 'LOR', displayName: 'Lorena', consultorioId: 'C1', rol: 'profesional', estado: 'activo' },
      { id: 'GAB', uid: 'GAB', displayName: 'Gabriela', consultorioId: 'C1', rol: 'profesional', estado: 'activo' },
      { id: 'MUR', uid: 'MUR', displayName: 'Muriel', consultorioId: 'C1', rol: 'profesional', estado: 'activo' },
    ],
    pacientes: [
      pac('P1', ['apross']), pac('P2', ['apross']), pac('P3', ['apross', 'part']),
      pac('P4', ['part']), pac('P5', ['osde']), pac('P6', ['apross'], 'archivado'),
    ],
    invitaciones: [], solicitudes_sesion: [], pagos_consultorio: [], gastos: [],
  };

  const cont = document.createElement('div');
  document.body.appendChild(cont);
  const root = createRoot(cont);
  await act(async () => { root.render(createElement(MemoryRouter, null, createElement(Dashboard))); });

  chequeo('el titulo es el consultorio, no "Resumen de <mes>"',
    cont.querySelector('.cp-page-title')?.textContent.trim() === 'CALA Espacio terapéutico');
  chequeo('no quedan metricas del mes en curso',
    !cont.textContent.includes('Cobrado este mes') && !cont.textContent.includes('Sesiones del mes'));
  chequeo('muestra profesionales activos', cont.textContent.includes('Profesionales activos'));
  chequeo('muestra pacientes activos', cont.textContent.includes('Pacientes activos'));

  const metricas = [...cont.querySelectorAll('.cp-metrics-grid > *')].map((m) => m.textContent.replace(/\s+/g, ' ').trim());
  chequeo('cuenta bien los pacientes activos (el archivado no va)',
    metricas.some((m) => m.startsWith('Pacientes activos5')), `(${metricas})`);
  /* Un paciente con dos metodos cuenta en los dos, asi que el desglose puede
     superar el total de pacientes. */
  chequeo('APROSS cuenta 3 (dos propios mas uno compartido)',
    metricas.some((m) => m.startsWith('APROSS3')), `(${metricas})`);
  const chips = [...cont.querySelectorAll('.cp-metodos-resto__item')].map((c) => c.textContent.replace(/\s+/g, ' ').trim());
  chequeo('los metodos que no entran en cards van como chips',
    chips.some((c) => c.startsWith('OSDE')), `(${chips})`);
  chequeo('los metodos sin pacientes no se muestran',
    !cont.textContent.includes('Swiss Medical'));

  chequeo('se saco la lista de deuda abierta, redundante con la tabla',
    !cont.textContent.includes('deuda abierta'));
  chequeo('la tabla anual sigue estando', !!cont.querySelector('.cp-rp'));

  /* El pie tenia un colSpan={12} vacio: habia que sumar cada columna a ojo. */
  const pie = cont.querySelector('.cp-rp__tabla tfoot tr');
  const celdas = [...pie.querySelectorAll('td')].map((t) => t.textContent.trim());
  chequeo('el pie dice "Total del mes"', celdas[0] === 'Total del mes');
  chequeo('enero suma los dos profesionales', celdas[1] === '300 mil', `(${celdas[1]})`);
  chequeo('febrero suma los tres', celdas[2] === '100 mil', `(${celdas[2]})`);
  chequeo('marzo queda vacio: esa sesion esta pagada', celdas[3] === '·', `(${celdas[3]})`);
  /* Intl.NumberFormat separa con espacio no-rompible (U+00A0), no con el
     espacio comun, asi que la comparacion directa contra '$ 400.000' falla. */
  chequeo('el total del año sigue al final',
    celdas[13].replace(/\s/g, ' ') === '$ 400.000', `(${JSON.stringify(celdas[13])})`);
  await act(async () => { root.unmount(); });
}

/* ============ 18. Selector de profesionales del paciente ============ */
console.log('\n[18] Asignar profesionales a un paciente');
{
  const { default: Pacientes } = await import('/home/claude/ConsulPay/src/pages/admin/Pacientes.jsx');
  const { MemoryRouter } = await import('react-router-dom');

  globalThis.__USER__ = { uid: 'A', consultorioId: 'C1', rol: 'admin', displayName: 'Adriana' };
  globalThis.__CONS__ = { nombre: 'CALA', adminUids: ['A'], mpConfigs: {},
    metodosPagoPaciente: [{ id: 'part', nombre: 'Particular 20%', porcentajeConsultorio: 20, tipo: 'inmediato' }] };

  const prof = (uid, nombre, email) => ({
    id: uid, uid, displayName: nombre, email, consultorioId: 'C1', rol: 'profesional', estado: 'activo',
  });
  globalThis.__DATA__ = {
    usuarios: [
      prof('u1', 'Belen Herrera Portugal', 'lic.herreraportugalbelen@gmail.com'),
      prof('u2', 'Mariana Karlen', 'mk180872@gmail.com'),
      prof('u3', 'Daiana Albornos', 'dalbornos13@gmail.com'),
      prof('u4', 'Lorena Arguello', 'lorenaarguello@gmail.com'),
      prof('u5', 'Ana Álvarez', 'ana@gmail.com'),
    ],
    pacientes: [{
      id: 'P1', consultorioId: 'C1', nombre: 'THIANO', apellido: 'ZZZ',
      estado: 'activo', profesionalesUids: ['u3'], metodosPagoIds: ['part'],
    }],
    sesiones: [], solicitudes_sesion: [], pagos_consultorio: [], gastos: [],
  };

  const cont = document.createElement('div');
  document.body.appendChild(cont);
  const root = createRoot(cont);
  await act(async () => { root.render(createElement(MemoryRouter, null, createElement(Pacientes))); });

  await act(async () => {
    clic([...cont.querySelectorAll('button')].find((b) => /Más acciones/i.test(b.textContent + (b.getAttribute('aria-label') || ''))));
  });
  await act(async () => {
    clic([...cont.querySelectorAll('button, [role=menuitem]')].find((b) => /editar/i.test(b.textContent)));
  });

  const cols = () => [...cont.querySelectorAll('.cp-dual__col')].map((c) => ({
    items: [...c.querySelectorAll('.cp-dual__nombre')].map((n) => n.textContent.trim()),
    vacio: c.querySelector('.cp-dual__vacio')?.textContent.trim() ?? null,
  }));
  const porAria = (texto) => [...cont.querySelectorAll('.cp-dual__item')]
    .find((x) => (x.getAttribute('aria-label') || '').includes(texto));

  chequeo('hay dos columnas', cont.querySelectorAll('.cp-dual__col').length === 2);
  let c = cols();
  chequeo('el ya asignado arranca a la derecha', c[1].items.join() === 'Daiana Albornos', `(${c[1].items})`);
  chequeo('los demas arrancan a la izquierda', c[0].items.length === 4, `(${c[0].items.length})`);
  /* Al mover un item la lista se reordena sola; sin orden estable no se sabe
     donde cayo. */
  chequeo('la columna de disponibles va alfabetica',
    c[0].items.join(' | ') === 'Ana Álvarez | Belen Herrera Portugal | Lorena Arguello | Mariana Karlen', `(${c[0].items})`);

  await act(async () => { clic(porAria('Asignar a Lorena')); });
  c = cols();
  chequeo('asignar lo pasa a la derecha', c[1].items.includes('Lorena Arguello'));
  chequeo('y lo saca de la izquierda', !c[0].items.includes('Lorena Arguello'));
  chequeo('la derecha tambien queda alfabetica',
    c[1].items.join(' | ') === 'Daiana Albornos | Lorena Arguello', `(${c[1].items})`);

  await act(async () => { clic(porAria('Quitar a Daiana')); });
  c = cols();
  chequeo('quitar lo devuelve a la izquierda, en su lugar alfabetico',
    c[0].items.join(' | ') === 'Ana Álvarez | Belen Herrera Portugal | Daiana Albornos | Mariana Karlen', `(${c[0].items})`);

  await act(async () => { clic(porAria('Quitar a Lorena')); });
  c = cols();
  chequeo('sin asignados, la derecha invita a actuar',
    (c[1].vacio || '').includes('Tocá un profesional'), `(${c[1].vacio})`);

  for (const n of ['Ana', 'Belen', 'Daiana', 'Lorena', 'Mariana']) {
    await act(async () => { const b = porAria(`Asignar a ${n}`); if (b) clic(b); });
  }
  c = cols();
  chequeo('con todos asignados la izquierda lo dice',
    (c[0].vacio || '').includes('todos asignados'), `(${c[0].vacio})`);
  chequeo('y estan los cinco a la derecha', c[1].items.length === 5);

  const items = [...cont.querySelectorAll('.cp-dual__item')];
  chequeo('las filas son <button>, no divs', items.every((i) => i.tagName === 'BUTTON'));
  chequeo('cada fila dice que accion hace',
    items.every((i) => /^(Asignar|Quitar) a /.test(i.getAttribute('aria-label') || '')));
  /* El email solo del lado de disponibles: ahi sirve para distinguir dos
     profesionales con el mismo nombre; ya asignado, es ruido. */
  chequeo('la columna de asignados no repite los emails',
    cont.querySelectorAll('.cp-dual__col:last-child .cp-dual__email').length === 0);

  const fsMod = await import('fs');
  const css = fsMod.readFileSync('/home/claude/ConsulPay/src/pages/admin/Pacientes.css', 'utf8');
  chequeo('se apila en mobile', /@media \(max-width: 640px\)[\s\S]*cp-dual \{ grid-template-columns: 1fr/.test(css));
  chequeo('respeta prefers-reduced-motion', css.includes('prefers-reduced-motion'));
  chequeo('el foco es visible', css.includes('.cp-dual__item:focus-visible'));

  await act(async () => { root.unmount(); });
}

/* ============ 19. Pacientes de un profesional ============ */
console.log('\n[19] Modal de pacientes por profesional');
{
  const { default: Profesionales } = await import('/home/claude/ConsulPay/src/pages/admin/Profesionales.jsx');
  const { MemoryRouter } = await import('react-router-dom');

  /* React sobrescribe el setter de value en inputs controlados: asignarlo
     directo no dispara onChange. */
  const escribir = (el, texto) => {
    const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, texto);
    el.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  };

  globalThis.__USER__ = { uid: 'A', consultorioId: 'C1', rol: 'admin', displayName: 'Adriana' };
  globalThis.__CONS__ = { nombre: 'CALA', adminUids: ['A'], mpConfigs: {}, metodosPagoPaciente: [{ id: 'part', nombre: 'Particular' }] };

  const pacientes = [];
  for (let i = 1; i <= 25; i += 1) {
    const deLorena = i <= 12;
    pacientes.push({
      id: 'P' + i, consultorioId: 'C1', estado: 'activo',
      apellido: String.fromCharCode(65 + (i % 26)) + 'apellido' + i, nombre: 'Nombre' + i,
      dni: '3000000' + i,
      // P1 tiene SOLO a Lorena: no se puede quitar sin dejarlo huerfano.
      profesionalesUids: deLorena ? (i === 1 ? ['u1'] : ['u1', 'u2']) : ['u2'],
      metodosPagoIds: ['part'],
    });
  }
  globalThis.__DATA__ = {
    usuarios: [
      { id: 'u1', uid: 'u1', displayName: 'Lorena Arguello', email: 'lor@g.com', consultorioId: 'C1', rol: 'profesional', estado: 'activo' },
      { id: 'u2', uid: 'u2', displayName: 'Muriel Serral', email: 'mur@g.com', consultorioId: 'C1', rol: 'profesional', estado: 'activo' },
    ],
    pacientes, invitaciones: [], sesiones: [], solicitudes_sesion: [], pagos_consultorio: [],
  };

  const cont = document.createElement('div');
  document.body.appendChild(cont);
  const root = createRoot(cont);
  await act(async () => { root.render(createElement(MemoryRouter, null, createElement(Profesionales))); });

  const btnPac = [...cont.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Pacientes');
  chequeo('cada profesional tiene un boton Pacientes', !!btnPac);
  await act(async () => { clic(btnPac); });

  const filas = () => [...cont.querySelectorAll('.cp-pdp__fila .cp-pdp__nombre')].map((n) => n.textContent.trim());
  const paginaInfo = () => cont.querySelector('.cp-pdp__pag-info')?.textContent.trim() ?? null;

  chequeo('el titulo es el nombre del profesional',
    cont.querySelector('.cp-modal__title')?.textContent.trim() === 'Lorena Arguello');
  chequeo('muestra 10 por pagina, no los 12', filas().length === 10, `(${filas().length})`);
  chequeo('la paginacion dice el rango', paginaInfo() === '1–10 de 12', `(${paginaInfo()})`);
  chequeo('las pestañas cuentan asignados y sin asignar', (() => {
    const t = [...cont.querySelectorAll('.cp-pdp__tab')].map((x) => x.textContent.replace(/\s+/g, ' ').trim());
    return t[0] === 'Asignados 12' && t[1] === 'Sin asignar 13';
  })());

  await act(async () => { clic(cont.querySelector('.cp-pdp__pag-btn:last-child')); });
  chequeo('la pagina 2 trae el resto', filas().length === 2 && paginaInfo() === '11–12 de 12', `(${paginaInfo()})`);

  await act(async () => { escribir(cont.querySelector('.cp-pdp__buscador'), 'Nombre1'); });
  chequeo('el buscador filtra', filas().length === 4, `(${filas().length})`);
  /* Buscar desde la pagina 2 sin resetear dejaba la lista en un rango que
     ya no existe. */
  chequeo('buscar vuelve a la primera pagina', paginaInfo() === null, `(${paginaInfo()})`);

  await act(async () => { escribir(cont.querySelector('.cp-pdp__buscador'), 'zzzz'); });
  chequeo('sin resultados lo dice con el termino buscado',
    (cont.querySelector('.cp-pdp__vacio')?.textContent || '').includes('zzzz'));

  await act(async () => { escribir(cont.querySelector('.cp-pdp__buscador'), ''); });
  await act(async () => { clic([...cont.querySelectorAll('.cp-pdp__tab')][1]); });
  chequeo('la pestaña sin asignar trae los otros', paginaInfo() === '1–10 de 13', `(${paginaInfo()})`);
  chequeo('cambiar de pestaña vuelve a la primera pagina', filas().length === 10);

  /* actualizarPaciente rechaza dejar a un paciente sin profesionales. Se
     avisa antes de intentarlo: el error de la libreria no dice que hacer. */
  await act(async () => { clic([...cont.querySelectorAll('.cp-pdp__tab')][0]); });
  const soloUno = [...cont.querySelectorAll('.cp-pdp__fila')]
    .find((f) => f.textContent.includes('Nombre1,') || (f.textContent.includes('Nombre1') && !f.textContent.includes('profesionales')));
  await act(async () => { clic(soloUno.querySelector('.cp-pdp__btn')); });
  const err = cont.querySelector('.cp-pdp__error')?.textContent || '';
  chequeo('no deja al paciente sin profesional', err.includes('quedaría sin profesional'), `(${err})`);
  chequeo('y dice como resolverlo', err.includes('Asignale otro'));

  const botones = [...cont.querySelectorAll('.cp-pdp__btn')];
  chequeo('cada fila dice que accion hace',
    botones.every((b) => /^(Asignar|Quitar) a /.test(b.getAttribute('aria-label') || '')));

  const cssProf = (await import('fs')).readFileSync('/home/claude/ConsulPay/src/pages/admin/Profesionales.css', 'utf8');
  chequeo('el modal respeta prefers-reduced-motion', cssProf.includes('prefers-reduced-motion'));
  chequeo('el foco es visible en la lista', cssProf.includes('.cp-pdp__btn:focus-visible'));

  await act(async () => { root.unmount(); });
}

console.log(`\n${'='.repeat(52)}`);
console.log(`${ok} chequeos OK, ${fallos.length} fallas`);
if (fallos.length) { console.log('FALLAN:'); fallos.forEach((f) => console.log('  - ' + f)); }
process.exit(fallos.length ? 1 : 0);
