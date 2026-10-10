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
