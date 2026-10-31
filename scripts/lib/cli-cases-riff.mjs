/**
 * Casos fijos de la medida directa de riff (scale-venture-partners/riff), sin claves ni red.
 * Puro: describe qué se ejecuta y cómo se juzga; no lanza nada.
 *
 * riff lintea prosa con 69 reglas: 61 semánticas que llaman a Jev y 8 estáticas (RIF001-005, CLR001-003)
 * más las reglas propias de frase o de expresión regular, que corren sin red. Aquí solo se ejercen las
 * estáticas con `--no-jev` y el rechazo sin clave: ninguna petición puede salir. Cada expectativa sale de
 * lo que su README y `--explain` dicen que debe pasar.
 */

const LONG = `This single sentence keeps going and going without any real stop because ${"the writer adds one more clause after another clause ".repeat(6)}until it finally ends.`;

export const FIXTURES = {
  "clean.md": "# A plain note\n\nA plain note about the weather today. It rained in the morning and cleared by lunch.\n",
  "title-case.md": "# Understanding The Impact Of Modern Technology\n\nBody text for the section goes here.\n",
  "sentence-case.md": "# Understanding the impact of modern technology\n\nBody text for the section goes here.\n",
  "curly.md": "She said “hello” to him on the way out.\n",
  "arrow.md": "The plan moves from A → B in two steps.\n",
  "straight.md": "She said \"hello\" to him -> and left.\n",
  "bold-three.md": "# Notes\n\n- **Security**: environment-based configuration.\n- **Performance**: lazy loading of resources.\n- **Reliability**: retries with backoff.\n",
  "bold-one.md": "# Notes\n\n- **Security**: environment-based configuration.\n- Performance is about lazy loading of resources.\n- Reliability comes from retries with backoff.\n",
  "badge.md": "# Notes\n\n- Portfolio overview (+2 companies added)\n- A second plain item\n",
  "steps-out-of-order.md": "## Step 1: setup\n\nInstall it.\n\n## Step 3: deploy\n\nShip it.\n\n## Step 2: test\n\nCheck it.\n",
  "steps-in-order.md": "## Step 1: setup\n\nInstall it.\n\n## Step 2: test\n\nCheck it.\n\n## Step 3: deploy\n\nShip it.\n",
  "long-sentence.md": `${LONG}\n`,
  "duplicate.md": "# Notes\n\nThis paragraph repeats a lot of the same words here.\n\nSomething different sits between them.\n\nThis paragraph repeats a lot of the same words here.\n",
  "phrases.md": "We should leverage the synergy here.\n",
  "founders.md": "The Founders met. The founders left.\n",
  "riff.toml": `[[custom_rules]]
code = "TEAM002"
name = "house-style-bans"
type = "phrase"
summary = "House-style banned phrase"
phrases = ["circle back", "synergy", "leverage"]

[[custom_rules]]
code = "TEAM003"
name = "capital-founders"
type = "phrase"
summary = "Founders is capitalized"
phrases = ["Founders"]
case-sensitive = true
`,
  "bad.toml": "select = [ this is not valid\n",
};

const files = (r) => (Array.isArray(r.json) ? r.json : null);
const codes = (r) => (files(r) ?? []).flatMap((f) => f.findings.map((x) => x.code));
const expectCodes = (...want) => (r) => {
  const got = codes(r);
  return files(r) === null || JSON.stringify([...new Set(got)].sort()) !== JSON.stringify([...want].sort())
    ? [`códigos ${JSON.stringify([...new Set(got)])}, se esperaba ${JSON.stringify(want)}`]
    : [];
};
const lint = (file, ...more) => [file, "--no-jev", "--format", "json", ...more];

