/**
 * Casos de la sonda del hook de Codex de JevLoop (`scripts/probe-loop.mjs`) contra el proveedor simulado.
 * Puro: describe las entradas y lo esperado; no ejecuta nada. El simulador NO es Jev: la probabilidad de cada
 * respuesta la dicta una marca que el propio caso escribe en el texto (ver `stub-provider.mjs`), así que se mide
 * el cableado del hook (umbrales, fallo cerrado, lectura de la transcripción, qué viaja), nunca un juicio.
 *
 * Una marca solo llega al simulador si está en un campo que la pregunta lleva en su estado: en `pre` y `stop`
 * va en la tarea; en `post` la tarea NO viaja (es una decisión de diseño de JevLoop), así que va en la salida.
 *
 * Cada caso:  hook, task, steps, call?  → lo que se le da (misma forma que el corpus de frontera)
 *             env?        → variables extra del hook (por defecto: apunta al simulador con una clave inventada)
 *             stdin?      → texto crudo en lugar del evento (evento ilegible)
 *             transcript? → "none" (sin ruta), "missing" (ruta que no existe) o "env-only" (solo el bloque de entorno)
 *             bigTranscript? → n pasos de relleno antes de los reales
 *             expect      → { stopped?, kind?, requests?, exit?, stderr? (subcadena), sentKeys? }
 */

const NEUTRAL = "tidy up the project";
const step = (command, output) => ({ tool: "shell", input: { command }, output });

const pre = (id, why, task, command, expect, extra = {}) => ({ id, why, hook: "pre", task, call: { tool: "shell", input: { command } }, steps: [], expect, ...extra });
const post = (id, why, task, command, output, expect, extra = {}) => ({ id, why, hook: "post", task, call: step(command, output), steps: [], expect, ...extra });
const stop = (id, why, task, steps, expect, extra = {}) => ({ id, why, hook: "stop", task, call: null, steps, expect, ...extra });

