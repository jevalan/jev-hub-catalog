import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const CATALOG = resolve(ROOT, "data", "catalog.json");
export const FIT = resolve(ROOT, "data", "fit.json");
export const ASSESSMENTS = resolve(ROOT, "data", "assessments.json");
export const TRIAGE_CACHE = resolve(ROOT, "data", "triage-cache");
export const README = resolve(ROOT, "README.md");
export const SITE = resolve(ROOT, "site", "index.html");
export const TEMPLATE = resolve(ROOT, "scripts", "template.html");

// El árbol de análisis (universo y clasificación) vive fuera de este repo, en
// otra unidad: se movió de E: a G: por falta de espacio. Todo lo que lo lee pasa
// por aquí, así que un movimiento futuro se arregla en un sitio, o se apunta
// SCOUT_SOURCES a la copia nueva sin tocar el código.
export const SOURCES = process.env.SCOUT_SOURCES ?? "G:/dev/jev/jev-awesome";
export const SOURCE_CATALOG = resolve(SOURCES, "awesome-jev", "data", "projects.json");
export const SOURCE_FIT_DOC = resolve(SOURCES, "docs", "agents-tooling-clasificacion.md");
