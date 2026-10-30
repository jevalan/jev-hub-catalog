import assert from "node:assert/strict";
import { test } from "node:test";
import { CASES, judge, judgeDiscovery } from "../scripts/lib/probe-cases.mjs";

const byId = (id) => CASES("tool.risk").find((c) => c.id === id);
const reply = (extra) => ({ protocol_version: "jev-hub/0.1", request_id: "probe", ...extra });

test("una decisión por regla estática pasa si es ok y lleva decision", () => {
  const ok = reply({ status: "ok", decision: { verdict: "deny" } });
  assert.equal(judge(byId("static-rule-decides"), ok).pass, true);
});

test("un ok sin decision, o un error con decision, no pasan", () => {
  assert.equal(judge(byId("static-rule-decides"), reply({ status: "ok" })).pass, false);
  const leaky = reply({ status: "error", error: { code: "provider_failed" }, decision: { verdict: "allow" } });
  const verdict = judge(byId("no-model-is-an-error"), leaky);
  assert.equal(verdict.pass, false);
  assert.match(verdict.problems.join(" "), /lleva decision/);
});

test("el modo de fallo que se cuela como allow no pasa", () => {
  const verdict = judge(byId("no-model-is-an-error"), reply({ status: "ok", decision: { verdict: "allow" } }));
  assert.equal(verdict.pass, false);
});

test("un código de error distinto del exigido no pasa", () => {
  const verdict = judge(byId("input-outside-schema"), reply({ status: "error", error: { code: "provider_failed" } }));
  assert.equal(verdict.pass, false);
});

test("una respuesta que delata el comando no pasa", () => {
  const verdict = judge(byId("no-model-is-an-error"), reply({ status: "error", error: { code: "provider_failed", message: "falló cli.js" } }), ["cli.js"]);
  assert.equal(verdict.pass, false);
  assert.match(verdict.problems.join(" "), /delata/);
});

test("el request_id debe devolverse", () => {
  const verdict = judge(byId("input-outside-schema"), { status: "error", error: { code: "invalid_input" } });
  assert.equal(verdict.pass, false);
});

test("el descubrimiento exige las dos direcciones iguales y un digest sha256", () => {
  const good = JSON.stringify({ capabilities: { "tool.risk": { digest: `sha256:${"a".repeat(64)}` } } });
  assert.equal(judgeDiscovery(good, good).pass, true);
  assert.equal(judgeDiscovery(good, `${good} `).pass, false);
  const noDigest = JSON.stringify({ capabilities: { "tool.risk": {} } });
  assert.equal(judgeDiscovery(noDigest, noDigest).pass, false);
  assert.equal(judgeDiscovery(good, good, ["tool.risk"]).pass, false);
  assert.equal(judgeDiscovery("no json", "no json").pass, false);
});
