import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readJson } from "../scripts/lib/json.mjs";
import { ASSESSMENTS, CATALOG, TEMPLATE } from "../scripts/lib/paths.mjs";
import { buildReadme, buildSite, coverage } from "../scripts/build.mjs";

const { assessments } = readJson(ASSESSMENTS);
const catalog = readJson(CATALOG);
const readme = buildReadme(assessments, catalog);
const site = buildSite(assessments, catalog, readFileSync(TEMPLATE, "utf8"));

test("coverage counts against the visible catalog, not against the analysed set", () => {
  const c = coverage(assessments, catalog);
  assert.deepEqual(c, { total: 1340, triaged: 13, evaluated: 0, inCatalog: 11, untouched: 1329 });
});

test("the README states the split, including how many analysed projects live outside the catalog", () => {
  assert.match(readme, /13 triadas \(11 de ellas en el catálogo\)/);
  assert.match(readme, /0 evaluadas/);
  assert.match(readme, /1329 sin tocar/);
});

test("every generated verdict carries its evidence label and its repo", () => {
  for (const a of assessments) assert.equal(readme.includes(a.repo), true, `${a.repo} no aparece`);
  assert.match(readme, /estático/);
});

test("the site substitutes every placeholder", () => {
  assert.equal(/\{\{[A-Z_]+\}\}/.test(site), false);
  assert.match(site, /<title>Hub Scout<\/title>/);
});
