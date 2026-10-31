import { createHash } from "node:crypto";

// Dícese de la página-directorio: una ficha por proyecto, con etiquetas
// filtrables, enlace al repo y los ejemplos que el propio autor publica.
// Todo lo ajeno (veredictos aparte) se escapa: un README de tercero es un dato,
// jamás marcado que se interprete.

const KIND_LABEL = { install: "Instalación", config: "Configuración", usage: "Uso" };
const DECISION_LABEL = { yes: "sirve", unclear: "dudoso", no: "no sirve" };
const FORM_LABEL = { flow: "flujo", exec: "exec", http: "http", n_a: "no aplica" };
const REPO = /^[\w.-]+\/[\w.-]+$/;

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

/** Etiquetas de una ficha como pares [grupo, valor]; el grupo es lo que filtra. */
export function tagsOf(a) {
  const tags = [
    ["categoria", a.catalog_category || "fuera del catálogo"],
    ["decision", a.decision],
    ["forma", a.form],
    ...a.callable.map((c) => ["invocable", c]),
    ["evidencia", a.evidence === "measured" ? "medido" : "estático"],
  ];
  if (a.fit && a.fit !== "inferred") tags.push(["grupo", a.fit]);
  if (a.cost.requires_key.length) tags.push(["clave", "pide clave"]);
  return tags;
}

const label = (group, value) =>
  group === "decision" ? DECISION_LABEL[value] || value : group === "forma" ? FORM_LABEL[value] || value : value;

function snippetHtml(s, source) {
  const warn = s.warn ? `<p class="warn">⚠ ${esc(s.warn)}</p>` : "";
  const head = s.heading ? ` <span class="from">· ${esc(s.heading)}</span>` : "";
  return `<div class="snip"><h4>${esc(KIND_LABEL[s.kind] || s.kind)}${head}</h4>${warn}<pre><code>${esc(s.code)}</code></pre>${s.truncated ? `<p class="more"><a href="${esc(source)}" rel="noopener noreferrer nofollow">… sigue en el README</a></p>` : ""}</div>`;
}

export function card(a, entry) {
  // Un repo con forma rara no llega a href: mejor ficha sin enlace que enlace a otro sitio.
  const safe = REPO.test(a.repo);
  const url = `https://github.com/${a.repo}`;
  const tags = tagsOf(a);
  const attrs = [...new Set(tags.map(([k]) => k))]
    .map((g) => `data-${g}="${esc(tags.filter(([k]) => k === g).map(([, v]) => v).join("|"))}"`)
    .join(" ");
  const chips = tags
    .map(([g, v]) => `<button type="button" class="tag t-${g}" data-g="${g}" data-v="${esc(v)}">${esc(label(g, v))}</button>`)
    .join("");
  const snippets = entry?.snippets || [];
  const examples = snippets.length
    ? `<details><summary>Ejemplos y configuración (${snippets.length})</summary><p class="src">Extraídos del README del autor; no se han ejecutado.${safe ? ` <a href="${esc(url)}#readme" rel="noopener noreferrer nofollow">README completo</a>` : ""}</p>${snippets.map((s) => snippetHtml(s, `${url}#readme`)).join("")}</details>`
    : `<p class="src">Su README no trae bloques de ejemplo aprovechables.</p>`;
  const blockers = (a.blockers || []).length
    ? `<ul class="blockers">${a.blockers.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>`
    : "";
  const title = safe
    ? `<a href="${esc(url)}" rel="noopener noreferrer nofollow">${esc(a.repo)}</a>`
    : esc(a.repo);
  const meta = [a.language, a.stars ? `★ ${a.stars}` : ""].filter(Boolean).join(" · ");
  const search = `${a.repo} ${a.name || ""} ${a.capability || ""} ${summary(a.verdict, 400)}`.toLowerCase();
  return `<article class="card d-${esc(a.decision)}" ${attrs} data-q="${esc(search)}" data-stars="${a.stars || 0}">
<h3>${title}</h3>
<p class="meta">${esc(meta)}</p>
<p class="what">${esc(summary(a.verdict))}</p>
<div class="tags">${chips}</div>
<details><summary>Veredicto completo</summary><p>${esc(a.verdict)}</p>${blockers}</details>
${examples}
</article>`;
}

