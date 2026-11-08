import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { readJson } from "./lib/json.mjs";
import { ASSESSMENTS, CATALOG, DIRECTORY, EXAMPLES, FIT, I18N_EN, ROOT, README, README_ES, SHELF, SITE, TEMPLATE } from "./lib/paths.mjs";
import { buildDirectory } from "./lib/directory.mjs";
import { rankRuns } from "./lib/ranking.mjs";
import { buildRankingPage } from "./lib/ranking-page.mjs";
import { buildFrontierPage } from "./lib/frontier-page.mjs";
import { hasRun } from "./lib/runs.mjs";
import { validateAll } from "./lib/validate-rules.mjs";

const EVIDENCE_LABEL = { static: "estático", measured: "medido" };
const costLabel = (cost) =>
  `${cost.runtime}${cost.requires_key.length ? ` + ${cost.requires_key.join("/")}` : ""}`;
const byCohortThenStars = (a, b) => a.cohort.localeCompare(b.cohort) || (b.stars || 0) - (a.stars || 0);
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
// `replace` interpreta `$&` y compañía en la cadena de reemplazo: con un
// veredicto que las contenga, el HTML saldría mutilado.
const insertRows = (html, rows) => html.replace("{{ROWS}}", () => rows);

/** El `frontier.json` más reciente de cada grupo (runs/<fecha>-frontier-<grupo>/). */
export function latestFrontiers(runsDir) {
  if (!existsSync(runsDir)) return [];
  const latest = new Map();
  for (const name of readdirSync(runsDir).sort()) {
    const m = name.match(/^\d{4}-\d{2}-\d{2}-frontier-(.+)$/);
    const file = resolve(runsDir, name, "frontier.json");
    if (m && existsSync(file)) latest.set(m[1], readJson(file));
  }
  return [...latest.values()];
}

export function coverage(assessments, catalog) {
  const shown = catalog.projects.filter((p) => !p.gone);
  // El total son entradas, no repos distintos: 96 entradas no tienen repo y
  // colapsarían en un mismo valor vacío dentro del conjunto.
  const total = shown.length;
  const visible = new Set(shown.map((p) => (p.repo || "").toLowerCase()));
  const triaged = assessments.filter((a) => a.evidence === "static").length;
  const evaluated = assessments.filter((a) => a.evidence === "measured").length;
  // Solo lo que está en el catálogo descuenta del total: médula y wakegate están
  // analizados pero no viven ahí, y contarlos como "tocados" falsearía el reparto.
  const inCatalog = assessments.filter((a) => visible.has(a.repo.toLowerCase())).length;
  return { total, triaged, evaluated, inCatalog, untouched: Math.max(0, total - inCatalog) };
}

/** Publicar exige pasar el validador: así un veredicto medido sin run no puede
 * salir al README ni al sitio por la puerta de atrás. */
export function assertPublishable({ assessments, fit, catalog, hasRun: runExists, shelf }) {
  const errors = validateAll({ assessments, fit, catalog, hasRun: runExists, shelf });
  if (errors.length) throw new Error(`no se publica: ${errors.length} problema(s)\n  - ${errors.join("\n  - ")}`);
}

/** Entradas visibles por categoría aparcada o candidata; las `gone` no cuentan. */
export function shelfSummary(shelf, catalog) {
  return shelf.categories.map((c) => ({
    ...c,
    count: catalog.projects.filter((p) => p.category === c.category && !p.gone).length,
  }));
}

const shelfSection = (shelf, catalog) => {
  const rows = shelfSummary(shelf, catalog);
  if (!rows.length) return "";
  const parked = rows.filter((r) => r.status === "parked");
  const candidates = rows.filter((r) => r.status === "candidate");
  return `
## Aparcado

Aparcar no es descartar: son categorías que hoy no aportan al hub, con el motivo y lo que tendría que cambiar para volver a mirarlas.

| Categoría | Entradas | Por qué no aporta hoy | Cuándo revisarla |
| --- | --- | --- | --- |
${parked.map((r) => `| \`${r.category}\` | ${r.count} | ${r.reason} | ${r.revisit_when} |`).join("\n")}

