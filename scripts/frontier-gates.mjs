/**
 * Frontera del grupo `gates`: lanza la misma batería de órdenes contra cada gate medido y guarda el
 * mapa de dónde aguanta y dónde no en `runs/<fecha>-frontier-gates/frontier.json`.
 *
 *   node scripts/frontier-gates.mjs --firewall <ruta a dist/cli.js> --reflex <ruta a scripts/reflex> --sentinel <ruta a src/hook.ts>
 *
 * Igual que probe-gate.mjs: ejecución directa, sin hub, en un sandbox con HOME y cwd propios y sin
 * ninguna clave. No lanza `setup`, `install` ni `doctor`. Las rutas llegan por argumento y no se escriben.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { ROOT } from "./lib/paths.mjs";
import { bash, observe } from "./lib/gate-cases.mjs";
import { CORPUS, normalize, outcome, summarize } from "./lib/frontier-gates.mjs";

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const today = () => new Date().toISOString().slice(0, 10);

/** Cómo se le pregunta a cada gate por una orden suelta y cómo se lee su respuesta. */
const GATES = {
  "Koushik890/jev-firewall": {
    flag: "firewall",
    invoke: (cli, cmd) => ({ args: [resolve(cli), "check", "claude"], input: bash(cmd) }),
    read: (stdout) => observe("check", stdout),
  },
  "harshwasan/jev-sentinel": {
    flag: "sentinel",
    // Sin clave: es la postura que se compara con los demás gates (todos medidos sin modelo).
    invoke: (cli, cmd) => ({ args: [resolve(cli)], input: JSON.stringify({ hook_event_name: "PreToolUse", session_id: "frontier", cwd: ".", tool_name: "Bash", tool_input: { command: cmd } }) + "\n" }),
    read: (stdout) => observe("sentinel-hook", stdout),
  },
  "ursuciprian/reflex": {
    flag: "reflex",
    invoke: (cli, cmd) => ({ args: [resolve(cli), "check", cmd], input: "" }),
    read: (stdout) => observe("reflex-check", stdout),
  },
};

function version(cli) {
  for (const up of [".", "..", "../.."]) {
    const f = resolve(dirname(resolve(cli)), up, "package.json");
    if (existsSync(f)) return JSON.parse(readFileSync(f, "utf8")).version ?? "desconocida";
  }
  return "desconocida";
}

const shown = (cmd) => (cmd.length > 120 ? `${cmd.slice(0, 40).replace(/\n/g, "\\n")}… (+${cmd.length - 40} caracteres)` : cmd.replace(/\r/g, "\\r").replace(/\n/g, "\\n"));

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
      REFLEX_DATA_DIR: join(sandbox, "reflex-data"),
    };
    try {
      const results = CORPUS.map((item) => {
        const { args, input } = gate.invoke(cli, item.cmd);
        const r = spawnSync(process.execPath, args, { cwd: sandbox, env, input, encoding: "utf8", timeout: 30000, maxBuffer: 20e6 });
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
    console.error("faltan argumentos: --firewall y/o --reflex");
    process.exit(2);
  }
  const run = {
    group: "gates",
    date: today(),
    scope: "directo: se ejecuta el CLI de cada gate, sin pasar por el hub de jevalan",
    environment: { node: process.version, keys: "ninguna: entorno vacío, HOME y cwd propios; ningún gate puede llamar a un modelo" },
    corpus: { size: CORPUS.length },
    not_measured: [
      "cualquier decisión que dependa de un modelo: sin clave, lo desconocido se pregunta o se bloquea por defecto",
      "entornos con contexto (perfil de AWS, rama, kubeconfig, workspace de Terraform)",
      "los hooks de cada anfitrión y la política de equipo",
      "órdenes de Windows (cmd, PowerShell): la batería es de shell POSIX",
    ],
    projects,
  };
  const dir = join(ROOT, "runs", `${today()}-frontier-gates`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "frontier.json"), JSON.stringify(run, null, 2) + "\n");
  for (const [repo, p] of Object.entries(projects)) {
    const s = p.summary;
    console.log(`${repo} ${p.version}: brechas ${s.bypasses}/${s.dangerTotal}, útil ${s.useful}/${s.safeTotal}, fricción ${s.friction}, falsos bloqueos ${s.falseBlocks}, ilegibles ${s.unreadable}`);
  }
  console.log(`evidencia: runs/${today()}-frontier-gates/frontier.json`);
}

try {
  main();
} catch (e) {
  console.error(`frontier-gates: ${e.message}`);
  process.exit(1);
}
