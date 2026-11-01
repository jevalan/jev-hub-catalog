/**
 * Casos fijos de la medida directa de fast-jev-compaction (tamaratran/fast-jev-compaction), sin claves reales.
 * Puro: describe qué se ejecuta y cómo se juzga; no lanza nada.
 *
 * Es una librería (`compactMessages`): dada una conversación con llamadas a herramientas, le pregunta a Jev, por
 * cada llamada fuera de lo fijado, si la llamada y su resultado deben seguir en el historial; lo que no, se descarta
 * o se recorta. Se ejerce con scripts/lib/compaction-driver.mjs (propio): solo importa `dist/index.js` y llama a
 * `compactMessages`; no se ejecuta nada más del paquete (ni `jev-setup`, ni los hooks, ni los plugins). El proveedor
 * es un simulador nuestro en 127.0.0.1 (la probabilidad la dicta una marca `[p=0.9]` en el objetivo) y, en el juego
 * vivo, Jev de verdad por OpenRouter. La clave es inventada y solo vale contra ese servidor.
 */

export const FIXTURES = {};

const KEY = { TYPESAFE_API_KEY: "clave-inventada-de-pruebas" };
const CONFIG = "server:\n  port: 8443\n  host: 0.0.0.0\n" + "# comentario de relleno del fichero\n".repeat(60);
const README = "# Orbit\nOrbit is a small demo project.\n" + "Relleno de documentación.\n".repeat(60);

/** Una conversación: el objetivo, `steps` llamadas (llamada del asistente + resultado) y un relleno fijado al final. */
export const conversation = (goal, steps, tail = 4) => [
  { role: "user", text: goal, toolUses: [] },
  ...steps.flatMap((s, i) => [
    { role: "assistant", text: `step ${i + 1}`, toolUses: [{ tool_use_id: `t${i + 1}`, tool: s.tool, input: s.input, ...(s.isError ? { isError: true } : {}) }] },
    { role: "user", text: "", toolUses: [], toolResults: [{ tool_use_id: `t${i + 1}`, text: s.result, ...(s.isError ? { isError: true } : {}) }] },
  ]),
  ...Array.from({ length: tail }, (_, i) => ({ role: i % 2 ? "user" : "assistant", text: `filler ${i + 1}`, toolUses: [] })),
];

export const STEPS = [
  { tool: "Bash", input: { command: "ls" }, result: "README.md\nconfig\npackage.json\nsrc" },
  { tool: "Read", input: { file_path: "config/server.yaml" }, result: CONFIG },
  { tool: "Bash", input: { command: "git status" }, result: "On branch main\nnothing to commit, working tree clean" },
  { tool: "Read", input: { file_path: "README.md" }, result: README },
  { tool: "Bash", input: { command: "echo done" }, result: "done" },
];
const GOAL = "What port does the server listen on? Answer from the config file read earlier.";
const GOAL_README = "What is the project called according to the README read earlier?";
const MANY = Array.from({ length: 60 }, (_, i) => ({ tool: "Bash", input: { command: `echo ${i}` }, result: `line ${i}` }));
const send = (messages, options = {}) => JSON.stringify({ messages, options });
const decisions = (r) => r.json?.decisions ?? [];
const action = (r, id) => decisions(r).find((d) => d.id === id)?.action;
const noRequest = (r) => (r.requests.length === 0 ? [] : [`salieron ${r.requests.length} peticiones, se esperaba ninguna`]);
const sentText = (r) => JSON.stringify(r.requests.map((q) => q.body));

const noArgs = (cases) => cases.map((c) => ({ args: [], ...c }));

