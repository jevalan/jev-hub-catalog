/**
 * Frontera del grupo `review`: lanza la misma batería de peticiones contra cada linter medido y guarda
 * el mapa de qué defectos atrapa y cuáles deja pasar en `runs/<fecha>-frontier-review/frontier.json`.
 *
 *   node scripts/frontier-review.mjs --wellposed <ruta a wellposed.mjs>
 *
 * Igual que probe-cli.mjs: ejecución directa en un sandbox con HOME y cwd propios, sin claves, sin red
 * (se apaga el chequeo de actualizaciones) y sin `--semantic`. Las rutas llegan por argumento y no se escriben.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { ROOT } from "./lib/paths.mjs";
import { CORPUS, outcome, summarize } from "./lib/frontier-review.mjs";

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const today = () => new Date().toISOString().slice(0, 10);

/** Cómo se lanza cada linter sobre una petición y cómo se leen sus hallazgos. */
const LINTERS = {
  "suraj-phanindra/wellposed": {
    flag: "wellposed",
    env: { WELLPOSED_NO_UPDATE_CHECK: "1", NO_COLOR: "1" },
    args: (hasConfig) => ["lint", "req.json", ...(hasConfig ? ["--config", "cfg.json"] : []), "--json"],
    findings: (stdout) => {
      try {
        const j = JSON.parse(stdout);
        return Array.isArray(j.findings) ? j.findings : null;
      } catch {
        return null;
      }
    },
  },
};

function version(cli) {
  for (const up of [".", "..", "../..", "../../.."]) {
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
        writeFileSync(join(sandbox, "req.json"), JSON.stringify(item.request));
        if (item.config) writeFileSync(join(sandbox, "cfg.json"), JSON.stringify(item.config));
        const r = spawnSync(process.execPath, [resolve(cli), ...linter.args(Boolean(item.config))], { cwd: sandbox, env, encoding: "utf8", timeout: 30000, maxBuffer: 20e6 });
        const findings = linter.findings(r.stdout ?? "");
        return {
          id: item.id,
          technique: item.technique,
          truth: item.truth,
          expect: item.expect,
          outcome: outcome(item, findings),
          // Solo avisos y errores: es lo que decide el resultado y lo que se publica.
          rules: (findings ?? []).filter((f) => f.severity !== "info").map((f) => f.rule),
        };
      });
      projects[repo] = { version: version(cli), summary: summarize(results), results };
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  }
  if (!Object.keys(projects).length) {
    console.error("faltan argumentos: --wellposed");
    process.exit(2);
  }
  const run = {
    group: "review",
    date: today(),
    scope: "directo: se ejecuta el CLI de cada linter, sin pasar por el hub de jevalan",
    environment: { node: process.version, keys: "ninguna: entorno vacío, HOME y cwd propios; sin `--semantic`, ningún linter llama a un modelo" },
    corpus: { size: CORPUS.length },
    not_measured: [
      "las comprobaciones semánticas con modelo (`--semantic` con clave): la frontera es solo la capa estructural",
      "peticiones reales de un proyecto: son peticiones sintéticas con un único defecto inyectado",
      "defectos combinados: cada petición lleva uno solo",
      "secretos en los valores del estado: `forbidden` mira nombres de campo, no el contenido",
    ],
    projects,
  };
  const dir = join(ROOT, "runs", `${today()}-frontier-review`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "frontier.json"), JSON.stringify(run, null, 2) + "\n");
  for (const [repo, p] of Object.entries(projects)) {
    const s = p.summary;
    console.log(`${repo} ${p.version}: atrapados ${s.caught}/${s.defectTotal}, falsas alarmas ${s.falseAlarms}/${s.cleanTotal}, ilegibles ${s.unreadable}`);
    for (const [t, c] of Object.entries(s.byTechnique)) console.log(`  ${t}: ${c.caught}/${c.defects} atrapados, ${c.falseAlarms}/${c.clean} falsas alarmas`);
  }
  console.log(`evidencia: runs/${today()}-frontier-review/frontier.json`);
}

try {
  main();
} catch (e) {
  console.error(`frontier-review: ${e.message}`);
  process.exit(1);
}
