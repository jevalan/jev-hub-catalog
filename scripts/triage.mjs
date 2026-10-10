import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { readJson } from "./lib/json.mjs";
import { CATALOG, TRIAGE_CACHE } from "./lib/paths.mjs";
import { signal, NOT_SURFACE } from "./lib/triage-signals.mjs";

const API = "https://api.github.com";
const RAW = "https://raw.githubusercontent.com";
const MANIFESTS = ["package.json", "Cargo.toml", "pyproject.toml"];
const MANIFEST_LIMIT = 5;
const VENDORED = /(^|\/)(node_modules|vendor|third_party)\//i;
const BRANCHES = ["main", "master"];

export const cacheKey = (repo) => repo.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function describeStatus(status) {
  if (status === 200) return "ok";
  if (status === 404 || status === 451) return "gone";
  if (status === 403 || status === 429) return "rate_limited";
  return "pending";
}

export function planTargets(catalog) {
  return catalog.projects
    .filter((p) => p.repo && !p.gone)
    .sort((a, b) => (b.stars || 0) - (a.stars || 0))
    .map((p) => ({ repo: p.repo, name: p.name, stars: p.stars || 0 }));
}

const headers = () => {
  const h = { Accept: "application/vnd.github+json", "User-Agent": "jevalon-hub-scout" };
  if (process.env.GITHUB_TOKEN) h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return h;
};

export async function fetchTree(repo, branch) {
  const res = await fetch(`${API}/repos/${repo}/git/trees/${branch}?recursive=1`, { headers: headers() });
  const state = describeStatus(res.status);
  if (state !== "ok") return { status: state, state, tree: [] };
  const body = await res.json();
  return { status: "ok", state: "ok", tree: (body.tree || []).filter((e) => e.type === "blob").map((e) => e.path) };
}

/** Manifiestos por CDN cruda: no consumen el límite de la API. Se leen los que
 * el árbol declare, no solo los de la raíz: un paquete anidado (sidecar/) declara
 * ahí sus scripts, y quedarse con la raíz perdería su CLI. */
export async function fetchManifests(repo, branch, tree = []) {
  const candidates = tree
    .filter((p) => MANIFESTS.includes(p.split("/").pop()) && !NOT_SURFACE.test(p) && !VENDORED.test(p))
    .sort((a, b) => a.split("/").length - b.split("/").length)
    .slice(0, MANIFEST_LIMIT);
  const out = {};
  for (const path of candidates) {
    const name = path.split("/").pop();
    if (name in out) continue; // el más cercano a la raíz gana
    const res = await fetch(`${RAW}/${repo}/${branch}/${path}`);
    if (!res.ok) continue;
    const text = await res.text();
    out[name] = name.endsWith(".json") ? JSON.parse(text) : text;
  }
  return out;
}

export async function fetchEntry(repo) {
  let last = "gone";
  for (const branch of BRANCHES) {
    const { state, tree } = await fetchTree(repo, branch);
    if (state === "rate_limited" || state === "pending") return { state };
    if (state === "gone") {
      last = "gone";
      continue;
    }
    return { state: "ok", branch, tree, manifests: await fetchManifests(repo, branch, tree) };
  }
  return { state: last };
}

async function main() {
  const arg = process.argv.find((a) => a.startsWith("--limit="));
  const limit = arg ? Number(arg.slice(8)) : Infinity;
  mkdirSync(TRIAGE_CACHE, { recursive: true });

  const targets = planTargets(readJson(CATALOG));
  let written = 0;
  let cached = 0;
  for (const target of targets) {
    if (written >= limit) break;
    const file = resolve(TRIAGE_CACHE, `${cacheKey(target.repo)}.json`);
    if (existsSync(file)) {
      cached++;
      continue;
    }
    const entry = await fetchEntry(target.repo);
    if (entry.state === "rate_limited") {
      console.warn(`límite de la API en ${target.repo}: vuelve a ejecutar, la caché es reanudable`);
      break;
    }
    const surface = entry.state === "ok" ? signal(entry.tree, entry.manifests) : { callable: ["none"], form_hint: "n_a" };
    writeFileSync(
      file,
      JSON.stringify({ repo: target.repo, ...entry, ...surface, cached: new Date().toISOString() }, null, 2) + "\n",
    );
    written++;
    console.log(`${entry.state.padEnd(7)} ${target.repo} ${surface.callable.join(",")}`);
  }
  console.log(`triage: ${written} nuevos, ${cached} ya en caché, de ${targets.length} objetivos`);
}

if (process.argv[1] && process.argv[1].endsWith("triage.mjs")) await main();
