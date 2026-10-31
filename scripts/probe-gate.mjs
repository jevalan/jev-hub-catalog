/**
 * Mide un gate de hook (jev-firewall, reflex) ejecutando su CLI directamente, sin claves.
 *
 *   node scripts/probe-gate.mjs --repo Koushik890/jev-firewall --cli <ruta a dist/cli.js>
 *   node scripts/probe-gate.mjs --repo ursuciprian/reflex      --cli <ruta a scripts/reflex>
 *
 * A diferencia de `probe.mjs`, no pasa por el hub de jevalan: lanza el CLI del especialista con
 * cada caso de su juego en un sandbox (HOME y cwd propios, entorno sin ninguna clave) y guarda la
 * evidencia en `runs/<fecha>-<repo>/`. Lo que mide es el especialista, no el camino del hub, y el
 * run lo declara. No ejecuta `setup`, `install` ni nada que escriba en ~/.claude o ~/.codex.
 * Las rutas llegan por argumento y no se escriben en el run: este repo no lleva rutas de máquina.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { ROOT } from "./lib/paths.mjs";
import { CASES as FIREWALL_CASES, judge, judgeAudit } from "./lib/gate-cases.mjs";
import { REFLEX_CASES } from "./lib/gate-cases-reflex.mjs";
import { SENTINEL_CASES } from "./lib/gate-cases-sentinel.mjs";

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};

const slug = (repo) => repo.toLowerCase().replace(/[^a-z0-9]+/g, "-");
const today = () => new Date().toISOString().slice(0, 10);

/** Lo propio de cada gate: sus casos y lo que su run declara medido y no medido. */
const GATES = {
  "koushik890/jev-firewall": {
    cases: FIREWALL_CASES,
    audit: true,
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
  },
  "harshwasan/jev-sentinel": {
    cases: SENTINEL_CASES,
    audit: false,
    footprint: true,
    // El hook lee su configuración de ~/.jev-sentinel/config.json; HOME del sandbox.
    configPath: join(".jev-sentinel", "config.json"),
    keys: "ninguna real: HOME y cwd propios; unos casos llevan un valor de relleno y un baseUrl a un puerto local cerrado, así que ninguna petición sale de la máquina",
    measured: [
      "sin clave: toda llamada a una herramienta pregunta, incluso la inofensiva y la destructiva; nunca permite",
      "sin clave la regla determinista de rutas protegidas no se aplica: se pregunta antes de mirarlas",
      "con clave y Jev inalcanzable (baseUrl a un puerto local cerrado): la regla determinista deniega los cambios de configuración del anfitrión y del propio hook",
      "con clave y Jev inalcanzable: se pregunta, no se permite",
      "evento ilegible o vacío: sale en silencio con exit 0 (lo que en este protocolo equivale a permitir)",
      "sin clave la salida de las herramientas no se revisa",
      "huella en disco del sandbox",
    ],
    not_measured: [
      "cualquier decisión que dependa de la respuesta de Jev (intención, riesgo, inyección en salidas, respuestas)",
      "coste y latencia con modelo, y el comportamiento ante un plazo agotado real",
      "la extensión de Pi y el hook de Codex: solo se ejerció el contrato de Claude Code",
      "la compilación a `dist/` y el binario `jev-sentinel-hook`: se ejecutó la fuente TypeScript con el Node de la sonda",
      "cómo trata cada anfitrión los valores `ask` y `deny` (no se ejecutó ningún anfitrión)",
    ],
  },
  "ursuciprian/reflex": {
    cases: REFLEX_CASES,
    audit: false,
    footprint: true,
    measured: [
      "decisión por regla determinista con `check` (solo lectura, borrado recursivo, push forzado, producción, terraform)",
      "postura por defecto sin modelo: lo que ninguna regla conoce pregunta, nunca pasa",
      "`scan`: texto limpio pasa (exit 0) e inyección bloquea (exit 2)",
      "hook de Claude Code y de Codex en enforce: permitir es silencio, deniega, pregunta (Codex deniega)",
      "fallar cerrado: evento ilegible o vacío, config.json roto, `command` que no es texto",
      "una config mal tipada o con `mode: off` no desarma el hook instalado en enforce",
      "huella en disco del sandbox",
    ],
    not_measured: [
      "el motor con modelo (`--engine jev|laya`) y cualquier decisión que dependa de él",
      "plazo agotado o error de red del modelo, coste y latencia con modelo",
      "conciencia de entorno (perfil de AWS, contexto de kube, workspace de Terraform, rama) y `terraform show`",
      "política de equipo (`.reflex/policy.json`), fast lane, perfil autónomo y cola humana",
      "los hooks de Hermes, opencode y pi, los de posejecución y la guarda de prompts",
      "`run`, `setup`, `install`, `uninstall` y `doctor`, que ejecutan comandos o tocan la configuración del usuario",
    ],
  },
};

