/**
 * Frontera del grupo `context`: lanza la misma batería contra cada herramienta de poda o compactación de contexto,
 * con Jev de verdad por OpenRouter, y guarda el mapa de qué conservan, qué pierden y qué dejan salir hacia el
 * proveedor en `runs/<fecha>-frontier-context/frontier.json`.
 *
 *   node scripts/frontier-context.mjs --jevprune <dist/cli.js> --fastjev <dist/index.js> --env <.env> [--repeats 3] [--cap 1]
 *
 * Igual que frontier-routing.mjs: cada herramienta corre en un sandbox con HOME y cwd propios y habla con un
 * adaptador local (127.0.0.1) que reenvía a OpenRouter con tope de gasto; la clave real vive solo en el entorno
 * del adaptador. Cada caso se repite `--repeats` veces y cuenta el resultado más frecuente. Lo que viajó al
 * proveedor se lee del registro del adaptador, que es lo único que ve «lo que sale de la máquina».
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { ROOT } from "./lib/paths.mjs";
import { conversation } from "./lib/cli-cases-fastjev.mjs";
import { CORPUS, consensus, outcome, rankedFirst, summarize } from "./lib/frontier-context.mjs";

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const today = () => new Date().toISOString().slice(0, 10);
const FAKE_KEY = "clave-inventada-de-pruebas";

/** Cómo se ejerce cada herramienta y cómo se lee lo que conservó. `got.kept` es una lista por unidad (línea o llamada). */
const TOOLS = {
  "ibrahemid/jevprune": {
    flag: "jevprune",
    shape: "log",
    env: (port) => ({ TYPESAFE_API_KEY: FAKE_KEY, TYPESAFE_BASE_URL: `http://127.0.0.1:${port}`, NO_COLOR: "1" }),
    launch: (cli) => ({ command: process.execPath, prefix: [resolve(cli)] }),
    run: (it, sandbox) => {
      writeFileSync(join(sandbox, "in.log"), it.lines.join("\n") + "\n");
      return { args: ["select", "--task", it.task, "--command", "npm test", "--file", "in.log"], input: "" };
    },
    read: (it, r) => {
      const seen = new Set(r.stdout.split(/\r?\n/));
      return { kept: it.lines.map((l) => seen.has(l)) };
    },
  },
  "tamaratran/fast-jev-compaction": {
    flag: "fastjev",
    shape: "conversation",
    env: (port, cli) => ({ FJC_DIST: resolve(cli), FJC_BASE_URL: `http://127.0.0.1:${port}/v1/systemone`, TYPESAFE_API_KEY: FAKE_KEY }),
    launch: () => ({ command: process.execPath, prefix: [join(ROOT, "scripts", "lib", "compaction-driver.mjs")] }),
    run: (it) => ({
      args: [],
      // Ocho mensajes de relleno al final: ninguna llamada queda fijada y todas se pueden descartar.
      input: JSON.stringify({ messages: conversation(it.goal, it.steps, 8), options: { goal: it.goal } }),
    }),
    read: (it, r) => {
      const decisions = JSON.parse(r.stdout).decisions;
      const at = (i) => decisions.find((d) => d.id === `t${i + 1}`);
      return {
        kept: it.steps.map((_, i) => at(i)?.action === "keep"),
        scores: Object.fromEntries(it.steps.map((_, i) => [i, [at(i)?.keepCall ?? 0, at(i)?.keepResult ?? 0]])),
      };
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
    spend: lines.reduce((a, l) => a + Number(l.cost ?? 0), 0),
    models: lines.map((l) => l.response?.model).filter(Boolean),
  };
}

async function main() {
  const envFile = arg("env");
  if (!envFile) throw new Error("falta --env <.env con OPENROUTER_API_KEY>");
  const key = readFileSync(envFile, "utf8").split(/\r?\n/).map((l) => l.match(/^\s*OPENROUTER_API_KEY\s*=\s*(.*)$/)?.[1]).find(Boolean)?.trim().replace(/^["']|["']$/g, "");
  if (!key) throw new Error("el .env no tiene OPENROUTER_API_KEY");
  const repeats = Number(arg("repeats") ?? 3);
  const cap = Number(arg("cap") ?? 1);

  const projects = {};
  let spend = 0;
  const models = new Set();
  for (const [repo, tool] of Object.entries(TOOLS)) {
    const cli = arg(tool.flag);
    if (!cli) continue;
    if (!existsSync(cli)) throw new Error(`no existe: ${cli}`);
    const sandbox = mkdtempSync(join(tmpdir(), "scout-frontier-"));
    const log = join(sandbox, "..", `scout-frontier-${process.pid}-${tool.flag}.jsonl`);
    const { p, port } = await startAdapter(key, log, cap);
    const env = {
      PATH: [dirname(process.execPath), join(process.env.SystemRoot ?? "C:\\Windows", "System32")].join(process.platform === "win32" ? ";" : ":"),
      SystemRoot: process.env.SystemRoot ?? "",
      TEMP: sandbox, TMP: sandbox, HOME: sandbox, USERPROFILE: sandbox, LOCALAPPDATA: sandbox, APPDATA: sandbox,
      ...tool.env(port, cli),
    };
    const { command, prefix } = tool.launch(cli);
    try {
      const results = CORPUS.filter((it) => it.shape === tool.shape).map((it) => {
        const outcomes = [];
        const ranks = [];
        for (let i = 0; i < repeats; i++) {
          const { args, input } = tool.run(it, sandbox);
          const r = spawnSync(command, [...prefix, ...args], { cwd: sandbox, env, input, encoding: "utf8", timeout: 120000, maxBuffer: 50e6 });
          const d = drain(log);
          spend += d.spend;
          d.models.forEach((m) => models.add(m));
          let kept;
          try {
            const got = tool.read(it, r);
            kept = got.kept;
            if (got.scores && !it.secret) ranks.push(rankedFirst(it, got.scores));
          } catch {
            kept = null;
          }
          // Un fallo del propio programa no es «conservó todo»: se anota aparte y cuenta como no medido en esa pasada.
          outcomes.push(kept ? outcome(it, { kept, sent: d.sent }) : "error");
        }
        const usable = outcomes.filter((o) => o !== "error");
        return { id: it.id, technique: it.technique, needles: it.needles.length, secret: Boolean(it.secret), outcome: usable.length ? consensus(usable) : "error", outcomes, ...(ranks.length ? { ranked: ranks.every(Boolean) } : {}) };
      });
      projects[repo] = { version: version(cli), summary: summarize(results.filter((r) => r.outcome !== "error")), errors: results.filter((r) => r.outcome === "error").length, results };
    } finally {
      p.kill();
      rmSync(log, { force: true });
      rmSync(sandbox, { recursive: true, force: true });
    }
  }
  if (!Object.keys(projects).length) throw new Error("ninguna herramienta: pasa --jevprune y/o --fastjev");

  const run = {
    group: "context",
    date: today(),
    scope: "directo: se ejecuta cada herramienta con Jev de verdad por OpenRouter, sin pasar por el hub de jevalan",
    environment: {
      node: process.version,
      keys: "inventada para la herramienta; la real (OpenRouter) vive solo en el entorno de un adaptador local en 127.0.0.1 con tope de gasto",
      models: [...models],
      repeats,
      spend_usd: Number(spend.toFixed(6)),
      cap_usd: cap,
    },
    corpus: { size: CORPUS.length, log: CORPUS.filter((c) => c.shape === "log").length, conversation: CORPUS.filter((c) => c.shape === "conversation").length },
    not_measured: [
      "los plugins de Claude Code y sus hooks: solo se ejecuta el CLI de jevprune y la librería de fast-jev-compaction (por nuestro conductor)",
      "registros y conversaciones reales: son sintéticos, con una única respuesta necesaria",
      "el 60 % de ruido que marca «sin podar» es una convención de esta batería, no una medida de ninguno de los proyectos",
      "las dos herramientas no reciben lo mismo (registros de comandos frente a conversaciones): la comparación es por técnica, no una tabla de posiciones",
    ],
    projects,
  };
  const dir = join(ROOT, "runs", `${today()}-frontier-context`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "frontier.json"), JSON.stringify(run, null, 2) + "\n");
  for (const [repo, p] of Object.entries(projects)) {
    const s = p.summary;
    console.log(`${repo}: ${s.correct}/${s.total} bien · ${s.bloated} sin podar · ${s.lost} con pérdida · ${s.leaked} filtradas · ${s.unstable} inestables · ${p.errors} errores`);
  }
  console.log(`gasto: ${spend.toFixed(6)} USD de ${cap}`);
  console.log(`evidencia: runs/${today()}-frontier-context/frontier.json`);
}

try {
  await main();
} catch (e) {
  console.error(`frontier-context: ${e.message}`);
  process.exit(2);
}
