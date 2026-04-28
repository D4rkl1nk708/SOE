import { createApp } from "../server/_core/index";

// Este arquivo é o ponto de entrada para a Vercel.
// Ele exporta o servidor Express para que a Vercel possa rodar como Serverless.

let appPromise: Promise<any> | null = null;

export default async function handler(req: any, res: any) {
  console.log(`[Vercel] Request received: ${req.method} ${req.url}`);
  
  try {
    if (!appPromise) {
      console.log("[Vercel] Initializing Express app...");
      appPromise = createApp();
    }
    
    const { app } = await appPromise;
    
    // Ensure the response is handled by Express and waited for
    await new Promise((resolve, reject) => {
      res.on("finish", () => {
        console.log("[Vercel] Response finished");
        resolve(true);
      });
      res.on("close", () => {
        console.log("[Vercel] Response closed");
        resolve(true);
      });
      res.on("error", (err: any) => {
        console.error("[Vercel] Response error:", err);
        reject(err);
      });
      
      // Call the Express app
      app(req, res);
    });
  } catch (err: any) {
    console.error("Serverless Handler Error:", err);
    if (!res.headersSent) {
      res.status(500).json({ 
        error: "Serverless Handler Error", 
        details: String(err?.message || err),
        stack: err?.stack,
        phase: appPromise ? "runtime" : "initialization"
      });
    }
  }
}
