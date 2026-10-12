const fs = require('fs');
const path = require('path');

// Read the tec-content.js script
const content = fs.readFileSync('electron/tec-content.js', 'utf8');

// 1. Build electron/tec-preload.cjs
const preloadBody = `const { ipcRenderer, webFrame } = require("electron");

// Prevent third-party web libraries (like jQuery on TEC) from detecting CommonJS module exports
if (typeof window !== "undefined") {
  try {
    delete window.module;
    delete window.exports;
  } catch (e) {}
}

window.__SOE_ELECTRON__ = true;

// Relay from content.js (isolated window) -> React host
window.addEventListener("message", (e) => {
  if (e.data && e.data._soe_internal) {
    if (e.data.type && !e.data.type.endsWith('_RESPONSE')) {
      ipcRenderer.send("soe-tec-message", e.data);
    }
  }
});

// Relay from React host -> content.js (isolated window)
ipcRenderer.on("soe-tec-reply", (_, { type, messageId, response, error }) => {
  window.postMessage({
    type: type + "_RESPONSE",
    messageId,
    response,
    error,
    _soe_internal: true
  }, "*");
});

// ── INJECT CONTENT SCRIPT NATIVELY IN ISOLATED WORLD ──
// Isto evita falhas de CSP (Content Security Policy) da página.
${content}
`;

fs.writeFileSync('electron/tec-preload.cjs', preloadBody);
console.log('[build.cjs] electron/tec-preload.cjs gerado.');

// 2. Always copy tec-content.js to android assets (create directory if needed)
// This is tracked in git so the APK build on CI also gets the script.
const assetsDir = path.join('android', 'app', 'src', 'main', 'assets');
fs.mkdirSync(assetsDir, { recursive: true });
const targetAsset = path.join(assetsDir, 'tec-content.js');
fs.writeFileSync(targetAsset, content, 'utf8');
console.log('[build.cjs] android/app/src/main/assets/tec-content.js atualizado (' + content.length + ' bytes).');

console.log('[build.cjs] Preload built.');