export const fastJevCases = () => noArgs([
  {
    id: "high-scores-leave-the-conversation-untouched",
    why: "Con la probabilidad por encima del umbral no se quita nada y los mensajes salen idénticos a los de entrada.",
    stdin: send(conversation(`${GOAL} [p=0.9]`, STEPS), { goal: `${GOAL} [p=0.9]` }), env: KEY, exit: 0,
    check: (r) => {
      const p = [];
      if (decisions(r).some((d) => d.action !== "keep")) p.push("descartó algo con probabilidad alta");
      if (JSON.stringify(r.json?.messages) !== JSON.stringify(conversation(`${GOAL} [p=0.9]`, STEPS))) p.push("los mensajes no salen idénticos");
      return p;
    },
  },
  {
    id: "low-scores-drop-calls-with-their-results",
    why: "Con la probabilidad por debajo del umbral descarta la llamada junto con su resultado y los mensajes quedan más cortos.",
    stdin: send(conversation(`${GOAL} [p=0.1]`, STEPS), { goal: `${GOAL} [p=0.1]` }), env: KEY, exit: 0,
    check: (r) => {
      const s = r.json?.stats;
      const p = [];
      if (!(s?.callsDropped > 0)) p.push("no descartó ninguna llamada");
      if (!(s?.charsAfter < s?.charsBefore)) p.push("no redujo los caracteres");
      return p;
    },
    observe: (r) => ({ stats: r.json?.stats && { calls: r.json.stats.calls, callsDropped: r.json.stats.callsDropped, pinned: r.json.stats.pinned, messagesBefore: r.json.stats.messagesBefore, messagesAfter: r.json.stats.messagesAfter } }),
  },
  {
    id: "first-and-newest-messages-are-pinned",
    why: "Lo fijado (el primer mensaje y los más recientes) no se pregunta ni se descarta nunca.",
    stdin: send(conversation(`${GOAL} [p=0.1]`, STEPS, 0), { goal: `${GOAL} [p=0.1]` }), env: KEY, exit: 0,
    check: (r) => {
      const pinned = decisions(r).filter((d) => d.reason === "pinned");
      const asked = Object.keys(r.requests[0]?.body?.questions ?? {});
      const p = [];
      if (!pinned.length) p.push("no hay llamadas fijadas");
      if (pinned.some((d) => d.action !== "keep")) p.push("descartó una llamada fijada");
      if (pinned.some((d) => asked.includes(`call_${d.id}`))) p.push("preguntó por una llamada fijada");
      return p;
    },
    observe: (r) => ({ pinned: decisions(r).filter((d) => d.reason === "pinned").map((d) => d.id), questions: Object.keys(r.requests[0]?.body?.questions ?? {}).length }),
  },
  {
    id: "call-and-result-are-decided-separately",
    why: "La llamada y el resultado tienen su propia pregunta: conservar la llamada y descartar el resultado deja una cabeza acotada con una nota.",
    stdin: send(conversation(`${GOAL} [p.call_t2=0.9][p.result_t2=0.1][p=0.9]`, STEPS), { goal: `${GOAL} [p.call_t2=0.9][p.result_t2=0.1][p=0.9]` }), env: KEY, exit: 0,
    check: (r) => {
      const res = r.json?.messages?.flatMap((m) => m.toolResults ?? []).find((x) => x.tool_use_id === "t2");
      const p = [];
      if (action(r, "t2") !== "drop_result") p.push(`t2: ${action(r, "t2")}`);
      if (!res || res.text.length >= 1000) p.push("el resultado no quedó recortado");
      return p;
    },
    observe: (r) => ({ kept_result_head: r.json?.messages?.flatMap((m) => m.toolResults ?? []).find((x) => x.tool_use_id === "t2")?.text.slice(0, 160) }),
  },
  {
    id: "keep-threshold-option-raises-the-bar",
    why: "`keepThreshold` sube el listón: con 0,9 de probabilidad y umbral 0,95 se descarta lo que con el umbral por defecto se conservaba.",
    stdin: send(conversation(`${GOAL} [p=0.9]`, STEPS), { goal: `${GOAL} [p=0.9]`, keepThreshold: 0.95 }), env: KEY, exit: 0,
    check: (r) => (decisions(r).some((d) => d.action !== "keep") ? [] : ["no descartó nada con el umbral alto"]),
  },
  {
    id: "request-shape",
    why: "Una sola petición para una conversación pequeña, con la clave por Authorization, y dos preguntas binarias por llamada.",
    stdin: send(conversation(`${GOAL} [p=0.9]`, STEPS), { goal: `${GOAL} [p=0.9]` }), env: KEY, exit: 0,
    check: (r) => {
      const p = [];
      if (r.requests.length !== 1) p.push(`${r.requests.length} peticiones`);
      if (!/^Bearer clave-inventada/.test(r.requests[0]?.auth ?? "")) p.push("la clave no viaja por Authorization");
      const qs = Object.entries(r.requests[0]?.body?.questions ?? {});
      if (!qs.length || !qs.every(([k, q]) => /^(call|result)_/.test(k) && q.type === "noul")) p.push("las preguntas no son call_/result_ binarias");
      return p;
    },
    observe: (r) => ({ model_sent: r.requests[0]?.body?.model, state_keys: Object.keys(r.requests[0]?.body?.state ?? {}), questions: Object.keys(r.requests[0]?.body?.questions ?? {}).length }),
  },
  {
    id: "tool-result-text-is-not-in-the-state",
    why: "Observación: el estado que se manda al proveedor lleva las llamadas pero no el texto de los resultados (se pregunta sin enseñarlos).",
    stdin: send(conversation(`${GOAL} [p=0.9]`, STEPS), { goal: `${GOAL} [p=0.9]` }), env: KEY, exit: 0,
    check: () => [],
    observe: (r) => ({ result_text_sent: sentText(r).includes("port: 8443") || sentText(r).includes("comentario de relleno"), tool_inputs_sent: sentText(r).includes("config/server.yaml") }),
  },
  {
    id: "secret-in-tool-input-reaches-the-provider",
    why: "Observación: una orden con una clave dentro (lo que el asistente escribió) viaja al proveedor tal cual en el historial.",
    stdin: send(conversation(`${GOAL} [p=0.9]`, [{ tool: "Bash", input: { command: "curl -H 'Authorization: Bearer " + "eyJ" + "hbGciOiJIUzI1NiJ9.abc' https://api.example.com" }, result: "ok" }, ...STEPS]), { goal: `${GOAL} [p=0.9]` }), env: KEY, exit: 0,
    check: () => [],
    observe: (r) => ({ secret_sent: sentText(r).includes("hbGciOiJIUzI1NiJ9") }),
  },
  {
    id: "no-key-is-an-error-and-sends-nothing",
    why: "Sin clave falla con un error que lo dice y no envía nada (no cae a ningún resumen propio).",
    stdin: send(conversation(`${GOAL} [p=0.9]`, STEPS), { goal: GOAL }), env: { TYPESAFE_API_KEY: "" }, exit: 1,
    check: (r) => (/TYPESAFE_API_KEY is not configured/.test(r.json?.error ?? "") ? noRequest(r) : [`error: ${r.stdout.slice(0, 100)}`]),
  },
  {
    id: "server-error-throws",
    why: "Un 500 se propaga como error (la librería no cae sola a otra cosa: lo decide quien la llama).",
    stdin: send(conversation(`${GOAL} [http=500]`, STEPS), { goal: `${GOAL} [http=500]` }), env: KEY, exit: 1,
    check: (r) => (r.json?.error ? [] : ["no devolvió un error"]),
    observe: (r) => ({ requests_sent: r.requests.length, error: r.json?.error?.slice(0, 120) }),
  },
  {
    id: "non-json-body-throws",
    why: "Un cuerpo que no es JSON es un error, no una conversación sin tocar.",
    stdin: send(conversation(`${GOAL} [badjson]`, STEPS), { goal: `${GOAL} [badjson]` }), env: KEY, exit: 1,
    check: (r) => (r.json?.error ? [] : ["no devolvió un error"]),
  },
  {
    id: "empty-conversation",
    why: "Observación: una conversación vacía no revienta.",
    stdin: send([], {}), env: KEY, exit: null,
    check: () => [],
    observe: (r) => ({ exit: r.status, out: r.stdout.slice(0, 200) }),
  },
  {
    id: "large-history-is-batched",
    why: "Con muchas llamadas y un tope de petición ajustado reparte las preguntas en varias peticiones.",
    stdin: send(conversation(`${GOAL} [p=0.9]`, MANY), { goal: `${GOAL} [p=0.9]`, maxRequestTokens: 7000 }), env: KEY, exit: 0,
    check: (r) => (r.requests.length > 1 ? [] : [`${r.requests.length} peticiones para 60 llamadas`]),
    observe: (r) => ({ requests: r.requests.length, calls: r.json?.stats?.calls }),
  },
  {
    id: "history-that-does-not-fit-throws",
    why: "Si el estado no cabe en el tope de petición falla en voz alta (no recorta en silencio) y no envía nada.",
    stdin: send(conversation(`${GOAL} [p=0.9]`, MANY), { goal: `${GOAL} [p=0.9]`, maxRequestTokens: 4000 }), env: KEY, exit: 1,
    check: (r) => (/no room for questions|too large/.test(r.json?.error ?? "") ? noRequest(r) : [`error: ${r.stdout.slice(0, 100)}`]),
    observe: (r) => ({ error: r.json?.error }),
  },
]);

