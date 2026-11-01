/**
 * Mide el hook de Codex de JevLoop en un sandbox, contra un proveedor SIMULADO en 127.0.0.1 (nunca Jev).
 *
 *   node scripts/probe-loop.mjs --repo zjunlp/JevLoop --dir <raíz del repo de JevLoop>
 *
 * Se ejecuta la fuente TypeScript del hook con `node --experimental-strip-types`; NO se instala nada en ~/.codex ni
 * se ejecuta Codex. HOME, USERPROFILE y cwd son del sandbox y la clave es inventada. Lo que se mide es el cableado
 * (umbrales, fallo cerrado, lectura de la transcripción, qué viaja al proveedor), no la calidad de ningún juicio:
 * eso lo hace `frontier-supervision.mjs` con Jev de verdad.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { ROOT } from "./lib/paths.mjs";
import { hookEvent, rollout, transcriptSteps, verdictOf } from "./lib/codex-rollout.mjs";
import { CASES } from "./lib/cli-cases-jevloop.mjs";

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const slug = (repo) => repo.toLowerCase().replace(/[^a-z0-9]+/g, "-");
const today = () => new Date().toISOString().slice(0, 10);
const lineCount = (file) => (existsSync(file) ? readFileSync(file, "utf8").split("\n").filter(Boolean).length : 0);

function walk(dir, base = dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name), base) : [join(dir, e.name).slice(base.length + 1).replaceAll("\\", "/")]));
}

/** Compara lo observado con lo esperado; devuelve los problemas (vacío = pasa). */
function judge(expect, seen) {
  const problems = [];
  const want = (cond, msg) => cond || problems.push(msg);
  if (expect.exit !== undefined) want(seen.exit === expect.exit, `salida ${seen.exit}, se esperaba ${expect.exit}`);
  if (expect.stopped !== undefined) want(seen.verdict?.stopped === expect.stopped, `${seen.verdict ? (seen.verdict.stopped ? "frenó" : "dejó pasar") : "salida ilegible"}, se esperaba ${expect.stopped ? "frenar" : "dejar pasar"}`);
  if (expect.kind !== undefined) want(seen.verdict?.kind === expect.kind, `tipo ${seen.verdict?.kind}, se esperaba ${expect.kind}`);
  if (expect.requests !== undefined) want(seen.requests === expect.requests, `${seen.requests} peticiones, se esperaban ${expect.requests}`);
  if (expect.stderr !== undefined) want(seen.stderr.includes(expect.stderr), `stderr sin «${expect.stderr}»`);
  if (expect.sentKeys !== undefined) want(JSON.stringify(seen.keys) === JSON.stringify(expect.sentKeys), `campos del estado ${JSON.stringify(seen.keys)}, se esperaban ${JSON.stringify(expect.sentKeys)}`);
  if (expect.records !== undefined) want(seen.records === expect.records, `${seen.records} registros, se esperaban ${expect.records}`);
  return problems;
}