Candidatas, pendientes de evaluar: ${candidates.map((r) => `\`${r.category}\` (${r.count})`).join(", ")}.
`;
};

export function buildReadme(assessments, catalog, shelf = { categories: [] }) {
  const c = coverage(assessments, catalog);
  const rows = [...assessments]
    .sort(byCohortThenStars)
    .map(
      (a) =>
        `| \`${a.repo}\` | ${a.decision} | ${a.form} | ${a.callable.join(", ")} | ${costLabel(a.cost)} | ${EVIDENCE_LABEL[a.evidence]} | ${a.verdict} |`,
    )
    .join("\n");

  return `# jev hub catalog

Qué proyectos del ecosistema Jev puede servir el hub de jevalan, con qué forma y a qué coste.
Generado desde \`data/assessments.json\`. Snapshot del universo: ${catalog.updated} (${catalog.source}).
[English](README.md)

## Cómo encaja

~~~mermaid
flowchart LR
  C[Cliente / agente] -->|petición de decisión| H[Jevalan: hub + contrato]
  H -->|elige capacidad| A[Adaptador, si hace falta]
  A --> T[Herramienta de terceros]
  T -->|resultado tipado| H
  H -->|respuesta validada| C
  D[jev-hub-catalog] -.->|mapea forma, coste y evidencia| H
~~~

Jevalan conserva el contrato común: descubre capacidades, enruta la petición y valida la respuesta. La herramienta aporta la decisión especializada; un adaptador la conecta cuando su interfaz no encaja directamente. Este catálogo ayuda a elegir qué integrar, cuánto trabajo y qué dependencias implica, y distingue lo leído de lo ejecutado por nosotros. **Estar en el catálogo no significa que una herramienta ya esté integrada ni que su decisión sea fiable:** cada ficha indica su estado y evidencia.

## Cobertura

${c.triaged} triadas · ${c.evaluated} evaluadas (${c.inCatalog} de las ${c.triaged + c.evaluated} analizadas están en el catálogo) · ${c.untouched} sin tocar, de ${c.total} entradas visibles del catálogo.

Un veredicto **triado** sale de leer el código; uno **medido** sale de ejecutarlo. No son lo mismo y aquí no se presentan como si lo fueran.

## Cohortes

- **A — referencia fija:** los 13 clones analizados a mano. Es el banco de calibración del detector.
- **B — por fit:** los candidatos de los grupos con decisión (routing, revisión, contexto, gates, supervisión).
- **C — resto:** el catálogo por metadata, sin veredicto profundo.

| Proyecto | Decisión | Forma | Invocable | Coste | Evidencia | Veredicto |
| --- | --- | --- | --- | --- | --- | --- |
${rows}
${shelfSection(shelf, catalog)}

## Agradecimientos

Gracias especialmente a [jev-awesome](https://github.com/jev/awesome-jev) por mantener el mapa que hace posible descubrir este ecosistema. Gracias también a los proyectos y repositorios incluidos en el catálogo, por compartir su trabajo y hacerlo accesible para su evaluación. Y gracias a toda la comunidad open source: este trabajo se apoya en vuestra generosidad, colaboración y conocimiento compartido.`;
}
function buildReadmeEnglishLegacy(assessments, catalog, shelf = { categories: [] }) {
  return buildReadme(assessments, catalog, shelf)
    .replace("Qué proyectos del ecosistema Jev puede servir el hub de jevalan, con qué forma y a qué coste.", "Which Jev ecosystem projects can jevalan's hub serve, in what form, and at what cost?")
    .replace("Generado desde", "Generated from").replace("Snapshot del universo", "Universe snapshot")
    .replace("## Cómo encaja", "## How it fits")
    .replace("C[Cliente / agente] -->|petición de decisión| H[Jevalan: hub + contrato]", "C[Client / agent] -->|decision request| H[Jevalan: hub + contract]")
    .replace("H -->|elige capacidad| A[Adaptador, si hace falta]", "H -->|selects capability| A[Adapter, if needed]")
    .replace("A --> T[Herramienta de terceros]", "A --> T[Third-party tool]")
    .replace("T -->|resultado tipado| H", "T -->|typed result| H").replace("H -->|respuesta validada| C", "H -->|validated response| C")
    .replace("D[jev-hub-catalog] -.->|mapea forma, coste y evidencia| H", "D[jev-hub-catalog] -.->|maps interface, cost, and evidence| H")
    .replace("Jevalan conserva el contrato común: descubre capacidades, enruta la petición y valida la respuesta. La herramienta aporta la decisión especializada; un adaptador la conecta cuando su interfaz no encaja directamente. Este catálogo ayuda a elegir qué integrar, cuánto trabajo y qué dependencias implica, y distingue lo leído de lo ejecutado por nosotros. **Estar en el catálogo no significa que una herramienta ya esté integrada ni que su decisión sea fiable:** cada ficha indica su estado y evidencia.", "Jevalan keeps the shared contract: it discovers capabilities, routes requests, and validates responses. The tool provides the specialized decision; an adapter connects it when its interface does not fit directly. This catalog helps choose what to integrate, estimate the work and dependencies, and distinguish code we have read from tools we have run. **Being listed does not mean a tool is integrated or its decisions are reliable:** each entry shows its status and evidence. Verdicts remain in Spanish.")
    .replace("## Cobertura", "## Coverage").replace("triadas ·", "screened ·").replace("evaluadas (", "evaluated (").replace(" de las ", " of ").replace(" analizadas están en el catálogo) · ", " analyzed projects are in the catalog) · ").replace(" sin tocar, de ", " untouched, out of ").replace(" entradas visibles del catálogo.", " visible catalog entries.")
    .replace("Un veredicto **triado** sale de leer el código; uno **medido** sale de ejecutarlo. No son lo mismo y aquí no se presentan como si lo fueran.", "A **screened** verdict comes from reading code; a **measured** verdict comes from running it. They are different kinds of evidence.")
    .replace("## Cohortes", "## Cohorts").replace("**A — referencia fija:** los 13 clones analizados a mano. Es el banco de calibración del detector.", "**A — fixed baseline:** 13 manually analyzed clones, used to calibrate the detector.")
    .replace("**B — por fit:** los candidatos de los grupos con decisión (routing, revisión, contexto, gates, supervisión).", "**B — by fit:** candidates in decision groups (routing, review, context, gates, supervision).")
    .replace("**C — resto:** el catálogo por metadata, sin veredicto profundo.", "**C — remaining projects:** catalog metadata only, without a detailed verdict.")
    .replace("| Proyecto | Decisión | Forma | Invocable | Coste | Evidencia | Veredicto |", "| Project | Decision | Form | Callable | Cost | Evidence | Verdict |")
    .replace("| estático |", "| static |").replace("| medido |", "| measured |")
    .replace("[English](README.md)", "[Español](README.es.md)")
    .replace(/## Aparcado[\s\S]*$/, englishShelfSection(shelf, catalog));
}
function englishShelfSection(shelf, catalog) {
  const translations = {
    games: ["Mostly environments where Jev plays: they consume decisions at each step instead of offering one.", "If jevalan adds simulation or rule-based evaluation capabilities. High potential: review this category first."],
    demos: ["Demos and playgrounds illustrate Jev, but rarely expose a stable callable interface.", "If real use cases or reusable capability patterns are needed."],
    articles: ["Articles and threads are not software, and few link to a repository.", "If decision patterns from the literature are needed to design capabilities."],
    lists: ["Other awesome lists help discover projects; they are not capabilities themselves.", "When expanding beyond projects already listed by awesome-jev."],
    official: ["TypeSafe documentation and resources provide context, not callable capabilities.", "If the model contract changes or new primitives appear that the hub should support."],
    sdks: ["SDKs and clients transport requests to Jev; they do not provide decisions.", "If jevalan needs clients in more languages or wants to reuse their error and retry handling."],
  };
  const rows = shelfSummary(shelf, catalog);
  const parked = rows.filter((r) => r.status === "parked");
  const candidates = rows.filter((r) => r.status === "candidate");
  if (!parked.length && !candidates.length) return "";
  return `## Parked\nParking is not rejection: these categories do not currently fit the hub, with reasons and conditions for revisiting.\n| Category | Entries | Why it does not fit today | Revisit when |\n| --- | --- | --- | --- |\n${parked.map((r) => `| \`${r.category}\` | ${r.count} | ${translations[r.category]?.[0] ?? "Does not currently provide a suitable capability for the hub."} | ${translations[r.category]?.[1] ?? "Revisit when its projects expose a stable, useful decision capability."} |`).join("\n")}\nCandidates awaiting review: ${candidates.map((r) => `\`${r.category}\` (${r.count})`).join(", ")}.\n`;
}

export function buildReadmeEnglish(assessments, catalog, shelf = { categories: [] }, i18n = {}) {
  const c = coverage(assessments, catalog);
  const missingEnglish = assessments.filter((a) => !i18n[a.repo]);
  if (missingEnglish.length) throw new Error(`missing English summaries: ${missingEnglish.map((a) => a.repo).join(", ")}`);
  const rows = [...assessments].sort(byCohortThenStars).map((a) =>
    `| \`${a.repo}\` | ${a.decision} | ${a.form} | ${a.callable.join(", ")} | ${costLabel(a.cost)} | ${a.evidence === "static" ? "static" : "measured"} | ${i18n[a.repo]} |`,
  ).join("\n");
  return `# jev hub catalog

Which Jev ecosystem projects can jevalan's hub serve, in what form, and at what cost?
Generated from \`data/assessments.json\`. Universe snapshot: ${catalog.updated} (${catalog.source}).
[Español](README.es.md)

## How it fits

~~~mermaid
flowchart LR
  C[Client / agent] -->|decision request| H[Jevalan: hub + contract]
  H -->|selects capability| A[Adapter, if needed]
  A --> T[Third-party tool]
  T -->|typed result| H
  H -->|validated response| C
  D[jev-hub-catalog] -.->|maps interface, cost, and evidence| H
~~~

Jevalan keeps the shared contract: it discovers capabilities, routes requests, and validates responses. The tool provides the specialized decision; an adapter connects it when needed. This catalog helps assess integration effort, dependencies, and evidence. **Being listed does not mean a tool is integrated or its decisions are reliable.**

## Coverage

${c.triaged} screened · ${c.evaluated} evaluated (${c.inCatalog} of ${c.triaged + c.evaluated} analyzed projects are in the catalog) · ${c.untouched} untouched, out of ${c.total} visible catalog entries.

A **screened** verdict comes from reading code; a **measured** verdict comes from running it. They are different kinds of evidence.

## Cohorts

- **A — fixed baseline:** 13 manually analyzed clones, used to calibrate the detector.
- **B — by fit:** candidates in decision groups (routing, review, context, gates, supervision).
- **C — remaining projects:** catalog metadata only, without a detailed verdict.

| Project | Decision | Form | Callable | Cost | Evidence | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
${rows}
${englishShelfSection(shelf, catalog)}

## Acknowledgements

Special thanks to [jev-awesome](https://github.com/jev/awesome-jev) for maintaining the map that makes this ecosystem discoverable. Thanks to the projects and repositories in this catalog for sharing their work and making it available for evaluation. And thanks to the entire open source community: this work builds on your generosity, collaboration, and shared knowledge.`;
}

