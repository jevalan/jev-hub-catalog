import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { readJson } from "../scripts/lib/json.mjs";
import { ASSESSMENTS, ROOT } from "../scripts/lib/paths.mjs";
import { signal } from "../scripts/lib/triage-signals.mjs";

const DIR = resolve(ROOT, "tests", "fixtures", "trees");
const byRepo = new Map(readJson(ASSESSMENTS).assessments.map((a) => [a.repo.toLowerCase(), a]));
const sorted = (list) => [...list].sort().join(",");

test("the detector reproduces callable for all 13 analysed projects", () => {
  const files = readdirSync(DIR).filter((f) => f.endsWith(".json"));
  assert.equal(files.length, 13);
  const misses = [];
  for (const file of files) {
    const fixture = readJson(resolve(DIR, file));
    const expected = byRepo.get(fixture.repo.toLowerCase());
    assert.ok(expected, `${fixture.repo} no está en la cohorte A`);
    const got = signal(fixture.tree, fixture.manifests || {});
    if (sorted(got.callable) !== sorted(expected.callable)) {
      misses.push(`${fixture.repo}: tabla ${sorted(expected.callable)} / detector ${sorted(got.callable)}`);
    }
  }
  assert.deepEqual(misses, []);
});

test("a manifest with only an exports field is a library", () => {
  const got = signal(["package.json", "src/index.ts"], { "package.json": { exports: { ".": "./dist/index.js" } } });
  assert.deepEqual(got.callable, ["lib"]);
  assert.equal(got.form_hint, "n_a");
});

test("an empty tree yields no surface at all", () => {
  assert.deepEqual(signal([], {}).callable, ["none"]);
});
