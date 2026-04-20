"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electron", {
  ipcRenderer: {
    on: (channel, func) => {
      const validChannels = ["app-closing", "dou-new-results", "soe-tec-message"];
      if (validChannels.includes(channel)) {
        ipcRenderer.on(channel, (event, ...args) => func(...args));
      }
    },
    send: (channel, ...args) => {
      const validChannels = ["soe-tec-reply", "open-tec-browser"];
      if (validChannels.includes(channel)) {
        ipcRenderer.send(channel, ...args);
      }
    },
  },
  // Preferência de bandeja do sistema
  tray: {
    getPreference: () => ipcRenderer.invoke("get-tray-preference"),
    setPreference: (val) => ipcRenderer.invoke("set-tray-preference", val),
  },
  tec: {
    getPreloadPath: () => ipcRenderer.invoke("get-tec-preload-path")
  },
  // API do monitor DOU (chama o processo main via IPC)
  dou: {
    getConfig:  ()       => ipcRenderer.invoke("dou-get-config"),
    saveConfig: (config) => ipcRenderer.invoke("dou-save-config", config),
    checkNow:   ()       => ipcRenderer.invoke("dou-check-now"),
  },
});
