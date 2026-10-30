import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readJson } from "../scripts/lib/json.mjs";
import { ASSESSMENTS, CATALOG, FIT, TEMPLATE } from "../scripts/lib/paths.mjs";
import { assertPublishable, buildReadme, buildSite, coverage } from "../scripts/build.mjs";
import { hasRun } from "../scripts/lib/runs.mjs";

const { assessments } = readJson(ASSESSMENTS);
const catalog = readJson(CATALOG);
const fit = readJson(FIT);
const readme = buildReadme(assessments, catalog);
const site = buildSite(assessments, catalog, readFileSync(TEMPLATE, "utf8"));

test("coverage counts against the visible catalog, not against the analysed set", () => {
  const c = coverage(assessments, catalog);
  assert.deepEqual(c, { total: 1340, triaged: 12, evaluated: 1, inCatalog: 11, untouched: 1329 });
});

test("the README states the split, including how many analysed projects live outside the catalog", () => {
  assert.match(readme, /12 triadas · 1 evaluadas \(11 de las 13 analizadas están en el catálogo\)/);
  assert.match(readme, /1329 sin tocar/);
});

test("every generated verdict carries its evidence label and its repo", () => {
  for (const a of assessments) assert.equal(readme.includes(a.repo), true, `${a.repo} no aparece`);
  assert.match(readme, /estático/);
});

test("the site substitutes every placeholder", () => {
  assert.equal(/\{\{[A-Z_]+\}\}/.test(site), false);
  assert.match(site, /<title>Hub Catalog<\/title>/);
});

test("build refuses to publish a verdict the validator rejects", () => {
  const bad = structuredClone(assessments);
  bad[0] = { ...bad[0], evidence: "measured", run: undefined };
  assert.throws(
    () => assertPublishable({ assessments: bad, fit, catalog, hasRun: () => true }),
    /measured/,
    "un medido sin run no puede publicarse",
  );
});

test("build accepts the shipped data", () => {
  assert.doesNotThrow(() => assertPublishable({ assessments, fit, catalog, hasRun }));
});