export function buildSite(assessments, catalog, template) {
  const c = coverage(assessments, catalog);
  const rows = [...assessments]
    .sort(byCohortThenStars)
    .map(
      (a) =>
        `<tr><td><code>${esc(a.repo)}</code></td><td>${esc(a.decision)}</td><td>${esc(a.form)}</td><td>${esc(a.callable.join(", "))}</td><td>${esc(costLabel(a.cost))}</td><td>${esc(EVIDENCE_LABEL[a.evidence])}</td><td>${esc(a.verdict)}</td></tr>`,
    )
    .join("\n");
  return insertRows(
    template.replaceAll(
      "{{COVERAGE}}",
      `${c.triaged} triadas · ${c.evaluated} evaluadas (${c.inCatalog} de ${c.triaged + c.evaluated} en el catálogo) · ${c.untouched} sin tocar`,
    ),
    rows,
  );
}

if (process.argv[1] && process.argv[1].endsWith("build.mjs")) {
  const { assessments } = readJson(ASSESSMENTS);
  const fit = readJson(FIT);
  const catalog = readJson(CATALOG);
  const shelf = readJson(SHELF);
  assertPublishable({ assessments, fit, catalog, hasRun, shelf });
  const i18n = existsSync(I18N_EN) ? readJson(I18N_EN) : {};
  writeFileSync(README, buildReadmeEnglish(assessments, catalog, shelf, i18n));
  writeFileSync(README_ES, buildReadme(assessments, catalog, shelf));
  mkdirSync(dirname(SITE), { recursive: true });
  writeFileSync(SITE, buildSite(assessments, catalog, readFileSync(TEMPLATE, "utf8")));
  // Los ejemplos son opcionales: sin `npm run examples` el directorio sale igual, solo sin desplegables.
  const examples = existsSync(EXAMPLES) ? readJson(EXAMPLES) : { entries: {} };
  const generated = new Date().toISOString().slice(0, 10);
  // Solo puntúa lo que tiene prueba nuestra: el ranking lee los run.json, no los veredictos.
  const measured = assessments.filter((a) => a.evidence === "measured");
  const ranked = rankRuns(measured.map((a) => ({ assessment: a, run: readJson(resolve(ROOT, a.run, "run.json")) })));
  const pending = assessments.length - measured.length;
  // Las baterías de frontera: la más reciente de cada grupo.
  const frontiers = latestFrontiers(resolve(ROOT, "runs"));
  const outDir = dirname(DIRECTORY);
  mkdirSync(resolve(outDir, "en"), { recursive: true });
  for (const lang of ["es", "en"]) {
    const dir = lang === "es" ? outDir : resolve(outDir, "en");
    writeFileSync(resolve(dir, "index.html"), buildDirectory(assessments, examples, generated, { lang, i18n }));
    writeFileSync(resolve(dir, "ranking.html"), buildRankingPage(ranked, pending, lang));
    writeFileSync(resolve(dir, "frontier.html"), buildFrontierPage(frontiers, lang));
  }
  const c = coverage(assessments, catalog);
  console.log(`build: ${c.triaged} triadas, ${c.evaluated} evaluadas, ${c.untouched} sin tocar, de ${c.total}`);
}
