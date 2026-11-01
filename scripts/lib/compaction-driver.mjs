/**
 * Conductor de fast-jev-compaction para la sonda: la librería no trae CLI utilizable (sus `bin` instalan cosas),
 * así que este fichero propio importa su `dist/index.js` y expone solo `compactMessages` por stdin/stdout.
 *
 *   FJC_DIST=<ruta a dist/index.js> node scripts/lib/compaction-driver.mjs < {"messages":[…],"options":{…}}
 *
 * La URL del proveedor llega por `FJC_BASE_URL` (un simulador o un adaptador en 127.0.0.1) y la clave por
 * `TYPESAFE_API_KEY`. Imprime el resultado entero como JSON; ante un error imprime `{"error":…}` y sale con 1.
 * No ejecuta nada más del paquete: ni `jev-setup`, ni los hooks, ni los plugins.
 */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const lib = await import(pathToFileURL(process.env.FJC_DIST).href);
const input = JSON.parse(readFileSync(0, "utf8"));
const options = { ...input.options, ...(process.env.FJC_BASE_URL ? { baseUrl: process.env.FJC_BASE_URL } : {}) };
try {
  console.log(JSON.stringify(await lib.compactMessages(input.messages, options)));
} catch (e) {
  console.log(JSON.stringify({ error: String(e?.message ?? e).slice(0, 300), name: e?.name ?? null }));
  process.exit(1);
}
