const { app, BrowserWindow, shell, ipcMain, Tray, Menu, Notification, nativeImage, session } = require("electron");

// Fix: Disable setuid sandbox (requires root SUID bit which may not be set on all Linux systems)
// This flag must be set before app is ready
app.commandLine.appendSwitch("disable-setuid-sandbox");
app.commandLine.appendSwitch("no-sandbox");

const path = require("path");
const { fork } = require("child_process");

const DEFAULT_PORT = 3000;
let apiProcess = null;
let mainWindow = null;
let tray = null;
let minimizeToTray = false;

// ── Single Instance Lock ──────────────────────────────────────────────────────
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", (event, commandLine, workingDirectory) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    } else {
      // Se o app está rodando mas não tem janela, criamos uma nova
      createWindow("http://localhost:" + DEFAULT_PORT);
    }
  });

  // Somente inicializamos o app se tivermos o lock
  initApp();
}

function initApp() {
  const fs = require("fs");

  ipcMain.handle("get-tray-preference", () => minimizeToTray);
  ipcMain.handle("set-tray-preference", (_, value) => {
    minimizeToTray = Boolean(value);
    updateTrayMenu();
  });

  function updateTrayMenu(port) {
    if (!tray) return;
    const menu = Menu.buildFromTemplate([
      { label: "SOE - Sistema de Organizacao de Estudos", enabled: false },
      { type: "separator" },
      { label: "Abrir SOE", click: () => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.show(); mainWindow.focus();
          } else {
            createWindow("http://localhost:" + (port || DEFAULT_PORT));
          }
        }
      },
      { type: "separator" },
      { label: minimizeToTray ? "✓ Minimizar para bandeja" : "  Minimizar para bandeja", click: () => {
          minimizeToTray = true; updateTrayMenu(port);
        }
      },
      { label: !minimizeToTray ? "✓ Fechar ao clicar X" : "  Fechar ao clicar X", click: () => {
          minimizeToTray = false; updateTrayMenu(port);
        }
      },
      { type: "separator" },
      { label: "Sair", click: () => { app.isQuiting = true; app.quit(); } },
    ]);
    tray.setContextMenu(menu);
  }

  function createWindow(url) {
    mainWindow = new BrowserWindow({
      width: 1400,
      height: 900,
      minWidth: 1000,
      minHeight: 700,
      webPreferences: {
        contextIsolation: true,
        preload: path.join(__dirname, "preload.cjs"),
        webviewTag: true,
      },
    });

    mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
      shell.openExternal(target);
      return { action: "deny" };
    });

    mainWindow.on("closed", () => { mainWindow = null; });
    mainWindow.loadURL(url);
  }

  function createTray(port) {
    tray = new Tray(nativeImage.createEmpty());
    tray.setToolTip("SOE - Sistema de Organizacao de Estudos");
    updateTrayMenu(port);

    tray.on("double-click", () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show(); mainWindow.focus();
      } else {
        createWindow("http://localhost:" + (port || DEFAULT_PORT));
      }
    });
  }

  // ── Navegador TEC Interno ──────────────────────────────────────────────────────
  global.SOE_PUSH_TOKEN = null;
  let tecWindow = null;
  let webRequestHooked = false;

  ipcMain.on("open-tec-browser", (event, token) => {
    if (token) global.SOE_PUSH_TOKEN = token;
    
    if (!webRequestHooked) {
      webRequestHooked = true;
      session.defaultSession.webRequest.onBeforeSendHeaders(
        { urls: ["http://localhost:*/*"] },
        (details, callback) => {
          if (global.SOE_PUSH_TOKEN) {
            details.requestHeaders['X-SOE-Token'] = global.SOE_PUSH_TOKEN;
          }
          callback({ requestHeaders: details.requestHeaders });
        }
      );
    }

    if (tecWindow && !tecWindow.isDestroyed()) {
      tecWindow.show();
      tecWindow.focus();
      return;
    }

    const tecPreloadPath = app.isPackaged 
      ? path.join(process.resourcesPath, "app.asar.unpacked", "electron", "tec-preload.cjs")
      : path.join(__dirname, "tec-preload.cjs");

    tecWindow = new BrowserWindow({
      width: 1400,
      height: 900,
      webPreferences: {
        preload: tecPreloadPath,
        contextIsolation: false,
        nodeIntegration: true,
      },
    });
    tecWindow.setMenu(null);
    
    tecWindow.webContents.on('before-input-event', (event, input) => {
      if (input.key === "F12" && input.type === "keyDown") {
        tecWindow.webContents.toggleDevTools();
        event.preventDefault();
      }
    });
    
    tecWindow.loadURL("https://www.tecconcursos.com.br/questoes");
  });

  ipcMain.on("soe-tec-message", async (event, data) => {
    const token = global.SOE_PUSH_TOKEN || "ELECTRON_MODE";
    const soeUrl = "http://localhost:3000";
    let endpoint = "";
    if (data.type === "SOE_TEC_DATA") endpoint = "/api/tec/caderno-push";
    else if (data.type === "SOE_TEC_INCREMENT_STATS") endpoint = "/api/tec/increment";
    else if (data.type === "SOE_TEC_WRONG_QUESTION") endpoint = "/api/tec/wrong-question";
    else if (data.type === "SOE_TEC_AI_MENTOR") endpoint = "/api/tec/ai-mentor";
    else if (data.type === "SOE_GENERATE_FLASHCARD") endpoint = "/api/tec/generate-flashcard";
    else if (data.type === "SOE_TEC_CADERNOS_LIST") endpoint = "/api/tec/cadernos-list";
    else if (data.type === "SOE_TEC_BANCA_INCREMENT") endpoint = "/api/tec/banca-increment";
    else return;

    try {
      const resp = await fetch(soeUrl + endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-SOE-Token": token },
        body: JSON.stringify(data.payload),
      });
      const result = await resp.json();
      if (event.sender && !event.sender.isDestroyed()) {
        event.sender.send("soe-tec-reply", { type: data.type, messageId: data.messageId, response: { data: result } });
      }
    } catch (error) {
      if (event.sender && !event.sender.isDestroyed()) {
        event.sender.send("soe-tec-reply", { type: data.type, messageId: data.messageId, error: error.message });
      }
    }
  });

  // ── Server ────────────────────────────────────────────────────────────────────
  function resolveServerEntrypoint() {
    if (app.isPackaged) return path.join(process.resourcesPath, "app.asar.unpacked", "dist", "index.cjs");
    return path.join(__dirname, "..", "dist", "index.cjs");
  }

  function startBundledServer() {
    const serverEntrypoint = resolveServerEntrypoint();
    const dataDir = path.join(app.getPath("userData"), "data");

    return new Promise((resolve) => {
      apiProcess = fork(serverEntrypoint, {
        env: { ...process.env, NODE_ENV: "production", PORT: String(DEFAULT_PORT), DATA_DIR: dataDir },
        stdio: ["pipe", "pipe", "pipe", "ipc"],
      });

      let loaded = false;
      const finish = (port) => { if (loaded) return; loaded = true; resolve(port); };

      apiProcess.stdout && apiProcess.stdout.on("data", (chunk) => {
        const output = String(chunk);
        const match = output.match(/Server running on http:\/\/(?:localhost|0\.0\.0\.0):(\d+)\//);
        if (match) finish(Number(match[1]));
      });
      apiProcess.on("exit", () => { if (!loaded) finish(DEFAULT_PORT); });
      setTimeout(() => finish(DEFAULT_PORT), 6000);
    });
  }

  // ── App lifecycle ─────────────────────────────────────────────────────────────
  app.whenReady().then(async () => {
    if (process.env.ELECTRON_START_URL) {
      createWindow(process.env.ELECTRON_START_URL);
      createTray(DEFAULT_PORT);
      return;
    }
    const port = await startBundledServer();
    createWindow("http://localhost:" + port);
    createTray(port);
  });

  app.on("window-all-closed", () => {
    if (process.platform === "darwin") return;
    if (app.isQuiting || !minimizeToTray) {
      if (apiProcess && !apiProcess.killed) apiProcess.kill();
      app.quit();
    }
  });

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length > 0) return;
    createWindow("http://localhost:" + DEFAULT_PORT);
  });

  app.on("before-quit", () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("app-closing");
  });

  process.on("exit", () => {
    if (apiProcess && !apiProcess.killed) apiProcess.kill();
  });
}
