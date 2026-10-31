/**
 * Casos fijos de la medida directa de snifftest (DanRWilloughby/snifftest), sin claves ni red.
 * Puro: describe qué se ejecuta y cómo se juzga; no lanza nada.
 *
 * snifftest lintea prosa con cinco reglas contables (expresiones regulares locales) y diez de juicio que
 * necesitan un modelo. Aquí solo se ejercen las contables y los contratos de salida, siempre con
 * `--dry-run` o sin clave: ninguna petición puede salir. Cada expectativa sale de lo que su propia
 * documentación (README y rules/default.yaml) dice que debe pasar.
 */

const SENTENCES_UNIFORM = [
  "The team met on Monday morning to review the plan for the new office with the landlord.",
  "The group agreed on Tuesday evening to share the budget with the board and the auditors.",
  "The staff wrote on Wednesday afternoon to confirm the dates with the vendor and the movers.",
  "The crew checked on Thursday morning to finish the notes for the client and the printers.",
].join(" ");

const SENTENCES_VARIED = [
  "We met.",
  "After a long and surprisingly tense discussion about the budget, the board agreed to share the numbers with everybody on Tuesday.",
  "Nobody objected.",
  "The plan, which had been argued over for most of the autumn and rewritten twice by people who disagreed about nearly everything, finally went ahead.",
].join(" ");

export const FIXTURES = {
  "clean.md": "A plain note about the weather today. It rained in the morning and cleared by lunch.\n",
  "em-dash.md": "The plan changed — and nobody told us.\n",
  "en-dash.md": "The plan changed – and nobody told us.\n",
  "en-dash-range.md": "See pages 10–20 for the table.\n",
  "hyphen.md": "A well-known, long-standing habit.\n",
  "quote-dash.md": "> The plan changed — and nobody told us.\n",
  "fenced-dash.md": "Intro line.\n\n```\nthe plan changed — and nobody told us\n```\n",
  "colons-two.md": "First: one. Second: two.\n",
  "colons-three.md": "First: one. Second: two. Third: three.\n",
  "colons-urls.md": "See http://a.example, http://b.example and http://c.example for details.\n",
  "slop-delving.md": "We are delving into the numbers.\n",
  "slop-seamlessly.md": "It works seamlessly with the rest.\n",
  "slop-except.md": "She is a landscape architect. Navigate to the settings page.\n",
  "rhythm-uniform.md": `${SENTENCES_UNIFORM}\n`,
  "rhythm-varied.md": `${SENTENCES_VARIED}\n`,
  "rhythm-short.md": "We met on Monday. We spoke on Tuesday. We wrote on Wednesday. We left on Thursday.\n",
  "utilize.md": "We utilise the tool every day.\n",
  "rules-own.yaml": String.raw`version: 1
extends: default
rules:
  - id: no_utilize
    kind: regex
    pattern: "\\butili[sz]e"
    flags: i
    message: "Use. The word is use."
`,
  "rules-banned.yaml": `version: 1
extends: default
rules:
  - id: banned_words
    kind: regex
    builtin: banned_words
    words: [synergy]
    message: "House ban."
`,
  "banned.md": "We want more synergy across teams.\n",
  "rules-bad.yaml": "version: 1\nrules: [ this is: not valid\n",
};

const flags = (r) => r.json?.flags ?? null;
const ruleIds = (r) => (flags(r) ?? []).map((f) => f.rule);
const expectFlags = (...ids) => (r) => {
  const got = ruleIds(r);
  return got === null || JSON.stringify([...got].sort()) !== JSON.stringify([...ids].sort())
    ? [`reglas ${JSON.stringify(got)}, se esperaba ${JSON.stringify(ids)}`]
    : [];
};
const dry = (file, ...more) => ["check", file, "--dry-run", "--format", "json", ...more];

