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

test("a section whose count does not match its entries is an error, not a silent pass", () => {
  const { errors } = parseFit(DOC.replace("## Contexto y memoria (1)", "## Contexto y memoria (4)"));
  assert.equal(errors.some((e) => e.includes("context") || e.includes("Contexto")), true);
});

test("a missing section is reported, not silently dropped", () => {
  const { errors } = parseFit(DOC.replace("## Tareas de dominio (1)", "## Otra cosa (1)"));
  assert.equal(errors.some((e) => e.includes("domain")), true);
});

test("the group list has the seven ids the spec fixes", () => {
  assert.deepEqual(GROUPS.map((g) => g.id), ["routing", "review", "context", "gates", "supervision", "interfaces", "domain"]);
});
