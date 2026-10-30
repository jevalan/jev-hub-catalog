/**
 * Casos fijos de la medida de un especialista `exec` servido por el hub, y su juicio.
 * Puro: recibe la respuesta ya obtenida, así que se prueba offline.
 *
 * Los casos no necesitan clave: ejercen lo que el especialista decide sin modelo (reglas
 * estáticas), su modo de fallo y lo que el hub garantiza por su cuenta. Lo que dependa del
 * modelo (allow/ask con probabilidades) NO se mide aquí y el run lo declara.
 */

const ENVELOPE = (capability, version, input) => ({
  protocol_version: "jev-hub/0.1",
  request_id: "probe",
  capability,
  capability_version: version,
  input,
});

/** Cada caso: la petición y qué exige el perfil del hub de la respuesta. */
export const CASES = (capability) => [
  {
    id: "static-rule-decides",
    why: "Una regla estática del especialista decide sin modelo y la decisión valida contra el esquema.",
    request: ENVELOPE(capability, "1", { tool_name: "Bash", tool_input: { command: "rm -rf /" } }),
    expect: { status: "ok", decision: true },
  },
  {
    id: "no-model-is-an-error",
    why: "Sin modelo, el especialista informa de su modo de fallo y el hub lo traduce a error, nunca a permiso.",
    request: ENVELOPE(capability, "1", { tool_name: "Bash", tool_input: { command: "ls" } }),
    expect: { status: "error", code: "provider_failed", decision: false },
  },
  {
    id: "input-outside-schema",
    why: "Una entrada fuera del esquema es error y no llega al especialista.",
    request: ENVELOPE(capability, "1", 7),
    expect: { status: "error", code: "invalid_input", decision: false },
  },
  {
    id: "other-contract-version",
    why: "Otra versión del contrato es error.",
    request: ENVELOPE(capability, "9", { tool_name: "Bash", tool_input: {} }),
    expect: { status: "error", code: "version_mismatch", decision: false },
  },
];

/** Datos que no pueden aparecer en ninguna respuesta pública del hub. */
export const LEAKS = (secrets) => secrets.filter(Boolean);

/** `{ pass, problems }` de una respuesta frente a lo que el caso exige. */
export function judge(testCase, reply, leaks = []) {
  const problems = [];
  const { expect } = testCase;
  if (reply?.status !== expect.status) problems.push(`status ${reply?.status}, se esperaba ${expect.status}`);
  if (expect.code && reply?.error?.code !== expect.code) {
    problems.push(`código ${reply?.error?.code}, se esperaba ${expect.code}`);
  }
  const hasDecision = reply && Object.hasOwn(reply, "decision");
  if (hasDecision !== expect.decision) {
    problems.push(expect.decision ? "falta la decisión" : "una respuesta que no es ok lleva decision");
  }
  if (reply?.request_id !== "probe") problems.push("el request_id no se devuelve");
  const text = JSON.stringify(reply ?? {});
  for (const secret of leaks) if (text.includes(secret)) problems.push("la respuesta delata comando, entorno o ruta");
  return { pass: problems.length === 0, problems };
}

/** Descubrimiento: las dos direcciones coinciden, y no publican binding. */
export function judgeDiscovery(listing, wellKnown, leaks = []) {
  const problems = [];
  if (listing !== wellKnown) problems.push("/.well-known/jev-hub.json no devuelve lo mismo que /v1/hub/capabilities");
  for (const secret of leaks) if (listing.includes(secret)) problems.push("el listado publica comando, entorno o ruta");
  try {
    const caps = JSON.parse(listing).capabilities ?? {};
    const digests = Object.values(caps).map((c) => c.digest);
    if (!digests.length || digests.some((d) => !/^sha256:[0-9a-f]{64}$/.test(d ?? ""))) {
      problems.push("alguna capacidad no publica un digest sha256");
    }
  } catch {
    problems.push("el listado no es JSON");
  }
  return { pass: problems.length === 0, problems };
}
