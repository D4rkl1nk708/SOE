import { createApp } from "../../server/_core/index";

let appPromise: any = null;

export const handler = async (event: any, context: any) => {
  try {
    if (!appPromise) {
      appPromise = createApp();
    }
    const { app } = await appPromise;

    // Ponte simples Netlify -> Express
    return new Promise((resolve) => {
      const responseHeaders: any = {};
      const res: any = {
        statusCode: 200,
        status(code: number) { this.statusCode = code; return this; },
        setHeader(name: string, value: string) { responseHeaders[name] = value; return this; },
        getHeader(name: string) { return responseHeaders[name]; },
        json(data: any) { 
          this.setHeader("Content-Type", "application/json");
          resolve({
            statusCode: this.statusCode,
            headers: responseHeaders,
            body: JSON.stringify(data)
          });
        },
        send(data: any) {
          resolve({
            statusCode: this.statusCode,
            headers: responseHeaders,
            body: typeof data === "string" ? data : JSON.stringify(data)
          });
        },
        end(data: any) {
          this.send(data || "");
        },
        // Mock de métodos necessários pelo Express/tRPC
        on() {},
        once() {},
        emit() {},
        removeListener() {}
      };

      const req: any = {
        method: event.httpMethod,
        url: event.path,
        headers: event.headers,
        body: event.isBase64Encoded ? Buffer.from(event.body, "base64").toString() : event.body,
        query: event.queryStringParameters,
        params: {}
      };

      app(req, res);
    });
  } catch (err: any) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message, stack: err.stack })
    };
  }
};
