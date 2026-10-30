import { test } from "node:test";
import assert from "node:assert/strict";
import { readJson } from "../scripts/lib/json.mjs";
import { ASSESSMENTS, CATALOG, FIT, SHELF } from "../scripts/lib/paths.mjs";
import { hasRun } from "../scripts/lib/runs.mjs";
import { validateAll, validateShelf } from "../scripts/lib/validate-rules.mjs";
import { buildReadme, shelfSummary } from "../scripts/build.mjs";

const catalog = readJson(CATALOG);
const shelf = readJson(SHELF);
const { assessments } = readJson(ASSESSMENTS);
const fit = readJson(FIT);

const entry = (patch = {}) => ({
  category: "games",
  status: "parked",
  reason: "Son simulaciones; hoy no hay una decisión tipada que el hub sirva.",
  revisit_when: "Si jevalan quiere capacidades de simulación.",
  ...patch,
});
const check = (categories) => validateShelf({ categories }, catalog);

test("the shipped shelf is valid", () => {
  assert.deepEqual(validateShelf(shelf, catalog), []);
});

test("every catalog category is either shelved or left out on purpose, never twice", () => {
  const cats = shelf.categories.map((c) => c.category);
  assert.equal(new Set(cats).size, cats.length);
});

test("games is parked, not discarded", () => {
  const games = shelf.categories.find((c) => c.category === "games");
  assert.equal(games.status, "parked");
  assert.ok(games.revisit_when.trim().length > 0, "aparcar sin condición de vuelta es descartar");
});

test("a category that is not in the catalog is rejected", () => {
  assert.equal(check([entry({ category: "inventada" })]).some((e) => e.includes("inventada")), true);
});

test("an unknown status is rejected", () => {
  assert.equal(check([entry({ status: "closed" })]).some((e) => e.includes("status")), true);
});

test("a parked category needs reason and revisit_when", () => {
  assert.equal(check([entry({ reason: " " })]).some((e) => e.includes("reason")), true);
  assert.equal(check([entry({ revisit_when: "" })]).some((e) => e.includes("revisit_when")), true);
});

test("a candidate needs a reason but not a revisit condition", () => {
  assert.deepEqual(check([entry({ status: "candidate", revisit_when: undefined })]), []);
});

test("the same category twice is rejected", () => {
  assert.equal(check([entry(), entry()]).some((e) => e.includes("duplicad")), true);
});

test("a machine path in the text is rejected", () => {
  assert.equal(check([entry({ reason: "ver E:\\workspace\\algo" })]).some((e) => e.includes("ruta absoluta")), true);
});

test("validateAll covers the shelf too", () => {
  const shelfBad = { categories: [entry({ category: "inventada" })] };
  assert.equal(validateAll({ assessments, fit, catalog, hasRun, shelf: shelfBad }).length > 0, true);
  assert.deepEqual(validateAll({ assessments, fit, catalog, hasRun, shelf }), []);
});

test("shelfSummary counts visible entries per category and skips gone ones", () => {
  const rows = shelfSummary(shelf, catalog);
  const games = rows.find((r) => r.category === "games");
  const visible = catalog.projects.filter((p) => p.category === "games" && !p.gone).length;
  assert.equal(games.count, visible);
});

test("the readme lists the parked categories with their reason", () => {
  const readme = buildReadme(assessments, catalog, shelf);
  assert.match(readme, /## Aparcado/);
  assert.match(readme, /games/);
  assert.match(readme, /Si jevalan quiere capacidades de simulación/);
});
