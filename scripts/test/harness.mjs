/**
 * Harness compartido para los tests de comportamiento.
 *
 * Monta componentes REALES en jsdom con Firebase stubeado. Lo que se
 * stubea es solo la frontera de red; la logica que se testea es la del
 * archivo de verdad.
 *
 * OJO con los stubs: si un stub tiene otra firma que la funcion real, el
 * test pasa y la app rompe. Por eso verificarFirmas() compara, contra el
 * codigo fuente, que cada funcion stubeada exista y reciba la misma
 * cantidad de argumentos.
 */
import { readFileSync } from 'fs';

/*
  jsdom se importa aca adentro y no arriba a proposito: los tests de firmas
  y de logica no necesitan DOM, y si el import fuera de modulo estarian
  fallando por una dependencia que ni usan.
*/
export async function crearDom() {
  const { JSDOM } = await import('jsdom');
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true });
  global.window = dom.window;
  global.document = dom.window.document;
  Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true });
  global.HTMLElement = dom.window.HTMLElement;
  global.Element = dom.window.Element;
  global.Node = dom.window.Node;
  global.IS_REACT_ACT_ENVIRONMENT = true;
  class RO { observe() {} unobserve() {} disconnect() {} }
  global.ResizeObserver = RO;
  dom.window.ResizeObserver = RO;
  return dom;
}

/**
 * Compara las funciones que un stub reemplaza contra las reales.
 * @param {Array<[archivo, nombre, aridad]>} esperado
 */
export function verificarFirmas(esperado) {
  const fallas = [];
  for (const [archivo, nombre, aridad] of esperado) {
    const src = readFileSync(archivo, 'utf8');
    const re = new RegExp(`export (?:async )?function ${nombre}\\s*\\(([^)]*)\\)`);
    const m = src.match(re);
    if (!m) { fallas.push(`${nombre} no existe en ${archivo}`); continue; }
    // Contar argumentos respetando desestructuracion: { desde, hasta } es
    // UN argumento, no dos. Sin esto el chequeo da falsos positivos.
    let nivel = 0; let args = m[1].trim() ? 1 : 0;
    for (const ch of m[1]) {
      if (ch === '{' || ch === '[') nivel++;
      else if (ch === '}' || ch === ']') nivel--;
      else if (ch === ',' && nivel === 0) args++;
    }
    if (args !== aridad) {
      fallas.push(`${nombre}: el stub asume ${aridad} argumento(s), la real recibe ${args}`);
    }
  }
  return fallas;
}

export function crearTester(nombreSuite) {
  let fallas = 0;
  console.log(`\n=== ${nombreSuite} ===`);
  return {
    ck(desc, ok) {
      if (!ok) fallas++;
      console.log(`  ${ok ? 'OK   ' : 'FALLA'} ${desc}`);
    },
    seccion(t) { console.log(`  -- ${t}`); },
    get fallas() { return fallas; },
  };
}
