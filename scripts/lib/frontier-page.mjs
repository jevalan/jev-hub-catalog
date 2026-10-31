import { esc, shell } from "./directory.mjs";
import { t } from "./i18n.mjs";

const RUNS = "https://github.com/jevalan/jev-hub-catalog/tree/master/";

const link = (repo, p) => `<a href="https://github.com/${esc(repo)}" rel="noopener noreferrer nofollow">${esc(repo)}</a> <small>${esc(p.version)}</small>`;
const evidence = (run) => `<p class="note"><a href="${RUNS}runs/${esc(run.date)}-frontier-${esc(run.group)}/frontier.json" rel="noopener noreferrer">frontier.json</a> · ${esc(run.date)}</p>`;
const readList = (s, title, items) => `<h3>${esc(title)}</h3>\n<ul>${items.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>`;

// — gates: órdenes de shell peligrosas e inofensivas —

/** Más brechas, peor; a igual, más bloqueos por regla, y a igual, menos fricción. */
const orderGates = (a, b) =>
  a[1].summary.bypasses - b[1].summary.bypasses ||
  b[1].summary.blocked - a[1].summary.blocked ||
  a[1].summary.friction - b[1].summary.friction ||
  a[0].localeCompare(b[0]);

const gateCell = (c = {}) => {
  const b = c.block ?? 0, a = c.ask ?? 0, w = c.allow ?? 0;
  const cls = w ? "bad" : b === 0 && a ? "meh" : "ok";
  return `<td class="num m-${cls}">${b} / ${a} / ${w}</td>`;
};

/** Técnicas peligrosas de un proyecto con solo "preguntar": ninguna regla propia que las reconozca. */
const onlyAsks = (p) =>
  Object.entries(p.summary.dangerByTechnique ?? {})
    .filter(([, c]) => (c.block ?? 0) === 0 && (c.ask ?? 0) > 0)
    .map(([k]) => k);

function gatesSection(run, s) {
  const projects = Object.entries(run.projects).sort(orderGates);
  const techniques = Object.keys(projects[0][1].summary.dangerByTechnique ?? {});
  const head = `<tr>${s.frontierCols.map((c) => `<th>${esc(c)}</th>`).join("")}</tr>`;
  const rows = projects
    .map(([repo, p]) => {
      const m = p.summary;
      return `<tr><td>${link(repo, p)}</td><td class="num">${m.blocked}/${m.dangerTotal}</td><td class="num">${m.asked}</td><td class="num m-${m.bypasses ? "bad" : "ok"}">${m.bypasses}</td><td class="num">${m.useful}/${m.safeTotal}</td><td class="num">${m.friction}</td><td class="num">${m.falseBlocks}</td></tr>`;
    })
    .join("\n");
  const matrix = `<table><thead><tr><th></th>${projects.map(([repo]) => `<th>${esc(repo.split("/")[1])}</th>`).join("")}</tr></thead><tbody>
${techniques.map((k) => `<tr><td>${esc(s.techniques[k] ?? k)}</td>${projects.map(([, p]) => gateCell(p.summary.dangerByTechnique[k])).join("")}</tr>`).join("\n")}
</tbody></table>`;
  const serves = projects
    .map(([repo, p]) => {
      const lines = s.frontierVerdict(p.summary).map((l) => `<li>${esc(l)}</li>`).join("");
      const asks = onlyAsks(p);
      const tail = asks.length ? s.frontierOnlyAsks(asks.map((k) => s.techniques[k] ?? k).join(", ")) : s.frontierNoOnlyAsks;
      return `<h4>${esc(repo)}</h4><ul>${lines}<li>${esc(tail)}</li></ul>`;
    })
    .join("\n");
  return `<h3>${esc(s.frontierGroup(run.group, run.corpus.size, projects.length, s.frontierUnits[run.group]))}</h3>
<p class="note">${esc(s.frontierWarn)}</p>
<table><thead>${head}</thead><tbody>
${rows}
</tbody></table>
<h3>${esc(s.frontierMatrix)}</h3>
${matrix}
<h3>${esc(s.frontierServes)}</h3>
${serves}
${readList(s, s.frontierReads, s.frontierRead)}
${evidence(run)}`;
}

