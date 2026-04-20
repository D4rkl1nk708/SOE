const fs = require('fs');
const content = fs.readFileSync('electron/tec-content.js', 'utf8');
const preloadBody = `const { ipcRenderer, webFrame } = require("electron");

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
console.log('Preload built.');
