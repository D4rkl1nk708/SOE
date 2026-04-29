export default async function handler(req: any, res: any) {
  try {
    const core = await import("../server/_core/index");
    res.status(200).json({ success: true, keys: Object.keys(core) });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: "Import Error",
      message: err.message,
      stack: err.stack,
    });
  }
}