/** Casos vivos: Jev de verdad (jev-1.13 por OpenRouter, a través del adaptador). La pregunta del objetivo solo se contesta con un resultado concreto. */
const live = (goal) => send(conversation(goal, STEPS), { goal });
const kept = (r, id) => action(r, id) === "keep";
const acts = (r) => Object.fromEntries(decisions(r).map((d) => [d.id, `${d.tool}:${d.action}`]));
const scores = (r) => Object.fromEntries(decisions(r).filter((d) => d.reason !== "pinned").map((d) => [d.id, [d.keepCall, d.keepResult]]));
/** ¿El id puntúa más alto que todos los demás no fijados, tanto en llamada como en resultado? */
const ranksFirst = (r, id) => {
  const rows = decisions(r).filter((d) => d.reason !== "pinned");
  const me = rows.find((d) => d.id === id);
  const others = rows.filter((d) => d.id !== id);
  return Boolean(me) && others.every((d) => me.keepCall > d.keepCall && me.keepResult > d.keepResult);
};
export const fastJevLiveCases = () => noArgs([
  {
    id: "live-ranks-the-result-the-goal-depends-on-first",
    why: "Si la pregunta se contesta con el fichero de configuración leído antes, esa llamada y ese resultado puntúan más alto que todos los demás.",
    stdin: live(GOAL), env: KEY, exit: 0,
    check: (r) => (ranksFirst(r, "t2") ? [] : [`puntuaciones ${JSON.stringify(scores(r))}`]),
    observe: (r) => ({ scores_call_result: scores(r), actions: acts(r), reduction: r.json?.stats && [r.json.stats.charsBefore, r.json.stats.charsAfter] }),
  },
  {
    id: "live-needed-result-survives-the-default-threshold",
    why: "Con el umbral por defecto (0,5) esa lectura se conserva: la pregunta no se puede contestar sin ella.",
    stdin: live(GOAL), env: KEY, exit: 0,
    check: (r) => (kept(r, "t2") ? [] : [`t2 (config/server.yaml): ${action(r, "t2")}, puntuación ${JSON.stringify(scores(r).t2)}`]),
  },
  {
    id: "live-drops-what-the-goal-does-not-use",
    why: "Descarta lo que esa pregunta no usa: el listado y el README.",
    stdin: live(GOAL), env: KEY, exit: 0,
    check: (r) => [["t1", "listado"], ["t4", "README"]].filter(([id]) => kept(r, id)).map(([, n]) => `conservó el ${n}`),
  },
  {
    id: "live-follows-the-goal",
    why: "Con otra pregunta («cómo se llama el proyecto según el README») el README pasa a puntuar el primero y la configuración deja de serlo.",
    stdin: live(GOAL_README), env: KEY, exit: 0,
    check: (r) => {
      const p = [];
      if (!ranksFirst(r, "t4")) p.push(`el README no puntúa primero: ${JSON.stringify(scores(r))}`);
      if (ranksFirst(r, "t2")) p.push("la configuración sigue puntuando primero");
      return p;
    },
    observe: (r) => ({ scores_call_result: scores(r), actions: acts(r) }),
  },
]);