export const riffCases = (version) => [
  {
    id: "version",
    why: "`--version` imprime la versión del paquete.",
    args: ["--version"], exit: 0,
    check: (r) => (r.stdout.trim() === `riff ${version}` ? [] : [`versión ${JSON.stringify(r.stdout.trim())}, se esperaba "riff ${version}"`]),
  },
  {
    id: "help",
    why: "`--help` muestra el uso y sale con 0.",
    args: ["--help"], exit: 0,
    check: (r) => (/--no-jev/.test(r.stdout) ? [] : ["la ayuda no menciona `--no-jev`"]),
  },
  {
    id: "list-rules-counts",
    why: "`--list-rules` imprime el catálogo: el README cuenta 69 reglas, 61 semánticas y 8 estáticas.",
    args: ["--list-rules"], exit: 0,
    check: (r) => {
      const all = (r.stdout.match(/^\s+·?(?:CLR|JEV|RIF)\d{3}\s/gm) || []).length;
      const stat = (r.stdout.match(/^\s+·?(?:CLR|RIF)\d{3}\s/gm) || []).length;
      return all === 69 && stat === 8 ? [] : [`${all} reglas y ${stat} estáticas, se esperaban 69 y 8`];
    },
    observe: (r) => ({ rules: (r.stdout.match(/^\s+·?(?:CLR|JEV|RIF)\d{3}\s/gm) || []).length }),
  },
  {
    id: "explain-known-code",
    why: "`--explain` imprime la explicación de una regla.",
    args: ["--explain", "RIF001"], exit: 0,
    check: (r) => (/decorative-unicode/.test(r.stdout) ? [] : ["no explica RIF001"]),
  },
  {
    id: "explain-unknown-code",
    why: "`--explain` de un código que no existe es un error (exit 2).",
    args: ["--explain", "ZZZ999"], exit: 2,
  },
  {
    id: "missing-file",
    why: "Un fichero que no existe es un error (exit 2) y lo dice.",
    args: lint("nope.md"), exit: 2,
    check: (r) => (/no such file/i.test(r.stdout + r.stderr) ? [] : ["no dice que el fichero no existe"]),
  },
  {
    id: "clean-text-passes",
    why: "Un texto sin defectos sale limpio: exit 0 y ninguna marca.",
    args: lint("clean.md"), exit: 0,
    check: expectCodes(),
  },
  {
    id: "title-case-flagged",
    why: "Un título con todas las palabras en mayúscula inicial se marca con RIF002.",
    args: lint("title-case.md"), exit: 1,
    check: expectCodes("RIF002"),
  },
  {
    id: "sentence-case-allowed",
    why: "El mismo título en minúsculas salvo la primera palabra no se marca.",
    args: lint("sentence-case.md"), exit: 0,
    check: expectCodes(),
  },
  {
    id: "curly-quotes-flagged",
    why: "Las comillas tipográficas se marcan con RIF001.",
    args: lint("curly.md"), exit: 1,
    check: expectCodes("RIF001"),
  },
  {
    id: "unicode-arrow-flagged",
    why: "Una flecha unicode (→) se marca con RIF001.",
    args: lint("arrow.md"), exit: 1,
    check: expectCodes("RIF001"),
  },
  {
    id: "straight-quotes-and-ascii-arrow-allowed",
    why: "Las comillas rectas y la flecha ASCII no se marcan.",
    args: lint("straight.md"), exit: 0,
    check: expectCodes(),
  },
  {
    id: "bold-lead-ins-flagged",
    why: "Tres viñetas de tres que abren con negrita se marcan con RIF003.",
    args: lint("bold-three.md"), exit: 1,
    check: expectCodes("RIF003"),
  },
  {
    id: "single-bold-lead-in-allowed",
    why: "Una sola viñeta con negrita (no la mayoría) no se marca.",
    args: lint("bold-one.md"), exit: 0,
    check: expectCodes(),
  },
  {
    id: "revision-badge-flagged",
    why: "Una nota de edición («(+2 companies added)») se marca con RIF004.",
    args: lint("badge.md"), exit: 1,
    check: expectCodes("RIF004"),
  },
  {
    id: "steps-out-of-order-flagged",
    why: "Un paso numerado que llega después de uno posterior (3 y luego 2) se marca con RIF005.",
    args: lint("steps-out-of-order.md"), exit: 1,
    check: expectCodes("RIF005"),
  },
  {
    id: "steps-in-order-allowed",
    why: "Los pasos en orden no se marcan.",
    args: lint("steps-in-order.md"), exit: 0,
    check: expectCodes(),
  },
  {
    id: "long-sentence-flagged",
    why: "Una frase de más de 45 palabras se marca con CLR001.",
    args: lint("long-sentence.md"), exit: 1,
    check: expectCodes("CLR001"),
  },
  {
    id: "sentence-limit-configurable",
    why: "`--max-sentence-words` sube el límite y la misma frase deja de marcarse.",
    args: lint("long-sentence.md", "--max-sentence-words", "200"), exit: 0,
    check: expectCodes(),
  },
  {
    id: "duplicate-paragraph-flagged",
    why: "Un párrafo repetido casi literalmente se marca con CLR003.",
    args: lint("duplicate.md"), exit: 1,
    check: expectCodes("CLR003"),
  },
  {
    id: "custom-phrase-rule",
    why: "Con `--config`, una regla propia de frase corre sin red y marca las frases de su lista.",
    args: lint("phrases.md", "--config", "riff.toml"), exit: 1,
    check: expectCodes("TEAM002"),
  },
  {
    id: "custom-phrase-case-sensitive",
    why: "Una regla de frase con `case-sensitive` marca «Founders» y no «founders».",
    args: lint("founders.md", "--config", "riff.toml"), exit: 1,
    check: (r) => {
      const hits = (files(r) ?? []).flatMap((f) => f.findings).filter((x) => x.code === "TEAM003");
      return hits.length === 1 ? [] : [`${hits.length} marcas de TEAM003, se esperaba 1`];
    },
  },
  {
    id: "select-limits-rules",
    why: "`--select RIF002` corre solo esa regla: un texto con otro defecto sale limpio.",
    args: lint("curly.md", "--select", "RIF002"), exit: 0,
    check: expectCodes(),
  },
  {
    id: "ignore-drops-rule",
    why: "`--ignore RIF002` quita esa regla del informe.",
    args: lint("title-case.md", "--ignore", "RIF002"), exit: 0,
    check: expectCodes(),
  },
  {
    id: "json-shape",
    why: "`--format json` entrega por fichero su ruta y sus marcas con código, línea, columna, severidad y fragmento.",
    args: lint("title-case.md"), exit: 1,
    check: (r) => {
      const f = files(r)?.[0]?.findings?.[0];
      return f && f.code === "RIF002" && f.line === 1 && typeof f.col === "number" && typeof f.severity === "string" && typeof f.snippet === "string" ? [] : ["la marca no tiene la forma documentada"];
    },
  },
  {
    id: "invalid-config",
    why: "Un fichero de configuración ilegible es un error (exit 2), no se ignora en silencio.",
    args: lint("clean.md", "--config", "bad.toml"), exit: 2,
  },
  {
    id: "no-key-semantic-refuses",
    why: "Sin `--no-jev` y sin clave, riff se niega (exit 2) y ofrece `--no-jev`, en lugar de saltarse en silencio las reglas semánticas.",
    args: ["clean.md", "--format", "json"], exit: 2,
    check: (r) => (/TYPESAFE_API_KEY/.test(r.stdout + r.stderr) && /--no-jev/.test(r.stdout + r.stderr) ? [] : ["el mensaje no nombra la clave ni ofrece --no-jev"]),
  },
];
