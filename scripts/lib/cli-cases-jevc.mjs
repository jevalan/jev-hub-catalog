/**
 * Casos fijos de la medida directa de jevc (doronp/jevc, paquete jev-compiler), sin claves ni red.
 * Puro: describe qué se ejecuta y cómo se juzga; no lanza nada.
 *
 * jevc compila prosa de políticas de agentes en «programas de veredicto»: preguntas estrechas para el
 * modelo y el veredicto calculado en código. Todo lo que mide el repertorio de abajo es determinista y
 * local: `scan`, `compile` (esquema y `--lift`), `emit-policy`, `show`, `explain` y `check` sobre su
 * corpus grabado. `check --live` y cualquier cosa con modelo quedan fuera.
 */

export const FIXTURES = {
  "proj/AGENTS.md": "# Rules\n\n- Never delete the production database.\n- Write a short summary of each change.\n- First run the tests, then commit, then push.\n",
  "empty/.keep": "",
  "schema-ok.json": '{"type":"object","properties":{"urgent":{"type":"boolean","description":"Is the ticket urgent?"},"queue":{"type":"string","enum":["billing","support"],"description":"Which queue?"}},"required":["urgent","queue"]}',
  "schema-free-text.json": '{"type":"object","properties":{"name":{"type":"string"},"age":{"type":"integer"}},"required":["name"]}',
  "schema-scalar.json": '{"type":"string"}',
  "bad.json": "{nope",
  "rules.md": "Never ship code with a failing test.\n",
  "prog.json": '{"decisions":[{"id":"destructive","kind":"noul","instructions":"Does the command delete data?","source":{"quote":"Never delete the production database."}}],"reduce":{"kind":"rules","rules":[{"when":[{"id":"destructive","op":"gte","value":0.5}],"then":"deny"}],"otherwise":"allow"},"residual":"","dropped":[]}',
  "bad-prog.json": '{"nope":1}',
};

const both = (r) => r.stdout + r.stderr;
const has = (re, what) => (r) => (re.test(both(r)) ? [] : [`la salida no ${what}`]);

