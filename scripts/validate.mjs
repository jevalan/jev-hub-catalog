import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { readJson } from "./lib/json.mjs";
import { ASSESSMENTS, CATALOG, FIT, ROOT } from "./lib/paths.mjs";
import { validateAll } from "./lib/validate-rules.mjs";

const RUNS = resolve(ROOT, "runs");
// Los runs viven en runs/<fecha>-<nombre-del-repo>/, así que un run existe si
// algún directorio termina con el nombre del repo.
const hasRun = (repo) => {
  if (!existsSync(RUNS)) return false;
  const name = repo.split("/")[1].toLowerCase();
  return readdirSync(RUNS).some((d) => d.toLowerCase().endsWith(`-${name}`));
};

const errors = validateAll({
  assessments: readJson(ASSESSMENTS).assessments,
  fit: readJson(FIT),
  catalog: readJson(CATALOG),
  hasRun,
});

if (errors.length) {
  console.error(`validate: ${errors.length} problema(s)`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log("validate: datos coherentes");
