import { createApp } from "../../server/_core/index";

let appPromise: any = null;

export const handler = async (event: any, context: any) => {
  const method = event.httpMethod;
  const path = event.path;
  console.log(`[NETLIFY] Incoming: ${method} ${path}`);

  try {
    if (!appPromise) {
      console.log("[NETLIFY] Bootstrapping Express...");
      appPromise = createApp();
    }
    const { app } = await appPromise;

    return new Promise((resolve) => {
      const responseHeaders: any = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-TRPC-Source",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS, DELETE, PUT"
      };
      
      let isResolved = false;

      const res: any = {
        statusCode: 200,
        status(code: number) { this.statusCode = code; return this; },
        setHeader(name: string, value: string) { responseHeaders[name.toLowerCase()] = value; return this; },
        getHeader(name: string) { return responseHeaders[name.toLowerCase()]; },
        json(data: any) { 
          if (isResolved) return;
          isResolved = true;
          this.setHeader("Content-Type", "application/json");
          resolve({
            statusCode: this.statusCode,
            headers: responseHeaders,
            body: JSON.stringify(data)
          });
        },
        send(data: any) {
          if (isResolved) return;
          isResolved = true;
          const body = typeof data === "string" ? data : JSON.stringify(data);
          resolve({
            statusCode: this.statusCode,
            headers: responseHeaders,
            body: body
          });
        },
        end(data: any) {
          this.send(data || "");
        },
        on() { return this; },
        once() { return this; },
        emit() { return true; },
        removeListener() { return this; }
      };

      // Normalizar headers para lowercase (como o Express espera)
      const normalizedHeaders: any = {};
      for (const key in event.headers) {
        normalizedHeaders[key.toLowerCase()] = event.headers[key];
      }

      const req: any = {
        method: method,
        url: path,
        headers: normalizedHeaders,
        cookies: {},
        body: event.body ? (event.isBase64Encoded ? Buffer.from(event.body, "base64").toString() : event.body) : null,
        query: event.queryStringParameters || {},
        params: {}
      };

      // Parse Cookies manual
      if (normalizedHeaders.cookie) {
        normalizedHeaders.cookie.split(";").forEach((c: string) => {
          const [key, ...v] = c.split("=");
          if (key) req.cookies[key.trim()] = v.join("=");
        });
      }

      // IMPORTANTE: tRPC e outros middlewares as vezes precisam do body bruto ou já parseado
      if (method === "POST" && normalizedHeaders["content-type"]?.includes("application/json") && typeof req.body === "string") {
        try { req.body = JSON.parse(req.body); } catch(e) { console.error("[NETLIFY] JSON Parse Error", e); }
      }

      // Chamar o Express
      app(req, res);

      // Proteção contra silêncio do Express
      setTimeout(() => {
        if (!isResolved) {
          console.error(`[NETLIFY] Timeout for ${path}`);
          isResolved = true;
          resolve({
            statusCode: 504,
            headers: responseHeaders,
            body: JSON.stringify({ error: "Express timeout", path })
          });
        }
      }, 8500);
    });
  } catch (err: any) {
    console.error("[NETLIFY] Handler Crash:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message, stack: err.stack })
    };
  }
};
