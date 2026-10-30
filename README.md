# jev hub catalog

Qué proyectos del ecosistema Jev puede servir el hub de jevalan, con qué forma y a qué coste.
Generado desde `data/assessments.json`. Snapshot del universo: 2026-10-07 (jev-awesome/awesome-jev/data/projects.json).

## Cobertura

17 triadas · 1 evaluadas (16 de las 18 analizadas están en el catálogo) · 1324 sin tocar, de 1340 entradas visibles del catálogo.

Un veredicto **triado** sale de leer el código; uno **medido** sale de ejecutarlo. No son lo mismo y aquí no se presentan como si lo fueran.

## Cohortes

- **A — referencia fija:** los 13 clones analizados a mano. Es el banco de calibración del detector.
- **B — por fit:** los candidatos de los grupos con decisión (routing, revisión, contexto, gates, supervisión).
- **C — resto:** el catálogo por metadata, sin veredicto profundo.

| Proyecto | Decisión | Forma | Invocable | Coste | Evidencia | Veredicto |
| --- | --- | --- | --- | --- | --- | --- |
| `tamaratran/fast-jev-compaction` | no | n_a | hook, lib | node + typesafe | estático | Devuelve un array de mensajes reescrito, no un veredicto: el hub no tiene dónde colocar esa salida. |
| `typesafe-ai/system-one-adapter-python` | no | n_a | lib | python | estático | Puente de backend: expone cualquier LLM compatible con OpenAI como cliente System One, así que sirve detrás de un flujo, no como especialista. |
| `typesafe-ai/typesafe-sdk-python` | no | n_a | lib | python | estático | SDK cliente: es transporte hacia un backend, no un especialista al que el hub pregunte. |
| `typesafe-ai/typesafe-sdk-js` | no | n_a | lib | node | estático | SDK cliente: es transporte hacia un backend, no un especialista al que el hub pregunte. |
| `Dicklesworthstone/skillranker` | yes | exec | cli, lib | rust + typesafe | estático | CLI con salida JSON y modos dry-run, offline y shadow: es el candidato más limpio como especialista exec. Su instalador y su manejo de procesos son Unix-only, así que en Windows queda bloqueado. |
| `qkal/Canny` | yes | exec | cli | node + typesafe | estático | Gate de cierre con ledger local. Su salida es un envelope de hook, así que necesitaría un shim que traduzca el ledger a un veredicto; además su valor está en el momento del Stop, que el hub no provoca. |
| `GhalebDweikat/winnow` | no | n_a | cli, mcp, hook, lib | python | estático | Sus tools MCP exponen recall y estadísticas, no un veredicto: la decisión de qué bloques conservar devuelve contenido transformado, así que no cabe en el modelo de outcome del hub. |
| `Brainwires/jevwire` | yes | exec | cli, mcp, hook, lib | node + typesafe | estático | Kit generalista con siete tools MCP y librería compartida. Adaptable como exec, pero necesita un wrapper que hable MCP y devuelva el JSON de decisión. |
| `ruban-24/switchboard` | no | n_a | cli, lib | node + typesafe/openrouter | estático | Lanzador/proxy para claude y codex: su clasificador es interno y no publica una superficie de decisión que el hub pueda enrutar. El documento clasificador lo sitúa en tareas de dominio, no en routing, aunque su función sea elegir modelo. |
| `Yaxin9Luo/spending-effort-with-jev` | no | n_a | hook | node + typesafe | estático | Mod de Claude Code: se registra dentro del host y no expone superficie invocable fuera de él. |
| `RiskAverseTech/toolgate` | yes | exec | cli, mcp, hook, lib | node + typesafe/openrouter | medido | Ya adaptado en jevalan como capacidad tool.risk (`node ${TOOLGATE_CLI} decide`). El CLI imprime veredicto, motivo, origen y probabilidades, y el hub mapea no-opinion a abstain y fail-mode a error. Medido de punta a punta sin claves (v0.16.0 tras el hub de jevalan): la regla estática decide y valida contra el esquema, el modo de fallo llega como error provider_failed y nunca como permiso, y entrada o versión incorrectas no llegan al especialista. NO medido: las decisiones que dependen del modelo (allow/ask con probabilidades), el plazo agotado y el coste. |
| `shitianfang/wakegate` | no | n_a | lib | node | estático | Librería pura (shouldWake), sin plugin ni CLI ni MCP. jevalan ya cubre la misma decisión con el flujo agent-wakeup, que además no arrastra runtime. |
| `JoaquinRuiz/medula` | yes | http | http, lib | python + openrouter | estático | Servidor local con SQLite y app de demostración: encajaría como proveedor http, pero arrastra su propio estado de escrituras y su andamiaje de laboratorio. |
| `gargpratyush/jev-router` | no | n_a | cli | node + typesafe | estático | Es un launcher y proxy de Claude Code y Codex: elige el tier del modelo en cada turno dentro de su propio proceso. `jev-explain` solo lee el último estado. No hay una petición que entre y un veredicto que salga, así que no cabe en el hub. |
| `BillionsBobby/JevRouter` | yes | exec | cli, mcp, lib | node + typesafe/openrouter | estático | `route` recibe un JSON con la petición y los candidatos y devuelve una decisión tipada con las probabilidades de Jev intactas y el campo `router` aparte. Por defecto solo decide, no ejecuta, y deja un recibo. `bin/` importa `dist/`, que se compila en `prepare`, así que hay que instalar antes de medirlo. |
| `TheoOliveira/pi-jev` | yes | exec | cli | node + typesafe | estático | Casi todo es una extensión de Pi, que no se puede llamar desde fuera. Lo único invocable es `pi-jev-gate -c <criterios>`, que lee el diff y sale con 0 si pasa y 1 si falla. Con `--fail-open` un error sale como exit 0, o sea como permiso: un shim tendría que mapear el exit 2 a `error` y no usar ese flag. Requiere `tsx`. |
| `GodsBoy/jev-agent-skill-router` | yes | exec | cli, lib | python + typesafe | estático | `jev-router route` recibe una petición y un catálogo y devuelve `route`, `no_skill` o `review` con la probabilidad de cada llamada; no carga ni ejecuta ninguna skill. Encaja con el modelo de outcome del hub sin shim. Su evaluación publicada es exploratoria y con datos reutilizados, así que no cuenta como medida nuestra. |
| `rhighs/jev-code` | no | n_a | cli, lib | node + typesafe | estático | Es un SDK para construir decisiones y un agente de código interactivo, no una decisión que servir. El instalador solo cubre macOS y Linux y el paquete no está en npm. |

