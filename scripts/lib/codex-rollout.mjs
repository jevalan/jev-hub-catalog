/**
 * Construye lo que un anfitrión Codex entregaría a un hook: la transcripción (rollout JSONL) y el evento de stdin.
 * Puro: devuelve cadenas y objetos, no toca el disco. El formato de la transcripción es interno de Codex y sin
 * garantía de compatibilidad; aquí solo se reproduce lo que el adaptador de JevLoop declara leer (mensajes,
 * `function_call` y `function_call_output` emparejados por `call_id`, y el bloque de entorno sintético de Codex).
 */

const message = (role, text) => ({ type: "response_item", payload: { type: "message", role, content: [{ type: role === "user" ? "input_text" : "output_text", text }] } });
const call = (id, name, args) => ({ type: "response_item", payload: { type: "function_call", name, arguments: JSON.stringify(args), call_id: id } });
const output = (id, text) => ({ type: "response_item", payload: { type: "function_call_output", call_id: id, output: text } });

/** Líneas de una transcripción: el bloque de entorno que Codex antepone, la tarea y los pasos (llamada + salida). */
export function rolloutRows(task, steps) {
  const rows = [message("user", "<environment_context>\n  <cwd>/work</cwd>\n  <shell>bash</shell>\n</environment_context>"), message("user", task)];
  steps.forEach((s, i) => {
    rows.push(call(`call_${i + 1}`, s.tool, s.input));
    if (s.output !== undefined) rows.push(output(`call_${i + 1}`, s.output));
  });
  return rows;
}

export const rollout = (task, steps) => rolloutRows(task, steps).map((r) => JSON.stringify(r)).join("\n") + "\n";

/**
 * El evento de stdin del hook. `pre` lleva la llamada pendiente (aún sin salida); `post` la llamada ya hecha,
 * que es el último paso de la transcripción; `stop` no lleva herramienta.
 */
export function hookEvent(it, transcriptPath, cwd) {
  const base = { session_id: "sesion-1", turn_id: "turno-1", cwd, transcript_path: transcriptPath, model: "gpt-5" };
  if (it.hook === "stop") return { ...base, hook_event_name: "Stop" };
  if (it.hook === "pre") return { ...base, hook_event_name: "PreToolUse", tool_name: it.call.tool, tool_input: it.call.input, tool_use_id: `call_${it.steps.length + 1}` };
  return { ...base, hook_event_name: "PostToolUse", tool_name: it.call.tool, tool_input: it.call.input, tool_use_id: `call_${it.steps.length + 1}` };
}

/** Pasos que van a la transcripción: los previos y, en `post`, también la llamada juzgada con su salida. */
export const transcriptSteps = (it) => (it.hook === "post" ? [...it.steps, it.call] : it.steps);

/** Lee el veredicto del hook: frenó (denegó o bloqueó), dejó pasar (silencio) o es ilegible (`null`). */
export function verdictOf(stdout) {
  const text = (stdout ?? "").trim();
  if (!text) return { stopped: false, kind: "silence" };
  let v;
  try {
    v = JSON.parse(text);
  } catch {
    return null;
  }
  if (v?.hookSpecificOutput?.permissionDecision === "deny") return { stopped: true, kind: "deny", reason: v.hookSpecificOutput.permissionDecisionReason ?? "" };
  if (v?.decision === "block") return { stopped: true, kind: "block", reason: v.reason ?? "" };
  if (v && typeof v === "object") return { stopped: false, kind: Object.keys(v).length ? "other" : "silence" };
  return null;
}
