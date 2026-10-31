import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDirectory, card, esc, summary, tagsOf } from "../scripts/lib/directory.mjs";
import { extractSnippets, fencedBlocks } from "../scripts/lib/examples.mjs";
import { readJson } from "../scripts/lib/json.mjs";
import { ASSESSMENTS, EXAMPLES } from "../scripts/lib/paths.mjs";

const { assessments } = readJson(ASSESSMENTS);
const examples = readJson(EXAMPLES);
const base = assessments[0];

test("esc neutraliza comillas, para que un dato no rompa un atributo", () => {
  assert.equal(esc(`"><script>'`), "&quot;&gt;&lt;script&gt;&#39;");
});

test("summary se queda con la primera oración y recorta lo largo", () => {
  assert.equal(summary("Hace algo útil. Y luego otra cosa."), "Hace algo útil.");
  assert.ok(summary("x".repeat(500)).length <= 240);
});

test("el directorio trae una ficha por proyecto, cada una con enlace a su repo", () => {
  const html = buildDirectory(assessments, examples, "2026-10-31");
  assert.equal((html.match(/<article /g) || []).length, assessments.length);
  for (const a of assessments) assert.ok(html.includes(`href="https://github.com/${a.repo}"`), a.repo);
});

test("cada botón de etiqueta se cierra y todo grupo filtrable tiene su atributo data", () => {
  const html = buildDirectory(assessments, examples, "2026-10-31");
  assert.equal((html.match(/<button /g) || []).length, (html.match(/<\/button>/g) || []).length);
  for (const a of assessments) {
    const c = card(a, examples.entries[a.repo]);
    for (const [g] of tagsOf(a)) assert.match(c, new RegExp(`data-${g}="`), `${a.repo} ${g}`);
  }
});

test("un README hostil se muestra como texto y no abre marcado", () => {
  const evil = { ...base, repo: "a/b", verdict: "<img src=x onerror=alert(1)>. Fin." };
  const entry = { snippets: [{ kind: "usage", lang: "sh", heading: "</summary><script>", code: "</pre><script>x()</script>", truncated: false }] };
  const c = card(evil, entry);
  assert.ok(!/<script|<img/.test(c));
});

test("un repo con forma rara no genera enlace", () => {
  assert.ok(!card({ ...base, evidence: "static", run: undefined, repo: 'x" onmouseover="y' }, null).includes("github.com"));
});

test("la CSP solo admite el script propio, por hash", () => {
  const html = buildDirectory(assessments, examples, "2026-10-31");
  assert.match(html, /script-src 'sha256-[A-Za-z0-9+/=]+'/);
  assert.match(html, /default-src 'none'/);
});

test("extractSnippets separa instalación, configuración y uso", () => {
  const md = "## Install\n```bash\nnpm install foo\n```\n## Configuration\n```json\n{\"mcpServers\": {}}\n```\n## Usage\n```bash\nfoo run --json\n```\n";
  assert.deepEqual(extractSnippets(md).map((s) => s.kind), ["install", "config", "usage"]);
});

test("se descartan bloques con credenciales o rutas de la máquina del autor", () => {
  const md = "```bash\nexport KEY=sk-abcdefghijklmnopqrstuvwxyz\n```\n```bash\ncd /Users/fulano/proyecto && run\n```\n";
  assert.deepEqual(extractSnippets(md), []);
});

test("curl | sh se muestra, pero con aviso", () => {
  const [s] = extractSnippets("## Install\n```bash\ncurl -fsSL https://x.example/i.sh | sh\n```\n");
  assert.ok(s.warn);
});

