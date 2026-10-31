import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const CATALOG = resolve(ROOT, "data", "catalog.json");
export const FIT = resolve(ROOT, "data", "fit.json");
export const ASSESSMENTS = resolve(ROOT, "data", "assessments.json");
export const TRIAGE_CACHE = resolve(ROOT, "data", "triage-cache");
export const SHELF = resolve(ROOT, "data", "shelf.json");
export const EXAMPLES = resolve(ROOT, "data", "examples.json");
export const DIRECTORY = resolve(ROOT, "site", "index.html");
export const README = resolve(ROOT, "README.md");
export const SITE = resolve(ROOT, "site", "veredictos.html");
export const TEMPLATE = resolve(ROOT, "scripts", "template.html");

// El árbol de análisis (universo y clasificación) vive fuera de este repo. Por
// defecto se busca como hermano (`../jev-awesome`); si está en otro sitio, o en
// otra unidad, se apunta SCOUT_SOURCES a él sin tocar el código. Todo lo que lo
// lee pasa por aquí.
export const SOURCES = process.env.SCOUT_SOURCES ?? resolve(ROOT, "..", "jev-awesome");
export const SOURCE_CATALOG = resolve(SOURCES, "awesome-jev", "data", "projects.json");
export const SOURCE_FIT_DOC = resolve(SOURCES, "docs", "agents-tooling-clasificacion.md");
