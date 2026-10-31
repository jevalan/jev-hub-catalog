import { createHash } from "node:crypto";
import { t } from "./i18n.mjs";

// Dícese de la página-directorio: una ficha por proyecto, con etiquetas
// filtrables, enlace al repo y los ejemplos que el propio autor publica.
// Todo lo ajeno se escapa: un README de tercero es un dato, jamás marcado que se
// interprete.

const REPO = /^[\w.-]+\/[\w.-]+$/;
const GH = "https://github.com/jevalan/jev-hub-catalog";
const RUNS = `${GH}/tree/master/`;

export const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** Primera oración del veredicto: lo que hace, sin el atestado de matices. */
export function summary(verdict, max = 240) {
  const first = String(verdict).split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ¿¡`])/)[0];
  return first.length > max ? `${first.slice(0, max - 1).trimEnd()}…` : first;
}

/** Etiquetas como pares [grupo, clave]. Las claves son neutras de idioma: el
 * filtro compara claves y solo el rótulo se traduce. */
export function tagsOf(a) {
  const tags = [
    ["categoria", a.catalog_category || "other"],
    ["decision", a.decision],
    ["forma", a.form],
    ...a.callable.map((c) => ["invocable", c]),
    ["evidencia", a.evidence],
  ];
  if (a.fit && a.fit !== "inferred") tags.push(["grupo", a.fit]);
  if (a.cost.requires_key.length) tags.push(["clave", "key"]);
  return tags;
}

function label(s, group, value) {
  if (group === "decision") return s.decision[value] || value;
  if (group === "forma") return s.form[value] || value;
  if (group === "evidencia") return s.evidence[value] || value;
  if (group === "clave") return s.tagKey;
  if (group === "categoria" && value === "other") return s.tagOther;
  return value;
}

/** Resumen en el idioma pedido; si falta la traducción cae al español y lo marca. */
function whatOf(a, lang, i18n) {
  if (lang === "en" && i18n[a.repo]) return { text: i18n[a.repo], lang: "en" };
  return { text: summary(a.verdict), lang: "es" };
}

/** Lo medido por nosotros y lo leído en un README no se presentan igual. */
function proof(a, s) {
  if (a.evidence === "measured") {
    const link = a.run ? ` <a href="${esc(RUNS + a.run)}" rel="noopener noreferrer">${esc(s.proofSee)}</a>` : "";
    return `<p class="proof ok">${esc(s.proofOk)}${link}</p>`;
  }
  return `<p class="proof">${esc(s.proofNo)}</p>`;
}

function snippetHtml(sn, source, s) {
  const warn = sn.warn ? `<p class="warn">⚠ ${esc(sn.warn)}</p>` : "";
  const head = sn.heading ? ` <span class="from">· ${esc(sn.heading)}</span>` : "";
  const more = sn.truncated
    ? `<p class="more"><a href="${esc(source)}" rel="noopener noreferrer nofollow">${esc(s.readmeMore)}</a></p>`
    : "";
  return `<div class="snip"><h4>${esc(s.kind[sn.kind] || sn.kind)}${head}</h4>${warn}<pre><code>${esc(sn.code)}</code></pre>${more}</div>`;
}

export function card(a, entry, lang = "es", i18n = {}) {
  const s = t(lang);
  // Un repo con forma rara no llega a href: mejor ficha sin enlace que enlace a otro sitio.
  const safe = REPO.test(a.repo);
  const url = `https://github.com/${a.repo}`;
  const tags = tagsOf(a);
  const attrs = [...new Set(tags.map(([k]) => k))]
    .map((g) => `data-${g}="${esc(tags.filter(([k]) => k === g).map(([, v]) => v).join("|"))}"`)
    .join(" ");
  const chips = tags
    .map(([g, v]) => `<button type="button" class="tag t-${g}" data-g="${g}" data-v="${esc(v)}">${esc(label(s, g, v))}</button>`)
    .join("");
  const snippets = entry?.snippets || [];
  const examples = snippets.length
    ? `<details><summary>${esc(s.examples(snippets.length))}</summary><p class="src">${esc(a.evidence === "measured" ? s.srcRun : s.srcRead)}${safe ? ` <a href="${esc(url)}#readme" rel="noopener noreferrer nofollow">${esc(s.readmeFull)}</a>` : ""}</p>${snippets.map((sn) => snippetHtml(sn, `${url}#readme`, s)).join("")}</details>`
    : `<p class="src">${esc(s.noExamples)}</p>`;
  const blockers = (a.blockers || []).length
    ? `<ul class="blockers" lang="es">${a.blockers.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>`
    : "";
  const title = safe ? `<a href="${esc(url)}" rel="noopener noreferrer nofollow">${esc(a.repo)}</a>` : esc(a.repo);
  const meta = [a.language, a.stars ? `★ ${a.stars}` : ""].filter(Boolean).join(" · ");
  const what = whatOf(a, lang, i18n);
  const search = `${a.repo} ${a.name || ""} ${a.capability || ""} ${summary(a.verdict, 400)} ${i18n[a.repo] || ""}`.toLowerCase();
  return `<article class="card d-${esc(a.decision)}" ${attrs} data-q="${esc(search)}" data-stars="${a.stars || 0}">
<h3>${title}</h3>
<p class="meta">${esc(meta)}</p>
${proof(a, s)}
<p class="what" lang="${what.lang}">${esc(what.text)}</p>
<div class="tags">${chips}</div>
<details><summary>${esc(s.fullVerdict)}</summary><p lang="es">${esc(a.verdict)}</p>${blockers}</details>
${examples}
</article>`;
}

