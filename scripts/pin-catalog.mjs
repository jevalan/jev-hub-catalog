import { readJson, writeJson } from "./lib/json.mjs";
import { CATALOG, SOURCE_CATALOG, SOURCES } from "./lib/paths.mjs";

const { updated, categories, projects } = readJson(SOURCE_CATALOG);
// Sin rutas de máquina en data/: solo la etiqueta de origen.
writeJson(CATALOG, {
  updated,
  source: "jev-awesome/awesome-jev/data/projects.json",
  categories,
  projects,
});
console.log(`catalog.json: ${projects.length} entradas, corte ${updated}, desde ${SOURCES}`);
