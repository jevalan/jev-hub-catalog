# jevalan-hub-scout — diseño

**Estado:** borrador de diseño, pendiente de revisión antes del plan de implementación.

Repositorio independiente en `E:/workspace/personal/jev/jevalan-hub-scout`. No modifica `jev-awesome`, `jevalan` ni ninguno de los clones: los lee.

## 1. Propósito

Sirve a tres decisiones a la vez, y hay que decir en qué orden, porque tiran en direcciones opuestas:

1. **Recurso público del ecosistema Jev** — quiere amplitud: veredicto barato para muchas entradas.
2. **Decidir qué adaptar a jevalan** — quiere un ranking: coste frente a valor.
3. **Probar de verdad** — quiere profundidad: clonar, invocar y medir, con presupuesto declarado.

La resolución es un diseño en capas: **triaje masivo barato → veredicto profundo sobre una shortlist → publicación con la profundidad declarada por entrada**. Nunca se presenta una estimación como si fuera una medida.

## 2. Qué reutiliza en lugar de reinventar

| Necesidad | Fuente | Cómo se usa |
| --- | --- | --- |
| Universo de proyectos | `jev-awesome/awesome-jev/data/projects.json` (1351 entradas, `updated` 2026-10-07) | Copia pinneada en `data/catalog.json` con su fecha de corte. No se edita |
| Eje *fit* (¿esto es una decisión?) | `jev-awesome/docs/agents-tooling-clasificacion.md` (7 grupos, 305 entradas) | Pasa a `data/fit.json` en forma máquina y reproducible |
| Patrón común del ecosistema | `jev-awesome/docs/patron-recurrente-agent-tooling.md` | Fundamenta los ejes: estado → pregunta acotada → política local |
| Envoltorio del hub | `jev-awesome/docs/hub-contract.md` y `jevalan/capabilities/*.yaml` | Define los valores de `form`: `flow` \| `exec` \| `http` |
| Forma del pipeline | `awesome-jev/scripts/*.mjs` | Cero dependencias, solo stdlib de Node, `data/` → `README.md` + `site/index.html` generados |
| Regla editorial | `jev-awesome/README.md` («no se han ejecutado tests…»), `toolgate/SECURITY.md` | Se convierte en el campo `evidence` de cada veredicto |

## 3. Evidencia previa que motiva el diseño

De la sesión de análisis de 13 clones ya se conocen resultados reales. **Es el conjunto de calibración del detector de triaje: lo que el detector diga de estos 13 debe coincidir con esta tabla.**

| Proyecto | Catálogo | Estrellas | Superficies observadas | `callable` | `form` |
| --- | --- | ---: | --- | --- | --- |
| toolgate | **`research`** | 2 | `.claude-plugin/plugin.json`, `hooks/hooks.json`, `bin` → `dist/cli.js`, `src/mcp.ts`, exports de librería | cli, mcp, hook, lib | `exec` (**ya adaptado en jevalan**) |
| canny | `agents` | 121 | sin `.claude-plugin`; escribe `.claude/settings.json` y `.codex/hooks.json`; `bin`; **sin** MCP; **sin** exports | cli | `exec` (necesita shim) |
| jevwire | `agents` | 21 | `.claude-plugin/` + marketplace, `bin` → MCP stdio, `exports` → librería; **no publicado en npm** | cli, mcp, lib | `exec` (necesita wrapper MCP) |
| winnow | `agents` | 102 | `.claude-plugin/`, `.mcp.json`, console script Python, `hooks/hooks.json` + módulo TS | mcp, cli | **n/a** (expone `winnow_recall`/`winnow_stats`, no un veredicto) |
| fast-jev-compaction | `agents` | 7458 | `.claude-plugin/`; **sin** `bin`, **sin** MCP; `exports` → librería | lib | **n/a** (devuelve contenido, no veredicto) |
| wakegate | **no está** | — | sin plugin, sin MCP, sin `bin`; `exports` → `shouldWake()` | lib | **n/a** (ja cubierto por un flujo) |
| spending-effort-with-jev | `agents` | 6 | `.claude-plugin/` + `hooks.json` (`register.tsx`); requiere Claude Code ≥ 2.1.287 | hook (mod) | **n/a** (sin superficie invocable) |
| switchboard | `agents` | 15 | `bin` → lanzador `claude`/`codex`; sin MCP | cli | **n/a** (no expone el clasificador) |
| skillranker | `agents` | 128 | binario Rust `sr`, hook `UserPromptSubmit`; **Unix-only** | cli | `exec` (bloqueado en Windows) |
| médula | **no está** | — | `pyproject`, servidor local + SQLite + app de demo | http, lib | `http` (pesado) |
| typesafe-sdk-js | `official` | 269 | librería cliente | lib | n/a (es transporte) |
| typesafe-sdk-python | `official` | 272 | librería cliente | lib | n/a (es transporte) |
| system-one-adapter-python | `official` | 381 | librería; expone cualquier LLM como cliente System One | lib | n/a (es un puente de backend) |

