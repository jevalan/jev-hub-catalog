import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { readJson } from "./lib/json.mjs";
import { ASSESSMENTS, CATALOG, DIRECTORY, EXAMPLES, FIT, README, SHELF, SITE, TEMPLATE } from "./lib/paths.mjs";
import { buildDirectory } from "./lib/directory.mjs";
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
${shelfSection(shelf, catalog)}`;
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
  writeFileSync(README, buildReadme(assessments, catalog, shelf));
  mkdirSync(dirname(SITE), { recursive: true });
  writeFileSync(SITE, buildSite(assessments, catalog, readFileSync(TEMPLATE, "utf8")));
  // Los ejemplos son opcionales: sin `npm run examples` el directorio sale igual, solo sin desplegables.
  const examples = existsSync(EXAMPLES) ? readJson(EXAMPLES) : { entries: {} };
  writeFileSync(DIRECTORY, buildDirectory(assessments, examples, new Date().toISOString().slice(0, 10)));
  const c = coverage(assessments, catalog);
  console.log(`build: ${c.triaged} triadas, ${c.evaluated} evaluadas, ${c.untouched} sin tocar, de ${c.total}`);
}
