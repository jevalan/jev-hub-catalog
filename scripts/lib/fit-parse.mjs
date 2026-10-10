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
