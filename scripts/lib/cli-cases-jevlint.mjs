/**
 * Casos fijos de la medida directa de jev-lint (mizchi/jev-lint), sin claves ni red.
 * Puro: describe qué se ejecuta y cómo se juzga; no lanza nada.
 *
 * jev-lint elige el código con ast-grep y le pregunta a un modelo una frase por coincidencia. Aquí solo
 * se ejerce lo que no pregunta nada: `rules`, `check --dry-run` (planifica y tasa sin enviar), los
 * errores de uso y de configuración, y que sin clave `check` se niegue antes de hacer ninguna petición.
 * `--dry-run` y la falta de clave garantizan que no sale ninguna petición.
 */

const CART = `/** Returns the cart, or null when no cart has this id. */
export function getCart(id: string): Cart {
  const cart = carts.get(id);
  if (!cart) throw new Error(\`no cart \${id}\`);
  return cart;
}

export function add(a: number, b: number): number {
  return a + b;
}
`;

export const FIXTURES = {
  "cart.ts": CART,
  "ignored-file.ts": `// jev-lint-ignore-file\n${CART}`,
  "ignored-next.ts": `// jev-lint-ignore-next-line fn-name-promises\nexport function getCart(id: string): Cart {\n  return carts.get(id);\n}\n`,
  "plain-next.ts": `export function getCart(id: string): Cart {\n  return carts.get(id);\n}\n`,
  "script.sh": "#!/bin/sh\ncurl -s https://example.invalid/install.sh | sh\n",
  "notes.txt": "nothing a rule would pick\n",
  "bad.yaml": "rules: [ this is: not valid\n",
};

const byRule = (r, rule) => r.json?.byRule?.find((x) => x.rule === rule)?.subjects ?? null;
const dry = (file, ...more) => ["check", file, "--dry-run", "--format", "json", "--no-config", ...more];