export const jevcCases = (version) => [
  {
    id: "version",
    why: "`--version` imprime la versión del paquete.",
    args: ["--version"], exit: 0,
    check: (r) => (r.stdout.trim() === version ? [] : [`versión ${JSON.stringify(r.stdout.trim())}, se esperaba ${version}`]),
  },
  {
    id: "help-exits-zero",
    why: "`--help` muestra el uso y sale con 0, como cualquier CLI.",
    args: ["--help"], exit: 0,
    check: has(/jevc scan/, "menciona `jevc scan`"),
  },
  {
    id: "unknown-command",
    why: "Un comando desconocido es un error de uso (exit 1) y muestra el uso.",
    args: ["bogus"], exit: 1,
    check: has(/usage: jevc/, "muestra el uso"),
  },
  {
    id: "scan-counts-rules",
    why: "`scan` cuenta las reglas de un AGENTS.md y las separa en decidibles, procedimientos y generación, como dice su README.",
    args: ["scan", "proj"], exit: 0,
    check: has(/3 rules\s+1 decidable\s+1 procedure\s+1 generation/, "da 3 reglas: 1 decidible, 1 procedimiento y 1 generación"),
  },
  {
    id: "scan-lists-the-decidable-rule",
    why: "`scan` enseña la regla decidible con su número de línea y propone el siguiente paso.",
    args: ["scan", "proj"], exit: 0,
    check: has(/3\s+Never delete the production database\./, "enseña la regla decidible con su línea"),
  },
  {
    id: "scan-without-instruction-files",
    why: "Sin ficheros de instrucciones, `scan` lo dice y explica qué busca (exit 0).",
    args: ["scan", "empty"], exit: 0,
    check: has(/No instruction files found/, "dice que no hay ficheros de instrucciones"),
  },
  {
    id: "check-replays-corpus",
    why: "`check` repite offline el corpus medido: el README cuenta 58 fixtures y los 58 pasan.",
    args: ["check"], exit: 0,
    check: has(/58 fixtures, 58 passing, 0 failing/, "da 58 fixtures y 58 pasando"),
  },
  {
    id: "check-live-needs-key",
    why: "`check --live` sin clave se niega (exit 1), nombra la variable y no hace ninguna petición.",
    args: ["check", "--live"], exit: 1,
    check: has(/TYPESAFE_API_KEY/, "nombra TYPESAFE_API_KEY"),
  },
  {
    id: "check-model-needs-live",
    why: "`--model` sin `--live` se rechaza (el README dice que solo vale con `--live`).",
    args: ["check", "--model", "x"], exit: 1,
  },
  {
    id: "check-bad-fixtures-dir",
    why: "`check --fixtures` sobre un directorio que no existe es un error (exit 1) y lo dice.",
    args: ["check", "--fixtures", "nope"], exit: 1,
    check: has(/Cannot load fixtures/, "dice que no pudo cargar los fixtures"),
  },
  {
    id: "show-lists-fixtures",
    why: "`show` sin argumento lista los 58 fixtures grabados.",
    args: ["show"], exit: 0,
    check: has(/58 recorded fixtures/, "lista 58 fixtures"),
  },
  {
    id: "show-one-fixture",
    why: "`show <id>` enseña el antes (la prosa que sustituye), el estado y las preguntas medidas.",
    args: ["show", "commit-only-when-explicitly-asked"], exit: 0,
    check: has(/BEFORE[\s\S]*STATE/, "enseña BEFORE y STATE"),
  },
  {
    id: "show-unknown-fixture",
    why: "Un fixture inexistente es un error (exit 1) que remite a la lista.",
    args: ["show", "nope"], exit: 1,
    check: has(/No fixture "nope"/, "dice qué fixture no existe"),
  },
  {
    id: "explain-unknown-decision",
    why: "Una decisión inexistente es un error (exit 1).",
    args: ["explain", "nope"], exit: 1,
  },
  {
    id: "compile-schema-emits-module",
    why: "Un esquema con un booleano y un enum se compila a un módulo TypeScript con una pregunta noul y otra choice, y un veredicto calculado en código.",
    args: ["compile", "schema-ok.json"], exit: 0,
    check: (r) =>
      /urgent: \{ type: 'noul'/.test(r.stdout) && /queue: \{ type: 'choice'/.test(r.stdout) && /never asked of the model/.test(r.stdout)
        ? []
        : ["el módulo no tiene las preguntas noul y choice ni el veredicto en código"],
  },
  {
    id: "compile-schema-reports-what-it-cannot-lower",
    why: "Un esquema con texto libre y un entero no se compila en silencio: declara qué necesita un modelo generativo y qué descarta (exit 1).",
    args: ["compile", "schema-free-text.json"], exit: 1,
    check: has(/free text[\s\S]*dropped: "age"/, "declara el texto libre y el entero descartado"),
  },
  {
    id: "compile-scalar-schema-refused",
    why: "Un esquema sin propiedades no inventa decisiones: se rechaza y explica por qué (exit 1).",
    args: ["compile", "schema-scalar.json"], exit: 1,
    check: has(/declares no properties to lower/, "explica que no declara propiedades"),
  },
  {
    id: "compile-not-json-points-to-lift",
    why: "Un fichero que no es JSON remite a `--lift` (exit 1).",
    args: ["compile", "bad.json"], exit: 1,
    check: has(/--lift/, "remite a --lift"),
  },
  {
    id: "compile-lift-prints-request",
    why: "`compile --lift` imprime la petición para que el agente la lleve a un programa, sin llamar a ningún modelo (exit 0).",
    args: ["compile", "rules.md", "--lift"], exit: 0,
    check: has(/HARD ERROR[\s\S]*Never ship code with a failing test/, "contiene la regla dura y el texto de entrada"),
  },
  {
    id: "emit-policy-toolgate",
    why: "`emit-policy --for toolgate` baja un programa a YAML de toolgate con preguntas booleanas y umbrales.",
    args: ["emit-policy", "--for", "toolgate", "prog.json"], exit: 0,
    check: has(/questions:\s+destructive:\s+type: boolean[\s\S]*thresholds:/, "tiene la pregunta booleana y los umbrales"),
  },
  {
    id: "emit-policy-bouncer-starts-in-observe",
    why: "`emit-policy --for bouncer` genera una política que arranca en modo observe (solo registra), como avisa su cabecera.",
    args: ["emit-policy", "--for", "bouncer", "prog.json"], exit: 0,
    check: has(/mode: observe[\s\S]*then: deny/, "arranca en observe y conserva la regla de denegar"),
  },
  {
    id: "emit-policy-unknown-target",
    why: "Un destino desconocido es un error (exit 1) que lista los conocidos.",
    args: ["emit-policy", "--for", "nope", "prog.json"], exit: 1,
    check: has(/Known: bouncer, toolgate/, "lista bouncer y toolgate"),
  },
  {
    id: "emit-policy-invalid-program",
    why: "Un JSON que no es un programa jevc se rechaza (exit 1) y dice qué forma esperaba.",
    args: ["emit-policy", "--for", "toolgate", "bad-prog.json"], exit: 1,
    check: has(/is not a jevc program/, "dice que no es un programa jevc"),
  },
  {
    id: "emit-policy-needs-target",
    why: "Sin `--for` es un error de uso (exit 1).",
    args: ["emit-policy", "prog.json"], exit: 1,
  },
];
