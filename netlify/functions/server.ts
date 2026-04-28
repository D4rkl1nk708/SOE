import { createApp } from "../../server/_core/index";
import serverless from "serverless-http";

// Cache do handler para reuso em warm starts
let handlerPromise: any = null;

/**
 * Netlify Function Handler
 * Usa serverless-http para fazer a ponte perfeita entre o Express e o ambiente Lambda.
 */
export const handler = async (event: any, context: any) => {
  console.log(`[NETLIFY] Request: ${event.httpMethod} ${event.path}`);

  try {
    if (!handlerPromise) {
      console.log("[NETLIFY] First run: initializing Express app...");
      handlerPromise = (async () => {
        const { app } = await createApp();
        return serverless(app, {
          // Normaliza o caminho para que o Express (que espera /api/...)
          // entenda as requisições vindas do Netlify (/.netlify/functions/server/...)
          request: (request, event) => {
            const rawPath = event.path || "";
            const normalizedPath = rawPath.replace(
              /^\/\.netlify\/functions\/server/,
              "/api",
            );
            (request as any).url = normalizedPath;

            // Log para debug interno do Netlify
            console.log(`[NETLIFY] Routing: ${rawPath} -> ${normalizedPath}`);
          },
        });
      })();
    }

    const serverlessHandler = await handlerPromise;
    return await serverlessHandler(event, context);
  } catch (err: any) {
    console.error("[NETLIFY] Critical Bridge Error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Internal Server Error (Netlify Bridge)",
        message: err.message,
        path: event.path,
      }),
    };
  }
};
