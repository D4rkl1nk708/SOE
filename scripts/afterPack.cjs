/**
 * afterPack hook para electron-builder.
 * 1. Remove o chrome-sandbox (evita erro SUID)
 * 2. Cria um wrapper shell script que passa --no-sandbox automaticamente
 *    para o binário real, sem precisar de root ou permissões especiais.
 */
const path = require("path");
const fs = require("fs");

module.exports = async function ({ appOutDir, packager }) {
  if (packager.platform.name !== "linux") return;

  // 1. Remove chrome-sandbox (evita erro SUID/AppArmor em distros novas)
  const sandboxPath = path.join(appOutDir, "chrome-sandbox");
  if (fs.existsSync(sandboxPath)) {
    fs.unlinkSync(sandboxPath);
    console.log(`[afterPack] ✅ chrome-sandbox removido`);
  }

  // 2. Cria wrapper script com --no-sandbox e env var
  // Usamos o nome do executável definido ou o padrão
  const execName = packager.executableName || packager.appInfo.productFilename || "estudo_25_50_dias";
  const binPath = path.join(appOutDir, execName);
  const realBinPath = path.join(appOutDir, execName + ".real");

  console.log(`[afterPack] 🔧 Configurando wrapper para: ${execName}`);

  if (fs.existsSync(binPath) && !fs.existsSync(realBinPath)) {
    // Renomeia o binário real
    fs.renameSync(binPath, realBinPath);

    // Cria wrapper que passa --no-sandbox e define a env var de desativar sandbox
    const wrapper = `#!/bin/bash
export ELECTRON_DISABLE_SANDBOX=1
HERE="$(dirname "$(readlink -f "$0")")"
exec "$HERE/${execName}.real" --no-sandbox "$@"
`;
    fs.writeFileSync(binPath, wrapper);
    fs.chmodSync(binPath, 0o755);
    console.log(`[afterPack] ✅ Wrapper --no-sandbox + ELECTRON_DISABLE_SANDBOX=1 criado para ${execName}`);
  }
};
