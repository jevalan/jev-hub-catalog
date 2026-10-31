/**
 * Batería de estabilidad y deriva de Jev contra el corpus grabado de jevc, por OpenRouter.
 *
 *   node scripts/bench-jev-openrouter.mjs --env <.env> --fixtures <dir de jev-compiler/fixtures>
 *        [--repeats 3] [--cap 1] [--concurrency 8] [--model typesafe/jev-1.13]
 *
 * Cada fixture (estado + preguntas + expectativas con verdad de terreno + respuestas grabadas en su día) se
 * lanza `--repeats` veces. Mide: cuántas expectativas cumple Jev, cuánto baila una misma respuesta entre
 * repeticiones (estabilidad) y cuánto se aleja de lo grabado (deriva). El gasto se suma con el coste que
 * OpenRouter declara en cada respuesta y la ejecución se detiene al llegar a `--cap` (USD). La clave sale del
 * .env, vive solo en este proceso y no se escribe en ningún sitio. Guarda un resumen, no las respuestas crudas,
 * en runs/<fecha>-jev-openrouter-drift/run.json.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./lib/paths.mjs";
import { evaluate, numericOf, percentile, stats } from "./lib/jev-bench.mjs";

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : dflt;
};
const today = () => new Date().toISOString().slice(0, 10);
const URL_API = "https://openrouter.ai/api/alpha/decisions";

const envFile = arg("env");
const dir = arg("fixtures");
const repeats = Number(arg("repeats", "3"));
const cap = Number(arg("cap", "1"));
const concurrency = Number(arg("concurrency", "8"));
const model = arg("model", "typesafe/jev-1.13");
// base: idéntico al corpus; reorder: orden de preguntas, de claves del estado y de criteria; paraphrase: texto de las preguntas reescrito.
const variant = arg("variant", "base");
const paraphraseFile = arg("paraphrases");
if (!["base", "reorder", "paraphrase"].includes(variant) || (variant === "paraphrase" && !paraphraseFile)) {
  console.error("--variant base|reorder|paraphrase (paraphrase exige --paraphrases <fichero>)");
  process.exit(2);
}
const paraphrases = variant === "paraphrase" ? JSON.parse(readFileSync(paraphraseFile, "utf8")) : null;
let seed = 12345;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const shuffled = (entries) => entries.map((e) => [rnd(), e]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
/** Versión de un fixture para la repetición `rep`; el ground truth (`expect`) no cambia nunca. */
function variantOf(fx, rep) {
  if (variant === "base") return { state: fx.state, questions: fx.questions };
  if (variant === "reorder") {
    const questions = Object.fromEntries(shuffled(Object.entries(fx.questions)).map(([id, q]) => [id, q.criteria && !Array.isArray(q.criteria) ? { ...q, criteria: Object.fromEntries(shuffled(Object.entries(q.criteria))) } : q]));
    const state = fx.state && typeof fx.state === "object" && !Array.isArray(fx.state) ? Object.fromEntries(shuffled(Object.entries(fx.state))) : fx.state;
    return { state, questions };
  }
  const questions = Object.fromEntries(Object.entries(fx.questions).map(([id, q]) => {
    const list = paraphrases.paraphrases[fx.id]?.[id];
    const p = list?.[rep % list.length];
    if (!p) return [id, q];
    return [id, { ...q, instructions: p.instructions, ...(p.criteria && q.criteria && !Array.isArray(q.criteria) ? { criteria: Object.fromEntries(Object.keys(q.criteria).map((k) => [k, p.criteria[k] ?? q.criteria[k]])) } : {}) }];
  }));
  return { state: fx.state, questions };
}
if (!envFile || !dir || !existsSync(dir)) {
  console.error("faltan argumentos: --env --fixtures");
  process.exit(2);
}
const key = readFileSync(envFile, "utf8").split(/\r?\n/).map((l) => l.match(/^\s*OPENROUTER_API_KEY\s*=\s*(.*)$/)?.[1]).find(Boolean)?.trim().replace(/^["']|["']$/g, "");
if (!key) {
  console.error("el .env no tiene OPENROUTER_API_KEY");
  process.exit(2);
}

const fixtures = readdirSync(dir)
  .filter((f) => f.endsWith(".json"))
  .flatMap((f) => JSON.parse(readFileSync(join(dir, f), "utf8")).fixtures.map((x) => ({ ...x, file: f })));
const recorded = (fx) => {
  try {
    return JSON.parse(fx.measured.answers);
  } catch {
    return {};
  }
};

const results = fixtures.map((fx) => ({ fx, reps: [] }));
const latencies = [];
const errors = {};
const models = new Set();
let spent = 0;
let sent = 0;
let consecutiveFailures = 0;
let stop = null;

async function call(fx, rep) {
  const v = variantOf(fx, rep);
  const body = JSON.stringify({ model, state: v.state, questions: v.questions });
  for (let attempt = 0; attempt < 5; attempt++) {
    const t0 = performance.now();
    try {
      const r = await fetch(URL_API, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body });
      const ms = performance.now() - t0;
      if (r.status === 429 || r.status >= 500) {
        errors[r.status] = (errors[r.status] ?? 0) + 1;
        const wait = Number(r.headers.get("retry-after")) * 1000 || 500 * 2 ** attempt;
        await new Promise((ok) => setTimeout(ok, Math.min(wait, 15000)));
        continue;
      }
      const text = await r.text();
      if (r.status !== 200) {
        errors[r.status] = (errors[r.status] ?? 0) + 1;
        return null;
      }
      const j = JSON.parse(text);
      latencies.push(ms);
      spent += Number(j.usage?.cost ?? 0);
      if (j.model) models.add(j.model);
      return j.answers ?? null;
    } catch (e) {
      errors[e.name] = (errors[e.name] ?? 0) + 1;
      await new Promise((ok) => setTimeout(ok, 500 * 2 ** attempt));
    }
  }
  return null;
}

// Rep-mayor: si se corta por el tope, todos los fixtures llevan las mismas repeticiones (±1).
const queue = [];
for (let rep = 0; rep < repeats; rep++) for (const r of results) queue.push(r);

async function worker() {
  while (queue.length && !stop) {
    if (spent >= cap) stop = `tope de gasto alcanzado (${spent.toFixed(4)} de ${cap} USD)`;
    else if (consecutiveFailures >= 25) stop = "25 fallos seguidos: se aborta";
    if (stop) return;
    const item = queue.shift();
    sent++;
    const answers = await call(item.fx, item.reps.length);
    consecutiveFailures = answers ? 0 : consecutiveFailures + 1;
    item.reps.push(answers);
    if (sent % 250 === 0) console.log(`${sent} peticiones, ${spent.toFixed(4)} USD, ${Math.round(sent / ((performance.now() - start) / 1000))} req/s`);
  }
}
const start = performance.now();
await Promise.all(Array.from({ length: concurrency }, worker));
const seconds = (performance.now() - start) / 1000;

// --- Agregación ---
const perFixture = results.map(({ fx, reps }) => {
  const rec = recorded(fx);
  const good = reps.filter(Boolean);
  const questions = Object.keys(fx.questions).map((q) => {
    const answers = good.map((a) => a[q]).filter(Boolean);
    const checks = answers.map((a) => evaluate(fx.expect?.[q] ?? {}, a));
    const evaluable = fx.expect?.[q] ? checks.every((c) => c.evaluable) : false;
    const passes = checks.filter((c) => c.ok).length;
    const failedReasons = {};
    for (const c of checks) for (const f of c.failed) failedReasons[f.replace(/\(.*\)$/, "").trim()] = (failedReasons[f.replace(/\(.*\)$/, "").trim()] ?? 0) + 1;
    const s = stats(answers.map(numericOf));
    const recNum = numericOf(rec[q]);
    const choices = {};
    for (const a of answers) if (a.choice) choices[a.choice] = (choices[a.choice] ?? 0) + 1;
    return {
      question: q,
      type: fx.questions[q].type,
      n: answers.length,
      evaluable,
      pass_rate: evaluable && answers.length ? Number((passes / answers.length).toFixed(4)) : null,
      ...(s ? { value: s } : {}),
      ...(Object.keys(choices).length ? { choices } : {}),
      ...(recNum !== null && s ? { recorded: recNum, drift: Number((s.mean - recNum).toFixed(4)) } : {}),
      ...(Object.keys(failedReasons).length ? { failed: failedReasons } : {}),
    };
  });
  return { id: fx.id, file: fx.file, completed_repeats: good.length, questions };
});

const all = perFixture.flatMap((f) => f.questions);
const evaluated = all.filter((q) => q.pass_rate !== null);
const numeric = all.filter((q) => q.value);
const driftAbs = numeric.filter((q) => q.drift !== undefined).map((q) => Math.abs(q.drift)).sort((a, b) => a - b);
const lat = [...latencies].sort((a, b) => a - b);
const summary = {
  fixtures: fixtures.length,
  questions: all.length,
  evaluated_expectations: evaluated.length,
  expectations_always_met: evaluated.filter((q) => q.pass_rate === 1).length,
  expectations_never_met: evaluated.filter((q) => q.pass_rate === 0).length,
  expectations_flaky: evaluated.filter((q) => q.pass_rate > 0 && q.pass_rate < 1).length,
  mean_pass_rate: evaluated.length ? Number((evaluated.reduce((s, q) => s + q.pass_rate, 0) / evaluated.length).toFixed(4)) : null,
  stability_sd_median: numeric.length ? numeric.map((q) => q.value.sd).sort((a, b) => a - b)[Math.floor(numeric.length / 2)] : null,
  stability_sd_max: numeric.length ? Math.max(...numeric.map((q) => q.value.sd)) : null,
  deterministic_questions: numeric.filter((q) => q.value.n > 1 && q.value.sd === 0).length,
  drift_vs_recorded: driftAbs.length ? { n: driftAbs.length, median_abs: driftAbs[Math.floor(driftAbs.length / 2)], p95_abs: percentile(driftAbs, 95), over_0_15: driftAbs.filter((d) => d > 0.15).length } : null,
};
const run = {
  group: "jev-openrouter-drift",
  variant,
  ...(variant === "paraphrase" ? { paraphrased_with: { model: paraphrases.model, questions: `${paraphrases.questions_paraphrased}/${paraphrases.questions_total}`, n_per_question: paraphrases.n } } : {}),
  date: today(),
  scope: "directo: la Decisions API de OpenRouter, sin pasar por el hub ni por ningún envoltorio",
  environment: {
    node: process.version,
    model_requested: model,
    models_seen: [...models],
    concurrency,
    keys: "la de OpenRouter, leída de un .env y viva solo en este proceso; no se escribe en ningún fichero",
  },
  corpus: { source: "corpus grabado de jevc (doronp/jevc, paquete jev-compiler 0.1.0)", fixtures: fixtures.length, recorded_model: "jev-1.13.0" },
  repeats: { requested: repeats, min_completed: Math.min(...perFixture.map((f) => f.completed_repeats)), max_completed: Math.max(...perFixture.map((f) => f.completed_repeats)) },
  spend: { usd: Number(spent.toFixed(6)), cap_usd: cap, requests_sent: sent, stopped: stop },
  throughput: { seconds: Math.round(seconds), requests_per_second: Number((sent / seconds).toFixed(2)), latency_ms: { p50: Math.round(percentile(lat, 50) ?? 0), p95: Math.round(percentile(lat, 95) ?? 0), p99: Math.round(percentile(lat, 99) ?? 0) } },
  errors,
  not_measured: [
    "casos fuera del corpus de jevc: los fixtures salen de incidencias públicas de agentes y no cubren otros dominios",
    "paráfrasis, orden de las preguntas y longitud del estado: cada fixture se repite idéntico",
    "otros modelos distintos de typesafe/jev-1.13",
    "`prob_lte` (una expectativa de sentido no documentado) no se evalúa",
  ],
  summary,
  fixtures: perFixture,
};
const out = join(ROOT, "runs", `${today()}-jev-openrouter-drift${variant === "base" ? "" : "-" + variant}`);
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "run.json"), JSON.stringify(run, null, 2) + "\n");
console.log(JSON.stringify({ spend: run.spend, throughput: run.throughput, errors, models: [...models], summary }, null, 2));
console.log(`evidencia: runs/${today()}-jev-openrouter-drift${variant === "base" ? "" : "-" + variant}/run.json`);
