import { esc, shell } from "./directory.mjs";
import { t } from "./i18n.mjs";

const RUNS = "https://github.com/jevalan/jev-hub-catalog/tree/master/";

/** `rows` sale de rankRuns; `pending` es el número de evaluados sin prueba propia. */
export function buildRankingPage(rows, pending, lang = "es") {
  const s = t(lang);
  const pct = (x) => `${Math.round(x * 100)}%`;
  const table = rows.length
    ? `<table><thead><tr>${s.rankCols.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>
${rows
  .map(
    (r, i) =>
      `<tr><td class="num">${i + 1}</td><td><a href="https://github.com/${esc(r.repo)}" rel="noopener noreferrer nofollow">${esc(r.repo)}</a></td><td class="num">${r.passed}/${r.total}</td><td class="num">${pct(r.coverage)} <small>(${r.measured}/${r.measured + r.unmeasured})</small></td><td class="num">${esc(s.problems(r.problems))}</td><td>${esc(r.date)}</td><td><a href="${esc(RUNS + r.runPath)}" rel="noopener noreferrer">run.json</a></td></tr>`,
  )
  .join("\n")}
</tbody></table>`
    : `<p>${esc(s.rankEmpty)}</p>`;
  const body = `<h2>${esc(s.rankTitle)}</h2>
<p>${esc(s.rankIntro)}</p>
${table}
<p class="note">${esc(s.rankPending(pending))}</p>
<h3>${esc(s.rankMethodTitle)}</h3>
<ul>${s.rankMethod.map((m) => `<li>${esc(m)}</li>`).join("")}</ul>`;
  return shell({ lang, page: "ranking", title: s.rankTitle, body });
}
