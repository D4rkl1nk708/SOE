const fs = require('fs');
const content = fs.readFileSync('electron/tec-content.js', 'utf8');
const preloadBody = `const { ipcRenderer, webFrame } = require("electron");

const contentJs = \`${content.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`;

try {
  webFrame.executeJavaScript(contentJs).catch(err => console.error("WebFrame JS execution error:", err));
} catch (e) {
  console.error("Failed to inject tec-content.js", e);
}

// Relay from content.js (window) -> React host
window.addEventListener("message", (e) => {
  if (e.data && e.data._soe_internal) {
    if (e.data.type && !e.data.type.endsWith('_RESPONSE')) {
      ipcRenderer.sendToHost("soe-tec-message", e.data);
    }
  }
});

// Relay from React host -> content.js (window)
ipcRenderer.on("soe-tec-reply", (_, { type, messageId, response, error }) => {
  window.postMessage({
    type: type + "_RESPONSE",
    messageId,
    response,
    error,
    _soe_internal: true
  }, "*");
});
`;

fs.writeFileSync('electron/tec-preload.cjs', preloadBody);
console.log('Preload built.');
