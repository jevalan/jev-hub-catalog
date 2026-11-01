import test from "node:test";
import assert from "node:assert/strict";
import { CONVERSATION_CORPUS, CORPUS, LOG_CORPUS, TECHNIQUES, consensus, outcome, rankedFirst, secretMark, summarize } from "../scripts/lib/frontier-context.mjs";

test("context corpus: ids are unique and every technique is present", () => {
  assert.equal(new Set(CORPUS.map((c) => c.id)).size, CORPUS.length);
  assert.deepEqual([...new Set(CORPUS.map((c) => c.technique))].sort(), [...TECHNIQUES].sort());
});

test("context corpus: log lines are unique so a kept line can be matched verbatim", () => {
  for (const c of LOG_CORPUS) assert.equal(new Set(c.lines).size, c.lines.length, c.id);
});

test("context corpus: needles are in range and secret cases have no needles", () => {
  for (const c of LOG_CORPUS) {
    for (const i of c.needles) assert.ok(i >= 0 && i < c.lines.length, `${c.id}: aguja fuera de rango`);
    if (c.secret) {
      assert.deepEqual(c.needles, [], c.id);
      assert.ok(c.lines.includes(c.secret), `${c.id}: el secreto no está en el registro`);
    } else {
      assert.ok(c.needles.length > 0, `${c.id}: sin agujas`);
    }
  }
  for (const c of CONVERSATION_CORPUS) {
    for (const i of c.needles) assert.ok(i >= 0 && i < c.steps.length, `${c.id}: aguja fuera de rango`);
    assert.ok(c.secret ? c.needles.length === 0 : c.needles.length > 0, c.id);
  }
});

test("context corpus: the task-dependence pairs share a log and differ in the needle", () => {
  const byId = (id) => CORPUS.find((c) => c.id === id);
  assert.deepEqual(byId("ctx-task-build-speed").lines, byId("ctx-task-login").lines);
  assert.notDeepEqual(byId("ctx-task-build-speed").needles, byId("ctx-task-login").needles);
  assert.deepEqual(byId("ctx-conv-goal-port").steps, byId("ctx-conv-goal-host").steps);
  assert.notDeepEqual(byId("ctx-conv-goal-port").needles, byId("ctx-conv-goal-host").needles);
});

test("outcome: lost, bloated, correct and leaked", () => {
  const it = LOG_CORPUS.find((c) => c.id === "ctx-assert-failed");
  const n = it.lines.length;
  const only = (...idx) => Array.from({ length: n }, (_, i) => idx.includes(i));
  assert.equal(outcome(it, { kept: only(it.needles[0], 0, 1, 2), sent: "" }), "correct");
  assert.equal(outcome(it, { kept: only(0, 1, 2), sent: "" }), "lost");
  assert.equal(outcome(it, { kept: Array(n).fill(true), sent: "" }), "bloated");
  const sec = LOG_CORPUS.find((c) => c.id === "ctx-secret-github-token");
  assert.equal(outcome(sec, { kept: [], sent: `... ${sec.secret} ...` }), "leaked");
  assert.equal(outcome(sec, { kept: [], sent: "nada" }), "correct");
  assert.equal(secretMark(sec.secret), sec.secret.slice(-14));
});

test("consensus: most frequent wins, a tie goes to the more serious", () => {
  assert.equal(consensus(["correct", "correct", "lost"]), "correct");
  assert.equal(consensus(["correct", "lost"]), "lost");
  assert.equal(consensus(["bloated", "leaked"]), "leaked");
});

test("summarize: counts per technique and flags unstable cases", () => {
  const s = summarize([
    { technique: "ctx-quiet", outcome: "correct", outcomes: ["correct", "correct"] },
    { technique: "ctx-quiet", outcome: "lost", outcomes: ["lost", "correct"] },
    { technique: "ctx-secrets", outcome: "leaked", outcomes: ["leaked"] },
  ]);
  assert.equal(s.total, 3);
  assert.equal(s.leaked, 1);
  assert.equal(s.unstable, 1);
  assert.equal(s.byTechnique["ctx-quiet"].total, 2);
});

test("rankedFirst: the needles must beat all the noise on both call and result", () => {
  const it = { needles: [1] };
  assert.equal(rankedFirst(it, { 0: [0.1, 0.05], 1: [0.5, 0.2], 2: [0.12, 0.07] }), true);
  assert.equal(rankedFirst(it, { 0: [0.1, 0.25], 1: [0.5, 0.2], 2: [0.12, 0.07] }), false);
  assert.equal(rankedFirst({ needles: [] }, { 0: [0.1, 0.1] }), false);
});

test("summarize: counts how many cases were ranked right", () => {
  const s = summarize([
    { technique: "ctx-lookup", outcome: "lost", outcomes: ["lost"], ranked: true },
    { technique: "ctx-lookup", outcome: "lost", outcomes: ["lost"], ranked: false },
    { technique: "ctx-quiet", outcome: "correct", outcomes: ["correct"] },
  ]);
  assert.equal(s.rankable, 2);
  assert.equal(s.ranked, 1);
  assert.equal(s.byTechnique["ctx-quiet"].rankable, 0);
});
