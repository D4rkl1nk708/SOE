import { Capacitor } from "@capacitor/core";

/**
 * Abre o TEC Concursos no canal correto:
 * - Electron: janela nativa via IPC;
 * - Android/iOS: plugin TecBrowser;
 * - Web: fallback iframe (MobileTecBrowser).
 */
export async function openTecBrowser(pushToken = ""): Promise<void> {
  if ((window as any).electron?.ipcRenderer) {
    (window as any).electron.ipcRenderer.send("open-tec-browser", pushToken);
    return;
  }

  if (Capacitor.isNativePlatform()) {
    try {
      const { TecBrowser } = await import("@/lib/tecBrowser");
      await TecBrowser.open({ url: "https://www.tecconcursos.com.br/" });
      return;
    } catch (e) {
      console.warn("TecBrowser fallback to iframe:", e);
    }
  }

  (window as any).showTecMobile = true;
  document.dispatchEvent(new CustomEvent("soe-open-mobile-browser"));
}
