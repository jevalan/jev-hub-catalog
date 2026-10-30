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

// Los ficheros de prueba no son superficie del proyecto: un server.py dentro de
// tests/fixtures es un doble, no un servicio que se pueda invocar. Los
// workspaces de bench/ son entradas de un benchmark, no un paquete del repo.
export const NOT_SURFACE = /(^|\/)(tests?|fixtures?|examples?|__tests__|benchs?|benches|benchmarks?)\//i;

/**
 * Deduce las superficies invocables del árbol y de los manifiestos. Pura a
 * propósito: el mismo trío da siempre la misma respuesta, así que la
 * calibración corre offline contra fixtures congelados.
 *
 * Un manifiesto de plugin (`.claude-plugin/`) no basta para `hook`: hay plugins
 * que solo añaden comandos. Lo que engancha con el host es el módulo bajo
 * `hooks/`. Y `http` sigue siendo la señal más débil (un servidor no siempre se
 * ve en las rutas); el veredicto humano la corrige.
 */
export function signal(tree, manifests = {}) {
  const found = new Set();
  const own = tree.filter((p) => !NOT_SURFACE.test(p));

  if (has(own, "hooks/hooks.json") || some(own, /(^|\/)hooks\/[^/]+\.(ts|tsx|js|json)$/)) found.add("hook");
  if (has(own, ".mcp.json") || some(own, /(^|\/)mcp[_-]?server\.py$/) || some(own, /(^|\/)mcp\.(mjs|js|ts)$/)) found.add("mcp");

  if (bin(manifests) || rustBin(manifests) || pyScripts(manifests)) found.add("cli");
  // También sobre `own`: un paquete bajo tests/ o fixtures/ es un doble, no la
  // superficie del proyecto. El manifiesto sí basta si declara librería.
  if (jsLibrary(manifests) || pyLibrary(manifests, own) || rustLibrary(manifests, own)) found.add("lib");
  if (some(own, /(^|\/)(server|servidor)\.py$/)) found.add("http");

  const callable = ORDER.filter((c) => found.has(c));
  if (callable.length === 0) return { callable: ["none"], form_hint: "n_a" };
  const form_hint = callable.includes("http")
    ? "http"
    : callable.includes("cli") || callable.includes("mcp")
      ? "exec"
      : "n_a";
  return { callable, form_hint };
}
