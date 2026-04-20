/**
 * Hook para monitorar o Diário Oficial da União
 * Busca o nome do usuário a cada 2 horas e notifica caso haja resultado novo.
 */
import { useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";

const STORAGE_KEY_NAME     = "dou_monitor_name";
const STORAGE_KEY_SEEN     = "dou_monitor_seen_ids";
const STORAGE_KEY_LAST     = "dou_monitor_last_check";
const STORAGE_KEY_INTERVAL = "dou_monitor_interval_minutes";
const DEFAULT_INTERVAL_MS  = 2 * 60 * 60 * 1000;
const isAndroid            = Capacitor.isNativePlatform();
const isElectron           = typeof window !== "undefined" && !!(window as any).electron;
const canFetchDirect       = isAndroid || isElectron;

export const DEFAULT_INTERVAL_MINUTES = 120;
export const MIN_INTERVAL_MINUTES     = 15;
export const MAX_INTERVAL_MINUTES     = 480;

export function saveDOUInterval(minutes: number) {
  localStorage.setItem(STORAGE_KEY_INTERVAL, String(minutes));
}
export function getDOUInterval(): number {
  return parseInt(localStorage.getItem(STORAGE_KEY_INTERVAL) ?? String(DEFAULT_INTERVAL_MINUTES));
}

/** Salva o nome completo que será monitorado */
export function saveDOUName(name: string) {
  localStorage.setItem(STORAGE_KEY_NAME, name.trim());
}

/** Recupera o nome salvo */
export function getDOUName(): string {
  return localStorage.getItem(STORAGE_KEY_NAME) ?? "";
}

/** Monta a URL de busca do DOU */
function buildSearchURL(name: string): string {
  const encoded = encodeURIComponent(`"${name}"`);
  return `https://www.in.gov.br/consulta/-/buscar/dou?q=${encoded}&s=todos&exactDate=all&sortType=0`;
}

/** Faz a busca no DOU.
 * - Electron / Android: fetch direto (sem restrição de CORS)
 * - Browser web: usa proxy /api/dou-search no servidor Express
 */
async function fetchDOUResults(name: string): Promise<{ id: string; title: string; date: string; url: string }[]> {
  const directURL = `https://www.in.gov.br/consulta/-/buscar/dou?q=${encodeURIComponent(`"${name}"`)}&s=todos&exactDate=all&sortType=0`;

  if (canFetchDirect) {
    // ── Electron / Android: fetch direto, sem CORS ─────────────────────────
    const response = await fetch(directURL, {
      headers: {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,*/*",
        "Accept-Language": "pt-BR,pt;q=0.9",
      },
      signal: AbortSignal.timeout(25000),
    });

    if (!response.ok) throw new Error(`DOU retornou HTTP ${response.status}`);
    const html = await response.text();
    return parseDOUHtml(html, directURL);
  }

  // ── Browser web: usa proxy do servidor Express ──────────────────────────
  const proxyURL = `/api/dou-search?name=${encodeURIComponent(name)}`;
  const response = await fetch(proxyURL, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Proxy retornou HTTP ${response.status}`);

  const data = await response.json();
  if (data.error) throw new Error(data.error);

  const results: { id: string; title: string; date: string; url: string }[] = [];

  if (data.source === "html-parsed") {
    const raw: any[] = data.results ?? [];
    raw.forEach((r: any, i: number) => {
      const title = String(r.title || "").replace(/\s+/g, " ").trim();
      if (title.length > 3) {
        results.push({ id: String(r.id || `result-${i}`), title, date: r.date || "", url: r.url || directURL });
      }
    });
    if (results.length === 0 && (data.total ?? 0) > 0) {
      for (let i = 0; i < Math.min(data.total, 10); i++) {
        results.push({ id: `dou-total-${data.total}-${i}`, title: `Publicação no DOU (${i + 1} de ${data.total})`, date: "", url: directURL });
      }
    }
    if (results.length === 0 && (data.rawLength ?? 0) > 10000) {
      results.push({ id: `dou-page-${data.rawLength}`, title: "Publicações encontradas no DOU — abra 'Ver no DOU' para ver", date: "", url: directURL });
    }
  }

  if (data.source === "json") {
    const items = data.data?.results || data.data?.items || (Array.isArray(data.data) ? data.data : []);
    items.forEach((item: any, i: number) => {
      results.push({
        id: String(item.id || item.urlTitle || `json-${i}`),
        title: item.title || item.titulo || `Resultado ${i + 1}`,
        date: item.pubDate || item.dataPublicacao || "",
        url: item.url || (item.urlTitle ? `https://www.in.gov.br${item.urlTitle}` : directURL),
      });
    });
  }

  return results;
}

/** Parseia o HTML do DOU e extrai resultados */
function parseDOUHtml(html: string, fallbackURL: string): { id: string; title: string; date: string; url: string }[] {
  const results: { id: string; title: string; date: string; url: string }[] = [];

  // Tenta parsear via DOMParser (disponível no renderer do Electron e no Android)
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    // Seletores conhecidos do portal do DOU
    const selectors = [
      ".resultado-item",
      ".search-result-item",
      "article[data-id]",
      ".dou-resultado",
      "[class*='resultado']",
      ".portlet-body li",
    ];

    for (const sel of selectors) {
      const items = doc.querySelectorAll(sel);
      if (items.length === 0) continue;
      items.forEach((el, i) => {
        const id = el.getAttribute("data-id") || el.getAttribute("id") || el.querySelector("a")?.getAttribute("href") || `item-${i}`;
        const title = (el.querySelector("h4,h3,h2,.title,.resultado-title,strong,a") as HTMLElement)?.innerText?.trim()
                   || el.querySelector("h4,h3,h2,.title,.resultado-title,strong,a")?.textContent?.trim() || "";
        const date = el.querySelector("time,.date,.data,.publicacao-data")?.textContent?.trim() || "";
        const href = el.querySelector("a")?.getAttribute("href") || "";
        const url = href.startsWith("http") ? href : href ? `https://www.in.gov.br${href}` : fallbackURL;
        if (title.length > 3) results.push({ id: String(id), title, date, url });
      });
      if (results.length > 0) break;
    }

    // Fallback: conta total via texto da página
    if (results.length === 0) {
      const bodyText = doc.body?.textContent ?? "";
      const match = bodyText.match(/(\d+)\s+resultado[s]?\s+encontrado/i);
      const total = match ? parseInt(match[1]) : 0;
      if (total > 0) {
        for (let i = 0; i < Math.min(total, 10); i++) {
          results.push({ id: `dou-count-${total}-${i}`, title: `Publicação no DOU (${i + 1} de ${total})`, date: "", url: fallbackURL });
        }
      }
    }
  } catch { /* ignora erro de parse */ }

  return results;
}
/** Dispara notificação local */
async function sendNotification(title: string, body: string) {
  try {
    if (isAndroid) {
      const { LocalNotifications } = await import("@capacitor/local-notifications");
      const perm = await LocalNotifications.requestPermissions();
      if (perm.display !== "granted") return;

      try {
        await LocalNotifications.createChannel({
          id: "soe_dou",
          name: "Diário Oficial — SOE",
          description: "Alertas de publicação no DOU",
          importance: 5,
          visibility: 1,
          sound: "default",
          vibration: true,
        });
      } catch { /* canal já existe */ }

      await LocalNotifications.schedule({
        notifications: [{
          id: Date.now() % 2147483647,
          title,
          body,
          schedule: { at: new Date(Date.now() + 1000) },
          sound: "default",
          smallIcon: "ic_stat_icon",
          channelId: "soe_dou",
        }],
      });
    } else {
      // Web Notification
      if (!("Notification" in window)) return;
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return;
      new Notification(title, { body, icon: "/favicon.ico", tag: "soe-dou" });
    }
  } catch (e) {
    console.warn("[DOU] Falha ao enviar notificação:", e);
  }
}

/** Verifica o DOU e notifica se houver resultados novos */
async function checkDOU() {
  const name = getDOUName();
  if (!name || name.length < 5) return;

  try {
    const results = await fetchDOUResults(name);
    if (results.length === 0) return;

    // Carrega IDs já vistos
    const seenRaw = localStorage.getItem(STORAGE_KEY_SEEN) ?? "[]";
    const seen: string[] = JSON.parse(seenRaw);

    const newResults = results.filter((r) => !seen.includes(r.id));

    if (newResults.length > 0) {
      // Salva os IDs novos como vistos
      const allSeen = [...seen, ...newResults.map((r) => r.id)].slice(-200);
      localStorage.setItem(STORAGE_KEY_SEEN, JSON.stringify(allSeen));

      // Notifica!
      const count = newResults.length;
      await sendNotification(
        "Diário Oficial — Nova publicação!",
        count === 1
          ? `Seu nome foi encontrado no DOU: "${newResults[0].title.slice(0, 80)}"`
          : `${count} novas publicações com seu nome no Diário Oficial da União!`,
      );
    }

    // Mesmo sem novidade, atualiza timestamp
    localStorage.setItem(STORAGE_KEY_LAST, new Date().toISOString());
  } catch (e) {
    console.warn("[DOU] Erro ao consultar:", e);
  }
}

/** Hook principal — inicia verificação periódica */
export function useDiarioOficial() {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const name = getDOUName();
    if (!name) return;

    const intervalMs = getDOUInterval() * 60 * 1000;
    const lastCheck = localStorage.getItem(STORAGE_KEY_LAST);
    const shouldCheckNow = !lastCheck ||
      (Date.now() - new Date(lastCheck).getTime()) >= intervalMs;

    if (shouldCheckNow) checkDOU();

    const schedule = () => {
      timerRef.current = setTimeout(async () => {
        await checkDOU();
        schedule();
      }, getDOUInterval() * 60 * 1000);
    };
    schedule();

    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);
}

/** Força uma verificação manual imediata. Retorna total de resultados encontrados */
export async function checkDOUNow(): Promise<{ total: number; newCount: number; searchURL: string }> {
  const name = getDOUName();
  if (!name) return { total: 0, newCount: 0, searchURL: "" };

  const results = await fetchDOUResults(name);
  const seenRaw = localStorage.getItem(STORAGE_KEY_SEEN) ?? "[]";
  const seen: string[] = JSON.parse(seenRaw);
  const newResults = results.filter((r) => !seen.includes(r.id));

  if (newResults.length > 0) {
    const allSeen = [...seen, ...newResults.map((r) => r.id)].slice(-200);
    localStorage.setItem(STORAGE_KEY_SEEN, JSON.stringify(allSeen));
    await sendNotification(
      "Diário Oficial — Nova publicação!",
      newResults.length === 1
        ? `"${newResults[0].title.slice(0, 80)}"`
        : `${newResults.length} novas publicações com seu nome no DOU!`,
    );
  }

  localStorage.setItem(STORAGE_KEY_LAST, new Date().toISOString());
  return { total: results.length, newCount: newResults.length, searchURL: buildSearchURL(name) };
}

// ── API usada pela UI do Perfil ───────────────────────────────────────────────
export async function douGetConfig() {
  return {
    name: getDOUName(),
    intervalMinutes: getDOUInterval(),
    lastCheck: localStorage.getItem(STORAGE_KEY_LAST),
    searchURL: buildSearchURL(getDOUName()),
  };
}

export async function douSaveConfig(config: { name?: string; intervalMinutes?: number }) {
  if (config.name !== undefined) saveDOUName(config.name);
  if (config.intervalMinutes !== undefined) saveDOUInterval(config.intervalMinutes);
}

export async function douCheckNow(): Promise<{ total: number; newCount: number; searchURL: string }> {
  return checkDOUNow();
}
