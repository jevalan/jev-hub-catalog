/**
 * Casos fijos de la medida directa de jevprune (ibrahemid/jevprune), sin claves reales.
 * Puro: describe qué se ejecuta y cómo se juzga; no lanza nada.
 *
 * jevprune filtra la salida larga de un comando para un agente: descarta las líneas que la tarea no necesita y
 * conserva el resto con su texto y su orden. Sin clave cae a reglas (cabeza, cola y errores con contexto). Se
 * ejerce con `select` (sobre un fichero o stdin) y con `run`. El proveedor es un simulador nuestro en 127.0.0.1
 * (la probabilidad de cada línea la dicta una marca `[p=0.9]` escrita en la tarea) y, en el juego vivo, Jev de
 * verdad por OpenRouter a través de un adaptador con tope. La clave es inventada y solo vale contra ese servidor.
 */

const ERROR_LINE = "ERROR: AssertionError in test/auth.test.ts:42 expected 200 got 401";
const LOG = Array.from({ length: 200 }, (_, i) => (i === 119 ? ERROR_LINE : `PASS test/case${i + 1}.test.ts (${i + 1} ms)`));
const GITHUB_TOKEN = "gh" + "p_" + "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8";

export const FIXTURES = {
  "npm-test.log": LOG.join("\n") + "\n",
  "doc.json": JSON.stringify({ name: "demo", items: Array.from({ length: 150 }, (_, i) => ({ i, name: `item${i}` })) }, null, 2) + "\n",
  "github-token.log": [...LOG.slice(0, 60), `export GITHUB_TOKEN=${GITHUB_TOKEN}`, ...LOG.slice(60)].join("\n") + "\n",
};

