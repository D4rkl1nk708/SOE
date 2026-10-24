import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";

// __APP_VERSION__ is injected by Vite
declare const __APP_VERSION__: string;

const GITHUB_REPO_API =
  "https://api.github.com/repos/D4rkl1nk708/SOE/releases/latest";

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

async function triggerSafetyBackup() {
  try {
    const isAndroid = Capacitor.isNativePlatform();
    let json = "";
    if (isAndroid) {
      const { localImportExportBackup } = await import("@/lib/localDb");
      json = await localImportExportBackup();
    } else {
      const res = await fetch("/api/sync/export");
      if (res.ok) {
        json = await res.text();
      }
    }
    if (!json) return;

    const fileName = `soe-backup-seguranca-${new Date().toISOString().split("T")[0]}.json`;

    if (Capacitor.isNativePlatform()) {
      const { Filesystem, Directory } = await import("@capacitor/filesystem");
      const { Share } = await import("@capacitor/share");

      await Filesystem.writeFile({
        path: fileName,
        data: json,
        directory: Directory.Cache,
        encoding: "utf8" as any,
      });

      const fileUri = await Filesystem.getUri({
        path: fileName,
        directory: Directory.Cache,
      });

      await Share.share({
        title: "Backup de Segurança SOE",
        text: "Backup do banco de dados antes da atualização.",
        url: fileUri.uri,
        dialogTitle: "Salvar ou Compartilhar Backup",
      });
    } else {
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    }
  } catch (err) {
    console.warn("Erro ao gerar backup pré-atualização:", err);
  }
}

export function useAutoUpdate() {
  useEffect(() => {
    const checkUpdate = async () => {
      try {
        const response = await fetch(GITHUB_REPO_API, {
          headers: {
            Accept: "application/vnd.github.v3+json",
          },
        });

        if (!response.ok) return;

        const data = await response.json();
        const latestVersion = data.tag_name;
        const currentVersion =
          typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "1.0.0";

        if (
          latestVersion &&
          compareVersions(latestVersion, currentVersion) > 0
        ) {
          // Lembrete OBRIGATÓRIO de segurança antes de oferecer o download da atualização
          const wantBackup = window.confirm(
            `⚠️ ATENÇÃO: NOVA ATUALIZAÇÃO DISPONÍVEL (${latestVersion})\n\n` +
              `LEMBRETE DE SEGURANÇA:\nAntes de atualizar, recomendamos fortemente EXPORTAR O BANCO DE DADOS para garantir que nenhum progresso seja perdido durante a atualização!\n\n` +
              `Deseja exportar/salvar o seu banco de dados agora antes de prosseguir?`,
          );

          if (wantBackup) {
            await triggerSafetyBackup();
          }

          const wantUpdate = window.confirm(
            `Uma nova versão do SOE (${latestVersion}) está pronta para download!\n` +
              `Versão atual instalada: ${currentVersion}.\n\n` +
              `Deseja baixar e instalar a nova atualização agora?`,
          );

          if (wantUpdate) {
            const assets = data.assets || [];
            const platform = Capacitor.getPlatform();
            const ua = window.navigator.userAgent.toLowerCase();

            const isAndroid = platform === "android" || ua.includes("android");
            const isWindows = ua.includes("win");
            const isMac = ua.includes("mac") || ua.includes("darwin");
            const isLinux =
              (ua.includes("linux") || ua.includes("x11")) && !isAndroid;

            let bestAsset = null;

            if (isAndroid) {
              bestAsset = assets.find((a: any) =>
                a.name.toLowerCase().endsWith(".apk"),
              );
            } else if (isWindows) {
              bestAsset = assets.find((a: any) =>
                a.name.toLowerCase().endsWith(".exe"),
              );
            } else if (isLinux) {
              bestAsset = assets.find((a: any) =>
                a.name.toLowerCase().endsWith(".appimage"),
              );
            } else if (isMac) {
              bestAsset = assets.find(
                (a: any) =>
                  a.name.toLowerCase().endsWith(".dmg") ||
                  a.name.toLowerCase().endsWith(".zip"),
              );
            }

            const downloadUrl = bestAsset
              ? bestAsset.browser_download_url
              : data.html_url;

            if (downloadUrl) {
              window.open(downloadUrl, "_blank");
              setTimeout(() => {
                fetch("/api/quit", {
                  method: "POST",
                  headers: { "X-SOE-Action": "quit" },
                }).catch(() => {});
              }, 1000);
            }
          }
        }
      } catch (error) {
        console.error("Falha ao verificar atualizações:", error);
      }
    };

    checkUpdate();
  }, []);
}
