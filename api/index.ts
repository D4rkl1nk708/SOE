import { createApp } from "../server/_core/index";

// Este arquivo é o ponto de entrada para a Vercel.
// Ele exporta o servidor Express para que a Vercel possa rodar como Serverless.

const appPromise = createApp();

export default async (req: any, res: any) => {
  const app = await appPromise;
  return app(req, res);
};
