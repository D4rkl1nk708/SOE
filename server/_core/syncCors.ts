import type { NextFunction, Request, Response } from "express";

/**
 * CORS restrito para /api/sync/* e /api/backup/*.
 *
 * O `Access-Control-Allow-Origin: *` anterior permitia que qualquer site
 * aberto no navegador lesse http://127.0.0.1:<porta>/api/sync/export — dados
 * pessoais e chaves de IA incluídos. O celular usa CapacitorHttp (sem CORS) e
 * o desktop é same-origin, então só liberamos origens locais/privadas.
 */
export function isAllowedSyncOrigin(
  origin: string,
  requestHost?: string,
): boolean {
  try {
    // Permite liberar uma PWA hospedada explicitamente, ex.:
    // SOE_SYNC_ALLOWED_ORIGINS="https://meu-soe.vercel.app"
    const configured = (process.env.SOE_SYNC_ALLOWED_ORIGINS || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    if (configured.includes(origin)) return true;

    const url = new URL(origin);
    const host = url.hostname.toLowerCase();
    const target = (requestHost ?? "").split(":")[0].toLowerCase();

    if (target && (host === target || `[${host}]` === target)) return true;

    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host.endsWith(".local")
    ) {
      return true;
    }

    if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
    if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(host)) return true;

    return url.protocol === "capacitor:" || url.protocol === "ionic:";
  } catch {
    return false;
  }
}

export function syncCors(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const origin = req.headers.origin;
  if (origin && isAllowedSyncOrigin(origin, req.headers.host)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }

  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, HEAD");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Accept, Authorization",
  );
  res.setHeader("Access-Control-Max-Age", "86400");

  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }

  next();
}
