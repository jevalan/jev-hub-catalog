/**
 * Frontera de los linters de prosa: lanza la misma batería de textos contra cada linter medido y guarda
 * el mapa de qué defectos atrapa y cuáles deja pasar en `runs/<fecha>-frontier-prose-lint/frontier.json`.
 *
 *   node scripts/frontier-prose-lint.mjs --snifftest <ruta a dist/snifftest.js>
 *
 * Igual que probe-cli.mjs: ejecución directa en un sandbox con HOME y cwd propios, sin claves y con
 * `--dry-run`, así que ninguna petición puede salir. Solo se miden las reglas contables. Las rutas
 * llegan por argumento y no se escriben.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { ROOT } from "./lib/paths.mjs";
import { outcome, summarize } from "./lib/frontier-review.mjs";
import { CORPUS } from "./lib/frontier-prose-lint.mjs";

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const today = () => new Date().toISOString().slice(0, 10);

/** Cómo se lanza cada linter sobre un texto y cómo se leen sus marcas. */
const LINTERS = {
  "DanRWilloughby/snifftest": {
    flag: "snifftest",
    env: { NO_COLOR: "1", SNIFFTEST_CACHE_DIR: "off" },
    args: (hasRules) => ["check", "draft.md", "--dry-run", "--format", "json", ...(hasRules ? ["--rules", "rules.yaml"] : [])],
    // Una marca de regla equivale a un aviso: solo cuenta que la regla saltó.
    findings: (stdout) => {
      try {
        const j = JSON.parse(stdout);
        return Array.isArray(j.flags) ? j.flags.map((f) => ({ rule: f.rule, severity: "warn" })) : null;
      } catch {
        return null;
      }
    },
  },
};

function version(cli) {
  for (const up of [".", "..", "../.."]) {
    const f = resolve(dirname(resolve(cli)), up, "package.json");
    if (existsSync(f)) return JSON.parse(readFileSync(f, "utf8")).version ?? "desconocida";
  }
  return "desconocida";
}

function main() {
  const projects = {};
  for (const [repo, linter] of Object.entries(LINTERS)) {
    const cli = arg(linter.flag);
    if (!cli) continue;
    if (!existsSync(cli)) throw new Error(`no existe: ${cli}`);
    const sandbox = mkdtempSync(join(tmpdir(), "scout-frontier-"));
    const env = {
      PATH: [dirname(process.execPath), join(process.env.SystemRoot ?? "C:\\Windows", "System32")].join(process.platform === "win32" ? ";" : ":"),
      SystemRoot: process.env.SystemRoot ?? "",
      TEMP: sandbox, TMP: sandbox, HOME: sandbox, USERPROFILE: sandbox, LOCALAPPDATA: sandbox, APPDATA: sandbox,
      ...linter.env,
    };
    try {
      const results = CORPUS.map((item) => {
        writeFileSync(join(sandbox, "draft.md"), item.md);
        if (item.rules) writeFileSync(join(sandbox, "rules.yaml"), item.rules);
        const r = spawnSync(process.execPath, [resolve(cli), ...linter.args(Boolean(item.rules))], { cwd: sandbox, env, encoding: "utf8", timeout: 30000, maxBuffer: 20e6 });
        const findings = linter.findings(r.stdout ?? "");
        return {
          id: item.id,
          technique: item.technique,
          truth: item.truth,
          expect: item.expect,
          outcome: outcome(item, findings),
          rules: (findings ?? []).map((f) => f.rule),
        };
      });
      projects[repo] = { version: version(cli), summary: summarize(results), results };
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  }
  if (!Object.keys(projects).length) {
    console.error("faltan argumentos: --snifftest");
    process.exit(2);
  }
  const run = {
    group: "prose-lint",
    date: today(),
    scope: "directo: se ejecuta el CLI de cada linter, sin pasar por el hub de jevalan",
    environment: { node: process.version, keys: "ninguna: entorno vacío, HOME y cwd propios; con `--dry-run` ningún linter puede enviar texto" },
    corpus: { size: CORPUS.length },
    not_measured: [
      "las reglas de juicio con modelo: la frontera es solo la capa contable (expresiones regulares locales)",
      "prosa real de un proyecto: son textos cortos y sintéticos con un único defecto",
      "defectos combinados: cada texto lleva uno solo",
      "idiomas distintos del inglés: la prosa de las reglas y de su lista de vocabulario es inglesa",
    ],
    projects,
  };
  const dir = join(ROOT, "runs", `${today()}-frontier-prose-lint`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "frontier.json"), JSON.stringify(run, null, 2) + "\n");
  for (const [repo, p] of Object.entries(projects)) {
    const s = p.summary;
    console.log(`${repo} ${p.version}: atrapados ${s.caught}/${s.defectTotal}, falsas alarmas ${s.falseAlarms}/${s.cleanTotal}, ilegibles ${s.unreadable}`);
    for (const [t, c] of Object.entries(s.byTechnique)) console.log(`  ${t}: ${c.caught}/${c.defects} atrapados, ${c.falseAlarms}/${c.clean} falsas alarmas`);
    for (const r of p.results.filter((x) => ["missed", "false-alarm", "unreadable"].includes(x.outcome))) console.log(`  ${r.outcome}: ${r.id} (salió ${r.rules.join() || "-"})`);
  }
  console.log(`evidencia: runs/${today()}-frontier-prose-lint/frontier.json`);
}

try {
  main();
} catch (e) {
  console.error(`frontier-prose-lint: ${e.message}`);
  process.exit(1);
}
