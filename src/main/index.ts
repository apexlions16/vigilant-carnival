import { app, BrowserWindow, shell, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'

import { registerProjectHandlers } from './modules/project-module'
import { registerCharacterHandlers } from './modules/character-module'
import { registerArtistHandlers } from './modules/artist-module'
import { registerAudioHandlers } from './modules/audio-module'
import { registerTranslationHandlers } from './modules/translation-module'
import { registerAuditHandlers } from './modules/audit-module'
import { registerWatcherHandlers } from './modules/watcher-module'
import { registerHealthHandlers } from './modules/health-module'
import { registerPackageHandlers } from './modules/package-module'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    frame: true,
    titleBarStyle: 'default',
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // İstersen kapalı tut (DevTools açılırsa bazı loglar gelir)
  // if (is.dev) mainWindow.webContents.openDevTools({ mode: 'detach' })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function registerSystemHandlers(): void {
  // Varsayılan sistem oynatıcısında aç
  ipcMain.handle('system:open-path', async (_event, filePath: string) => {
    try {
      if (!filePath || typeof filePath !== 'string') {
        return { success: false, error: 'Geçersiz dosya yolu.' }
      }
      const res = await shell.openPath(filePath)
      if (res) return { success: false, error: res }
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e?.message || 'system:open-path hatası' }
    }
  })

  // Explorer/Finder içinde göster
  ipcMain.handle('system:show-in-folder', async (_event, filePath: string) => {
    try {
      if (!filePath || typeof filePath !== 'string') {
        return { success: false, error: 'Geçersiz dosya yolu.' }
      }
      shell.showItemInFolder(filePath)
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e?.message || 'system:show-in-folder hatası' }
    }
  })
}

function registerAllHandlers(): void {
  console.log("📦 IPC Handler'ları yükleniyor...")

  registerProjectHandlers()
  console.log('  ✓ Project modülü yüklendi')

  registerCharacterHandlers()
  console.log('  ✓ Character modülü yüklendi')

  registerArtistHandlers()
  console.log('  ✓ Artist modülü yüklendi')

  registerAudioHandlers()
  console.log('  ✓ Audio modülü yüklendi')

  registerTranslationHandlers()
  console.log('  ✓ Translation modülü yüklendi')

  registerAuditHandlers()
  console.log('  ✓ Audit modülü yüklendi')

  registerWatcherHandlers()
  console.log('  ✓ Watcher modülü yüklendi')

  registerHealthHandlers()
  console.log('  ✓ Health modülü yüklendi')

  registerPackageHandlers()
  console.log('  ✓ Package modülü yüklendi')

  registerSystemHandlers()
  console.log('  ✓ System modülü yüklendi (open/show)')

  console.log("✅ Tüm IPC Handler'ları yüklendi!")
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.dublab.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerAllHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  console.log('Uygulama kapatılıyor...')
  try {
    const dbMod = require('./database')
    if (dbMod.isDatabaseOpen()) dbMod.closeDatabase()
  } catch {}
})

process.on('uncaughtException', (error) => {
  console.error('Beklenmeyen hata:', error)
})

process.on('unhandledRejection', (reason) => {
  console.error('İşlenmemiş Promise reddi:', reason)
})

export { mainWindow, createWindow }