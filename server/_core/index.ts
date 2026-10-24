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

  server.listen(port, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${port}/`);
  });

  return { app, server };
}

async function startServer() {
  await createApp();
}

if (process.env.NODE_ENV !== "test") {
  startServer().catch(console.error);
}