/** Versión del paquete que contiene el CLI (por encima de `dist/` o de `scripts/`). */
function specialistVersion(cli) {
  for (const up of [".", "..", "../.."]) {
    const file = resolve(dirname(cli), up, "package.json");
    if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8")).version ?? "desconocida";
  }
  return "desconocida";
}

const lineCount = (file) => (existsSync(file) ? readFileSync(file, "utf8").split("\n").filter(Boolean).length : 0);

function walk(dir, base = dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p, base) : [relative(base, p).replaceAll("\\", "/")];
  });
}

function main() {
  const repo = arg("repo");
  const cli = arg("cli");
  if (![repo, cli].every(Boolean)) {
    console.error("faltan argumentos: --repo --cli");
    process.exit(2);
  }
  const gate = GATES[repo.toLowerCase()];
  if (!gate) throw new Error(`sin juego de casos para ${repo}: ${Object.keys(GATES).join(", ")}`);
  if (!existsSync(cli)) throw new Error(`no existe: ${cli}`);
  // `hook.mjs` y `gate.mjs` de reflex cuelgan de la raíz del paquete, un nivel por encima de scripts/.
  const pkg = resolve(arg("pkg") ?? dirname(dirname(resolve(cli))));

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
    REFLEX_DATA_DIR: join(sandbox, "reflex-data"),
  };
  const errorsLog = join(baseEnv.REFLEX_DATA_DIR, "health", "errors.jsonl");
  const configFile = join(sandbox, gate.configPath ?? join(".config", "reflex", "config.json"));
  const scrub = (text) => (typeof text === "string" ? text.replaceAll(sandbox, "<sandbox>") : text);

  let results;
  let audit;
  let footprint;
  try {
    results = gate.cases.map((c) => {
      const entry = c.target === "hook" ? [join(pkg, "hook.mjs"), join(pkg, "gate.mjs")] : [resolve(cli)];
      if (c.config !== undefined) {
        mkdirSync(dirname(configFile), { recursive: true });
        writeFileSync(configFile, c.config);
      }
      const before = lineCount(errorsLog);
      const r = spawnSync(process.execPath, [...entry, ...c.args], {
        cwd: sandbox,
        env: { ...baseEnv, ...(c.env ?? {}) },
        input: c.input,
        encoding: "utf8",
        timeout: 30000,
      });
      const errorLogged = lineCount(errorsLog) > before;
      if (c.config !== undefined) rmSync(configFile, { force: true });
      const verdict = judge(c, { status: r.status, stdout: r.stdout ?? "", errorLogged });
      return {
        id: c.id,
        why: c.why,
        pass: verdict.pass,
        problems: verdict.problems,
        exit: r.status,
        observed: verdict.observed && { ...verdict.observed, reason: scrub(verdict.observed.reason) },
      };
    });
    if (gate.audit) {
      const log = join(sandbox, ".jev-firewall", "log.jsonl");
      audit = existsSync(log) ? judgeAudit(readFileSync(log, "utf8")) : { pass: false, problems: ["no se escribió ningún log de auditoría en el sandbox"], entries: 0 };
    }
    if (gate.footprint) footprint = walk(sandbox).sort();
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
      keys: gate.keys ?? "ninguna: entorno vacío, HOME y cwd propios; el especialista no puede llamar a ningún modelo",
    },
    measured: gate.measured,
    not_measured: gate.not_measured,
    ...(audit ? { audit } : {}),
    ...(footprint ? { footprint } : {}),
    cases: results,
    pass: results.every((r) => r.pass) && (audit ? audit.pass : true),
  };
  const dir = join(ROOT, "runs", `${today()}-${slug(repo)}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "run.json"), JSON.stringify(run, null, 2) + "\n");
  console.log(`${run.pass ? "OK" : "FALLA"}: ${results.filter((r) => r.pass).length}/${results.length} casos${audit ? `, auditoría ${audit.pass ? "ok" : "falla"}` : ""}`);
  for (const r of results) console.log(`  ${r.pass ? "✓" : "✗"} ${r.id}${r.observed ? ` → ${r.observed.decision}` : ""}${r.problems.length ? ": " + r.problems.join("; ") : ""}`);
  audit?.problems.forEach((p) => console.log(`  ✗ auditoría: ${p}`));
  console.log(`evidencia: runs/${today()}-${slug(repo)}/run.json`);
  process.exit(run.pass ? 0 : 1);
}

try {
  main();
} catch (e) {
  console.error(`probe-gate: ${e.message}`);
  process.exit(1);
}
