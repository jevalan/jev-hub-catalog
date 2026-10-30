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
node scripts/probe-gate.mjs --repo <o/r> --cli <ruta a dist/cli.js>
                               # mide un gate de hook directamente, en un sandbox y sin claves
npm test                       # 83 pruebas
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

86 triadas · 3 evaluadas (87 de las 89 analizadas están en el catálogo) · 1253 sin
tocar, de 1340 entradas visibles. 64 son de la cohorte B: 26 de `routing`, 17 de
`review`, 12 de `gates`, 6 de `context` y 3 de `supervision`; 12 son de la cohorte
C (muestreo de `browser`, `research`, `apps` e `integrations`, ver «Muestreo de las
categorías candidatas»); este recuento crece con cada tanda. **Se han medido tres: toolgate, jev-firewall y reflex**, todos sin
claves (los dos últimos, ejecutando su CLI directamente y sin pasar por el hub; ver
«Medido: jev-firewall» y «Medido: reflex»). De toolgate se midió: la
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

## Medido: jev-firewall

Run en `runs/2026-10-30-koushik890-jev-firewall/`, 15 casos y la auditoría, todo en
verde. Es una medida **directa**: ejecuta el CLI del paquete (v0.2.1 de npm) en un
sandbox con `HOME` y cwd propios y sin ninguna clave, no a través del hub de jevalan
(no encontré un binario de jevalan en esta máquina y jev-firewall no tiene
capacidad declarada). No se ejecutan `setup` ni `install`, que escriben en `~/.claude` y
`~/.codex`.

Para reproducirla: instalar el paquete en un directorio nuevo y vacío con
`npm install jev-firewall@0.2.1 --ignore-scripts` (no declara scripts de instalación)
y lanzar `node scripts/probe-gate.mjs --repo Koushik890/jev-firewall --cli
<ruta a node_modules/jev-firewall/dist/cli.js>`.

Lo que se midió: la lista segura permite; un fichero protegido y un payload en
base64 bloquean (`check` sale con 2); sin modelo ni regla que case la respuesta es
`ask` y nunca `allow`, tampoco para `rm -rf /`; un payload ilegible es error (exit 1)
en `check` y bloqueo en `hook`; `JEVD_CODEX_ASK=deny` escala lo incierto a deny; y
cada decisión queda en el log de auditoría.

Tres hallazgos para quien escriba el shim:

1. `check` sale con 0 también para `ask`: hay que leer el JSON, no el código.
2. El hook de Claude emite `permissionDecision: "block"` y el de Codex `deny`. No se
   ha comprobado cómo trata Claude Code el valor `block`; el README del paquete
   enseña los dos vocabularios en sitios distintos.
3. Sin modelo, `rm -rf /` sale como `ask`, no como `block`: lo cierra el modelo o una
   persona, no una regla.

**No medido:** las decisiones que dependen del modelo (probabilidades y
`ask_below`), el plazo agotado o el error de red del modelo, y el coste.

## Medido: reflex

Run en `runs/2026-10-30-ursuciprian-reflex/`, 28 casos en verde, también directo y
sin claves (v0.18.2 de `@ursuciprian/reflex`, instalado en un directorio nuevo con
`--ignore-scripts`; no declara dependencias ni scripts de instalación). Se mide por
sus tres entradas: `reflex check "<cmd>"`, `reflex scan` y el hook
(`hook.mjs gate.mjs --claude|--codex --mode enforce`) con el evento por stdin. Nunca
se lanzan `run`, `setup`, `install`, `uninstall` ni `doctor`; un test lo vigila. Todo
lo que escribe cae en su directorio de estado, dentro del sandbox, y el run lista esa
huella (`footprint`).

Reproducción: `node scripts/probe-gate.mjs --repo ursuciprian/reflex --cli
<ruta a node_modules/@ursuciprian/reflex/scripts/reflex>`.

Lo que se midió, y es lo más fuerte de todo lo medido hasta ahora: **falla cerrado
de verdad**. Un evento ilegible o vacío, un `config.json` roto y un `command` que no
es texto dan `ask` en Claude y `deny` en Codex, y el fallo queda en `errors.jsonl`.
Una config mal tipada o con `mode: off` no desarma el hook instalado en enforce. Lo
que ninguna regla conoce pregunta y nunca pasa.

Hallazgos para quien escriba el shim:

1. `check` sale siempre con exit 0, sea `pass`, `ask` o `deny`: hay que leer el JSON.
   `scan` sí usa el exit (0 pasa, 2 bloquea).
2. Permitir es **no decir nada** (hook de Claude y de Codex): un shim debe traducir el
   silencio a `allow`, y tener claro que un hook que no responde también se ve así.
