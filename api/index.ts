let appPromise = null;

export default async function handler(req, res) {
  try {
    // Importação dinâmica dentro do handler para capturar erros de carregamento do servidor
    if (!appPromise) {
      const { createApp } = await import("../server/_core/index.ts");
      appPromise = createApp();
    }
    
    const { app } = await appPromise;
    
    return new Promise((resolve, reject) => {
      res.on("finish", resolve);
      res.on("close", resolve);
      res.on("error", reject);
      app(req, res);
    });
  } catch (err) {
    console.error("FATAL ERROR:", err);
    res.status(500).json({
      error: "Initialization Failed",
      message: err.message,
      stack: err.stack,
      hint: "Check if all dependencies are available in Vercel environment"
    });
  }
}
