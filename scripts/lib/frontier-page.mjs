import { esc, shell } from "./directory.mjs";
import { t } from "./i18n.mjs";

const RUNS = "https://github.com/jevalan/jev-hub-catalog/tree/master/";

/** Más brechas, peor; a igual, más bloqueos por regla, y a igual, menos fricción. */
const order = (a, b) =>
  a[1].summary.bypasses - b[1].summary.bypasses ||
  b[1].summary.blocked - a[1].summary.blocked ||
  a[1].summary.friction - b[1].summary.friction ||
  a[0].localeCompare(b[0]);

const cell = (c = {}) => {
  const b = c.block ?? 0, a = c.ask ?? 0, w = c.allow ?? 0;
  const cls = w ? "bad" : b === 0 && a ? "meh" : "ok";
  return `<td class="num m-${cls}">${b} / ${a} / ${w}</td>`;
};

/** Técnicas peligrosas de un proyecto con solo "preguntar": ninguna regla propia que las reconozca. */
const onlyAsks = (p) =>
  Object.entries(p.summary.dangerByTechnique ?? {})
    .filter(([, c]) => (c.block ?? 0) === 0 && (c.ask ?? 0) > 0)
    .map(([k]) => k);

/** `runs` son los frontier.json ya leídos; hoy solo existe el del grupo gates. */
export function buildFrontierPage(runs, lang = "es") {
  const s = t(lang);
  if (!runs.length) return shell({ lang, page: "frontier", title: s.frontierTitle, body: `<h2>${esc(s.frontierTitle)}</h2><p>${esc(s.frontierNone)}</p>` });
  const sections = runs.map((run) => {
    const projects = Object.entries(run.projects).sort(order);
    const techniques = Object.keys(projects[0][1].summary.dangerByTechnique ?? {});
    const head = `<tr>${s.frontierCols.map((c) => `<th>${esc(c)}</th>`).join("")}</tr>`;
    const rows = projects
      .map(([repo, p]) => {
        const m = p.summary;
        return `<tr><td><a href="https://github.com/${esc(repo)}" rel="noopener noreferrer nofollow">${esc(repo)}</a> <small>${esc(p.version)}</small></td><td class="num">${m.blocked}/${m.dangerTotal}</td><td class="num">${m.asked}</td><td class="num m-${m.bypasses ? "bad" : "ok"}">${m.bypasses}</td><td class="num">${m.useful}/${m.safeTotal}</td><td class="num">${m.friction}</td><td class="num">${m.falseBlocks}</td></tr>`;
      })
      .join("\n");
    const matrix = `<table><thead><tr><th></th>${projects.map(([repo]) => `<th>${esc(repo.split("/")[1])}</th>`).join("")}</tr></thead><tbody>
${techniques.map((k) => `<tr><td>${esc(s.techniques[k] ?? k)}</td>${projects.map(([, p]) => cell(p.summary.dangerByTechnique[k])).join("")}</tr>`).join("\n")}
</tbody></table>`;
    const serves = projects
      .map(([repo, p]) => {
        const lines = s.frontierVerdict(p.summary).map((l) => `<li>${esc(l)}</li>`).join("");
        const asks = onlyAsks(p);
        const tail = asks.length ? s.frontierOnlyAsks(asks.map((k) => s.techniques[k] ?? k).join(", ")) : s.frontierNoOnlyAsks;
        return `<h4>${esc(repo)}</h4><ul>${lines}<li>${esc(tail)}</li></ul>`;
      })
      .join("\n");
    return `<h3>${esc(s.frontierGroup(run.group, run.corpus.size, projects.length))}</h3>
<table><thead>${head}</thead><tbody>
${rows}
</tbody></table>
<h3>${esc(s.frontierMatrix)}</h3>
${matrix}
<h3>${esc(s.frontierServes)}</h3>
${serves}
<p class="note"><a href="${RUNS}runs/${esc(run.date)}-frontier-${esc(run.group)}/frontier.json" rel="noopener noreferrer">frontier.json</a> · ${esc(run.date)}</p>`;
  });
  const body = `<h2>${esc(s.frontierTitle)}</h2>
<p>${esc(s.frontierIntro)}</p>
<p class="note">${esc(s.frontierWarn)}</p>
${sections.join("\n")}
<h3>${esc(s.frontierReads)}</h3>
<ul>${s.frontierRead.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>`;
  return shell({ lang, page: "frontier", title: s.frontierTitle, body });
}
