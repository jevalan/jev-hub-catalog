/**
 * Casos fijos de la medida directa de wellposed (suraj-phanindra/wellposed), sin claves ni red.
 * Puro: describe qué se ejecuta y cómo se juzga; no lanza nada.
 *
 * Wellposed es un linter de peticiones a Jev. Se mide su contrato de salida (exit 0 limpio,
 * 1 con errores, 2 uso incorrecto, y el JSON de `--json`) con peticiones escritas aquí, no con
 * los ejemplos del paquete. Nunca se pide `--semantic` con clave ni `eval`, que lanza otro
 * proceso del propio paquete.
 */

const clean = {
  model: "jev-latest",
  state: { ticket: { subject: "Refund please", text: "I want my money back" } },
  questions: {
    wants_refund: { type: "noul", instructions: "Does `ticket.text` ask for a refund?" },
    team: {
      type: "choice",
      instructions: "Which team should handle `ticket.subject`?",
      criteria: { billing: null, technical: null, other: "A case that fits none of the above" },
    },
  },
};

// Sin "other": solo avisa, no es un error.
const warnOnly = structuredClone(clean);
delete warnOnly.questions.team.criteria.other;

const brokenPath = structuredClone(clean);
brokenPath.questions.wants_refund.instructions = "Is `ticket.assigned_agent.name` a member of the billing team?";

const noModel = structuredClone(clean);
delete noModel.model;

const withPassword = structuredClone(clean);
withPassword.state.user = { password: "no-es-un-secreto-de-verdad" };

export const FIXTURES = {
  "clean.json": JSON.stringify(clean),
  "warn-only.json": JSON.stringify(warnOnly),
  "broken-path.json": JSON.stringify(brokenPath),
  "no-model.json": JSON.stringify(noModel),
  "password.json": JSON.stringify(withPassword),
  "bad.json": "{ nope",
  "cfg-escape-off.json": JSON.stringify({ rules: { "choice/no-escape-hatch": "off" } }),
  "cfg-forbid.json": JSON.stringify({ forbidden: ["password"] }),
};

const finding = (json, rule) => (json?.findings || []).find((f) => f.rule === rule);

/** Juicio de una ejecución: devuelve la lista de problemas (vacía = pasa). */
export function judgeCase(c, r) {
  const problems = [];
  // `exit: null` deja el código a la `check` del caso (cuando vale más de un código).
  if (c.exit !== null && r.status !== c.exit) problems.push(`exit ${r.status}, se esperaba ${c.exit}`);
  if (c.check) problems.push(...c.check(r));
  return problems;
}

