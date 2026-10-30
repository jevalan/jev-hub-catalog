import { test } from "node:test";
import assert from "node:assert/strict";
import { judge, observe } from "../scripts/lib/gate-cases.mjs";
import { REFLEX_CASES } from "../scripts/lib/gate-cases-reflex.mjs";

const byId = (id) => REFLEX_CASES.find((c) => c.id === id);
const check = (decision, rule = "r") => JSON.stringify({ decision, rule, source: "rule", policy: null, latency_s: 0, answers: {} }, null, 2);
const hook = (decision) => `${JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: decision, permissionDecisionReason: "r" } })}\n`;

test("reflex check and scan are read from their own field", () => {
  assert.deepEqual(observe("reflex-check", check("deny", "recursive delete")), { decision: "deny", reason: "recursive delete" });
  assert.equal(observe("reflex-scan", JSON.stringify({ outcome: "block", rule: "x" })).decision, "block");
  assert.equal(observe("reflex-check", "stack trace"), null);
});

test("a hook that says nothing is allowing, and one that answers is read as its decision", () => {
  assert.deepEqual(observe("reflex-hook", ""), { decision: "silent-proceed", reason: null });
  assert.equal(observe("reflex-hook", hook("ask")).decision, "ask");
  assert.equal(observe("reflex-hook", "not a json line\n"), null);
});

test("a gate that lets something unknown through is caught", () => {
  for (const id of ["unlisted-never-passes", "destructive-unlisted-never-passes", "pipe-to-shell-never-passes", "credentials-read-never-passes"]) {
    const r = judge(byId(id), { status: 0, stdout: check("pass") });
    assert.equal(r.pass, false, id);
    assert.match(r.problems.join(" "), /pass/);
  }
  const silent = judge(byId("hook-claude-unlisted-asks"), { status: 0, stdout: "" });
  assert.equal(silent.pass, false);
  assert.match(silent.problems.join(" "), /silent-proceed/);
});

test("failing closed requires the failure to be written down", () => {
  const c = byId("hook-claude-unreadable-fails-closed");
  assert.equal(judge(c, { status: 0, stdout: hook("ask"), errorLogged: true }).pass, true);
  const unlogged = judge(c, { status: 0, stdout: hook("ask"), errorLogged: false });
  assert.equal(unlogged.pass, false);
  assert.match(unlogged.problems.join(" "), /log de errores/);
  assert.equal(judge(c, { status: 0, stdout: "", errorLogged: true }).pass, false);
});

test("a config that disarms the hook is caught", () => {
  for (const id of ["hook-claude-mistyped-config-keeps-enforcing", "hook-claude-config-cannot-turn-off-enforce"]) {
    assert.equal(judge(byId(id), { status: 0, stdout: hook("deny") }).pass, true, id);
    assert.equal(judge(byId(id), { status: 0, stdout: "" }).pass, false, id);
  }
});

test("Codex signals an unreadable event with exit 2 as well as deny", () => {
  const c = byId("hook-codex-unreadable-fails-closed");
  assert.equal(judge(c, { status: 2, stdout: hook("deny"), errorLogged: true }).pass, true);
  assert.equal(judge(c, { status: 0, stdout: hook("deny"), errorLogged: true }).pass, false);
});

test("a check with no command is an error, not a pass", () => {
  const c = byId("missing-argument-is-error");
  assert.equal(judge(c, { status: 1, stdout: "" }).pass, true);
  assert.equal(judge(c, { status: 0, stdout: check("pass") }).pass, false);
});

test("every reflex case names its target, how it is read and what it demands, and none runs the command", () => {
  const ids = new Set(REFLEX_CASES.map((c) => c.id));
  assert.equal(ids.size, REFLEX_CASES.length);
  for (const c of REFLEX_CASES) {
    assert.ok(c.why && c.mode && ["bin", "hook"].includes(c.target) && Array.isArray(c.args), c.id);
    assert.ok(c.expect.noDecision || c.expect.decisionIn?.length, c.id);
    // `run`, `setup`, `install` y `uninstall` ejecutan comandos o tocan la configuración del usuario.
    assert.equal(["run", "setup", "install", "uninstall"].includes(c.args[0]), false, c.id);
  }
});
