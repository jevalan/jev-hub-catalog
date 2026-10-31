/**
 * Batería de frontera de los linters de prosa (hoy, snifftest con sus cinco reglas contables): el mismo
 * conjunto de textos para todos los miembros, agrupado por técnica. Puro: no lanza nada.
 *
 * Verdad de terreno: `defect` (el texto contiene un defecto que la regla declara detectar, dicho sin
 * ambigüedad) o `clean` (un texto sano que se parece a un defecto, o un caso que la propia documentación
 * exime). Las expectativas salen de la documentación del linter, no de lo que hoy responde. Se reutilizan
 * `outcome` y `summarize` de frontier-review.mjs: aquí cada «hallazgo» es una marca de regla.
 */

const SLOP = ["delve", "tapestry", "landscape", "unlock", "testament", "navigate", "realm", "myriad", "intricate", "pivotal", "seamless", "showcase"];

const defect = (id, technique, expect, md, rules) => ({ id, technique, truth: "defect", expect: [expect], md, ...(rules ? { rules } : {}) });
const clean = (id, technique, md, rules) => ({ id, technique, truth: "clean", expect: [], md, ...(rules ? { rules } : {}) });

const BANNED = `version: 1
extends: default
rules:
  - id: banned_words
    kind: regex
    builtin: banned_words
    words: [synergy, leverage]
    message: "House ban."
`;

// Cuatro frases de 16 a 17 palabras: una prosa uniforme que supera las 60 palabras.
const UNIFORM = [
  "The team met on Monday morning to review the plan for the new office with the landlord.",
  "The group agreed on Tuesday evening to share the budget with the board and the auditors.",
  "The staff wrote on Wednesday afternoon to confirm the dates with the vendor and the movers.",
  "The crew checked on Thursday morning to finish the notes for the client and the printers.",
];

