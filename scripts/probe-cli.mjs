/**
 * Mide un CLI de línea de comandos (linters, filtros) ejecutándolo directamente, sin claves.
 *
 *   node scripts/probe-cli.mjs --repo suraj-phanindra/wellposed --cli <ruta a wellposed.mjs>
 *
 * Hermano de `probe-gate.mjs` para especialistas que no son hooks. Lanza el CLI con cada caso de
 * su juego en un sandbox (HOME, TEMP y cwd propios, entorno sin ninguna clave) y guarda la
 * evidencia en `runs/<fecha>-<repo>/`. Lo que mide es el especialista, no el camino del hub, y el
 * run lo declara. Las rutas llegan por argumento y no se escriben en el run.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { ROOT } from "./lib/paths.mjs";
import { FIXTURES as WP_FIXTURES, judgeCase, wellposedCases } from "./lib/cli-cases-wellposed.mjs";
import { jevHarnessCases } from "./lib/cli-cases-jevharness.mjs";
import { FIXTURES as PG_FIXTURES, pkgGateCases } from "./lib/cli-cases-pkggate.mjs";
import { FIXTURES as SN_FIXTURES, snifftestCases } from "./lib/cli-cases-snifftest.mjs";
import { FIXTURES as JL_FIXTURES, jevLintCases } from "./lib/cli-cases-jevlint.mjs";
import { FIXTURES as RF_FIXTURES, riffCases } from "./lib/cli-cases-riff.mjs";
import { FIXTURES as JC_FIXTURES, jevLintCliCases } from "./lib/cli-cases-jevlintcli.mjs";
import { FIXTURES as JV_FIXTURES, jevcCases } from "./lib/cli-cases-jevc.mjs";
import { FIXTURES as SD_FIXTURES, semdecideCases } from "./lib/cli-cases-semdecide.mjs";
import { FIXTURES as SDL_FIXTURES, semdecideLiveCases } from "./lib/cli-cases-semdecide-live.mjs";
import { FIXTURES as JY_FIXTURES, jevLayerCases, jevLayerLiveCases } from "./lib/cli-cases-jevlayer.mjs";
import { FIXTURES as EV_FIXTURES, everyCases, EXTRACT_HARNESS } from "./lib/cli-cases-every.mjs";

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const slug = (repo) => repo.toLowerCase().replace(/[^a-z0-9]+/g, "-");
const today = () => new Date().toISOString().slice(0, 10);

/** Lo propio de cada CLI: sus casos, su entorno y lo que su run declara medido y no medido. */
const CLIS = {
  "suraj-phanindra/wellposed": {
    cases: wellposedCases,
    fixtures: WP_FIXTURES,
    allowed: /^$/,
    // `--cli` es el script; se ejecuta con el Node que lanza esta sonda.
    launch: (cli) => ({ command: process.execPath, prefix: [resolve(cli)] }),
    // Apaga el chequeo de actualizaciones (GET a registry.npmjs.org y caché en disco).
    env: { WELLPOSED_NO_UPDATE_CHECK: "1", NO_COLOR: "1" },
    measured: [
      "contrato de salida de `lint`: exit 0 limpio, 1 con errores, 2 uso incorrecto",
      "el JSON de `--json` (ok, counts, findings con regla, severidad y pregunta; files con varios ficheros)",
      "reglas estructurales comprobadas con peticiones propias: ruta rota, sin modelo, campo prohibido, sin vía de escape",
      "`--config` (silenciar una regla, lista `forbidden`), `--max-warnings`, `--quiet`, lectura por stdin",
      "sin clave, `--semantic` no llama a ningún modelo y lo avisa por stderr",
      "recuento de reglas estructurales frente a las 45 que declara el README",
      "huella en disco del sandbox (nada fuera de las peticiones escritas)",
    ],
    not_measured: [
      "las comprobaciones semánticas con modelo (`--semantic` con clave), su coste y su latencia",
      "el chequeo de actualizaciones contra registry.npmjs.org, apagado con WELLPOSED_NO_UPDATE_CHECK",
      "`eval`, que lanza otro proceso del paquete contra su corpus etiquetado",
      "la calidad de cada una de las reglas: solo se ejercitaron cinco",
      "el paquete como skill dentro de Claude Code o Codex",
    ],
  },
  "hemanth/pkg-gate": {
    cases: pkgGateCases,
    fixtures: PG_FIXTURES,
    allowed: /^$/,
    // `--cli` es bin/cli.js dentro de un directorio con su dependencia (@typesafe-ai/sdk) ya al lado.
    launch: (cli) => ({ command: process.execPath, prefix: [resolve(cli)] }),
    env: { NO_COLOR: "1" },
    measured: [
      "contrato de salida: allow exit 0, block exit 1, warn exit 2, errores de uso y de lectura exit 1",
      "manifiestos locales y órdenes sueltas (`-s`) sintéticos, sin red y sin clave",
      "el simulador sin clave: qué permite, qué avisa y qué bloquea, y que se etiqueta como simulado",
      "los ganchos que vigila (`postinstall`, `prepare`) y el esquema de `--json`",
      "umbral `--block-score` y equivalencia de `--mock` con no tener clave",
      "huella en disco del sandbox",
    ],
    not_measured: [
      "el motor con modelo (TYPESAFE_API_KEY) y cualquier decisión que dependa de él",
      "resolver un nombre de paquete: consulta el registro de npm y no se hizo ninguna petición de red",
      "qué hace si la API de Jev falla con clave: por su código cae al simulador, y no se ejecutó",
      "el modo interactivo (`warn` con confirmación en terminal) y el TUI",
    ],
  },
  "danrwilloughby/snifftest": {
    cases: snifftestCases,
    fixtures: SN_FIXTURES,
    allowed: /^$/,
    // `--cli` es dist/snifftest.js, un único fichero empaquetado sin dependencias.
    launch: (cli) => ({ command: process.execPath, prefix: [resolve(cli)] }),
    // Sin caché de respuestas: nada se guarda fuera del sandbox aunque alguna vez hubiera una.
    env: { NO_COLOR: "1", SNIFFTEST_CACHE_DIR: "off" },
    measured: [
      "las cinco reglas contables (raya, dos puntos, ritmo de frases, vocabulario de relleno, palabras prohibidas) frente a lo que su documentación dice que debe y no debe marcar",
      "contrato de salida: exit 0 limpio, 1 con marcas, 2 error de uso o de reglas; `--format json` con fichero, línea, regla y probabilidad",
      "`--dry-run` no deja pasar ninguna petición y declara que el veredicto es solo de las reglas contables",
      "sin clave y sin `--dry-run`, las reglas de juicio no corren: exit 2 y lo dice",
      "reglas propias (`--rules`: patrón y lista prohibida), fichero de reglas ilegible, umbral inválido y etiqueta desconocida",
      "huella en disco del sandbox",
    ],
    not_measured: [
      "las diez reglas de juicio con modelo, su coste y su latencia",
      "el consentimiento para enviar texto: sin clave no se llega a preguntar",
      "`eval`, `bench` y `serve`, que llaman a modelos o abren un servidor",
      "`--judge-url` contra un servidor propio",
    ],
  },
  "mizchi/jev-lint": {
    cases: jevLintCases,
    fixtures: JL_FIXTURES,
    // `init` escribe .jev-lint.yaml y la caché vive en .jev-lint/: ambos documentados.
    allowed: /^\.jev-lint(?:\.yaml|\/.*)$/,
    // `--cli` es dist/cli.js dentro de una instalación con ast-grep ya enlazado.
    launch: (cli) => ({ command: process.execPath, prefix: [resolve(cli)] }),
    env: { NO_COLOR: "1" },
    measured: [
      "`rules`: las reglas empaquetadas y su recuento frente al del README",
      "`check --dry-run`: planifica y tasa sin enviar nada; sujetos y peticiones por regla",
      "el emparejador (ast-grep) elige las funciones, el comentario de documentación y el script de shell que las reglas documentan",
      "supresiones (`jev-lint-ignore-file`, `ignore-next-line`): lo suprimido no se envía",
      "sin clave, `check` se niega con exit 2 antes de hacer ninguna petición",
      "errores de uso y de configuración (config ilegible o ausente, ruta ausente, comando desconocido, replay sin registro)",
      "`init` escribe su configuración en el directorio actual; huella en disco del sandbox",
    ],
    not_measured: [
      "cualquier veredicto de un modelo: no hay clave, así que nunca se ve si una coincidencia se marca o no",
      "`review`, `commits`, `gaps`, `calibrate`, `eval` e `init --pre-commit/--pre-push` (necesitan git o piden al modelo)",
      "coste real de una ejecución: solo se leyó la tasación de `--dry-run`",
      "lenguajes distintos de TypeScript y shell",
    ],
  },
  "scale-venture-partners/riff": {
    cases: riffCases,
    fixtures: RF_FIXTURES,
    allowed: /^$/,
    // `--cli` es el directorio src/ del repositorio; `--python` es el intérprete de un venv que ya tiene sus
    // dependencias (instaladas solo como ruedas). Python `-s -B`, sin `-I`, que ignoraría PYTHONPATH.
    launch: () => ({ command: arg("python") ?? which("python"), prefix: ["-s", "-B", "-c", "import sys; from riff.cli import main; sys.exit(main())"] }),
    pythonPath: true,
    env: { PYTHONDONTWRITEBYTECODE: "1", PYTHONIOENCODING: "utf-8" },
    version: (cli) => {
      const m = readFileSync(join(resolve(cli), "..", "pyproject.toml"), "utf8").match(/^version = "([^"]+)"/m);
      return m ? m[1] : "desconocida";
    },
    measured: [
      "las ocho reglas estáticas (RIF001-005 y CLR001-003) con `--no-jev`, frente a lo que su README y `--explain` dicen que deben y no deben marcar",
      "reglas propias de frase (también con distinción de mayúsculas) desde `--config`, sin red",
      "`--select`, `--ignore`, `--max-sentence-words` y el JSON de `--format json`",
      "el recuento del catálogo frente a las 69 reglas (61 semánticas y 8 estáticas) que declara el README",
      "sin `--no-jev` y sin clave, se niega con exit 2 y ofrece `--no-jev`, en lugar de saltarse las semánticas",
      "errores de uso y de configuración; huella en disco del sandbox",
    ],
    not_measured: [
      "las 61 reglas semánticas con Jev (u otro modelo) y su coste y latencia",
      "la clasificación del tipo de documento, que usa el modelo",
      "lectura de .docx, .pptx, .html y de URL (no se hizo ninguna petición de red)",
      "`--outline` y `--debug-jev`",
    ],
  },
  "iamtoomas/jevlint": {
    cases: jevLintCliCases,
    fixtures: JC_FIXTURES,
    // `init` escribe jevlint.config.json en el directorio actual: es lo único que documenta dejar en disco.
    allowed: /^jevlint\.config\.json$/,
    // `--cli` es dist/src/index.mjs de @jevlint/cli instalado con --ignore-scripts (ya viene compilado).
    launch: (cli) => ({ command: process.execPath, prefix: [resolve(cli)] }),
    env: { NO_COLOR: "1" },
    measured: [
      "`--dry-run`: imprime las peticiones (modelo, fuente de cada fichero y pregunta noul de la regla) sin clave y sin llamar a Jev",
      "qué ficheros elige: recorre carpetas sin node_modules, dist, secrets/credentials ni lo que no es JS/TS; `--ignore`, `ignore`, `files` y `maxFileBytes` de la configuración",
      "los dos plugins que trae (`magic-strings`, `descriptive-names`) elegidos por configuración; `--model` llega a la petición",
      "sin clave y sin `--dry-run`, se niega con exit 2 nombrando JEV_API_KEY",
      "errores de uso y de configuración (umbral, formato, config ilegible o ausente, ruta sin ficheros, opción desconocida)",
      "`init` crea la configuración y nunca la sobrescribe; huella en disco del sandbox",
    ],
    not_measured: [
      "cualquier veredicto de un modelo: sin clave nunca se ve si un fichero se marca, ni la probabilidad ni el umbral de 0,8 aplicado",
      "plugins ajenos o propios: `--dry-run` los ejecuta con los permisos normales de Node, y no se cargó ninguno",
      "la caché de juicios y el coste real de una ejecución",
      "el comportamiento con `.env` y con `apiKeyEnv` personalizada",
    ],
  },
  "doronp/jevc": {
    cases: jevcCases,
    fixtures: JV_FIXTURES,
    allowed: /^$/,
    // `--cli` es dist/cli.js del paquete jev-compiler instalado con --ignore-scripts.
    launch: (cli) => ({ command: process.execPath, prefix: [resolve(cli)] }),
    env: { NO_COLOR: "1" },
    measured: [
      "`scan`: cuenta y clasifica las reglas de un AGENTS.md (decidibles, procedimientos, generación) y avisa cuando no hay ficheros de instrucciones",
      "`check`: repite offline el corpus grabado de 58 fixtures; rechaza `--model` sin `--live`, un directorio de fixtures ausente y `--live` sin clave",
      "`show` y `explain`: listan y enseñan los fixtures; los inexistentes son error",
      "`compile` de un esquema: módulo TypeScript con preguntas noul y choice y veredicto calculado en código; declara lo que no puede bajar (texto libre, enteros) en vez de callarlo",
      "`compile --lift`: imprime la petición de bajada sin llamar a ningún modelo",
      "`emit-policy` a toolgate y bouncer: YAML con preguntas booleanas, umbrales y arranque en modo observe; destino desconocido, programa inválido y uso incorrecto son error",
      "contrato de salida y huella en disco del sandbox",
    ],
    not_measured: [
      "`check --live`: re-medir contra la API necesita clave de TypeSafe",
      "que las preguntas compiladas salgan bien con un modelo (la calidad de la bajada `--lift`, que hace el agente)",
      "las políticas emitidas cargadas en toolgate o bouncer reales",
      "la corrección de los 58 fixtures: `check` compara una grabación consigo misma y no puede fallar si la grabación es mala",
    ],
  },
  "sharziki/semdecide": {
    cases: semdecideCases,
    fixtures: SD_FIXTURES,
    allowed: /^$/,
    stub: true,
    keys: "inventada («clave-inventada-de-pruebas»), válida solo contra un proveedor simulado nuestro en 127.0.0.1; ninguna petición sale de la máquina y ninguna clave real entra en el entorno",
    // `--cli` es el directorio src/ del repositorio; `--python` es cualquier intérprete (semdecide no tiene dependencias).
    launch: () => ({ command: arg("python") ?? which("python"), prefix: ["-s", "-B", "-c", "import sys; from reflex_guard.cli import main; sys.exit(main())"] }),
    pythonPath: true,
    env: { PYTHONDONTWRITEBYTECODE: "1", PYTHONIOENCODING: "utf-8" },
    version: (cli) => {
      const m = readFileSync(join(resolve(cli), "..", "pyproject.toml"), "utf8").match(/^version = "([^"]+)"/m);
      return m ? m[1] : "desconocida";
    },
    live: {
      cases: semdecideLiveCases,
      fixtures: SDL_FIXTURES,
      keys: "inventada («clave-inventada-de-pruebas») para el especialista; la real (OpenRouter) vive solo en el entorno de un adaptador local en 127.0.0.1 con tope de gasto",
      measured: [
        "Jev de verdad (typesafe/jev-1.13 por la Decisions API de OpenRouter) a través del envoltorio, con textos inventados y sin ambigüedad: predicado, enrutado, escala, filtro y `guard`",
        "la probabilidad real de cada caso queda en `observed` (calibración, no solo acierto): toma de cuenta, boletín, español, orden incrustada en el texto, entrada larga",
        "el modelo que contesta se nombra en el JSON y trae uso de tokens; el gasto total de la sonda queda en `live.spend_usd`",
      ],
      not_measured: [
        "estabilidad entre ejecuciones (cada caso se lanza una vez) y la cola de casos difíciles o ambiguos: solo hay casos evidentes",
        "otros modelos de Jev o de OpenRouter distintos de typesafe/jev-1.13",
        "latencia y comportamiento ante límites de tasa",
        "el camino por TypeSafe directo: aquí va por OpenRouter, que exige `criteria` en los noul y lo añade el adaptador",
      ],
    },
    measured: [
      "la lógica del envoltorio frente a un proveedor simulado nuestro (NO es Jev): umbral por defecto 0,70, `--threshold`, margen de incertidumbre y los códigos 0/1/3/4 de su README",
      "`is`, `choose`, `score`, `filter` y `guard`: veredicto, esquema JSON versionado, `--quiet`, `--raw`, orden de los registros y metadata `_semdecide`",
      "qué sale al proveedor: forma de la petición, clave por cabecera Authorization, y que nada sale cuando la entrada es inválida o falta la clave",
      "fallos de proveedor: 500 reintentado (3 peticiones, `--retries 0` = 1), 401 sin reintento, cuerpo que no es JSON, respuesta sin `answers`, probabilidad fuera de rango; error JSON versionado y sin detalles",
      "entrada: stdin, `--text`, `--file`, exclusión mutua, vacío, fichero ausente, `--max-input-bytes`, JSONL mal formado, `--max-records`",
      "`guard` falla cerrado a escalar (exit 10) y bloquea o deja pasar según las señales",
      "huella en disco del sandbox",
    ],
    not_measured: [
      "lo que Jev contesta de verdad: probabilidades, calibración, coste y latencia; el proveedor simulado dicta la respuesta",
      "las cinco señales concretas de `guard` (autorización, destructividad, ambigüedad, secretos, consecuencia) y cómo las pondera: el simulador pone la misma probabilidad en todas",
      "texto binario o UTF-8 inválido por la entrada estándar",
      "la instalación con pipx/uv desde el wheel de la release: se ejecutó la fuente",
    ],
  },
  "sufianetaouil/every": {
    cases: everyCases,
    fixtures: EV_FIXTURES,
    // Solo el intento de crear la caché de gramáticas que el caso de la caché vacía provoca a propósito.
    allowed: /^cache-vacia\/tree-sitter-language-pack\//,
    keys: "inventada («clave-inventada-de-pruebas») solo en los casos que terminan antes de la primera petición; la dirección de la API va fija en su código, así que no hay proveedor simulado",
    // `--cli` es el site-packages de un venv con every-cli y sus dependencias (solo ruedas); `--python` es ese intérprete.
    launch: () => ({ command: arg("python") ?? which("python"), prefix: ["-s", "-B", "-c", EXTRACT_HARNESS] }),
    // Su dependencia tree-sitter-language-pack se baja las gramáticas nativas la primera vez que las usa. `--grammars` es
    // una copia privada de esa caché (con la carpeta `tree-sitter-language-pack/` dentro), ya descargada y con el hash
    // comprobado. El proxy apunta a un puerto muerto: si intentara conectarse, fallaría, y el resultado lo delataría.
    env: {
      PYTHONDONTWRITEBYTECODE: "1",
      PYTHONIOENCODING: "utf-8",
      HTTPS_PROXY: "http://127.0.0.1:9",
      HTTP_PROXY: "http://127.0.0.1:9",
      ALL_PROXY: "http://127.0.0.1:9",
      ...(arg("grammars") ? { TREE_SITTER_LANGUAGE_PACK_CACHE_DIR: resolve(arg("grammars")) } : {}),
    },
    version: (cli) => {
      const d = readdirSync(resolve(cli)).find((n) => /^every_cli-.*\.dist-info$/.test(n));
      return d ? d.replace(/^every_cli-/, "").replace(/\.dist-info$/, "") : "desconocida";
    },
    measured: [
      "qué código selecciona y cómo lo parte en funciones antes de enviar nada: Python, JavaScript, TypeScript/TSX, Go, Java, Rust, C#, Ruby y PHP, funciones anidadas y métodos",
      "lenguajes reconocidos sin analizador (shell) en trozos de 150 líneas, y la caída a trozos con código que no se puede analizar",
      "qué excluye: node_modules, vendor, dist, build, bin, target, lo minificado, lo generado, ficheros vacíos y lo que no es código",
      "si se juzgan ficheros llamados secrets o credentials (observación: su README no promete excluirlos)",
      "contrato de la línea de órdenes: sin clave se niega (exit 2), uso incorrecto y carpeta sin funciones (cero peticiones, coste 0)",
      "huella en disco del sandbox",
    ],
    not_measured: [
      "cualquier respuesta del modelo, el ranking, el coste real y el segundo pase de las puntuaciones cercanas al umbral",
      "`--selftest` (necesita clave) y la clasificación de la pregunta, que usa el modelo",
      "repositorios con git: se usó `os.walk`, no `git ls-files`",
      "la versión de PyPI (0.1.0) es la medida; no se comparó con el HEAD del repositorio",
    ],
  },
  "typakon4/jev-layer": {
    cases: jevLayerCases,
    fixtures: JY_FIXTURES,
    allowed: /^$/,
    stub: true,
    // El simulador y el adaptador escuchan en 127.0.0.1; la capa lee el endpoint y la clave de su configuración por entorno.
    stubEnv: (port) => ({ JEV_LAYER_PROVIDER: "openrouter", OPENROUTER_API_KEY: "clave-inventada-de-pruebas", OPENROUTER_DECISIONS_ENDPOINT: `http://127.0.0.1:${port}/api/alpha/decisions` }),
    keys: "inventada («clave-inventada-de-pruebas») válida solo contra un proveedor local en 127.0.0.1; ninguna petición sale de la máquina y ninguna clave real entra en el entorno",
    // `--cli` es bin/jev.mjs. Solo se ejecuta `help` y `cli`: `install`, `init`, `add` y `doctor` escriben configuración de otros programas.
    launch: (cli) => ({ command: process.execPath, prefix: [resolve(cli)] }),
    env: { NO_COLOR: "1" },
    live: {
      cases: jevLayerLiveCases,
      passModel: true,
      keys: "inventada para el especialista; la real (OpenRouter) vive solo en el entorno de un adaptador local en 127.0.0.1 con tope de gasto",
      measured: [
        "Jev de verdad (typesafe/jev-1.14 por la Decisions API de OpenRouter) a través del enrutador, con capacidades y textos inventados: tests, búsqueda, correo, despliegue y español",
        "una orden incrustada en la intención y una descripción envenenada de capacidad no deciden la elección",
        "la confianza y las probabilidades de cada caso quedan en `observed`; cinco peticiones idénticas en un proceso miden la estabilidad",
      ],
      not_measured: [
        "casos ambiguos en volumen y catálogos grandes (aquí hay 4 capacidades)",
        "imágenes, Box y `jev_computer_step`, el servidor MCP, la supervisión, el filtrado de contexto y la ruta de modelos",
        "los adaptadores de Hermes, OMP y Codex, y los comandos que escriben configuración (`install`, `init`, `add`, `doctor`)",
        "latencia y comportamiento ante límites de tasa",
      ],
    },
    measured: [
      "el adaptador JSONL `jev cli` con el proveedor `demo` (sin HTTP) y con un proveedor simulado nuestro (NO es Jev) para lo que la capa hace con una respuesta dada",
      "filtrado por permisos: la capacidad prohibida queda marcada y no se envía al modelo; la decisión nunca ejecuta (`execution.enabled: false`)",
      "redacción de claves con nombre de secreto en el contexto, y observación de qué pasa con un secreto escrito en el texto libre",
      "fallos abiertos: 500, respuesta que no es JSON, falta de clave y una opción que no se ofreció se convierten en `fallback` sin elegir nada",
      "una decisión por línea y en orden, línea mal formada y listas de capacidades vacías o sin permiso",
      "huella en disco del sandbox",
    ],
    not_measured: [
      "lo que Jev contesta de verdad con el proveedor simulado: lo dicta una marca en el texto",
      "el servidor MCP (`jev mcp`), los adaptadores de Hermes, OMP y Codex, y los comandos que escriben configuración (`install`, `init`, `add`, `doctor`)",
      "imágenes, Box, supervisión, filtrado de contexto, ruta de modelos y navegador",
      "el endpoint HTTPS real: el simulador usa HTTP en loopback",
    ],
  },
  "ismaelsoilet/jev-harness": {
    cases: jevHarnessCases,
    fixtures: {},
    // Recibos y sesión en ~/.config/jev (HOME del sandbox): es lo que documenta el propio paquete.
    allowed: /^.config[\/]jev[\/](?:receipts|session).(?:jsonl|json|lock)$/,
    // `--cli` es la raíz del wheel descomprimido (contiene jev_harness/). Python `-s -B`, sin `-I`, que ignoraría PYTHONPATH.
    launch: () => ({ command: which("python"), prefix: ["-s", "-B", "-c", "import sys; from jev_harness.cli import main; sys.exit(main())"] }),
    pythonPath: true,
    env: { PYTHONDONTWRITEBYTECODE: "1", PYTHONIOENCODING: "utf-8" },
    version: (cli) => {
      const d = readdirSync(resolve(cli)).find((n) => /^jev_harness-.*.dist-info$/.test(n));
      return d ? d.replace(/^jev_harness-/, "").replace(/.dist-info$/, "") : "desconocida";
    },
    measured: [
      "motor local determinista sin clave: triaje de fallos de test, abort-check, route, verify y nudge-gate",
      "contrato de salida: exit 0 cuando la decisión se resuelve sola, 1 cuando exige acción o escalar, 2 uso incorrecto",
      "el motor sin clave se etiqueta siempre (`is_mock: true`) y `--fail-closed` sin clave no inventa un error de proveedor",
      "`--shadow` no cambia el código de salida y lo avisa por stderr",
      "recibos de auditoría: solo hash de la entrada, nunca el texto del log",
      "`--json` en cada comando de decisión y en `status`",
      "huella en disco del sandbox",
    ],
    not_measured: [
      "el motor con modelo (TYPESAFE_API_KEY y demás proveedores) y cualquier decisión que dependa de él",
      "qué hace `--fail-closed` ante un error real de proveedor: sin clave no hay proveedor que falle",
      "plazo agotado o error de red, coste y latencia con modelo",
      "`init`, `doctor`, `export`, `mcp` y `replay`, que escriben configuración o abren un servidor",
      "la recuperación automática (`--allow-auto-recovery`), que instalaría paquetes",
      "el hook `jev-test-gate`, que ejecuta el comando de tests del usuario",
    ],
  },
};

