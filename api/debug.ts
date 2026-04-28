export default function handler(req: any, res: any) {
  res.status(200).json({ 
    status: "ok", 
    message: "Vercel diagnostic with tsconfig fix is working",
    timestamp: new Date().toISOString(),
    env: {
      NODE_ENV: process.env.NODE_ENV,
      VERCEL: process.env.VERCEL
    }
  });
}
