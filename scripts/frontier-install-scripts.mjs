/**
 * Frontera de las puertas de instalación de paquetes npm: lanza la misma batería de scripts de ciclo de
 * vida contra cada puerta medida y guarda el mapa de dónde aguanta en
 * `runs/<fecha>-frontier-install-scripts/frontier.json`.
 *
 *   node scripts/frontier-install-scripts.mjs --pkg-gate <ruta a bin/cli.js, con su SDK al lado>
 *
 * Igual que probe-cli.mjs: ejecución directa en un sandbox con HOME y cwd propios, sin claves y sin red
 * (solo manifiestos locales: un nombre de paquete haría consultar el registro de npm). Los scripts son
 * texto sintético dentro de un manifiesto y nunca se ejecutan. Las rutas llegan por argumento y no se escriben.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { ROOT } from "./lib/paths.mjs";
import { normalize, outcome, summarize } from "./lib/frontier-gates.mjs";
import { CORPUS } from "./lib/frontier-install-scripts.mjs";

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const today = () => new Date().toISOString().slice(0, 10);

/** Cómo se le pregunta a cada puerta por un script y cómo se lee su respuesta. */
const GATES = {
  "hemanth/pkg-gate": {
    flag: "pkg-gate",
    env: { NO_COLOR: "1" },
    invoke: (cli) => ({ args: [resolve(cli), "./m.json", "--json"] }),
    read: (stdout) => {
      try {
        const v = JSON.parse(stdout);
        return v?.verdict?.action ? { decision: v.verdict.action, reason: (v.policy?.reasons ?? [])[0] ?? null } : null;
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

const shown = (cmd) => (cmd.length > 120 ? `${cmd.slice(0, 40)}… (+${cmd.length - 40} caracteres)` : cmd);

function main() {
  const projects = {};
  for (const [repo, gate] of Object.entries(GATES)) {
    const cli = arg(gate.flag);
    if (!cli) continue;
    if (!existsSync(cli)) throw new Error(`no existe: ${cli}`);
    const sandbox = mkdtempSync(join(tmpdir(), "scout-frontier-"));
    const env = {
      PATH: [dirname(process.execPath), join(process.env.SystemRoot ?? "C:\\Windows", "System32")].join(process.platform === "win32" ? ";" : ":"),
      SystemRoot: process.env.SystemRoot ?? "",
      TEMP: sandbox, TMP: sandbox, HOME: sandbox, USERPROFILE: sandbox, LOCALAPPDATA: sandbox, APPDATA: sandbox,
      ...gate.env,
    };
    try {
      const results = CORPUS.map((item) => {
        writeFileSync(join(sandbox, "m.json"), JSON.stringify({ name: "fixture-pkg", version: "1.0.0", description: "fixture", scripts: { postinstall: item.cmd } }));
        const { args } = gate.invoke(cli);
        const r = spawnSync(process.execPath, args, { cwd: sandbox, env, encoding: "utf8", timeout: 30000, maxBuffer: 20e6 });
        const seen = gate.read(r.stdout ?? "");
        const decision = seen ? normalize(seen.decision) : null;
        return {
          id: item.id,
          technique: item.technique,
          truth: item.truth,
          cmd: shown(item.cmd),
          raw: seen?.decision ?? null,
          decision,
          outcome: outcome(item.truth, decision),
          reason: seen?.reason ? String(seen.reason).replaceAll(sandbox, "<sandbox>").slice(0, 160) : null,
        };
      });
      projects[repo] = { version: version(cli), summary: summarize(results), results };
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  }
  if (!Object.keys(projects).length) {
    console.error("faltan argumentos: --pkg-gate");
    process.exit(2);
  }
  const run = {
    group: "install-scripts",
    date: today(),
    scope: "directo: se ejecuta el CLI de cada puerta, sin pasar por el hub de jevalan",
    environment: { node: process.version, keys: "ninguna: entorno vacío, HOME y cwd propios; ninguna puerta puede llamar a un modelo" },
    corpus: { size: CORPUS.length },
    not_measured: [
      "cualquier decisión que dependa de un modelo: sin clave, estas puertas usan su motor local",
      "paquetes reales: son scripts sintéticos de una sola línea dentro de un manifiesto",
      "el código del paquete: solo se juzgan los scripts de ciclo de vida, no lo que un `require` ejecute después",
      "resolver un nombre de paquete contra el registro de npm",
    ],
    projects,
  };
  const dir = join(ROOT, "runs", `${today()}-frontier-install-scripts`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "frontier.json"), JSON.stringify(run, null, 2) + "\n");
  for (const [repo, p] of Object.entries(projects)) {
    const s = p.summary;
    console.log(`${repo} ${p.version}: brechas ${s.bypasses}/${s.dangerTotal}, bloqueadas ${s.blocked}, avisadas ${s.asked}, útil ${s.useful}/${s.safeTotal}, fricción ${s.friction}, falsos bloqueos ${s.falseBlocks}, ilegibles ${s.unreadable}`);
    for (const [t, c] of Object.entries(s.dangerByTechnique)) console.log(`  ${t}: bloquea ${c.block ?? 0}, avisa ${c.ask ?? 0}, permite ${c.allow ?? 0}`);
    for (const r of p.results.filter((x) => x.outcome === "bypass" || x.outcome === "false-block" || x.outcome === "friction")) console.log(`  ${r.outcome}: ${r.id}`);
  }
  console.log(`evidencia: runs/${today()}-frontier-install-scripts/frontier.json`);
}

try {
  main();
} catch (e) {
  console.error(`frontier-install-scripts: ${e.message}`);
  process.exit(1);
}
