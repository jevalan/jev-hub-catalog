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

const FORMS = new Set(["flow", "exec", "http", "n_a"]);
const DECISIONS = new Set(["yes", "no", "unclear"]);
const CALLABLE = new Set(["cli", "mcp", "http", "hook", "lib", "none"]);
const EVIDENCE = new Set(["static", "measured"]);
const COHORTS = new Set(["A", "B", "C"]);
const HOSTS = new Set(["any", "unix", "windows"]);
// Una ruta de esta máquina no tiene nada que hacer en un veredicto publicado, ni
// con barra invertida ni con barra normal.
const ABSOLUTE_PATH = /(?:^|[^A-Za-z])(?:[A-Za-z]:[\\/]|\/(?:home|Users|workspace)\/)/;
const TEXT_FIELDS = ["repo", "name", "verdict", "capability"];

export function validateAssessments(assessments, catalog, hasRun, fit = {}) {
  const errors = [];
  const seen = new Map();
  const known = new Set(catalog.projects.map((p) => (p.repo || "").toLowerCase()).filter(Boolean));
  const fitIds = new Set((fit.groups || []).map((g) => g.id));
  const memberOf = fit.members || {};

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

    // La forma del campo y su existencia en disco se comprueban por separado: un
    // predicado inyectado no debe poder dar por bueno un veredicto sin `run`.
    const declaresRun = typeof a.run === "string" && a.run.trim().length > 0;
    if (a.evidence === "measured" && !(declaresRun && hasRun(a.run))) {
      errors.push(`${where}: evidence measured sin run que exista`);
    }
    if (a.form === "n_a" && !(a.verdict || "").trim()) errors.push(`${where}: form n_a sin verdict que lo explique`);

    // El eje fit lo fija el documento clasificador para sus miembros; fuera de él
    // solo cabe "inferred".
    if (a.fit !== "inferred") {
      if (fitIds.size && !fitIds.has(a.fit)) errors.push(`${where}: fit "${a.fit}" no es un grupo del documento`);
      else if (!fitIds.size && typeof a.fit !== "string") errors.push(`${where}: fit debe ser un grupo o "inferred"`);
    }
    const documented = memberOf[Object.keys(memberOf).find((k) => k.toLowerCase() === key)];
    if (documented && documented !== a.fit) {
      errors.push(`${where}: fit "${a.fit}" contradice al documento, que dice "${documented}"`);
    }

    if (a.in_catalog === true && !known.has(key)) errors.push(`${where}: dice estar en el catálogo y no está`);
    if (a.in_catalog === false && known.has(key)) errors.push(`${where}: dice no estar en el catálogo y sí está`);

    const texts = [...TEXT_FIELDS.map((f) => a[f]), ...(Array.isArray(a.blockers) ? a.blockers : [])];
    if (texts.some((t) => typeof t === "string" && ABSOLUTE_PATH.test(t))) {
      errors.push(`${where}: contiene una ruta absoluta de la máquina`);
    }
  });
  return errors;
}

const SHELF_STATUS = new Set(["parked", "candidate"]);

/**
 * Cabe señalar que aparcar no es descartar: una categoría aparcada declara por
 * qué no aporta hoy y qué tendría que cambiar para volver a mirarla. Sin esa
 * condición de vuelta, "aparcado" sería un "no" con mejor prensa.
 */
export function validateShelf(shelf, catalog) {
  const errors = [];
  const known = new Set(catalog.projects.map((p) => p.category));
  const seen = new Set();
  (shelf.categories || []).forEach((c, i) => {
    const where = `shelf.categories[${i}] ${c.category || "(sin categoría)"}`;
    if (!known.has(c.category)) errors.push(`${where}: la categoría no está en el catálogo`);
    if (seen.has(c.category)) errors.push(`${where}: categoría duplicada`);
    seen.add(c.category);
    if (!SHELF_STATUS.has(c.status)) errors.push(`${where}: status inválido "${c.status}"`);
    if (!(c.reason || "").trim()) errors.push(`${where}: falta reason`);
    if (c.status === "parked" && !(c.revisit_when || "").trim()) errors.push(`${where}: parked sin revisit_when`);
    if ([c.reason, c.revisit_when].some((t) => typeof t === "string" && ABSOLUTE_PATH.test(t))) {
      errors.push(`${where}: contiene una ruta absoluta de la máquina`);
    }
  });
  return errors;
}

export function validateAll({ assessments, fit, catalog, hasRun, shelf = { categories: [] } }) {
  return [
    ...validateFit(fit, catalog),
    ...validateAssessments(assessments, catalog, hasRun, fit),
    ...validateShelf(shelf, catalog),
  ];
}
