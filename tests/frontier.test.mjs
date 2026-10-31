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

// — grupo review —
import * as review from "../scripts/lib/frontier-review.mjs";

test("el corpus de review tiene ids únicos, verdad de terreno, reglas esperadas y técnicas con rótulo en ambos idiomas", () => {
  assert.equal(new Set(review.CORPUS.map((c) => c.id)).size, review.CORPUS.length);
  for (const c of review.CORPUS) {
    assert.ok(["defect", "clean"].includes(c.truth) && c.request, c.id);
    // Un defecto sin regla esperada no se puede juzgar; una petición sana no espera ninguna.
    assert.equal(c.truth === "defect", c.expect.length > 0, c.id);
  }
  for (const lang of ["es", "en"]) for (const k of review.TECHNIQUES) assert.ok(STR[lang].techniques[k], `${lang}:${k}`);
});

test("review: un defecto es atrapado si sale alguna regla esperada, y una petición sana solo es limpia sin avisos ni errores", () => {
  const defect = { truth: "defect", expect: ["jev/counting", "jev/arithmetic"] };
  assert.equal(review.outcome(defect, [{ rule: "jev/arithmetic", severity: "warn" }]), "caught");
  assert.equal(review.outcome(defect, [{ rule: "request/single-question", severity: "info" }]), "missed");
  assert.equal(review.outcome(defect, []), "missed");
  assert.equal(review.outcome(defect, null), "unreadable");
  const sound = { truth: "clean", expect: [] };
  assert.equal(review.outcome(sound, [{ rule: "request/single-question", severity: "info" }]), "clean");
  assert.equal(review.outcome(sound, [{ rule: "choice/no-escape-hatch", severity: "warn" }]), "false-alarm");
  assert.equal(review.outcome(sound, [{ rule: "request/no-questions", severity: "error" }]), "false-alarm");
});

test("review: summarize cuenta atrapados, escapados y falsas alarmas por técnica", () => {
  const mk = (technique, truth, outcome) => ({ technique, truth, outcome });
  const s = review.summarize([
    mk("a", "defect", "caught"),
    mk("a", "defect", "missed"),
    mk("b", "clean", "clean"),
    mk("b", "clean", "false-alarm"),
  ]);
  assert.deepEqual([s.caught, s.missed, s.defectTotal, s.cleanPass, s.falseAlarms, s.cleanTotal], [1, 1, 2, 1, 1, 2]);
  assert.deepEqual(s.byTechnique.a, { defects: 2, caught: 1, missed: 1, clean: 0, falseAlarms: 0 });
});

const reviewSample = {
  group: "review",
  date: "2026-10-31",
  corpus: { size: 4 },
  projects: {
    "x/sharp": { version: "1.0.0", summary: { caught: 2, missed: 0, defectTotal: 2, cleanPass: 2, falseAlarms: 0, cleanTotal: 2, byTechnique: { structure: { defects: 2, caught: 2, missed: 0, clean: 2, falseAlarms: 0 } } } },
    "y/blind": { version: "2.0.0", summary: { caught: 0, missed: 2, defectTotal: 2, cleanPass: 1, falseAlarms: 1, cleanTotal: 2, byTechnique: { structure: { defects: 2, caught: 0, missed: 2, clean: 2, falseAlarms: 1 } } } },
  },
};

test("la página de review ordena por defectos escapados y nombra las técnicas donde no atrapa nada", () => {
  for (const lang of ["es", "en"]) {
    const html = buildFrontierPage([reviewSample], lang);
    assert.ok(html.indexOf("x/sharp") < html.indexOf("y/blind"));
    assert.match(html, /script-src 'none'/);
  }
  assert.match(buildFrontierPage([reviewSample], "en"), /Catches no defect at all in: Request structure/);
  assert.match(buildFrontierPage([reviewSample], "es"), /No atrapa ningún defecto de: Estructura de la petición/);
});

test("la página muestra a la vez un grupo de gates y uno de review", () => {
  const html = buildFrontierPage([sample, reviewSample], "en");
  assert.match(html, /Group gates/);
  assert.match(html, /Group review/);
});

// — grupo install-scripts —
import * as installScripts from "../scripts/lib/frontier-install-scripts.mjs";

test("el corpus de install-scripts tiene ids únicos, verdad de terreno y técnicas con rótulo en ambos idiomas", () => {
  assert.equal(new Set(installScripts.CORPUS.map((c) => c.id)).size, installScripts.CORPUS.length);
  for (const c of installScripts.CORPUS) assert.ok(["danger", "safe"].includes(c.truth) && c.cmd, c.id);
  for (const lang of ["es", "en"]) {
    for (const k of installScripts.TECHNIQUES) assert.ok(STR[lang].techniques[k], `${lang}:${k}`);
    assert.ok(STR[lang].frontierUnits["install-scripts"], lang);
  }
});

test("un aviso (warn) de una puerta de instalación cuenta como preguntar", () => {
  assert.equal(normalize("warn"), "ask");
});

test("la página pinta un grupo install-scripts con su propia unidad", () => {
  const run = { ...sample, group: "install-scripts", corpus: { size: 29 } };
  assert.match(buildFrontierPage([run], "en"), /Group install-scripts · 29 npm lifecycle scripts/);
  assert.match(buildFrontierPage([run], "es"), /Grupo install-scripts · 29 scripts de ciclo de vida de npm/);
});

// — grupo prose-lint —
import * as proseLint from "../scripts/lib/frontier-prose-lint.mjs";

test("el corpus de prose-lint tiene ids únicos, verdad de terreno, reglas esperadas y técnicas con rótulo en ambos idiomas", () => {
  assert.equal(new Set(proseLint.CORPUS.map((c) => c.id)).size, proseLint.CORPUS.length);
  for (const c of proseLint.CORPUS) {
    assert.ok(["defect", "clean"].includes(c.truth) && typeof c.md === "string", c.id);
    assert.equal(c.truth === "defect", c.expect.length > 0, c.id);
  }
  for (const lang of ["es", "en"]) for (const k of proseLint.TECHNIQUES) assert.ok(STR[lang].techniques[k], `${lang}:${k}`);
});

test("la página pinta un grupo prose-lint con su unidad y su aviso propios", () => {
  const run = { ...reviewSample, group: "prose-lint", corpus: { size: 67 } };
  assert.match(buildFrontierPage([run], "en"), /Group prose-lint · 67 texts/);
  assert.match(buildFrontierPage([run], "es"), /Grupo prose-lint · 67 textos/);
  assert.match(buildFrontierPage([run], "en"), /countable rules/);
});
