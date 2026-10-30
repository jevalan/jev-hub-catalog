/**
 * Mide un gate de hook (jev-firewall) ejecutando su CLI directamente, sin claves.
 *
 *   node scripts/probe-gate.mjs --repo Koushik890/jev-firewall --cli <ruta a dist/cli.js>
 *
 * A diferencia de `probe.mjs`, no pasa por el hub de jevalan: lanza el CLI del especialista con
 * cada caso de `lib/gate-cases.mjs` en un sandbox (HOME y cwd propios, entorno sin ninguna clave)
 * y guarda la evidencia en `runs/<fecha>-<repo>/`. Lo que mide es el especialista, no el camino del
 * hub, y el run lo declara. No ejecuta `setup` ni `install`, que escriben en ~/.claude y ~/.codex.
 * Las rutas llegan por argumento y no se escriben en el run: este repo no lleva rutas de máquina.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { ROOT } from "./lib/paths.mjs";
import { CASES, judge, judgeAudit } from "./lib/gate-cases.mjs";

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};

const slug = (repo) => repo.toLowerCase().replace(/[^a-z0-9]+/g, "-");
const today = () => new Date().toISOString().slice(0, 10);

/** Versión del paquete que contiene el CLI (`dist/cli.js` está un nivel por debajo de package.json). */
function specialistVersion(cli) {
  for (const up of [".", "..", "../.."]) {
    const file = resolve(dirname(cli), up, "package.json");
    if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8")).version ?? "desconocida";
  }
  return "desconocida";
}

function main() {
  const repo = arg("repo");
  const cli = arg("cli");
  if (![repo, cli].every(Boolean)) {
    console.error("faltan argumentos: --repo --cli");
    process.exit(2);
  }
  if (!existsSync(cli)) throw new Error(`no existe: ${cli}`);

  const sandbox = mkdtempSync(join(tmpdir(), "scout-gate-"));
  // Entorno mínimo a propósito: ninguna clave, y todo lo que el CLI escribe cae dentro del sandbox.
  const baseEnv = {
    PATH: [dirname(process.execPath), join(process.env.SystemRoot ?? "C:\\Windows", "System32")].join(
      process.platform === "win32" ? ";" : ":",
    ),
    SystemRoot: process.env.SystemRoot ?? "",
    TEMP: sandbox,
    TMP: sandbox,
    HOME: sandbox,
    USERPROFILE: sandbox,
    LOCALAPPDATA: sandbox,
    APPDATA: sandbox,
  };
  const scrub = (text) => (typeof text === "string" ? text.replaceAll(sandbox, "<sandbox>") : text);

  let results;
  let audit;
  try {
    results = CASES.map((c) => {
      const r = spawnSync(process.execPath, [resolve(cli), ...c.args], {
        cwd: sandbox,
        env: { ...baseEnv, ...(c.env ?? {}) },
        input: c.input,
        encoding: "utf8",
        timeout: 30000,
      });
      const verdict = judge(c, { status: r.status, stdout: r.stdout ?? "" });
      return {
        id: c.id,
        why: c.why,
        pass: verdict.pass,
        problems: verdict.problems,
        exit: r.status,
        observed: verdict.observed && { ...verdict.observed, reason: scrub(verdict.observed.reason) },
      };
    });
    const log = join(sandbox, ".jev-firewall", "log.jsonl");
    audit = existsSync(log) ? judgeAudit(readFileSync(log, "utf8")) : { pass: false, problems: ["no se escribió ningún log de auditoría en el sandbox"], entries: 0 };
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }

  const run = {
    repo,
    date: today(),
    scope: "directo: se ejecuta el CLI del especialista, sin pasar por el hub de jevalan",
    environment: {
      node: process.version,
      specialist: specialistVersion(cli),
      keys: "ninguna: entorno vacío, HOME y cwd propios; el especialista no puede llamar a ningún modelo",
    },
    measured: [
      "decisión por regla determinista (fichero protegido, payload ofuscado, lista segura)",
      "postura por defecto sin modelo: ask, nunca allow",
      "payload ilegible o vacío: error del proceso en `check`, bloqueo en `hook`",
      "vocabulario de salida de `check`, `hook claude` y `hook codex`, y JEVD_CODEX_ASK=deny",
      "log de auditoría dentro del sandbox",
    ],
    not_measured: [
      "decisiones que dependen del modelo (allow/ask/block con probabilidades y ask_below)",
      "plazo agotado, error de red o respuesta inválida del modelo",
      "coste y latencia con modelo",
      "cómo trata Claude Code el valor `block` que emite el hook (no se ejecutó Claude Code)",
      "`setup`, `install` y `doctor`, que tocan la configuración del usuario o necesitan clave",
    ],
    audit,
    cases: results,
    pass: results.every((r) => r.pass) && audit.pass,
  };
  const dir = join(ROOT, "runs", `${today()}-${slug(repo)}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "run.json"), JSON.stringify(run, null, 2) + "\n");
  console.log(`${run.pass ? "OK" : "FALLA"}: ${results.filter((r) => r.pass).length}/${results.length} casos, auditoría ${audit.pass ? "ok" : "falla"}`);
  for (const r of results) console.log(`  ${r.pass ? "✓" : "✗"} ${r.id}${r.observed ? ` → ${r.observed.decision}` : ""}${r.problems.length ? ": " + r.problems.join("; ") : ""}`);
  audit.problems.forEach((p) => console.log(`  ✗ auditoría: ${p}`));
  console.log(`evidencia: runs/${today()}-${slug(repo)}/run.json`);
  process.exit(run.pass ? 0 : 1);
}

try {
  main();
} catch (e) {
  console.error(`probe-gate: ${e.message}`);
  process.exit(1);
}
