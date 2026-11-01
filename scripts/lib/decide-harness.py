"""Arnés de la sonda de anofox-decide: ejecuta SQL por caso contra DuckDB y devuelve JSON.

Lo lanza scripts/probe-decide.mjs con el Python de un venv propio (`-I`). No juzga nada: cada caso abre
una conexión nueva con la extensión ya instalada en el sandbox, corre sus sentencias y devuelve filas,
error y las peticiones que llegaron al proveedor simulado (127.0.0.1) durante el caso.
Uso: python -I decide-harness.py <entrada.json> <salida.json>
"""
import json
import os
import sys
import time

entrada = json.load(open(sys.argv[1], encoding="utf-8"))
sb, port, log = entrada["sandbox"], entrada["port"], entrada["log"]
os.environ.update(HOME=sb, USERPROFILE=sb, TEMP=sb, TMP=sb, LOCALAPPDATA=sb, APPDATA=sb)
if entrada.get("telemetry_off", True):
    os.environ["DATAZOO_DISABLE_TELEMETRY"] = "1"
import duckdb  # noqa: E402

if entrada.get("install"):
    # Único acceso a la red del arnés: el repositorio `community` de DuckDB (firmado). Se hace antes de los
    # casos y con el proxy sin tocar; después se apaga la red de los casos con un proxy muerto.
    con = duckdb.connect(":memory:", config={"extension_directory": os.path.join(sb, "ext"),
                                             "autoinstall_known_extensions": False,
                                             "autoload_known_extensions": False})
    con.execute("INSTALL anofox_decide FROM community")
    con.close()
# Proxy muerto para los casos: si la extensión intentara bajar algo por su cuenta (pesos, plugins), fallaría
# en vez de descargar. 127.0.0.1 queda fuera para poder hablar con el proveedor simulado.
os.environ.update(HTTP_PROXY="http://127.0.0.1:9", HTTPS_PROXY="http://127.0.0.1:9", NO_PROXY="127.0.0.1,localhost")

SETUP_REMOTE = [
    "SET anofox_decide_allow_remote = true",
    "SELECT decide_register_model('sys', 'systemone', MAP {'endpoint': 'http://127.0.0.1:%d'})" % port,
    "CREATE SECRET (TYPE anofox_decide, API_KEY 'clave-inventada', SCOPE '127.0.0.1')",
]


def peticiones():
    out = []
    for linea in open(log, encoding="utf-8"):
        linea = linea.strip()
        if linea:
            out.append(json.loads(linea))
    return out


def jsonable(v):
    if isinstance(v, (int, float, str, bool)) or v is None:
        return v
    if isinstance(v, dict):
        return {str(k): jsonable(x) for k, x in v.items()}
    if isinstance(v, (list, tuple)):
        return [jsonable(x) for x in v]
    return str(v)


resultados = []
for caso in entrada["cases"]:
    open(log, "w").close()
    con = duckdb.connect(":memory:", config={
        "extension_directory": os.path.join(sb, "ext"),
        "autoinstall_known_extensions": False,
        "autoload_known_extensions": False,
    })
    con.execute("LOAD anofox_decide")
    res = {"id": caso["id"], "rows": None, "error": None}
    t0 = time.time()
    try:
        if caso.get("remote"):
            for s in SETUP_REMOTE:
                con.execute(s)
        for s in caso.get("setup", []):
            con.execute(s.replace("{{PORT}}", str(port)))
        cur = None
        for s in caso["sql"]:
            cur = con.execute(s.replace("{{PORT}}", str(port)))
        res["rows"] = jsonable(cur.fetchall()) if cur is not None and cur.description else None
    except Exception as e:  # el error es parte de lo que se mide
        res["error"] = str(e)
    res["elapsed_ms"] = round((time.time() - t0) * 1000)
    res["requests"] = peticiones()
    resultados.append(res)
    con.close()

json.dump({"results": resultados, "duckdb": duckdb.__version__}, open(sys.argv[2], "w", encoding="utf-8"))
