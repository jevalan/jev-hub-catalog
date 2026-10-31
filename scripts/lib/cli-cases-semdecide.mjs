/**
 * Casos fijos de la medida directa de SemDecide (sharziki/semdecide), sin claves reales ni red.
 * Puro: describe qué se ejecuta y cómo se juzga; no lanza nada.
 *
 * SemDecide es un envoltorio: convierte la respuesta tipada de Jev en veredictos, umbrales, márgenes y
 * códigos de salida de Unix. Lo que decide el modelo no se mide aquí; lo que se mide es lo que hace el
 * envoltorio con una respuesta dada. Para eso el sandbox apunta `SEMDECIDE_API_URL` a un proveedor
 * simulado local (scripts/lib/stub-provider.mjs, solo 127.0.0.1) cuya probabilidad la dicta una marca
 * `[p=0.9]` escrita en el propio texto de entrada. La clave es inventada y solo vale contra ese servidor.
 */

const rec = (...lines) => lines.map((l) => JSON.stringify(l)).join("\n") + "\n";

export const FIXTURES = {
  "input.txt": "Login from a new country [p=0.90]\n",
  "tickets.jsonl": rec({ id: 1, text: "refund me [p=0.95]" }, { id: 2, text: "thanks, all good [p=0.05]" }, { id: 3, text: "cancel unless fixed [p=0.90]" }),
  "none.jsonl": rec({ id: 1, text: "fine [p=0.05]" }, { id: 2, text: "also fine [p=0.10]" }),
  "bad.jsonl": "{nope\n",
};

const CRITERION = "This describes a plausible account takeover";
const is = (text, ...more) => ["is", CRITERION, "--text", text, ...more];
const OPTIONS = ["--option", "support=ordinary product support", "--option", "security=possible security incident", "--option", "billing=a billing issue"];
const LEVELS = ["--level", "unsafe", "--level", "incomplete", "--level", "complete"];

const lines = (r) => r.stdout.split(/\r?\n/).filter(Boolean);
const noRequest = (r) => (r.requests.length === 0 ? [] : [`salieron ${r.requests.length} peticiones, se esperaba ninguna`]);
const requestsCount = (n) => (r) => (r.requests.length === n ? [] : [`${r.requests.length} peticiones, se esperaban ${n}`]);
const field = (name, want) => (r) => (r.json?.[name] === want ? [] : [`${name} = ${JSON.stringify(r.json?.[name])}, se esperaba ${JSON.stringify(want)}`]);

