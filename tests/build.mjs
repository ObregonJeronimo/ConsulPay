import * as esbuild from 'esbuild';
import { readFileSync } from 'fs';

const stubs = {
  name: 'stubs',
  setup(build) {
    build.onResolve({ filter: /\.css$/ }, () => ({ path: 'css-stub', namespace: 'stub' }));
    build.onResolve({ filter: /lib\/firebase\.js$/ }, () => ({ path: 'fb-stub', namespace: 'stub' }));
    build.onResolve({ filter: /hooks\/useAuth\.js$/ }, () => ({ path: 'auth-stub', namespace: 'stub' }));
    build.onResolve({ filter: /hooks\/useConsultorio\.js$/ }, () => ({ path: 'cons-stub', namespace: 'stub' }));
    build.onResolve({ filter: /^firebase\// }, () => ({ path: 'fbsdk-stub', namespace: 'stub' }));
    build.onLoad({ filter: /.*/, namespace: 'stub' }, (args) => {
      if (args.path === 'css-stub') return { contents: '', loader: 'js' };
      if (args.path === 'auth-stub') return { contents: 'export const useAuth = () => ({ user: globalThis.__USER__ });', loader: 'js' };
      if (args.path === 'cons-stub') return { contents: 'export const useConsultorio = () => ({ consultorio: globalThis.__CONS__, loadingConsultorio: false });', loader: 'js' };
      if (args.path === 'fb-stub') return { contents: 'export const db={}; export const auth={}; export const app={}; export default {};', loader: 'js' };
      return { contents: readFileSync(new URL('./firestore-stub.js', import.meta.url), 'utf8'), loader: 'js' };
    });
  },
};

await esbuild.build({
  entryPoints: ['suite.mjs'],
  bundle: true, format: 'esm', outfile: 'suite.bundle.mjs',
  jsx: 'automatic', plugins: [stubs],
  platform: 'node',
  external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/server', 'react-dom/client', 'jsdom', 'react-router-dom'],
  logLevel: 'warning',
});
console.log('suite bundle ok');
