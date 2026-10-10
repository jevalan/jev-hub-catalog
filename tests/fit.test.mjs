import { test } from "node:test";
import assert from "node:assert/strict";
import { readJson } from "../scripts/lib/json.mjs";
import { CATALOG, FIT } from "../scripts/lib/paths.mjs";
import { validateFit } from "../scripts/lib/validate-rules.mjs";

const fit = readJson(FIT);
const catalog = readJson(CATALOG);

test("the committed fit is coherent with the universe", () => {
  assert.deepEqual(validateFit(fit, catalog), []);
});

test("toolgate cannot be a member: the source document never classified it", () => {
  assert.equal("RiskAverseTech/toolgate" in fit.members, false);
});

test("a foreign member and a wrong count are both rejected", () => {
  const broken = structuredClone(fit);
  broken.members["RiskAverseTech/toolgate"] = "gates";
  broken.groups[0].count = 999;
  const errors = validateFit(broken, catalog);
  assert.equal(errors.some((e) => e.includes("toolgate")), true);
  assert.equal(errors.some((e) => e.includes("305")), true);
});