export const wellposedCases = (version) => [
  {
    id: "version",
    why: "`--version` imprime la versión del paquete instalado.",
    args: ["--version"], exit: 0,
    check: (r) => (r.stdout.trim() === version ? [] : [`versión ${JSON.stringify(r.stdout.trim())}, se esperaba ${version}`]),
  },
  {
    id: "help",
    why: "`--help` muestra el uso y sale con 0.",
    args: ["--help"], exit: 0,
    check: (r) => (/wellposed lint/.test(r.stdout) ? [] : ["la ayuda no menciona `wellposed lint`"]),
  },
  {
    id: "unknown-command",
    why: "Un comando desconocido es un error de uso (exit 2), no un éxito silencioso.",
    args: ["bogus"], exit: 2,
  },
  {
    id: "missing-file",
    why: "Un fichero que no existe es un error de uso (exit 2).",
    args: ["lint", "nope.json"], exit: 2,
    check: (r) => (/no such file/.test(r.stderr) ? [] : ["stderr no dice qué falta"]),
  },
  {
    id: "invalid-json",
    why: "Un JSON ilegible es un error de uso (exit 2) y nombra el fichero.",
    args: ["lint", "bad.json"], exit: 2,
    check: (r) => (/bad\.json is not valid JSON/.test(r.stderr) ? [] : ["stderr no nombra el fichero ilegible"]),
  },
  {
    id: "clean-request-passes",
    why: "Una petición bien formada sale limpia: exit 0, `ok: true` y cero hallazgos.",
    args: ["lint", "clean.json", "--json"], exit: 0,
    check: (r) => (r.json?.ok === true && r.json.findings.length === 0 ? [] : ["la petición limpia no sale limpia"]),
  },
  {
    id: "broken-path-is-error",
    why: "Una pregunta que cita una ruta que el estado no tiene es un error (exit 1) con regla y pregunta.",
    args: ["lint", "broken-path.json", "--json"], exit: 1,
    check: (r) => {
      const f = finding(r.json, "state/broken-path");
      return f && f.severity === "error" && f.questionId === "wants_refund" ? [] : ["falta state/broken-path como error de wants_refund"];
    },
  },
  {
    id: "missing-model-is-error",
    why: "Una petición sin `model` es un error (exit 1).",
    args: ["lint", "no-model.json", "--json"], exit: 1,
    check: (r) => (finding(r.json, "request/missing-model")?.severity === "error" ? [] : ["falta request/missing-model como error"]),
  },
  {
    id: "warning-does-not-fail",
    why: "Un aviso solo no hace fallar el proceso: exit 0 con el aviso presente.",
    args: ["lint", "warn-only.json", "--json"], exit: 0,
    check: (r) => (finding(r.json, "choice/no-escape-hatch")?.severity === "warn" ? [] : ["falta el aviso choice/no-escape-hatch"]),
  },
  {
    id: "max-warnings-zero-fails",
    why: "`--max-warnings 0` convierte ese aviso en fallo (exit 1).",
    args: ["lint", "warn-only.json", "--max-warnings", "0"], exit: 1,
  },
  {
    id: "config-silences-rule",
    why: "`--config` con la regla en `off` la quita del informe.",
    args: ["lint", "warn-only.json", "--config", "cfg-escape-off.json", "--json"], exit: 0,
    check: (r) => (finding(r.json, "choice/no-escape-hatch") ? ["la regla silenciada sigue apareciendo"] : []),
  },
  {
    id: "forbidden-field-is-error",
    why: "Un campo de la lista `forbidden` presente en el estado es un error (exit 1).",
    args: ["lint", "password.json", "--config", "cfg-forbid.json", "--json"], exit: 1,
    check: (r) => (finding(r.json, "state/forbidden-path")?.severity === "error" ? [] : ["falta state/forbidden-path como error"]),
  },
  {
    id: "stdin",
    why: "`lint -` lee la petición de la entrada estándar.",
    args: ["lint", "-"], stdinFixture: "clean.json", exit: 0,
  },
  {
    id: "several-files-one-bad",
    why: "Con varios ficheros, uno con error basta para exit 1 y el informe lista cada fichero.",
    args: ["lint", "clean.json", "no-model.json", "--json"], exit: 1,
    check: (r) => ((r.json?.files || []).length === 2 ? [] : ["el informe no lista los dos ficheros"]),
  },
  {
    id: "quiet-hides-warnings",
    why: "`--quiet` deja solo los errores en la salida de texto.",
    args: ["lint", "warn-only.json", "--quiet"], exit: 0,
    check: (r) => (/no-escape-hatch/.test(r.stdout) ? ["--quiet sigue mostrando el aviso"] : []),
  },
  {
    id: "semantic-without-key-is-structural-only",
    why: "`--semantic` sin clave no llama a ningún modelo: avisa por stderr de que se saltó y entrega el informe estructural.",
    args: ["lint", "--semantic", "clean.json"], exit: 0,
    check: (r) => (/semantic checks skipped: no API key/.test(r.stderr) ? [] : ["no avisa de que lo semántico se saltó"]),
  },
  {
    id: "rules-lists-structural-section",
    why: "`rules` lista las reglas estructurales; el README cuenta 45.",
    args: ["rules"], exit: 0,
    check: (r) => {
      const structural = r.stdout.split(/^\s+semantic -/m)[0];
      const n = (structural.match(/^\s+(?:error|warn|info)\s+\S+\/\S+/gm) || []).length;
      return n >= 45 ? [] : [`${n} reglas estructurales, el README dice 45`];
    },
    observe: (r) => ({ structural_rules: (r.stdout.split(/^\s+semantic -/m)[0].match(/^\s+(?:error|warn|info)\s+\S+\/\S+/gm) || []).length }),
  },
];
