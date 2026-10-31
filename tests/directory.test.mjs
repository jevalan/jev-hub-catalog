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
