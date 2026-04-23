import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Elevamos el umbral del warning de chunk size. Con code splitting por
    // ruta más chunks de vendor, ya no deberíamos ver chunks gigantes, pero
    // Firebase sigue pesando ~300 KB y eso es inevitable sin cambiar de SDK.
    chunkSizeWarningLimit: 700,

    rollupOptions: {
      output: {
        // Separamos las dependencias pesadas en chunks propios. Esto mejora
        // el cacheo del navegador: si actualizamos código de la app pero no
        // tocamos las libs, los usuarios que ya descargaron firebase-chunk
        // no vuelven a bajarlo.
        //
        // rolldown (el bundler de Vite 8) requiere manualChunks como función.
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('firebase') || id.includes('@firebase')) {
              return 'firebase';
            }
            if (id.includes('react') || id.includes('scheduler')) {
              return 'react-vendor';
            }
          }
        },
      },
    },
  },
})
