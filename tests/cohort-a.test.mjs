import { test } from "node:test";
import assert from "node:assert/strict";
import { readJson } from "../scripts/lib/json.mjs";
import { ASSESSMENTS, CATALOG } from "../scripts/lib/paths.mjs";
import { hasRun } from "../scripts/lib/runs.mjs";

const { assessments } = readJson(ASSESSMENTS);
const catalog = readJson(CATALOG);
const byRepo = new Map(assessments.map((a) => [a.repo.toLowerCase(), a]));

test("cohort A holds the 13 analysed clones", () => {
  assert.equal(assessments.filter((a) => a.cohort === "A").length, 13);
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

test("an entry is measured only if its run is on disk, and toolgate is the one measured so far", () => {
  for (const a of assessments.filter((x) => x.evidence === "measured")) assert.equal(hasRun(a.run), true, `${a.repo} sin run`);
  assert.deepEqual(assessments.filter((a) => a.evidence === "measured").map((a) => a.repo), ["RiskAverseTech/toolgate"]);
});
