// Entry point for Vercel Serverless.
// Exporta o Express para a Vercel.

let appPromise: Promise<any> | null = null;

export default async function handler(req: any, res: any) {
  console.log(`[Vercel] Request received: ${req.method} ${req.url}`);
  
  try {
    if (!appPromise) {
      console.log("[Vercel] Dynamically importing createApp...");
      // Using dynamic import to catch top-level errors in the server module
      appPromise = import("../server/_core/index").then(mod => mod.createApp());
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
        stack: err?.stack,
        phase: "dynamic-import-or-runtime"
      });
    }
  }
}