const KEY = { TYPESAFE_API_KEY: "clave-inventada-de-pruebas" };
const TASK = "fix failing auth test";
const sel = (task = TASK, file = "npm-test.log", ...more) => ["select", "--task", task, "--command", "npm test", "--file", file, ...more];
const out = (r) => r.stdout.split(/\r?\n/).filter((l) => l !== "");
const footer = (r) => out(r).at(-1) ?? "";
const body = (r) => out(r).filter((l) => !/^jevprune:|^\[jevprune:/.test(l));
const asked = (r) => Object.keys(r.requests[0]?.body?.questions ?? {}).length;
const noRequest = (r) => (r.requests.length === 0 ? [] : [`salieron ${r.requests.length} peticiones, se esperaba ninguna`]);

/** ¿Las líneas conservadas son líneas originales y siguen en su orden? */
function verbatimInOrder(r) {
  let at = -1;
  for (const l of body(r)) {
    const i = LOG.indexOf(l);
    if (i < 0) return [`línea que no es del original: ${JSON.stringify(l.slice(0, 60))}`];
    if (i <= at) return ["las líneas conservadas no siguen el orden original"];
    at = i;
  }
  return [];
}

export const jevPruneCases = (version) => [
  {
    id: "version",
    why: "`--version` imprime la versión del paquete.",
    args: ["--version"], exit: 0,
    check: (r) => (r.stdout.trim() === version ? [] : [`versión ${JSON.stringify(r.stdout.trim())}, se esperaba ${version}`]),
  },
  {
    id: "help",
    why: "`--help` lista `run`, `select`, `show` y `gain`.",
    args: ["--help"], exit: 0,
    check: (r) => (["run", "select", "show", "gain"].every((c) => new RegExp(`^  ${c}\\b`, "m").test(r.stdout)) ? [] : ["la ayuda no lista los cuatro comandos"]),
  },
  {
    id: "unknown-command",
    why: "Un comando desconocido es un error de uso, no un éxito.",
    args: ["zumbido"], exit: null,
    check: (r) => (r.status !== 0 ? [] : ["salió con 0"]),
    observe: (r) => ({ exit: r.status, stderr: r.stderr.slice(0, 120) }),
  },
  {
    id: "no-key-falls-back-to-rules",
    why: "Sin clave no hay petición: cae a reglas (cabeza, cola y errores con contexto), conserva el error y lo declara en el pie.",
    args: sel(), exit: 0,
    check: (r) => {
      const p = [...noRequest(r)];
      if (!/fallback \(Jev unavailable: API key not set\)/.test(footer(r))) p.push(`pie: ${footer(r).slice(0, 100)}`);
      if (!body(r).includes(ERROR_LINE)) p.push("perdió la línea del error");
      if (body(r).length >= 200) p.push("no recortó nada");
      return p;
    },
    observe: (r) => ({ lines_out: body(r).length, footer: footer(r).replace(/~.*$/, "~…") }),
  },
  {
    id: "fallback-keeps-head-and-tail",
    why: "El recorte por reglas conserva el principio y el final y descarta el medio sin relación con un error.",
    args: sel(), exit: 0,
    check: (r) => {
      const b = body(r);
      const p = [];
      if (!b.includes(LOG[0]) || !b.includes(LOG[199])) p.push("perdió la primera o la última línea");
      if (b.includes(LOG[59])) p.push("conservó una línea del medio sin motivo");
      return p;
    },
  },
  {
    id: "jev-asks-one-yes-no-question-per-line",
    why: "Con clave pregunta una vez, una pregunta binaria por línea candidata, con la tarea y el comando en el estado.",
    args: sel(`${TASK} [p=0.9]`), env: KEY, exit: 0,
    check: (r) => {
      const p = [];
      if (r.requests.length !== 1) p.push(`${r.requests.length} peticiones`);
      const b = r.requests[0]?.body;
      if (!/^Bearer clave-inventada/.test(r.requests[0]?.auth ?? "")) p.push("la clave no viaja por Authorization");
      if (b?.state?.task !== `${TASK} [p=0.9]` || b?.state?.command !== "npm test") p.push("el estado no lleva la tarea y el comando");
      if (!Object.values(b?.questions ?? {}).every((q) => q.type === "noul")) p.push("hay preguntas que no son binarias");
      return p;
    },
    observe: (r) => ({ questions: asked(r), lines_in_log: 200, model_sent: r.requests[0]?.body?.model }),
  },
  {
    id: "lines-the-rules-keep-are-not-sent",
    why: "Las líneas que las reglas ya conservan no se mandan al proveedor: se pregunta por menos líneas que las del registro.",
    args: sel(`${TASK} [p=0.9]`), env: KEY, exit: 0,
    check: (r) => (asked(r) > 0 && asked(r) < 200 ? [] : [`se preguntó por ${asked(r)} de 200 líneas`]),
  },
  {
    id: "high-scores-keep-everything",
    why: "Con la probabilidad por encima del umbral se conserva todo y el pie lo cuenta (200 → 200).",
    args: sel(`${TASK} [p=0.9]`), env: KEY, exit: 0,
    check: (r) => (body(r).length === 200 && /200 → 200 lines/.test(footer(r)) ? [] : [`${body(r).length} líneas, pie: ${footer(r).slice(0, 80)}`]),
  },
  {
    id: "low-scores-drop-noise-but-keep-the-error",
    why: "Con la probabilidad bajo el umbral descarta el ruido, deja una marca del rango descartado y conserva la línea del error.",
    args: sel(`${TASK} [p=0.1]`), env: KEY, exit: 0,
    check: (r) => {
      const p = [];
      if (!out(r).some((l) => /^\[jevprune: \d+ lines dropped, run \S+, lines \d+-\d+\]$/.test(l))) p.push("sin marca de líneas descartadas");
      if (!body(r).includes(ERROR_LINE)) p.push("perdió la línea del error");
      if (body(r).length > 80) p.push(`conservó ${body(r).length} líneas`);
      return p;
    },
    observe: (r) => ({ lines_out: body(r).length, footer: footer(r).replace(/~.*$/, "~…") }),
  },
  {
    id: "kept-lines-are-verbatim-and-in-order",
    why: "Las líneas conservadas son las originales, sin reescribir, y siguen en su orden.",
    args: sel(`${TASK} [p=0.1]`), env: KEY, exit: 0,
    check: verbatimInOrder,
  },
  {
    id: "threshold-flag-raises-the-bar",
    why: "`--threshold` sube el listón: con 0,9 de puntuación y umbral 0,95 se descarta lo que con el umbral por defecto se conservaba.",
    args: sel(`${TASK} [p=0.9]`, "npm-test.log", "--threshold", "0.95"), env: KEY, exit: 0,
    check: (r) => (body(r).length < 100 ? [] : [`conservó ${body(r).length} líneas`]),
  },
  {
    id: "stdin-works-like-a-file",
    why: "Sin `--file` lee stdin.",
    args: ["select", "--task", `${TASK} [p=0.9]`], stdin: FIXTURES["npm-test.log"], env: KEY, exit: 0,
    check: (r) => (body(r).length === 200 ? [] : [`${body(r).length} líneas`]),
  },
  {
    id: "documents-pass-through-without-a-request",
    why: "Un documento (JSON, Markdown, diff…) pasa entero y sin petición, y el pie dice por qué.",
    args: sel(TASK, "doc.json"), env: KEY, exit: 0,
    check: (r) => (/passed through \(output looks like a document\)/.test(footer(r)) ? noRequest(r) : [`pie: ${footer(r).slice(0, 100)}`]),
  },
  {
    id: "server-error-falls-back-and-says-why",
    why: "Un 500 se reintenta una vez y cae a reglas declarándolo, sin fallar el comando.",
    args: sel(`${TASK} [http=500]`), env: KEY, exit: 0,
    check: (r) => (/fallback \(Jev unavailable: JevRequestError\)/.test(footer(r)) && body(r).includes(ERROR_LINE) ? [] : [`pie: ${footer(r).slice(0, 100)}`]),
    observe: (r) => ({ requests_sent: r.requests.length }),
  },
  {
    id: "non-json-body-falls-back",
    why: "Un cuerpo que no es JSON cae a reglas declarando «invalid response».",
    args: sel(`${TASK} [badjson]`), env: KEY, exit: 0,
    check: (r) => (/fallback \(Jev unavailable: invalid response\)/.test(footer(r)) ? [] : [`pie: ${footer(r).slice(0, 100)}`]),
  },
  {
    id: "run-passes-the-exit-code-through",
    why: "`run` ejecuta el comando, imprime su salida y sale con el código del propio comando.",
    args: ["run", "--task", "x", "--", "node", "-e", "console.log('hola'); process.exit(3)"], exit: 3,
    check: (r) => (r.stdout.includes("hola") && /exit 3/.test(footer(r)) ? [] : [`salida: ${r.stdout.slice(0, 100)}`]),
  },
  {
    id: "show-unknown-run-fails",
    why: "`show` de un identificador que no existe es un error.",
    args: ["show", "no-existe"], exit: null,
    check: (r) => (r.status !== 0 ? [] : ["salió con 0"]),
    observe: (r) => ({ exit: r.status }),
  },
  {
    id: "github-token-in-output-reaches-the-provider",
    why: "Observación: un token de GitHub en una línea del registro NO activa la protección de credenciales y viaja al proveedor.",
    args: sel(`${TASK} [p=0.9]`, "github-token.log"), env: KEY, exit: 0,
    check: () => [],
    observe: (r) => ({ requests: r.requests.length, token_sent: JSON.stringify(r.requests.map((q) => q.body)).includes(GITHUB_TOKEN.slice(-12)) }),
  },
];

/** Casos vivos: Jev de verdad (jev-1.13 por OpenRouter, a través del adaptador que reenvía lo que el cliente manda). */
const liveSel = (task = TASK) => sel(task);
export const jevPruneLiveCases = () => [
  {
    id: "live-keeps-the-failure",
    why: "Para «arreglar el test de auth», conserva la línea del fallo.",
    args: liveSel(), env: KEY, exit: 0,
    check: (r) => (body(r).includes(ERROR_LINE) ? [] : ["perdió la línea del fallo"]),
    observe: (r) => ({ lines_out: body(r).length, footer: footer(r).replace(/~.*$/, "~…") }),
  },
  {
    id: "live-drops-routine-success-noise",
    why: "Descarta la mayor parte de las 199 líneas de «PASS» rutinarias.",
    args: liveSel(), env: KEY, exit: 0,
    check: (r) => (body(r).length <= 80 ? [] : [`conservó ${body(r).length} de 200 líneas`]),
    observe: (r) => ({ lines_out: body(r).length }),
  },
  {
    id: "live-kept-lines-are-verbatim-and-in-order",
    why: "Lo que conserva son líneas originales y en su orden.",
    args: liveSel(), env: KEY, exit: 0,
    check: verbatimInOrder,
  },
  {
    id: "live-follows-the-task",
    why: "Con otra tarea («cuánto tardó el test 7») el error de auth deja de ser lo importante: observación de la dependencia de la tarea.",
    args: liveSel("report how long test case 7 took"), env: KEY, exit: 0,
    check: () => [],
    observe: (r) => ({ lines_out: body(r).length, kept_error_line: body(r).includes(ERROR_LINE), kept_case7: body(r).some((l) => /case7\.test/.test(l)) }),
  },
];
