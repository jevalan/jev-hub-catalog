/**
 * Proveedor simulado de TypeSafe para medir envoltorios (semdecide) sin clave real ni red.
 *
 *   node scripts/lib/stub-provider.mjs <fichero de registro>
 *
 * Escucha solo en 127.0.0.1, imprime `{"port":N}` en su primera línea y anota cada petición como una
 * línea JSON en el fichero de registro. NO es Jev: la probabilidad de cada respuesta la dicta una marca
 * que el propio caso escribe en el texto de entrada, de modo que lo que se mide es la lógica del
 * envoltorio (umbrales, márgenes, códigos de salida, filtrado), nunca la calidad de un modelo.
 *
 * Si la pregunta dice «For state field X» (el lote de `filter`), la marca se busca solo en ese campo del estado.
 * Marcas, todas dentro del texto evaluado:
 *   [p=0.85]        probabilidad de un predicado (noul); sin marca, 0.5
 *   [p.id=0.85]     lo mismo, solo para la pregunta con ese id (gana a [p=…]); sirve para `guard`
 *   [pick=nombre]   opción elegida (choice) o nivel elegido (score, por índice); sin marca, la primera
 *   [force=id]      choice: devuelve ese id aunque NO esté entre las opciones ofrecidas (para probar si el envoltorio lo rechaza)
 *   [conf=0.20]     confianza de choice y score; sin marca, 0.9
 *   [http=500]      responde con ese estado HTTP y sin cuerpo útil
 *   [badjson]       responde 200 con un cuerpo que no es JSON
 *   [badshape]      responde 200 con un JSON sin `answers`
 *   [toosure]       responde 200 con una probabilidad fuera de [0, 1]
 */
import { appendFileSync } from "node:fs";
import { createServer } from "node:http";

const log = process.argv[2];
const mark = (text, name) => text.match(new RegExp(`\\[${name}=([^\\]]+)\\]`))?.[1];

function answer(text, question, id, state) {
  const conf = Number(mark(text, "conf") ?? 0.9);
  if (question.type === "noul") {
    const field = question.instructions?.match(/For state field (\w+)/)?.[1];
    const own = field && state && typeof state === "object" ? JSON.stringify(state[field] ?? "") : text;
    return { type: "noul", noul: Number(mark(own, `p\\.${id}`) ?? mark(own, "p") ?? 0.5) };
  }
  if (question.type === "choice") {
    const names = Object.keys(question.criteria);
    const forced = mark(text, "force");
    const pick = forced ?? (names.includes(mark(text, "pick")) ? mark(text, "pick") : names[0]);
    const rest = names.length > 1 ? 0.2 / (names.length - 1) : 0;
    const probabilities = Object.fromEntries(names.map((n) => [n, n === pick ? (names.length > 1 ? 0.8 : 1) : rest]));
    if (forced && !names.includes(forced)) probabilities[forced] = 1;
    return { type: "choice", choice: pick, probabilities, confidence: conf };
  }
  const count = question.criteria.length;
  const pick = Math.min(count - 1, Number(mark(text, "pick") ?? 0));
  const rest = count > 1 ? 0.2 / (count - 1) : 0;
  const probabilities = Array.from({ length: count }, (_, i) => (i === pick ? (count > 1 ? 0.8 : 1) : rest));
  return { type: "score", score: pick, probabilities, confidence: conf };
}

const server = createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    let parsed = null;
    try {
      parsed = JSON.parse(body);
    } catch {}
    appendFileSync(log, JSON.stringify({ method: req.method, auth: req.headers.authorization ?? null, body: parsed }) + "\n");
    const text = JSON.stringify(parsed?.state ?? "");
    const status = Number(mark(text, "http") ?? 200);
    if (status !== 200) return res.writeHead(status).end();
    if (/\[badjson\]/.test(text)) return res.writeHead(200).end("<html>no es json</html>");
    if (/\[badshape\]/.test(text)) return res.writeHead(200, { "content-type": "application/json" }).end('{"nope":true}');
    const answers = Object.fromEntries(Object.entries(parsed?.questions ?? {}).map(([k, q]) => [k, answer(text, q, k, parsed?.state)]));
    if (/\[toosure\]/.test(text)) for (const a of Object.values(answers)) if ("noul" in a) a.noul = 1.5;
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ answers, model: "stub-no-es-jev", usage: { input_tokens: 10, output_tokens: 1 } }));
  });
});
server.listen(0, "127.0.0.1", () => console.log(JSON.stringify({ port: server.address().port })));
