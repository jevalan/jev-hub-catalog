import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { readJson, writeJson } from "./lib/json.mjs";
import { ASSESSMENTS, ROOT } from "./lib/paths.mjs";
import { fetchEntry } from "./triage.mjs";

const DIR = resolve(ROOT, "tests", "fixtures", "trees");
mkdirSync(DIR, { recursive: true });

for (const { repo } of readJson(ASSESSMENTS).assessments) {
  const entry = await fetchEntry(repo);
  if (entry.state !== "ok") {
    console.warn(`sin árbol para ${repo}: ${entry.state}`);
    continue;
  }
  const file = resolve(DIR, `${repo.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.json`);
  // El árbol completo, sin recortar: curar la lista a mano sesgaría la calibración.
  writeJson(file, { repo, branch: entry.branch, tree: entry.tree, manifests: entry.manifests });
  console.log(`fixture ${repo}: ${entry.tree.length} rutas`);
}
