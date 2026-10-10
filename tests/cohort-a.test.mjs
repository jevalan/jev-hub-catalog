import { test } from "node:test";
import assert from "node:assert/strict";
import { readJson } from "../scripts/lib/json.mjs";
import { ASSESSMENTS, CATALOG } from "../scripts/lib/paths.mjs";

const { assessments } = readJson(ASSESSMENTS);
const catalog = readJson(CATALOG);
const byRepo = new Map(assessments.map((a) => [a.repo.toLowerCase(), a]));

test("cohort A holds the 13 analysed clones", () => {
  assert.equal(assessments.length, 13);
  assert.equal(assessments.every((a) => a.cohort === "A"), true);
});

test("catalog membership is stated for every entry, including the two absentees", () => {
  for (const a of assessments) {
    const known = catalog.projects.some((p) => (p.repo || "").toLowerCase() === a.repo.toLowerCase());
    assert.equal(a.in_catalog, known, `${a.repo} declara in_catalog ${a.in_catalog}`);
  }
  assert.equal(byRepo.get("joaquinruiz/medula").in_catalog, false);
  assert.equal(byRepo.get("shitianfang/wakegate").in_catalog, false);
});

test("toolgate is catalogued under research and is the one already adapted", () => {
  const t = byRepo.get("riskaversetech/toolgate");
  assert.equal(t.catalog_category, "research");
  assert.equal(t.capability, "tool.risk");
});

test("no entry claims to be measured while there is no probe yet", () => {
  assert.equal(assessments.every((a) => a.evidence === "static"), true);
});
