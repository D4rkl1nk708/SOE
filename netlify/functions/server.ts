import { createApp } from "../../server/_core/index";

let appPromise: any = null;

export const handler = async (event: any, context: any) => {
  console.log(`[NETLIFY] Request: ${event.httpMethod} ${event.path}`);
  try {
    if (!appPromise) {
      console.log("[NETLIFY] Initializing app...");
      appPromise = createApp();
    }
    const { app } = await appPromise;

    return new Promise((resolve) => {
      const responseHeaders: any = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
      };
      
      let isResolved = false;

      const res: any = {
        statusCode: 200,
        status(code: number) { this.statusCode = code; return this; },
        setHeader(name: string, value: string) { responseHeaders[name] = value; return this; },
        getHeader(name: string) { return responseHeaders[name]; },
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
          resolve({
            statusCode: this.statusCode,
            headers: responseHeaders,
            body: typeof data === "string" ? data : JSON.stringify(data)
          });
        },
        end(data: any) {
          if (isResolved) return;
          this.send(data || "");
        },
        on() {},
        once() {},
        emit() {},
        removeListener() {}
      };

      const req: any = {
        method: event.httpMethod,
        url: event.path,
        headers: event.headers,
        body: event.body ? (event.isBase64Encoded ? Buffer.from(event.body, "base64").toString() : event.body) : null,
        query: event.queryStringParameters,
        params: {}
      };

      // Se for um POST com JSON, precisamos garantir que o req.body seja um objeto para o Express
      if (req.method === "POST" && req.headers["content-type"]?.includes("application/json") && typeof req.body === "string") {
        try { req.body = JSON.parse(req.body); } catch(e) {}
      }

      app(req, res);
      
      // Timeout de segurança para não deixar a função pendurada
      setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          resolve({ statusCode: 504, body: "Gateway Timeout - Express did not respond in time" });
        }
      }, 9000);
    });
  } catch (err: any) {
    console.error("[NETLIFY] Fatal Error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message, stack: err.stack })
    };
  }
};