3. Un comando vacío da `pass`, y un evento legible pero sin comando pasa en silencio,
   mientras que uno ilegible pregunta. Las ediciones de fichero tampoco se juzgan.
4. Codex no sabe preguntar: lo que Claude pregunta, el hook de Codex lo deniega.
5. `dd` sobre un disco y la fork bomb salen como `ask`, no como `deny`.

**No medido:** el motor con modelo (`--engine jev|laya`), el plazo agotado o el error
de red del modelo, el coste, la conciencia de entorno, la política de equipo, el
perfil autónomo y los hooks de Hermes, opencode y pi. Lo medido es el motor local, que
es el de por defecto y no usa Jev.

## Lo que falta

- **Fase 3 — capa medida:** `probe.mjs` existe y mide especialistas `exec` sin
  claves, y `probe-gate.mjs` mide gates de hook; están medidos toolgate,
  jev-firewall y reflex. Faltan: la ruta con modelo (necesita una clave del usuario), un
  shim para medir Canny y jevwire (skillranker está bloqueado en Windows) y
  los demás gates y linters que fallan cerrado o traen `--dry-run`.
- **Fase 4 — publicación.**
- **Veredictos de la capa 2 (en curso, ver «Punto de retoma»).**
- **Menores aplazados** (documentados en el plan, no arreglados): `esc()` no
  escapa comillas; `cost.runtime` sin validar y `callable` acepta mezclas;
  `truncated: true` de GitHub se ignora; los manifiestos se desduplican por
  nombre; `parseFit` cuenta cualquier URL de GitHub de una sección; y ningún
  test cubre la selección de `fetchManifests` ni la máquina de estados de
  `fetchEntry`.

## Punto de retoma (2026-10-30)

### Hecho en esta sesión

- **Triaje completo:** 1244 de 1244 objetivos en `data/triage-cache/` (1227 `ok`,
  17 `gone`), sin ficheros corruptos. Se hizo con el token de `gh`
  (`GITHUB_TOKEN="$(gh auth token)" npm run triage`), que no se guarda en ningún
  fichero. Un apagón dejó un JSON cortado a mitad de escritura: si vuelve a
  ocurrir, hay que comprobar que ninguno de la caché esté truncado antes de
  relanzar, porque `existsSync` lo daría por bueno.
- **Estantería de categorías:** `data/shelf.json` más `validateShelf`, `shelfSummary`
  y la sección «Aparcado» del README, con `tests/shelf.test.mjs`. Aparca `games`,
  `demos`, `articles`, `lists`, `official` y `sdks`; deja como candidatas `agents`,
  `research`, `apps`, `integrations` y `browser`. **Aparcar no es descartar:**
  cada categoría aparcada declara qué tendría que cambiar para volver a mirarla.
  `games` queda anotada como la primera a revisar.

### Qué significa «superficie»

Es la forma en que se puede llamar a un proyecto desde fuera, y es lo que
`signal()` deduce del árbol de ficheros sin ejecutar nada (campo `callable`):
`cli`, `mcp`, `http`, `hook`, `lib` o `none`. «Con superficie» es `callable` distinto
de `none`; «invocable por proceso» es tener `cli`, `mcp` o `http`, que es lo que
`probe.mjs` puede lanzar. **Es una pista, no un veredicto:** un `cli` puede ser un
instalador y no una decisión tipada, `none` puede ser un falso negativo (sobre
todo en `http`), y el detector está calibrado solo con las 13 de la cohorte A.

### Lo que dejó el triaje

Repos de `agents` por grupo de `fit` con decisión (los de `interfaces` y `domain`
no tienen decisión que servir):

| Grupo | Repos | Con superficie | Con `cli`/`mcp`/`http` |
| --- | --- | --- | --- |
| `routing` | 80 | 52 | 27 |
| `review` | 38 | 25 | 18 |
| `gates` | 25 | 18 | 12 |
| `context` | 26 | 16 | 7 |
| `supervision` | 4 | 3 | 3 |

Son **67** candidatos medibles sin claves entre los cinco grupos. Por categoría
candidata, con superficie: `research` 172 de 275, `agents` 190 de 299, `apps` 86
de 159, `browser` 50 de 109, `integrations` 19 de 45. De `games`, 34 de 76.

### Pendiente, por orden

