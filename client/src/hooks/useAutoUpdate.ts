import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";

// __APP_VERSION__ is injected by Vite
declare const __APP_VERSION__: string;

const GITHUB_REPO_API = "https://api.github.com/repos/D4rkl1nk708/SOE/releases/latest";

function compareVersions(v1: string, v2: string) {
  const parts1 = v1.replace(/^v/, "").split(".").map(Number);
  const parts2 = v2.replace(/^v/, "").split(".").map(Number);
  
  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const n1 = parts1[i] || 0;
    const n2 = parts2[i] || 0;
    if (n1 > n2) return 1;
    if (n1 < n2) return -1;
  }
  return 0;
}

export function useAutoUpdate() {
  useEffect(() => {
    const checkUpdate = async () => {
      try {
        const response = await fetch(GITHUB_REPO_API, {
          headers: {
            "Accept": "application/vnd.github.v3+json"
          }
        });

        if (!response.ok) return;

        const data = await response.json();
        const latestVersion = data.tag_name;
        const currentVersion = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "1.0.0";

        if (latestVersion && compareVersions(latestVersion, currentVersion) > 0) {
          const wantUpdate = window.confirm(
            `Uma nova versão do SOE (${latestVersion}) está disponível!\nVocê está usando a versão ${currentVersion}.\nDeseja baixar a atualização agora?`
          );

          if (wantUpdate) {
            const assets = data.assets || [];
            const platform = Capacitor.getPlatform();
            const ua = window.navigator.userAgent.toLowerCase();
            
            let bestAsset = null;

            if (platform === 'android') {
              bestAsset = assets.find((a: any) => a.name.endsWith('.apk'));
            } else if (ua.includes('win')) {
              bestAsset = assets.find((a: any) => a.name.endsWith('.exe'));
            } else if (ua.includes('linux')) {
              bestAsset = assets.find((a: any) => a.name.endsWith('.AppImage'));
            }

            // Se encontrou o arquivo específico, usa ele. Caso contrário, vai para a página da release.
            const downloadUrl = bestAsset ? bestAsset.browser_download_url : data.html_url;

            if (downloadUrl) {
              window.open(downloadUrl, "_blank");
            }
          }
        }
      } catch (error) {
        console.error("Falha ao verificar atualizações:", error);
      }
    };

    // Verificar atualização quando o app iniciar
    checkUpdate();
  }, []);
}