export const STYLE = `
:root{color-scheme:light dark;--bg:#fafafa;--fg:#1c1c1e;--mut:#6b6b70;--line:#dcdce0;--card:#fff;--acc:#2a5bd7}
@media(prefers-color-scheme:dark){:root{--bg:#141416;--fg:#e8e8ea;--mut:#9a9aa2;--line:#2c2c31;--card:#1c1c1f;--acc:#7ea2ff}}
*{box-sizing:border-box}body{margin:0;font:15px/1.5 system-ui,sans-serif;background:var(--bg);color:var(--fg)}
.layout{display:grid;grid-template-columns:260px 1fr;min-height:100vh}
aside{border-right:1px solid var(--line);padding:1rem;position:sticky;top:0;height:100vh;overflow:auto;background:var(--card)}
aside h1{font-size:18px;margin:0}aside .tag-line{color:var(--mut);font-size:13px;margin:.2rem 0 1rem}
nav a{display:block;padding:.35rem .6rem;border-radius:6px;color:var(--fg);text-decoration:none}
nav a:hover{background:var(--bg)}nav a[aria-current=page]{background:var(--acc);color:var(--bg)}
.lang{margin:1rem 0;font-size:13px}.lang a{margin-right:.5rem}.lang b{margin-right:.5rem}
.facet{margin:.8rem 0;font-size:13px}.facet b{display:block;color:var(--mut);margin-bottom:.2rem}
main{padding:1rem 1.4rem;max-width:1100px}
h2{margin-top:0}a{color:var(--acc)}
.tag{font:inherit;font-size:12px;border:1px solid var(--line);background:var(--card);color:var(--fg);border-radius:999px;padding:.05rem .55rem;cursor:pointer;margin:.1rem .15rem .1rem 0}
.tag[aria-pressed=true]{background:var(--acc);border-color:var(--acc);color:var(--bg)}
#q{width:100%;padding:.5rem .7rem;font:inherit;border:1px solid var(--line);border-radius:6px;background:var(--card);color:var(--fg)}
#count{color:var(--mut);margin:.6rem 0}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(420px,1fr));gap:.8rem}
.card{background:var(--card);border:1px solid var(--line);border-left:4px solid var(--line);border-radius:8px;padding:.8rem 1rem}
.card.d-yes{border-left-color:#2e9e5b}.card.d-unclear{border-left-color:#d4a017}.card.d-no{border-left-color:#c0392b}
.card h3{margin:0;font-size:16px;word-break:break-all}.meta{margin:.1rem 0;color:var(--mut);font-size:13px}.what{margin:.4rem 0}
details{margin:.4rem 0}summary{cursor:pointer;color:var(--mut);font-size:13px}
pre{overflow:auto;background:var(--bg);border:1px solid var(--line);border-radius:6px;padding:.6rem;font-size:12.5px;margin:.3rem 0}
.snip h4{margin:.5rem 0 0;font-size:13px}.from,.src,.more{color:var(--mut);font-weight:400;font-size:12px}
.warn{color:#c0392b;font-size:12px;margin:.2rem 0}.blockers{font-size:13px;color:var(--mut)}
.proof{margin:.2rem 0;font-size:12px;color:var(--mut)}.proof.ok{color:#2e9e5b}
table{border-collapse:collapse;width:100%;background:var(--card)}th,td{border:1px solid var(--line);padding:.45rem .6rem;text-align:left;font-size:14px}
.num{text-align:right;font-variant-numeric:tabular-nums}.note{color:var(--mut);font-size:13px}
.hide{display:none}
@media(max-width:820px){.layout{grid-template-columns:1fr}aside{position:static;height:auto;border-right:0;border-bottom:1px solid var(--line)}.grid{grid-template-columns:1fr}}
`;

export const FILTER_SCRIPT = `
const cards=[...document.querySelectorAll('.card')],sel={},q=document.getElementById('q');
const on=(g,v)=>sel[g]&&sel[g].has(v);
function apply(){
  const t=q.value.trim().toLowerCase();let n=0;
  for(const c of cards){
    let ok=!t||c.dataset.q.includes(t);
    for(const g in sel){if(!sel[g].size)continue;const have=(c.dataset[g]||'').split('|');if(!have.some(v=>sel[g].has(v)))ok=false}
    c.classList.toggle('hide',!ok);if(ok)n++;
  }
  const el=document.getElementById('count');
  el.textContent=el.dataset.tpl.replace('{n}',n).replace('{total}',cards.length);
  for(const b of document.querySelectorAll('.tag'))b.setAttribute('aria-pressed',on(b.dataset.g,b.dataset.v)?'true':'false');
}
document.addEventListener('click',e=>{const b=e.target.closest('.tag');if(!b)return;
  const s=(sel[b.dataset.g]??=new Set());s.has(b.dataset.v)?s.delete(b.dataset.v):s.add(b.dataset.v);apply()});
q.addEventListener('input',apply);apply();
`;

