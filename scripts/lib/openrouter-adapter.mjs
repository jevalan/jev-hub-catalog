/**
 * Adaptador local entre un envoltorio de Jev y la Decisions API de OpenRouter, con tope de gasto.
 *
 *   OPENROUTER_API_KEY=... node scripts/lib/openrouter-adapter.mjs <fichero de registro> <tope en USD>
 *
 * Escucha solo en 127.0.0.1 e imprime `{"port":N}` en su primera línea. La clave vive únicamente en el
 * entorno de ESTE proceso: el especialista medido recibe una clave inventada y nunca ve la real. Traduce
 * lo mínimo que OpenRouter exige de más que System One: el modelo `typesafe/jev-1.13` y, en cada pregunta
 * noul, un `criteria` con las claves "true" y "false" (docs de jevalan, «Backends»). Suma el coste que
 * OpenRouter declara en cada respuesta y, al alcanzar el tope, deja de reenviar y contesta 429.
 * Cada petición se anota como una línea JSON (sin cabeceras ni clave) en el fichero de registro.
 */
import { appendFileSync } from "node:fs";
import { createServer } from "node:http";

const [log, capArg, passModel] = process.argv.slice(2);
const cap = Number(capArg);
const key = process.env.OPENROUTER_API_KEY;
if (!key || !(cap > 0)) {
  console.error("faltan OPENROUTER_API_KEY o un tope positivo");
  process.exit(2);
}
const URL_UPSTREAM = "https://openrouter.ai/api/alpha/decisions";
const MODEL = "typesafe/jev-1.13";
let spent = 0;

const server = createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", async () => {
    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch {
      return res.writeHead(400).end();
    }
    if (spent >= cap) {
      appendFileSync(log, JSON.stringify({ status: 429, cost: 0, reason: "tope de gasto alcanzado" }) + "\n");
      return res.writeHead(429).end();
    }
    // `passthrough`: el especialista pide su propio modelo (p. ej. jev-layer, typesafe/jev-1.14) y se respeta.
    const sent = { ...parsed, model: passModel === "passthrough" ? parsed.model ?? MODEL : MODEL };
    for (const q of Object.values(sent.questions ?? {})) {
      if (q.type === "noul" && !q.criteria) q.criteria = { true: "The statement holds", false: "The statement does not hold" };
    }
    let upstream;
    let text = "";
    try {
      upstream = await fetch(URL_UPSTREAM, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(sent) });
      text = await upstream.text();
    } catch (e) {
      appendFileSync(log, JSON.stringify({ status: 0, cost: 0, error: String(e.message).slice(0, 120) }) + "\n");
      return res.writeHead(502).end();
    }
    let usage = null;
    try {
      usage = JSON.parse(text).usage ?? null;
    } catch {}
    const cost = Number(usage?.cost ?? 0);
    spent += cost;
    appendFileSync(log, JSON.stringify({ status: upstream.status, cost, input_tokens: usage?.input_tokens ?? null, output_tokens: usage?.output_tokens ?? null, questions: Object.keys(sent.questions ?? {}), body: sent, response: upstream.status === 200 ? JSON.parse(text) : null }) + "\n");
    res.writeHead(upstream.status, { "content-type": "application/json" }).end(text);
  });
});
server.listen(0, "127.0.0.1", () => console.log(JSON.stringify({ port: server.address().port })));
