/**
 * Genera paráfrasis de las preguntas del corpus de jevc con un modelo de chat barato (OpenRouter) y las guarda.
 *
 *   node scripts/paraphrase-fixtures.mjs --env <.env> --fixtures <dir> --out <fichero.json>
 *        [--model qwen/qwen3.7-flash] [--n 2] [--cap 0.5]
 *
 * Solo se reescribe el TEXTO de las preguntas (`instructions` y las descripciones de `criteria`/`legend`
 * que sean cadenas); nunca el estado, que lleva órdenes y rutas exactas, ni los ids, tipos o claves de las
 * opciones. El resultado se guarda para repetir la medida sin volver a parafrasear. Una paráfrasis puede
 * cambiar el sentido: el informe lo trata como una variante, no como verdad de terreno nueva.
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const key = readFileSync(arg("env"), "utf8").split(/\r?\n/).map((l) => l.match(/^\s*OPENROUTER_API_KEY\s*=\s*(.*)$/)?.[1]).find(Boolean)?.trim().replace(/^["']|["']$/g, "");
if (!key) throw new Error("el .env no tiene OPENROUTER_API_KEY");
const model = arg("model", "qwen/qwen3.7-flash");
const n = Number(arg("n", "2"));
const cap = Number(arg("cap", "0.5"));

const fixtures = readdirSync(arg("fixtures")).filter((f) => f.endsWith(".json")).flatMap((f) => JSON.parse(readFileSync(join(arg("fixtures"), f), "utf8")).fixtures);
const texts = (q) => ({ instructions: q.instructions, ...(q.criteria && !Array.isArray(q.criteria) ? { criteria: Object.fromEntries(Object.entries(q.criteria).map(([k, v]) => [k, v])) } : {}) });

let spent = 0;
async function rewrite(q) {
  const prompt = `Rewrite the following question definition ${n} different ways. Keep EXACTLY the same meaning, the same level of strictness and every concrete detail; change only the wording and sentence structure. Do not add or drop conditions. Keep the JSON keys of "criteria" untouched (rewrite only their string values). Reply with ONLY a JSON array of ${n} objects with the same shape as the input, no markdown.\n\nInput:\n${JSON.stringify(texts(q))}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, temperature: 0.7, messages: [{ role: "user", content: prompt }], usage: { include: true } }),
    });
    if (r.status !== 200) continue;
    const j = await r.json();
    spent += Number(j.usage?.cost ?? 0);
    try {
      const raw = j.choices[0].message.content.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
      const arr = JSON.parse(raw);
      const okShape = Array.isArray(arr) && arr.length === n && arr.every((a) => typeof a.instructions === "string" && (!q.criteria || Array.isArray(q.criteria) || Object.keys(q.criteria).every((k) => typeof a.criteria?.[k] === "string")));
      if (okShape) return arr;
    } catch {}
  }
  return null;
}

const out = {};
const jobs = fixtures.flatMap((fx) => Object.entries(fx.questions).map(([id, q]) => ({ fx: fx.id, id, q })));
let next = 0;
await Promise.all(
  Array.from({ length: 8 }, async () => {
    while (next < jobs.length && spent < cap) {
      const j = jobs[next++];
      const arr = await rewrite(j.q);
      if (arr) (out[j.fx] ??= {})[j.id] = arr;
    }
  }),
);
const done = Object.values(out).reduce((s, o) => s + Object.keys(o).length, 0);
writeFileSync(arg("out"), JSON.stringify({ model, n, questions_total: jobs.length, questions_paraphrased: done, spend_usd: Number(spent.toFixed(6)), paraphrases: out }, null, 2) + "\n");
console.log(`${done}/${jobs.length} preguntas parafraseadas con ${model}, ${spent.toFixed(4)} USD`);
