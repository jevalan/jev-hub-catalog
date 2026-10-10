import { test } from "node:test";
import assert from "node:assert/strict";
import { readJson } from "../scripts/lib/json.mjs";
import { ASSESSMENTS, CATALOG, FIT } from "../scripts/lib/paths.mjs";
import { validateAll, validateAssessments } from "../scripts/lib/validate-rules.mjs";

const doc = readJson(ASSESSMENTS);
const catalog = readJson(CATALOG);
const fit = readJson(FIT);
const noRuns = () => false;

const withEntry = (patch) => {
  const entries = structuredClone(doc.assessments);
  Object.assign(entries[0], patch);
  return validateAssessments(entries, catalog, noRuns, fit);
};

test("the shipped cohort A is valid", () => {
  assert.deepEqual(validateAssessments(doc.assessments, catalog, noRuns, fit), []);
});

test("validateAll covers fit and assessments together", () => {
  assert.deepEqual(validateAll({ assessments: doc.assessments, fit, catalog, hasRun: noRuns }), []);
});

test("measured without a run that exists is rejected", () => {
  assert.equal(withEntry({ evidence: "measured", run: undefined }).some((e) => e.includes("measured")), true);
  assert.equal(
    withEntry({ evidence: "measured", run: "runs/2026-10-10-toolgate" }).some((e) => e.includes("measured")),
    true,
    "noRuns dice que ese run no existe",
  );
});

test("what gets checked is the run the verdict declares, not the repo name", () => {
  const seen = [];
  const hasRun = (run) => {
    seen.push(run);
    return true;
  };
  const entries = structuredClone(doc.assessments);
  entries[0] = { ...entries[0], evidence: "measured", run: "runs/2026-10-10-toolgate" };
  assert.deepEqual(validateAssessments(entries, catalog, hasRun, fit), []);
  assert.deepEqual(seen, ["runs/2026-10-10-toolgate"]);
});

test("n_a without an explanation is rejected", () => {
  assert.equal(withEntry({ form: "n_a", verdict: "" }).some((e) => e.includes("verdict")), true);
});

test("a list field given as a bare string is rejected", () => {
  assert.equal(withEntry({ callable: "cli" }).some((e) => e.includes("callable")), true);
  const cost = { runtime: "node", requires_key: "typesafe", host: "any" };
  assert.equal(withEntry({ cost }).some((e) => e.includes("requires_key")), true);
});

test("unknown enum values, mismatched membership and duplicates are rejected", () => {
  assert.equal(withEntry({ form: "grpc" }).some((e) => e.includes("form")), true);
  assert.equal(withEntry({ in_catalog: false }).some((e) => e.includes("catálogo")), true);
  const dup = [doc.assessments[0], structuredClone(doc.assessments[0])];
  assert.equal(validateAssessments(dup, catalog, noRuns, fit).some((e) => e.includes("duplicado")), true);
});

test("fit must name a real group, or be inferred", () => {
  assert.equal(withEntry({ fit: "banana" }).some((e) => e.includes("fit")), true);
  assert.equal(withEntry({ fit: "inferred" }).some((e) => e.includes("fit")), false);
});

test("a project the fit document classified must agree with it", () => {
  const idx = doc.assessments.findIndex((a) => a.repo === "ruban-24/switchboard");
  assert.equal(fit.members["ruban-24/switchboard"], "domain");
  const entries = structuredClone(doc.assessments);
  entries[idx] = { ...entries[idx], fit: "routing" };
  assert.equal(validateAssessments(entries, catalog, noRuns, fit).some((e) => e.includes("fit")), true);
});

test("a path from this machine is rejected wherever it appears, in either slash", () => {
  assert.equal(withEntry({ verdict: "vive en G:/dev/jev" }).some((e) => e.includes("ruta absoluta")), true);
  assert.equal(withEntry({ blockers: ["instalado en E:/workspace/x"] }).some((e) => e.includes("ruta absoluta")), true);
  assert.equal(withEntry({ name: "en C:\\Users\\x" }).some((e) => e.includes("ruta absoluta")), true);
  assert.equal(withEntry({ verdict: "sin rutas" }).some((e) => e.includes("ruta absoluta")), false);
});