async function main() {
  const repo = arg("repo");
  const dir = arg("dir");
  if (!repo || !dir) throw new Error("faltan argumentos: --repo --dir");
  const hook = resolve(dir, "adapters", "codex", "hook.ts");
  if (!existsSync(hook)) throw new Error(`no existe: ${hook}`);

  const sandbox = mkdtempSync(join(tmpdir(), "scout-loop-"));
  const simLog = join(sandbox, "sim.jsonl");
  writeFileSync(simLog, "");
  const sim = spawn(process.execPath, [join(ROOT, "scripts", "lib", "stub-provider.mjs"), simLog], { stdio: ["ignore", "pipe", "inherit"] });
  const port = await new Promise((ok, fail) => {
    createInterface({ input: sim.stdout }).once("line", (l) => ok(JSON.parse(l).port));
    sim.once("error", fail);
  });
  const scrub = (t) => (typeof t === "string" ? t.replaceAll(sandbox, "<sandbox>") : t);
  const baseEnv = {
    PATH: [dirname(process.execPath), join(process.env.SystemRoot ?? "C:\\Windows", "System32")].join(process.platform === "win32" ? ";" : ":"),
    SystemRoot: process.env.SystemRoot ?? "",
    TEMP: sandbox, TMP: sandbox, HOME: sandbox, USERPROFILE: sandbox, LOCALAPPDATA: sandbox, APPDATA: sandbox,
    JEVLOOP_JEV_URL: `http://127.0.0.1:${port}`,
    TYPESAFE_API_KEY: "clave-inventada-de-pruebas",
  };
  const transcript = join(sandbox, "rollout.jsonl");
  const records = join(sandbox, "records.jsonl");

  let results;
  let footprint;
  try {
    results = CASES.map((c) => {
      const filler = Array.from({ length: c.bigTranscript ?? 0 }, (_, i) => ({ tool: "shell", input: { command: `echo ${i}` }, output: "x".repeat(400) }));
      const body = c.transcript === "env-only"
        ? rollout("", []).split("\n").slice(0, 1).join("\n") + "\n"
        : rollout(c.task, [...filler, ...transcriptSteps(c)]);
      writeFileSync(transcript, body);
      const path = c.transcript === "none" ? null : c.transcript === "missing" ? join(sandbox, "no-existe.jsonl") : transcript;
      const event = { ...hookEvent({ ...c, steps: [...filler, ...c.steps] }, path, sandbox), ...(c.transcript === "none" ? { transcript_path: null } : {}) };
      if (c.eventName) event.hook_event_name = c.eventName;
      writeFileSync(simLog, "");
      rmSync(records, { force: true });
      const env = { ...baseEnv, ...(c.records ? { JEVLOOP_RECORDS: records } : {}), ...(c.env ?? {}) };
      const r = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", hook], {
        cwd: sandbox, env, input: c.stdin ?? JSON.stringify(event), encoding: "utf8", timeout: 60000,
      });
      const sent = readFileSync(simLog, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
      const state = sent[0]?.body?.state;
      const seen = {
        exit: r.status,
        verdict: verdictOf(r.stdout),
        requests: sent.length,
        stderr: r.stderr ?? "",
        keys: state ? Object.keys(state).sort() : undefined,
        records: lineCount(records),
      };
      let problems = judge(c.expect, seen);
      // La tarea de este caso no debe viajar en la puerta del paso: se busca el texto en lo enviado.
      if (c.id === "post-payload" && JSON.stringify(sent).includes("SECRETO-DE-TAREA")) problems = [...problems, "la tarea viajó al proveedor"];
      return {
        id: c.id,
        why: c.why,
        pass: problems.length === 0,
        problems,
        exit: seen.exit,
        observed: { decision: seen.verdict ? seen.verdict.kind : "ilegible", requests: seen.requests, ...(seen.verdict?.reason ? { reason: scrub(seen.verdict.reason).slice(0, 200) } : {}) },
      };
    });
    footprint = walk(sandbox).filter((f) => !["sim.jsonl", "rollout.jsonl", "records.jsonl"].includes(f)).sort();
  } finally {
    sim.kill();
    rmSync(sandbox, { recursive: true, force: true });
  }

  const pkg = JSON.parse(readFileSync(resolve(dir, "package.json"), "utf8"));
  const run = {
    repo,
    date: today(),
    scope: "directo: se ejecuta la fuente del hook de Codex, sin pasar por el hub de jevalan, contra un proveedor simulado nuestro",
    environment: {
      node: process.version,
      specialist: pkg.version ?? "desconocida",
      keys: "ninguna real: clave inventada, HOME y cwd propios y un proveedor simulado en 127.0.0.1; no se instaló nada en ~/.codex ni se ejecutó Codex",
    },
    measured: [
      "las dos puertas de grade_risk (riesgo >= 2 y autorización >= 0,5) y qué se silencia, qué se niega",
      "step_ok (listón 0,6: sin información bloquea) e is_done (>= 0,6 deja terminar; si no, bloquea)",
      "ask_human mapeado a deny y declarado; la tarea no viaja en la puerta del paso",
      "fallo cerrado: 500, cuerpo que no es JSON, sin `answers`, probabilidad fuera de rango, sin proveedor y proveedor inalcanzable",
      "evento ilegible o vacío: silencio con exit 0 (equivale a permitir); evento sin puerta: silencio sin preguntar",
      "transcripción ausente, inexistente o con solo el bloque de entorno de Codex: niega; una de unos 2 MB se lee bien",
      "JEVLOOP_RECORDS añade un registro por decisión; huella en disco del sandbox",
    ],
    not_measured: [
      "ningún juicio de Jev: el proveedor es un simulador; la calidad de los veredictos la mide la frontera del grupo supervision",
      "Codex en sí: el formato de la transcripción es interno y sin garantía, y se reproduce a mano",
      "los demás adaptadores de JevLoop (Claude Code y otros), `claim-audit`, `replay`, `trace` y `conformance`",
      "los backends alternativos (Laya local, DeepSeek) y la instalación del hook en ~/.codex",
    ],
    footprint,
    cases: results,
    pass: results.every((r) => r.pass) && footprint.length === 0,
  };
  const out = join(ROOT, "runs", `${today()}-${slug(repo)}`);
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "run.json"), JSON.stringify(run, null, 2) + "\n");
  console.log(`${run.pass ? "OK" : "FALLA"}: ${results.filter((r) => r.pass).length}/${results.length} casos, huella ${footprint.length} ficheros`);
  for (const r of results) console.log(`  ${r.pass ? "✓" : "✗"} ${r.id} → ${r.observed.decision}${r.problems.length ? ": " + r.problems.join("; ") : ""}`);
  console.log(`evidencia: runs/${today()}-${slug(repo)}/run.json`);
  process.exit(run.pass ? 0 : 1);
}

try {
  await main();
} catch (e) {
  console.error(`probe-loop: ${e.message}`);
  process.exit(1);
}