Tres hallazgos que el diseño debe asumir:

1. **El catálogo y la muestra no son subconjuntos.** 11 de 13 están en el catálogo; **médula y wakegate no aparecen** (0 coincidencias, tampoco en `exclude.json`), y **toolgate está en `research`, no en `agents`**. Filtrar por `category = agents` deja fuera el firewall que jevalan ya sirve en producción.
2. **Estrellas y fit no coinciden.** El top-10 de `agents` por estrellas incluye solo 1 proyecto ya analizado; toolgate tiene ★2. La mediana de `agents` es 6 estrellas y solo 32 superan las 100. Estrellas miden popularidad, no encaje.
3. **La mitad del ecosistema no tiene decisión que servir.** De los 13, cinco no encajan en el modelo del hub (winnow, fast-jev-compaction, spending-effort, switchboard, y los 3 SDKs). El primer eje del veredicto es «¿hay una decisión?», no «¿es difícil?».

## 4. Cohortes

| Cohorte | Contenido | Cómo se trata |
| --- | --- | --- |
| **A — referencia fija** | Los 13 clones ya analizados, incluidos los 3 que no están en el catálogo y el que está en `research` | Veredicto completo y **medido** cuando se pueda. Es el banco de calibración |
| **B — por fit** | ~174 candidatos: los grupos *routing* (81), *revisión y evidencia* (38), *contexto y memoria* (26), *gates y permisos* (25), *supervisión* (4) | Orden: `invocable` → estrellas → nombre. Solo los invocables pasan a smoke test |
| **C — resto** | Las restantes entradas del catálogo (y, si se decide, las 1351) | Triaje de metadata, marcadas `not_assessed`. Amplitud sin fingir profundidad |

Fuera de cohorte B queda el grupo *interfaces Jev y harnesses* (119): es transporte (MCP, hooks, CLI), no decisión. Se puede evaluar aparte con el eje `callable`, sin veredicto de `form`.

## 5. Los cinco ejes del veredicto

Separados a propósito: un proyecto puede tener decisión y ninguna forma de invocarla, o ser invocable y no tener decisión.

| Eje | Valores | Qué responde |
| --- | --- | --- |
| `decision` | `yes` \| `no` \| `unclear` | ¿Hay una pregunta acotada que el hub pueda enrutar? |
| `form` | `flow` \| `exec` \| `http` \| `n_a` | ¿Cómo la serviría jevalan? `n_a` incluye "no aplica" y "no encaja" |
| `callable` | `cli` \| `mcp` \| `http` \| `hook` \| `lib` \| `none` (lista) | ¿Qué expone hoy para hablarle? |
| `cost` | `{ runtime, requires_key, host }` | Node/Python/Rust/none; `typesafe`/`openrouter`/`none`/otro; `any`/`unix`/`windows` |
| `evidence` | `static` \| `measured` | ¿Se leyó el código o se ejecutó? |

`cost` no incluye dinero a propósito: el laboratorio de jevalan ya lleva presupuesto y precios, y aquí se falsearía sin tarifas reales.

## 6. Modelo de datos

```
data/catalog.json        # snapshot pinneado del universo (con updated + source)
data/fit.json            # los 7 grupos funcionales en forma máquina
data/assessments.json    # los veredictos: la pieza que crece
data/triage-cache/       # árboles de GitHub cacheados, uno por repo (reanudable)
runs/<fecha>-<repo>/     # un smoke test medido: manifest.json, log, veredicto
site/                    # generado
README.md                # generado
```

`data/fit.json`:

