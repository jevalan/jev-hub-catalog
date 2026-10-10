import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { ROOT } from "./paths.mjs";

/** Un run existe si el propio veredicto declara la ruta y esa ruta está en disco
 * (runs/<fecha>-<repo>/). Comprobar el nombre del repo daría por bueno un `run`
 * mal escrito mientras el directorio del repo exista. */
export const hasRun = (run) => Boolean(run) && existsSync(resolve(ROOT, run));
