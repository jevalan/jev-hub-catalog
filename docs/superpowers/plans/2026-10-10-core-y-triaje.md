# Hub Scout Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir el núcleo de `jevalon-hub-scout`: snapshot del universo, eje *fit* importado en forma máquina, los 13 veredictos de la cohorte A, validador, README y sitio generados, y el triaje por árbol de GitHub calibrado contra esos 13.

**Architecture:** Pipeline de datos puro. `data/*.json` es la fuente de verdad, `scripts/validate.mjs` la protege con reglas, `scripts/build.mjs` genera los dos artefactos públicos, y `scripts/triage.mjs` **sugiere** `callable` desde el árbol de ficheros (con caché en disco) mientras `assessments.json` manda. Los fixtures de calibración se generan una vez desde la API real y a partir de ahí todo se prueba offline.

**Tech Stack:** Node ≥ 20, solo librería estándar (`node:fs`, `node:test`, `node:assert`). Cero dependencias, sin `npm install`. Mismo estilo que `awesome-jev/scripts/*.mjs`.

**Spec:** `docs/superpowers/specs/2026-10-10-hub-scout-design.md`

## Global Constraints

- Repositorio en `E:/workspace/personal/jev/jevalon-hub-scout`. **Solo lee** el árbol de análisis, que vive fuera y en otra unidad (`G:/dev/jev/jev-awesome`, movido desde `E:` por falta de espacio); nunca lo modifica. Toda ruta hacia él pasa por `SOURCES` en `scripts/lib/paths.mjs`, con `SCOUT_SOURCES` como override.
- **Cero dependencias.** Sin `dependencies` ni `devDependencies`. Sin `npm install`. Solo stdlib de Node.
- Node ≥ 20 (`engines.node`), ESM (`.mjs`), 2 espacios, comillas dobles, punto y coma.
- **`README.md` y `site/index.html` son generados.** No se editan a mano.
- **Regla de evidencia:** `evidence: "measured"` exige un `run` existente en `runs/<fecha>-<repo>/`. En este plan **todas** las entradas son `static`: no hay `probe.mjs` (fase 3).
- **Ninguna clave ni ruta absoluta de la máquina** en `data/`. Las claves se registran como lista de nombres (`requires_key: ["typesafe"]`), nunca como valor.
- **Recuentos exactos, copiados de la spec:** grupos fit `routing=81`, `review=38`, `context=26`, `gates=25`, `supervision=4`, `interfaces=119`, `domain=12` → **305**. Grupos con decisión (`routing`, `review`, `context`, `gates`, `supervision`) → **174**.
- Universo de `data/fit.json`: **solo** las 305 entradas `category === "agents"`. Una entrada de la cohorte A fuera de ahí lleva `fit: "inferred"`.
- Cifras del catálogo pinneado: **1351** entradas, **11** con `gone` → **1340** visibles.
- El shell de este harness **no tiene `grep`, `head`, `wc`, `find` ni `ls`**: para inspeccionar ficheros, usa `node -e`.
- **No commitear sin que el humano lo pida explícitamente.** Los pasos de commit son para el ejecutor, que recibe esa autorización al arrancar.

## Review Focus

Cinco condiciones que la spec implica y que ningún test de tarea ejercita por sí sola, de más a menos probable:

1. **Entrada del catálogo con `repo: null`** (solo `site` o `url`, típico de `articles`). El triaje no debe llamar a la API ni inventarse un repo.
2. **Entradas `gone: true`** (11). No se trian ni cuentan como evaluadas.
3. **Repo renombrado o desaparecido durante el triaje** (404/451): se registra como `gone` y la tanda sigue.
4. **Diferencia de mayúsculas** entre el catálogo y GitHub (`qkal/Canny`): la clave de caché y de comparación va en minúsculas, o la calibración de canny falla.
5. **Agotar el límite de la API a media tanda**: una entrada sin caché no puede quedar como evaluada; la ejecución siguiente continúa donde se quedó.

---

## File Structure

| Fichero | Responsabilidad |
| --- | --- |
| `package.json` | Scripts npm, sin dependencias |
| `.gitignore` | `site/index.html`, `data/triage-cache/` |
| `scripts/pin-catalog.mjs` | Escribe `data/catalog.json` desde el árbol de análisis |
| `data/catalog.json` | Snapshot pinneado del universo, con `source` y `updated` |
| `data/fit.json` | Los 7 grupos y su pertenencia (`members`, 305 claves) |
| `data/assessments.json` | Los veredictos. Aquí: los 13 de la cohorte A |
| `scripts/lib/paths.mjs` | Rutas del repo resueltas desde el módulo |
| `scripts/lib/json.mjs` | Lectura/escritura JSON canónica |
| `scripts/lib/fit-parse.mjs` | Parsea el documento fuente → grupos y `members` (puro) |
| `scripts/lib/validate-rules.mjs` | Reglas puras: no toca disco, devuelve errores |
| `scripts/lib/triage-signals.mjs` | Árbol + manifiestos → `{ callable, form_hint }` (puro) |
| `scripts/import-fit.mjs` | CLI que escribe `data/fit.json` desde el documento fuente |
| `scripts/validate.mjs` | CLI del validador |
| `scripts/build.mjs` | Genera `README.md` y `site/index.html` |
| `scripts/template.html` | Plantilla del sitio con marcadores `{{...}}` |
| `scripts/triage.mjs` | Árbol vía API de GitHub + manifiestos vía CDN cruda + caché |
| `scripts/make-fixtures.mjs` | Congela el árbol real de la cohorte A en fixtures |
| `tests/fixtures/trees/*.json` | Árboles congelados (calibración offline) |
| `tests/*.test.mjs` | Pruebas con `node:test` |

Los módulos de `lib/` no tocan red ni disco de datos: son funciones puras y por eso se prueban solas.

---

### Task 1: Esqueleto y utilidades de JSON

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `scripts/lib/paths.mjs`
- Create: `scripts/lib/json.mjs`
- Test: `tests/json.test.mjs`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `paths.mjs` → `ROOT`, `CATALOG`, `FIT`, `ASSESSMENTS`, `TRIAGE_CACHE`, `README`, `SITE`, `TEMPLATE` (rutas absolutas `string`).
  - `json.mjs` → `readJson(path): any`, `writeJson(path, value): void`.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/json.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readJson, writeJson } from "../scripts/lib/json.mjs";
import { ROOT, ASSESSMENTS } from "../scripts/lib/paths.mjs";

test("writeJson round-trips through readJson and ends with a newline", () => {
  const file = join(mkdtempSync(join(tmpdir(), "scout-")), "x.json");
  writeJson(file, { a: [1, 2] });
  assert.deepEqual(readJson(file), { a: [1, 2] });
  assert.equal(readFileSync(file, "utf8").endsWith("\n"), true);
});

