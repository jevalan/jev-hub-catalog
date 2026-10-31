/**
 * Mide un CLI de línea de comandos (linters, filtros) ejecutándolo directamente, sin claves.
 *
 *   node scripts/probe-cli.mjs --repo suraj-phanindra/wellposed --cli <ruta a wellposed.mjs>
 *
 * Hermano de `probe-gate.mjs` para especialistas que no son hooks. Lanza el CLI con cada caso de
 * su juego en un sandbox (HOME, TEMP y cwd propios, entorno sin ninguna clave) y guarda la
 * evidencia en `runs/<fecha>-<repo>/`. Lo que mide es el especialista, no el camino del hub, y el
 * run lo declara. Las rutas llegan por argumento y no se escriben en el run.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { ROOT } from "./lib/paths.mjs";
import { FIXTURES, judgeCase, wellposedCases } from "./lib/cli-cases-wellposed.mjs";

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const slug = (repo) => repo.toLowerCase().replace(/[^a-z0-9]+/g, "-");
const today = () => new Date().toISOString().slice(0, 10);

/** Lo propio de cada CLI: sus casos, su entorno y lo que su run declara medido y no medido. */
const CLIS = {
  "suraj-phanindra/wellposed": {
    cases: wellposedCases,
    // Apaga el chequeo de actualizaciones (GET a registry.npmjs.org y caché en disco).
    env: { WELLPOSED_NO_UPDATE_CHECK: "1", NO_COLOR: "1" },
    measured: [
      "contrato de salida de `lint`: exit 0 limpio, 1 con errores, 2 uso incorrecto",
      "el JSON de `--json` (ok, counts, findings con regla, severidad y pregunta; files con varios ficheros)",
      "reglas estructurales comprobadas con peticiones propias: ruta rota, sin modelo, campo prohibido, sin vía de escape",
      "`--config` (silenciar una regla, lista `forbidden`), `--max-warnings`, `--quiet`, lectura por stdin",
      "sin clave, `--semantic` no llama a ningún modelo y lo avisa por stderr",
      "recuento de reglas estructurales frente a las 45 que declara el README",
      "huella en disco del sandbox (nada fuera de las peticiones escritas)",
    ],
    not_measured: [
      "las comprobaciones semánticas con modelo (`--semantic` con clave), su coste y su latencia",
      "el chequeo de actualizaciones contra registry.npmjs.org, apagado con WELLPOSED_NO_UPDATE_CHECK",
      "`eval`, que lanza otro proceso del paquete contra su corpus etiquetado",
      "la calidad de cada una de las reglas: solo se ejercitaron cinco",
      "el paquete como skill dentro de Claude Code o Codex",
    ],
  },
};

/** Versión del paquete que contiene el CLI, buscando package.json hacia arriba. */
function specialistVersion(cli) {
  let dir = dirname(resolve(cli));
  for (let i = 0; i < 6; i++, dir = dirname(dir)) {
    const file = join(dir, "package.json");
    if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8")).version ?? "desconocida";
  }
  return "desconocida";
}

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
  const spec = CLIS[repo.toLowerCase()];
  if (!spec) throw new Error(`sin juego de casos para ${repo}: ${Object.keys(CLIS).join(", ")}`);
  if (!existsSync(cli)) throw new Error(`no existe: ${cli}`);
  const version = specialistVersion(cli);

  const sandbox = mkdtempSync(join(tmpdir(), "scout-cli-"));
  // Entorno mínimo a propósito: ninguna clave, y todo lo que el CLI escribe cae dentro del sandbox.
  const env = {
    PATH: [dirname(process.execPath), join(process.env.SystemRoot ?? "C:\\Windows", "System32")].join(process.platform === "win32" ? ";" : ":"),
    SystemRoot: process.env.SystemRoot ?? "",
    TEMP: sandbox,
    TMP: sandbox,
    HOME: sandbox,
    USERPROFILE: sandbox,
    LOCALAPPDATA: sandbox,
    APPDATA: sandbox,
    XDG_CACHE_HOME: join(sandbox, ".cache"),
    ...spec.env,
  };
  for (const [name, text] of Object.entries(FIXTURES)) writeFileSync(join(sandbox, name), text);
  const scrub = (t) => (typeof t === "string" ? t.replaceAll(sandbox, "<sandbox>") : t);

  let results;
  let footprint;
  try {
    results = spec.cases(version).map((c) => {
      const r = spawnSync(process.execPath, [resolve(cli), ...c.args], {
        cwd: sandbox,
        env,
        input: c.stdinFixture ? FIXTURES[c.stdinFixture] : "",
        encoding: "utf8",
        timeout: 30000,
      });
      const res = { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
      try {
        res.json = JSON.parse(res.stdout);
      } catch {
        res.json = null;
      }
      const problems = judgeCase(c, res);
      return {
        id: c.id,
        why: c.why,
        pass: problems.length === 0,
        problems,
        exit: r.status,
        ...(c.observe ? { observed: c.observe(res) } : {}),
        ...(c.id.startsWith("semantic") ? { stderr: scrub(res.stderr.trim()) } : {}),
      };
    });
    footprint = walk(sandbox).sort();
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
  // Cualquier fichero que no sea una petición escrita por nosotros es algo que el CLI dejó en disco.
  const stray = footprint.filter((f) => !(f in FIXTURES));
  const footprintCase = {
    id: "footprint-stays-in-fixtures",
    why: "El CLI no deja nada en disco aparte de las peticiones que le dimos.",
    pass: stray.length === 0,
    problems: stray.map((f) => `fichero inesperado: ${f}`),
  };
  results.push(footprintCase);

  const run = {
    repo,
    date: today(),
    scope: "directo: se ejecuta el CLI del especialista, sin pasar por el hub de jevalan",
    environment: {
      node: process.version,
      specialist: version,
      keys: "ninguna: entorno vacío, HOME y cwd propios; el especialista no puede llamar a ningún modelo",
    },
    measured: spec.measured,
    not_measured: spec.not_measured,
    footprint,
    cases: results,
    pass: results.every((r) => r.pass),
  };
  const dir = join(ROOT, "runs", `${today()}-${slug(repo)}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "run.json"), JSON.stringify(run, null, 2) + "\n");
  console.log(`${run.pass ? "OK" : "FALLA"}: ${results.filter((r) => r.pass).length}/${results.length} casos`);
  for (const r of results) console.log(`  ${r.pass ? "✓" : "✗"} ${r.id}${r.problems.length ? ": " + r.problems.join("; ") : ""}`);
  console.log(`evidencia: runs/${today()}-${slug(repo)}/run.json`);
  process.exit(run.pass ? 0 : 1);
}

try {
  main();
} catch (e) {
  console.error(`probe-cli: ${e.message}`);
  process.exit(1);
}
