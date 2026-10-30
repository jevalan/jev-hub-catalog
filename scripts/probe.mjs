/**
 * Mide un especialista `exec` servido por el hub de jevalan, de punta a punta y sin claves.
 *
 *   node scripts/probe.mjs --repo RiskAverseTech/toolgate --capability tool.risk \
 *     --jevalan <binario jevalan> --capabilities <dir de capacidades de jevalan> --cli <cli del especialista>
 *
 * Arranca un `jevalan serve` propio en un sandbox (puerto libre, directorio de datos propio, cwd propio,
 * entorno sin ninguna clave), lanza los casos de `lib/probe-cases.mjs` y guarda la evidencia en
 * `runs/<fecha>-<repo>/`. Solo mata el proceso que él mismo lanzó. No toca ningún daemon ni fichero del usuario.
 * Las rutas llegan por argumento y no se escriben en el run: este repo no lleva rutas de máquina.
 */
import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { ROOT } from "./lib/paths.mjs";
import { CASES, judge, judgeDiscovery } from "./lib/probe-cases.mjs";

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};

const freePort = () =>
  new Promise((ok, fail) => {
    const s = createServer();
    s.once("error", fail);
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => ok(port));
    });
  });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const slug = (repo) => repo.toLowerCase().replace(/[^a-z0-9]+/g, "-");
const today = () => new Date().toISOString().slice(0, 10);

async function waitUp(base) {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${base}/v1/hub/capabilities`)).ok) return;
    } catch {
      /* todavía no escucha */
    }
    await sleep(150);
  }
  throw new Error("el daemon del sandbox no llegó a escuchar");
}

async function main() {
  const repo = arg("repo");
  const capability = arg("capability");
  const jevalan = arg("jevalan") ?? process.env.JEVALAN_BIN;
  const capsSrc = arg("capabilities");
  const cli = arg("cli");
  if (![repo, capability, jevalan, capsSrc, cli].every(Boolean)) {
    console.error("faltan argumentos: --repo --capability --jevalan --capabilities --cli");
    process.exit(2);
  }
  for (const p of [jevalan, capsSrc, cli]) if (!existsSync(p)) throw new Error(`no existe: ${p}`);

  const sandbox = mkdtempSync(join(tmpdir(), "scout-probe-"));
  const caps = join(sandbox, "capabilities");
  cpSync(capsSrc, caps, { recursive: true });
  for (const d of ["flows", "signals"]) mkdirSync(join(sandbox, d));
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  writeFileSync(
    join(sandbox, "config.yaml"),
    [
      `server: { addr: "127.0.0.1:${port}" }`,
      "backends:",
      '  ollama: { url: "http://127.0.0.1:9", timeout_ms: 500 }',
      "default_backend: ollama",
      `flows_dir: ${join(sandbox, "flows").replaceAll("\\", "/")}`,
      "hub:",
      `  capabilities_dir: ${caps.replaceAll("\\", "/")}`,
      `  signals_dir: ${join(sandbox, "signals").replaceAll("\\", "/")}`,
      "  allow_exec: true",
      "",
    ].join("\n"),
  );

  // Entorno mínimo a propósito: ninguna clave, y todo lo que el daemon escribe cae dentro del sandbox.
  const env = {
    PATH: [dirname(process.execPath), join(process.env.SystemRoot ?? "C:\\Windows", "System32")].join(
      process.platform === "win32" ? ";" : ":",
    ),
    SystemRoot: process.env.SystemRoot ?? "",
    TEMP: sandbox,
    TMP: sandbox,
    LOCALAPPDATA: sandbox,
    HOME: sandbox,
    USERPROFILE: sandbox,
    TOOLGATE_CLI: resolve(cli),
  };
  const daemon = spawn(jevalan, ["serve", "--config", join(sandbox, "config.yaml")], {
    cwd: sandbox,
    env,
    stdio: "ignore",
  });
  const results = [];
  let discovery;
  try {
    await waitUp(base);
    const leaks = [resolve(cli), basename(cli), "TOOLGATE_CLI", '"command"'];
    for (const c of CASES(capability)) {
      const res = await fetch(`${base}/v1/hub`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(c.request),
      });
      const reply = await res.json();
      results.push({ id: c.id, why: c.why, request: c.request, reply, ...judge(c, reply, leaks) });
    }
    const listing = await (await fetch(`${base}/v1/hub/capabilities`)).text();
    const wellKnown = await (await fetch(`${base}/.well-known/jev-hub.json`)).text();
    discovery = judgeDiscovery(listing, wellKnown, leaks);
  } finally {
    daemon.kill();
    await sleep(300);
    rmSync(sandbox, { recursive: true, force: true });
  }

  const version = (cmd, args) => {
    const r = spawnSync(cmd, args, { encoding: "utf8", env });
    return (r.stdout || r.stderr || "").trim().split("\n")[0] || "desconocida";
  };
  const run = {
    repo,
    capability,
    date: today(),
    environment: {
      node: process.version,
      jevalan: version(jevalan, ["--version"]),
      specialist: specialistVersion(cli),
      keys: "ninguna: entorno vacío, el especialista no puede llamar a ningún modelo",
    },
    measured: ["decisión por regla estática", "modo de fallo traducido a error", "validación de entrada y versión", "descubrimiento y digest"],
    not_measured: ["decisiones que dependen del modelo (allow/ask con probabilidades)", "plazo agotado", "coste y latencia con modelo"],
    discovery,
    cases: results.map(({ id, why, pass, problems, reply }) => ({ id, why, pass, problems, reply: scrub(reply) })),
    pass: results.every((r) => r.pass) && discovery.pass,
  };
  const dir = join(ROOT, "runs", `${today()}-${slug(repo)}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "run.json"), JSON.stringify(run, null, 2) + "\n");
  console.log(`${run.pass ? "OK" : "FALLA"}: ${results.filter((r) => r.pass).length}/${results.length} casos, descubrimiento ${discovery.pass ? "ok" : "falla"}`);
  for (const r of results) console.log(`  ${r.pass ? "✓" : "✗"} ${r.id}${r.problems.length ? ": " + r.problems.join("; ") : ""}`);
  if (!discovery.pass) discovery.problems.forEach((p) => console.log(`  ✗ descubrimiento: ${p}`));
  console.log(`evidencia: runs/${today()}-${slug(repo)}/run.json`);
  process.exit(run.pass ? 0 : 1);
}

/** Versión del paquete que contiene el CLI: el CLI no tiene `--version` y lo tomaría por la entrada de un hook. */
function specialistVersion(cli) {
  for (const up of ["..", "../.."]) {
    const file = resolve(dirname(cli), up, "package.json");
    if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8")).version ?? "desconocida";
  }
  return "desconocida";
}

/** Lo único que varía entre ejecuciones y no aporta: la duración y el proveedor ya vienen estables. */
function scrub(reply) {
  const { duration_ms, ...rest } = reply ?? {};
  return rest;
}

main().catch((e) => {
  console.error(`probe: ${e.message}`);
  process.exit(1);
});
