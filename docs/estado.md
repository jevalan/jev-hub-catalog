# Estado de jev-hub-catalog

Resumen de lo construido, lo medido y lo que queda. Lo generado (`README.md`,
`site/index.html`) no se edita a mano: sale de `data/assessments.json` con
`npm run build`.

## Qué es

Mapa de qué proyectos del ecosistema Jev puede servir el hub de decisión de
jevalan, con qué forma (`flow`/`exec`/`http`) y a qué coste. Nació del análisis
de `jev-awesome` y de la observación de que la mitad de ese ecosistema no tiene
una decisión que servir.

Diseño: `docs/superpowers/specs/2026-10-10-hub-scout-design.md`
Plan: `docs/superpowers/plans/2026-10-10-core-y-triaje.md`

## Comandos

```bash
node scripts/pin-catalog.mjs   # congela el universo desde el árbol de análisis
npm run fit                    # importa el eje fit del documento clasificador
npm run validate               # coherencia de fit, veredictos y evidencia
npm run triage -- --limit=N    # 1 llamada API por repo, con caché reanudable
npm run fixtures               # congela los árboles de la cohorte A
node scripts/probe.mjs --repo <o/r> --capability <cap> --jevalan <bin> --capabilities <dir> --cli <cli>
                               # mide un especialista exec sin claves y escribe runs/<fecha>-<repo>/
npm test                       # 47 pruebas
npm run build                  # genera README.md y site/index.html
```

Cero dependencias: solo stdlib de Node (>= 20). No hay `npm install`.
`GITHUB_TOKEN` es opcional: sin él son 60 llamadas por hora, y el triaje tiene
1244 objetivos, así que la caché reanudable es la que hace viable el trabajo.

## De dónde lee

El árbol de análisis vive **fuera** del repo; por defecto, como hermano
(`../jev-awesome`):

```
<fuentes>/awesome-jev/data/projects.json   → data/catalog.json
<fuentes>/docs/agents-tooling-clasificacion.md → data/fit.json
```

Toda ruta hacia allí pasa por `SOURCES` en `scripts/lib/paths.mjs`, con
`SCOUT_SOURCES` como override. `data/` no contiene rutas de máquina: el
validador lo comprueba.

## Estado publicado hoy

12 triadas · 1 evaluada (11 de las 13 analizadas están en el catálogo) · 1329 sin
tocar, de 1340 entradas visibles. **Solo toolgate se ha medido**, y sin claves: la
regla estática, el modo de fallo (que llega como `error`, nunca como permiso), la
validación de entrada y versión y el descubrimiento con su digest. No se midió lo
que depende del modelo (allow/ask con probabilidades), el plazo agotado ni el
coste. El resto es `evidence: static`, y el campo existe justo para no confundir
leer el código con ejecutarlo.

La cohorte A son los 13 proyectos analizados a mano. El detector reproduce su
columna `callable` en **13/13** contra los árboles reales congelados en
`tests/fixtures/trees/`.

| Proyecto | Decisión | Forma | Invocable |
| --- | --- | --- | --- |
| toolgate | sí | exec | cli, mcp, hook, lib |
| Canny | sí | exec | cli |
| jevwire | sí | exec | cli, mcp, hook, lib |
| skillranker | sí | exec | cli, lib (bloqueado en Windows) |
| médula | sí | http | http, lib |
| winnow | no | n/a | cli, mcp, hook, lib |
| fast-jev-compaction | no | n/a | hook, lib |
| wakegate | no | n/a | lib |
| spending-effort-with-jev | no | n/a | hook |
| switchboard | no | n/a | cli, lib |
| los 3 SDKs oficiales | no | n/a | lib |

Solo uno está adaptado de verdad en jevalan: `tool.risk` servido por el CLI de
toolgate.

## Lo que falta

- **Fase 3 — capa medida:** `probe.mjs` existe y mide especialistas `exec` sin
  claves; solo toolgate está medido. Faltan: la ruta con modelo (necesita una clave
  del usuario), y un shim para medir Canny y jevwire (skillranker está bloqueado en
  Windows).
- **Fase 4 — publicación.**
- **Triaje de los 1231 objetivos restantes**, con `GITHUB_TOKEN`.
- **Menores aplazados** (documentados en el plan, no arreglados): `esc()` no
  escapa comillas; `cost.runtime` sin validar y `callable` acepta mezclas;
  `truncated: true` de GitHub se ignora; los manifiestos se desduplican por
  nombre; `parseFit` cuenta cualquier URL de GitHub de una sección; y ningún
  test cubre la selección de `fetchManifests` ni la máquina de estados de
  `fetchEntry`.

## Cinco cosas que se aprendieron y están en el código

1. **Un estado transitorio no puede quedar cacheado.** Un 500, un token
   caducado o un timeout se tratan como no terminales: no se escriben y la
   siguiente ejecución los reintenta.
2. **La referencia por defecto del repo es `HEAD`, no `main`.** Probar solo
   `main`/`master` marcaría como desaparecido todo repo con rama `dev`.
3. **Publicar exige pasar el validador.** `npm run build` falla si los datos no
   son coherentes, así que un veredicto medido sin run no puede salir al README.
4. **Un doble no es una superficie.** El detector de `lib` miraba el árbol
   entero, así que un `src/<pkg>/__init__.py` bajo `tests/` o `fixtures/` contaba
   como la librería del proyecto. Ahora mira el mismo árbol filtrado que `hook`,
   `mcp` y `http`.
5. **Una clave legible puede colisionar.** `foo/bar-baz` y `foo-bar/baz` dan el
   mismo slug de caché y compartirían fichero. Los slugs ambiguos llevan un
   sufijo estable derivado del repo; los únicos conservan su nombre.
