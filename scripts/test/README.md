# Tests

```bash
node scripts/test/run.mjs      # todo; sale con 1 si algo falla
```

Los de layout necesitan navegador. Si no están estas dependencias se saltean
solos, así la batería corre igual en cualquier máquina:

```bash
npm i -D esbuild @sparticuz/chromium puppeteer-core --no-save
```

## Qué cubre

| Test | Qué verifica |
|---|---|
| `firmas.test.mjs` | Que los stubs no se hayan desincronizado de las funciones reales |
| `logica.test.mjs` | Motor de repetición de turnos y armado del libro de caja |
| `../audit-responsive.mjs` | Que ninguna tabla se recorte en el ancho donde se muestra |

`firmas.test.mjs` existe por el agujero clásico de testear con mocks: si un
stub asume otra firma que la función real, el test queda verde y la app
rompe. Compara nombre y cantidad de argumentos contra el código fuente.

## Qué NO cubre

- **Firestore real.** Todo corre con la red stubeada. Que las reglas no
  bloqueen un flujo, o que los datos reales tengan formas que los mocks no
  contemplan, sólo sale usándolo.
- **Flujos completos punta a punta** (invitar → aceptar → agendar → aprobar).
- **Los componentes de página** salvo por su layout. Los tests de
  comportamiento de UI se escribieron a mano al construir cada feature y no
  quedaron versionados; si se vuelve a tocar Sesiones, Calendario o el libro
  de caja, conviene sumarlos acá en vez de rehacerlos cada vez.
