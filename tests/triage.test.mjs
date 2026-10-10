import { test } from "node:test";
import assert from "node:assert/strict";
import { readJson } from "../scripts/lib/json.mjs";
import { CATALOG } from "../scripts/lib/paths.mjs";
import { BRANCHES, cacheKey, describeStatus, planTargets, shouldCache, shouldStop } from "../scripts/triage.mjs";

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

test("only terminal states reach the resumable cache", () => {
  assert.equal(shouldCache({ state: "ok" }), true);
  assert.equal(shouldCache({ state: "gone" }), true);
  // Un 500 o un token caducado no puede quedar grabado como "sin superficie":
  // la caché se reanuda, no se envenena.
  assert.equal(shouldCache({ state: "pending" }), false);
  assert.equal(shouldCache({ state: "rate_limited" }), false);
});

test("transient states stop the batch instead of being recorded", () => {
  assert.equal(shouldStop({ state: "pending" }), true);
  assert.equal(shouldStop({ state: "rate_limited" }), true);
  assert.equal(shouldStop({ state: "ok" }), false);
  assert.equal(shouldStop({ state: "gone" }), false);
});

test("the tree comes from the repository's own default ref, not from a guess", () => {
  assert.equal(BRANCHES[0], "HEAD");
  assert.deepEqual(BRANCHES.slice(1), ["main", "master"]);
});
