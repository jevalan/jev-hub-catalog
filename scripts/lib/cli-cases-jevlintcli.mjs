/**
 * Casos fijos de la medida directa de JevLint (iamtoomas/JevLint, paquete @jevlint/cli), sin claves ni red.
 * Puro: describe qué se ejecuta y cómo se juzga; no lanza nada.
 *
 * JevLint elige ficheros de JavaScript/TypeScript y le pregunta a un modelo, por fichero y por regla, si
 * incumple una convención. Aquí solo se ejerce lo que no necesita modelo: `--dry-run` (que imprime las
 * peticiones sin enviarlas ni exigir clave), la selección de ficheros, la configuración y `init`.
 * Los plugins que trae (`magic-strings`, `descriptive-names`) son los únicos que se cargan: `--dry-run`
 * ejecuta los plugins configurados, así que no se mide ninguno ajeno.
 */

export const FIXTURES = {
  "src/a.ts": 'export function run(state: string) {\n  if (state === "pending") return 1;\n  return 0;\n}\n',
  "src/b.ts": "export const x = 1;\n",
  "src/a.test.ts": "export const s = 1;\n",
  "src/types.d.ts": "export type T = string;\n",
  "src/c.py": "x = 1\n",
  "secrets/k.ts": "export const k = 1;\n",
  "credentials.ts": "export const k = 1;\n",
  "secrets.mjs": "export const k = 1;\n",
  "node_modules/x/i.js": "export const i = 1;\n",
  "dist/o.js": "export const o = 1;\n",
  "cfg-plugin.json": '{"files":["src/b.ts"],"plugins":["descriptive-names"]}',
  "cfg-ignore.json": '{"ignore":["**/*.d.ts","**/*.test.ts"]}',
  "cfg-small.json": '{"maxFileBytes":10}',
  "cfg-bad.json": "{nope",
};

const files = (r) => r.json?.requests?.map((q) => q.state.filePath.replaceAll("\\", "/")) ?? null;
const sameSet = (got, want) => {
  if (got === null) return ["la salida de --dry-run no es el JSON documentado"];
  const g = [...got].sort();
  const w = [...want].sort();
  return JSON.stringify(g) === JSON.stringify(w) ? [] : [`ficheros ${JSON.stringify(g)}, se esperaba ${JSON.stringify(w)}`];
};
const dry = (...args) => [...args, "--dry-run"];