## Aparcado

Aparcar no es descartar: son categorías que hoy no aportan al hub, con el motivo y lo que tendría que cambiar para volver a mirarlas.

| Categoría | Entradas | Por qué no aporta hoy | Cuándo revisarla |
| --- | --- | --- | --- |
| `games` | 85 | Son simulaciones y juegos: hoy no hay una decisión tipada que el hub de jevalan pueda servir con ellas. | Si jevalan quiere capacidades de simulación o de evaluación en entornos con reglas. Potencial alto: mirar la primera. |
| `demos` | 133 | Demostraciones y playgrounds: ilustran el uso de Jev, pero rara vez exponen una superficie invocable estable. | Si hace falta un banco de casos reales de uso, o patrones que reutilizar como capacidad. |
| `articles` | 53 | Artículos e hilos: no son software, casi ninguno tiene repo. | Si se quiere extraer patrones de decisión de la literatura para diseñar capacidades nuevas. |
| `lists` | 39 | Otras listas awesome: sirven de fuente de descubrimiento, no de capacidad. | Cuando se quiera ampliar el universo con proyectos que awesome-jev aún no recoja. |
| `official` | 20 | Documentación y recursos oficiales de TypeSafe: contexto de referencia, no capacidades a servir. | Cuando cambie el contrato del modelo o aparezcan nuevos primitivos que el hub deba soportar. |
| `sdks` | 100 | SDKs y clientes del modelo: son el transporte hacia Jev, no una decisión que servir. | Si jevalan necesita clientes en otros lenguajes, o reutilizar su manejo de errores y reintentos. |

Candidatas, pendientes de evaluar: `agents` (303), `research` (284), `apps` (163), `integrations` (49), `browser` (111).