export const CASES = [
  // pre · grade_risk: dos puertas independientes, la del riesgo (>= 2) y la de la autorización (>= 0.5).
  pre("pre-risk-high", "riesgo 3 (destructivo): niega por la puerta del riesgo", `${NEUTRAL} [pick=3] [p.needs_auth=0.1]`, "rm -rf build", { stopped: true, kind: "deny", requests: 1 }),
  pre("pre-risk-low", "riesgo 0 y sin autorización: calla (permitir)", `${NEUTRAL} [pick=0] [p.needs_auth=0.1]`, "ls", { stopped: false, kind: "silence", requests: 1 }),
  pre("pre-risk-mid", "riesgo 1 (escritura reversible): pasa, solo se anota", `${NEUTRAL} [pick=1] [p.needs_auth=0.1]`, "touch notes.txt", { stopped: false, kind: "silence", requests: 1 }),
  pre("pre-auth-gate", "riesgo bajo pero autorización 0,9: la segunda puerta niega aunque la primera pase", `${NEUTRAL} [pick=0] [p.needs_auth=0.9]`, "ls", { stopped: true, kind: "deny", requests: 1 }),
  pre("pre-auth-at-threshold", "autorización exactamente 0,5 (sin información): la puerta es >= 0,5, así que niega", `${NEUTRAL} [pick=0] [p.needs_auth=0.5]`, "ls", { stopped: true, kind: "deny", requests: 1 }),
  pre("pre-ask-human-maps-to-deny", "el protocolo de Codex tiene `ask` pero el adaptador mapea ask_human a deny y lo declara", `${NEUTRAL} [pick=3] [p.needs_auth=0.9]`, "ls", { stopped: true, kind: "deny", requests: 1, stderr: "ask_human" }),
  pre("pre-payload", "viajan la herramienta, su riesgo base, el objetivo marcado como no fiable y la tarea; ni cwd ni lista de ficheros", `${NEUTRAL} [pick=0] [p.needs_auth=0.1]`, "ls", { stopped: false, requests: 1, sentKeys: ["base_risk", "target", "task", "tool"] }),

  // post · step_ok: aquí el listón es 0,6 (no 0,5) y «no» no es silencio, es block.
  post("post-ok", "ok = 0,9: calla", "run the tests", "npm test", "Tests: 12 passed [p.ok=0.9]", { stopped: false, kind: "silence", requests: 1 }),
  post("post-failed", "ok = 0,2: block", "run the tests", "npm test", "Tests: 3 failed [p.ok=0.2]", { stopped: true, kind: "block", requests: 1 }),
  post("post-at-half", "ok = 0,5 (sin información): el listón es 0,6, así que bloquea en lugar de tomarlo por éxito", "run the tests", "npm test", "inconcluso [p.ok=0.5]", { stopped: true, kind: "block", requests: 1 }),
  post("post-payload", "la tarea NO viaja en la puerta del paso: solo herramienta, entrada, salida y recuento de lecturas", "SECRETO-DE-TAREA run the tests", "npm test", "Tests: 12 passed [p.ok=0.9]", { stopped: false, requests: 1, sentKeys: ["already_read", "input", "output", "tool"] }),

  // stop · is_done: >= 0,6 deja terminar; si no, block («sigue»).
  stop("stop-done", "done = 0,9: calla (deja terminar)", `read a.txt [p.done=0.9]`, [step("cat a.txt", "alpha")], { stopped: false, kind: "silence", requests: 1 }),
  stop("stop-not-done", "done = 0,3: block (no termines)", `read a.txt [p.done=0.3]`, [step("cat a.txt", "alpha")], { stopped: true, kind: "block", requests: 1 }),
  stop("stop-no-steps", "sin ningún paso aún se pregunta igualmente", `read a.txt [p.done=0.3]`, [], { stopped: true, kind: "block", requests: 1 }),
  stop("stop-big-transcript", "una transcripción de unos 2 MB: la tarea se lee de la cabeza y los pasos de la cola; sigue funcionando", `read a.txt [p.done=0.9]`, [step("cat a.txt", "alpha")], { stopped: false, kind: "silence", requests: 1 }, { bigTranscript: 4000 }),

  pre("records-appended", "con JEVLOOP_RECORDS añade un registro por decisión, en el fichero que se le diga", `${NEUTRAL} [pick=0] [p.needs_auth=0.1]`, "ls", { stopped: false, requests: 1, records: 1 }, { records: true }),

  // Fallo cerrado y casos raros.
  pre("fail-http-500", "el proveedor responde 500: niega (no deja pasar)", `${NEUTRAL} [http=500]`, "ls", { stopped: true, requests: 1 }),
  pre("fail-bad-json", "el proveedor responde algo que no es JSON: niega", `${NEUTRAL} [badjson]`, "ls", { stopped: true, requests: 1 }),
  pre("fail-bad-shape", "el proveedor responde JSON sin `answers`: niega", `${NEUTRAL} [badshape]`, "ls", { stopped: true, requests: 1 }),
  pre("fail-out-of-range", "una probabilidad fuera de [0, 1]: niega", `${NEUTRAL} [toosure]`, "ls", { stopped: true, requests: 1 }),
  post("fail-http-500-post", "500 en la puerta del paso: bloquea", "run the tests", "npm test", "Tests: 12 passed [http=500]", { stopped: true, requests: 1 }),
  stop("fail-http-500-stop", "500 en la puerta de fin: bloquea (no deja terminar sin juicio)", "read a.txt [http=500]", [step("cat a.txt", "alpha")], { stopped: true, requests: 1 }),
  pre("fail-no-backend", "sin proveedor configurado: niega, sin ninguna petición", `${NEUTRAL}`, "ls", { stopped: true, requests: 0 }, { env: { JEVLOOP_JEV_URL: "", TYPESAFE_API_KEY: "" } }),
  pre("fail-unreachable", "proveedor inalcanzable (puerto cerrado): niega", `${NEUTRAL}`, "ls", { stopped: true, requests: 0 }, { env: { JEVLOOP_JEV_URL: "http://127.0.0.1:9" } }),
  pre("event-unreadable", "stdin no es JSON: calla con exit 0 (equivale a permitir; es a propósito)", NEUTRAL, "ls", { stopped: false, kind: "silence", requests: 0, exit: 0 }, { stdin: "esto no es json" }),
  pre("event-empty", "stdin vacío: calla con exit 0", NEUTRAL, "ls", { stopped: false, kind: "silence", requests: 0, exit: 0 }, { stdin: "" }),
  pre("event-unknown-name", "evento sin puerta (SessionStart): calla y no pregunta", NEUTRAL, "ls", { stopped: false, kind: "silence", requests: 0 }, { eventName: "SessionStart" }),
  pre("transcript-none", "sin ruta de transcripción: no hay tarea que juzgar, niega", NEUTRAL, "ls", { stopped: true, requests: 0 }, { transcript: "none" }),
  pre("transcript-missing", "la ruta de la transcripción no existe: niega", NEUTRAL, "ls", { stopped: true, requests: 0 }, { transcript: "missing" }),
  pre("transcript-env-only", "la transcripción solo trae el bloque de entorno sintético de Codex: no es una tarea, niega", NEUTRAL, "ls", { stopped: true, requests: 0 }, { transcript: "env-only" }),
  pre("stub-shell-denied", "el modo JEVLOOP_STUB=1 (autocomprobación del autor, «no es un juicio») niega incluso `ls`: no vale para nada real", NEUTRAL, "ls", { stopped: true, requests: 0 }, { env: { JEVLOOP_STUB: "1", JEVLOOP_JEV_URL: "", TYPESAFE_API_KEY: "" } }),
];
