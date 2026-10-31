/**
 * Frontera del alcance del emparejador de los linters de lenguaje natural: lanza el mismo conjunto de
 * fragmentos de código contra cada linter medido (con `--dry-run`, sin clave) y guarda qué reglas
 * seleccionan cada fragmento en `runs/<fecha>-frontier-code-reach/frontier.json`.
 *
 *   node scripts/frontier-code-reach.mjs --jev-lint <ruta a dist/cli.js, con ast-grep ya enlazado>
 *
 * Igual que probe-cli.mjs: ejecución directa en un sandbox con HOME y cwd propios, sin claves y sin
 * `--config`. Con `--dry-run` ninguna petición puede salir. Las rutas llegan por argumento y no se escriben.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { ROOT } from "./lib/paths.mjs";
import { outcome, summarize } from "./lib/frontier-review.mjs";
import { CORPUS } from "./lib/frontier-code-reach.mjs";

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const today = () => new Date().toISOString().slice(0, 10);

/** Cómo se lanza cada linter sobre un fichero y qué reglas declaran sujetos. */
const LINTERS = {
  "mizchi/jev-lint": {
    flag: "jev-lint",
    env: { NO_COLOR: "1" },
    args: (file) => ["check", file, "--dry-run", "--format", "json", "--no-config"],
    // `byRule` lista todas las reglas cargadas; solo cuentan las que seleccionaron algún sujeto.
    reached: (stdout) => {
      try {
        const j = JSON.parse(stdout);
        return Array.isArray(j.byRule) ? j.byRule.filter((r) => r.subjects > 0).map((r) => r.rule) : null;
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
        writeFileSync(join(sandbox, item.file), item.code);
        const r = spawnSync(process.execPath, [resolve(cli), ...linter.args(item.file)], { cwd: sandbox, env, encoding: "utf8", timeout: 60000, maxBuffer: 20e6 });
        rmSync(join(sandbox, item.file), { force: true });
        const reached = linter.reached(r.stdout ?? "");
        // En un fragmento sano solo importan las reglas que no debían elegirlo.
        const findings = reached === null ? null : (item.truth === "defect" ? reached : reached.filter((x) => item.forbid.includes(x))).map((rule) => ({ rule, severity: "warn" }));
        return {
          id: item.id,
          technique: item.technique,
          truth: item.truth,
          expect: item.expect,
          outcome: outcome(item, findings),
          rules: reached ?? [],
        };
      });
      projects[repo] = { version: version(cli), summary: summarize(results), results };
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  }
  if (!Object.keys(projects).length) {
    console.error("faltan argumentos: --jev-lint");
    process.exit(2);
  }
  const run = {
    group: "code-reach",
    date: today(),
    scope: "directo: se ejecuta el CLI de cada linter con --dry-run, sin pasar por el hub de jevalan",
    environment: { node: process.version, keys: "ninguna: entorno vacío, HOME y cwd propios; con `--dry-run` ningún linter puede enviar código" },
    corpus: { size: CORPUS.length },
    not_measured: [
      "si el modelo acierta sobre lo que se le pregunta: sin clave no hay modelo, solo se mide qué código se enviaría",
      "código real de un proyecto: son fragmentos cortos y sintéticos con una sola construcción",
      "lenguajes que no sean TypeScript, JavaScript, Python, Go, Rust y shell",
      "las reglas de git (commits, diffs) y las de markdown",
    ],
    projects,
  };
  const dir = join(ROOT, "runs", `${today()}-frontier-code-reach`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "frontier.json"), JSON.stringify(run, null, 2) + "\n");
  for (const [repo, p] of Object.entries(projects)) {
    const s = p.summary;
    console.log(`${repo} ${p.version}: alcanzados ${s.caught}/${s.defectTotal}, falsas alarmas ${s.falseAlarms}/${s.cleanTotal}, ilegibles ${s.unreadable}`);
    for (const [t, c] of Object.entries(s.byTechnique)) console.log(`  ${t}: ${c.caught}/${c.defects} alcanzados, ${c.falseAlarms}/${c.clean} falsas alarmas`);
    for (const r of p.results.filter((x) => ["missed", "false-alarm", "unreadable"].includes(x.outcome))) console.log(`  ${r.outcome}: ${r.id} (reglas ${r.rules.join() || "-"})`);
  }
  console.log(`evidencia: runs/${today()}-frontier-code-reach/frontier.json`);
}

try {
  main();
} catch (e) {
  console.error(`frontier-code-reach: ${e.message}`);
  process.exit(1);
}
