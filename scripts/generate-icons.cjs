/**
 * Gera o conjunto de ícones do SOE (desktop, PWA e Android) a partir de um
 * único SVG. Rode com: node scripts/generate-icons.cjs
 *
 * Requer `sharp` e `png-to-ico` (instalados com --no-save).
 */
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const pngToIcoMod = require("png-to-ico");
const pngToIco = pngToIcoMod.default || pngToIcoMod;

const ROOT = path.resolve(__dirname, "..");
const BLUE_TOP = "#0A84FF";
const BLUE_BOTTOM = "#0053B8";
const BLUE_SOLID = "#0066CC";

/**
 * Livro aberto: duas páginas cheias com a lombada no vão central. Desenhado
 * em viewBox 100 a partir do centro (50,50), com 84 de largura.
 */
function bookGlyph(scale, cx = 50, cy = 50) {
  const tx = cx - 50 * scale;
  const ty = cy - 50 * scale;
  // Livro aberto: páginas retas com a borda superior subindo para a lombada
  // e a inferior caindo para fora (perspectiva de livro aberto).
  return `
    <g transform="translate(${tx} ${ty}) scale(${scale})">
      <path d="M9 27 Q9 22.6 13.4 22 L45 18.6 Q48 18.2 48 22.4 L48 77.4 L13.4 81.4 Q9 81.8 9 77.4 Z"
            fill="#FFFFFF" />
      <path d="M91 27 Q91 22.6 86.6 22 L55 18.6 Q52 18.2 52 22.4 L52 77.4 L86.6 81.4 Q91 81.8 91 77.4 Z"
            fill="#FFFFFF" />
    </g>`;
}

function squircleBackground(id) {
  return `
    <defs>
      <linearGradient id="${id}" x1="170" y1="40" x2="880" y2="1000" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="${BLUE_TOP}" />
        <stop offset="0.55" stop-color="#0071E3" />
        <stop offset="1" stop-color="${BLUE_BOTTOM}" />
      </linearGradient>
      <radialGradient id="${id}-glow" cx="0.3" cy="0.12" r="0.85">
        <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.22" />
        <stop offset="1" stop-color="#FFFFFF" stop-opacity="0" />
      </radialGradient>
    </defs>`;
}

function appIconSvg(size = 1024) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">
    ${squircleBackground("bg")}
    <rect x="0" y="0" width="1024" height="1024" rx="232" fill="url(#bg)" />
    <rect x="0" y="0" width="1024" height="1024" rx="232" fill="url(#bg-glow)" />
    ${bookGlyph(7.2, 512, 506)}
  </svg>`;
}

function appIconRoundSvg(size = 1024) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">
    ${squircleBackground("bg")}
    <circle cx="512" cy="512" r="512" fill="url(#bg)" />
    <circle cx="512" cy="512" r="512" fill="url(#bg-glow)" />
    ${bookGlyph(7.2, 512, 506)}
  </svg>`;
}

/** Camada de frente do ícone adaptativo: só o livro, dentro da zona segura. */
function adaptiveForegroundSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="108" height="108" viewBox="0 0 108 108">
    ${bookGlyph(0.7, 54, 54)}
  </svg>`;
}

const out = (p) => path.join(ROOT, p);
const transparent = { r: 0, g: 0, b: 0, alpha: 0 };

async function png(svg, dest, size) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  await sharp(Buffer.from(svg))
    .resize(size, size, { fit: "contain", background: transparent })
    .png({ compressionLevel: 9 })
    .toFile(dest);
}

async function main() {
  const master = appIconSvg(1024);
  const round = appIconRoundSvg(1024);

  fs.mkdirSync(out("assets/icons"), { recursive: true });
  await png(master, out("assets/icons/icon.png"), 1024);
  await png(master, out("assets/icons/icon-512.png"), 512);
  

  // Windows: .ico multi-resolução (electron-builder exige >= 256 px)
  const icoBuffers = [];
  for (const size of [16, 24, 32, 48, 64, 128, 256]) {
    icoBuffers.push(
      await sharp(Buffer.from(master))
        .resize(size, size, { fit: "contain", background: transparent })
        .png()
        .toBuffer(),
    );
  }
  fs.writeFileSync(out("assets/icons/icon.ico"), await pngToIco(icoBuffers));

  // Web / PWA
  const faviconBuffers = [];
  for (const size of [16, 32, 48]) {
    faviconBuffers.push(
      await sharp(Buffer.from(master)).resize(size, size).png().toBuffer(),
    );
  }
  fs.writeFileSync(out("client/public/favicon.ico"), await pngToIco(faviconBuffers));
  await png(master, out("client/public/icon-192.png"), 192);
  await png(master, out("client/public/icon-512.png"), 512);
  await png(master, out("client/public/icons/icon-192.png"), 192);
  await png(master, out("client/public/icons/icon-512.png"), 512);
  await png(master, out("client/public/icons/maskable-512.png"), 512);

  // Android
  const legacy = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
  const adaptive = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };
  for (const [bucket, size] of Object.entries(legacy)) {
    const dir = out(`android/app/src/main/res/mipmap-${bucket}`);
    await png(master, path.join(dir, "ic_launcher.png"), size);
    await png(round, path.join(dir, "ic_launcher_round.png"), size);
  }
  for (const [bucket, size] of Object.entries(adaptive)) {
    const dir = out(`android/app/src/main/res/mipmap-${bucket}`);
    await png(adaptiveForegroundSvg(), path.join(dir, "ic_launcher_foreground.png"), size);
  }
  fs.writeFileSync(
    out("android/app/src/main/res/values/ic_launcher_background.xml"),
    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${BLUE_SOLID}</color>\n</resources>\n`,
  );

  fs.mkdirSync(out("build"), { recursive: true });
  await png(master, out("build/icon-preview-512.png"), 512);
  await png(round, out("build/icon-preview-round.png"), 512);
  await png(adaptiveForegroundSvg(), out("build/icon-preview-foreground.png"), 432);

  const files = [
    "assets/icons/icon.png",
    "assets/icons/icon.ico",
    "client/public/favicon.ico",
    "client/public/icon-512.png",
    "android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png",
    "android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png",
    "android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png",
  ];
  for (const f of files) {
    const fp = out(f);
    const kb = Math.round(fs.statSync(fp).size / 1024);
    if (f.endsWith(".png")) {
      const meta = await sharp(fp).metadata();
      console.log(f + ": " + meta.width + "x" + meta.height + " " + kb + " KB");
    } else {
      console.log(f + ": " + kb + " KB");
    }
  }
  console.log("ícones gerados");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
