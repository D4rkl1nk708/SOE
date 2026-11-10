import "dotenv/config";
import { setupVite, serveStatic } from "./vite";
import { configureApp, findAvailablePort } from "./appFactory";

export async function createApp() {
  const { app, server } = await configureApp();

  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  // 127.0.0.1 por padrão: o app é local e o bind em 0.0.0.0 expunha o banco
  // inteiro (inclusive chaves de IA) para qualquer dispositivo da rede.
  // Para sincronizar com o celular na LAN: HOST=0.0.0.0 npm run dev
  const host = process.env.HOST || "127.0.0.1";
  server.listen(port, host, () => {
    console.log(`Server running on http://${host}:${port}/`);
  });

  return { app, server };
}

async function startServer() {
  await createApp();
}

if (process.env.NODE_ENV !== "test") {
  startServer().catch(console.error);
}
