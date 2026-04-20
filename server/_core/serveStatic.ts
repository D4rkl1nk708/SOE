import express from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: express.Express, publicDir: string) {
  const distPath = path.resolve(publicDir);
  if (!fs.existsSync(distPath)) {
    console.error(`Could not find the build directory: ${distPath}, make sure to build the client first`);
  }
  app.use(express.static(distPath, {
    setHeaders: (res: any, filePath: string) => {
      if (filePath.endsWith(".html")) res.setHeader("Content-Type", "text/html; charset=utf-8");
      else if (filePath.endsWith(".js") || filePath.endsWith(".mjs")) res.setHeader("Content-Type", "application/javascript; charset=utf-8");
      else if (filePath.endsWith(".css")) res.setHeader("Content-Type", "text/css; charset=utf-8");
    }
  }));
  app.use("*", (_req: any, res: any) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
