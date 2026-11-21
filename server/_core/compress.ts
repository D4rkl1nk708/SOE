import type { NextFunction, Request, Response } from "express";
import zlib from "zlib";

/**
 * gzip sem dependência externa.
 *
 * O dashboard chega a 134 KB de JSON e os endpoints de estatística também; o
 * app roda local, mas o APK/sync acessa pela rede e o Electron lê do mesmo
 * servidor. Comprimir reduz ~90% do tráfego com zero pacote novo.
 *
 * Regras: só comprime quando o cliente aceita gzip, a resposta é compressível,
 * passa de 1 KB e ainda não tem Content-Encoding. Streaming (SSE) fica de fora.
 */
const COMPRESSIBLE =
  /^(application\/json|application\/javascript|text\/|image\/svg|application\/xml|application\/manifest)/i;

export function gzipResponses() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const accept = String(req.headers["accept-encoding"] || "");
    if (!accept.includes("gzip")) {
      next();
      return;
    }

    const originalWrite = res.write.bind(res);
    const originalEnd = res.end.bind(res);
    const chunks: Buffer[] = [];
    let bypass = false;

    const shouldBypass = (): boolean => {
      if (bypass) return true;
      const type = String(res.getHeader("content-type") || "");
      if (/event-stream/i.test(type)) return true;
      if (res.getHeader("content-encoding")) return true;
      if (req.method === "HEAD") return true;
      return false;
    };

    res.write = function write(chunk: any, encoding?: any, cb?: any): boolean {
      if (shouldBypass()) return originalWrite(chunk, encoding, cb);
      if (chunk)
        chunks.push(
          Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding),
        );
      // O callback só deve rodar quando o dado realmente sair.
      if (typeof encoding === "function") encoding();
      else if (typeof cb === "function") cb();
      return true;
    };

    res.end = function end(chunk?: any, encoding?: any, cb?: any): Response {
      if (shouldBypass()) {
        if (typeof encoding === "function") return originalEnd(chunk, encoding);
        if (typeof cb === "function") return originalEnd(chunk, encoding, cb);
        return originalEnd(chunk, encoding);
      }
      if (chunk)
        chunks.push(
          Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding),
        );
      const body = chunks.length === 1 ? chunks[0] : Buffer.concat(chunks);
      const type = String(res.getHeader("content-type") || "");
      const compressible = COMPRESSIBLE.test(type) || chunks.length === 0;
      if (body.length < 1024 || !compressible) {
        res.removeHeader("ETag");
        res.setHeader("Content-Length", String(body.length));
        return originalEnd(body);
      }
      try {
        const gz = zlib.gzipSync(body, { level: 6 });
        res.setHeader("Content-Encoding", "gzip");
        res.setHeader("Vary", "Accept-Encoding");
        res.removeHeader("ETag");
        res.setHeader("Content-Length", String(gz.length));
        return originalEnd(gz);
      } catch {
        res.setHeader("Content-Length", String(body.length));
        return originalEnd(body);
      }
    };

    // Se algo derrubar a conexão no meio, libera o modo normal.
    res.on("close", () => {
      bypass = true;
    });

    next();
  };
}
