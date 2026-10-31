/**
 * Casos fijos de la medida directa de every (sufianetaouil/every, paquete every-cli), sin claves reales ni red.
 * Puro: describe qué se ejecuta y cómo se juzga; no lanza nada.
 *
 * every le hace una pregunta de sí o no a cada función de un código. Todo lo que pregunta al modelo
 * necesita una clave de TypeSafe y su dirección va fija en el código, así que aquí solo se ejerce lo que
 * ocurre antes de la primera petición: el contrato de la línea de órdenes y, sobre todo, qué ficheros
 * elige y cómo los parte en funciones, que es lo que decide QUÉ CÓDIGO SALE de la máquina. Esa parte se
 * mide llamando a sus funciones `discover` y `extract_all` con un arnés propio (EXTRACT_HARNESS). Los
 * casos con clave inventada solo usan entradas que no llegan a ninguna petición (uso incorrecto, carpeta
 * sin funciones).
 */

/** Arnés de medida: con `@extract <dir>` imprime lo que every enviaría; sin él, es el CLI de every. */
export const EXTRACT_HARNESS = `import sys, json
if len(sys.argv) > 2 and sys.argv[1] == "@extract":
    from every.discover import discover
    from every.extract import extract_all
    root = sys.argv[2]
    files = discover(root)
    units, unsupported = extract_all(root, files)
    print(json.dumps({"files": [f.path for f in files], "units": [[u.file, u.name, u.kind] for u in units], "unsupported": unsupported}))
    sys.exit(0)
from every.cli import main
sys.exit(main())
`;

const lines = (n, f) => Array.from({ length: n }, (_, i) => f(i)).join("\n") + "\n";

export const FIXTURES = {
  "empty/readme.md": "# nothing to judge\n",
  "ex/py/app.py": "def alpha(a):\n    return a\n\n\nclass K:\n    def beta(self):\n        def inner():\n            return 1\n        return inner()\n",
  "ex/js/app.js": "function alpha() { return 1; }\nclass C { beta() { return 2; } }\n",
  "ex/ts/app.ts": "export function alpha(a: number): number { return a; }\nexport class C { beta(): number { return 2; } }\n",
  "ex/tsx/app.tsx": "export function Alpha() { return <div />; }\n",
  "ex/go/app.go": "package main\nfunc Alpha() int { return 1 }\ntype T struct{}\nfunc (t T) Beta() int { return 2 }\n",
  "ex/java/App.java": "class App { int alpha() { return 1; } static int beta() { return 2; } }\n",
  "ex/rust/app.rs": "fn alpha() -> i32 { 1 }\nstruct S;\nimpl S { fn beta(&self) -> i32 { 2 } }\n",
  "ex/cs/App.cs": "class App { int Alpha() { return 1; } static int Beta() { return 2; } }\n",
  "ex/rb/app.rb": "def alpha\n  1\nend\nclass K\n  def beta\n    2\n  end\nend\n",
  "ex/php/app.php": "<?php\nfunction alpha() { return 1; }\nclass K { function beta() { return 2; } }\n",
  "ex/chunk/run.sh": lines(300, (i) => `echo line${i}`),
  "ex/broken/broken.py": "def (:\n  nope nope\n",
  "ex/skip/node_modules/dep/index.js": "function dep() { return 1; }\n",
  "ex/skip/vendor/v.go": "package v\nfunc V() int { return 1 }\n",
  "ex/skip/dist/out.js": "function out() { return 1; }\n",
  "ex/skip/build/b.py": "def built():\n    return 1\n",
  "ex/skip/bin/tool.go": "package main\nfunc Tool() int { return 1 }\n",
  "ex/skip/target/t.rs": "fn target() -> i32 { 1 }\n",
  "ex/skip/app.min.js": "function minified() { return 1; }\n",
  "ex/skip/data_pb2.py": "def generated():\n    return 1\n",
  "ex/skip/api.pb.go": "package api\nfunc Generated() int { return 1 }\n",
  "ex/skip/empty.py": "",
  "ex/skip/notes.md": "# not code\n",
  "ex/skip/kept.py": "def kept():\n    return 1\n",
  "ex/sensitive/secrets.py": "def load():\n    return 'placeholder'\n",
  "ex/sensitive/credentials.go": "package main\nfunc Creds() string { return \"placeholder\" }\n",
  "ex/sensitive/config.py": "def conf():\n    return 1\n",
};

const harness = (dir) => ["@extract", dir];
const extracted = (r) => (r.json && Array.isArray(r.json.units) ? r.json : null);
const names = (j) => j.units.map((u) => u[1].toLowerCase());
const needs = (...want) => (r) => {
  const j = extracted(r);
  if (!j) return ["el arnés no devolvió el JSON esperado: " + r.stderr.slice(0, 200)];
  const got = names(j);
  const missing = want.filter((w) => !got.some((g) => g.includes(w)));
  return missing.length === 0 && j.units.every((u) => u[2] === "function") ? [] : [`funciones ${JSON.stringify(got)}, faltan ${JSON.stringify(missing)} o hay trozos en vez de funciones`];
};
const KEY = { TYPESAFE_API_KEY: "clave-inventada-de-pruebas" };

