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
un registro**: la spec del hub deja fuera empuje, descarga y firma. Solo toolgate,
jev-firewall y reflex están medidos (`runs/`); lo demás es lectura de código
(`static`).

Fuentes de contexto (leer antes de tocar el diseño):
- Diseño: `docs/superpowers/specs/2026-10-10-hub-scout-design.md`
- Plan: `docs/superpowers/plans/2026-10-10-core-y-triaje.md`
- Estado actual: `docs/estado.md`

## Comandos

Cero dependencias: **no hay `npm install`**, solo stdlib de Node (≥ 20), ESM
(`.mjs`).

```bash
npm test                       # node --test, 97 pruebas, todo offline
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
- Cohorte A: **13** entradas; solo toolgate es `measured`, con su run en disco.
- La cobertura publicada **no es un invariante fijo**: crece con cada veredicto de
  la cohorte B y los tests la derivan de `assessments.json`. Solo se fijan las
  **1340** entradas visibles. Hoy: **122** triadas, **3** evaluadas (**123** de las 125
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

## Probar por nuestra cuenta es obligatorio

La portada pública (`hub.jevalan.com`) distingue en cada ficha lo **probado por nosotros**
(`measured`, con enlace a su `runs/`) de lo **leído** (`static`). Los ejemplos de terceros
no se dan por buenos hasta que una prueba nuestra los respalde. La cola vive en
`docs/pruebas-pendientes.md` (generada); cada prueba sigue la política de código de
terceros: directorio vacío, `--ignore-scripts`, HOME propio, sin claves reales y con
autorización explícita antes de instalar nada ajeno.
