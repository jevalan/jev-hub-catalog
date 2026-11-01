/**
 * Mide una extensión de DuckDB (anofox-decide) en un sandbox, sin claves reales.
 *
 *   node scripts/probe-decide.mjs --python <python de un venv con el wheel oficial de duckdb>
 *
 * Instala la extensión desde el repositorio firmado `community` en un directorio de extensiones propio,
 * la carga en conexiones nuevas (HOME, TEMP y cwd propios, telemetría apagada, proxy muerto salvo para
 * 127.0.0.1) y la ejecuta contra el proveedor simulado de scripts/lib/stub-provider.mjs. Lo que mide es el
 * envoltorio, no ningún modelo. Escribe runs/<fecha>-datazoode-anofox-decide/run.json.
 */
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { createInterface } from "node:readline";
import { ROOT } from "./lib/paths.mjs";
import { decideCases } from "./lib/cli-cases-decide.mjs";

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const REPO = "DataZooDE/anofox-decide";
const KEY = "clave-inventada";
const today = () => new Date().toISOString().slice(0, 10);

function walk(dir, base = dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    return e.isDirectory() ? walk(p, base) : [relative(base, p).replaceAll("\\", "/")];
  });
}

async function main() {
  const python = arg("python");
  if (!python) throw new Error("falta --python <python de un venv con duckdb>");
  const work = mkdtempSync(join(tmpdir(), "decide-work-"));
  const sandbox = mkdtempSync(join(tmpdir(), "decide-sb-"));
  const log = join(work, "stub.jsonl");
  writeFileSync(log, "");
  const stub = spawn(process.execPath, [join(ROOT, "scripts", "lib", "stub-provider.mjs"), log], { stdio: ["ignore", "pipe", "inherit"] });
  let results;
  let version;
  let duckdb;
  try {
    const port = await new Promise((ok) => createInterface({ input: stub.stdout }).once("line", (l) => ok(JSON.parse(l).port)));
    const cases = decideCases();
    const input = join(work, "in.json");
    const output = join(work, "out.json");
    writeFileSync(input, JSON.stringify({
      sandbox, port, log, install: true,
      cases: cases.map(({ id, remote, setup, sql }) => ({ id, remote: !!remote, setup: setup ?? [], sql })),
    }));
    const r = spawnSync(python, ["-I", join(ROOT, "scripts", "lib", "decide-harness.py"), input, output], {
      cwd: work, encoding: "utf8", timeout: 300000,
      env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot },
    });
    if (r.status !== 0) throw new Error(`el arnés falló: ${(r.stderr || r.stdout).slice(0, 400)}`);
    const out = JSON.parse(readFileSync(output, "utf8"));
    duckdb = out.duckdb;
    results = cases.map((c) => {
      const res = out.results.find((x) => x.id === c.id);
      const problems = c.check(res);
      // Regla común a todos los casos: ni un error ni una fila pueden devolver la clave.
      if (JSON.stringify(res).replace(/"auth":"[^"]*"/g, "").includes(KEY)) problems.push("la clave aparece en la salida o en un error");
      if (c.id === "loads-from-community") version = res.rows?.[0]?.[0];
      return {
        id: c.id,
        why: c.why,
        pass: problems.length === 0,
        problems,
        ...(c.observe ? { observed: c.observe(res) } : {}),
      };
    });
    const sandboxFiles = walk(sandbox).sort();
    // Lo único esperado fuera del directorio de extensiones es nada: la carga no escribe caché ni pesos.
    const stray = sandboxFiles.filter((f) => !f.startsWith("ext/"));
    results.push({
      id: "footprint-stays-in-sandbox",
      why: "Instalar y usar la extensión solo escribe su binario en el directorio de extensiones: ni pesos, ni caché, ni configuración.",
      pass: stray.length === 0,
      problems: stray.map((f) => `fichero inesperado: ${f}`),
      observed: { extension_files: sandboxFiles.filter((f) => f.startsWith("ext/")).map((f) => f.replace(/^ext\/[^/]+\/[^/]+\//, "ext/")) },
    });
  } finally {
    stub.kill();
    rmSync(work, { recursive: true, force: true });
    rmSync(sandbox, { recursive: true, force: true });
  }

  const run = {
    repo: REPO,
    date: today(),
    scope: "directo: se carga la extensión en DuckDB y se llama a sus funciones SQL, sin pasar por el hub de jevalan",
    environment: {
      python: "venv propio con el wheel oficial de duckdb",
      duckdb,
      specialist: version,
      keys: "inventada («clave-inventada») válida solo contra un proveedor local en 127.0.0.1; ninguna petición sale de la máquina salvo la instalación desde community y ninguna clave real entra en el entorno. Telemetría apagada con DATAZOO_DISABLE_TELEMETRY=1.",
    },
    measured: [
      "instalación desde el repositorio firmado `community` (sin `-unsigned`) y carga",
      "`decide_doctor()` con la telemetría apagada y el modelo de pega `stub` (constante, no es un modelo)",
      "las llamadas remotas están apagadas por defecto y el error dice qué ejecutar; con el opt-in, una petición por texto",
      "`decide_probability`, `decide_choice`, `decide_choice_distribution` (incluidas 30 opciones), `decide_score`, `decide_decision` y su umbral",
      "`decide_table` (una petición para varias preguntas), el tope `anofox_decide_max_questions` y `decide_answers` (una petición por fila)",
      "NULL, opciones vacías y duplicadas; 500 con reintentos, cuerpo que no es JSON, forma equivocada y probabilidad fuera de rango",
      "la clave (secreto con alcance por host) no viaja a otro host ni se ve en `duckdb_secrets()` ni en `decide_models()`",
      "métricas (exactitud, Brier, AUC, log-loss) contra el cálculo a mano y `decide_fit_calibration`",
      "un modelo local sin bajar no se descarga solo",
      "huella en disco del sandbox",
    ],
    not_measured: [
      "lo que ningún modelo contesta de verdad: el proveedor es un simulador y la respuesta la dicta una marca en el texto",
      "los modelos locales (Julia-1, Laya sobre ONNX Runtime): pesan de 600 a 850 MB y no se descargaron",
      "los proveedores alojados (TypeSafe Jev, Liquid D1, Cloudflare Clef, OpenAI), la GPU y sus plugins",
      "la telemetría con el valor por defecto (encendida): no se ejecutó para no enviar nada; se midió solo apagada",
      "volumen, latencia con un modelo real y concurrencia más allá de 20 filas",
    ],
    footprint: results.find((r) => r.id === "footprint-stays-in-sandbox").observed.extension_files,
    cases: results,
    pass: results.every((r) => r.pass),
  };
  const dir = join(ROOT, "runs", `${today()}-datazoode-anofox-decide`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "run.json"), JSON.stringify(run, null, 2) + "\n");
  console.log(`${run.pass ? "OK" : "FALLA"}: ${results.filter((r) => r.pass).length}/${results.length} casos`);
  for (const r of results) console.log(`  ${r.pass ? "✓" : "✗"} ${r.id}${r.problems.length ? ": " + r.problems.join("; ") : ""}`);
  console.log(`evidencia: runs/${today()}-datazoode-anofox-decide/run.json`);
  process.exit(run.pass ? 0 : 1);
}

try {
  await main();
} catch (e) {
  console.error(`probe-decide: ${e.message}`);
  process.exit(2);
}
