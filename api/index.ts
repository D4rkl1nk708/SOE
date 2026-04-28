import { createApp } from "../server/_core/index.ts";

// Entry point for Vercel Serverless.
// Exporta o Express para a Vercel.

let appPromise: Promise<any> | null = null;

export default async function handler(req: any, res: any) {
  try {
    if (!appPromise) {
      appPromise = createApp();
    }
    
    const { app } = await appPromise;
    
    await new Promise((resolve, reject) => {
      res.on("finish", resolve);
      res.on("close", resolve);
      res.on("error", reject);
      app(req, res);
    });
  } catch (err: any) {
    console.error("Serverless Handler Error:", err);
    if (!res.headersSent) {
      res.status(500).json({ 
        error: "Serverless Handler Error", 
        details: String(err?.message || err),
        stack: err?.stack
      });
    }
  }
}