/** @type {{id:string, technique:string, truth:"defect"|"clean", expect:string[], md:string, rules?:string}[]} */
export const CORPUS = [
  // — raya y guion medio: dónde se detectan
  defect("dash-em-prose", "dash", "dash_present", "The plan changed — and nobody told us.\n"),
  defect("dash-en-prose", "dash", "dash_present", "The plan changed – and nobody told us.\n"),
  defect("dash-in-list-item", "dash", "dash_present", "- The plan changed — and nobody told us.\n- Another item.\n"),
  defect("dash-in-heading", "dash", "dash_present", "# The plan changed — again\n\nBody text here.\n"),
  defect("dash-inline-quote", "dash", "dash_present", "He said “we moved — quickly” and left.\n"),
  defect("dash-crlf", "dash", "dash_present", "Intro line.\r\n\r\nThe plan changed — and nobody told us.\r\n"),
  defect("dash-late-line", "dash", "dash_present", "Line one.\n\nLine two.\n\nLine three.\n\nThe plan changed — late.\n"),
  defect("dash-after-code-fence", "dash", "dash_present", "```\ncode\n```\n\nThe plan changed — after the code.\n"),
  clean("dash-range-numbers", "dash", "See pages 10–20 and years 1999–2004.\n"),
  clean("dash-hyphen-compound", "dash", "A well-known, long-standing, state-of-the-art habit.\n"),
  clean("dash-block-quote", "dash", "> The plan changed — and nobody told us.\n"),
  clean("dash-fenced-code", "dash", "Intro.\n\n```\nthe plan changed — and nobody told us\n```\n"),
  clean("dash-front-matter", "dash", "---\ntitle: A plan — revised\n---\n\nBody text without a dash.\n"),
  clean("dash-table", "dash", "| a | b |\n| - | - |\n| plan — x | y |\n"),

  // — dos puntos: tres en un párrafo
  defect("colon-three", "colons", "colon_heavy", "First: one. Second: two. Third: three.\n"),
  defect("colon-four", "colons", "colon_heavy", "A: one. B: two. C: three. D: four.\n"),
  defect("colon-soft-wrapped", "colons", "colon_heavy", "First: one,\nsecond: two,\nthird: three.\n"),
  defect("colon-in-block-quote", "colons", "colon_heavy", "> First: one. Second: two. Third: three.\n"),
  clean("colon-two", "colons", "First: one. Second: two.\n"),
  clean("colon-urls", "colons", "See http://a.example, http://b.example and http://c.example for details.\n"),
  clean("colon-clock-times", "colons", "We meet at 10:30, break at 12:15 and finish at 16:45.\n"),
  clean("colon-list-items", "colons", "- First: one\n- Second: two\n- Third: three\n- Fourth: four\n"),
  clean("colon-fenced-code", "colons", "Intro.\n\n```\na: 1\nb: 2\nc: 3\n```\n"),
  clean("colon-html-comment", "colons", "Intro.\n\n<!-- a: 1 b: 2 c: 3 d: 4 -->\n\nOutro.\n"),

  // — ritmo: todas las frases igual de largas
  defect("rhythm-uniform", "rhythm", "sentence_rhythm", `${UNIFORM.join(" ")}\n`),
  defect("rhythm-uniform-exclaim", "rhythm", "sentence_rhythm", `${UNIFORM.map((s) => s.replace(/\.$/, "!")).join(" ")}\n`),
  defect("rhythm-uniform-five", "rhythm", "sentence_rhythm", `${[...UNIFORM, "The crew confirmed on Friday morning to close the books for the quarter and the board."].join(" ")}\n`),
  defect("rhythm-uniform-block-quote", "rhythm", "sentence_rhythm", `> ${UNIFORM.join(" ")}\n`),
  clean("rhythm-varied", "rhythm", "We met. After a long and surprisingly tense discussion about the budget, the board agreed to share the numbers with everybody on Tuesday. Nobody objected. The plan, which had been argued over for most of the autumn and rewritten twice by people who disagreed about nearly everything, finally went ahead.\n"),
  clean("rhythm-short-note", "rhythm", "We met on Monday. We spoke on Tuesday. We wrote on Wednesday. We left on Thursday.\n"),
  clean("rhythm-three-sentences", "rhythm", `${UNIFORM.slice(0, 3).join(" ")}\n`),

  // — vocabulario de relleno: cada palabra de la lista, y sus flexiones documentadas
  ...SLOP.map((w) => defect(`slop-${w}`, "slop-words", "slop_vocab", `This part is about the ${w} of our work today.\n`)),
  defect("slop-capitalised", "slop-words", "slop_vocab", "DELVE into the details later.\n"),
  defect("slop-ing", "slop-words", "slop_vocab", "We are delving into the numbers.\n"),
  defect("slop-adverb", "slop-words", "slop_vocab", "It works seamlessly with the rest.\n"),
  defect("slop-ment", "slop-words", "slop_vocab", "A fine showcasement of the product.\n"),
  defect("slop-in-heading", "slop-words", "slop_vocab", "# A pivotal week\n\nBody text here.\n"),
  defect("slop-in-list", "slop-words", "slop_vocab", "- Notes\n- A myriad of options\n"),
  defect("slop-in-block-quote", "slop-words", "slop_vocab", "> We will delve into it.\n"),
  defect("slop-hyphenated", "slop-words", "slop_vocab", "A delve-into-detail session.\n"),
  defect("slop-plural-ies", "slop-words-beyond-suffixes", "slop_vocab", "A rich set of tapestries hung in the hall of ideas.\n"),
  defect("slop-derived-noun", "slop-words-beyond-suffixes", "slop_vocab", "Many intricacies of the contract remain unclear.\n"),
  clean("slop-except-landscape", "slop-words", "She works as a landscape architect.\n"),
  clean("slop-except-navigate-to", "slop-words", "Navigate to the settings page and press save.\n"),
  clean("slop-literal-tapestry", "slop-words", "The museum keeps a medieval tapestry in the east wing.\n"),
  clean("slop-near-word", "slop-words", "A pivot table and a delivery note.\n"),

  // — lista propia de palabras prohibidas
  defect("banned-listed", "banned-words", "banned_words", "We want more synergy across teams.\n", BANNED),
  defect("banned-second", "banned-words", "banned_words", "We should leverage the tool.\n", BANNED),
  defect("banned-inflected", "banned-words", "banned_words", "We are leveraging the tool.\n", BANNED),
  defect("banned-capitalised", "banned-words", "banned_words", "Synergy is the goal.\n", BANNED),
  clean("banned-unlisted", "banned-words", "We want more cooperation across teams.\n", BANNED),
  clean("banned-empty-by-default", "banned-words", "We want more synergy across teams.\n"),

  // — textos limpios corrientes
  clean("plain-note", "plain-prose", "A plain note about the weather today. It rained in the morning and cleared by lunch.\n"),
  clean("plain-with-heading", "plain-prose", "# Weekly notes\n\nWe shipped the release on Thursday. The next step is the review.\n"),
  clean("plain-list", "plain-prose", "- Buy milk\n- Call the plumber\n- Book the train\n"),
  clean("plain-spanish", "plain-prose", "El equipo se reunió el lunes. Después de una larga discusión, la junta aprobó el plan.\n"),
];

export const TECHNIQUES = [...new Set(CORPUS.map((c) => c.technique))];
