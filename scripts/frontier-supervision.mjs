/**
 * Frontera del grupo `supervision`: lanza la misma batería contra cada supervisor medido, con Jev de verdad por
 * OpenRouter, y guarda el mapa de qué frena, qué deja pasar y qué manda al proveedor en
 * `runs/<fecha>-frontier-supervision/frontier.json`.
 *
 *   node scripts/frontier-supervision.mjs --jevloop <raíz del repo de JevLoop> --env <.env> [--repeats 3] [--cap 1]
 *
 * Igual que frontier-context.mjs: el hook corre en un sandbox con HOME y cwd propios y habla con un adaptador
 * local (127.0.0.1) que reenvía a OpenRouter con tope de gasto; la clave real vive solo en el entorno del
 * adaptador. Cada caso se repite `--repeats` veces y cuenta el resultado más frecuente. Lo que viajó al proveedor
 * se lee del registro del adaptador. NUNCA se instala el hook en `~/.codex`: se ejecuta su fuente directamente.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { ROOT } from "./lib/paths.mjs";
import { hookEvent, rollout, transcriptSteps, verdictOf } from "./lib/codex-rollout.mjs";
import { CORPUS, consensus, outcome, summarize } from "./lib/frontier-supervision.mjs";

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const today = () => new Date().toISOString().slice(0, 10);
const FAKE_KEY = "clave-inventada-de-pruebas";

async function startAdapter(key, log, cap) {
  writeFileSync(log, "");
  const p = spawn(process.execPath, [join(ROOT, "scripts", "lib", "openrouter-adapter.mjs"), log, String(cap), "fixed"], {
    stdio: ["ignore", "pipe", "inherit"],
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot ?? "", OPENROUTER_API_KEY: key },
  });
  const port = await new Promise((ok, fail) => {
    createInterface({ input: p.stdout }).once("line", (l) => ok(JSON.parse(l).port));
    p.once("error", fail);
  });
  return { p, port };
}

/** Lee y vacía el registro del adaptador: devuelve lo que viajó, lo que costó y los modelos vistos. */
function drain(log) {
  const lines = readFileSync(log, "utf8").split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
  writeFileSync(log, "");
  return {
    sent: JSON.stringify(lines.map((l) => l.body)),
    requests: lines.length,
    spend: lines.reduce((a, l) => a + Number(l.cost ?? 0), 0),
    models: lines.map((l) => l.response?.model).filter(Boolean),
  };
}