export const snifftestCases = (version) => [
  {
    id: "version",
    why: "`--version` imprime la versión del paquete instalado.",
    args: ["--version"], exit: 0,
    check: (r) => (r.stdout.trim() === version ? [] : [`versión ${JSON.stringify(r.stdout.trim())}, se esperaba ${version}`]),
  },
  {
    id: "help",
    why: "`--help` muestra el uso y sale con 0.",
    args: ["--help"], exit: 0,
    check: (r) => (/snifftest check <paths/.test(r.stdout) ? [] : ["la ayuda no muestra `check`"]),
  },
  {
    id: "unknown-command",
    why: "Un comando desconocido es un error de uso (exit 2), no un éxito silencioso.",
    args: ["bogus"], exit: 2,
  },
  {
    id: "missing-file",
    why: "Un fichero que no existe es un error (exit 2).",
    args: dry("nope.md"), exit: 2,
  },
  {
    id: "clean-text-passes",
    why: "Un texto sin defectos sale limpio: exit 0 y ninguna marca.",
    args: dry("clean.md"), exit: 0,
    check: expectFlags(),
  },
  {
    id: "em-dash-flagged",
    why: "Un guion largo (raya) se marca con `dash_present` y exit 1.",
    args: dry("em-dash.md"), exit: 1,
    check: expectFlags("dash_present"),
  },
  {
    id: "en-dash-flagged",
    why: "Un guion medio entre palabras también se marca.",
    args: dry("en-dash.md"), exit: 1,
    check: expectFlags("dash_present"),
  },
  {
    id: "en-dash-range-allowed",
    why: "Un guion medio entre números (un rango) no se marca, como documenta la regla.",
    args: dry("en-dash-range.md"), exit: 0,
    check: expectFlags(),
  },
  {
    id: "hyphen-allowed",
    why: "Un guion corto en una palabra compuesta no se marca.",
    args: dry("hyphen.md"), exit: 0,
    check: expectFlags(),
  },
  {
    id: "block-quote-dash-allowed",
    why: "Una cita en bloque es texto ajeno: su raya no se marca.",
    args: dry("quote-dash.md"), exit: 0,
    check: expectFlags(),
  },
  {
    id: "fenced-code-dropped",
    why: "El código vallado se descarta antes de aplicar las reglas: una raya dentro no se marca.",
    args: dry("fenced-dash.md"), exit: 0,
    check: expectFlags(),
  },
  {
    id: "two-colons-allowed",
    why: "Dos dos puntos en un párrafo no llegan al mínimo de tres.",
    args: dry("colons-two.md"), exit: 0,
    check: expectFlags(),
  },
  {
    id: "three-colons-flagged",
    why: "Tres dos puntos en un párrafo se marcan con `colon_heavy`.",
    args: dry("colons-three.md"), exit: 1,
    check: expectFlags("colon_heavy"),
  },
  {
    id: "url-colons-not-counted",
    why: "Los dos puntos de las URL no cuentan.",
    args: dry("colons-urls.md"), exit: 0,
    check: expectFlags(),
  },
  {
    id: "slop-inflection-flagged",
    why: "`delve` y sus flexiones (`delving`) se marcan con `slop_vocab`.",
    args: dry("slop-delving.md"), exit: 1,
    check: expectFlags("slop_vocab"),
  },
  {
    id: "slop-suffix-flagged",
    why: "`seamless` y su adverbio (`seamlessly`) se marcan.",
    args: dry("slop-seamlessly.md"), exit: 1,
    check: expectFlags("slop_vocab"),
  },
  {
    id: "slop-exceptions-allowed",
    why: "Las frases de la lista `except` (`landscape architect`, `navigate to`) no cuentan.",
    args: dry("slop-except.md"), exit: 0,
    check: expectFlags(),
  },
  {
    id: "uniform-rhythm-flagged",
    why: "Cuatro frases de igual longitud en sesenta palabras o más se marcan con `sentence_rhythm`.",
    args: dry("rhythm-uniform.md"), exit: 1,
    check: expectFlags("sentence_rhythm"),
  },
  {
    id: "varied-rhythm-allowed",
    why: "Frases de longitud muy distinta no se marcan.",
    args: dry("rhythm-varied.md"), exit: 0,
    check: expectFlags(),
  },
  {
    id: "short-uniform-note-skipped",
    why: "Cuatro frases iguales pero cortas (menos de sesenta palabras) son una nota, no se marcan.",
    args: dry("rhythm-short.md"), exit: 0,
    check: expectFlags(),
  },
  {
    id: "flag-shape",
    why: "Cada marca lleva fichero, línea, regla, tipo, probabilidad 1 (una regla contable siempre puntúa 1.00) y mensaje.",
    args: dry("em-dash.md"), exit: 1,
    check: (r) => {
      const f = flags(r)?.[0];
      return f && f.file === "em-dash.md" && f.line === 1 && f.kind === "regex" && f.probability === 1 && typeof f.message === "string" ? [] : ["la marca no tiene la forma documentada"];
    },
  },
  {
    id: "own-regex-rule",
    why: "Con `--rules`, una regla propia de patrón (`no_utilize`) marca el texto.",
    args: dry("utilize.md", "--rules", "rules-own.yaml"), exit: 1,
    check: (r) => (ruleIds(r)?.includes("no_utilize") ? [] : ["la regla propia no marcó el texto"]),
  },
  {
    id: "banned-words-list",
    why: "`banned_words` marca las palabras de la lista propia y nada más.",
    args: dry("banned.md", "--rules", "rules-banned.yaml"), exit: 1,
    check: expectFlags("banned_words"),
  },
  {
    id: "banned-words-empty-by-default",
    why: "`banned_words` viene vacía: la misma frase sin lista propia sale limpia.",
    args: dry("banned.md"), exit: 0,
    check: expectFlags(),
  },
  {
    id: "invalid-rules-file",
    why: "Un fichero de reglas ilegible es un error (exit 2), no se ignora en silencio.",
    args: dry("clean.md", "--rules", "rules-bad.yaml"), exit: 2,
  },
  {
    id: "invalid-threshold",
    why: "Un umbral fuera de 0 a 1 es un error de uso (exit 2).",
    args: dry("clean.md", "--threshold", "2"), exit: 2,
  },
  {
    id: "unknown-tag",
    why: "`--only` con una etiqueta que ninguna regla lleva es un error, no una ejecución vacía.",
    args: dry("clean.md", "--only", "nosuchtag"), exit: 2,
  },
  {
    id: "no-key-judgment-is-error",
    why: "Sin `--dry-run` y sin clave, las reglas de juicio no pueden correr: exit 2 y lo dice, sin enviar nada.",
    args: ["check", "clean.md", "--format", "json"], exit: 2,
    check: (r) => (/TYPESAFE_API_KEY is not set/.test(r.stderr) ? [] : ["stderr no dice que falta la clave"]),
    observe: (r) => ({ judgment: r.json?.judgment?.state ?? null, flags_still_printed: Array.isArray(r.json?.flags) }),
  },
  {
    id: "dry-run-says-not-full-verdict",
    why: "Con `--dry-run` el veredicto declara que lo han producido solo las reglas contables.",
    args: dry("clean.md"), exit: 0,
    check: (r) => (/countable rules/.test(r.json?.verdict ?? "") && r.json?.judgment?.state === "not run" ? [] : ["el veredicto no declara que las reglas de juicio no corrieron"]),
  },
  {
    id: "rules-lists-fifteen",
    why: "`rules` imprime el conjunto de reglas: quince en total, cinco contables y diez de juicio.",
    args: ["rules"], exit: 0,
    check: (r) => {
      const regex = (r.stdout.match(/^\s+\S+\s+regex\s/gm) || []).length;
      const judgment = (r.stdout.match(/^\s+\S+\s+judgment\s/gm) || []).length;
      return regex === 5 && judgment === 10 ? [] : [`${regex} contables y ${judgment} de juicio, se esperaban 5 y 10`];
    },
  },
];
