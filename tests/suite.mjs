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

console.log(`\n${'='.repeat(52)}`);
console.log(`${ok} chequeos OK, ${fallos.length} fallas`);
if (fallos.length) { console.log('FALLAN:'); fallos.forEach((f) => console.log('  - ' + f)); }
process.exit(fallos.length ? 1 : 0);
