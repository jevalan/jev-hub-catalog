/**
 * Piezas puras de la batería de estabilidad y deriva de Jev: evalúa una respuesta contra la expectativa de
 * un fixture y resume una serie de repeticiones. No toca red ni disco.
 *
 * Las expectativas son las del corpus grabado de jevc (`expect` de cada fixture): umbrales sobre la
 * probabilidad de un noul (`noul_gte`, `noul_lte`), sobre la puntuación de un score (`score_gte`,
 * `score_lte`), la opción de un choice (`choice`, `choice_in`) y la confianza (`confidence_gte/lte`).
 * `prob_lte` aparece una sola vez y su sentido no está documentado: se declara «no evaluable».
 */

/** Valor numérico de una respuesta, para estadísticas y deriva; null si no es noul ni score. */
export function numericOf(answer) {
  if (!answer) return null;
  if (typeof answer.noul === "number") return answer.noul;
  if (typeof answer.score === "number") return answer.score;
  return null;
}

/** Devuelve { evaluable, ok, failed: [condiciones que no se cumplen] }. */
export function evaluate(expect, answer) {
  if (!answer) return { evaluable: true, ok: false, failed: ["sin respuesta"] };
  const failed = [];
  let evaluable = true;
  const num = (name, got, test) => {
    if (typeof got !== "number") return failed.push(`${name}: la respuesta no trae el valor`);
    if (!test(got)) failed.push(`${name} (valor ${got})`);
  };
  for (const [k, want] of Object.entries(expect)) {
    if (k === "noul_gte") num(`${k} ${want}`, answer.noul, (v) => v >= want);
    else if (k === "noul_lte") num(`${k} ${want}`, answer.noul, (v) => v <= want);
    else if (k === "score_gte") num(`${k} ${want}`, answer.score, (v) => v >= want);
    else if (k === "score_lte") num(`${k} ${want}`, answer.score, (v) => v <= want);
    else if (k === "confidence_gte") num(`${k} ${want}`, answer.confidence, (v) => v >= want);
    else if (k === "confidence_lte") num(`${k} ${want}`, answer.confidence, (v) => v <= want);
    else if (k === "choice") {
      if (answer.choice !== want) failed.push(`choice ${want} (eligió ${answer.choice})`);
    } else if (k === "choice_in") {
      if (!want.includes(answer.choice)) failed.push(`choice_in ${JSON.stringify(want)} (eligió ${answer.choice})`);
    } else evaluable = false;
  }
  return { evaluable, ok: evaluable && failed.length === 0, failed };
}

/** Media, desviación típica, mínimo y máximo de una serie de números. */
export function stats(values) {
  const v = values.filter((x) => typeof x === "number");
  if (v.length === 0) return null;
  const mean = v.reduce((s, x) => s + x, 0) / v.length;
  const sd = Math.sqrt(v.reduce((s, x) => s + (x - mean) ** 2, 0) / v.length);
  return { n: v.length, mean: round(mean), sd: round(sd), min: round(Math.min(...v)), max: round(Math.max(...v)) };
}

export function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

const round = (x) => Math.round(x * 10000) / 10000;
