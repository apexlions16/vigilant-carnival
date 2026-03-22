"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("api", {
  // ────────────────────────────────────────────
  // Ana iletişim metodu
  // Herhangi bir IPC kanalına istek gönderir
  // Kullanım: window.api.invoke('project:create', data)
  // ────────────────────────────────────────────
  invoke: (channel, ...args) => {
    return electron.ipcRenderer.invoke(channel, ...args);
  },
  // ────────────────────────────────────────────
  // Main process'ten gelen olayları dinler
  // Kullanım: window.api.on('file-watcher:event', callback)
  // ────────────────────────────────────────────
  on: (channel, callback) => {
    const listener = (_event, ...args) => {
      callback(...args);
    };
    electron.ipcRenderer.on(channel, listener);
    return () => {
      electron.ipcRenderer.removeListener(channel, listener);
    };
  },
  // ────────────────────────────────────────────
  // Tek seferlik olay dinleme
  // Kullanım: window.api.once('package:complete', callback)
  // ────────────────────────────────────────────
  once: (channel, callback) => {
    electron.ipcRenderer.once(channel, (_event, ...args) => {
      callback(...args);
    });
  },
  // ────────────────────────────────────────────
  // Main process'e olay gönder (yanıt beklemeden)
  // Kullanım: window.api.send('file-watcher:start')
  // ────────────────────────────────────────────
  send: (channel, ...args) => {
    electron.ipcRenderer.send(channel, ...args);
  }
});
