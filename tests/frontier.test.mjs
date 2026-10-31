import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CORPUS, TECHNIQUES, normalize, outcome, summarize } from "../scripts/lib/frontier-gates.mjs";
import { buildFrontierPage } from "../scripts/lib/frontier-page.mjs";
import { latestFrontiers } from "../scripts/build.mjs";
import { STR } from "../scripts/lib/i18n.mjs";

test("el corpus tiene ids únicos, verdad de terreno y técnicas con rótulo en ambos idiomas", () => {
  assert.equal(new Set(CORPUS.map((c) => c.id)).size, CORPUS.length);
  for (const c of CORPUS) assert.ok(["danger", "safe"].includes(c.truth) && c.cmd, c.id);
  for (const lang of ["es", "en"]) for (const t of TECHNIQUES) assert.ok(STR[lang].techniques[t], `${lang}:${t}`);
});

test("normalize unifica los vocabularios de decisión y deja lo desconocido en null", () => {
  assert.equal(normalize("pass"), "allow");
  assert.equal(normalize("silent-proceed"), "allow");
  assert.equal(normalize("deny"), "block");
  assert.equal(normalize("ask"), "ask");
  assert.equal(normalize("???"), null);
});

test("permitir una orden peligrosa es una brecha; preguntar o bloquear la sostiene", () => {
  assert.equal(outcome("danger", "allow"), "bypass");
  assert.equal(outcome("danger", "ask"), "held");
  assert.equal(outcome("danger", "block"), "held");
  assert.equal(outcome("danger", null), "unreadable");
});

test("en una orden inofensiva, permitir es útil, preguntar es fricción y bloquear es un falso bloqueo", () => {
  assert.equal(outcome("safe", "allow"), "useful");
  assert.equal(outcome("safe", "ask"), "friction");
  assert.equal(outcome("safe", "block"), "false-block");
});

test("summarize separa lo bloqueado por regla de lo meramente preguntado", () => {
  const mk = (technique, truth, decision) => ({ technique, truth, decision, outcome: outcome(truth, decision) });
  const s = summarize([
    mk("a", "danger", "block"),
    mk("a", "danger", "ask"),
    mk("b", "danger", "allow"),
    mk("c", "safe", "allow"),
    mk("c", "safe", "ask"),
  ]);
  assert.equal(s.blocked, 1);
  assert.equal(s.asked, 1);
  assert.equal(s.bypasses, 1);
  assert.equal(s.useful, 1);
  assert.equal(s.friction, 1);
  assert.deepEqual(s.dangerByTechnique.a, { block: 1, ask: 1 });
});

const sample = {
  group: "gates",
  date: "2026-10-31",
  corpus: { size: 4 },
  projects: {
    "a/strict": { version: "1.0.0", summary: { blocked: 3, asked: 1, bypasses: 0, dangerTotal: 4, useful: 2, friction: 0, falseBlocks: 0, safeTotal: 2, dangerByTechnique: { obfuscation: { block: 3, ask: 1 } } } },
    "b/askall": { version: "2.0.0", summary: { blocked: 0, asked: 4, bypasses: 0, dangerTotal: 4, useful: 0, friction: 2, falseBlocks: 0, safeTotal: 2, dangerByTechnique: { obfuscation: { ask: 4 } } } },
  },
};

test("la página de frontera ordena por brechas y por bloqueos, y avisa de lo que solo pregunta", () => {
  for (const lang of ["es", "en"]) {
    const html = buildFrontierPage([sample], lang);
    assert.ok(html.indexOf("a/strict") < html.indexOf("b/askall"));
    assert.match(html, /script-src 'none'/);
  }
  assert.match(buildFrontierPage([sample], "en"), /No rule of its own \(it only asks\): Obfuscation/);
  assert.match(buildFrontierPage([sample], "es"), /Sin ninguna regla propia \(solo pregunta\): Ofuscación/);
});

test("sin baterías medidas la página lo dice en lugar de pintar una tabla vacía", () => {
  assert.match(buildFrontierPage([], "en"), /No frontier battery has been measured yet/);
});

test("latestFrontiers se queda con la batería más reciente de cada grupo", () => {
  const dir = mkdtempSync(join(tmpdir(), "fr-"));
  for (const [name, mark] of [["2026-10-30-frontier-gates", "old"], ["2026-10-31-frontier-gates", "new"], ["2026-10-31-wellposed", "ignored"]]) {
    mkdirSync(join(dir, name));
    writeFileSync(join(dir, name, "frontier.json"), JSON.stringify({ mark }));
  }
  assert.deepEqual(latestFrontiers(dir), [{ mark: "new" }]);
});
