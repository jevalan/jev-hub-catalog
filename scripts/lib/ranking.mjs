// Ranking de pruebas propias. Cabe señalar que es puro y que solo admite
// proyectos con run: sin prueba nuestra no hay puntuación, por mucho que el
// README prometa.

/** `items`: [{ assessment, run }] con el run.json ya leído. */
export function rankRuns(items) {
  const rows = items.map(({ assessment: a, run }) => {
    const cases = run.cases || [];
    const passed = cases.filter((c) => c.pass).length;
    const measured = (run.measured || []).length;
    const unmeasured = (run.not_measured || []).length;
    const declared = measured + unmeasured;
    return {
      repo: a.repo,
      runPath: a.run,
      date: run.date,
      total: cases.length,
      passed,
      failed: cases.length - passed,
      measured,
      unmeasured,
      coverage: declared ? measured / declared : 0,
      problems: (a.blockers || []).length,
    };
  });
  return rows.sort(
    (x, y) => x.failed - y.failed || y.coverage - x.coverage || y.total - x.total || x.repo.localeCompare(y.repo),
  );
}
