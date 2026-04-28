import { createApp } from "../server/_core/index";

// Este arquivo é o ponto de entrada para a Vercel.
// Ele exporta o servidor Express para que a Vercel possa rodar como Serverless.

const appPromise = createApp();

export default function (req: any, res: any) {
  appPromise
    .then(({ app }) => {
      app(req, res);
    })
    .catch((err) => {
      console.error("Express initialization error:", err);
      res
        .status(500)
        .send("A server error has occurred during initialization.");
    });
}
