import { test } from "node:test";
import assert from "node:assert/strict";
import { FIXTURES, judgeCase, wellposedCases } from "../scripts/lib/cli-cases-wellposed.mjs";

const cases = wellposedCases("0.7.1");

test("cada caso de wellposed tiene id único, motivo, argumentos y un exit esperado", () => {
  assert.equal(new Set(cases.map((c) => c.id)).size, cases.length);
  for (const c of cases) {
    assert.ok(c.why && Array.isArray(c.args) && Number.isInteger(c.exit), c.id);
  }
});

test("los ficheros que citan los casos existen entre las peticiones propias", () => {
  for (const c of cases) {
    for (const a of c.args.filter((x) => x.endsWith(".json") && x !== "nope.json")) assert.ok(a in FIXTURES, `${c.id}: ${a}`);
    if (c.stdinFixture) assert.ok(c.stdinFixture in FIXTURES, c.id);
  }
});

test("las peticiones propias son JSON válido salvo la que debe ser ilegible", () => {
  for (const [name, text] of Object.entries(FIXTURES)) {
    if (name === "bad.json") assert.throws(() => JSON.parse(text));
    else JSON.parse(text);
  }
});

test("judgeCase marca el exit equivocado y los problemas del comprobador", () => {
  const c = cases.find((x) => x.id === "version");
  assert.deepEqual(judgeCase(c, { status: 0, stdout: "0.7.1\n", stderr: "" }), []);
  assert.equal(judgeCase(c, { status: 1, stdout: "9.9.9", stderr: "" }).length, 2);
});

test("el caso del aviso solo exige que el aviso exista y que el proceso no falle", () => {
  const c = cases.find((x) => x.id === "warning-does-not-fail");
  const ok = { status: 0, stdout: "", stderr: "", json: { findings: [{ rule: "choice/no-escape-hatch", severity: "warn" }] } };
  assert.deepEqual(judgeCase(c, ok), []);
  assert.equal(judgeCase(c, { ...ok, json: { findings: [] } }).length, 1);
});
