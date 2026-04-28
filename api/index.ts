import { createApp } from "../server/_core/index";

// Este arquivo é o ponto de entrada para a Vercel.
// Ele exporta o servidor Express para que a Vercel possa rodar como Serverless.

const appPromise = createApp();

export default async function handler(req: any, res: any) {
  try {
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
      res
        .status(500)
        .json({
          error: "Serverless Handler Error",
          details: String(err?.message || err),
        });
    }
  }
}