```json
{
  "source": "jev-awesome/docs/agents-tooling-clasificacion.md",
  "generated": "2026-10-10",
  "groups": [
    { "id": "routing", "title": "Routing y selección", "count": 81, "decision": true },
    { "id": "review", "title": "Revisión y evidencia", "count": 38, "decision": true },
    { "id": "context", "title": "Contexto y memoria", "count": 26, "decision": true },
    { "id": "gates", "title": "Gates y permisos", "count": 25, "decision": true },
    { "id": "supervision", "title": "Supervisión y coordinación", "count": 4, "decision": true },
    { "id": "interfaces", "title": "Interfaces y harnesses", "count": 119, "decision": false },
    { "id": "domain", "title": "Tareas de dominio", "count": 12, "decision": false }
  ],
  "members": { "Brainwires/jevwire": "interfaces", "qkal/Canny": "review" }
}
```

`members` cubre **solo las 305 entradas de `agents`**, que es lo que clasificó el documento fuente. Una entrada de la cohorte A que no esté ahí (toolgate está en `research`; médula y wakegate no están en el catálogo) lleva `fit: "inferred"` y no aparece en `members`: su grupo se deduce del código, y el veredicto lo declara. `npm run fit` falla si `members` tiene una clave que no sea de `agents`, o si los recuentos por grupo no suman 305.

`data/assessments.json`, una entrada por proyecto:

```json
{
  "updated": "2026-10-10",
  "assessments": [
    {
      "repo": "RiskAverseTech/toolgate",
      "name": "toolgate (RiskAverseTech)",
      "cohort": "A",
      "in_catalog": true,
      "catalog_category": "research",
      "stars": 2,
      "language": "TypeScript",
      "decision": "yes",
      "fit": "inferred",
      "form": "exec",
      "callable": ["cli", "mcp", "hook", "lib"],
      "cost": { "runtime": "node", "requires_key": ["typesafe", "openrouter"], "host": "any" },
      "evidence": "measured",
      "verdict": "Adaptado en jevalan como capacidad tool.risk (`node ${TOOLGATE_CLI} decide`).",
      "blockers": [],
      "capability": "tool.risk",
      "run": "runs/2026-10-10-toolgate"
    }
  ]
}
```

Reglas de validación: `cohort` coherente con el catálogo (una entrada `A` puede tener `in_catalog: false`); `evidence: measured` **exige** un `run` existente; `form: n_a` exige un `verdict` que explique por qué; `fit` es un `id` de grupo o `inferred`; `requires_key` es lista (vacía si no pide clave); ningún `repo` duplicado; `callable` nunca vacío (usa `["none"]`).

## 7. Triaje sin clonar

Una llamada por repo a la API de árbol de GitHub devuelve todas las rutas, y con eso se deduce la forma probable sin descargar nada:

| Señal en el árbol | Deducción |
| --- | --- |
| `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json` | Plugin de Claude Code |
| `hooks/hooks.json` | Se engancha a eventos del host |
| `.mcp.json` o `mcpServers` en el manifiesto | Servidor MCP (candidato `http`/`exec` directo) |
| `.claude/settings.json` escrito por el CLI | Hook instalado en tiempo de ejecución, no declarado |
| `bin` en `package.json`, `[[bin]]` en `Cargo.toml`, `console_scripts` en `pyproject.toml` | CLI |
| `exports`/`main` sin `bin` | Solo librería |
| `plugin.json` con `userConfig` + módulo `.tsx` | Mod del host, sin superficie |

**Restricción real:** la API de GitHub sin token son 60 req/h y el triaje necesita ~305 → o `GITHUB_TOKEN` (5000/h) o `data/triage-cache/` reanudable entre ejecuciones. Para el modo con token hay un límite duro que respetar: cada repo se pide **una sola vez** y el árbol se cachea; sin caché, un fallo de red obliga a empezar de cero.

## 8. Capa medida (smoke test)

Solo sobre la shortlist de las cohortes A y B que el triaje marque como invocables.

