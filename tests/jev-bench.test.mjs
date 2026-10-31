import test from "node:test";
import assert from "node:assert/strict";
import { evaluate, numericOf, percentile, stats } from "../scripts/lib/jev-bench.mjs";

test("noul thresholds are inclusive and read the probability", () => {
  assert.equal(evaluate({ noul_gte: 0.8 }, { noul: 0.8 }).ok, true);
  assert.equal(evaluate({ noul_gte: 0.8 }, { noul: 0.79 }).ok, false);
  assert.equal(evaluate({ noul_lte: 0.15 }, { noul: 0.15 }).ok, true);
  assert.equal(evaluate({ noul_gte: 0.2, noul_lte: 0.6 }, { noul: 0.7 }).ok, false);
});

test("choice, choice_in and confidence combine", () => {
  assert.equal(evaluate({ choice: "block", confidence_gte: 0.55 }, { choice: "block", confidence: 0.9 }).ok, true);
  assert.equal(evaluate({ choice: "block", confidence_gte: 0.55 }, { choice: "ask", confidence: 0.9 }).ok, false);
  assert.equal(evaluate({ choice_in: ["ask", "block"] }, { choice: "allow" }).ok, false);
  assert.equal(evaluate({ confidence_lte: 0.6 }, { choice: "ask", confidence: 0.4 }).ok, true);
});

test("score thresholds read the score; a missing value fails instead of passing", () => {
  assert.equal(evaluate({ score_gte: 2.5 }, { score: 2.89 }).ok, true);
  assert.equal(evaluate({ score_gte: 2.5 }, { noul: 0.9 }).ok, false);
  assert.equal(evaluate({ noul_gte: 0.5 }, undefined).ok, false);
});

test("an expectation of unknown meaning is not evaluable and never counts as a pass", () => {
  const r = evaluate({ choice_in: ["a"], prob_lte: 0.2 }, { choice: "a" });
  assert.equal(r.evaluable, false);
  assert.equal(r.ok, false);
});

test("stats, numericOf and percentile", () => {
  assert.deepEqual(stats([0.2, 0.4]), { n: 2, mean: 0.3, sd: 0.1, min: 0.2, max: 0.4 });
  assert.equal(stats([]), null);
  assert.equal(numericOf({ noul: 0.1 }), 0.1);
  assert.equal(numericOf({ choice: "x" }), null);
  assert.equal(percentile([1, 2, 3, 4], 50), 3);
});
