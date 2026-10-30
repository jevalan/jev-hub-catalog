import { test } from "node:test";
import assert from "node:assert/strict";
import { CASES, judge, judgeAudit, observe, parseCheck } from "../scripts/lib/gate-cases.mjs";

const byId = (id) => CASES.find((c) => c.id === id);

const checkOut = (decision, reason = "r") =>
  `${JSON.stringify({ decision, contributions: [{ decision, reason, source: "rule" }], latencyMs: 3 }, null, 2)}\njev-firewall: ${decision.toUpperCase()} — ${reason}\n`;
const claudeOut = (decision) => `${JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: decision, permissionDecisionReason: "r" } })}\n`;

test("check output is read past the trailing reason line", () => {
  assert.equal(parseCheck(checkOut("allow")).decision, "allow");
  assert.equal(observe("check", checkOut("block", "touches .env")).reason, "touches .env");
});

test("Codex allow is silence: an empty object counts as proceeding", () => {
  assert.deepEqual(observe("hook-codex", "{}\n"), { decision: "silent-proceed", reason: null });
  assert.equal(observe("hook-codex", '{"permissionDecision":"deny","permissionDecisionReason":"x"}\n').decision, "deny");
});

test("a case passes when exit and decision are the expected ones", () => {
  const r = judge(byId("protected-file-blocked"), { status: 2, stdout: checkOut("block") });
  assert.equal(r.pass, true);
  assert.equal(r.observed.decision, "block");
});

test("a gate that fails open is caught: no model must never mean allow", () => {
  for (const id of ["no-model-never-allows", "destructive-without-model-never-allows", "hook-claude-unmatched-asks"]) {
    const c = byId(id);
    const out = c.mode === "check" ? checkOut("allow") : claudeOut("allow");
    const r = judge(c, { status: 0, stdout: out });
    assert.equal(r.pass, false, id);
    assert.match(r.problems.join(" "), /allow/);
  }
});

test("an unparseable payload that still yields a decision is rejected", () => {
  const c = byId("unreadable-payload-is-error");
  assert.equal(judge(c, { status: 1, stdout: "" }).pass, true);
  assert.equal(judge(c, { status: 0, stdout: checkOut("allow") }).pass, false);
  assert.equal(judge(c, { status: 1, stdout: checkOut("allow") }).pass, false);
});

test("a wrong exit code fails an otherwise right decision", () => {
  const r = judge(byId("protected-file-blocked"), { status: 0, stdout: checkOut("block") });
  assert.equal(r.pass, false);
  assert.match(r.problems[0], /exit 0/);
});

test("an unreadable answer is a failure, not a pass by omission", () => {
  const r = judge(byId("safe-command-allowed"), { status: 0, stdout: "garbage" });
  assert.equal(r.pass, false);
  assert.match(r.problems.join(" "), /ninguna decisión legible/);
});

test("every case states why, how it is read and what it demands", () => {
  const ids = new Set(CASES.map((c) => c.id));
  assert.equal(ids.size, CASES.length);
  for (const c of CASES) {
    assert.ok(c.why && c.mode && Array.isArray(c.args), c.id);
    assert.ok(c.expect.noDecision || c.expect.decisionIn?.length, c.id);
  }
});

test("the audit log needs a decision and a reason on every line", () => {
  const line = (o) => JSON.stringify(o);
  assert.equal(judgeAudit(`${line({ decision: "allow", reason: "x" })}\n${line({ decision: "block", reason: "y" })}\n`).pass, true);
  assert.equal(judgeAudit("").pass, false);
  assert.equal(judgeAudit("not json\n").pass, false);
  assert.equal(judgeAudit(`${line({ decision: "allow" })}\n`).pass, false);
});
