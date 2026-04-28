let appPromise: Promise<any> | null = null;

export default async function handler(req: any, res: any) {
  try {
    // Importação dinâmica dentro do handler para capturar erros de carregamento do servidor
    if (!appPromise) {
      const { createApp } = await import("../server/_core/index");
      appPromise = createApp();
    }
    
    const result = await appPromise;
    const app = result.app;
    
    return new Promise((resolve, reject) => {
      res.on("finish", resolve);
      res.on("close", resolve);
      res.on("error", reject);
      app(req, res);
    });
  } catch (err: any) {
    console.error("FATAL ERROR:", err);
    res.status(500).json({
      error: "Initialization Failed",
      message: err?.message || String(err),
      stack: err?.stack,
      hint: "Check if all dependencies are available in Vercel environment"
    });
  }
}
