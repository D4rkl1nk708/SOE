import { Capacitor } from "@capacitor/core";

const TEC_HOME = "https://www.tecconcursos.com.br/";

/**
 * Abre o TEC Concursos no canal correto:
 * - Electron: janela nativa via IPC (token + url opcional);
 * - Android/iOS: plugin TecBrowser (aceita `url`);
 * - Web: fallback iframe (MobileTecBrowser).
 *
 * `url` é opcional: sem ela abre a home do TEC. Quem só tem o token continua
 * podendo chamar `openTecBrowser(token)`.
 */
export async function openTecBrowser(
  pushToken = "",
  url?: string,
): Promise<void> {
  const targetUrl = typeof url === "string" ? url.trim() : "";

  if ((window as any).electron?.ipcRenderer) {
    (window as any).electron.ipcRenderer.send(
      "open-tec-browser",
      pushToken,
      targetUrl,
    );
    return;
  }

  if (Capacitor.isNativePlatform()) {
    try {
      const { TecBrowser } = await import("@/lib/tecBrowser");
      await TecBrowser.open({ url: targetUrl || TEC_HOME });
      return;
    } catch (e) {
      console.warn("TecBrowser fallback to iframe:", e);
    }
  }

  (window as any).showTecMobile = true;
  document.dispatchEvent(
    new CustomEvent("soe-open-mobile-browser", {
      detail: targetUrl ? { url: targetUrl } : undefined,
    }),
  );
}
