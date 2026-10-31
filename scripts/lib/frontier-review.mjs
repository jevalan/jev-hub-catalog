/**
 * Batería de frontera del grupo `review` (linters de peticiones): la misma lista de peticiones, cada una
 * con un único defecto inyectado o ninguno, para ver qué regla lo atrapa, cuál lo deja pasar y cuándo
 * el linter da falsas alarmas. Puro: no lanza nada.
 *
 * Verdad de terreno: `defect` (la petición tiene un defecto que el propio linter declara detectar,
 * dicho sin ambigüedad) o `clean` (una petición sana que se parece a un defecto). Los defectos
 * estructurales están verificados contra la API por el autor; los heurísticos (aritmética, conteo,
 * fechas, doble negación, preguntas agrupadas, grado) son defectos por la propia definición de la
 * regla, y aquí se prueba si la regla aguanta una paráfrasis o el cambio de idioma. Nada discutible.
 */

const base = () => ({
  model: "jev-latest",
  state: {
    ticket: { subject: "Duplicate charge", text: "I was charged twice, please refund", created: "2026-01-02", messages: [{ from: "customer", text: "Refund the duplicate" }] },
    order: { id: "A-104", date: "2026-01-01", total: 98, charges: [{ amount_usd: 49 }, { amount_usd: 49 }] },
  },
  questions: {},
});

// Prosa corriente con vocabulario variado (unos 5-6 caracteres por token), para los casos de tamaño.
const PROSE_UNIT = "The customer wrote in on Monday morning to explain that the parcel never arrived at the office, and the courier could not say where it had been left. ";
const PROSE = (chars) => PROSE_UNIT.repeat(Math.ceil(chars / PROSE_UNIT.length)).slice(0, chars);

const noul = (instructions) => ({ type: "noul", instructions });
const withQuestions = (qs, patch = {}) => ({ ...base(), questions: qs, ...patch });
const one = (instructions) => withQuestions({ q: noul(instructions) });

const noulCase = (id, technique, instructions, expect) => ({ id, technique, truth: "defect", expect, request: one(instructions) });
const cleanCase = (id, instructions) => ({ id, technique: "lookalike-clean", truth: "clean", expect: [], request: one(instructions) });

