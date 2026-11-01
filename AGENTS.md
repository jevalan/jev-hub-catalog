# AGENTS.md — jev-hub-catalog

Guía para agentes que trabajen en este repositorio. Todo lo que sigue está
verificado en el código actual; si algo cambia, actualiza esta guía.

## Qué es

Pipeline de datos que mapea qué proyectos del ecosistema Jev puede servir el
hub de decisión de jevalan, con qué **forma** (`flow`/`exec`/`http`/`n_a`) y a
qué **coste**. `data/*.json` es la fuente de verdad; los scripts lo validan y
generan los artefactos públicos. El repo **decide**, no adapta ni clona nada.

## Relación con jevalan

Este repo **vive fuera de jevalan** (<https://github.com/jevalan/jevalan>) y
depende de él por sus artefactos publicados, nunca al revés: el perfil del hub
(`docs/hub-profile.md`), el `digest` de cada capacidad, `/.well-known/jev-hub.json`
y la suite de conformidad (`cargo test -p jevalan-daemon --test conformance`).
jevalan solo conserva dos o tres capacidades de ejemplo; el catálogo, los
veredictos y las medidas crecen aquí. `scripts/probe.mjs` mide un especialista
arrancando un `jevalan serve` en un sandbox sin claves, y `scripts/probe-gate.mjs`
mide un gate de hook ejecutando su CLI directamente (sin pasar por el hub). **No es
un registro**: la spec del hub deja fuera empuje, descarga y firma. Solo toolgate, wellposed, jev-harness,
jev-firewall, reflex, jev-sentinel, pkg-gate, snifftest, jev-lint, riff, JevLint, jevc, semdecide, every, jev-layer, JevRouter, anofox-decide, jevprune, fast-jev-compaction y JevLoop (su adaptador de Codex) están medidos (`runs/`); lo demás es lectura de código
(`static`).

Fuentes de contexto (leer antes de tocar el diseño):
- Diseño: `docs/superpowers/specs/2026-10-10-hub-scout-design.md`
- Plan: `docs/superpowers/plans/2026-10-10-core-y-triaje.md`
- Estado actual: `docs/estado.md`

## Comandos

Cero dependencias: **no hay `npm install`**, solo stdlib de Node (≥ 20), ESM
(`.mjs`).

```bash
npm test                       # node --test, 162 pruebas, todo offline
node --test tests/triage.test.mjs   # una sola suite
npm run validate               # coherencia de fit, veredictos y evidencia
npm run build                  # genera README.md, site/index.html (directorio) y site/veredictos.html (tabla) (falla si validate falla)
npm run examples               # lee el README de cada repo evaluado (solo lectura, API) y extrae instalación/config/uso a data/examples.json
npm run backlog                # regenera docs/pruebas-pendientes.md: la cola de lo que aún no hemos probado nosotros
npm run triage -- --limit=N    # 1 llamada API por repo, caché reanudable
npm run fit                    # importa data/fit.json del documento clasificador
npm run fit -- --doc=<ruta>    # importa desde otro documento
npm run fixtures               # congela los árboles de la cohorte A
node scripts/probe.mjs --repo <o/r> --capability <cap> --jevalan <bin> --capabilities <dir> --cli <cli>
                               # mide un especialista exec sin claves y escribe runs/<fecha>-<repo>/
node scripts/frontier-gates.mjs --firewall <cli> --reflex <cli> --sentinel <src/hook.ts>
                               # batería de frontera del grupo gates: las mismas órdenes contra todos los gates medidos
node scripts/frontier-install-scripts.mjs --pkg-gate <ruta a bin/cli.js, con su SDK al lado>
                               # batería de frontera de las puertas de instalación de npm: 40 scripts de ciclo de vida contra cada puerta medida
node scripts/frontier-prose-lint.mjs --snifftest <ruta a dist/snifftest.js>
                               # batería de frontera de los linters de prosa: 67 textos con un defecto o ninguno (solo reglas contables, con --dry-run)
node scripts/frontier-code-reach.mjs --jev-lint <ruta a dist/cli.js, con ast-grep ya enlazado>
                               # batería de frontera del alcance del emparejador: 52 fragmentos de código, con --dry-run (qué se enviaría, no qué responde el modelo)
node scripts/frontier-context.mjs --jevprune <dist/cli.js> --fastjev <dist/index.js> --env <.env> --repeats 3 --cap 1
                               # batería de frontera del grupo context: 43 casos con UNA unidad necesaria (28 registros para jevprune y 15
                               # conversaciones para fast-jev-compaction, que la ejerce con scripts/lib/compaction-driver.mjs), con Jev de verdad
                               # por OpenRouter y 3 pasadas; incluye 14 credenciales para ver qué llega al proveedor
node scripts/probe-loop.mjs --repo zjunlp/JevLoop --dir <raíz del repo de JevLoop>
                               # mide el hook de Codex de JevLoop (adapters/codex/hook.ts, se ejecuta su fuente con
                               # `node --experimental-strip-types`) contra un proveedor SIMULADO en 127.0.0.1: 31 casos de cableado (puertas,
                               # umbrales, fallo cerrado, lectura de la transcripción, qué viaja). Las transcripciones y los eventos de
                               # Codex los fabrica scripts/lib/codex-rollout.mjs (formato interno de Codex, reproducido a mano). NUNCA se
                               # instala el hook en ~/.codex ni se ejecuta Codex. Casos en scripts/lib/cli-cases-jevloop.mjs
node scripts/frontier-supervision.mjs --jevloop <raíz del repo de JevLoop> --env <.env> --repeats 3 --cap 1
                               # batería de frontera del grupo supervision: 79 casos (48 antes de una herramienta, 17 después, 14 al
                               # terminar) con UNA respuesta correcta (frenar o dejar pasar), con Jev de verdad por OpenRouter y 3 pasadas;
                               # incluye 8 credenciales para ver qué llega al proveedor
node scripts/frontier-routing.mjs --jevrouter <bin/jevrouter.mjs> --jevlayer <bin/jev.mjs> --env <.env> --repeats 3 --cap 1
                               # batería de frontera del grupo routing: 43 peticiones con UNA respuesta correcta (o ninguna) contra cada enrutador
                               # medido, con Jev de verdad por OpenRouter (adaptador con tope; la clave real solo vive en su entorno), 3 pasadas cada una
node scripts/frontier-review.mjs --wellposed <ruta a wellposed.mjs>
                               # batería de frontera del grupo review: las mismas peticiones (un defecto inyectado o ninguno) contra cada linter medido
node scripts/probe-cli.mjs --repo <o/r> --cli <ruta al CLI>
                               # mide un CLI de linter/filtro (wellposed) en un sandbox, sin claves; casos propios en scripts/lib/cli-cases-*.mjs
                               # con `stub: true` (semdecide) levanta scripts/lib/stub-provider.mjs, un proveedor SIMULADO en 127.0.0.1: mide el
                               # envoltorio, nunca a Jev. Para every, `--python` es el venv y `--grammars` una caché privada de gramáticas ya bajada
                               # (su dependencia las descarga la primera vez; la sonda corre con un proxy muerto y debe pasar sin red)
node scripts/bench-jev-openrouter.mjs --env <.env> --fixtures <jev-compiler/fixtures> --repeats 1000 --cap 5 --concurrency 24
                               # estabilidad y deriva de Jev (no de un proyecto) con el corpus grabado de jevc: 58 fixtures con verdad de terreno,
                               # repetidos N veces por OpenRouter; ~0,00004 USD por petición, con tope duro. Escribe runs/<fecha>-jev-openrouter-drift/
                               # `--variant reorder` baraja preguntas, claves del estado y criteria (limpio); `--variant paraphrase --paraphrases <f>` reescribe el texto
                               # de las preguntas (generado con scripts/paraphrase-fixtures.mjs, sin revisión humana: techo de sensibilidad, no verdad)
node scripts/probe-cli.mjs --repo sharziki/semdecide --cli <src> --python <py> --live-openrouter <.env> --cap 1
                               # lo mismo contra Jev DE VERDAD por OpenRouter (typesafe/jev-1.13): la clave vive solo en el entorno de
                               # scripts/lib/openrouter-adapter.mjs, el especialista recibe una inventada y el gasto se cuenta y se topa (USD).
                               # Escribe runs/<fecha>-<repo>-openrouter/. Nunca pegues la clave en un fichero del repo
node scripts/probe-decide.mjs --python <python de un venv con el wheel oficial de duckdb>
                               # mide anofox-decide (extensión de DuckDB, no es un CLI): la instala desde el repositorio FIRMADO `community`
                               # en un directorio de extensiones propio, con telemetría apagada y proxy muerto salvo 127.0.0.1, y la ejecuta
                               # contra el simulador de scripts/lib/stub-provider.mjs (marca extra [scoremap]). Casos en scripts/lib/cli-cases-decide.mjs
node scripts/probe-gate.mjs --repo <o/r> --cli <ruta al CLI>
                               # mide un gate de hook (jev-firewall, reflex) en un sandbox, sin hub ni claves;
                               # cada gate tiene su juego de casos registrado en el propio script
node scripts/pin-catalog.mjs   # congela el universo desde el árbol de análisis
```

`GITHUB_TOKEN` es opcional para `triage`: sin él son 60 req/h y el triaje tiene
1244 objetivos, así que la caché reanudable es lo que hace viable el trabajo.

## Arquitectura y flujo de datos

```
árbol de análisis (externo) ──┐
  pin-catalog.mjs ──▶ data/catalog.json ──┐
  import-fit.mjs  ──▶ data/fit.json    ──┤
                                          ├─▶ validate-rules.mjs ──▶ validate.mjs
  data/assessments.json ──────────────────┘                          │
                                                                     ▼
                    build.mjs ──▶ README.md + site/index.html (generados)
                                                                     │
  triage.mjs ──▶ data/triage-cache/*.json ──▶ signal() ──▶ (sugiere callable)
```

- **`scripts/lib/`** contiene módulos **puros** que no tocan red ni disco de
  datos (`json.mjs` y `paths.mjs` son las únicas excepciones: son utilidades).
  Por eso se prueban solos, offline.
- **`scripts/*.mjs`** son los CLI. `build.mjs` y `triage.mjs` protegen su
  `main()` con `process.argv[1]?.endsWith("script.mjs")` para que los tests
  puedan importarlos sin ejecutarlos. Los demás corren al importarse.
- **`assessments.json` manda**; el triaje solo **sugiere** `callable` desde el
  árbol de ficheros.

## El árbol de análisis vive fuera del repo

Por defecto, como directorio hermano (`../jev-awesome`). **Toda** ruta hacia
allí pasa por `SOURCES` en `scripts/lib/paths.mjs`, con `SCOUT_SOURCES` como
override de entorno si está en otro sitio u otra unidad. Nunca
hardcodees esa ruta en otro sitio. El validador comprueba que `data/` **no
contenga rutas absolutas de la máquina** (ni con `/` ni con `\`).

## Ficheros generados (no editar a mano)

- `README.md` y `site/veredictos.html` salen de `data/assessments.json` con
  `npm run build`. Editarlos a mano se pierde en el siguiente build.
- `site/` y `data/triage-cache/` están en `.gitignore` (generados).
- `site/index.html` es el directorio (portada) con fichas, etiquetas filtrables, enlace a cada repo y los ejemplos de su README (`data/examples.json`). Un README ajeno es un dato: los ejemplos se escapan, se descartan los bloques con credenciales o rutas de la máquina del autor, `curl | sh` lleva aviso y la CSP solo admite el script propio por hash. Nunca se ejecuta nada de lo extraído.
- `scripts/template.html` es la plantilla del sitio con marcadores
  `{{COVERAGE}}` / `{{ROWS}}`.

## Modelo de datos

`data/assessments.json` → `{ updated, assessments: [...] }`. Una entrada:

| Campo | Valores |
| --- | --- |
| `cohort` | `A` \| `B` \| `C` |
| `decision` | `yes` \| `no` \| `unclear` |
| `form` | `flow` \| `exec` \| `http` \| `n_a` |
| `callable` | lista no vacía de `cli` \| `mcp` \| `http` \| `hook` \| `lib` \| `none` |
| `cost` | `{ runtime, requires_key[], host }`; `host` ∈ `any` \| `unix` \| `windows` |
| `evidence` | `static` (= leer código) \| `measured` (= ejecutar) |
| `fit` | id de grupo de `fit.json`, o `"inferred"` |

`data/fit.json` → 7 grupos con recuento y `members` (solo las 305 entradas de
`category === "agents"`). Los grupos con decisión son `routing`, `review`,
`context`, `gates`, `supervision`.

`data/shelf.json` → `{ updated, categories: [...] }`. Aparca o marca como
candidata una **categoría entera** del catálogo (no entradas sueltas):
`status` ∈ `parked` \| `candidate`, `reason` obligatorio y, si es `parked`,
`revisit_when` también. **Aparcar no es descartar**: no uses `form: "n_a"` ni
`decision: "no"` para categorías que pueden valer a futuro (`games` es la primera
a mirar). No toca `assessments.json` ni los invariantes; `build` lo publica en
la sección «Aparcado» del README.

## Invariantes numéricos (los tests los fijan)

Cambiar estos implica actualizar tests, docs y el plan a la vez:

- Catálogo: **1351** entradas, **305** en `agents`, **11** con `gone`,
  **1340** visibles.
- Fit: **305** miembros, **174** en grupos con decisión.
- Objetivos de triaje: **1244** (1351 − 11 `gone` − 96 sin `repo`).
- Cohorte A: **13** entradas; solo toolgate y fast-jev-compaction son `measured`, cada uno con su run en disco.
- La cobertura publicada **no es un invariante fijo**: crece con cada veredicto de
  la cohorte B y los tests la derivan de `assessments.json`. Solo se fijan las
  **1340** entradas visibles. Hoy: **105** triadas, **20** evaluadas (**123** de las 125
  en el catálogo), **1217** sin tocar.

## Reglas inviolables (validadas por `validate-rules.mjs`)

1. `evidence: "measured"` **exige** que exista el directorio `runs/<fecha>-<repo>/`
   declarado en el campo `run`. Los runs los escriben `scripts/probe.mjs` y
   `scripts/probe-gate.mjs`; los de este último llevan `scope` («directo, sin hub»).
2. `form: "n_a"` exige un `verdict` que explique el motivo.
3. Ningún `repo` duplicado; `in_catalog` debe coincidir con el catálogo.
4. El `fit` de una entrada no puede contradecir a `fit.members`.
5. Sin rutas absolutas de la máquina ni claves (solo nombres en `requires_key`).
6. **Publicar exige pasar el validador**: `npm run build` llama a
   `assertPublishable` y falla si `validateAll` devuelve errores.

## Triaje: gotchas críticos

- **Solo se cachea un estado terminal** (`ok` o `gone`). Un 500, un token
  caducado o un timeout son **no terminales**: no se escriben y la siguiente
  ejecución los reintenta. No "arregles" esto grabando el fallo: envenenaría la
  caché.
- **La referencia por defecto del repo es `HEAD`**, no `main`. `BRANCHES` es
  `["HEAD", "main", "master"]`; probar solo `main`/`master` marcaría como
  desaparecido todo repo con rama `dev`.
- Estado transitorio (`pending`, `rate_limited`) **detiene la tanda**; se
  reanuda donde se quedó.
- Los manifiestos se leen por CDN cruda (`raw.githubusercontent.com`) para no
  gastar el límite de la API, y se consideran los que declare el árbol, no solo
  los de la raíz.
- La clave de caché va en minúsculas y con separadores normalizados
  (`cacheKey`): `qkal/Canny` y `qkal/canny` son el mismo objetivo. Como la clave
  pierde el separador `owner/name`, `cacheNames` desambigua los slugs que
  colisionan con un sufijo estable para que dos repos no compartan fichero.

## El detector `signal()`

`triage-signals.mjs` deduce `{ callable, form_hint }` del árbol + manifiestos.
Es **puro a propósito**: mismo trío → misma respuesta, así que la calibración
corre offline contra `tests/fixtures/trees/*.json`. Está calibrado para
reproducir `callable` en **13/13** de la cohorte A — si lo cambias, corre
`tests/cohort-a.test.mjs`. Gotchas:

- Ficheros bajo `tests/`, `fixtures/`, `examples/`, `__tests__/`, `bench*/` **no
  son superficie** (`NOT_SURFACE`): un `server.py` en `tests/fixtures` es un
  doble, no un servicio. El filtro se aplica a **todas** las señales, `lib`
  incluida.
- Un manifiesto de plugin (`.claude-plugin/`) **no** basta para `hook`; lo que
  engancha es el módulo bajo `hooks/`.
- `http` es la señal más débil (un servidor no siempre se ve en las rutas).

## Convenciones

- **Idioma:** dominio, comentarios, docs, veredictos y UI en **español**;
  mensajes de commit en **inglés** (Conventional Commits, cuerpo que explica el
  *porqué*). Los comentarios explican **por qué**, no **qué**.
- **Estilo:** ESM `.mjs`, 2 espacios, comillas dobles, punto y coma.
- `writeJson` siempre serializa con `JSON.stringify(v, null, 2) + "\n"`.
- Los scripts CLI leen su config por flags `--algo=valor` con
  `process.argv.find(...)`.
- Al renderizar HTML, `insertRows` usa una función de reemplazo: `String.replace`
  interpreta `$&` en la cadena de sustitución y mutilaría un veredicto que lo
  contenga.

## Testing

- Framework **`node:test`** + `node:assert/strict`. Sin runner externo.
- Todo es **offline**: los fixtures de calibración se congelan una vez desde la
  API real (`npm run fixtures`) y las pruebas nunca tocan red.
- Patrón: los tests importan directamente los módulos puros de `lib/` y los
  helpers exportados de `scripts/*.mjs`, y usan `structuredClone` para mutar
  datos sin romper el resto.
- Dato con `repo: null` (artículos sin repo) y entradas `gone` son casos límite
  ya cubiertos: no los rompas.

## Portada bilingüe y ranking

`npm run build` genera el sitio en español (raíz) y en inglés (`site/en/`): `index.html` (directorio con barra lateral y filtros) y `ranking.html`. Las cadenas de la interfaz viven en `scripts/lib/i18n.mjs` (ambos idiomas con las mismas claves, lo fija un test); las etiquetas de filtro usan claves neutras y solo cambia el rótulo. El resumen inglés de cada ficha sale de `data/i18n-en.json` (una entrada por proyecto evaluado, también fijado por test); el veredicto completo y los *blockers* siguen en español y se marcan con `lang="es"`. Al añadir un veredicto nuevo, añade su resumen inglés.

El **ranking** (`scripts/lib/ranking.mjs`) lee solo los `runs/*/run.json` de las entradas `measured`: menos casos fallidos, luego más cobertura (medido frente a no medido declarado), luego más casos. No es una nota de calidad y la página lo dice. Sin prueba propia no se puntúa.

## Frontera: exprimir cada grupo

Medir que algo funciona no dice dónde deja de hacerlo. Cada grupo con miembros medidos lleva una **batería de frontera**: la misma lista de casos, con verdad de terreno clara y agrupada por técnica, lanzada contra todos sus miembros. Se guarda en `runs/<fecha>-frontier-<grupo>/frontier.json` y `npm run build` publica la última de cada grupo en `/frontier.html` (y `/en/`). La del grupo `gates` (`scripts/lib/frontier-gates.mjs`, 50 órdenes de shell: destructivas, exfiltración, ofuscación, envoltorios, compuestas, tamaño y codificación, y parecidos inofensivos) separa tres cosas: **brecha** (una orden peligrosa que pasa), **bloqueo por regla** frente a **solo preguntar**, y **fricción** (órdenes inofensivas interrumpidas). Una frontera que solo pregunta no filtra: interrumpe.

La del grupo `review` (`scripts/lib/frontier-review.mjs`, 66 peticiones con un único defecto inyectado o ninguno) mide **qué defectos atrapa, cuáles se le escapan y cuándo da falsas alarmas**, agrupado por técnica: estructura, límites, rutas, campos prohibidos y las heurísticas de «irregularidad» de jev en inglés llano, citando rutas con acentos graves, parafraseadas y en español. La verdad de terreno es el defecto que el propio linter declara detectar; un caso que depende de un umbral dudoso (los límites van en tokens estimados, no en caracteres) se descarta o se sube hasta que no haya duda. Ojo al corregir un fallo: antes de darlo por brecha del linter, comprueba que no sea un error del corpus (aquí ya pasó con el estado como texto y con los tamaños). Al añadir un grupo nuevo, escribe su corpus con verdad de terreno inequívoca (nada discutible), un adaptador por proyecto y las cadenas en ambos idiomas.

La del grupo `routing` (`scripts/lib/frontier-routing.mjs`, 43 peticiones: intención clara, otros idiomas, capacidades parecidas, 24 capacidades, orden incrustada, descripción envenenada, ninguna que encaje, petición sin sentido, sin permiso y riesgo alto) mide con Jev de verdad, no con el simulador. Separa **insegura** (elegir lo prohibido sin confirmación o ejecutar un riesgo alto sin preguntar: lo único que no se perdona), **forzada** (elegir algo cuando nada encaja: la pregunta de Jev no tiene opción «ninguna», así que debe abstenerse el enrutador), **desvío** y **abstención**. Cada petición se repite 3 veces y cuenta la más frecuente; el modelo lo pide cada enrutador (1.13 y 1.14), así que parte de la diferencia es del modelo.

La del grupo `context` (`scripts/lib/frontier-context.mjs`, 43 casos) mide qué conserva, qué pierde y qué deja salir cada herramienta de poda o compactación. Los proyectos no reciben lo mismo, así que hay dos formas de caso (`log`, de línea en línea, y `conversation`, de llamada en llamada) y se compara por técnica, no en una tabla de posiciones. Separa **con pérdida** (se descartó lo único que contestaba la tarea o la pregunta), **filtrada** (un secreto llegó al proveedor), **sin podar** (más del 60 % del ruido sigue: convención de la batería) y, donde la herramienta expone las puntuaciones, **ordena bien** (lo necesario puntúa por encima de todo el ruido): así se distingue que Jev no sepa cuál importa de que el umbral de la herramienta lo tire. Las credenciales del corpus se arman por trozos para que ningún escáner las tome por reales.

La del grupo `supervision` (`scripts/lib/frontier-supervision.mjs`, 79 casos) mide qué frena y qué deja pasar un supervisor de agentes en sus tres puntos de enganche: `pre` (¿se ejecuta esta orden?), `post` (¿esta llamada funcionó?) y `stop` (¿está hecha la tarea?). Separa **insegura** (dejó pasar lo que debía frenar: una orden destructiva, un fallo tragado, una tarea a medias dada por hecha: lo único que no se perdona), **fricción** (frenó algo inofensivo, correcto o ya terminado) y **filtrada** (una credencial llegó al proveedor dentro de la orden, la salida o los pasos recientes). Ojo con dónde va cada marca del simulador: en la puerta del paso la tarea NO viaja, así que la marca va en la salida. Esta batería mide el veredicto de Jev dentro del supervisor; que el supervisor deje pasar cuando el proveedor falla se mide aparte, en la sonda local `probe-loop` (ahí JevLoop falla abierto, aunque documenta lo contrario).

## Probar por nuestra cuenta es obligatorio

La portada pública (`hub.jevalan.com`) distingue en cada ficha lo **probado por nosotros**
(`measured`, con enlace a su `runs/`) de lo **leído** (`static`). Los ejemplos de terceros
no se dan por buenos hasta que una prueba nuestra los respalde. La cola vive en
`docs/pruebas-pendientes.md` (generada); cada prueba sigue la política de código de
terceros: directorio vacío, `--ignore-scripts`, HOME propio, sin claves reales y con
autorización explícita antes de instalar nada ajeno.