/** Facetas con sus recuentos, ordenadas por frecuencia. Viven en la barra lateral. */
export function facets(assessments, lang) {
  const s = t(lang);
  const groups = { categoria: s.facetCategoria, decision: s.facetDecision, forma: s.facetForma, invocable: s.facetInvocable };
  return Object.entries(groups)
    .map(([g, title]) => {
      const counts = new Map();
      for (const a of assessments) for (const [k, v] of tagsOf(a)) if (k === g) counts.set(v, (counts.get(v) || 0) + 1);
      const chips = [...counts]
        .sort((x, y) => y[1] - x[1])
        .map(([v, n]) => `<button type="button" class="tag" data-g="${g}" data-v="${esc(v)}" aria-pressed="false">${esc(label(s, g, v))} <small>${n}</small></button>`)
        .join("");
      return `<div class="facet"><b>${esc(title)}</b>${chips}</div>`;
    })
    .join("");
}

const PAGES = { directory: "index.html", ranking: "ranking.html" };
/** Enlace relativo a una página de otro idioma: el español vive en la raíz y el inglés en /en/. */
const href = (from, to, file) => (from === to ? file : from === "es" ? `en/${file}` : `../${file}`);

/** Marco común: barra lateral con navegación, selector de idioma y, si procede, filtros. */
export function shell({ lang, page, title, body, aside = "", script = "" }) {
  const s = t(lang);
  const nav = [
    ["directory", s.navDirectory],
    ["ranking", s.navRanking],
  ]
    .map(([id, text]) => `<a href="${PAGES[id]}"${id === page ? ' aria-current="page"' : ""}>${esc(text)}</a>`)
    .join("");
  const verdicts = lang === "es" ? "veredictos.html" : "../veredictos.html";
  const other = lang === "es" ? "en" : "es";
  const langs = `<div class="lang"><span>${esc(s.langLabel)}:</span> ${["es", "en"]
    .map((l) => (l === lang ? `<b>${l.toUpperCase()}</b>` : `<a href="${href(lang, l, PAGES[page])}" hreflang="${l}">${l.toUpperCase()}</a>`))
    .join("")}</div>`;
  const hash = script ? createHash("sha256").update(script).digest("base64") : "";
  // La CSP con hash admite solo el script propio: si algún dato ajeno se colara
  // como marcado, no podría ejecutar nada.
  const csp = `default-src 'none'; style-src 'unsafe-inline'; ${hash ? `script-src 'sha256-${hash}'` : "script-src 'none'"}; base-uri 'none'; form-action 'none'`;
  return `<!doctype html>
<html lang="${s.htmlLang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="referrer" content="no-referrer">
<link rel="alternate" hreflang="${other}" href="${href(lang, other, PAGES[page])}">
<title>${esc(title)} · ${esc(s.site)}</title>
<style>${STYLE}</style>
</head>
<body>
<div class="layout">
<aside>
  <h1>${esc(s.site)}</h1>
  <p class="tag-line">${esc(s.tagline)}</p>
  <nav>${nav}<a href="${verdicts}">${esc(s.navVerdicts)}</a><a href="${GH}/blob/master/docs/pruebas-pendientes.md" rel="noopener noreferrer">${esc(s.navPending)}</a><a href="${GH}" rel="noopener noreferrer">${esc(s.navRepo)}</a></nav>
  ${langs}
  ${aside}
</aside>
<main>
${body}
</main>
</div>${script ? `\n<script>${script}</script>` : ""}
</body>
</html>
`;
}

const DECISION_ORDER = { yes: 0, unclear: 1, no: 2 };

export function buildDirectory(assessments, examples, generated, { lang = "es", i18n = {} } = {}) {
  const s = t(lang);
  const sorted = [...assessments].sort(
    (a, b) => DECISION_ORDER[a.decision] - DECISION_ORDER[b.decision] || (b.stars || 0) - (a.stars || 0) || a.repo.localeCompare(b.repo),
  );
  const tested = assessments.filter((a) => a.evidence === "measured").length;
  const body = `<h2>${esc(s.dirTitle)}</h2>
<p>${esc(s.dirIntro(assessments.length, tested, generated))}</p>
<p class="note">${esc(s.dirWarn)}</p>
<input id="q" type="search" placeholder="${esc(s.search)}" autocomplete="off">
<p id="count" data-tpl="${esc(s.count("{n}", "{total}"))}"></p>
<div class="grid">
${sorted.map((a) => card(a, examples.entries?.[a.repo], lang, i18n)).join("\n")}
</div>`;
  return shell({ lang, page: "directory", title: s.dirTitle, body, aside: facets(assessments, lang), script: FILTER_SCRIPT });
}
