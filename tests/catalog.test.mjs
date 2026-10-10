import { test } from "node:test";
import assert from "node:assert/strict";
import { readJson } from "../scripts/lib/json.mjs";
import { CATALOG } from "../scripts/lib/paths.mjs";

const catalog = readJson(CATALOG);

test("the snapshot carries its source and cut-off date", () => {
  assert.match(catalog.source, /awesome-jev/);
  assert.match(catalog.updated, /^\d{4}-\d{2}-\d{2}$/);
});

test("the pinned counts hold", () => {
  assert.equal(catalog.projects.length, 1351);
  assert.equal(catalog.projects.filter((p) => p.category === "agents").length, 305);
  assert.equal(catalog.projects.filter((p) => p.gone).length, 11);
});

test("toolgate is present but NOT in agents", () => {
  const toolgate = catalog.projects.find((p) => p.repo === "RiskAverseTech/toolgate");
  assert.equal(toolgate.category, "research");
});
