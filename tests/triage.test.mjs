import { test } from "node:test";
import assert from "node:assert/strict";
import { readJson } from "../scripts/lib/json.mjs";
import { CATALOG } from "../scripts/lib/paths.mjs";
import { cacheKey, describeStatus, planTargets } from "../scripts/triage.mjs";

const catalog = readJson(CATALOG);

test("the cache key swallows case and separator differences", () => {
  assert.equal(cacheKey("qkal/Canny"), "qkal-canny");
  assert.equal(cacheKey("qkal/canny"), cacheKey("qkal/Canny"));
});

test("targets need a repo, skip the gone ones and come most-starred first", () => {
  const targets = planTargets(catalog);
  assert.equal(targets.every((t) => t.repo), true);
  assert.equal(targets.some((t) => catalog.projects.find((p) => p.repo === t.repo)?.gone === true), false);
  // 1351 entradas − 11 con gone − 96 sin repo = 1244 objetivos.
  assert.equal(targets.length, 1244);
  assert.equal(targets[0].stars >= targets[targets.length - 1].stars, true);
});

test("an entry without a repo never becomes a target", () => {
  const withNull = { projects: [...catalog.projects, { name: "solo artículo", repo: null }] };
  assert.equal(planTargets(withNull).some((t) => !t.repo), false);
});

test("HTTP statuses map to the four states that matter", () => {
  assert.equal(describeStatus(200), "ok");
  assert.equal(describeStatus(404), "gone");
  assert.equal(describeStatus(451), "gone");
  assert.equal(describeStatus(403), "rate_limited");
  assert.equal(describeStatus(429), "rate_limited");
  assert.equal(describeStatus(500), "pending");
});
