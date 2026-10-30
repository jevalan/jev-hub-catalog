import { readJson } from "./lib/json.mjs";
import { ASSESSMENTS, CATALOG, FIT, SHELF } from "./lib/paths.mjs";
import { hasRun } from "./lib/runs.mjs";
import { validateAll } from "./lib/validate-rules.mjs";

const errors = validateAll({
  assessments: readJson(ASSESSMENTS).assessments,
  fit: readJson(FIT),
  catalog: readJson(CATALOG),
  shelf: readJson(SHELF),
  hasRun,
});

if (errors.length) {
  console.error(`validate: ${errors.length} problema(s)`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log("validate: datos coherentes");