export const semdecideCases = (version) => [
  {
    id: "version",
    why: "`--version` imprime la versión del paquete.",
    args: ["--version"], exit: 0,
    check: (r) => (r.stdout.trim() === `semdecide ${version}` ? [] : [`versión ${JSON.stringify(r.stdout.trim())}, se esperaba "semdecide ${version}"`]),
  },
  {
    id: "no-command",
    why: "Sin comando es un error de uso (exit 2).",
    args: [], exit: 2,
  },
  {
    id: "unknown-command",
    why: "Un comando desconocido es un error de uso (exit 2).",
    args: ["bogus"], exit: 2,
  },
  {
    id: "is-true",
    why: "Una probabilidad por encima del umbral por defecto (0,70) es TRUE: exit 0 y la línea `TRUE probability=… threshold=…` de su README.",
    args: is("Login from a new country [p=0.90]"), exit: 0,
    check: (r) => (/^TRUE probability=0\.9\d* threshold=0\.7\d*$/.test(r.stdout.trim()) ? [] : [`salida ${JSON.stringify(r.stdout.trim())}`]),
  },
  {
    id: "is-false",
    why: "Una probabilidad muy por debajo del umbral es FALSE: exit 1.",
    args: is("Quarterly report attached [p=0.05]"), exit: 1,
    check: (r) => (/^FALSE /.test(r.stdout.trim()) ? [] : [`salida ${JSON.stringify(r.stdout.trim())}`]),
  },
  {
    id: "is-uncertain-inside-margin",
    why: "Dentro del margen de incertidumbre alrededor del umbral no se fuerza a verdadero ni a falso: exit 3 e `uncertain`.",
    args: is("Borderline [p=0.72]", "--threshold", "0.7", "--uncertainty-margin", "0.1", "--json"), exit: 3,
    check: field("verdict", "uncertain"),
  },
  {
    id: "is-outside-margin-is-definite",
    why: "Con el mismo margen, una probabilidad fuera de él sí es definitiva.",
    args: is("Clear [p=0.90]", "--threshold", "0.7", "--uncertainty-margin", "0.1", "--json"), exit: 0,
    check: field("verdict", "true"),
  },
  {
    id: "is-threshold-is-configurable",
    why: "Subir `--threshold` por encima de la probabilidad convierte el mismo texto en FALSE.",
    args: is("Clear [p=0.90]", "--threshold", "0.95", "--uncertainty-margin", "0", "--json"), exit: 1,
    check: field("verdict", "false"),
  },
  {
    id: "is-json-shape",
    why: "`--json` entrega el esquema versionado de su README: schema_version, command, verdict, probability, threshold, model y usage.",
    args: is("Login [p=0.90]", "--json"), exit: 0,
    check: (r) => {
      const j = r.json;
      return j && j.schema_version === "1" && j.command === "is" && j.verdict === "true" && typeof j.probability === "number" && typeof j.threshold === "number" && typeof j.model === "string" && j.usage
        ? []
        : ["el JSON no tiene la forma documentada"];
    },
  },
  {
    id: "is-quiet",
    why: "`--quiet` no escribe nada y deja solo el código de salida.",
    args: is("Login [p=0.90]", "--quiet"), exit: 0,
    check: (r) => (r.stdout === "" && r.stderr === "" ? [] : ["escribió algo con --quiet"]),
  },
  {
    id: "is-request-shape",
    why: "La petición va al proveedor con el criterio como pregunta noul, el texto como estado y la clave por la cabecera Authorization, nunca en la línea de órdenes.",
    args: is("Login [p=0.90]"), exit: 0,
    check: (r) => {
      const q = r.requests[0];
      const questions = Object.values(q?.body?.questions ?? {});
      return r.requests.length === 1 && q.method === "POST" && /^Bearer \S+/.test(q.auth ?? "") && q.body.model === "jev-latest" && questions.length === 1 && questions[0].type === "noul" && JSON.stringify(q.body.state).includes("Login")
        ? []
        : ["la petición no tiene la forma esperada (POST, Bearer, jev-latest, una pregunta noul y el texto)"];
    },
  },
  {
    id: "is-reads-stdin",
    why: "Sin `--text` ni `--file`, el texto llega por la entrada estándar (el uso de tubería de su README).",
    args: ["is", CRITERION], stdin: "Login from a new country [p=0.90]", exit: 0,
  },
  {
    id: "is-reads-file",
    why: "`--file` lee el texto de un fichero UTF-8.",
    args: ["is", CRITERION, "--file", "input.txt"], exit: 0,
  },
  {
    id: "is-text-and-file-exclusive",
    why: "`--text` y `--file` a la vez es un error de uso (exit 2) y no sale ninguna petición.",
    args: is("x", "--file", "input.txt"), exit: 2,
    check: noRequest,
  },
  {
    id: "is-empty-input",
    why: "Una entrada vacía se rechaza antes de llamar a Jev (exit 2).",
    args: ["is", CRITERION], stdin: "", exit: 2,
    check: noRequest,
  },
  {
    id: "is-missing-file",
    why: "Un fichero que no existe es un error de uso (exit 2) y no sale ninguna petición.",
    args: ["is", CRITERION, "--file", "nope.txt"], exit: 2,
    check: noRequest,
  },
  {
    id: "is-oversized-input",
    why: "Una entrada por encima de `--max-input-bytes` se rechaza antes de llamar a Jev (exit 2).",
    args: is("x".repeat(200), "--max-input-bytes", "50"), exit: 2,
    check: noRequest,
  },
  {
    id: "is-threshold-out-of-range",
    why: "Un umbral fuera de [0, 1] es un error de uso (exit 2).",
    args: is("x", "--threshold", "2"), exit: 2,
    check: noRequest,
  },
  {
    id: "no-key-fails-before-any-request",
    why: "Sin clave, el fallo es de proveedor (exit 4) y no sale ninguna petición: no se envía texto sin autenticar.",
    args: is("Login [p=0.90]"), exit: 4,
    env: { TYPESAFE_API_KEY: "", TYPESAFE_CREDENTIALS_FILE: "no-existe.env" },
    check: noRequest,
  },
  {
    id: "provider-error-json-redacted",
    why: "Con `--json`, el fallo sale como objeto versionado por stderr y sin los detalles del proveedor (su README promete redactarlos).",
    args: is("Boom [http=500]", "--json"), exit: 4,
    check: (r) => {
      let e;
      try {
        e = JSON.parse(r.stderr);
      } catch {
        return ["stderr no es JSON"];
      }
      return e.schema_version === "1" && e.error?.kind === "provider_error" && !/500/.test(r.stderr) ? [] : ["el objeto de error no es el documentado o filtra el estado HTTP"];
    },
  },
  {
    id: "server-error-is-retried",
    why: "Un 500 es transitorio: se reintenta dos veces (tres peticiones en total, el valor por defecto de su README) antes de fallar con exit 4.",
    args: is("Boom [http=500]"), exit: 4,
    check: requestsCount(3),
  },
  {
    id: "retries-zero",
    why: "`--retries 0` no reintenta: una sola petición.",
    args: is("Boom [http=500]", "--retries", "0"), exit: 4,
    check: requestsCount(1),
  },
  {
    id: "auth-error-is-not-retried",
    why: "Un 401 no es transitorio: no se reintenta (una petición) y falla con exit 4.",
    args: is("Boom [http=401]"), exit: 4,
    check: requestsCount(1),
  },
  {
    id: "invalid-json-response",
    why: "Una respuesta que no es JSON es un fallo de proveedor (exit 4), no una decisión.",
    args: is("Boom [badjson]"), exit: 4,
  },
  {
    id: "missing-answers-response",
    why: "Una respuesta sin `answers` es un fallo de proveedor (exit 4).",
    args: is("Boom [badshape]"), exit: 4,
  },
  {
    id: "probability-out-of-range",
    why: "Una probabilidad fuera de [0, 1] en la respuesta es un fallo de proveedor (exit 4), no un TRUE.",
    args: is("Boom [toosure]"), exit: 4,
  },
  {
    id: "choose-picks-option",
    why: "`choose` devuelve la opción elegida con las probabilidades de todas y la confianza (exit 0).",
    args: ["choose", "Which queue?", ...OPTIONS, "--text", "Hacked [pick=security]", "--json"], exit: 0,
    check: (r) => {
      const s = JSON.stringify(r.json ?? {});
      return /security/.test(s) && /support/.test(s) && /billing/.test(s) ? [] : ["el JSON no contiene la opción elegida y las probabilidades de todas"];
    },
  },
  {
    id: "choose-low-confidence-is-uncertain",
    why: "Con la confianza por debajo de `--min-confidence`, `choose` sale con 3 (incierto) en vez de dar una opción como segura.",
    args: ["choose", "Which queue?", ...OPTIONS, "--text", "Hacked [pick=security] [conf=0.20]", "--min-confidence", "0.5", "--json"], exit: 3,
  },
  {
    id: "choose-needs-two-options",
    why: "Con una sola opción es un error de uso (exit 2) y no sale ninguna petición.",
    args: ["choose", "Which queue?", "--option", "a=one", "--text", "x"], exit: 2,
    check: noRequest,
  },
  {
    id: "score-picks-level",
    why: "`score` devuelve el nivel elegido de la escala ordenada (exit 0).",
    args: ["score", "--criterion", "How trustworthy is this answer?", ...LEVELS, "--text", "An answer [pick=2]", "--json"], exit: 0,
    check: (r) => (/"score": ?2|"score":2/.test(r.stdout) ? [] : ["el JSON no da el nivel 2"]),
  },
  {
    id: "filter-keeps-matches-in-order",
    why: "`filter` deja pasar solo los registros que cumplen, en el orden de entrada, con la clave `_semdecide` (exit 0).",
    args: ["filter", "The record indicates urgent churn risk", "--field", "text"], stdinFixture: "tickets.jsonl", exit: 0,
    check: (r) => {
      const out = lines(r).map((l) => JSON.parse(l));
      return JSON.stringify(out.map((x) => x.id)) === "[1,3]" && out.every((x) => x._semdecide?.schema_version === "1") ? [] : [`registros ${JSON.stringify(out.map((x) => x.id))}, se esperaban [1,3] con _semdecide`];
    },
  },
  {
    id: "filter-raw-omits-metadata",
    why: "`--raw` emite los registros originales, sin `_semdecide`.",
    args: ["filter", "The record indicates urgent churn risk", "--field", "text", "--raw"], stdinFixture: "tickets.jsonl", exit: 0,
    check: (r) => (lines(r).length === 2 && lines(r).every((l) => !("_semdecide" in JSON.parse(l))) ? [] : ["quedó metadata o no son dos registros"]),
  },
  {
    id: "filter-no-match",
    why: "Si ningún registro cumple, `filter` sale con 1 y sin salida, como grep.",
    args: ["filter", "The record indicates urgent churn risk", "--field", "text"], stdinFixture: "none.jsonl", exit: 1,
    check: (r) => (r.stdout.trim() === "" ? [] : ["escribió registros sin coincidencias"]),
  },
  {
    id: "filter-malformed-line",
    why: "Una línea que no es JSON se rechaza antes de llamar a Jev (exit 2) y dice cuál.",
    args: ["filter", "x", "--field", "text"], stdinFixture: "bad.jsonl", exit: 2,
    check: (r) => (/line 1/.test(r.stderr) && r.requests.length === 0 ? [] : ["no dice la línea o salió una petición"]),
  },
  {
    id: "filter-max-records",
    why: "`--max-records` limita cuántos registros se aceptan: con 3 registros y un límite de 2 se rechaza (exit 2) sin llamar a Jev.",
    args: ["filter", "x", "--field", "text", "--max-records", "2"], stdinFixture: "tickets.jsonl", exit: 2,
    check: noRequest,
  },
  {
    id: "guard-fails-closed",
    why: "`guard` ante un fallo de proveedor escala en vez de dejar pasar: exit 10 (su contrato dice que falla cerrado a `escalate`).",
    args: ["guard", "--action", "Delete the production customer database [http=500]", "--context", "No backup exists", "--json"], exit: 10,
  },
  {
    id: "guard-blocks-when-every-signal-fires",
    why: "Con todas las señales altas, `guard` bloquea: exit 20.",
    args: ["guard", "--action", "Delete the production customer database [p=0.97]", "--context", "No backup exists", "--json"], exit: 20,
  },
  {
    id: "guard-allows-clear-authorized-low-risk-action",
    why: "Con peligro bajo y la acción autorizada y clara, `guard` deja pasar: exit 0 y ruta `allow`.",
    args: ["guard", "--action", "List the files in the current directory [p=0.02] [p.authorized=0.95] [p.intent_clear=0.95]", "--context", "The user asked for this listing", "--json"], exit: 0,
    check: field("route", "allow"),
  },
  {
    id: "guard-escalates-when-nothing-is-authorized",
    why: "Sin autorización ni objetivo claro, `guard` escala aunque nada sea peligroso: exit 10 y ruta `escalate`.",
    args: ["guard", "--action", "List the files in the current directory [p=0.02]", "--context", "Nobody asked for this", "--json"], exit: 10,
    check: field("route", "escalate"),
  },
];