export const jevLintCliCases = () => [
  {
    id: "help",
    why: "`--help` muestra el uso y sale con 0.",
    args: ["--help"], exit: 0,
    check: (r) => (/--dry-run/.test(r.stdout) ? [] : ["la ayuda no menciona `--dry-run`"]),
  },
  {
    id: "no-version-flag",
    why: "`--version` imprime la versión, como cualquier CLI instalable.",
    args: ["--version"], exit: 0,
  },
  {
    id: "unknown-option",
    why: "Una opción desconocida es un error de uso (exit 2).",
    args: ["--bogus"], exit: 2,
  },
  {
    id: "no-key-refuses",
    why: "Sin clave y sin `--dry-run`, se niega (exit 2), nombra la variable y no imprime ninguna petición.",
    args: ["src"], exit: 2,
    check: (r) => (/JEV_API_KEY/.test(r.stderr) && !/requests/.test(r.stdout) ? [] : ["no nombra JEV_API_KEY o imprimió peticiones"]),
  },
  {
    id: "dry-run-needs-no-key",
    why: "`--dry-run` imprime las peticiones sin clave y sale con 0, sin llamar a Jev.",
    args: dry("src/b.ts"), exit: 0,
    check: (r) => sameSet(files(r), ["src/b.ts"]),
  },
  {
    id: "dry-run-request-shape",
    why: "Cada petición lleva el modelo, el fichero con su fuente y una pregunta NOUL de la regla `magic-strings`.",
    args: dry("src/a.ts"), exit: 0,
    check: (r) => {
      const q = r.json?.requests?.[0];
      const m = q?.questions?.["magic-strings"];
      return q && q.model === "jev-latest" && q.state.source.includes("pending") && m?.type === "noul" && typeof m.instructions?.question === "string"
        ? []
        : ["la petición no tiene la forma documentada (modelo, fuente y pregunta noul)"];
    },
  },
  {
    id: "directory-scan-skips-dependencies-and-secrets",
    why: "Al recorrer una carpeta no entran node_modules, dist, los directorios secrets/credentials ni los ficheros con ese nombre, ni lo que no es JS/TS.",
    args: dry(), exit: 0,
    check: (r) => sameSet(files(r), ["src/a.ts", "src/b.ts", "src/a.test.ts", "src/types.d.ts"]),
  },
  {
    id: "ignore-flag",
    why: "`--ignore` quita del recorrido lo que casa con el patrón.",
    args: dry("src", "--ignore", "**/*.test.ts", "--ignore", "**/*.d.ts"), exit: 0,
    check: (r) => sameSet(files(r), ["src/a.ts", "src/b.ts"]),
  },
  {
    id: "config-ignore",
    why: "La clave `ignore` de un `--config` hace lo mismo que `--ignore`.",
    args: dry("--config", "cfg-ignore.json"), exit: 0,
    check: (r) => sameSet(files(r), ["src/a.ts", "src/b.ts"]),
  },
  {
    id: "config-selects-plugin-and-files",
    why: "Un `--config` elige los ficheros y el plugin: solo `src/b.ts`, con la pregunta de `descriptive-names`.",
    args: dry("--config", "cfg-plugin.json"), exit: 0,
    check: (r) => {
      const q = r.json?.requests?.[0];
      return sameSet(files(r), ["src/b.ts"]).concat(q && Object.keys(q.questions).join() === "descriptive-names" ? [] : ["la pregunta no es la de descriptive-names"]);
    },
  },
  {
    id: "cli-target-replaces-config-files",
    why: "Un objetivo en la línea de órdenes sustituye a los `files` de la configuración.",
    args: dry("--config", "cfg-plugin.json", "src/a.ts"), exit: 0,
    check: (r) => sameSet(files(r), ["src/a.ts"]),
  },
  {
    id: "model-flag",
    why: "`--model` llega a la petición.",
    args: dry("src/b.ts", "--model", "jev-otro"), exit: 0,
    check: (r) => (r.json?.requests?.[0]?.model === "jev-otro" ? [] : ["el modelo de la petición no es el pedido"]),
  },
  {
    id: "max-file-bytes",
    why: "Un fichero por encima de `maxFileBytes` no se envía; el fallo de análisis sale con 2, que es lo que documenta su ayuda.",
    args: dry("--config", "cfg-small.json", "src/a.ts"), exit: 2,
    check: (r) => (files(r)?.length === 0 ? [] : [`se enviaron ${JSON.stringify(files(r))}, se esperaba nada`]),
    observe: (r) => ({ stderr: r.stderr.trim().replaceAll("\\", "/").slice(0, 160) }),
  },
  {
    id: "no-files-found",
    why: "Una ruta que no existe es un error (exit 2) y lo dice, no una ejecución vacía.",
    args: dry("nope"), exit: 2,
    check: (r) => (/No JavaScript or TypeScript files found/.test(r.stderr) ? [] : ["no dice que no hay ficheros"]),
  },
  {
    id: "threshold-out-of-range",
    why: "Un umbral fuera de [0, 1] es un error de configuración (exit 2).",
    args: dry("src/b.ts", "--threshold", "2"), exit: 2,
  },
  {
    id: "format-invalid",
    why: "Un formato que no es text ni json es un error (exit 2).",
    args: dry("src/b.ts", "--format", "xml"), exit: 2,
  },
  {
    id: "config-unreadable",
    why: "Una configuración ilegible es un error (exit 2), no se ignora.",
    args: dry("--config", "cfg-bad.json"), exit: 2,
    check: (r) => (/Cannot read configuration/.test(r.stderr) ? [] : ["no dice que la configuración es ilegible"]),
  },
  {
    id: "config-missing",
    why: "Una configuración que no existe es un error (exit 2).",
    args: dry("--config", "nofile.json"), exit: 2,
  },
  {
    // Va el último con `init`: deja un jevlint.config.json que cambiaría el resultado de los casos que lo cargan.
    id: "init-writes-config",
    why: "`init` crea `jevlint.config.json` con el plugin magic-strings, sin clave.",
    args: ["init"], exit: 0,
    check: (r) => (/jevlint\.config\.json/.test(r.stdout) ? [] : ["no dice qué fichero creó"]),
  },
  {
    id: "init-never-overwrites",
    why: "Un segundo `init` no sobrescribe la configuración existente: sale con 2 y lo dice.",
    args: ["init"], exit: 2,
    check: (r) => (/left unchanged/.test(r.stderr) ? [] : ["no dice que dejó la configuración intacta"]),
  },
];