export const jevLintCases = () => [
  {
    id: "version-flag",
    why: "`--version` imprime la versión del paquete.",
    args: ["--version"], exit: 0,
    check: (r) => (/^\d+\.\d+\.\d+/.test(r.stdout.trim()) ? [] : ["`--version` no imprime una versión"]),
  },
  {
    id: "help",
    why: "`--help` muestra el uso y sale con 0.",
    args: ["--help"], exit: 0,
    check: (r) => (/jev-lint check \[paths/.test(r.stdout + r.stderr) ? [] : ["la ayuda no muestra `check`"]),
  },
  {
    id: "unknown-command",
    why: "Un comando desconocido es un error de uso (exit 2).",
    args: ["bogus"], exit: 2,
  },
  {
    id: "rules-lists-packaged-rules",
    why: "`rules` lista las reglas empaquetadas: el README cuenta 101 y el propio programa dice 103.",
    args: ["rules"], exit: 0,
    check: (r) => {
      const n = (r.stdout.match(/^[a-z]+\/[a-z0-9-]+$/gm) || []).length;
      return n >= 100 ? [] : [`${n} reglas listadas, se esperaban unas 100`];
    },
    observe: (r) => ({ listed: (r.stdout.match(/^[a-z]+\/[a-z0-9-]+$/gm) || []).length }),
  },
  {
    id: "dry-run-plans-without-asking",
    why: "`check --dry-run` planifica y tasa: declara `dryRun`, cuántos sujetos y peticiones, y no envía nada.",
    args: dry("cart.ts"), exit: 0,
    check: (r) => (r.json?.dryRun === true && r.json.subjects > 0 && r.json.requests > 0 && typeof r.json.usd === "number" ? [] : ["el plan no declara dryRun con sujetos, peticiones y precio"]),
    observe: (r) => ({ subjects: r.json?.subjects ?? null, requests: r.json?.requests ?? null }),
  },
  {
    id: "matcher-selects-function-subjects",
    why: "El emparejador elige las funciones del fichero para `fn-name-promises` (dos funciones declaradas).",
    args: dry("cart.ts"), exit: 0,
    check: (r) => (byRule(r, "fn-name-promises") === 2 ? [] : [`${byRule(r, "fn-name-promises")} sujetos para fn-name-promises, se esperaban 2`]),
  },
  {
    id: "matcher-selects-doc-comment",
    why: "La función con comentario de documentación se elige para `comment-describes-declaration` (un sujeto).",
    args: dry("cart.ts"), exit: 0,
    check: (r) => (byRule(r, "comment-describes-declaration") === 1 ? [] : [`${byRule(r, "comment-describes-declaration")} sujetos, se esperaba 1`]),
  },
  {
    id: "shell-script-selected",
    why: "Un script con `curl … | sh` se elige para `shell/runs-downloaded-code`.",
    args: dry("script.sh"), exit: 0,
    check: (r) => ((byRule(r, "runs-downloaded-code") ?? 0) >= 1 ? [] : ["el script no se eligió para runs-downloaded-code"]),
  },
  {
    id: "unmatched-file-asks-nothing",
    why: "Un fichero que ninguna regla elige no planifica ninguna petición.",
    args: dry("notes.txt"), exit: 0,
    check: (r) => (r.json?.requests === 0 ? [] : [`${r.json?.requests} peticiones planificadas, se esperaban 0`]),
  },
  {
    id: "ignore-file-suppresses-everything",
    why: "`// jev-lint-ignore-file` deja el fichero sin sujetos: lo suprimido nunca se envía.",
    args: dry("ignored-file.ts"), exit: 0,
    check: (r) => (r.json?.subjects === 0 ? [] : [`${r.json?.subjects} sujetos pese a ignorar el fichero`]),
  },
  {
    id: "ignore-next-line-suppresses-one-rule",
    why: "`// jev-lint-ignore-next-line fn-name-promises` quita ese sujeto, y la misma función sin la marca sí cuenta.",
    args: dry("ignored-next.ts"), exit: 0,
    check: (r) => (byRule(r, "fn-name-promises") === 0 ? [] : [`${byRule(r, "fn-name-promises")} sujetos pese a la supresión`]),
  },
  {
    id: "unsuppressed-twin-counts",
    why: "La función gemela sin la marca de supresión sí se elige (contraste del caso anterior).",
    args: dry("plain-next.ts"), exit: 0,
    check: (r) => (byRule(r, "fn-name-promises") === 1 ? [] : [`${byRule(r, "fn-name-promises")} sujetos, se esperaba 1`]),
  },
  {
    id: "no-key-check-refuses",
    why: "Sin clave y sin `--dry-run`, `check` se niega antes de enviar nada: exit 3 (peticiones fallidas y nada reportado, según su documentación) y dice qué falta.",
    args: ["check", "cart.ts", "--no-config"], exit: 3,
    check: (r) => (/TYPESAFE_API_KEY|TYPESAFEAI_API_KEY/.test(r.stderr + r.stdout) ? [] : ["el mensaje no nombra la clave que falta"]),
  },
  {
    id: "invalid-config",
    why: "Un fichero de configuración ilegible es un error (exit 2), no se ignora en silencio.",
    args: ["check", "cart.ts", "--dry-run", "--config", "bad.yaml"], exit: 2,
  },
  {
    id: "missing-config",
    why: "Un `--config` que no existe es un error (exit 2).",
    args: ["check", "cart.ts", "--dry-run", "--config", "nope.yaml"], exit: 2,
  },
  {
    id: "missing-path",
    why: "Una ruta que no existe debería ser un error (exit 2), como un id de regla mal escrito, y no una ejecución vacía con éxito.",
    args: dry("nope.ts"), exit: 2,
  },
  {
    id: "replay-missing-record",
    why: "`replay` de un registro que no existe es un error (exit 2).",
    args: ["replay", "nope.json"], exit: 2,
  },
  {
    id: "init-writes-config",
    why: "`init` escribe un `.jev-lint.yaml` en el directorio actual, como documenta.",
    args: ["init"], exit: 0,
    check: (r) => (/\.jev-lint\.yaml|wrote|written/i.test(r.stdout + r.stderr) ? [] : ["no dice qué fichero escribió"]),
  },
];