export const everyCases = (version) => [
  {
    id: "version",
    why: "`--version` imprime la versión del paquete.",
    args: ["--version"], exit: 0,
    check: (r) => (r.stdout.trim() === `every ${version}` ? [] : [`versión ${JSON.stringify(r.stdout.trim())}, se esperaba "every ${version}"`]),
  },
  {
    id: "help",
    why: "`--help` muestra el uso y sale con 0.",
    args: ["--help"], exit: 0,
    check: (r) => (/--above/.test(r.stdout) ? [] : ["la ayuda no menciona `--above`"]),
  },
  {
    id: "no-key-refuses",
    why: "Sin clave se niega (exit 2) y explica cómo conseguir acceso, antes de leer ningún fichero.",
    args: ["catches an exception and ignores it", "empty"], exit: 2,
    check: (r) => (/TYPESAFE_API_KEY|Jev API key|waitlist/i.test(r.stderr) ? [] : ["el mensaje no explica la falta de clave"]),
  },
  {
    id: "missing-arguments",
    why: "Sin pregunta ni ruta es un error de uso (exit 2) y no llega a ninguna petición.",
    args: [], env: KEY, exit: 2,
    check: (r) => (/usage/i.test(r.stderr) ? [] : ["no muestra el uso"]),
  },
  {
    id: "folder-without-functions",
    why: "Una carpeta sin código dice que no hay funciones y termina bien (exit 0) sin pedir nada a nadie: coste 0 y cero peticiones en el JSON.",
    args: ["catches an exception and ignores it", "empty", "--json"], env: KEY, exit: 0,
    check: (r) => {
      const m = r.json?.meta;
      return m && m.units === 0 && m.requests === 0 && m.cost_usd === 0 ? [] : ["el JSON no declara 0 funciones, 0 peticiones y coste 0"];
    },
  },
  ...[
    ["python", "ex/py", ["alpha", "beta", "inner"]],
    ["javascript", "ex/js", ["alpha", "beta"]],
    ["typescript", "ex/ts", ["alpha", "beta"]],
    ["tsx", "ex/tsx", ["alpha"]],
    ["go", "ex/go", ["alpha", "beta"]],
    ["java", "ex/java", ["alpha", "beta"]],
    ["rust", "ex/rust", ["alpha", "beta"]],
    ["csharp", "ex/cs", ["alpha", "beta"]],
    ["ruby", "ex/rb", ["alpha", "beta"]],
    ["php", "ex/php", ["alpha", "beta"]],
  ].map(([lang, dir, want]) => ({
    id: `splits-${lang}-into-functions`,
    why: `En ${lang} parte el código en funciones y métodos (${want.join(", ")}), no en trozos: cada pregunta lleva una sola función.`,
    args: harness(dir), exit: 0,
    check: needs(...want),
  })),
  {
    id: "nested-function-is-qualified",
    why: "Una función anidada se nombra con su exterior (`outer.inner`), como dice su código.",
    args: harness("ex/py"), exit: 0,
    check: (r) => (extracted(r) && names(extracted(r)).some((n) => /\w\.inner$/.test(n)) ? [] : ["la función anidada no lleva el nombre de la exterior"]),
  },
  {
    id: "unparsed-language-is-chunked",
    why: "Un lenguaje reconocido pero sin analizador (shell) se juzga en trozos de 150 líneas: 300 líneas, dos trozos.",
    args: harness("ex/chunk"), exit: 0,
    check: (r) => {
      const j = extracted(r);
      return j && j.units.length === 2 && j.units.every((u) => u[2] === "chunk") ? [] : [`unidades ${JSON.stringify(j?.units)}`];
    },
  },
  {
    id: "unparsable-source-falls-back-to-chunks",
    why: "Un fichero con errores de sintaxis y sin funciones reconocibles no se pierde: se parte en trozos.",
    args: harness("ex/broken"), exit: 0,
    check: (r) => (extracted(r)?.units.length === 1 && extracted(r).units[0][2] === "chunk" ? [] : [`unidades ${JSON.stringify(extracted(r)?.units)}`]),
  },
  {
    id: "skips-dependencies-build-output-and-generated",
    why: "No entran node_modules, vendor, dist, build, bin, target, lo minificado, lo generado (_pb2, .pb.go), los ficheros vacíos ni lo que no es código; solo `kept.py`.",
    args: harness("ex/skip"), exit: 0,
    check: (r) => {
      const j = extracted(r);
      return j && JSON.stringify(j.files) === JSON.stringify(["kept.py"]) ? [] : [`ficheros ${JSON.stringify(j?.files)}, se esperaba ["kept.py"]`];
    },
  },
  {
    id: "missing-grammars-silently-find-nothing",
    why: "Observación: si no están las gramáticas nativas de su dependencia (primera ejecución sin red), ¿avisa o devuelve cero funciones en silencio? El caso arranca con una caché vacía y el proxy muerto.",
    args: harness("ex/py"), exit: 0,
    env: (sandbox) => ({ TREE_SITTER_LANGUAGE_PACK_CACHE_DIR: `${sandbox}/cache-vacia` }),
    check: (r) => (extracted(r) ? [] : ["el arnés no devolvió el JSON esperado"]),
    observe: (r) => ({ units_found: extracted(r)?.units.length ?? null, unsupported: extracted(r)?.unsupported ?? null, stderr_has_warning: r.stderr.trim().length > 0 }),
  },
  {
    id: "secret-named-files-are-sent",
    why: "Observación, no exigencia: qué pasa con ficheros llamados secrets/credentials. Su README no promete excluirlos; el caso deja constancia de si se enviarían.",
    args: harness("ex/sensitive"), exit: 0,
    check: (r) => (extracted(r) ? [] : ["el arnés no devolvió el JSON esperado"]),
    observe: (r) => ({ files_that_would_be_judged: extracted(r)?.files ?? null }),
  },
];
