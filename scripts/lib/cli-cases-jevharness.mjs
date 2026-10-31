/**
 * Casos fijos de la medida directa de jev-harness (ismaelsoilet/jev-harness), sin claves ni red.
 * Puro: describe qué se ejecuta y cómo se juzga; no lanza nada.
 *
 * Sin clave, el paquete decide con un motor local determinista y lo etiqueta (`is_mock: true`).
 * Es eso lo que se mide: el contrato de salida y la honestidad de la etiqueta, no al modelo.
 * Nunca se lanzan `init`, `doctor`, `export`, `mcp` ni `replay`, que escriben configuración o
 * abren un servidor, ni `--allow-auto-recovery`, que instalaría paquetes.
 */

const MISSING_DEP = "ModuleNotFoundError: No module named 'foo'";
const TRANSIENT = "Error: connect ECONNRESET 127.0.0.1:5432 timeout";
const LOGIC = "AssertionError: expected 3 to equal 4";

const gate = (id, why, sample, exit, expectJson, extra = []) => ({
  id,
  why,
  args: ["test-gate", "--json", "--sample", sample, ...extra],
  exit,
  check: (r) => {
    const out = [];
    for (const [k, v] of Object.entries(expectJson)) {
      if (JSON.stringify(r.json?.[k]) !== JSON.stringify(v)) out.push(`${k}: ${JSON.stringify(r.json?.[k])}, se esperaba ${JSON.stringify(v)}`);
    }
    return out;
  },
});

