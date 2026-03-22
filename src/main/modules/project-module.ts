// ============================================================
// DubLab — Proje Modülü
// ============================================================
// Bu modül proje oluşturma, açma, güncelleme, silme
// ve klasör yapısı yönetimini içerir.
//
// Bağımlılıklar: database.ts (sadece import, değiştirmez)
// Başka modüllere bağımlılığı YOKTUR.
//
// Kullanım: registerProjectHandlers() çağrılır, tüm
// IPC handler'ları otomatik aktif olur.
// ============================================================

import { ipcMain, dialog, BrowserWindow } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import * as db from '../database'

// ────────────────────────────────────────────
// YARDIMCI FONKSİYONLAR
// ────────────────────────────────────────────

/**
 * Proje klasör yapısını oluşturur
 * ProjectPath/
 * ├── Originals/
 * ├── Recording/
 * ├── Mixed/
 * └── project.db
 */
function createProjectFolders(projectPath: string): void {
  const folders = ['Originals', 'Recording', 'Mixed']

  // Ana proje klasörü
  if (!fs.existsSync(projectPath)) {
    fs.mkdirSync(projectPath, { recursive: true })
  }

  // Alt klasörler
  for (const folder of folders) {
    const folderPath = path.join(projectPath, folder)
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true })
    }
  }
}

/**
 * project.json meta dosyasını oluşturur/günceller
 */
function writeProjectMeta(projectPath: string, data: {
  name: string
  game_title: string
  source_language: string
  target_language: string
}): void {
  const metaPath = path.join(projectPath, 'project.json')
  const meta = {
    version: '1.0.0',
    name: data.name,
    game_title: data.game_title,
    source_language: data.source_language,
    target_language: data.target_language,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8')
}

/**
 * project.json dosyasını okur
 */
function readProjectMeta(projectPath: string): any | null {
  const metaPath = path.join(projectPath, 'project.json')
  if (!fs.existsSync(metaPath)) return null
  try {
    const content = fs.readFileSync(metaPath, 'utf-8')
    return JSON.parse(content)
  } catch {
    return null
  }
}

/**
 * Proje klasörünün geçerli olup olmadığını kontrol eder
 */
function isValidProjectFolder(projectPath: string): { valid: boolean; error?: string } {
  if (!fs.existsSync(projectPath)) {
    return { valid: false, error: 'Klasör bulunamadı.' }
  }

  const dbPath = path.join(projectPath, 'project.db')
  if (!fs.existsSync(dbPath)) {
    return { valid: false, error: 'project.db dosyası bulunamadı. Bu geçerli bir DubLab projesi değil.' }
  }

  const requiredFolders = ['Originals', 'Recording', 'Mixed']
  for (const folder of requiredFolders) {
    if (!fs.existsSync(path.join(projectPath, folder))) {
      return { valid: false, error: `${folder} klasörü bulunamadı.` }
    }
  }

  return { valid: true }
}

/**
 * Son açılan projeleri localStorage benzeri bir yapıda tutar
 * (basit JSON dosyası)
 */
function getRecentProjectsPath(): string {
  const { app } = require('electron')
  return path.join(app.getPath('userData'), 'recent-projects.json')
}

function loadRecentProjects(): Array<{
  path: string
  name: string
  game_title: string
  last_opened: string
}> {
  const filePath = getRecentProjectsPath()
  if (!fs.existsSync(filePath)) return []
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    return JSON.parse(content)
  } catch {
    return []
  }
}

function saveRecentProject(projectPath: string, name: string, gameTitle: string): void {
  const recents = loadRecentProjects()

  // Zaten varsa güncelle
  const existingIndex = recents.findIndex(r => r.path === projectPath)
  if (existingIndex !== -1) {
    recents.splice(existingIndex, 1)
  }

  // Başa ekle
  recents.unshift({
    path: projectPath,
    name: name,
    game_title: gameTitle,
    last_opened: new Date().toISOString(),
  })

  // Maksimum 10 tane tut
  const trimmed = recents.slice(0, 10)

  const filePath = getRecentProjectsPath()
  fs.writeFileSync(filePath, JSON.stringify(trimmed, null, 2), 'utf-8')
}