/** @type {{id:string, technique:string, truth:"defect"|"clean", expect:string[], request:object, config?:object}[]} */
export const CORPUS = [
  // — estructura: lo que la API rechaza o descarta en silencio
  { id: "no-model", technique: "structure", truth: "defect", expect: ["request/missing-model"], request: (() => { const r = one("Is it a refund?"); delete r.model; return r; })() },
  { id: "no-state", technique: "structure", truth: "defect", expect: ["request/missing-state"], request: (() => { const r = one("Is it a refund?"); delete r.state; return r; })() },
  { id: "no-questions", technique: "structure", truth: "defect", expect: ["request/no-questions"], request: withQuestions({}) },
  { id: "empty-key", technique: "structure", truth: "defect", expect: ["question/empty-key"], request: withQuestions({ "": noul("Is it a refund?") }) },
  { id: "invalid-type", technique: "structure", truth: "defect", expect: ["question/invalid-type"], request: withQuestions({ q: { type: "boolean", instructions: "Is it a refund?" } }) },
  { id: "missing-instructions", technique: "structure", truth: "defect", expect: ["question/missing-instructions"], request: withQuestions({ q: { type: "noul" } }) },
  { id: "instructions-number", technique: "structure", truth: "defect", expect: ["instructions/wrong-type"], request: withQuestions({ q: { type: "noul", instructions: 42 } }) },
  { id: "state-number", technique: "structure", truth: "defect", expect: ["state/wrong-type"], request: (() => { const r = one("Is it a refund?"); r.state = 42; return r; })() },
  { id: "choice-no-criteria", technique: "structure", truth: "defect", expect: ["choice/missing-criteria"], request: withQuestions({ q: { type: "choice", instructions: "Which team?" } }) },
  { id: "score-one-level", technique: "structure", truth: "defect", expect: ["score/too-few-levels"], request: withQuestions({ q: { type: "score", instructions: "How bad is it?", criteria: ["Customer cannot work at all"] } }) },
  { id: "score-eleven-levels", technique: "structure", truth: "defect", expect: ["score/too-many-levels"], request: withQuestions({ q: { type: "score", instructions: "How bad is it?", criteria: Array.from({ length: 11 }, (_, i) => `Situation number ${i + 1} is worse than the previous one`) } }) },
  { id: "score-duplicate-levels", technique: "structure", truth: "defect", expect: ["score/duplicate-levels"], request: withQuestions({ q: { type: "score", instructions: "How bad is it?", criteria: ["Customer cannot work at all", "Customer is slowed down", "Customer is slowed down"] } }) },
  { id: "noul-stray-criteria", technique: "structure", truth: "defect", expect: ["noul/unexpected-criteria-keys"], request: withQuestions({ q: { type: "noul", instructions: "Is it a refund?", criteria: { maybe: "something else" } } }) },

  // — límites de tamaño
  // Prosa real, no relleno: 400 000 caracteres son unos 80 000 tokens, por encima de los dos límites (64k en total, 32k de estado más pregunta más larga).
  { id: "state-far-over-limits", technique: "limits", truth: "defect", expect: ["context/over-total", "context/over-state-plus-question"], request: (() => { const r = one("Is it a refund?"); r.state.ticket.text = PROSE(400000); return r; })() },
  // 100 000 caracteres de prosa son unos 20 000 tokens: caben con holgura. Un estimador prudente de más lo marcaría.
  { id: "state-prose-under-limits", technique: "limits", truth: "clean", expect: [], request: (() => { const r = one("Is it a refund?"); r.state.ticket.text = PROSE(100000); return r; })() },
  { id: "choice-300-options", technique: "limits", truth: "defect", expect: ["choice/too-many-options"], request: withQuestions({ q: { type: "choice", instructions: "Which team?", criteria: Object.fromEntries([...Array.from({ length: 300 }, (_, i) => [`team${i}`, null]), ["other", "none of the above"]]) } }) },

  // — rutas: una pregunta que cita un campo que el estado no tiene
  noulCase("path-missing-leaf", "paths", "Is `ticket.assigned_agent.name` a member of the billing team?", ["state/broken-path"]),
  noulCase("path-typo", "paths", "Does `ticket.subjct` mention a refund?", ["state/broken-path"]),
  noulCase("path-array-out-of-range", "paths", "Does `ticket.messages[3].text` ask for a refund?", ["state/broken-path"]),
  noulCase("path-wrong-case", "paths", "Does `Ticket.subject` mention a refund?", ["state/broken-path"]),
  noulCase("path-wrong-root", "paths", "Does `customer.email` look like a company address?", ["state/broken-path"]),
  cleanCase("path-valid-nested", "Does `ticket.subject` mention a refund?"),
  cleanCase("path-valid-array", "Does `ticket.messages[0].text` ask for a refund?"),
  cleanCase("path-valid-deep", "Is `order.charges[1].amount_usd` mentioned in `ticket.text`?"),

  // — campos prohibidos por configuración (`forbidden`), que el estado enviaría a un tercero
  ...[
    ["forbidden-direct", { user: { password: "x" } }],
    ["forbidden-deep", { a: { b: { c: { d: { e: { password: "x" } } } } } }],
    ["forbidden-in-array", { users: [{ name: "a" }, { password: "x" }] }],
    ["forbidden-other-case", { user: { Password: "x" } }],
  ].map(([id, extra]) => ({
    id,
    technique: "forbidden",
    truth: "defect",
    expect: ["state/forbidden-path"],
    config: { forbidden: ["password"] },
    request: (() => { const r = one("Does `ticket.subject` mention a refund?"); Object.assign(r.state, extra); return r; })(),
  })),
  { id: "forbidden-absent", technique: "forbidden", truth: "clean", expect: [], config: { forbidden: ["password"] }, request: one("Does `ticket.subject` mention a refund?") },

  // — heurísticas de "irregularidad" de jev, en inglés llano y con el vocabulario de la propia regla
  noulCase("plain-arithmetic", "heuristic-plain", "Calculate the total of all charges and say whether it exceeds 90 dollars.", ["jev/arithmetic"]),
  noulCase("plain-counting", "heuristic-plain", "How many messages from the customer mention a refund?", ["jev/counting"]),
  noulCase("plain-date", "heuristic-plain", "Is the delivery date later than the due date?", ["jev/date-comparison"]),
  noulCase("plain-double-negative", "heuristic-plain", "Is it correct that the customer is not unable to pay?", ["jev/double-negative"]),
  noulCase("plain-bundled", "heuristic-plain", "Is the customer angry and are they asking for a refund?", ["jev/bundled-judgments"]),
  noulCase("plain-degree", "heuristic-plain", "How urgent is the ticket?", ["noul/degree-question"]),

  // — el mismo defecto, citando rutas del estado con acentos graves (lo que el propio linter recomienda)
  noulCase("path-arithmetic", "heuristic-path-cited", "Calculate the sum of `order.charges` and tell us whether it is over 90 dollars.", ["jev/arithmetic"]),
  noulCase("path-counting", "heuristic-path-cited", "How many messages in `ticket.messages` are from the customer?", ["jev/counting"]),
  noulCase("path-date", "heuristic-path-cited", "Is `order.date` earlier than `ticket.created`?", ["jev/date-comparison"]),
  noulCase("path-double-negative", "heuristic-path-cited", "Is it correct that the sender of `ticket.text` is not unable to pay?", ["jev/double-negative"]),
  noulCase("path-bundled", "heuristic-path-cited", "Does `ticket.text` ask for a refund and does `order.total` exceed 50?", ["jev/bundled-judgments"]),
  noulCase("path-degree", "heuristic-path-cited", "How urgent is `ticket.text`?", ["noul/degree-question"]),

  // — las mismas seis, parafraseadas en inglés sin las palabras que dispara la regla
  noulCase("para-arithmetic-add", "heuristic-paraphrase", "Add up the amounts in `order.charges`; is the total above 90?", ["jev/arithmetic"]),
  noulCase("para-arithmetic-multiply", "heuristic-paraphrase", "Is the price multiplied by the quantity more than 500?", ["jev/arithmetic"]),
  noulCase("para-arithmetic-percent", "heuristic-paraphrase", "What is 15% of `order.total`?", ["jev/arithmetic"]),
  noulCase("para-counting-entries", "heuristic-paraphrase", "Does `ticket.messages` contain more than three entries from the customer?", ["jev/counting"]),
  noulCase("para-counting-times", "heuristic-paraphrase", "Tell me the number of times the customer apologises in `ticket.text`.", ["jev/counting"]),
  noulCase("para-date-before", "heuristic-paraphrase", "Did the customer write in before the order date?", ["jev/date-comparison"]),
  noulCase("para-date-newer", "heuristic-paraphrase", "Is the invoice newer than the contract?", ["jev/date-comparison"]),
  noulCase("para-double-negative", "heuristic-paraphrase", "Is it untrue that the customer has not paid?", ["jev/double-negative"]),
  noulCase("para-bundled-and", "heuristic-paraphrase", "Is the customer angry, and should the ticket be escalated?", ["jev/bundled-judgments"]),
  noulCase("para-bundled-or", "heuristic-paraphrase", "Does the message ask for a refund or a replacement, and is the customer a VIP?", ["jev/bundled-judgments"]),
  noulCase("para-degree-rank", "heuristic-paraphrase", "Rank the severity of `ticket.text`.", ["noul/degree-question"]),

  // — las seis canónicas, traducidas al español
  noulCase("es-arithmetic", "heuristic-spanish", "Suma los importes de `order.charges` e indica si superan los 90 dólares.", ["jev/arithmetic"]),
  noulCase("es-counting", "heuristic-spanish", "¿Cuántos mensajes de `ticket.messages` son del cliente?", ["jev/counting"]),
  noulCase("es-date", "heuristic-spanish", "¿Es `order.date` anterior a `ticket.created`?", ["jev/date-comparison"]),
  noulCase("es-double-negative", "heuristic-spanish", "¿Es falso que el cliente no haya pagado?", ["jev/double-negative"]),
  noulCase("es-bundled", "heuristic-spanish", "¿Está enfadado el cliente y hay que escalar el ticket?", ["jev/bundled-judgments"]),
  noulCase("es-degree", "heuristic-spanish", "¿Cómo de urgente es `ticket.text`?", ["noul/degree-question"]),

  // — parecidos sanos: contienen palabras que disparan reglas sin ser un defecto
  cleanCase("clean-mentions-sum", "Does the customer's message mention a sum of money?"),
  cleanCase("clean-states-how-much", "Does `ticket.text` state how much was charged?"),
  cleanCase("clean-invoice", "Is the customer unhappy with the invoice?"),
  cleanCase("clean-cannot-login", "Does `ticket.text` say the customer cannot log in?"),
  cleanCase("clean-refund", "Does `ticket.messages[0].text` ask for a refund?"),
  cleanCase("clean-es-refund", "¿Pide el cliente un reembolso en `ticket.text`?"),
  { id: "clean-choice-with-other", technique: "lookalike-clean", truth: "clean", expect: [], request: withQuestions({ q: { type: "choice", instructions: "Which team should handle `ticket.subject`?", criteria: { billing: null, technical: null, other: "A case that fits none of the above" } } }) },
  { id: "clean-score-concrete", technique: "lookalike-clean", truth: "clean", expect: [], request: withQuestions({ q: { type: "score", instructions: "How badly is the customer blocked by `ticket.text`?", criteria: ["Customer cannot work at all", "Customer is slowed down but can continue", "Customer has a minor annoyance"] } }) },
];