- **Offline primero.** Igual que el laboratorio de jevalan: primero una grabación o un modo `--offline`/`--dry-run`/`--fake` si el proyecto lo ofrece; solo después se gasta en una llamada real.
- **Sin herramientas ni efectos.** El smoke test invoca la superficie de decisión con entradas sintéticas y **nunca** ejecuta la acción que la herramienta proponga.
- **Claves fuera del repo.** Vía entorno; los identificadores de clave se registran como booleanos (`requires_key: true`), jamás su valor.
- **Un `run` por intento**: comando exacto, versión del proyecto (commit), fecha, latencia, resultado, y si se usó red.
- **Resultados válidos que no son éxitos**: `bloqueado por plataforma` (skillranker en Windows), `requiere clave ausente`, `no expone superficie`. Un veredicto negativo medido vale más que una estimación positiva.
- **Repetibilidad declarada**: offline debe dar el mismo resultado byte a byte; live solo promete el procedimiento, no la respuesta. Es la distinción que ya fija `agent-tooling-pruebas-reproducibles.md`.

## 9. Pipeline y comandos

```
npm run triage      # 1 llamada API por repo (usa caché) -> forma probable
npm run fit         # valida data/fit.json contra los recuentos del catálogo
npm run validate    # esquema de assessments, cohortes, evidencia, duplicados
npm run build       # README.md + site/index.html (generados)
npm run probe -- <repo>   # smoke test de un proyecto -> runs/<fecha>-<repo>/
```

Cero dependencias y solo stdlib de Node, igual que `awesome-jev`: no hay `npm install`. Node ≥ 20. `GITHUB_TOKEN` opcional para `triage`.

## 10. Criterios de aceptación

1. El detector de triaje reproduce la tabla de la sección 3 para los 13 clones (13/13), incluidas las dos entradas que no están en el catálogo.
2. `npm run validate` falla si una entrada declara `evidence: measured` sin `run`, o si un `form: n_a` no explica el motivo.
3. Ninguna entrada presenta una estimación como medida: cada veredicto público muestra su `evidence`.
4. El `README.md` y el sitio dicen explícitamente cuántas entradas están evaluadas, cuántas solo triadas y cuántas sin tocar.
5. Un `probe` de un proyecto sin superficie **no** clona nada: sale con veredicto `no expone superficie` desde el triaje.
6. `toolgate`, `médula` y `wakegate` aparecen con veredicto completo aunque no estén en `agents` (toolgate está en `research`; los otros dos no están en el catálogo).
7. El repo no contiene ninguna clave ni ruta absoluta de la máquina en `data/`.

## 11. Fuera de alcance

- Publicar el sitio (Cloudflare/Wrangler) y elegir el dominio: fase posterior.
- Construir cualquier adaptador para jevalan: este repo **decide**, no adapta.
- Estimaciones en dinero: solo `requires_key` y `local`/`hosted`.
- Descubrimiento automático de proyectos nuevos: el universo entra desde el catálogo.
- Ejecutar los tests internos de los proyectos clonados: se mide la superficie de decisión, no su calidad.

## 12. Riesgos y límites

- **Las categorías del catálogo son editoriales y ruidosas**: el diseño lo compensa con `data/fit.json` como eje primario y cohortes explícitas, no confiando en `category`.
- **Cobertura desigual**: la cohorte A queda medida, la B triada, la C sin tocar. El recurso público debe mostrarlo, o repetirá el error que este análisis critica.
- **Clonado y plataforma**: algunos candidatos son Unix-only o requieren un host concreto (Claude Code ≥ 2.1.287). Se registran como bloqueos medidos, no como fallos.
- **Presión de tiempo**: 305 repos con caché y token son ~1 h de red; sin token, más de 5 h repartidas. El triaje debe ser reanudable.
- **Tentación de sobre-afirmar**: es el riesgo central. El campo `evidence` y los criterios 2, 3 y 4 existen para impedirlo.

## 13. Fases

| Fase | Entrega | Medida de que está hecha |
| --- | --- | --- |
| 1 — Esqueleto y cohorte A | `catalog.json`, esqueleto de `assessments.json` con los 13, `validate.mjs`, `build.mjs` | Criterios 1, 2, 5 y 7 en verde |
| 2 — Fit y triaje | `fit.json` completo y triaje de las 305 con caché | Los recuentos de `fit.json` cuadran con el catálogo |
| 3 — Capa medida | `probe.mjs` + `runs/` de la shortlist invocable | Al menos 3 proyectos con `evidence: measured` y su `run` |
| 4 — Publicación | README y sitio con el reparto evaluado/triado/sin tocar | Criterio 4 en verde |
