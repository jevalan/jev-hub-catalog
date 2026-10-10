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
export const NOT_SURFACE = /(^|\/)(tests?|fixtures?|examples?|__tests__|benchs?|benchmarks?)\//i;

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
  if (has(tree, ".mcp.json") || some(tree, /(^|\/)mcp[_-]?server\.py$/) || some(tree, /(^|\/)mcp\.(mjs|js|ts)$/) || some(tree, /(^|\/)src\/mcp\.ts$/)) found.add("mcp");

  if (bin(manifests) || rustBin(manifests) || pyScripts(manifests)) found.add("cli");
  if (jsLibrary(manifests) || pyLibrary(manifests, tree) || rustLibrary(manifests, tree)) found.add("lib");
  if (some(tree.filter((p) => !NOT_SURFACE.test(p)), /(^|\/)(server|servidor)\.py$/)) found.add("http");

  const callable = ORDER.filter((c) => found.has(c));
  if (callable.length === 0) return { callable: ["none"], form_hint: "n_a" };
  const form_hint = callable.includes("http")
    ? "http"
    : callable.includes("cli") || callable.includes("mcp")
      ? "exec"
      : "n_a";
  return { callable, form_hint };
}