export const TECHNIQUES = [...new Set(CORPUS.map((c) => c.technique))];

/** Hallazgos que cuentan como alarma en una petición sana: avisos y errores; la información no. */
export const isAlarm = (f) => f.severity === "error" || f.severity === "warn";

/**
 * Resultado de una petición. Con defecto: `caught` si salió alguna de las reglas esperadas, `missed` si no.
 * Sana: `clean` si no hay avisos ni errores, `false-alarm` si los hay. Sin JSON legible no se sabe qué
 * pasó y no se da por bueno.
 */
export function outcome(item, findings) {
  if (!Array.isArray(findings)) return "unreadable";
  if (item.truth === "defect") return findings.some((f) => item.expect.includes(f.rule)) ? "caught" : "missed";
  return findings.some(isAlarm) ? "false-alarm" : "clean";
}

/** Por técnica y en total: cuántos defectos atrapados y cuántas falsas alarmas. */
export function summarize(results) {
  const byTechnique = {};
  for (const r of results) {
    const t = (byTechnique[r.technique] ??= { defects: 0, caught: 0, missed: 0, clean: 0, falseAlarms: 0 });
    if (r.truth === "defect") {
      t.defects += 1;
      if (r.outcome === "caught") t.caught += 1;
      if (r.outcome === "missed") t.missed += 1;
    } else {
      t.clean += 1;
      if (r.outcome === "false-alarm") t.falseAlarms += 1;
    }
  }
  const defects = results.filter((r) => r.truth === "defect");
  const cleans = results.filter((r) => r.truth === "clean");
  return {
    byTechnique,
    defectTotal: defects.length,
    caught: defects.filter((r) => r.outcome === "caught").length,
    missed: defects.filter((r) => r.outcome === "missed").length,
    cleanTotal: cleans.length,
    cleanPass: cleans.filter((r) => r.outcome === "clean").length,
    falseAlarms: cleans.filter((r) => r.outcome === "false-alarm").length,
    unreadable: results.filter((r) => r.outcome === "unreadable").length,
  };
}