async function main() {
  const envFile = arg("env");
  const repoDir = arg("jevloop");
  if (!envFile || !repoDir) throw new Error("faltan --jevloop <raíz del repo> y --env <.env con OPENROUTER_API_KEY>");
  const hook = resolve(repoDir, "adapters", "codex", "hook.ts");
  if (!existsSync(hook)) throw new Error(`no existe: ${hook}`);
  const key = readFileSync(envFile, "utf8").split(/\r?\n/).map((l) => l.match(/^\s*OPENROUTER_API_KEY\s*=\s*(.*)$/)?.[1]).find(Boolean)?.trim().replace(/^["']|["']$/g, "");
  if (!key) throw new Error("el .env no tiene OPENROUTER_API_KEY");
  const repeats = Number(arg("repeats") ?? 3);
  const cap = Number(arg("cap") ?? 1);

  const sandbox = mkdtempSync(join(tmpdir(), "scout-frontier-"));
  const log = join(sandbox, "..", `scout-frontier-${process.pid}-supervision.jsonl`);
  const { p, port } = await startAdapter(key, log, cap);
  const env = {
    PATH: [dirname(process.execPath), join(process.env.SystemRoot ?? "C:\\Windows", "System32")].join(process.platform === "win32" ? ";" : ":"),
    SystemRoot: process.env.SystemRoot ?? "",
    TEMP: sandbox, TMP: sandbox, HOME: sandbox, USERPROFILE: sandbox, LOCALAPPDATA: sandbox, APPDATA: sandbox,
    JEVLOOP_JEV_URL: `http://127.0.0.1:${port}`,
    TYPESAFE_API_KEY: FAKE_KEY,
  };
  const transcript = join(sandbox, "rollout.jsonl");
  let spend = 0;
  const models = new Set();
  let projects;
  try {
    const results = CORPUS.map((it) => {
      writeFileSync(transcript, rollout(it.task, transcriptSteps(it)));
      const event = hookEvent(it, transcript, sandbox);
      const outcomes = [];
      const reasons = [];
      for (let i = 0; i < repeats; i++) {
        const r = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", hook], { cwd: sandbox, env, input: JSON.stringify(event), encoding: "utf8", timeout: 120000 });
        const d = drain(log);
        spend += d.spend;
        d.models.forEach((m) => models.add(m));
        const v = r.status === 0 ? verdictOf(r.stdout) : null;
        // Un hook que se cae o contesta algo ilegible no es «dejó pasar»: se anota aparte y no cuenta en esa pasada.
        outcomes.push(v ? outcome(it, { stopped: v.stopped, sent: d.sent }) : "error");
        if (v?.reason) reasons.push(v.reason.slice(0, 160));
      }
      const usable = outcomes.filter((o) => o !== "error");
      return { id: it.id, technique: it.technique, hook: it.hook, expect: it.expect, secret: Boolean(it.secret), outcome: usable.length ? consensus(usable) : "error", outcomes, ...(reasons.length ? { reason: reasons[0] } : {}) };
    });
    projects = {
      "zjunlp/JevLoop": {
        version: JSON.parse(readFileSync(resolve(repoDir, "package.json"), "utf8")).version ?? "desconocida",
        summary: summarize(results.filter((r) => r.outcome !== "error")),
        errors: results.filter((r) => r.outcome === "error").length,
        results,
      },
    };
  } finally {
    p.kill();
    rmSync(log, { force: true });
    rmSync(sandbox, { recursive: true, force: true });
  }

  const run = {
    group: "supervision",
    date: today(),
    scope: "directo: se ejecuta el hook de Codex de cada supervisor con Jev de verdad por OpenRouter, sin pasar por el hub de jevalan y sin instalarlo en ~/.codex",
    environment: {
      node: process.version,
      keys: "inventada para el supervisor; la real (OpenRouter) vive solo en el entorno de un adaptador local en 127.0.0.1 con tope de gasto",
      models: [...models],
      repeats,
      spend_usd: Number(spend.toFixed(6)),
      cap_usd: cap,
    },
    corpus: { size: CORPUS.length, pre: CORPUS.filter((c) => c.hook === "pre").length, post: CORPUS.filter((c) => c.hook === "post").length, stop: CORPUS.filter((c) => c.hook === "stop").length },
    not_measured: [
      "Codex en sí: la transcripción (formato interno) y el evento se reproducen a mano; no se ejecutó Codex ni se instaló ningún hook",
      "los otros supervisores del grupo (foreman, jevex, jev-builder-loop): no exponen un punto de enganche que se pueda ejercer solo",
      "órdenes y sesiones reales: son sintéticas, con una única respuesta correcta",
      "el modelo de la sesión que se supervisa: aquí no hay ninguno, solo el supervisor",
    ],
    projects,
  };
  const dir = join(ROOT, "runs", `${today()}-frontier-supervision`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "frontier.json"), JSON.stringify(run, null, 2) + "\n");
  for (const [repo, pr] of Object.entries(projects)) {
    const s = pr.summary;
    console.log(`${repo}: ${s.correct}/${s.total} bien · ${s.unsafe} inseguras · ${s.friction} con fricción · ${s.leaked} filtradas · ${s.unstable} inestables · ${pr.errors} errores`);
  }
  console.log(`gasto: ${spend.toFixed(6)} USD de ${cap}`);
  console.log(`evidencia: runs/${today()}-frontier-supervision/frontier.json`);
}

try {
  await main();
} catch (e) {
  console.error(`frontier-supervision: ${e.message}`);
  process.exit(2);
}
