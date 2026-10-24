/**
 * Entry point para produção e Electron.
 * Unificado com appFactory (mesmas rotas, middlewares e lógica de dev).
 */
import path from "path";
import { serveStatic } from "./serveStatic";
import { configureApp, findAvailablePort } from "./appFactory";

declare const __dirname: string;

async function startServer() {
  const { app, server } = await configureApp();

  serveStatic(app, path.join(__dirname, "public"));

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${port}/`);
  });
}

startServer().catch(console.error);