export const jevHarnessCases = (version) => [
  {
    id: "version",
    why: "`--version` imprime la versión del paquete instalado.",
    args: ["--version"], exit: 0,
    check: (r) => (r.stdout.trim() === `jev-harness ${version}` ? [] : [`versión ${JSON.stringify(r.stdout.trim())}`]),
  },
  {
    id: "help",
    why: "`--help` lista los subcomandos de decisión.",
    args: ["--help"], exit: 0,
    check: (r) => (["test-gate", "abort-check", "route", "verify"].every((w) => r.stdout.includes(w)) ? [] : ["la ayuda no lista todos los comandos de decisión"]),
  },
  {
    id: "status-without-key",
    why: "Sin clave, `status` dice que no hay clave y que corre el motor local sin red.",
    args: ["status"], exit: 0,
    check: (r) => (/NOT DETECTED/.test(r.stdout) && /LOCAL DETERMINISTIC/.test(r.stdout) ? [] : ["no declara ausencia de clave y motor local"]),
  },
  {
    id: "status-honours-json",
    why: "Todos los comandos aceptan `--json` (salida legible por máquina), `status` incluido.",
    args: ["status", "--json"], exit: 0,
    check: (r) => (r.json ? [] : ["`status --json` no devuelve JSON, devuelve texto"]),
  },
  gate("missing-dependency-skips-llm", "Una dependencia ausente se resuelve sin LLM: categoría env_missing, exit 0, recuperación solo propuesta.", MISSING_DEP, 0, { category: "env_missing", skip_llm: true, is_mock: true }),
  gate("transient-error-retries", "Un error transitorio de red se resuelve sin LLM: flaky_transient, exit 0.", TRANSIENT, 0, { category: "flaky_transient", skip_llm: true }),
  gate("logic-defect-escalates", "Un defecto lógico real escala: deep_logic, exit 1 y no se salta el LLM.", LOGIC, 1, { category: "deep_logic", skip_llm: false }),
  gate("offline-is-labelled", "Sin clave y sin `--mock` el motor local se etiqueta igualmente: nunca se hace pasar por el modelo.", LOGIC, 1, { is_mock: true }),
  gate("fail-closed-without-key-stays-offline", "`--fail-closed` sin clave no inventa un error de proveedor: entrega la misma decisión local, etiquetada.", LOGIC, 1, { category: "deep_logic", is_mock: true }, ["--fail-closed"]),
  {
    id: "shadow-never-changes-exit",
    why: "`--shadow` decide y avisa, pero el proceso sale siempre con 0.",
    args: ["test-gate", "--json", "--shadow", "--sample", LOGIC], exit: 0,
    check: (r) => (/\[SHADOW\] would exit 1/.test(r.stderr) ? [] : ["no avisa por stderr del código que habría devuelto"]),
  },
  {
    id: "missing-input-is-usage-error",
    why: "`test-gate` sin log es un error de uso (exit 2) y dice qué falta.",
    args: ["test-gate", "--json"], exit: 2,
    check: (r) => (/No test failure log provided/.test(r.stderr) ? [] : ["stderr no dice qué falta"]),
  },
  {
    id: "abort-proceed",
    why: "`abort-check` ante un paso sano y sin historia deja seguir: exit 0.",
    args: ["abort-check", "--json", "--plan", "add a unit test for the parse function"], exit: 0, fresh: true,
    check: (r) => (r.json?.should_abort === false && r.json.action === "proceed" ? [] : ["aborta un paso sano"]),
  },
  {
    id: "abort-loop",
    why: "`abort-check` ante un reintento repetido recomienda abortar: exit 1 y `abort_and_ask`.",
    args: ["abort-check", "--json", "--plan", "retry the same failing command a 5th time"], exit: 1, fresh: true,
    check: (r) => (r.json?.should_abort === true && r.json.action === "abort_and_ask" ? [] : ["no recomienda abortar el bucle"]),
  },
  {
    id: "abort-decision-depends-only-on-input",
    why: "El hub es sin estado: el mismo plan sano debe dar la misma decisión aunque antes se haya abortado otro. `abort-check` sigue la historia que guarda en ~/.config/jev/session.json.",
    args: ["abort-check", "--json", "--plan", "add a unit test for the parse function"], exit: 0, fresh: true,
    prelude: [["abort-check", "--json", "--plan", "retry the same failing command a 5th time"]],
    check: (r) => (r.json?.should_abort === false ? [] : ["un plan sano sale abortado por la llamada anterior"]),
  },
  {
    id: "abort-action-matches-probability",
    why: "La acción y su probabilidad son coherentes: abortar con `abort_probability` por debajo de 0,5 es contradictorio.",
    args: ["abort-check", "--json", "--plan", "retry the same failing command a 5th time"], exit: 1, fresh: true,
    prelude: [["abort-check", "--json", "--plan", "add a unit test for the parse function"]],
    check: (r) => (r.json?.should_abort && r.json.abort_probability < 0.5 ? [`aborta con probabilidad ${r.json.abort_probability}`] : []),
  },
  {
    id: "route-trivial-is-deterministic",
    why: "Una tarea trivial se enruta sin tokens de LLM.",
    args: ["route", "--json", "fix a typo in README"], exit: 0,
    check: (r) => (r.json?.selected_tier === "deterministic" ? [] : [`tier ${r.json?.selected_tier}`]),
  },
  {
    id: "route-hard-goes-heavy",
    why: "Una tarea de razonamiento profundo no se queda en el tier determinista.",
    args: ["route", "--json", "design a distributed consensus protocol and prove its safety under partitions"], exit: 0,
    check: (r) => (r.json?.selected_tier && r.json.selected_tier !== "deterministic" ? [] : ["la tarea difícil sale determinista"]),
  },
  {
    id: "verify-satisfied",
    why: "`verify` da por cumplido un criterio que la evidencia respalda: exit 0.",
    args: ["verify", "--json", "-c", "tests pass", "-o", "12 passed"], exit: 0,
    check: (r) => (r.json?.is_verified === true ? [] : ["no verifica evidencia que cumple"]),
  },
  {
    id: "verify-unsatisfied",
    why: "`verify` rechaza evidencia que contradice el criterio: exit 1 y `needs_rework`.",
    args: ["verify", "--json", "-c", "all tests pass", "-o", "3 failed, 9 passed"], exit: 1,
    check: (r) => (r.json?.is_verified === false && r.json.needs_rework === true ? [] : ["da por buena evidencia que falla"]),
  },
  {
    id: "receipts-hold-hashes-not-logs",
    why: "Los recibos de auditoría guardan un hash de la entrada y nunca el texto del log.",
    args: ["receipts"], exit: 0,
    check: (r) => {
      const out = [];
      if (!/hash=[0-9a-f]{32}/.test(r.stdout)) out.push("los recibos no muestran hash");
      if (/ModuleNotFoundError|ECONNRESET|AssertionError/.test(r.stdout)) out.push("un recibo contiene texto del log");
      return out;
    },
  },
];
