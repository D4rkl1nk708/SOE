import { createApp } from "../server/_core/index";

let appPromise: any = null;

export default async function handler(req: any, res: any) {
  try {
    if (!appPromise) {
      appPromise = createApp();
    }
    const { app } = await appPromise;
    return app(req, res);
  } catch (err: any) {
    console.error("Vercel Handler Error:", err);
    if (!res.headersSent) {
      res.status(500).json({
        error: "Server Error",
        message: err?.message || String(err),
        stack: err?.stack
      });
    }
  }
}
