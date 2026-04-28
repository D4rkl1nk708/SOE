export default async function handler(req: any, res: any) {
  res.status(200).json({
    hello: "world",
    vercel: !!process.env.VERCEL,
    node: process.version,
    env: process.env.NODE_ENV,
  });
}