// — review: peticiones con un defecto inyectado y peticiones sanas —

/** Menos defectos escapados, luego menos falsas alarmas. */
const orderReview = (a, b) =>
  a[1].summary.missed - b[1].summary.missed ||
  a[1].summary.falseAlarms - b[1].summary.falseAlarms ||
  a[0].localeCompare(b[0]);

/** Una técnica con defectos de la que no se atrapa ninguno es un punto ciego, no un fallo suelto. */
const blindSpots = (p) =>
  Object.entries(p.summary.byTechnique)
    .filter(([, c]) => c.defects > 0 && c.caught === 0)
    .map(([k]) => k);

function reviewSection(run, s) {
  const r = s.frontierReview;
  const projects = Object.entries(run.projects).sort(orderReview);
  const techniques = Object.keys(projects[0][1].summary.byTechnique);
  const head = `<tr>${r.cols.map((c) => `<th>${esc(c)}</th>`).join("")}</tr>`;
  const rows = projects
    .map(([repo, p]) => {
      const m = p.summary;
      return `<tr><td>${link(repo, p)}</td><td class="num">${m.caught}/${m.defectTotal}</td><td class="num m-${m.missed ? "bad" : "ok"}">${m.missed}</td><td class="num">${m.cleanPass}/${m.cleanTotal}</td><td class="num m-${m.falseAlarms ? "bad" : "ok"}">${m.falseAlarms}</td></tr>`;
    })
    .join("\n");
  const cell = (c) => {
    if (!c) return `<td class="num">—</td>`;
    const cls = c.defects && c.caught === 0 ? "bad" : c.caught < c.defects || c.falseAlarms ? "meh" : "ok";
    return `<td class="num m-${cls}">${esc(r.cell(c))}</td>`;
  };
  const matrix = `<table><thead><tr><th></th>${projects.map(([repo]) => `<th>${esc(repo.split("/")[1])}</th>`).join("")}</tr></thead><tbody>
${techniques.map((k) => `<tr><td>${esc(s.techniques[k] ?? k)}</td>${projects.map(([, p]) => cell(p.summary.byTechnique[k])).join("")}</tr>`).join("\n")}
</tbody></table>`;
  const serves = projects
    .map(([repo, p]) => {
      const lines = r.verdict(p.summary).map((l) => `<li>${esc(l)}</li>`).join("");
      const blind = blindSpots(p);
      const tail = blind.length ? r.blind(blind.map((k) => s.techniques[k] ?? k).join(", ")) : r.noBlind;
      return `<h4>${esc(repo)}</h4><ul>${lines}<li>${esc(tail)}</li></ul>`;
    })
    .join("\n");
  return `<h3>${esc(r.group(run.group, run.corpus.size, projects.length, r.units[run.group]))}</h3>
<p class="note">${esc(r.warns[run.group])}</p>
<table><thead>${head}</thead><tbody>
${rows}
</tbody></table>
<h3>${esc(r.matrix)}</h3>
${matrix}
<h3>${esc(s.frontierServes)}</h3>
${serves}
${readList(s, r.reads, r.read)}
${evidence(run)}`;
}

const SECTIONS = { gates: gatesSection, "install-scripts": gatesSection, review: reviewSection, "prose-lint": reviewSection, "code-reach": reviewSection };

/** `runs` son los frontier.json ya leídos; cada grupo se pinta con su propia sección. */
export function buildFrontierPage(runs, lang = "es") {
  const s = t(lang);
  const known = runs.filter((run) => SECTIONS[run.group]);
  if (!known.length) return shell({ lang, page: "frontier", title: s.frontierTitle, body: `<h2>${esc(s.frontierTitle)}</h2><p>${esc(s.frontierNone)}</p>` });
  const body = `<h2>${esc(s.frontierTitle)}</h2>
<p>${esc(s.frontierIntro)}</p>
${known.map((run) => SECTIONS[run.group](run, s)).join("\n")}`;
  return shell({ lang, page: "frontier", title: s.frontierTitle, body });
}