test("fencedBlocks respeta cercas de distinta longitud", () => {
  const blocks = fencedBlocks("````md\n```js\nx\n```\n````\n");
  assert.equal(blocks.length, 1);
  assert.match(blocks[0].code, /```js/);
});

test("los ejemplos publicados no llevan rutas de máquina ni credenciales", () => {
  const text = JSON.stringify(examples);
  assert.ok(!/sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}/.test(text));
  assert.ok(!/(?:^|[^A-Za-z])(?:[A-Za-z]:[\/]{1,2}|\/(?:home|Users|workspace)\/)/.test(text.replace(/\\/g, "\\")));
});

test("lo medido enlaza a su prueba y lo leído lo dice sin rodeos", () => {
  const measured = assessments.find((a) => a.evidence === "measured");
  const read = assessments.find((a) => a.evidence === "static");
  assert.ok(card(measured, null).includes(`tree/master/${measured.run}`));
  assert.match(card(read, null), /Sin probar por nosotros/);
});

test("el backlog deja fuera lo medido, lo descartado y lo que no aplica", async () => {
  const { buildBacklog } = await import("../scripts/backlog.mjs");
  const md = buildBacklog(assessments, examples);
  for (const a of assessments.filter((x) => x.evidence === "measured" || x.decision === "no" || x.form === "n_a")) {
    assert.ok(!md.includes(`\`${a.repo}\``), a.repo);
  }
});

test("el inglés y el español comparten claves de filtro y solo cambian los rótulos", async () => {
  const { STR } = await import("../scripts/lib/i18n.mjs");
  assert.deepEqual(Object.keys(STR.es).sort(), Object.keys(STR.en).sort());
  const es = card(assessments[0], null, "es");
  const en = card(assessments[0], null, "en");
  const keys = (h) => [...h.matchAll(/data-v="([^"]*)"/g)].map((m) => m[1]).join();
  assert.equal(keys(es), keys(en));
  assert.notEqual(es, en);
});

test("sin traducción la ficha inglesa cae al español y lo marca con lang", () => {
  const a = assessments[0];
  assert.match(card(a, null, "en", {}), /class="what" lang="es"/);
  assert.match(card(a, null, "en", { [a.repo]: "Does a thing." }), /class="what" lang="en">Does a thing\./);
});

test("el ranking ordena por menos fallos, más cobertura y más casos, y solo con runs", async () => {
  const { rankRuns } = await import("../scripts/lib/ranking.mjs");
  const mk = (repo, pass, fail, m, u) => ({
    assessment: { repo, run: `runs/${repo}`, blockers: [] },
    run: { date: "2026-10-30", cases: [...Array(pass).fill({ pass: true }), ...Array(fail).fill({ pass: false })], measured: Array(m).fill(1), not_measured: Array(u).fill(1) },
  });
  const rows = rankRuns([mk("a/cover-low", 10, 0, 1, 9), mk("b/fails", 10, 1, 9, 1), mk("c/cover-high", 4, 0, 9, 1), mk("d/cover-high-more", 8, 0, 9, 1)]);
  assert.deepEqual(rows.map((r) => r.repo), ["d/cover-high-more", "c/cover-high", "a/cover-low", "b/fails"]);
});

test("las páginas de ranking e idioma se generan en los dos idiomas con selector cruzado", async () => {
  const { buildRankingPage } = await import("../scripts/lib/ranking-page.mjs");
  const es = buildRankingPage([], 5, "es");
  const en = buildRankingPage([], 5, "en");
  assert.match(es, /href="en\/ranking\.html" hreflang="en"/);
  assert.match(en, /href="\.\.\/ranking\.html" hreflang="es"/);
  assert.match(en, /No project has been tested yet/);
  assert.match(es, /script-src 'none'/);
});

test("cada proyecto evaluado tiene resumen en inglés y no sobra ninguna clave", async () => {
  const { I18N_EN } = await import("../scripts/lib/paths.mjs");
  const en = readJson(I18N_EN);
  const repos = new Set(assessments.map((a) => a.repo));
  assert.deepEqual(assessments.map((a) => a.repo).filter((r) => !en[r]), []);
  assert.deepEqual(Object.keys(en).filter((r) => !repos.has(r)), []);
});
