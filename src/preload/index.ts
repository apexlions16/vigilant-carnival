// ============================================================
// DubLab — Preload Script (Generic IPC Köprüsü)
// ============================================================
// Bu dosya Electron main process ile renderer process arasındaki
// güvenli iletişim köprüsüdür.
//
// BU DOSYA BİR KERE YAZILIR, BİR DAHA DEĞİŞMEZ.
// Yeni özellik eklendiğinde bu dosyaya dokunulmaz.
// Çünkü generic invoke/on yapısı her kanalı destekler.
// ============================================================

import { contextBridge, ipcRenderer } from 'electron'

// Güvenli API — renderer tarafından window.api olarak erişilir
contextBridge.exposeInMainWorld('api', {

  // ────────────────────────────────────────────
  // Ana iletişim metodu
  // Herhangi bir IPC kanalına istek gönderir
  // Kullanım: window.api.invoke('project:create', data)
  // ────────────────────────────────────────────
  invoke: (channel: string, ...args: unknown[]): Promise<unknown> => {
    return ipcRenderer.invoke(channel, ...args)
  },

  // ────────────────────────────────────────────
  // Main process'ten gelen olayları dinler
  // Kullanım: window.api.on('file-watcher:event', callback)
  // ────────────────────────────────────────────
  on: (channel: string, callback: (...args: unknown[]) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, ...args: unknown[]): void => {
      callback(...args)
    }
    ipcRenderer.on(channel, listener)

    // Cleanup fonksiyonu döndür (listener'ı kaldırmak için)
    return () => {
      ipcRenderer.removeListener(channel, listener)
    }
  },

  // ────────────────────────────────────────────
  // Tek seferlik olay dinleme
  // Kullanım: window.api.once('package:complete', callback)
  // ────────────────────────────────────────────
  once: (channel: string, callback: (...args: unknown[]) => void): void => {
    ipcRenderer.once(channel, (_event, ...args) => {
      callback(...args)
    })
  },

  // ────────────────────────────────────────────
  // Main process'e olay gönder (yanıt beklemeden)
  // Kullanım: window.api.send('file-watcher:start')
  // ────────────────────────────────────────────
  send: (channel: string, ...args: unknown[]): void => {
    ipcRenderer.send(channel, ...args)
  },
})

// ────────────────────────────────────────────
// TypeScript tip tanımı (renderer tarafı için)
// Bu tipi src/types/index.ts'e EKLEME.
// Bu dosyanın kendi içinde kalır.
// Renderer tarafında ayrı bir .d.ts dosyasında tanımlanır.
// ────────────────────────────────────────────

export interface ElectronAPI {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
  on: (channel: string, callback: (...args: unknown[]) => void) => () => void
  once: (channel: string, callback: (...args: unknown[]) => void) => void
  send: (channel: string, ...args: unknown[]) => void
}