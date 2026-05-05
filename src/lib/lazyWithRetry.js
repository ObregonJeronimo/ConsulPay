// Wrapper sobre React.lazy que detecta fallas de carga de chunks dinamicos
// y recupera la pestania automaticamente.
//
// El problema que resuelve:
// Cuando hacemos un deploy nuevo a Vercel, los chunks lazy cambian de hash
// (Dashboard-AAAA.js -> Dashboard-BBBB.js). Si un usuario tenia la pestania
// abierta con la version vieja, su index.html cacheado pide Dashboard-AAAA.js
// que ya no existe en el server. Vercel responde con el index.html (200 OK
// pero MIME text/html) y el navegador tira:
//
//   Failed to load module script: Expected a JavaScript-or-Wasm module script
//   but the server responded with a MIME type of "text/html"
//
// Resultado: pantalla en blanco hasta que el usuario hace F5.
//
// Estrategia:
// 1. Si la primera carga del chunk falla, esperar 500ms y reintentar una vez.
//    Cubre cortes momentaneos de red.
// 2. Si el segundo intento tambien falla con el mismo tipo de error, asumimos
//    que es un deploy nuevo y forzamos un reload de la pagina entera. El
//    usuario ve un parpadeo pero termina en la pagina que queria, no en
//    blanco.
// 3. Usamos sessionStorage para evitar loops: si ya recargamos por este
//    motivo en esta sesion y el chunk sigue fallando, dejamos que el error
//    se propague para que el ErrorBoundary lo muestre. Asi evitamos pestania
//    recargandose sola para siempre.

import { lazy } from 'react';

const SESSION_KEY = 'cp:chunk-reload-attempted';

// Errores tipicos que tira el navegador cuando un chunk lazy ya no existe
// o el server responde con HTML en vez de JS. Chequeamos por mensaje porque
// Vite/rolldown no expone una clase de error consistente.
function isChunkLoadError(error) {
  if (!error) return false;
  const message = (error.message || '').toLowerCase();
  return (
    message.includes('failed to fetch dynamically imported module') ||
    message.includes('failed to load module script') ||
    message.includes('importing a module script failed') ||
    message.includes('expected a javascript') ||
    error.name === 'ChunkLoadError'
  );
}

export default function lazyWithRetry(importFn) {
  return lazy(() =>
    importFn().catch((firstError) => {
      if (!isChunkLoadError(firstError)) {
        // No es un error de chunk: lo dejamos propagar normal.
        throw firstError;
      }

      // Reintento corto, por si fue un blip de red.
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          importFn()
            .then(resolve)
            .catch((secondError) => {
              if (!isChunkLoadError(secondError)) {
                reject(secondError);
                return;
              }

              // Segundo intento fallido. Probablemente es un deploy nuevo.
              const alreadyTried = sessionStorage.getItem(SESSION_KEY);

              if (alreadyTried) {
                // Ya recargamos antes en esta sesion y sigue fallando.
                // Algo mas raro esta pasando: dejamos que el ErrorBoundary
                // lo maneje, no entramos en loop.
                reject(secondError);
                return;
              }

              sessionStorage.setItem(SESSION_KEY, '1');
              window.location.reload();
              // No resolvemos ni rechazamos: la pagina se va a recargar
              // antes de que React intente renderizar nada.
            });
        }, 500);
      });
    }),
  );
}

// Util opcional: limpiar el flag despues de un load exitoso, para que
// la proxima vez que falle (en otro deploy) tambien tenga su recarga
// gratis. Lo llamamos desde App.jsx en el primer render exitoso.
export function clearChunkReloadFlag() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // Ignoramos: si sessionStorage no esta disponible no hay drama.
  }
}
