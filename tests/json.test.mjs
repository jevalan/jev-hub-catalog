import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readJson, writeJson } from "../scripts/lib/json.mjs";
import { ROOT, ASSESSMENTS } from "../scripts/lib/paths.mjs";

test("writeJson round-trips through readJson and ends with a newline", () => {
  const file = join(mkdtempSync(join(tmpdir(), "scout-")), "x.json");
  writeJson(file, { a: [1, 2] });
  assert.deepEqual(readJson(file), { a: [1, 2] });
  assert.equal(readFileSync(file, "utf8").endsWith("\n"), true);
});

test("paths resolve inside the repository", () => {
  assert.equal(ROOT.endsWith("jevalon-hub-scout"), true);
  assert.equal(ASSESSMENTS, join(ROOT, "data", "assessments.json"));
});
