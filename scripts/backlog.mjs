// Genera docs/pruebas-pendientes.md: la cola de lo que aún no hemos probado
// nosotros mismos. Cabe señalar que es derivada de los datos y no se edita a mano.
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { readJson } from "./lib/json.mjs";
import { ASSESSMENTS, EXAMPLES, ROOT } from "./lib/paths.mjs";

export function tier(a, entry) {
  const hasInstall = (entry?.snippets || []).some((s) => s.kind === "install");
  const keyless = a.cost.requires_key.length === 0;
  if (a.callable.every((c) => c === "http" || c === "none")) return 3;
  if (keyless && hasInstall) return 1;
  return 2;
}

export function buildBacklog(assessments, examples) {
  const pending = assessments.filter((a) => a.evidence !== "measured" && a.decision !== "no" && a.form !== "n_a");
  const rank = { yes: 0, unclear: 1 };
  const groups = { 1: [], 2: [], 3: [] };
  for (const a of pending) groups[tier(a, examples.entries?.[a.repo])].push(a);
  const sort = (xs) => xs.sort((x, y) => rank[x.decision] - rank[y.decision] || (y.stars || 0) - (x.stars || 0));
  const line = (a) =>
    `- [ ] \`${a.repo}\` · ${a.decision} · ${a.form} · ${a.callable.join("/")}${a.cost.requires_key.length ? ` · clave: ${a.cost.requires_key.join("/")}` : ""}`;
  const section = (n, title, why) =>
    `## ${title} (${groups[n].length})\n\n${why}\n\n${sort(groups[n]).map(line).join("\n") || "_Vacío._"}\n`;
  return `# Pruebas pendientes

Generado por \`npm run backlog\` desde \`data/\`. No se edita a mano.

Un veredicto leído no es un veredicto probado. Cada ficha de esta lista pasa a \`measured\` solo cuando existe su \`runs/<fecha>-<repo>/\` con las salidas reales.

**Reglas de cada prueba** (la política de código de terceros es obligatoria): directorio nuevo y vacío, \`--ignore-scripts\`, HOME y cwd propios, sin claves reales, jamás \`setup\`/\`install\`/\`doctor\` de un gate, y autorización explícita antes de instalar nada ajeno. Cada contrato de salida necesita su juego de casos en \`scripts/probe-gate.mjs\`.

${section(1, "Primera tanda: sin clave y con instalación documentada", "Las más baratas de medir: se instalan según su README y corren sin credenciales.")}
${section(2, "Segunda tanda: piden clave o no traen instalación clara", "Necesitan una clave de prueba acotada, un modo `--dry-run`/`--mock` o leer el código antes de decidir cómo medirlas.")}
${section(3, "Tercera tanda: servicios alojados o sin CLI", "Se miden contra el servicio, con el coste y la privacidad que eso implique; decidirlo caso a caso.")}`;
}

if (process.argv[1]?.endsWith("backlog.mjs")) {
  const { assessments } = readJson(ASSESSMENTS);
  const examples = readJson(EXAMPLES);
  writeFileSync(resolve(ROOT, "docs", "pruebas-pendientes.md"), buildBacklog(assessments, examples));
  console.log("backlog: docs/pruebas-pendientes.md");
}