1. **Hecho:** commit de la estantería.
2. **Veredictos de `routing` y `review`: hechos** los 27 y los 17 con
   `cli`/`mcp`/`http` (skillranker ya era de la cohorte A). Criterio fijado:
   un launcher, proxy o SDK que decide dentro de su propio proceso es `n_a`; un
   genérico con política de confianza (`proceed`/`review`, exit de «dudó») es
   `yes`, y un cliente de transporte puro, `n_a`. En `review`, las
   herramientas devuelven colecciones: una colección con puntuación o
   probabilidad tipada por ítem es `yes`; sin salida documentada o con solo un
   escalar sin umbral, `unclear`. Todo es evidencia de README y árbol, con
   alguna sección más leída en los dudosos, sin leer el código que imprime la
   salida. `gates` está completo (los 12): un hook que lee la acción por stdin y
   devuelve `allow`/`ask`/`deny` es un `exec` con shim de envelope, como Canny y
   toolgate, y fallar abierto es un blocker (`unclear` si no se separa el fallo
   de la respuesta). `context` y `supervision` también están hechos (6 y 3): casi
   todo es memoria o bucle de agente y queda `n_a`, salvo jev-recipes (`yes`) y
   jev-skills (`unclear`). **Con esto los cinco grupos con decisión están
   clasificados** (los candidatos con `cli`/`mcp`/`http`). **Leyendo el
   código de cada uno**: el triaje solo ordena por dónde empezar. Cada veredicto
   entra en `data/assessments.json` con `cohort: "B"`, `evidence: "static"` y su
   `fit`. Después `review`, `gates`, `context` y `supervision`.
3. **Muestrear** `research`, `apps`, `integrations` y `browser` para ver si hay veta:
   **primera pasada hecha** (ver «Muestreo de las categorías candidatas»). Queda
   revisar `games` cuando toque.
4. **Decidir si se repinea el catálogo:** el triaje halló 17 `gone` y el invariante
   dice 11, es decir, 6 repos borrados desde que se congeló. Repinear obliga a
   actualizar a la vez tests, `AGENTS.md`, este documento y el plan.
5. **Sitio:** `site/index.html` no muestra todavía la sección «Aparcado», solo el
   README.

## Muestreo de las categorías candidatas

Primera pasada sobre `browser`, `research`, `apps` e `integrations`, solo leyendo
(READMEs y la caché del triaje; no se instaló ni ejecutó nada de terceros). Se
cruzó la descripción del catálogo con la señal `callable`, se bajaron 20 READMEs y
se leyó una quincena (de forma parcial en varios); 12 veredictos entran como cohorte **C**, `evidence: "static"` y
`fit: "inferred"`. Los candidatos con superficie invocable por proceso son muchos
(`research` 120, `apps` 65, `browser` 41, `integrations` 9), pero casi todos caen en
dos clases:

1. **Usos de dominio de los tres primitivos** (choice, score, noul): `yes` cuando
   hay entrada libre y salida documentada. Son `mizchi/jev-test-filter`,
   `PyModel/jev-judge-mcp`, `emreozyoruk/hush`, `sharziki/semdecide` y
   `sufianetaouil/every`. `semdecide` tiene uno de los contratos más limpios de los
   leídos hasta ahora: JSON versionado y exit 3 para «incierto» frente a exit 4 para «fallo
   del proveedor». Con reservas (`unclear`): `jev-logtriage` (solo Loki o fixtures),
   `pkg-gate` (sin clave da un veredicto simulado), `jev-pr-labeler` (taxonomía de
   otro proyecto) y `siftr` (recuperación de contenido).
2. **Motores: reimplementaciones abiertas de Jev** que sirven `/v1/systemone`
   (von, jevk5, litjev, local-jev, WaterSheep, lichen, Decis, jeff, OpenJev…). **No
   se han evaluado y es una decisión de diseño pendiente:** no son una capacidad que
   el hub sirva sino un *backend* de modelo, un papel distinto de `flow/exec/http`.
   Modelarlos obligaría a tocar el esquema; no se ha hecho. `wfzyx/von` declara estar
   **archivado** y recomienda LiquidAI/d1-omni-600M, lo que importa si se elige uno.

Los `n_a` de la muestra siguen el criterio de siempre: bucles de agente de navegador
(`jev-ultrafast`, de la que cuelgan casi todos los de `browser`), apps de extremo a
extremo (`jev-code-reviewer`) y proxies (`jev-playwright-mcp`, que sin clave pasa todo
sin comprobar).

**Lo que queda sin muestrear:** `games` (aparcada, primera a revisar), la mayor parte
de los candidatos con superficie (unos 235 entre las cuatro categorías, de los que
solo se han evaluado 12), y los linters con `--dry-run`. Medir cualquiera exige instalar código de terceros:
`wellposed` y `snifftest` están en npm sin dependencias ni scripts de instalación,
pero esperan a que se autorice.

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