const STYLE = `
:root{color-scheme:light dark;--bg:#fafafa;--fg:#1c1c1e;--mut:#6b6b70;--line:#dcdce0;--card:#fff;--acc:#2a5bd7}
@media(prefers-color-scheme:dark){:root{--bg:#141416;--fg:#e8e8ea;--mut:#9a9aa2;--line:#2c2c31;--card:#1c1c1f;--acc:#7ea2ff}}
*{box-sizing:border-box}body{margin:0;font:15px/1.5 system-ui,sans-serif;background:var(--bg);color:var(--fg)}
header,main{max-width:1100px;margin:0 auto;padding:1rem}
h1{margin:.2rem 0}a{color:var(--acc)}
.bar{position:sticky;top:0;background:var(--bg);padding:.6rem 0;border-bottom:1px solid var(--line);z-index:1}
.bar input{width:100%;padding:.5rem .7rem;font:inherit;border:1px solid var(--line);border-radius:6px;background:var(--card);color:var(--fg)}
.facets{display:flex;flex-wrap:wrap;gap:.4rem 1rem;margin-top:.5rem;font-size:13px}
.facet b{color:var(--mut);margin-right:.3rem}
.tag{font:inherit;font-size:12px;border:1px solid var(--line);background:var(--card);color:var(--fg);border-radius:999px;padding:.05rem .55rem;cursor:pointer;margin:.1rem .15rem .1rem 0}
.tag[aria-pressed=true]{background:var(--acc);border-color:var(--acc);color:var(--bg)}
#count{color:var(--mut);margin:.6rem 0}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(480px,1fr));gap:.8rem}
@media(max-width:560px){.grid{grid-template-columns:1fr}}
.card{background:var(--card);border:1px solid var(--line);border-left:4px solid var(--line);border-radius:8px;padding:.8rem 1rem}
.card.d-yes{border-left-color:#2e9e5b}.card.d-unclear{border-left-color:#d4a017}.card.d-no{border-left-color:#c0392b}
.card h3{margin:0;font-size:16px;word-break:break-all}.meta{margin:.1rem 0;color:var(--mut);font-size:13px}.what{margin:.4rem 0}
details{margin:.4rem 0}summary{cursor:pointer;color:var(--mut);font-size:13px}
pre{overflow:auto;background:var(--bg);border:1px solid var(--line);border-radius:6px;padding:.6rem;font-size:12.5px;margin:.3rem 0}
.snip h4{margin:.5rem 0 0;font-size:13px}.from,.src,.more{color:var(--mut);font-weight:400;font-size:12px}
.warn{color:#c0392b;font-size:12px;margin:.2rem 0}.blockers{font-size:13px;color:var(--mut)}
.hide{display:none}
`;

const SCRIPT = `
const cards=[...document.querySelectorAll('.card')],sel={},q=document.getElementById('q');
const on=(g,v)=>sel[g]&&sel[g].has(v);
function apply(){
  const t=q.value.trim().toLowerCase();let n=0;
  for(const c of cards){
    let ok=!t||c.dataset.q.includes(t);
    for(const g in sel){if(!sel[g].size)continue;const have=(c.dataset[g]||'').split('|');if(!have.some(v=>sel[g].has(v)))ok=false}
    c.classList.toggle('hide',!ok);if(ok)n++;
  }
  document.getElementById('count').textContent=n+' de '+cards.length+' proyectos';
  for(const b of document.querySelectorAll('.tag'))b.setAttribute('aria-pressed',on(b.dataset.g,b.dataset.v)?'true':'false');
}
document.addEventListener('click',e=>{const b=e.target.closest('.tag');if(!b)return;
  const s=(sel[b.dataset.g]??=new Set());s.has(b.dataset.v)?s.delete(b.dataset.v):s.add(b.dataset.v);apply()});
q.addEventListener('input',apply);apply();
`;

/** Facetas con sus recuentos, ordenadas por frecuencia: lo que más hay, primero. */
function facets(assessments) {
  const groups = { categoria: "Categoría", decision: "Decisión", forma: "Forma", invocable: "Invocable" };
  return Object.entries(groups)
    .map(([g, title]) => {
      const counts = new Map();
      for (const a of assessments) for (const [k, v] of tagsOf(a)) if (k === g) counts.set(v, (counts.get(v) || 0) + 1);
      const chips = [...counts].sort((x, y) => y[1] - x[1])
        .map(([v, n]) => `<button type="button" class="tag" data-g="${g}" data-v="${esc(v)}" aria-pressed="false">${esc(label(g, v))} <small>${n}</small></button>`)
        .join("");
      return `<div class="facet"><b>${title}</b>${chips}</div>`;
    })
    .join("");
}

const DECISION_ORDER = { yes: 0, unclear: 1, no: 2 };

export function buildDirectory(assessments, examples, generated) {
  const sorted = [...assessments].sort(
    (a, b) => DECISION_ORDER[a.decision] - DECISION_ORDER[b.decision] || (b.stars || 0) - (a.stars || 0) || a.repo.localeCompare(b.repo),
  );
  const cards = sorted.map((a) => card(a, examples.entries?.[a.repo])).join("\n");
  // La CSP con hash admite solo este script: si algún dato ajeno se colara como
  // marcado, no podría ejecutar nada.
  const hash = createHash("sha256").update(SCRIPT).digest("base64");
  const csp = `default-src 'none'; style-src 'unsafe-inline'; script-src 'sha256-${hash}'; base-uri 'none'; form-action 'none'`;
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="referrer" content="no-referrer">
<title>Directorio de implantaciones · Hub Catalog</title>
<style>${STYLE}</style>
</head>
<body>
<header>
  <h1>Directorio de implantaciones</h1>
  <p>${assessments.length} proyectos del ecosistema Jev evaluados para el hub de jevalan. Cada ficha enlaza a su repo y, desplegable, trae los ejemplos y configuraciones que publica su autor. Generado el ${esc(generated)}. <a href="index.html">Tabla de veredictos</a>.</p>
  <p class="src">Los ejemplos son texto copiado de repos ajenos y no están verificados ni ejecutados aquí: léelos antes de instalar nada.</p>
</header>
<main>
<div class="bar"><input id="q" type="search" placeholder="Buscar por nombre o por lo que hace…" autocomplete="off"><div class="facets">${facets(assessments)}</div></div>
<p id="count"></p>
<div class="grid">
${cards}
</div>
</main>
<script>${SCRIPT}</script>
</body>
</html>
`;
}
