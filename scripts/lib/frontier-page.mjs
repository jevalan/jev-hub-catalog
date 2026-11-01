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

// — routing: peticiones con una única capacidad correcta, o ninguna —

/** Menos inseguras, luego menos forzadas, luego menos desvíos y abstenciones. */
const orderRouting = (a, b) =>
  a[1].summary.unsafe - b[1].summary.unsafe ||
  a[1].summary.forced - b[1].summary.forced ||
  a[1].summary.misroute - b[1].summary.misroute ||
  a[1].summary.abstained - b[1].summary.abstained ||
  a[0].localeCompare(b[0]);

/** Técnicas donde lo correcto es no elegir y no se abstiene ni una vez. */
const neverAbstains = (p) =>
  Object.entries(p.summary.byTechnique)
    .filter(([, c]) => c.correct === 0 && c.forced > 0)
    .map(([k]) => k);

function routingSection(run, s) {
  const r = s.frontierRouting;
  const projects = Object.entries(run.projects).sort(orderRouting);
  const techniques = Object.keys(projects[0][1].summary.byTechnique);
  const head = `<tr>${r.cols.map((c) => `<th>${esc(c)}</th>`).join("")}</tr>`;
  const rows = projects
    .map(([repo, p]) => {
      const m = p.summary;
      return `<tr><td>${link(repo, p)}</td><td class="num">${m.correct}/${m.total}</td><td class="num">${m.misroute}</td><td class="num">${m.abstained}</td><td class="num m-${m.forced ? "meh" : "ok"}">${m.forced}</td><td class="num m-${m.unsafe ? "bad" : "ok"}">${m.unsafe}</td><td class="num">${m.unstable}</td></tr>`;
    })
    .join("\n");
  const cell = (c) => {
    if (!c) return `<td class="num">—</td>`;
    const cls = c.unsafe ? "bad" : c.correct < c.total ? "meh" : "ok";
    return `<td class="num m-${cls}">${esc(r.cell(c))}</td>`;
  };
  const matrix = `<table><thead><tr><th></th>${projects.map(([repo]) => `<th>${esc(repo.split("/")[1])}</th>`).join("")}</tr></thead><tbody>
${techniques.map((k) => `<tr><td>${esc(s.techniques[k] ?? k)}</td>${projects.map(([, p]) => cell(p.summary.byTechnique[k])).join("")}</tr>`).join("\n")}
</tbody></table>`;
  const serves = projects
    .map(([repo, p]) => {
      const lines = r.verdict(p.summary).map((l) => `<li>${esc(l)}</li>`).join("");
      const blind = neverAbstains(p);
      const tail = blind.length ? r.blind(blind.map((k) => s.techniques[k] ?? k).join(", ")) : r.noBlind;
      return `<h4>${esc(repo)}</h4><ul>${lines}<li>${esc(tail)}</li></ul>`;
    })
    .join("\n");
  return `<h3>${esc(r.group(run.group, run.corpus.size, projects.length))}</h3>
<p class="note">${esc(r.warn)}</p>
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

// — context: qué conserva, qué pierde y qué deja salir cada herramienta de poda o compactación —

/** Menos filtradas, luego menos pérdidas, luego menos sin podar. */
const orderContext = (a, b) =>
  a[1].summary.leaked - b[1].summary.leaked ||
  a[1].summary.lost - b[1].summary.lost ||
  a[1].summary.bloated - b[1].summary.bloated ||
  a[0].localeCompare(b[0]);

const techniquesWith = (p, key) => Object.entries(p.summary.byTechnique).filter(([, c]) => c[key] > 0).map(([k]) => k);

function contextSection(run, s) {
  const r = s.frontierContext;
  const projects = Object.entries(run.projects).sort(orderContext);
  // Cada herramienta recibe una forma distinta de caso: las filas son la unión de las técnicas, en el orden en que aparecen.
  const techniques = [...new Set(projects.flatMap(([, p]) => Object.keys(p.summary.byTechnique)))];
  const head = `<tr>${r.cols.map((c) => `<th>${esc(c)}</th>`).join("")}</tr>`;
  const rows = projects
    .map(([repo, p]) => {
      const m = p.summary;
      return `<tr><td>${link(repo, p)}</td><td class="num">${m.correct}/${m.total}</td><td class="num">${m.bloated}</td><td class="num m-${m.lost ? "bad" : "ok"}">${m.lost}</td><td class="num m-${m.leaked ? "bad" : "ok"}">${m.leaked}</td><td class="num">${m.rankable ? `${m.ranked}/${m.rankable}` : "—"}</td><td class="num">${m.unstable}</td></tr>`;
    })
    .join("\n");
  const cell = (c) => {
    if (!c) return `<td class="num">—</td>`;
    const cls = c.lost || c.leaked ? "bad" : c.correct < c.total ? "meh" : "ok";
    return `<td class="num m-${cls}">${esc(r.cell(c))}</td>`;
  };
  const matrix = `<table><thead><tr><th></th>${projects.map(([repo]) => `<th>${esc(repo.split("/")[1])}</th>`).join("")}</tr></thead><tbody>
${techniques.map((k) => `<tr><td>${esc(s.techniques[k] ?? k)}</td>${projects.map(([, p]) => cell(p.summary.byTechnique[k])).join("")}</tr>`).join("\n")}
</tbody></table>`;
  const serves = projects
    .map(([repo, p]) => {
      const lines = r.verdict(p.summary).map((l) => `<li>${esc(l)}</li>`).join("");
      const name = (k) => s.techniques[k] ?? k;
      const lost = techniquesWith(p, "lost");
      const leaked = techniquesWith(p, "leaked");
      const t1 = lost.length ? r.lost(lost.map(name).join(", ")) : r.noLost;
      const t2 = leaked.length ? r.leaked(leaked.map(name).join(", ")) : r.noLeaked;
      return `<h4>${esc(repo)}</h4><ul>${lines}<li>${esc(t1)}</li><li>${esc(t2)}</li></ul>`;
    })
    .join("\n");
  return `<h3>${esc(r.group(run.group, run.corpus.size, projects.length))}</h3>
<p class="note">${esc(r.warn)}</p>
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

// — supervision: qué frena y qué deja pasar un supervisor en sus tres puntos de enganche —

/** Menos filtradas, luego menos inseguras (lo que no se perdona), luego menos fricción. */
const orderSupervision = (a, b) =>
  a[1].summary.leaked - b[1].summary.leaked ||
  a[1].summary.unsafe - b[1].summary.unsafe ||
  a[1].summary.friction - b[1].summary.friction ||
  a[0].localeCompare(b[0]);

function supervisionSection(run, s) {
  const r = s.frontierSupervision;
  const projects = Object.entries(run.projects).sort(orderSupervision);
  const techniques = [...new Set(projects.flatMap(([, p]) => Object.keys(p.summary.byTechnique)))];
  const head = `<tr>${r.cols.map((c) => `<th>${esc(c)}</th>`).join("")}</tr>`;
  const rows = projects
    .map(([repo, p]) => {
      const m = p.summary;
      return `<tr><td>${link(repo, p)}</td><td class="num">${m.correct}/${m.total}</td><td class="num m-${m.unsafe ? "bad" : "ok"}">${m.unsafe}</td><td class="num">${m.friction}</td><td class="num m-${m.leaked ? "bad" : "ok"}">${m.leaked}</td><td class="num">${m.unstable}</td></tr>`;
    })
    .join("\n");
  const cell = (c) => {
    if (!c) return `<td class="num">—</td>`;
    const cls = c.unsafe || c.leaked ? "bad" : c.correct < c.total ? "meh" : "ok";
    return `<td class="num m-${cls}">${esc(r.cell(c))}</td>`;
  };
  const matrix = `<table><thead><tr><th></th>${projects.map(([repo]) => `<th>${esc(repo.split("/")[1])}</th>`).join("")}</tr></thead><tbody>
${techniques.map((k) => `<tr><td>${esc(s.techniques[k] ?? k)}</td>${projects.map(([, p]) => cell(p.summary.byTechnique[k])).join("")}</tr>`).join("\n")}
</tbody></table>`;
  const serves = projects
    .map(([repo, p]) => {
      const lines = r.verdict(p.summary).map((l) => `<li>${esc(l)}</li>`).join("");
      const name = (k) => s.techniques[k] ?? k;
      const unsafe = techniquesWith(p, "unsafe");
      const leaked = techniquesWith(p, "leaked");
      const t1 = unsafe.length ? r.unsafe(unsafe.map(name).join(", ")) : r.noUnsafe;
      const t2 = leaked.length ? r.leaked(leaked.map(name).join(", ")) : r.noLeaked;
      return `<h4>${esc(repo)}</h4><ul>${lines}<li>${esc(t1)}</li><li>${esc(t2)}</li></ul>`;
    })
    .join("\n");
  return `<h3>${esc(r.group(run.group, run.corpus.size, projects.length))}</h3>
<p class="note">${esc(r.warn)}</p>
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

const SECTIONS = { supervision: supervisionSection, context: contextSection, gates: gatesSection, "install-scripts": gatesSection, review: reviewSection, "prose-lint": reviewSection, "code-reach": reviewSection, routing: routingSection };

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