test("paths resolve inside the repository", () => {
  assert.equal(ROOT.endsWith("jevalon-hub-scout"), true);
  assert.equal(ASSESSMENTS, join(ROOT, "data", "assessments.json"));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/json.test.mjs`
Expected: FAIL — `Cannot find module '../scripts/lib/json.mjs'`

- [ ] **Step 3: Write minimal implementation**

```javascript
// scripts/lib/paths.mjs
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const CATALOG = resolve(ROOT, "data", "catalog.json");
export const FIT = resolve(ROOT, "data", "fit.json");
export const ASSESSMENTS = resolve(ROOT, "data", "assessments.json");
export const TRIAGE_CACHE = resolve(ROOT, "data", "triage-cache");
export const README = resolve(ROOT, "README.md");
export const SITE = resolve(ROOT, "site", "index.html");
export const TEMPLATE = resolve(ROOT, "scripts", "template.html");
```

```javascript
// scripts/lib/json.mjs
import { readFileSync, writeFileSync } from "node:fs";

export function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function writeJson(path, value) {
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
}
```

```json
// package.json
{
  "name": "jevalon-hub-scout",
  "version": "0.0.1",
  "private": true,
  "description": "Mapa de adaptabilidad del ecosistema Jev a jevalon: qué proyectos puede servir el hub, con qué forma y a qué coste.",
  "type": "module",
  "scripts": {
    "fit": "node scripts/import-fit.mjs",
    "validate": "node scripts/validate.mjs",
    "build": "node scripts/build.mjs",
    "triage": "node scripts/triage.mjs",
    "fixtures": "node scripts/make-fixtures.mjs",
    "test": "node --test"
  },
  "engines": {
    "node": ">=20"
  },
  "license": "CC0-1.0"
}
```

```
# .gitignore
site/index.html
data/triage-cache/
node_modules/
.DS_Store
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/json.test.mjs`
Expected: PASS, 2 tests

- [ ] **Step 5: Commit**

```bash
git add package.json .gitignore scripts/lib/paths.mjs scripts/lib/json.mjs tests/json.test.mjs
git commit -m "feat: add the scout skeleton and canonical JSON helpers"
```

---

### Task 2: Snapshot del universo

**Files:**
- Create: `scripts/pin-catalog.mjs`
- Create: `data/catalog.json` (generado por el pineador)
- Test: `tests/catalog.test.mjs`

**Interfaces:**
- Consumes: `readJson`.
- Produces: `data/catalog.json` con `{ updated, source, categories, projects }`. Invariantes que el resto del plan asume: 1351 entradas, exactamente **305** con `category === "agents"`, **11** con `gone: true`, y una entrada `RiskAverseTech/toolgate` en `research`.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/catalog.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readJson } from "../scripts/lib/json.mjs";
import { CATALOG } from "../scripts/lib/paths.mjs";

const catalog = readJson(CATALOG);

test("the snapshot carries its source and cut-off date", () => {
  assert.match(catalog.source, /awesome-jev/);
  assert.match(catalog.updated, /^\d{4}-\d{2}-\d{2}$/);
});

test("the pinned counts hold", () => {
  assert.equal(catalog.projects.length, 1351);
  assert.equal(catalog.projects.filter((p) => p.category === "agents").length, 305);
  assert.equal(catalog.projects.filter((p) => p.gone).length, 11);
});

test("toolgate is present but NOT in agents", () => {
  const toolgate = catalog.projects.find((p) => p.repo === "RiskAverseTech/toolgate");
  assert.equal(toolgate.category, "research");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/catalog.test.mjs`
Expected: FAIL — `ENOENT: no such file or directory, open '.../data/catalog.json'`

- [ ] **Step 3: Pin the snapshot with a script, not a one-liner**

Nada de rutas absolutas dentro del comando: el origen sale de `SOURCES`, y así el día que el árbol se mueva se cambia en un sitio (`SCOUT_SOURCES`).

```javascript
// scripts/pin-catalog.mjs
import { readJson, writeJson } from "./lib/json.mjs";
import { CATALOG, SOURCE_CATALOG, SOURCES } from "./lib/paths.mjs";

const { updated, categories, projects } = readJson(SOURCE_CATALOG);
// Sin rutas de máquina en data/: solo la etiqueta de origen.
writeJson(CATALOG, {
  updated,
  source: "jev-awesome/awesome-jev/data/projects.json",
  categories,
  projects,
});
console.log(`catalog.json: ${projects.length} entradas, corte ${updated}, desde ${SOURCES}`);
```

Run: `node scripts/pin-catalog.mjs`
Expected: `catalog.json: 1351 entradas, corte 2026-10-07, desde G:/dev/jev/jev-awesome`

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/catalog.test.mjs`
Expected: PASS, 3 tests

- [ ] **Step 5: Commit**

```bash
git add data/catalog.json tests/catalog.test.mjs
git commit -m "feat: pin the ecosystem snapshot with its cut-off date"
```

---

### Task 3: El eje fit, importado del documento fuente

**Files:**
- Create: `scripts/lib/fit-parse.mjs`
- Create: `scripts/import-fit.mjs`
- Create: `data/fit.json` (generado por el importador)
- Create: `scripts/lib/validate-rules.mjs` (solo `validateFit`)
- Test: `tests/fit-parse.test.mjs`, `tests/fit.test.mjs`

**Interfaces:**
- Consumes: `writeJson`, `FIT`, `ROOT`.
- Produces:
  - `fit-parse.mjs` → `GROUPS: {id,title}[]` (los 7, en el orden del documento) y `parseFit(doc: string): { groups, members, errors }`.
  - `validate-rules.mjs` → `validateFit(fit, catalog): string[]`.

**Por qué un importador y no transcripción:** el documento fuente ya tiene secciones `## Título (N)` con enlaces `https://github.com/owner/repo`, así que la pertenencia se puede extraer y **verificar contra el recuento que el propio documento declara**. Transcribir 305 líneas a mano no es verificable; esto sí. El documento no se edita: si el parser y el documento discrepan, se arregla el parser o se registra la discrepancia.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/fit-parse.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFit, GROUPS } from "../scripts/lib/fit-parse.mjs";

// El parser exige las siete secciones: un documento mutilado se reporta en vez
// de producir un fit.json a medias. La fixture, por tanto, trae las siete.
const DOC = `# Clasificación

## Estrellas de GitHub

- [algo](https://github.com/otro/lista) — **99 ⭐**

## Routing y selección (2)
- [a](https://github.com/owner/a) — **2 ⭐**

- [b](https://github.com/owner/b) — **1 ⭐**

## Revisión y verificación (1)
- [c](https://github.com/owner/c) — **1 ⭐**

## Contexto y memoria (1)
- [d](https://github.com/owner/d) — **1 ⭐**

## Seguridad y gates (1)
- [e](https://github.com/owner/e) — **1 ⭐**

## Supervisión y coordinación (1)
- [f](https://github.com/owner/f) — **1 ⭐**

## Interfaces Jev y harnesses generales (1)
- [g](https://github.com/owner/g) — **1 ⭐**

## Tareas de dominio (1)
- [h](https://github.com/owner/h) — **1 ⭐**
`;

test("it reads the groups, their members and skips the stars section", () => {
  const { groups, members, errors } = parseFit(DOC);
  assert.deepEqual(errors, []);
  assert.equal("otro/lista" in members, false);
  assert.deepEqual(members, {
    "owner/a": "routing",
    "owner/b": "routing",
    "owner/c": "review",
    "owner/d": "context",
    "owner/e": "gates",
    "owner/f": "supervision",
    "owner/g": "interfaces",
    "owner/h": "domain",
  });
  assert.deepEqual(groups.find((g) => g.id === "routing").count, 2);
});

test("the decision flag marks the five groups that carry a decision", () => {
  const { groups } = parseFit(DOC);
  const deciding = groups.filter((g) => g.decision).map((g) => g.id);
  assert.deepEqual(deciding, ["routing", "review", "context", "gates", "supervision"]);
});

test("a missing section is reported, not silently dropped", () => {
  const { errors } = parseFit(DOC.replace("## Tareas de dominio (1)", "## Otra cosa (1)"));
  assert.equal(errors.some((e) => e.includes("domain")), true);
});

test("a section whose count does not match its entries is an error, not a silent pass", () => {
  const { errors } = parseFit(DOC.replace("## Contexto y memoria (1)", "## Contexto y memoria (4)"));
  assert.equal(errors.some((e) => e.includes("context") || e.includes("Contexto")), true);
});

test("the group list has the seven ids the spec fixes", () => {
  assert.deepEqual(GROUPS.map((g) => g.id), ["routing", "review", "context", "gates", "supervision", "interfaces", "domain"]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/fit-parse.test.mjs`
Expected: FAIL — `Cannot find module '../scripts/lib/fit-parse.mjs'`

- [ ] **Step 3: Write the parser, the importer and the validator rule**

```javascript
// scripts/lib/fit-parse.mjs

export const GROUPS = [
  { id: "routing", title: "Routing y selección" },
  { id: "review", title: "Revisión y verificación" },
  { id: "context", title: "Contexto y memoria" },
  { id: "gates", title: "Seguridad y gates" },
  { id: "supervision", title: "Supervisión y coordinación" },
  { id: "interfaces", title: "Interfaces Jev y harnesses generales" },
  { id: "domain", title: "Tareas de dominio" },
];

const DECISION = new Set(["routing", "review", "context", "gates", "supervision"]);

/**
 * Lee el documento de clasificación y devuelve los grupos con su pertenencia.
 * Puro: recibe el texto, no lo busca. El recuento que declara cada encabezado
 * se comprueba contra los enlaces encontrados, así que una sección a medias
 * se reporta en vez de pasar.
 */
export function parseFit(doc) {
  const errors = [];
  const members = {};
  const found = [];

  for (const section of doc.split(/^## /m).slice(1)) {
    const [heading, ...body] = section.split(/\r?\n/);
    const group = GROUPS.find((g) => heading.startsWith(g.title));
    if (!group) continue;

    const declared = Number((heading.match(/\((\d+)\)/) || [])[1] ?? -1);
    const repos = [...body.join("\n").matchAll(/https:\/\/github\.com\/([\w.-]+\/[\w.-]+)/g)].map((m) => m[1]);
    const unique = [...new Set(repos)];
    if (unique.length !== declared) {
      errors.push(`${group.title}: el encabezado declara ${declared} y hay ${unique.length} entradas distintas`);
    }
    for (const repo of unique) {
      if (members[repo] && members[repo] !== group.id) errors.push(`${repo}: en ${members[repo]} y en ${group.id}`);
      members[repo] = group.id;
    }
    found.push({ id: group.id, title: group.title, count: unique.length, decision: DECISION.has(group.id) });
  }

  const missing = GROUPS.filter((g) => !found.some((f) => f.id === g.id)).map((g) => g.id);
  if (missing.length) errors.push(`secciones ausentes en el documento: ${missing.join(", ")}`);
  return { groups: found, members, errors };
}
```

```javascript
// scripts/import-fit.mjs
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { writeJson } from "./lib/json.mjs";
import { parseFit } from "./lib/fit-parse.mjs";
import { FIT, SOURCE_FIT_DOC } from "./lib/paths.mjs";

const flag = process.argv.find((a) => a.startsWith("--doc="));
const doc = flag ? resolve(flag.slice(6)) : SOURCE_FIT_DOC;

const { groups, members, errors } = parseFit(readFileSync(doc, "utf8"));
if (errors.length) {
  console.error(`import-fit: el documento y el parser no coinciden (${errors.length})`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

writeJson(FIT, {
  source: "jev-awesome/docs/agents-tooling-clasificacion.md",
  generated: new Date().toISOString().slice(0, 10),
  groups,
  members,
});
const total = groups.reduce((n, g) => n + g.count, 0);
console.log(`import-fit: ${Object.keys(members).length} miembros en ${groups.length} grupos, suma ${total}`);
```

```javascript
// scripts/lib/validate-rules.mjs

/**
 * Reglas del eje fit. Puras: reciben los documentos ya parseados.
 * El documento fuente solo clasifica las entradas de `agents`.
 */
export function validateFit(fit, catalog) {
  const errors = [];
  const agents = new Set(
    catalog.projects.filter((p) => p.category === "agents").map((p) => p.repo?.toLowerCase()).filter(Boolean),
  );
  const ids = new Set(fit.groups.map((g) => g.id));
  if (ids.size !== fit.groups.length) errors.push("fit.groups: hay ids repetidos");

  const total = fit.groups.reduce((n, g) => n + g.count, 0);
  if (total !== 305) errors.push(`fit.groups: los recuentos suman ${total}, se esperan 305`);
  const deciding = fit.groups.filter((g) => g.decision).reduce((n, g) => n + g.count, 0);
  if (deciding !== 174) errors.push(`fit.groups: los grupos con decisión suman ${deciding}, se esperan 174`);

  for (const [repo, group] of Object.entries(fit.members)) {
    if (!ids.has(group)) errors.push(`fit.members[${repo}]: grupo desconocido "${group}"`);
    if (!agents.has(repo.toLowerCase())) errors.push(`fit.members[${repo}]: no está en la categoría agents`);
  }
  if (Object.keys(fit.members).length !== 305) {
    errors.push(`fit.members: ${Object.keys(fit.members).length} entradas, se esperan 305`);
  }
  return errors;
}
```

- [ ] **Step 4: Run the import and the tests**

Run: `npm run fit`
Expected: `import-fit: 305 miembros en 7 grupos, suma 305`. Si en su lugar lista discrepancias, **no se toca el documento**: o el parser se queda corto (por ejemplo con enlaces a `github.com` que no son la entrada) o el documento tiene una sección mal contada, y hay que registrar cuál de las dos cosas es antes de seguir.

Luego:

```javascript
// tests/fit.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readJson } from "../scripts/lib/json.mjs";
import { CATALOG, FIT } from "../scripts/lib/paths.mjs";
import { validateFit } from "../scripts/lib/validate-rules.mjs";

const fit = readJson(FIT);
const catalog = readJson(CATALOG);

test("the committed fit is coherent with the universe", () => {
  assert.deepEqual(validateFit(fit, catalog), []);
});

test("toolgate cannot be a member: the source document never classified it", () => {
  assert.equal("RiskAverseTech/toolgate" in fit.members, false);
});

test("a foreign member and a wrong count are both rejected", () => {
  const broken = structuredClone(fit);
  broken.members["RiskAverseTech/toolgate"] = "gates";
  broken.groups[0].count = 999;
  const errors = validateFit(broken, catalog);
  assert.equal(errors.some((e) => e.includes("toolgate")), true);
  assert.equal(errors.some((e) => e.includes("305")), true);
});
```

Run: `node --test tests/fit.test.mjs tests/fit-parse.test.mjs`
Expected: PASS, 8 tests

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/fit-parse.mjs scripts/import-fit.mjs scripts/lib/validate-rules.mjs data/fit.json tests/fit-parse.test.mjs tests/fit.test.mjs
git commit -m "feat: import which projects carry a decision, verified against the source counts"
```

---

### Task 4: La cohorte A — los 13 veredictos

**Files:**
- Create: `data/assessments.json`
- Test: `tests/cohort-a.test.mjs`

**Interfaces:**
- Consumes: `data/catalog.json`.
- Produces: `data/assessments.json` = `{ updated, assessments: [Entry] }`, con `Entry` = `{ repo, name, cohort, in_catalog, catalog_category, stars, language, decision, fit, form, callable, cost: { runtime, requires_key, host }, evidence, verdict, blockers, capability?, run? }`.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/cohort-a.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readJson } from "../scripts/lib/json.mjs";
import { ASSESSMENTS, CATALOG } from "../scripts/lib/paths.mjs";

const { assessments } = readJson(ASSESSMENTS);
const catalog = readJson(CATALOG);
const byRepo = new Map(assessments.map((a) => [a.repo.toLowerCase(), a]));

test("cohort A holds the 13 analysed clones", () => {
  assert.equal(assessments.length, 13);
  assert.equal(assessments.every((a) => a.cohort === "A"), true);
});

test("catalog membership is stated for every entry, including the two absentees", () => {
  for (const a of assessments) {
    const known = catalog.projects.some((p) => (p.repo || "").toLowerCase() === a.repo.toLowerCase());
    assert.equal(a.in_catalog, known, `${a.repo} declara in_catalog ${a.in_catalog}`);
  }
  assert.equal(byRepo.get("joaquinruiz/medula").in_catalog, false);
  assert.equal(byRepo.get("shitianfang/wakegate").in_catalog, false);
});

test("toolgate is catalogued under research and is the one already adapted", () => {
  const t = byRepo.get("riskaversetech/toolgate");
  assert.equal(t.catalog_category, "research");
  assert.equal(t.capability, "tool.risk");
});

test("no entry claims to be measured while there is no probe yet", () => {
  assert.equal(assessments.every((a) => a.evidence === "static"), true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/cohort-a.test.mjs`
Expected: FAIL — `ENOENT: no such file or directory, open '.../data/assessments.json'`

- [ ] **Step 3: Write the data**

`data/assessments.json` se escribe a mano con la tabla de la sección 3 de la spec. Cada `verdict` explica la razón, porque esta tabla calibra el detector. Valores obligatorios:

| repo | in_catalog | category | stars | decision | fit | form | callable | runtime | requires_key | host |
| --- | --- | --- | ---: | --- | --- | --- | --- | --- | --- | --- |
| `RiskAverseTech/toolgate` | true | research | 2 | yes | inferred | exec | cli, mcp, hook, lib | node | typesafe, openrouter | any |
| `qkal/Canny` | true | agents | 121 | yes | review | exec | cli | node | typesafe | any |
| `Brainwires/jevwire` | true | agents | 21 | yes | interfaces | exec | cli, mcp, lib | node | typesafe | any |
| `GhalebDweikat/winnow` | true | agents | 102 | no | context | n_a | mcp, cli | python | none | any |
| `tamaratran/fast-jev-compaction` | true | agents | 7458 | no | context | n_a | lib | node | typesafe | any |
| `shitianfang/wakegate` | false | null | null | no | inferred | n_a | lib | node | none | any |
| `Yaxin9Luo/spending-effort-with-jev` | true | agents | 6 | no | routing | n_a | hook | node | typesafe | any |
| `ruban-24/switchboard` | true | agents | 15 | no | routing | n_a | cli | node | typesafe, openrouter | any |
| `Dicklesworthstone/skillranker` | true | agents | 128 | yes | routing | exec | cli | rust | typesafe | unix |
| `JoaquinRuiz/medula` | false | null | null | yes | inferred | http | http, lib | python | openrouter | any |
| `typesafe-ai/typesafe-sdk-js` | true | official | 269 | no | inferred | n_a | lib | node | none | any |
| `typesafe-ai/typesafe-sdk-python` | true | official | 272 | no | inferred | n_a | lib | python | none | any |
| `typesafe-ai/system-one-adapter-python` | true | official | 381 | no | inferred | n_a | lib | python | none | any |

Cada `form: "n_a"` lleva un `verdict` que explica el motivo (fast-jev-compaction: *devuelve un array de mensajes reescrito, no un veredicto*; winnow: *expone recall y estadísticas, no un veredicto*; switchboard: *el clasificador es interno y solo envuelve claude/codex*; spending-effort: *mod del host, sin superficie invocable*; los SDKs: *son transporte, no especialista*). Las entradas `in_catalog: false` llevan `stars: null` y `catalog_category: null`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/cohort-a.test.mjs`
Expected: PASS, 4 tests

- [ ] **Step 5: Commit**

```bash
git add data/assessments.json tests/cohort-a.test.mjs
git commit -m "feat: record the 13 assessed projects as the calibration set"
```

---

### Task 5: El validador completo

**Files:**
- Modify: `scripts/lib/validate-rules.mjs` (añade `validateAssessments` y `validateAll`)
- Create: `scripts/validate.mjs`
- Test: `tests/validate.test.mjs`

**Interfaces:**
- Consumes: `validateFit` (Task 3), `readJson`, `CATALOG`, `FIT`, `ASSESSMENTS`, `ROOT`.
- Produces:
  - `validateAssessments(assessments, catalog, hasRun): string[]`
  - `validateAll({ assessments, fit, catalog, hasRun }): string[]`
  - CLI `node scripts/validate.mjs` → exit 1 con los errores en stderr.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/validate.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readJson } from "../scripts/lib/json.mjs";
import { ASSESSMENTS, CATALOG, FIT } from "../scripts/lib/paths.mjs";
import { validateAll, validateAssessments } from "../scripts/lib/validate-rules.mjs";

const doc = readJson(ASSESSMENTS);
const catalog = readJson(CATALOG);
const fit = readJson(FIT);
const noRuns = () => false;

const withEntry = (patch) => {
  const entries = structuredClone(doc.assessments);
  Object.assign(entries[0], patch);
  return validateAssessments(entries, catalog, noRuns);
};

test("the shipped cohort A is valid", () => {
  assert.deepEqual(validateAssessments(doc.assessments, catalog, noRuns), []);
});

test("validateAll covers fit and assessments together", () => {
  assert.deepEqual(validateAll({ assessments: doc.assessments, fit, catalog, hasRun: noRuns }), []);
});

test("measured without a run is rejected", () => {
  assert.equal(withEntry({ evidence: "measured", run: undefined }).some((e) => e.includes("measured")), true);
});

test("n_a without an explanation is rejected", () => {
  assert.equal(withEntry({ form: "n_a", verdict: "" }).some((e) => e.includes("verdict")), true);
});

test("a list field given as a bare string is rejected", () => {
  assert.equal(withEntry({ callable: "cli" }).some((e) => e.includes("callable")), true);
  const cost = { runtime: "node", requires_key: "typesafe", host: "any" };
  assert.equal(withEntry({ cost }).some((e) => e.includes("requires_key")), true);
});

test("unknown enum values, mismatched membership and duplicates are rejected", () => {
  assert.equal(withEntry({ form: "grpc" }).some((e) => e.includes("form")), true);
  assert.equal(withEntry({ in_catalog: false }).some((e) => e.includes("catálogo")), true);
  const dup = [doc.assessments[0], structuredClone(doc.assessments[0])];
  assert.equal(validateAssessments(dup, catalog, noRuns).some((e) => e.includes("duplicado")), true);
});

test("absolute machine paths never appear in a verdict", () => {
  assert.equal(withEntry({ verdict: "vive en E:\\workspace\\personal" }).some((e) => e.includes("ruta absoluta")), true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/validate.test.mjs`
Expected: FAIL — `validateAssessments is not a function`

- [ ] **Step 3: Write minimal implementation**

```javascript
// scripts/lib/validate-rules.mjs (añadir al final)

const FORMS = new Set(["flow", "exec", "http", "n_a"]);
const DECISIONS = new Set(["yes", "no", "unclear"]);
const CALLABLE = new Set(["cli", "mcp", "http", "hook", "lib", "none"]);
const EVIDENCE = new Set(["static", "measured"]);
const COHORTS = new Set(["A", "B", "C"]);
const HOSTS = new Set(["any", "unix", "windows"]);
const ABSOLUTE_PATH = /(?:^|[^A-Za-z])(?:[A-Za-z]:\\|\/(?:home|Users|workspace)\/)/;

export function validateAssessments(assessments, catalog, hasRun) {
  const errors = [];
  const seen = new Map();
  const known = new Set(catalog.projects.map((p) => (p.repo || "").toLowerCase()).filter(Boolean));

  assessments.forEach((a, i) => {
    const where = `assessments[${i}] ${a.repo || "(sin repo)"}`;
    if (!a.repo) errors.push(`${where}: falta repo`);
    const key = (a.repo || "").toLowerCase();
    if (seen.has(key)) errors.push(`${where}: duplicado de ${seen.get(key)}`);
    seen.set(key, where);

    if (!COHORTS.has(a.cohort)) errors.push(`${where}: cohort inválida "${a.cohort}"`);
    if (!DECISIONS.has(a.decision)) errors.push(`${where}: decision inválida "${a.decision}"`);
    if (!FORMS.has(a.form)) errors.push(`${where}: form inválida "${a.form}"`);
    if (!EVIDENCE.has(a.evidence)) errors.push(`${where}: evidence inválida "${a.evidence}"`);
    if (!Array.isArray(a.callable) || a.callable.length === 0) errors.push(`${where}: callable debe ser lista no vacía`);
    else if (a.callable.some((c) => !CALLABLE.has(c))) errors.push(`${where}: callable con valor desconocido`);

    const cost = a.cost || {};
    if (!Array.isArray(cost.requires_key)) errors.push(`${where}: requires_key debe ser lista`);
    if (!HOSTS.has(cost.host)) errors.push(`${where}: cost.host inválido "${cost.host}"`);

    if (a.evidence === "measured" && !(a.run && hasRun(a.repo))) errors.push(`${where}: evidence measured sin run`);
    if (a.form === "n_a" && !(a.verdict || "").trim()) errors.push(`${where}: form n_a sin verdict que lo explique`);

    if (a.in_catalog === true && !known.has(key)) errors.push(`${where}: dice estar en el catálogo y no está`);
    if (a.in_catalog === false && known.has(key)) errors.push(`${where}: dice no estar en el catálogo y sí está`);
    if (a.fit !== "inferred" && typeof a.fit !== "string") errors.push(`${where}: fit debe ser un grupo o "inferred"`);

    if (ABSOLUTE_PATH.test(a.verdict || "")) errors.push(`${where}: verdict contiene una ruta absoluta de la máquina`);
  });
  return errors;
}

export function validateAll({ assessments, fit, catalog, hasRun }) {
  return [...validateFit(fit, catalog), ...validateAssessments(assessments, catalog, hasRun)];
}
```

```javascript
// scripts/validate.mjs
import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { readJson } from "./lib/json.mjs";
import { ASSESSMENTS, CATALOG, FIT, ROOT } from "./lib/paths.mjs";
import { validateAll } from "./lib/validate-rules.mjs";

const RUNS = resolve(ROOT, "runs");
// Los runs viven en runs/<fecha>-<nombre-del-repo>/, así que un run existe si
// algún directorio termina con el nombre del repo.
const hasRun = (repo) => {
  if (!existsSync(RUNS)) return false;
  const name = repo.split("/")[1].toLowerCase();
  return readdirSync(RUNS).some((d) => d.toLowerCase().endsWith(`-${name}`));
};

const errors = validateAll({
  assessments: readJson(ASSESSMENTS).assessments,
  fit: readJson(FIT),
  catalog: readJson(CATALOG),
  hasRun,
});

if (errors.length) {
  console.error(`validate: ${errors.length} problema(s)`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log("validate: datos coherentes");
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/validate.test.mjs && npm run validate`
Expected: PASS, 7 tests; luego `validate: datos coherentes`

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/validate-rules.mjs scripts/validate.mjs tests/validate.test.mjs
git commit -m "feat: reject verdicts that claim more evidence than they have"
```

---

### Task 6: Generación del README y del sitio

**Files:**
- Create: `scripts/template.html`
- Create: `scripts/build.mjs`
- Test: `tests/build.test.mjs`

**Interfaces:**
- Consumes: `readJson`, `writeJson`, las rutas, `TEMPLATE`.
- Produces: `coverage(assessments, catalog): { total, triaged, evaluated, inCatalog, untouched }`, `buildReadme(assessments, catalog): string`, `buildSite(assessments, catalog, template): string`, y el CLI `npm run build`.

**Criterio 4 de la spec:** los dos artefactos deben decir cuántas entradas están **evaluadas**, cuántas solo **triadas** y cuántas **sin tocar**.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/build.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readJson } from "../scripts/lib/json.mjs";
import { ASSESSMENTS, CATALOG, TEMPLATE } from "../scripts/lib/paths.mjs";
import { buildReadme, buildSite, coverage } from "../scripts/build.mjs";

const { assessments } = readJson(ASSESSMENTS);
const catalog = readJson(CATALOG);
const readme = buildReadme(assessments, catalog);
const site = buildSite(assessments, catalog, readFileSync(TEMPLATE, "utf8"));

test("coverage counts against the visible catalog, not against the analysed set", () => {
  const c = coverage(assessments, catalog);
  assert.deepEqual(c, { total: 1340, triaged: 13, evaluated: 0, inCatalog: 11, untouched: 1329 });
});

test("the README states the split, including how many analysed projects live outside the catalog", () => {
  assert.match(readme, /13 triadas \(11 de ellas en el catálogo\)/);
  assert.match(readme, /0 evaluadas/);
  assert.match(readme, /1329 sin tocar/);
});

test("every generated verdict carries its evidence label and its repo", () => {
  for (const a of assessments) assert.equal(readme.includes(a.repo), true, `${a.repo} no aparece`);
  assert.match(readme, /estático/);
});

test("the site substitutes every placeholder", () => {
  assert.equal(/\{\{[A-Z_]+\}\}/.test(site), false);
  assert.match(site, /<title>Hub Scout<\/title>/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/build.test.mjs`
Expected: FAIL — `Cannot find module '../scripts/build.mjs'`

- [ ] **Step 3: Write the implementation**

```html
<!-- scripts/template.html -->
<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Hub Scout</title>
<meta name="description" content="Qué proyectos del ecosistema Jev puede servir jevalon, con qué forma y a qué coste.">
</head>
<body>
<header>
  <h1>Hub Scout</h1>
  <p>Mapa de adaptabilidad del ecosistema Jev a jevalon. {{COVERAGE}}</p>
</header>
<main>
<table>
<thead><tr><th>Proyecto</th><th>Decisión</th><th>Forma</th><th>Invocable</th><th>Coste</th><th>Evidencia</th><th>Veredicto</th></tr></thead>
<tbody>
{{ROWS}}
</tbody>
</table>
</main>
</body>
</html>
```

```javascript
// scripts/build.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { readJson } from "./lib/json.mjs";
import { ASSESSMENTS, CATALOG, README, SITE, TEMPLATE } from "./lib/paths.mjs";

const EVIDENCE_LABEL = { static: "estático", measured: "medido" };
const costLabel = (cost) =>
  `${cost.runtime}${cost.requires_key.length ? ` + ${cost.requires_key.join("/")}` : ""}`;
const byCohortThenStars = (a, b) => a.cohort.localeCompare(b.cohort) || (b.stars || 0) - (a.stars || 0);
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function coverage(assessments, catalog) {
  const visible = new Set(catalog.projects.filter((p) => !p.gone).map((p) => (p.repo || "").toLowerCase()));
  const total = visible.size;
  const triaged = assessments.filter((a) => a.evidence === "static").length;
  const evaluated = assessments.filter((a) => a.evidence === "measured").length;
  // Solo lo que está en el catálogo descuenta del total: médula y wakegate están
  // analizados pero no viven ahí, y contarlos como "tocados" falsearía el reparto.
  const inCatalog = assessments.filter((a) => visible.has(a.repo.toLowerCase())).length;
  return { total, triaged, evaluated, inCatalog, untouched: Math.max(0, total - inCatalog) };
}

export function buildReadme(assessments, catalog) {
  const c = coverage(assessments, catalog);
  const rows = [...assessments]
    .sort(byCohortThenStars)
    .map(
      (a) =>
        `| \`${a.repo}\` | ${a.decision} | ${a.form} | ${a.callable.join(", ")} | ${costLabel(a.cost)} | ${EVIDENCE_LABEL[a.evidence]} | ${a.verdict} |`,
    )
    .join("\n");

  return `# jevalon hub scout

Qué proyectos del ecosistema Jev puede servir el hub de jevalon, con qué forma y a qué coste.
Generado desde \`data/assessments.json\`. Snapshot del universo: ${catalog.updated} (${catalog.source}).

## Cobertura

${c.triaged} triadas (${c.inCatalog} de ellas en el catálogo) · ${c.evaluated} evaluadas · ${c.untouched} sin tocar, de ${c.total} entradas visibles del catálogo.

Un veredicto **triado** sale de leer el código; uno **medido** sale de ejecutarlo. No son lo mismo y aquí no se presentan como si lo fueran.

## Cohortes

- **A — referencia fija:** los 13 clones analizados a mano. Es el banco de calibración del detector.
- **B — por fit:** los candidatos de los grupos con decisión (routing, revisión, contexto, gates, supervisión).
- **C — resto:** el catálogo por metadata, sin veredicto profundo.

| Proyecto | Decisión | Forma | Invocable | Coste | Evidencia | Veredicto |
| --- | --- | --- | --- | --- | --- | --- |
${rows}
`;
}

export function buildSite(assessments, catalog, template) {
  const c = coverage(assessments, catalog);
  const rows = [...assessments]
    .sort(byCohortThenStars)
    .map(
      (a) =>
        `<tr><td><code>${esc(a.repo)}</code></td><td>${esc(a.decision)}</td><td>${esc(a.form)}</td><td>${esc(a.callable.join(", "))}</td><td>${esc(costLabel(a.cost))}</td><td>${esc(EVIDENCE_LABEL[a.evidence])}</td><td>${esc(a.verdict)}</td></tr>`,
    )
    .join("\n");
  return template
    .replaceAll("{{COVERAGE}}", `${c.triaged} triadas (${c.inCatalog} en el catálogo) · ${c.evaluated} evaluadas · ${c.untouched} sin tocar`)
    .replace("{{ROWS}}", rows);
}

if (process.argv[1] && process.argv[1].endsWith("build.mjs")) {
  const { assessments } = readJson(ASSESSMENTS);
  const catalog = readJson(CATALOG);
  writeFileSync(README, buildReadme(assessments, catalog));
  writeFileSync(SITE, buildSite(assessments, catalog, readFileSync(TEMPLATE, "utf8")));
  const c = coverage(assessments, catalog);
  console.log(`build: ${c.triaged} triadas, ${c.evaluated} evaluadas, ${c.untouched} sin tocar, de ${c.total}`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/build.test.mjs && npm run build`
Expected: PASS, 4 tests; luego `build: 13 triadas, 0 evaluadas, 1329 sin tocar, de 1340`

- [ ] **Step 5: Commit**

```bash
git add scripts/build.mjs scripts/template.html tests/build.test.mjs README.md
git commit -m "feat: publish the coverage split so estimates are never read as measurements"
```

---

### Task 7: El triaje real, con caché reanudable

**Files:**
- Create: `scripts/triage.mjs`
- Test: `tests/triage.test.mjs`

**Interfaces:**
- Consumes: `readJson`, `CATALOG`, `TRIAGE_CACHE`.
- Produces:
  - `cacheKey(repo): string` — minúsculas, separadores no alfanuméricos → `-`.
  - `describeStatus(status: number): "ok" | "gone" | "rate_limited" | "pending"`.
  - `planTargets(catalog): { repo, name, stars }[]` — con repo, sin `gone`, ordenado por estrellas.
  - `fetchTree(repo, branch): Promise<{ status, tree: string[] }>`.
  - `fetchManifests(repo, branch): Promise<Record<string, any>>`.
  - `fetchEntry(repo): Promise<{ state, branch?, tree?, manifests? }>`.
  - CLI `node scripts/triage.mjs [--limit=N]`.

**Decisiones que resuelven cuatro de los cinco casos del Review Focus:** una entrada sin `repo` no entra en `planTargets`; `gone` se salta; 404/451 → `gone`; 403/429 → `rate_limited` y se corta sin escribir veredicto; la clave va en minúsculas para que `qkal/Canny` y `qkal/canny` sean el mismo fichero.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/triage.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readJson } from "../scripts/lib/json.mjs";
import { CATALOG } from "../scripts/lib/paths.mjs";
import { cacheKey, describeStatus, planTargets } from "../scripts/triage.mjs";

const catalog = readJson(CATALOG);

test("the cache key swallows case and separator differences", () => {
  assert.equal(cacheKey("qkal/Canny"), "qkal-canny");
  assert.equal(cacheKey("qkal/canny"), cacheKey("qkal/Canny"));
});

test("targets need a repo, skip the gone ones and come most-starred first", () => {
  const targets = planTargets(catalog);
  assert.equal(targets.every((t) => t.repo), true);
  assert.equal(targets.some((t) => catalog.projects.find((p) => p.repo === t.repo)?.gone === true), false);
  // 1351 entradas − 11 con gone − 96 sin repo = 1244 objetivos.
  assert.equal(targets.length, 1244);
  assert.equal(targets[0].stars >= targets[targets.length - 1].stars, true);
});

test("an entry without a repo never becomes a target", () => {
  const withNull = { projects: [...catalog.projects, { name: "solo artículo", repo: null }] };
  assert.equal(planTargets(withNull).some((t) => !t.repo), false);
});

test("HTTP statuses map to the four states that matter", () => {
  assert.equal(describeStatus(200), "ok");
  assert.equal(describeStatus(404), "gone");
  assert.equal(describeStatus(451), "gone");
  assert.equal(describeStatus(403), "rate_limited");
  assert.equal(describeStatus(429), "rate_limited");
  assert.equal(describeStatus(500), "pending");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/triage.test.mjs`
Expected: FAIL — `Cannot find module '../scripts/triage.mjs'`

- [ ] **Step 3: Write the implementation**

```javascript
// scripts/triage.mjs
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { readJson } from "./lib/json.mjs";
import { CATALOG, TRIAGE_CACHE } from "./lib/paths.mjs";
import { signal } from "./lib/triage-signals.mjs";

const API = "https://api.github.com";
const RAW = "https://raw.githubusercontent.com";
const MANIFESTS = ["package.json", "Cargo.toml", "pyproject.toml"];
const BRANCHES = ["main", "master"];

export const cacheKey = (repo) => repo.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function describeStatus(status) {
  if (status === 200) return "ok";
  if (status === 404 || status === 451) return "gone";
  if (status === 403 || status === 429) return "rate_limited";
  return "pending";
}

export function planTargets(catalog) {
  return catalog.projects
    .filter((p) => p.repo && !p.gone)
    .sort((a, b) => (b.stars || 0) - (a.stars || 0))
    .map((p) => ({ repo: p.repo, name: p.name, stars: p.stars || 0 }));
}

const headers = () => {
  const h = { Accept: "application/vnd.github+json", "User-Agent": "jevalon-hub-scout" };
  if (process.env.GITHUB_TOKEN) h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return h;
};

export async function fetchTree(repo, branch) {
  const res = await fetch(`${API}/repos/${repo}/git/trees/${branch}?recursive=1`, { headers: headers() });
  const state = describeStatus(res.status);
  if (state !== "ok") return { status: state, state, tree: [] };
  const body = await res.json();
  return { status: "ok", state: "ok", tree: (body.tree || []).filter((e) => e.type === "blob").map((e) => e.path) };
}

/** Manifiestos por CDN cruda: no consumen el límite de la API. */
export async function fetchManifests(repo, branch) {
  const out = {};
  for (const name of MANIFESTS) {
    const res = await fetch(`${RAW}/${repo}/${branch}/${name}`);
    if (!res.ok) continue;
    const text = await res.text();
    out[name] = name.endsWith(".json") ? JSON.parse(text) : text;
  }
  return out;
}

export async function fetchEntry(repo) {
  let last = "gone";
  for (const branch of BRANCHES) {
    const { state, tree } = await fetchTree(repo, branch);
    if (state === "rate_limited" || state === "pending") return { state };
    if (state === "gone") { last = "gone"; continue; }
    return { state: "ok", branch, tree, manifests: await fetchManifests(repo, branch) };
  }
  return { state: last };
}

async function main() {
  const arg = process.argv.find((a) => a.startsWith("--limit="));
  const limit = arg ? Number(arg.slice(8)) : Infinity;
  mkdirSync(TRIAGE_CACHE, { recursive: true });

  const targets = planTargets(readJson(CATALOG));
  let written = 0;
  let cached = 0;
  for (const target of targets) {
    if (written >= limit) break;
    const file = resolve(TRIAGE_CACHE, `${cacheKey(target.repo)}.json`);
    if (existsSync(file)) { cached++; continue; }
    const entry = await fetchEntry(target.repo);
    if (entry.state === "rate_limited") {
      console.warn(`límite de la API en ${target.repo}: vuelve a ejecutar, la caché es reanudable`);
      break;
    }
    const surface = entry.state === "ok" ? signal(entry.tree, entry.manifests) : { callable: ["none"], form_hint: "n_a" };
    writeFileSync(file, JSON.stringify({ repo: target.repo, ...entry, ...surface, cached: new Date().toISOString() }, null, 2) + "\n");
    written++;
    console.log(`${entry.state.padEnd(7)} ${target.repo} ${surface.callable.join(",")}`);
  }
  console.log(`triage: ${written} nuevos, ${cached} ya en caché, de ${targets.length} objetivos`);
}

if (process.argv[1] && process.argv[1].endsWith("triage.mjs")) await main();
```

Este módulo importa `signal` de la Task 8. Para que la Task 7 se pueda cerrar sola, el Step 5 de esta tarea incluye el fichero mínimo de la Task 8 (la función `signal` completa) — el resto de la Task 8 son los fixtures y la calibración.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/triage.test.mjs`
Expected: PASS, 4 tests

Luego, la prueba de que la caché reanudable funciona de verdad:

```bash
npm run triage -- --limit=5
npm run triage -- --limit=5
```

Esperado: primero 5 nuevos, después 5 ya en caché sin tocar la red. Sin `GITHUB_TOKEN` son 60 llamadas por hora: las 305 hay que repartirlas entre ejecuciones.

- [ ] **Step 5: Commit**

```bash
git add scripts/triage.mjs tests/triage.test.mjs
git commit -m "feat: triage the catalog from file trees, resumably and without cloning"
```

---

### Task 8: Señales, fixtures reales y calibración

**Files:**
- Create: `scripts/lib/triage-signals.mjs`
- Create: `scripts/make-fixtures.mjs`
- Create: `tests/fixtures/trees/*.json` (13 ficheros, generados desde la API)
- Test: `tests/triage-signals.test.mjs`

**Interfaces:**
- Consumes: `fetchEntry` (Task 7), `readJson`/`writeJson`, `ASSESSMENTS`, `ROOT`.
- Produces: `signal(tree: string[], manifests: Record<string, any>): { callable: string[], form_hint: string }`, con `callable` en el orden `["cli","mcp","hook","lib","http"]`.

**Cómo se calibra de verdad:** los fixtures se generan desde el árbol **real** de cada repo, no de memoria. Un fixture inventado haría la calibración auto-complaciente. Por eso este orden: primero la API (Task 7), después las señales.

`callable` es mecánico y se compara exacto contra `data/assessments.json`. `form_hint` es solo una sugerencia para el humano y **no** se compara: de un árbol de ficheros se deduce qué superficies hay, no si la decisión encaja en el hub.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/triage-signals.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { readJson } from "../scripts/lib/json.mjs";
import { ASSESSMENTS, ROOT } from "../scripts/lib/paths.mjs";
import { signal } from "../scripts/lib/triage-signals.mjs";

const DIR = resolve(ROOT, "tests", "fixtures", "trees");
const byRepo = new Map(readJson(ASSESSMENTS).assessments.map((a) => [a.repo.toLowerCase(), a]));
const sorted = (list) => [...list].sort().join(",");

test("the detector reproduces callable for all 13 analysed projects", () => {
  const files = readdirSync(DIR).filter((f) => f.endsWith(".json"));
  assert.equal(files.length, 13);
  const misses = [];
  for (const file of files) {
    const fixture = readJson(resolve(DIR, file));
    const expected = byRepo.get(fixture.repo.toLowerCase());
    assert.ok(expected, `${fixture.repo} no está en la cohorte A`);
    const got = signal(fixture.tree, fixture.manifests || {});
    if (sorted(got.callable) !== sorted(expected.callable)) {
      misses.push(`${fixture.repo}: tabla ${sorted(expected.callable)} / detector ${sorted(got.callable)}`);
    }
  }
  assert.deepEqual(misses, []);
});

test("a manifest with only an exports field is a library", () => {
  const got = signal(["package.json", "src/index.ts"], { "package.json": { exports: { ".": "./dist/index.js" } } });
  assert.deepEqual(got.callable, ["lib"]);
  assert.equal(got.form_hint, "n_a");
});

test("an empty tree yields no surface at all", () => {
  assert.deepEqual(signal([], {}).callable, ["none"]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/triage-signals.test.mjs`
Expected: FAIL — `Cannot find module '../scripts/lib/triage-signals.mjs'`

- [ ] **Step 3: Write the detector, then generate the fixtures from the real trees**

```javascript
// scripts/lib/triage-signals.mjs

const ORDER = ["cli", "mcp", "hook", "lib", "http"];
const has = (tree, path) => tree.includes(path);
const some = (tree, re) => tree.some((p) => re.test(p));
const bin = (manifests) => {
  const b = manifests["package.json"]?.bin;
  if (!b) return false;
  return typeof b === "string" ? b.length > 0 : Object.keys(b).length > 0;
};
const jsLibrary = (manifests) => {
  const m = manifests["package.json"];
  return Boolean(m && (m.exports || m.main));
};
const pyLibrary = (manifests, tree) =>
  /\[project\]/.test(manifests["pyproject.toml"] || "") || some(tree, /(^|\/)src\/[^/]+\/__init__\.py$/);
const rustLibrary = (manifests, tree) => /\[lib\]/.test(manifests["Cargo.toml"] || "") || has(tree, "src/lib.rs");
const rustBin = (manifests) => /\[\[bin\]\]/.test(manifests["Cargo.toml"] || "");
const pyScripts = (manifests) => /\[project\.scripts\]|console_scripts/.test(manifests["pyproject.toml"] || "");

/**
 * Deduce las superficies invocables del árbol y de los manifiestos. Pura a
 * propósito: el mismo trío da siempre la misma respuesta, así que la
 * calibración corre offline contra fixtures congelados.
 * `http` es la señal más débil (un servidor no siempre se ve en las rutas) y
 * el veredicto humano la corrige.
 */
export function signal(tree, manifests = {}) {
  const found = new Set();

  if (has(tree, ".claude-plugin/plugin.json") || has(tree, ".claude-plugin/marketplace.json")) found.add("hook");
  if (has(tree, "hooks/hooks.json") || some(tree, /(^|\/)hooks\/[^/]+\.(ts|tsx|js|json)$/)) found.add("hook");
  if (has(tree, ".mcp.json") || some(tree, /(^|\/)mcp[_-]?server\.py$/) || some(tree, /(^|\/)src\/mcp\.ts$/)) found.add("mcp");

  if (bin(manifests) || rustBin(manifests) || pyScripts(manifests)) found.add("cli");
  if (jsLibrary(manifests) || pyLibrary(manifests, tree) || rustLibrary(manifests, tree)) found.add("lib");
  if (some(tree, /(^|\/)(server|servidor)\.py$/)) found.add("http");

  const callable = ORDER.filter((c) => found.has(c));
  if (callable.length === 0) return { callable: ["none"], form_hint: "n_a" };
  const form_hint = callable.includes("http")
    ? "http"
    : callable.includes("cli") || callable.includes("mcp")
      ? "exec"
      : "n_a";
  return { callable, form_hint };
}
```

```javascript
// scripts/make-fixtures.mjs
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { readJson, writeJson } from "./lib/json.mjs";
import { ASSESSMENTS, ROOT } from "./lib/paths.mjs";
import { fetchEntry } from "./triage.mjs";

const DIR = resolve(ROOT, "tests", "fixtures", "trees");
mkdirSync(DIR, { recursive: true });

for (const { repo } of readJson(ASSESSMENTS).assessments) {
  const entry = await fetchEntry(repo);
  if (entry.state !== "ok") {
    console.warn(`sin árbol para ${repo}: ${entry.state}`);
    continue;
  }
  const file = resolve(DIR, `${repo.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.json`);
  // El árbol completo, sin recortar: curar la lista a mano sesgaría la calibración.
  writeJson(file, { repo, branch: entry.branch, tree: entry.tree, manifests: entry.manifests });
  console.log(`fixture ${repo}: ${entry.tree.length} rutas`);
}
```

Run: `npm run fixtures`
Expected: 13 líneas `fixture <repo>: N rutas`, sin `sin árbol para`.

Después, la calibración:

Run: `node --test tests/triage-signals.test.mjs`
Expected: PASS, 3 tests.

**Si la calibración falla, no se maquilla.** Un desajuste significa que una de las dos cosas está mal: el detector se queda corto (falta una señal: añádela) o la tabla de `data/assessments.json` se equivocó al leer el repo (corrígela y anota por qué). Lo que **nunca** se hace es recortar el fixture ni relajar el test. Cualquiera de las dos correcciones deja el criterio 1 de la spec en verde, y el desajuste queda explicado en el commit.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test`
Expected: PASS, todos los ficheros: json, catalog, fit-parse, fit, cohort-a, validate, build, triage, triage-signals

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/triage-signals.mjs scripts/make-fixtures.mjs tests/fixtures/trees tests/triage-signals.test.mjs
git commit -m "feat: detect an invocable surface from a real file tree, calibrated on 13 projects"
```

---

## Self-Review

**1. Cobertura de la spec**

| Sección de la spec | Tarea |
| --- | --- |
| §2 reutiliza `projects.json` pinneado | Task 2 |
| §2/§4 eje fit en forma máquina | Task 3 |
| §3 tabla de calibración (los 13) | Task 4 (datos) + Task 8 (verificación) |
| §5 cinco ejes | Task 4 (datos) + Task 5 (reglas) |
| §6 modelo de datos y reglas de validación | Tasks 1-5 |
| §7 triaje sin clonar, señales y caché | Task 7 (API, caché, estados) + Task 8 (señales) |
| §8 capa medida | **Fuera**: es el plan de la fase 3. Por eso todo es `static` |
| §9 pipeline y comandos | Tasks 1, 3, 5, 6, 7 (`fit`, `validate`, `build`, `triage`, `fixtures`; `probe` es fase 3) |
| §10 criterios 1, 2, 3, 4, 5, 7 | Task 8 (1), Task 5 (2, 3), Task 6 (4), Task 7 (5), Task 5 (7) |
| §10 criterio 6 (toolgate, médula y wakegate con veredicto) | Task 4 |
| §13 fases 1 y 2 | Todo el plan |
| §13 fases 3 y 4 | Fuera: planes aparte |

**2. Barrido de marcadores:** sin `TBD`, sin `TODO`, sin "similar a la tarea N", sin pasos que describan sin mostrar código. Las dos únicas entradas manuales (los 13 veredictos de la Task 4) van con la tabla completa de valores obligatorios, no con una descripción.

**3. Consistencia de nombres:** `readJson`, `writeJson`, `parseFit`, `GROUPS`, `validateFit`, `validateAssessments`, `validateAll`, `coverage`, `buildReadme`, `buildSite`, `cacheKey`, `describeStatus`, `planTargets`, `fetchTree`, `fetchManifests`, `fetchEntry`, `signal` se usan idénticos en todas las tareas. `form_hint` es del detector; `form` es del veredicto humano: nunca se mezclan. `coverage` devuelve `{ total, triaged, evaluated, inCatalog, untouched }` y su test lo fija exacto.

**4. Review Focus:** los cinco casos tienen test y tarea dueña — `repo: null` y `gone` (Task 7, `planTargets`), 404/451 y 403/429 (Task 7, `describeStatus`), mayúsculas (Task 7, `cacheKey`), y el límite agotado a mitad (Task 7, `break` sin escribir veredicto + doble ejecución en su Step 4).

**Dependencia declarada entre tareas:** la Task 7 importa `signal`, que se completa en la Task 8. Su Step 3 lo dice y su Step 5 incluye el fichero completo, así que ambas se pueden cerrar por separado; el orden elegido (API antes que señales) existe para que los fixtures salgan del árbol real.
