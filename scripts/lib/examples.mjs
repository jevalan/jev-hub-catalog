// Extracción de ejemplos y configuraciones desde el README de un tercero.
// Cabe señalar que este módulo es puro: recibe texto y devuelve texto. Jamás
// ejecuta, instala ni evalúa nada de lo leído; el README ajeno es un dato no fiable.

const MAX_LINES = 28;
const MAX_CHARS = 1400;

// Misma definición que el validador: una ruta de esta máquina no se publica, y
// un README ajeno lleva a menudo la de su autor (`/Users/fulano/...`).
export const ABSOLUTE_PATH = /(?:^|[^A-Za-z])(?:[A-Za-z]:[\\/]|\/(?:home|Users|workspace)\/)/;
// Ciertamente nadie desea publicar una credencial por descuido ajeno.
const SECRET = /(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|xox[abpr]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{30,})/;
// Dícese de la instrucción que descarga y ejecuta en un solo gesto: se muestra, pero avisando.
const PIPE_TO_SHELL = /(?:curl|wget)[^\n|]*\|\s*(?:sudo\s+)?(?:ba|z)?sh\b|iex\s*\(|irm\s[^\n|]*\|\s*iex/i;

const INSTALL_CMD = /^\s*\$?\s*(?:npm\s+(?:i|install)|pnpm\s+(?:add|i|install)|yarn\s+(?:add|global)|npx\s|pip3?\s+install|pipx\s+install|uv\s+(?:tool\s+install|pip\s+install|add)|cargo\s+install|go\s+install|brew\s+install|git\s+clone|claude\s+mcp\s+add|docker\s+(?:pull|run))/m;
const CONFIG_LANG = new Set(["json", "jsonc", "json5", "yaml", "yml", "toml", "ini", "env", "dotenv"]);
const SHELL_LANG = new Set(["", "bash", "sh", "shell", "zsh", "console", "terminal", "text", "txt", "powershell", "ps1", "cmd"]);
const CONFIG_HEADING = /config|setting|ajuste|hook|mcp|environment|env\b|variable|\.claude|settings\.json/i;
const USAGE_HEADING = /usage|use\b|uso|quick\s*start|getting\s*started|example|ejemplo|run|cli|demo/i;
const INSTALL_HEADING = /install|instal|setup|set up/i;

/** Recorre el Markdown y devuelve los bloques acotados con su encabezado más cercano. */
export function fencedBlocks(markdown) {
  const blocks = [];
  let heading = "";
  let open = null;
  for (const line of String(markdown).split(/\r?\n/)) {
    if (open) {
      const close = line.match(/^\s*(`{3,}|~{3,})\s*$/);
      if (close && close[1][0] === open.marker[0] && close[1].length >= open.marker.length) {
        blocks.push({ lang: open.lang, heading: open.heading, code: open.lines.join("\n") });
        open = null;
      } else open.lines.push(line);
      continue;
    }
    const start = line.match(/^\s*(`{3,}|~{3,})\s*([\w+.#-]*)/);
    if (start) {
      open = { marker: start[1], lang: start[2].toLowerCase(), heading, lines: [] };
      continue;
    }
    const h = line.match(/^#{1,6}\s+(.*?)\s*#*\s*$/);
    if (h) heading = h[1].replace(/[`*_[\]]/g, "").slice(0, 80);
  }
  return blocks;
}

function classify({ lang, heading, code }) {
  if (CONFIG_LANG.has(lang) || /mcpServers|"hooks"|\[mcp_servers/.test(code)) {
    return { kind: "config", score: CONFIG_HEADING.test(heading) ? 2 : 1 };
  }
  if (!SHELL_LANG.has(lang)) return null;
  if (INSTALL_CMD.test(code)) return { kind: "install", score: INSTALL_HEADING.test(heading) ? 2 : 1 };
  if (CONFIG_HEADING.test(heading) && /["{}=:]/.test(code)) return { kind: "config", score: 1 };
  return { kind: "usage", score: USAGE_HEADING.test(heading) ? 2 : 1 };
}

function trim(code) {
  const lines = code.replace(/\s+$/, "").split("\n").map((l) => l.replace(/\s+$/, ""));
  let truncated = lines.length > MAX_LINES;
  let out = lines.slice(0, MAX_LINES).join("\n");
  if (out.length > MAX_CHARS) {
    out = out.slice(0, MAX_CHARS);
    truncated = true;
  }
  return { code: out, truncated };
}

/**
 * Elige como mucho un ejemplo de instalación, uno de configuración y uno de
 * uso. Los bloques con credenciales o rutas de la máquina de su autor se
 * descartan enteros: recortarlos dejaría un ejemplo engañoso.
 */
export function extractSnippets(markdown) {
  const best = new Map();
  for (const block of fencedBlocks(markdown)) {
    const code = block.code.trim();
    if (code.length < 8 || SECRET.test(code) || ABSOLUTE_PATH.test(code)) continue;
    const c = classify({ ...block, code });
    if (!c || best.has(c.kind) && best.get(c.kind).score >= c.score) continue;
    best.set(c.kind, { ...c, block: { ...block, code } });
  }
  const order = ["install", "config", "usage"];
  return order.filter((k) => best.has(k)).map((k) => {
    const { block } = best.get(k);
    const { code, truncated } = trim(block.code);
    const snippet = { kind: k, lang: block.lang || "text", heading: block.heading, code, truncated };
    if (PIPE_TO_SHELL.test(block.code)) snippet.warn = "descarga y ejecuta en un solo paso; léelo antes de lanzarlo";
    return snippet;
  });
}
