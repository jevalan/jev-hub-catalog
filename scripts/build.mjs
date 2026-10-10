import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { readJson } from "./lib/json.mjs";
import { ASSESSMENTS, CATALOG, README, SITE, TEMPLATE } from "./lib/paths.mjs";

const EVIDENCE_LABEL = { static: "estático", measured: "medido" };
const costLabel = (cost) =>
  `${cost.runtime}${cost.requires_key.length ? ` + ${cost.requires_key.join("/")}` : ""}`;
const byCohortThenStars = (a, b) => a.cohort.localeCompare(b.cohort) || (b.stars || 0) - (a.stars || 0);
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

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

export function buildReadme(assessments, catalog) {
  const c = coverage(assessments, catalog);
  const rows = [...assessments]
    .sort(byCohortThenStars)
    .map(
      (a) =>
        `| \`${a.repo}\` | ${a.decision} | ${a.form} | ${a.callable.join(", ")} | ${costLabel(a.cost)} | ${EVIDENCE_LABEL[a.evidence]} | ${a.verdict} |`,
    )
    .join("\n");

  return `# jevalon hub scout

Qué proyectos del ecosistema Jev puede servir el hub de jevalon, con qué forma y a qué coste.
Generado desde \`data/assessments.json\`. Snapshot del universo: ${catalog.updated} (${catalog.source}).

## Cobertura

${c.triaged} triadas (${c.inCatalog} de ellas en el catálogo) · ${c.evaluated} evaluadas · ${c.untouched} sin tocar, de ${c.total} entradas visibles del catálogo.

Un veredicto **triado** sale de leer el código; uno **medido** sale de ejecutarlo. No son lo mismo y aquí no se presentan como si lo fueran.

## Cohortes

- **A — referencia fija:** los 13 clones analizados a mano. Es el banco de calibración del detector.
- **B — por fit:** los candidatos de los grupos con decisión (routing, revisión, contexto, gates, supervisión).
- **C — resto:** el catálogo por metadata, sin veredicto profundo.

| Proyecto | Decisión | Forma | Invocable | Coste | Evidencia | Veredicto |
| --- | --- | --- | --- | --- | --- | --- |
${rows}
`;
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
  return template
    .replaceAll("{{COVERAGE}}", `${c.triaged} triadas (${c.inCatalog} en el catálogo) · ${c.evaluated} evaluadas · ${c.untouched} sin tocar`)
    .replace("{{ROWS}}", rows);
}

if (process.argv[1] && process.argv[1].endsWith("build.mjs")) {
  const { assessments } = readJson(ASSESSMENTS);
  const catalog = readJson(CATALOG);
  writeFileSync(README, buildReadme(assessments, catalog));
  mkdirSync(dirname(SITE), { recursive: true });
  writeFileSync(SITE, buildSite(assessments, catalog, readFileSync(TEMPLATE, "utf8")));
  const c = coverage(assessments, catalog);
  console.log(`build: ${c.triaged} triadas, ${c.evaluated} evaluadas, ${c.untouched} sin tocar, de ${c.total}`);
}
