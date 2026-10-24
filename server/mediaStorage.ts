import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

let DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
let UPLOADS_DIR = path.join(DATA_DIR, "uploads");

export function setUploadsDir(newDataDir: string) {
  DATA_DIR = newDataDir;
  UPLOADS_DIR = path.join(DATA_DIR, "uploads");
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
}

export function getUploadsDir(): string {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
  return UPLOADS_DIR;
}

// Ensure uploads dir exists
if (!fs.existsSync(UPLOADS_DIR)) {
  try {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  } catch {}
}

/**
 * Extracts a data:image/... base64 string to a physical file on disk in data/uploads/
 * and returns the relative URL `/uploads/{filename}`.
 * If the input is already a URL or relative path, it returns it unchanged.
 */
export function persistBase64Media(
  dataUriOrUrl: string | undefined | null,
  prefix = "media",
): string | undefined {
  if (!dataUriOrUrl) return undefined;
  if (!dataUriOrUrl.startsWith("data:")) return dataUriOrUrl;

  const matches = dataUriOrUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
  if (!matches || matches.length !== 3) {
    return dataUriOrUrl;
  }

  try {
    const mimeType = matches[1];
    const buffer = Buffer.from(matches[2], "base64");
    const ext =
      mimeType.includes("jpeg") || mimeType.includes("jpg")
        ? "jpg"
        : mimeType.includes("webp")
          ? "webp"
          : "png";

    const hash = crypto
      .createHash("sha256")
      .update(buffer)
      .digest("hex")
      .slice(0, 16);
    const fileName = `${prefix}_${hash}.${ext}`;
    const filePath = path.join(getUploadsDir(), fileName);

    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, buffer);
    }

    return `/uploads/${fileName}`;
  } catch (err) {
    console.error("[mediaStorage] Failed to persist base64 media:", err);
    return dataUriOrUrl;
  }
}
