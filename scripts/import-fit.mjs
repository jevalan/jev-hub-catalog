import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { writeJson } from "./lib/json.mjs";
import { parseFit } from "./lib/fit-parse.mjs";
import { FIT, SOURCE_FIT_DOC } from "./lib/paths.mjs";

const flag = process.argv.find((a) => a.startsWith("--doc="));
const doc = flag ? resolve(flag.slice(6)) : SOURCE_FIT_DOC;

const { groups, members, errors } = parseFit(readFileSync(doc, "utf8"));
if (errors.length) {
  console.error(`import-fit: el documento y el parser no coinciden (${errors.length})`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

writeJson(FIT, {
  source: "jev-awesome/docs/agents-tooling-clasificacion.md",
  generated: new Date().toISOString().slice(0, 10),
  groups,
  members,
});
const total = groups.reduce((n, g) => n + g.count, 0);
console.log(`import-fit: ${Object.keys(members).length} miembros en ${groups.length} grupos, suma ${total}`);
