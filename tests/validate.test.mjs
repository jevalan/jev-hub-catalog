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
  return validateAssessments(entries, catalog, noRuns);
};

test("the shipped cohort A is valid", () => {
  assert.deepEqual(validateAssessments(doc.assessments, catalog, noRuns), []);
});

test("validateAll covers fit and assessments together", () => {
  assert.deepEqual(validateAll({ assessments: doc.assessments, fit, catalog, hasRun: noRuns }), []);
});

test("measured without a run is rejected", () => {
  assert.equal(withEntry({ evidence: "measured", run: undefined }).some((e) => e.includes("measured")), true);
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
  assert.equal(validateAssessments(dup, catalog, noRuns).some((e) => e.includes("duplicado")), true);
});

test("absolute machine paths never appear in a verdict", () => {
  assert.equal(withEntry({ verdict: "vive en E:\\workspace\\personal" }).some((e) => e.includes("ruta absoluta")), true);
});
