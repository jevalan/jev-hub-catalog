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
