/**
 * Casos de anofox-decide (extensión de DuckDB). Cada caso es SQL contra la extensión cargada; el proveedor
 * es el simulador de scripts/lib/stub-provider.mjs, así que se mide el envoltorio (aperturas, errores, qué
 * se envía), nunca la calidad de ningún modelo. La clave es inventada y solo vale en 127.0.0.1.
 */
const KEY = "clave-inventada";
const Q = "A refund is requested.";
const first = (r) => r.rows?.[0]?.[0];
const near = (a, b, eps = 1e-6) => typeof a === "number" && Math.abs(a - b) < eps;
const body = (r, i = 0) => r.requests?.[i]?.body;
const crit = (r) => Object.values(body(r)?.questions ?? {})[0]?.criteria;

export const decideCases = () => [
  {
    id: "loads-from-community",
    why: "La extensión viene del repositorio `community` de DuckDB (firmado), sin `-unsigned`.",
    sql: ["SELECT extension_version, installed_from FROM duckdb_extensions() WHERE extension_name = 'anofox_decide'"],
    check: (r) => (r.rows?.[0]?.[1] === "community" ? [] : ["no se instaló desde community"]),
    observe: (r) => ({ version: r.rows?.[0]?.[0], from: r.rows?.[0]?.[1] }),
  },
  {
    id: "doctor-reports-telemetry-off",
    why: "Con `DATAZOO_DISABLE_TELEMETRY=1`, `decide_doctor()` declara la telemetría apagada y no hay llamadas remotas.",
    sql: ["SELECT item, status, detail FROM decide_doctor()"],
    check: (r) => {
      const t = r.rows?.find((x) => x[0] === "telemetry");
      return t?.[1] === "ok" && /off/.test(t[2]) ? [] : ["la telemetría no consta apagada"];
    },
    observe: (r) => ({ items: Object.fromEntries((r.rows ?? []).map((x) => [x[0], x[1]])) }),
  },
  {
    id: "stub-model-is-a-constant",
    why: "El modelo de pega `stub` devuelve 0,5 sin enviar nada: no es un modelo.",
    sql: [`SELECT decide_probability('cualquier cosa [p=0.99]', '${Q}', model := 'stub')`],
    check: (r) => (near(first(r), 0.5) && r.requests.length === 0 ? [] : [`devolvió ${first(r)} con ${r.requests.length} peticiones`]),
  },
  {
    id: "remote-is-off-by-default",
    why: "Un modelo remoto registrado no se llama sin `anofox_decide_allow_remote`: error que dice qué ejecutar y cero peticiones.",
    setup: ["SELECT decide_register_model('sys', 'systemone', MAP {'endpoint': 'http://127.0.0.1:{{PORT}}'})"],
    sql: [`SELECT decide_probability('hola [p=0.85]', '${Q}', model := 'sys')`],
    check: (r) => {
      const p = [];
      if (!/remote calls are off/.test(r.error ?? "")) p.push("no avisa de que las llamadas remotas están apagadas");
      if (!/SET anofox_decide_allow_remote/.test(r.error ?? "")) p.push("el error no dice qué ejecutar");
      if (r.requests.length) p.push(`${r.requests.length} peticiones salieron igualmente`);
      return p;
    },
  },
  {
    id: "probability-reads-the-answer",
    why: "`decide_probability` devuelve la probabilidad que da el proveedor y envía una sola pregunta binaria.",
    remote: true,
    sql: [`SELECT decide_probability('hola [p=0.85]', '${Q}', model := 'sys')`],
    check: (r) => {
      const p = [];
      if (!near(first(r), 0.85)) p.push(`devolvió ${first(r)}`);
      if (r.requests.length !== 1) p.push(`${r.requests.length} peticiones`);
      if (Object.values(body(r)?.questions ?? {})[0]?.type !== "noul") p.push("la pregunta no es binaria");
      return p;
    },
    observe: (r) => ({ model_sent: body(r)?.model, auth_header: r.requests[0]?.auth }),
  },
  {
    id: "probability-extremes",
    why: "Las probabilidades 0 y 1 llegan tal cual.",
    remote: true,
    sql: [`SELECT decide_probability('a [p=0]', '${Q}', model := 'sys'), decide_probability('b [p=1]', '${Q}', model := 'sys')`],
    check: (r) => (near(r.rows?.[0]?.[0], 0) && near(r.rows?.[0]?.[1], 1) ? [] : [`devolvió ${JSON.stringify(r.rows)}`]),
  },
  {
    id: "choice-picks-the-option",
    why: "`decide_choice` devuelve la opción elegida y manda las opciones como criterios.",
    remote: true,
    sql: ["SELECT decide_choice('reembolso [pick=defect]', 'Which team owns this?', ['billing','defect','other'], model := 'sys')"],
    check: (r) => {
      const p = [];
      if (first(r) !== "defect") p.push(`eligió ${first(r)}`);
      if (JSON.stringify(Object.keys(crit(r) ?? {})) !== JSON.stringify(["billing", "defect", "other"])) p.push("criterios distintos de las opciones");
      return p;
    },
  },
  {
    id: "choice-distribution-sums-to-one",
    why: "`decide_choice_distribution` da un mapa con una clave por opción y suma 1.",
    remote: true,
    sql: ["SELECT decide_choice_distribution('x [pick=other]', 'Which team?', ['billing','defect','other'], model := 'sys')"],
    check: (r) => {
      const m = first(r) ?? {};
      const sum = Object.values(m).reduce((a, b) => a + b, 0);
      return Object.keys(m).length === 3 && near(sum, 1, 1e-9) ? [] : [`mapa ${JSON.stringify(m)}`];
    },
  },
  {
    id: "choice-with-thirty-options-over-http",
    why: "Con un proveedor remoto no rige el tope de 24 opciones del modelo local: 30 opciones salen y se contestan.",
    remote: true,
    sql: [`SELECT decide_choice('x [pick=o29]', 'Which?', list_transform(range(30), lambda i: 'o' || i), model := 'sys')`],
    check: (r) => (first(r) === "o29" ? [] : [`devolvió ${first(r)} (${(r.error ?? "").slice(0, 120)})`]),
  },
  {
    id: "score-expected-level",
    why: "`decide_score` acepta las probabilidades como mapa y devuelve el nivel que da el proveedor; observación: no lo recalcula (el esperado sería 1,7).",
    remote: true,
    sql: ["SELECT decide_score('x [scoremap][pick=2]', 'How frustrated?', ['calm','frustrated','angry'], model := 'sys')"],
    check: (r) => (near(first(r), 2) ? [] : [`devolvió ${first(r)} ${(r.error ?? "").slice(0, 100)}`]),
    observe: (r) => ({ returned: first(r), expected_from_distribution: 1.7 }),
  },
  {
    id: "score-rejects-a-probability-list",
    why: "Una respuesta de `score` con las probabilidades como lista (no como mapa «0».. «n-1») se rechaza con error, no se adivina.",
    remote: true,
    sql: ["SELECT decide_score('x [pick=2]', 'How frustrated?', ['calm','frustrated','angry'], model := 'sys')"],
    check: (r) => (/probabilities/.test(r.error ?? "") && r.rows === null ? [] : ["no rechazó la lista"]),
  },
  {
    id: "decision-applies-the-threshold",
    why: "`decide_decision` compara la probabilidad con el umbral dado.",
    remote: true,
    sql: [`SELECT decide_decision('a [p=0.9]', '${Q}', 0.5, model := 'sys'), decide_decision('b [p=0.3]', '${Q}', 0.5, model := 'sys'), decide_decision('c [p=0.3]', '${Q}', 0.2, model := 'sys')`],
    check: (r) => (JSON.stringify(r.rows?.[0]) === "[true,false,true]" ? [] : [`devolvió ${JSON.stringify(r.rows)}`]),
  },
  {
    id: "null-input-sends-nothing",
    why: "Un texto, pregunta u opciones NULL dan NULL sin resolver el modelo ni enviar nada.",
    remote: true,
    sql: [`SELECT decide_probability(NULL::VARCHAR, '${Q}', model := 'sys'), decide_probability('x', NULL::VARCHAR, model := 'sys'), decide_choice('x', 'Which?', NULL::VARCHAR[], model := 'sys')`],
    check: (r) => (JSON.stringify(r.rows?.[0]) === "[null,null,null]" && r.requests.length === 0 ? [] : [`${JSON.stringify(r.rows)} con ${r.requests.length} peticiones`]),
  },
  {
    id: "empty-options-refused-locally",
    why: "Una lista de opciones vacía se rechaza antes de enviar nada, con un ejemplo de cómo se escribe.",
    remote: true,
    sql: ["SELECT decide_choice('x', 'Which?', []::VARCHAR[], model := 'sys')"],
    check: (r) => (/options list is empty/.test(r.error ?? "") && r.requests.length === 0 ? [] : ["no la rechazó antes de enviar"]),
  },
  {
    id: "duplicate-options-collapse-silently",
    why: "Observación: dos opciones iguales se envían como un solo criterio, sin avisar.",
    remote: true,
    sql: ["SELECT decide_choice('x', 'Which?', ['a','a'], model := 'sys')"],
    check: (r) => (r.error ? [`error: ${r.error.slice(0, 100)}`] : []),
    observe: (r) => ({ criteria_sent: Object.keys(crit(r) ?? {}), answered: first(r) }),
  },
  {
    id: "table-asks-once-for-several-questions",
    why: "`decide_table` con dos preguntas envía una sola petición y devuelve una fila por pregunta.",
    remote: true,
    sql: [`SELECT question_id, kind, probability, choice FROM decide_table('Factura mal [p=0.9][pick=defect]', '[{"id":"refund","kind":"binary","instruction":"${Q}"},{"id":"team","kind":"choice","instruction":"Which team?","options":["billing","defect","other"]}]', model := 'sys')`],
    check: (r) => {
      const p = [];
      if (r.requests.length !== 1) p.push(`${r.requests.length} peticiones`);
      const ids = (r.rows ?? []).map((x) => x[0]).sort().join();
      if (ids !== "refund,team") p.push(`filas ${ids}`);
      return p;
    },
  },
  {
    id: "max-questions-is-enforced",
    why: "`anofox_decide_max_questions` rechaza una llamada con más preguntas, sin enviar nada.",
    remote: true,
    setup: ["SET anofox_decide_max_questions = 1"],
    sql: [`SELECT * FROM decide_table('x', '[{"id":"a","kind":"binary","instruction":"A?"},{"id":"b","kind":"binary","instruction":"B?"}]', model := 'sys')`],
    check: (r) => (r.error && r.requests.length === 0 ? [] : ["no aplicó el tope"]),
    observe: (r) => ({ error: (r.error ?? "").slice(0, 160) }),
  },
  {
    id: "answers-one-request-per-row",
    why: "Puntuar 20 filas con `decide_answers` hace una petición por fila, como declara la doc.",
    remote: true,
    sql: [`SELECT count(*) FROM (SELECT unnest(decide_answers('fila ' || i, '[{"id":"q","kind":"binary","instruction":"${Q}"}]', model := 'sys'), recursive := true) FROM range(20) t(i))`],
    check: (r) => (r.requests.length === 20 && first(r) === 20 ? [] : [`${r.requests.length} peticiones, ${first(r)} filas`]),
  },
  {
    id: "server-error-is-retried-then-reported",
    why: "Un 500 se reintenta y acaba en un error de E/S que dice que no es culpa de la consulta.",
    remote: true,
    sql: [`SELECT decide_probability('x [http=500]', '${Q}', model := 'sys')`],
    check: (r) => (/HTTP 500/.test(r.error ?? "") && /attempts/.test(r.error ?? "") ? [] : [`error: ${(r.error ?? "ninguno").slice(0, 120)}`]),
    observe: (r) => ({ requests_sent: r.requests.length, elapsed_ms: r.elapsed_ms }),
  },
  {
    id: "non-json-body-is-an-error",
    why: "Un cuerpo 200 que no es JSON da un error que señala el endpoint, no un valor.",
    remote: true,
    sql: [`SELECT decide_probability('x [badjson]', '${Q}', model := 'sys')`],
    check: (r) => (/JSON/i.test(r.error ?? "") && r.rows === null ? [] : [`error: ${(r.error ?? "ninguno").slice(0, 120)}`]),
  },
  {
    id: "wrong-shape-is-an-error",
    why: "Un JSON sin `answers` da un error que dice qué comprobar.",
    remote: true,
    sql: [`SELECT decide_probability('x [badshape]', '${Q}', model := 'sys')`],
    check: (r) => (/answers/.test(r.error ?? "") && r.rows === null ? [] : [`error: ${(r.error ?? "ninguno").slice(0, 120)}`]),
  },
  {
    id: "probability-out-of-range-is-an-error",
    why: "Una probabilidad fuera de [0, 1] se rechaza, no se recorta.",
    remote: true,
    sql: [`SELECT decide_probability('x [toosure]', '${Q}', model := 'sys')`],
    check: (r) => (r.error && r.rows === null ? [] : [`devolvió ${first(r)}`]),
  },
  {
    id: "key-is-not-used-for-another-host",
    why: "Un secreto con otro `SCOPE` no se envía al endpoint local: sin clave aplicable, ninguna cabecera lleva la inventada.",
    setup: [
      "SET anofox_decide_allow_remote = true",
      "SELECT decide_register_model('sys', 'systemone', MAP {'endpoint': 'http://127.0.0.1:{{PORT}}'})",
      `CREATE SECRET (TYPE anofox_decide, API_KEY '${KEY}', SCOPE 'api.typesafe.ai')`,
    ],
    sql: [`SELECT decide_probability('x [p=0.5]', '${Q}', model := 'sys')`],
    check: (r) => (r.requests.some((q) => (q.auth ?? "").includes(KEY)) ? ["la clave de otro host viajó al endpoint local"] : []),
    observe: (r) => ({ requests_sent: r.requests.length, error: (r.error ?? "").slice(0, 160) }),
  },
  {
    id: "secret-is-write-only",
    why: "El secreto no se ve con `duckdb_secrets()` ni en `decide_models()`.",
    remote: true,
    sql: ["SELECT secret_string FROM (SELECT to_json(s)::VARCHAR AS secret_string FROM duckdb_secrets() s) UNION ALL SELECT to_json(m)::VARCHAR FROM decide_models() m"],
    check: (r) => (JSON.stringify(r.rows).includes(KEY) ? ["la clave aparece en claro"] : []),
  },
  {
    id: "text-reaches-the-provider-after-opt-in",
    why: "Observación: tras el opt-in, el texto evaluado sale entero hacia el proveedor, secretos incluidos (no se redacta).",
    remote: true,
    sql: [`SELECT decide_probability('token sk-falso-0000-no-es-real [p=0.5]', '${Q}', model := 'sys')`],
    check: () => [],
    observe: (r) => ({ secret_shaped_value_sent: JSON.stringify(r.requests.map((q) => q.body)).includes("sk-falso-0000") }),
  },
  {
    id: "metrics-on-known-data",
    why: "Exactitud, Brier, AUC y log-loss coinciden con el cálculo a mano sobre cuatro filas.",
    sql: ["SELECT decide_accuracy(p, y, 0.5), decide_brier_score(p, y), decide_auc(p, y), decide_log_loss(p, y) FROM (VALUES (0.9, true), (0.8, true), (0.3, false), (0.6, false)) t(p, y)"],
    check: (r) => {
      const [acc, brier, auc, ll] = r.rows?.[0] ?? [];
      const p = [];
      if (!near(acc, 0.75)) p.push(`exactitud ${acc}`);
      if (!near(brier, 0.125)) p.push(`Brier ${brier}`);
      if (!near(auc, 1)) p.push(`AUC ${auc}`);
      if (!near(ll, 0.400365, 1e-5)) p.push(`log-loss ${ll}`);
      return p;
    },
    observe: (r) => ({ values: r.rows?.[0] }),
  },
  {
    id: "metrics-skip-nulls-and-empty-input",
    why: "Observación: las métricas ignoran las filas NULL y sobre una entrada vacía no fallan.",
    sql: ["SELECT decide_accuracy(p, y, 0.5), (SELECT decide_accuracy(p, y, 0.5) FROM (SELECT 0.5::DOUBLE p, true y) WHERE false) FROM (VALUES (0.9, true), (NULL, false), (0.1, false)) t(p, y)"],
    check: (r) => (r.error ? [`error: ${r.error.slice(0, 120)}`] : near(r.rows?.[0]?.[0], 1) ? [] : [`exactitud ${r.rows?.[0]?.[0]}`]),
    observe: (r) => ({ values: r.rows?.[0] }),
  },
  {
    id: "calibration-fit-returns-platt",
    why: "`decide_fit_calibration` con resultados mezclados devuelve una calibración `platt:a,b`.",
    sql: ["SELECT decide_fit_calibration(p, y) FROM (VALUES (0.9, true), (0.8, true), (0.7, true), (0.6, false), (0.4, true), (0.3, false), (0.2, false), (0.1, false)) t(p, y)"],
    check: (r) => (/^platt:/.test(first(r) ?? "") ? [] : [`devolvió ${first(r)} ${(r.error ?? "").slice(0, 100)}`]),
    observe: (r) => ({ fit: first(r) }),
  },
  {
    id: "calibration-fit-refuses-one-class",
    why: "Sin ambos resultados la calibración se niega en vez de inventar una.",
    sql: ["SELECT decide_fit_calibration(p, y) FROM (VALUES (0.9, true), (0.8, true), (0.7, true)) t(p, y)"],
    check: (r) => (r.error || first(r) === null ? [] : [`devolvió ${first(r)}`]),
    observe: (r) => ({ error: (r.error ?? "").slice(0, 160), value: first(r) }),
  },
  {
    id: "local-model-never-downloads-by-itself",
    why: "Un modelo local sin bajar falla con la orden que lo baja; no descarga pesos por su cuenta.",
    sql: [`SELECT decide_probability('x', '${Q}', model := 'laya-multilingual')`],
    check: (r) => (r.error && /decide_download/.test(r.error) ? [] : [`error: ${(r.error ?? "ninguno").slice(0, 160)}`]),
    observe: (r) => ({ error: (r.error ?? "").slice(0, 200) }),
  },
];