// ────────────────────────────────────────────
// IPC HANDLER'LARI
// ────────────────────────────────────────────

export function registerProjectHandlers(): void {

  // ══════════════════════════════════════════
  // PROJE OLUŞTURMA
  // ══════════════════════════════════════════
  ipcMain.handle('project:create', async (_event, data: {
    name: string
    game_title: string
    source_language: string
    target_language: string
    project_path: string
  }) => {
    try {
      // 1. Proje klasör yolunu oluştur
      const projectPath = path.join(data.project_path, data.name)

      // 2. Klasör zaten var mı kontrol et
      if (fs.existsSync(projectPath)) {
        return {
          success: false,
          error: `"${data.name}" adında bir klasör zaten mevcut: ${projectPath}`
        }
      }

      // 3. Klasör yapısını oluştur
      createProjectFolders(projectPath)

      // 4. project.json meta dosyasını yaz
      writeProjectMeta(projectPath, data)

      // 5. Veritabanını aç/oluştur
      const dbPath = path.join(projectPath, 'project.db')
      db.openDatabase(dbPath)

      // 6. Proje kaydını DB'ye ekle
      const project = db.createProject({
        name: data.name,
        game_title: data.game_title,
        source_language: data.source_language,
        target_language: data.target_language,
        project_path: projectPath,
      })

      // 7. Son açılanlar listesine ekle
      saveRecentProject(projectPath, data.name, data.game_title)

      return {
        success: true,
        project: project,
        project_path: projectPath,
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Proje oluşturulurken hata oluştu.',
      }
    }
  })

  // ══════════════════════════════════════════
  // PROJE AÇMA (Mevcut projeyi yükleme)
  // ══════════════════════════════════════════
  ipcMain.handle('project:open', async (_event, projectPath: string) => {
    try {
      // 1. Geçerli proje klasörü mü?
      const validation = isValidProjectFolder(projectPath)
      if (!validation.valid) {
        return { success: false, error: validation.error }
      }

      // 2. Veritabanını aç
      const dbPath = path.join(projectPath, 'project.db')
      db.openDatabase(dbPath)

      // 3. Proje bilgilerini oku
      const project = db.getFirstProject()
      if (!project) {
        return { success: false, error: 'Veritabanında proje kaydı bulunamadı.' }
      }

      // 4. Proje yolunu güncelle (taşınmış olabilir)
      if (project.project_path !== projectPath) {
        db.updateProject(project.id, { project_path: projectPath } as any)
      }

      // 5. Son açılanlar listesine ekle
      saveRecentProject(projectPath, project.name, project.game_title)

      // 6. İlerleme bilgisini al
      const progress = db.getProjectProgress(project.id)

      return {
        success: true,
        project: { ...project, project_path: projectPath },
        progress: progress,
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Proje açılırken hata oluştu.',
      }
    }
  })

  // ══════════════════════════════════════════
  // PROJE KAPAMA
  // ══════════════════════════════════════════
  ipcMain.handle('project:close', async () => {
    try {
      db.closeDatabase()
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // ══════════════════════════════════════════
  // PROJE GÜNCELLEME
  // ══════════════════════════════════════════
  ipcMain.handle('project:update', async (_event, data: {
    id: string
    updates: Record<string, any>
  }) => {
    try {
      const project = db.updateProject(data.id, data.updates)
      return { success: true, project }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // ══════════════════════════════════════════
  // PROJE SİLME
  // ══════════════════════════════════════════
  ipcMain.handle('project:delete', async (_event, data: {
    id: string
    delete_files: boolean
    project_path: string
  }) => {
    try {
      // DB'den sil
      db.deleteProject(data.id)
      db.closeDatabase()

      // Dosyaları da sil (kullanıcı isterse)
      if (data.delete_files && fs.existsSync(data.project_path)) {
        fs.rmSync(data.project_path, { recursive: true, force: true })
      }

      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // ══════════════════════════════════════════
  // SON AÇILAN PROJELER
  // ══════════════════════════════════════════
  ipcMain.handle('project:list-recent', async () => {
    try {
      const recents = loadRecentProjects()

      // Hala var olan projeleri filtrele
      const valid = recents.filter(r => {
        return fs.existsSync(r.path) && fs.existsSync(path.join(r.path, 'project.db'))
      })

      return { success: true, projects: valid }
    } catch (error: any) {
      return { success: false, error: error.message, projects: [] }
    }
  })

  // ══════════════════════════════════════════
  // PROJE İLERLEME BİLGİSİ
  // ══════════════════════════════════════════
  ipcMain.handle('project:get-progress', async (_event, projectId: string) => {
    try {
      const progress = db.getProjectProgress(projectId)
      return { success: true, progress }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // ══════════════════════════════════════════
  // PROJE İSTATİSTİKLERİ
  // ══════════════════════════════════════════
  ipcMain.handle('project:get-stats', async (_event, projectId: string) => {
    try {
      const stats = db.getDatabaseStats(projectId)
      const progress = db.getProjectProgress(projectId)
      const unassigned = db.getUnassignedCharacters(projectId)
      const untranslated = db.getUntranslatedCount(projectId)
      const unrecorded = db.getUnrecordedCount(projectId)

      return {
        success: true,
        stats,
        progress,
        warnings: {
          unassigned_characters: unassigned.length,
          untranslated_lines: untranslated,
          unrecorded_lines: unrecorded,
        }
      }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // ══════════════════════════════════════════
  // KLASÖR SEÇİCİ DIALOG
  // ══════════════════════════════════════════
  ipcMain.handle('dialog:select-folder', async (_event, options?: {
    title?: string
    default_path?: string
  }) => {
    try {
      const mainWindow = BrowserWindow.getFocusedWindow()
      if (!mainWindow) return { success: false, error: 'Pencere bulunamadı.' }

      const result = await dialog.showOpenDialog(mainWindow, {
        title: options?.title || 'Klasör Seç',
        defaultPath: options?.default_path,
        properties: ['openDirectory', 'createDirectory'],
      })

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, canceled: true }
      }

      return { success: true, path: result.filePaths[0] }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // ══════════════════════════════════════════
  // DOSYA SEÇİCİ DIALOG
  // ══════════════════════════════════════════
  ipcMain.handle('dialog:select-files', async (_event, options?: {
    title?: string
    filters?: Array<{ name: string; extensions: string[] }>
    multi?: boolean
  }) => {
    try {
      const mainWindow = BrowserWindow.getFocusedWindow()
      if (!mainWindow) return { success: false, error: 'Pencere bulunamadı.' }

      const properties: any[] = ['openFile']
      if (options?.multi !== false) properties.push('multiSelections')

      const result = await dialog.showOpenDialog(mainWindow, {
        title: options?.title || 'Dosya Seç',
        filters: options?.filters || [
          { name: 'Ses Dosyaları', extensions: ['wav', 'mp3', 'ogg', 'flac'] },
          { name: 'Tüm Dosyalar', extensions: ['*'] },
        ],
        properties,
      })

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, canceled: true }
      }

      return { success: true, paths: result.filePaths }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // ══════════════════════════════════════════
  // DOSYA KAYDET DIALOG
  // ══════════════════════════════════════════
  ipcMain.handle('dialog:save-file', async (_event, options?: {
    title?: string
    default_name?: string
    filters?: Array<{ name: string; extensions: string[] }>
  }) => {
    try {
      const mainWindow = BrowserWindow.getFocusedWindow()
      if (!mainWindow) return { success: false, error: 'Pencere bulunamadı.' }

      const result = await dialog.showSaveDialog(mainWindow, {
        title: options?.title || 'Dosya Kaydet',
        defaultPath: options?.default_name,
        filters: options?.filters || [
          { name: 'Tüm Dosyalar', extensions: ['*'] },
        ],
      })

      if (result.canceled || !result.filePath) {
        return { success: false, canceled: true }
      }

      return { success: true, path: result.filePath }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })
}