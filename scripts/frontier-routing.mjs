/**
 * Frontera del grupo `routing`: lanza la misma batería de peticiones contra cada enrutador medido, con Jev de
 * verdad por OpenRouter, y guarda el mapa de dónde encamina bien, dónde se equivoca, dónde se abstiene y dónde
 * deja pasar algo que no debía en `runs/<fecha>-frontier-routing/frontier.json`.
 *
 *   node scripts/frontier-routing.mjs --jevrouter <bin/jevrouter.mjs> --jevlayer <bin/jev.mjs> --env <.env> [--repeats 3] [--cap 1]
 *
 * Igual que probe-cli.mjs: cada enrutador corre en un sandbox con HOME y cwd propios y habla con un adaptador
 * local (127.0.0.1) que reenvía a OpenRouter con tope de gasto. La clave real vive solo en el entorno del
 * adaptador; el enrutador recibe una inventada. Las rutas llegan por argumento y no se escriben en el run.
 * Cada petición se repite `--repeats` veces: el resultado es el más frecuente y las pasadas distintas se cuentan.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { ROOT } from "./lib/paths.mjs";
import { CORPUS, consensus, outcome, summarize } from "./lib/frontier-routing.mjs";

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const today = () => new Date().toISOString().slice(0, 10);

/** Cómo se invoca cada enrutador y cómo se lee lo que decidió. `got` = { selected, confirm }. */
const ROUTERS = {
  "BillionsBobby/JevRouter": {
    flag: "jevrouter",
    passModel: false,
    env: (port) => ({ TYPESAFE_API_KEY: "clave-inventada-de-pruebas", JEV_API_URL: `http://127.0.0.1:${port}/v1/systemone`, NO_COLOR: "1" }),
    run: (it) => ({
      args: [
        "route", "--provider", "typesafe", "--request", it.request,
        "--candidates", JSON.stringify(it.capabilities.map((c) => ({ id: c.id, name: c.id, type: "mcp_tool", description: c.description, permissions: c.permissions, risk: { level: c.risk } }))),
        "--actor-permissions", it.actor_permissions.join(","),
      ],
      input: "",
    }),
    read: (stdout) => {
      const j = JSON.parse(stdout);
      return { selected: j.decision?.selected ?? null, confirm: j.status === "needs_confirmation" };
    },
  },
  "typakon4/jev-layer": {
    flag: "jevlayer",
    passModel: true,
    env: (port) => ({ JEV_LAYER_PROVIDER: "openrouter", OPENROUTER_API_KEY: "clave-inventada-de-pruebas", OPENROUTER_DECISIONS_ENDPOINT: `http://127.0.0.1:${port}/api/alpha/decisions`, NO_COLOR: "1" }),
    run: (it) => ({
      args: ["cli"],
      input: JSON.stringify({
        schema_version: 1, harness: "example", intent: it.request, context: { workspace: "frontier" },
        actor_permissions: it.actor_permissions,
        capabilities: it.capabilities.map((c) => ({ id: c.id, kind: "tool", name: c.id, description: c.description, permissions: c.permissions, risk: c.risk })),
      }) + "\n",
    }),
    read: (stdout) => {
      const d = JSON.parse(stdout.split(/\r?\n/).find(Boolean));
      const sel = d.selected ?? null;
      return { selected: sel, confirm: Boolean(sel && d.candidates?.find((c) => c.id === sel)?.requires_confirmation) };
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

async function startAdapter(key, log, cap, passModel) {
  writeFileSync(log, "");
  const p = spawn(process.execPath, [join(ROOT, "scripts", "lib", "openrouter-adapter.mjs"), log, String(cap), passModel ? "passthrough" : "fixed"], {
    stdio: ["ignore", "pipe", "inherit"],
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot ?? "", OPENROUTER_API_KEY: key },
  });
  const port = await new Promise((ok, fail) => {
    createInterface({ input: p.stdout }).once("line", (l) => ok(JSON.parse(l).port));
    p.once("error", fail);
  });
  return { p, port };
}

/** Suma lo que cuesta y los modelos vistos, leyendo el registro del adaptador. */
function ledger(log) {
  let spend = 0;
  let calls = 0;
  const models = new Set();
  for (const l of readFileSync(log, "utf8").split(/\r?\n/).filter(Boolean)) {
    const r = JSON.parse(l);
    spend += Number(r.cost ?? 0);
    calls++;
    if (r.response?.model) models.add(r.response.model);
  }
  return { spend, calls, models: [...models] };
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
  for (const [repo, router] of Object.entries(ROUTERS)) {
    const cli = arg(router.flag);
    if (!cli) continue;
    if (!existsSync(cli)) throw new Error(`no existe: ${cli}`);
    const sandbox = mkdtempSync(join(tmpdir(), "scout-frontier-"));
    const log = join(sandbox, "..", `scout-frontier-${process.pid}-${router.flag}.jsonl`);
    const { p, port } = await startAdapter(key, log, cap, router.passModel);
    const env = {
      PATH: [dirname(process.execPath), join(process.env.SystemRoot ?? "C:\\Windows", "System32")].join(process.platform === "win32" ? ";" : ":"),
      SystemRoot: process.env.SystemRoot ?? "",
      TEMP: sandbox, TMP: sandbox, HOME: sandbox, USERPROFILE: sandbox, LOCALAPPDATA: sandbox, APPDATA: sandbox,
      ...router.env(port),
    };
    try {
      const results = CORPUS.map((it) => {
        const outcomes = [];
        const chose = [];
        for (let i = 0; i < repeats; i++) {
          const { args, input } = router.run(it);
          const r = spawnSync(process.execPath, [resolve(cli), ...args], { cwd: sandbox, env, input, encoding: "utf8", timeout: 60000, maxBuffer: 20e6 });
          let got;
          try {
            got = router.read(r.stdout ?? "");
          } catch {
            got = { selected: null, confirm: false, failed: true };
          }
          outcomes.push(outcome(it, got));
          chose.push(got.failed ? "error" : got.selected ? `${got.selected}${got.confirm ? "?" : ""}` : "none");
        }
        return { id: it.id, technique: it.technique, expect: it.expect, outcome: consensus(outcomes), outcomes, chose };
      });
      const l = ledger(log);
      spend += l.spend;
      l.models.forEach((m) => models.add(m));
      projects[repo] = { version: version(cli), summary: summarize(results), results };
    } finally {
      p.kill();
      rmSync(log, { force: true });
      rmSync(sandbox, { recursive: true, force: true });
    }
  }
  if (!Object.keys(projects).length) throw new Error("ningún enrutador: pasa --jevrouter y/o --jevlayer");

  const run = {
    group: "routing",
    date: today(),
    scope: "directo: se ejecuta el CLI de cada enrutador con Jev de verdad por OpenRouter, sin pasar por el hub de jevalan",
    environment: {
      node: process.version,
      keys: "inventada para el enrutador; la real (OpenRouter) vive solo en el entorno de un adaptador local en 127.0.0.1 con tope de gasto",
      models: [...models],
      repeats,
      spend_usd: Number(spend.toFixed(6)),
      cap_usd: cap,
    },
    corpus: { size: CORPUS.length },
    not_measured: [
      "el servidor HTTP, el MCP y el panel de cada enrutador: solo se ejecuta su CLI de decisión",
      "peticiones reales de un proyecto: son peticiones sintéticas con una sola respuesta correcta",
      "volumen, latencia y coste a escala: cada petición se repite unas pocas veces",
      "el modelo es el que cada enrutador pide (jev-1.13 y jev-1.14), así que parte de la diferencia entre ellos es del modelo",
    ],
    projects,
  };
  const dir = join(ROOT, "runs", `${today()}-frontier-routing`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "frontier.json"), JSON.stringify(run, null, 2) + "\n");
  for (const [repo, p] of Object.entries(projects)) {
    const s = p.summary;
    console.log(`${repo}: ${s.correct}/${s.total} bien · ${s.misroute} desvíos · ${s.abstained} abstenciones · ${s.forced} forzadas · ${s.unsafe} inseguras · ${s.unstable} inestables`);
  }
  console.log(`gasto: ${spend.toFixed(6)} USD de ${cap}`);
  console.log(`evidencia: runs/${today()}-frontier-routing/frontier.json`);
}

try {
  await main();
} catch (e) {
  console.error(`frontier-routing: ${e.message}`);
  process.exit(2);
}
