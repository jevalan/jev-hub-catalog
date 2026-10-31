# Pruebas pendientes

Generado por `npm run backlog` desde `data/`. No se edita a mano.

Un veredicto leído no es un veredicto probado. Cada ficha de esta lista pasa a `measured` solo cuando existe su `runs/<fecha>-<repo>/` con las salidas reales.

**Reglas de cada prueba** (la política de código de terceros es obligatoria): directorio nuevo y vacío, `--ignore-scripts`, HOME y cwd propios, sin claves reales, jamás `setup`/`install`/`doctor` de un gate, y autorización explícita antes de instalar nada ajeno. Cada contrato de salida necesita su juego de casos en `scripts/probe-gate.mjs`.

## Primera tanda: sin clave y con instalación documentada (2)

Las más baratas de medir: se instalan según su README y corren sin credenciales.

- [ ] `DataZooDE/anofox-decide` · yes · exec · lib
- [ ] `doronp/jevc` · unclear · exec · cli

## Segunda tanda: piden clave o no traen instalación clara (63)

Necesitan una clave de prueba acotada, un modo `--dry-run`/`--mock` o leer el código antes de decidir cómo medirlas.

- [ ] `BillionsBobby/JevRouter` · yes · exec · cli/mcp/lib · clave: typesafe/openrouter
- [ ] `supercorp-ai/supercov` · yes · exec · cli/lib · clave: typesafe
- [ ] `uehaj/sys1grep` · yes · exec · cli · clave: typesafe
- [ ] `Dicklesworthstone/skillranker` · yes · exec · cli/lib · clave: typesafe
- [ ] `qkal/Canny` · yes · exec · cli · clave: typesafe
- [ ] `openlayer-ai/jevals` · yes · exec · cli/lib/mcp · clave: typesafe
- [ ] `sharziki/semdecide` · yes · exec · cli · clave: typesafe
- [ ] `PyModel/jev-judge-mcp` · yes · exec · mcp/cli · clave: typesafe
- [ ] `TheoOliveira/pi-jev` · yes · exec · cli · clave: typesafe
- [ ] `kyu1204/jgrep` · yes · exec · cli · clave: typesafe
- [ ] `mizchi/jev-test-filter` · yes · exec · cli · clave: typesafe
- [ ] `GodsBoy/jev-agent-skill-router` · yes · exec · cli/lib · clave: typesafe
- [ ] `Brainwires/jevwire` · yes · exec · cli/mcp/hook/lib · clave: typesafe
- [ ] `agencyenterprise/jev-recipes` · yes · exec · cli/lib · clave: typesafe
- [ ] `reachjalil/jevlogs` · yes · exec · cli/lib · clave: typesafe
- [ ] `iamtoomas/JevLint` · yes · exec · cli · clave: typesafe
- [ ] `caiovicentino/jev-risk-check-provider` · yes · http · http/mcp · clave: x402-payment
- [ ] `Tech-Byte-Frontier/jevgate` · yes · exec · cli/hook · clave: typesafe/openrouter
- [ ] `sufianetaouil/every` · yes · exec · cli · clave: typesafe
- [ ] `ItisShikhar/gg-friggin-ez` · yes · exec · lib · clave: typesafe
- [ ] `typakon4/jev-layer` · yes · exec · cli/mcp · clave: openrouter
- [ ] `godspede/construct-auto-classifier` · yes · exec · cli/lib · clave: typesafe
- [ ] `h0j5bz0adh0-stack/jev-pilot` · yes · exec · lib · clave: typesafe
- [ ] `Kungie/gut` · yes · exec · lib/mcp · clave: typesafe
- [ ] `caiovicentino/jev-align` · yes · exec · cli/lib · clave: typesafe
- [ ] `ShuhanSun/jev-oas-sentinel` · yes · exec · cli · clave: typesafe
- [ ] `Kushwho/jev-codes` · yes · exec · cli · clave: typesafe
- [ ] `jon-devlapaz/tink-route` · yes · exec · cli · clave: typesafe
- [ ] `YehuiTang0316/jev-nlgrep` · yes · exec · cli · clave: typesafe
- [ ] `lazniak/jevskill` · yes · exec · cli · clave: typesafe/openrouter
- [ ] `iamvatsalpatel/tiershift` · yes · exec · cli · clave: typesafe
- [ ] `caiovicentino/jev-shield` · yes · exec · cli/hook · clave: vercel
- [ ] `redreamality/jev-skill-selection` · yes · exec · cli/lib · clave: typesafe
- [ ] `E-FL/typesafe-as-a-judge` · yes · exec · mcp · clave: typesafe
- [ ] `Mandrilsquad1441/jev-model-router` · yes · exec · mcp · clave: openrouter/typesafe
- [ ] `JussCubs/jev-conductor-router` · yes · exec · cli/mcp · clave: typesafe/openrouter/orbio
- [ ] `emreozyoruk/hush` · yes · exec · cli · clave: typesafe
- [ ] `apixly-ai/jev-filter` · yes · exec · cli/mcp/lib · clave: typesafe
- [ ] `JoaquinRuiz/medula` · yes · http · http/lib · clave: openrouter
- [ ] `rbalch/typesafeai-review` · yes · exec · cli · clave: typesafe
- [ ] `moezubair/check-risk` · yes · exec · cli/lib · clave: typesafe
- [ ] `Hexdigest123/typesafe-comment` · yes · exec · cli · clave: typesafe
- [ ] `lakeday-org/perch` · unclear · exec · cli/mcp · clave: typesafe
- [ ] `NiazMorshed2007/jev-review` · unclear · exec · mcp · clave: typesafe
- [ ] `AntonioCoppe/jev-harness` · unclear · exec · lib/cli · clave: typesafe
- [ ] `Bentlybro/siftr` · unclear · exec · mcp/cli · clave: openrouter
- [ ] `NomenAK/jev-tools` · unclear · exec · mcp · clave: typesafe
- [ ] `eran-broder/jev-skills` · unclear · exec · cli/hook · clave: typesafe
- [ ] `keltokhy/jlink` · unclear · exec · cli/lib · clave: typesafe
- [ ] `EugeneBoondock/jevsql` · unclear · exec · cli/lib · clave: typesafe
- [ ] `Bodila51/Jev-chooses-a-LLM` · unclear · exec · mcp · clave: typesafe
- [ ] `1jehuang/jev-pr-labeler` · unclear · exec · cli · clave: openrouter
- [ ] `qualixar/jev-decision-layer` · unclear · exec · mcp/hook/lib · clave: typesafe
- [ ] `ddfeyes/jev-mode` · unclear · exec · hook/cli · clave: typesafe
- [ ] `maker-KK/todo-jev` · unclear · exec · cli/lib · clave: typesafe
- [ ] `lomeshdutta/skill-router` · unclear · exec · cli/hook · clave: typesafe
- [ ] `Ravinder82/jev-flash-router` · unclear · exec · mcp · clave: openrouter
- [ ] `kindintelligence/jev-rust-review` · unclear · exec · mcp · clave: typesafe
- [ ] `dr-dimitru/claude-jev-plugin` · unclear · exec · hook · clave: typesafe
- [ ] `qinpei-dev/permit-mcp` · unclear · exec · mcp · clave: typesafe
- [ ] `jyatesdotdev/jev-logtriage` · unclear · exec · cli · clave: typesafe
- [ ] `ntedvs/commentcop` · unclear · exec · cli · clave: typesafe
- [ ] `shivam2003-dev/typesafe-triage-guard` · unclear · exec · cli · clave: typesafe

## Tercera tanda: servicios alojados o sin CLI (0)

Se miden contra el servicio, con el coste y la privacidad que eso implique; decidirlo caso a caso.

_Vacío._
