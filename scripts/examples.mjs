// Solo lectura: baja el README de cada repo evaluado por la API de GitHub y
// extrae ejemplos y configuraciones. Nada de lo descargado se ejecuta ni se instala.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readJson, writeJson } from "./lib/json.mjs";
import { ASSESSMENTS, EXAMPLES } from "./lib/paths.mjs";
import { extractSnippets } from "./lib/examples.mjs";

const flag = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];

function fetchReadme(repo) {
  const r = spawnSync("gh", ["api", "-H", "Accept: application/vnd.github.raw", `repos/${repo}/readme`], {
    encoding: "utf8",
    maxBuffer: 20e6,
  });
  if (r.status === 0) return { ok: true, text: r.stdout };
  // Solo un 404 es terminal; un 5xx o un límite de uso se reintenta en la próxima pasada.
  return { ok: false, gone: /404|Not Found/i.test(r.stderr) };
}

if (process.argv[1]?.endsWith("examples.mjs")) {
  const { assessments } = readJson(ASSESSMENTS);
  const only = flag("repo")?.toLowerCase();
  const refresh = process.argv.includes("--refresh");
  const store = existsSync(EXAMPLES) ? readJson(EXAMPLES) : { updated: "", entries: {} };
  let done = 0;
  let failed = 0;
  for (const a of assessments) {
    if (only && a.repo.toLowerCase() !== only) continue;
    if (store.entries[a.repo] && !refresh) continue;
    const res = fetchReadme(a.repo);
    if (res.ok) {
      store.entries[a.repo] = { snippets: extractSnippets(res.text) };
      done++;
    } else if (res.gone) {
      store.entries[a.repo] = { snippets: [], note: "sin README" };
      done++;
    } else failed++;
  }
  store.updated = new Date().toISOString().slice(0, 10);
  writeJson(EXAMPLES, store);
  console.log(`examples: ${done} leídos, ${failed} pendientes, ${Object.keys(store.entries).length} en total`);
}
