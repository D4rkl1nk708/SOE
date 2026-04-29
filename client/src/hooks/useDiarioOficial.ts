import { useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { trpcVanilla } from "@/lib/trpc-vanilla";

const isAndroid = Capacitor.isNativePlatform();
const isElectron = typeof window !== "undefined" && !!(window as any).electron;
const canFetchDirect = isAndroid || isElectron;

/** Recupera as configurações do DOU do servidor */
export async function douGetConfig() {
  try {
    return await trpcVanilla.dou.getConfig.query();
  } catch (e) {
    console.error("[DOU] Error fetching config:", e);
    return { name: "", intervalMinutes: 120, lastCheck: null, seenIds: [] };
  }
}

/** Salva as configurações do DOU no servidor */
export async function douSaveConfig(config: {
  name?: string;
  intervalMinutes?: number;
  lastCheck?: string;
  seenIds?: string[];
}) {
  try {
    await trpcVanilla.dou.updateConfig.mutate(config);
  } catch (e) {
    console.error("[DOU] Error saving config:", e);
  }
}

/** Faz a busca no DOU. */
async function fetchDOUResults(
  name: string,
): Promise<{ id: string; title: string; date: string; url: string }[]> {
  const directURL = `https://www.in.gov.br/consulta/-/buscar/dou?q=${encodeURIComponent(`"${name}"`)}&s=todos&exactDate=all&sortType=0`;

  if (canFetchDirect) {
    const response = await fetch(directURL, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,*/*",
        "Accept-Language": "pt-BR,pt;q=0.9",
      },
      signal: AbortSignal.timeout(25000),
    });

    if (!response.ok) throw new Error(`DOU retornou HTTP ${response.status}`);
    const html = await response.text();
    return parseDOUHtml(html, directURL);
  }

  // Browser web: usa proxy do servidor Express
  const proxyURL = `/api/dou-search?name=${encodeURIComponent(name)}`;
  const response = await fetch(proxyURL, {
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`Proxy retornou HTTP ${response.status}`);

  const data = await response.json();
  if (data.error) throw new Error(data.error);

  const results: { id: string; title: string; date: string; url: string }[] =
    [];
  if (data.source === "html-parsed") {
    const raw: any[] = data.results ?? [];
    raw.forEach((r: any, i: number) => {
      const title = String(r.title || "")
        .replace(/\s+/g, " ")
        .trim();
      if (title.length > 3) {
        results.push({
          id: String(r.id || `result-${i}`),
          title,
          date: r.date || "",
          url: r.url || directURL,
        });
      }
    });
  }
  if (data.source === "json") {
    const items =
      data.data?.results ||
      data.data?.items ||
      (Array.isArray(data.data) ? data.data : []);
    items.forEach((item: any, i: number) => {
      results.push({
        id: String(item.id || item.urlTitle || `json-${i}`),
        title: item.title || item.titulo || `Resultado ${i + 1}`,
        date: item.pubDate || item.dataPublicacao || "",
        url:
          item.url ||
          (item.urlTitle ? `https://www.in.gov.br${item.urlTitle}` : directURL),
      });
    });
  }
  return results;
}

/** Parseia o HTML do DOU e extrai resultados */
function parseDOUHtml(
  html: string,
  fallbackURL: string,
): { id: string; title: string; date: string; url: string }[] {
  const results: { id: string; title: string; date: string; url: string }[] =
    [];
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const selectors = [
      ".resultado-item",
      ".search-result-item",
      "article[data-id]",
      ".dou-resultado",
    ];
    for (const sel of selectors) {
      const items = doc.querySelectorAll(sel);
      if (items.length === 0) continue;
      items.forEach((el, i) => {
        const id =
          el.getAttribute("data-id") ||
          el.getAttribute("id") ||
          el.querySelector("a")?.getAttribute("href") ||
          `item-${i}`;
        const title =
          (
            el.querySelector(
              "h4,h3,h2,.title,.resultado-title,strong,a",
            ) as HTMLElement
          )?.innerText?.trim() || "";
        const date =
          el
            .querySelector("time,.date,.data,.publicacao-data")
            ?.textContent?.trim() || "";
        const href = el.querySelector("a")?.getAttribute("href") || "";
        const url = href.startsWith("http")
          ? href
          : href
            ? `https://www.in.gov.br${href}`
            : fallbackURL;
        if (title.length > 3)
          results.push({ id: String(id), title, date, url });
      });
      if (results.length > 0) break;
    }
  } catch {}
  return results;
}

async function sendNotification(title: string, body: string) {
  try {
    if (isAndroid) {
      const { LocalNotifications } =
        await import("@capacitor/local-notifications");
      await LocalNotifications.schedule({
        notifications: [
          {
            id: Date.now() % 2147483647,
            title,
            body,
            schedule: { at: new Date(Date.now() + 1000) },
            sound: "default",
            channelId: "soe_dou",
          },
        ],
      });
    } else {
      if (!("Notification" in window)) return;
      const perm = await Notification.requestPermission();
      if (perm === "granted")
        new Notification(title, { body, icon: "/favicon.ico", tag: "soe-dou" });
    }
  } catch (e) {
    console.warn("[DOU] Notification failed:", e);
  }
}

/** Verifica o DOU e notifica se houver resultados novos */
export async function checkDOU() {
  const config = await douGetConfig();
  if (!config.name || config.name.length < 5) return;

  try {
    const results = await fetchDOUResults(config.name);
    if (results.length === 0) return;

    const seen = config.seenIds || [];
    const newResults = results.filter((r) => !seen.includes(r.id));

    if (newResults.length > 0) {
      const allSeen = [...seen, ...newResults.map((r) => r.id)].slice(-200);
      const existingResults = config.results || [];
      const allResults = [...newResults, ...existingResults].slice(0, 50); // Keep last 50 citations
      await douSaveConfig({ seenIds: allSeen, results: allResults });
      await sendNotification(
        "Diário Oficial — Nova publicação!",
        newResults.length === 1
          ? `Seu nome foi encontrado no DOU: "${newResults[0].title.slice(0, 80)}"`
          : `${newResults.length} novas publicações no DOU!`,
      );
    }
    await douSaveConfig({ lastCheck: new Date().toISOString() });
  } catch (e) {
    console.warn("[DOU] Error checking:", e);
  }
}

export function useDiarioOficial() {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let active = true;

    const run = async () => {
      const config = await douGetConfig();
      if (!active || !config.name || config.name.length < 5) return;

      const intervalMs = (config.intervalMinutes || 120) * 60 * 1000;
      const last = config.lastCheck ? new Date(config.lastCheck).getTime() : 0;
      const now = Date.now();

      if (now - last >= intervalMs) {
        await checkDOU();
      }

      timerRef.current = setTimeout(run, 60000); // Check every minute if it's time to check DOU
    };

    run();

    return () => {
      active = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);
}

export async function douCheckNow(): Promise<{
  total: number;
  newCount: number;
  searchURL: string;
}> {
  const config = await douGetConfig();
  if (!config.name) return { total: 0, newCount: 0, searchURL: "" };
  const results = await fetchDOUResults(config.name);
  const seen = config.seenIds || [];
  const newResults = results.filter((r) => !seen.includes(r.id));
  if (newResults.length > 0) {
    const allSeen = [...seen, ...newResults.map((r) => r.id)].slice(-200);
    const existingResults = config.results || [];
    const allResults = [...newResults, ...existingResults].slice(0, 50);
    await douSaveConfig({ seenIds: allSeen, results: allResults });
    await sendNotification(
      "DOU — Nova publicação!",
      `${newResults.length} novas publicações encontradas.`,
    );
  }
  await douSaveConfig({ lastCheck: new Date().toISOString() });
  return {
    total: results.length,
    newCount: newResults.length,
    searchURL: `https://www.in.gov.br/consulta/-/buscar/dou?q=${encodeURIComponent(`"${config.name}"`)}&s=todos&exactDate=all&sortType=0`,
  };
}