/** Versión del paquete que contiene el CLI, buscando package.json hacia arriba. */
function specialistVersion(cli) {
  let dir = dirname(resolve(cli));
  for (let i = 0; i < 6; i++, dir = dirname(dir)) {
    const file = join(dir, "package.json");
    if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8")).version ?? "desconocida";
  }
  return "desconocida";
}

/** Ruta absoluta de un ejecutable: el entorno del sandbox lleva un PATH mínimo. */
function which(name) {
  const r = spawnSync(process.platform === "win32" ? "where" : "which", [name], { encoding: "utf8" });
  const first = (r.stdout ?? "").split(/\r?\n/).find(Boolean);
  if (r.status !== 0 || !first) throw new Error(`no encuentro ${name} en el PATH`);
  return first;
}

function walk(dir, base = dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p, base) : [relative(base, p).replaceAll("\\", "/")];
  });
}

async function main() {
  const repo = arg("repo");
  const cli = arg("cli");
  if (![repo, cli].every(Boolean)) {
    console.error("faltan argumentos: --repo --cli");
    process.exit(2);
  }
  const base = CLIS[repo.toLowerCase()];
  // `--live-openrouter <.env>` cambia el simulador por Jev de verdad (vía OpenRouter, con tope de gasto en `--cap`, USD).
  const liveEnv = arg("live-openrouter");
  const live = Boolean(liveEnv && base?.live);
  const spec = live ? { ...base, ...base.live } : base;
  let spent = 0;
  const modelsSeen = new Set();
  if (!spec) throw new Error(`sin juego de casos para ${repo}: ${Object.keys(CLIS).join(", ")}`);
  if (!existsSync(cli)) throw new Error(`no existe: ${cli}`);
  const version = spec.version ? spec.version(cli) : specialistVersion(cli);
  const FIXTURES = spec.fixtures ?? {};

  const sandbox = mkdtempSync(join(tmpdir(), "scout-cli-"));
  // Proveedor simulado local (solo 127.0.0.1) para los envoltorios que exigen un servidor al otro lado.
  const stubLog = join(sandbox, "..", `scout-stub-${process.pid}.jsonl`);
  let stub = null;
  let stubEnv = {};
  if (spec.stub) {
    writeFileSync(stubLog, "");
    if (live) {
      // La clave real solo entra en el entorno del adaptador; el especialista recibe una inventada.
      const key = readFileSync(liveEnv, "utf8").split(/\r?\n/).map((l) => l.match(/^\s*OPENROUTER_API_KEY\s*=\s*(.*)$/)?.[1]).find(Boolean)?.trim().replace(/^["']|["']$/g, "");
      if (!key) throw new Error("el .env no tiene OPENROUTER_API_KEY");
      stub = spawn(process.execPath, [join(ROOT, "scripts", "lib", "openrouter-adapter.mjs"), stubLog, arg("cap") ?? "1", spec.passModel ? "passthrough" : "fixed"], {
        stdio: ["ignore", "pipe", "inherit"],
        env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot ?? "", OPENROUTER_API_KEY: key },
      });
    } else {
      stub = spawn(process.execPath, [join(ROOT, "scripts", "lib", "stub-provider.mjs"), stubLog], { stdio: ["ignore", "pipe", "inherit"] });
    }
    const port = await new Promise((ok, fail) => {
      createInterface({ input: stub.stdout }).once("line", (l) => ok(JSON.parse(l).port));
      stub.once("error", fail);
    });
    stubEnv = spec.stubEnv ? spec.stubEnv(port) : { SEMDECIDE_API_URL: `http://127.0.0.1:${port}/v1/systemone`, TYPESAFE_API_KEY: "clave-inventada-de-pruebas" };
  }
  // Entorno mínimo a propósito: ninguna clave, y todo lo que el CLI escribe cae dentro del sandbox.
  const env = {
    PATH: [dirname(process.execPath), join(process.env.SystemRoot ?? "C:\\Windows", "System32")].join(process.platform === "win32" ? ";" : ":"),
    SystemRoot: process.env.SystemRoot ?? "",
    TEMP: sandbox,
    TMP: sandbox,
    HOME: sandbox,
    USERPROFILE: sandbox,
    LOCALAPPDATA: sandbox,
    APPDATA: sandbox,
    XDG_CACHE_HOME: join(sandbox, ".cache"),
    ...(spec.pythonPath ? { PYTHONPATH: resolve(cli) } : {}),
    ...spec.env,
    ...stubEnv,
  };
  const tool = spec.launch(cli).command;
  env.PATH += (process.platform === "win32" ? ";" : ":") + dirname(tool);
  for (const [name, text] of Object.entries(FIXTURES)) {
    mkdirSync(dirname(join(sandbox, name)), { recursive: true });
    writeFileSync(join(sandbox, name), text);
  }
  const scrub = (t) => (typeof t === "string" ? t.replaceAll(sandbox, "<sandbox>") : t);

  let results;
  let footprint;
  try {
    results = spec.cases(version).map((c) => {
      const { command, prefix } = spec.launch(cli);
      // Un caso con `fresh` parte de un sandbox sin el estado que el CLI guarda entre llamadas;
      // `prelude` son las llamadas previas cuyo efecto sobre ese estado se quiere medir.
      if (c.fresh) rmSync(join(sandbox, ".config", "jev"), { recursive: true, force: true });
      for (const pre of c.prelude ?? []) {
        spawnSync(command, [...prefix, ...pre], { cwd: sandbox, env, input: "", encoding: "utf8", timeout: 30000 });
      }
      if (stub) writeFileSync(stubLog, "");
      const r = spawnSync(command, [...prefix, ...c.args], {
        cwd: sandbox,
        env: { ...env, ...(typeof c.env === "function" ? c.env(sandbox) : c.env ?? {}) },
        input: c.stdin ?? (c.stdinFixture ? FIXTURES[c.stdinFixture] : ""),
        encoding: "utf8",
        timeout: 30000,
      });
      const res = { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
      // Lo que llegó al proveedor simulado durante este caso: la prueba de qué sale (y qué no) del proceso.
      res.requests = stub ? readFileSync(stubLog, "utf8").split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l)) : [];
      spent += res.requests.reduce((s, q) => s + (q.cost ?? 0), 0);
      for (const q of res.requests) if (q.response?.model) modelsSeen.add(q.response.model);
      try {
        res.json = JSON.parse(res.stdout);
      } catch {
        res.json = null;
      }
      const problems = judgeCase(c, res);
      return {
        id: c.id,
        why: c.why,
        pass: problems.length === 0,
        problems,
        exit: r.status,
        ...(c.observe ? { observed: c.observe(res) } : {}),
        ...(c.id.startsWith("semantic") ? { stderr: scrub(res.stderr.trim()) } : {}),
      };
    });
    footprint = walk(sandbox).sort();
  } finally {
    stub?.kill();
    rmSync(stubLog, { force: true });
    rmSync(sandbox, { recursive: true, force: true });
  }
  // Cualquier fichero que no sea una petición escrita por nosotros es algo que el CLI dejó en disco.
  const stray = footprint.filter((f) => !(f in FIXTURES) && !spec.allowed.test(f));
  const footprintCase = {
    id: "footprint-stays-in-sandbox",
    why: "Lo que el CLI deja en disco queda dentro del sandbox y dentro de lo que su documentación declara.",
    pass: stray.length === 0,
    problems: stray.map((f) => `fichero inesperado: ${f}`),
  };
  results.push(footprintCase);

  const run = {
    repo,
    date: today(),
    scope: "directo: se ejecuta el CLI del especialista, sin pasar por el hub de jevalan",
    environment: {
      node: process.version,
      specialist: version,
      keys: spec.keys ?? "ninguna: entorno vacío, HOME y cwd propios; el especialista no puede llamar a ningún modelo",
    },
    ...(live ? { live: { backend: "OpenRouter Decisions API", models_seen: [...modelsSeen], spend_usd: Number(spent.toFixed(6)), cap_usd: Number(arg("cap") ?? "1") } } : {}),
    measured: spec.measured,
    not_measured: spec.not_measured,
    footprint,
    cases: results,
    pass: results.every((r) => r.pass),
  };
  const dir = join(ROOT, "runs", `${today()}-${slug(repo)}${live ? "-openrouter" : ""}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "run.json"), JSON.stringify(run, null, 2) + "\n");
  console.log(`${run.pass ? "OK" : "FALLA"}: ${results.filter((r) => r.pass).length}/${results.length} casos`);
  for (const r of results) console.log(`  ${r.pass ? "✓" : "✗"} ${r.id}${r.problems.length ? ": " + r.problems.join("; ") : ""}`);
  if (live) console.log(`gasto: ${spent.toFixed(6)} USD de ${arg("cap") ?? "1"}`);
  console.log(`evidencia: runs/${today()}-${slug(repo)}${live ? "-openrouter" : ""}/run.json`);
  process.exit(run.pass ? 0 : 1);
}

try {
  await main();
} catch (e) {
  console.error(`probe-cli: ${e.message}`);
  process.exit(1);
}
