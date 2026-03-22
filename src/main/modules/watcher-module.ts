import { ipcMain, BrowserWindow } from 'electron'
import * as chokidar from 'chokidar'
import * as fs from 'fs'
import * as path from 'path'
import * as db from '../database'

const AUDIO_EXTENSIONS = ['.wav', '.mp3', '.ogg', '.flac']
const CATEGORIES = ['Originals', 'Recording', 'Mixed'] as const
const DEBOUNCE_MS = 500
const MOVE_DETECTION_WINDOW_MS = 1000

type Category = typeof CATEGORIES[number]
type CatLower = 'originals' | 'recording' | 'mixed'

let watcher: chokidar.FSWatcher | null = null
let isWatching = false
let currentProjectId: string | null = null
let currentProjectPath: string | null = null

interface PendingDelete {
  filePath: string
  fileName: string
  category: Category
  characterName: string
  timestamp: number
  timeoutId: NodeJS.Timeout
}
const pendingDeletes: Map<string, PendingDelete> = new Map()
const debounceTimers: Map<string, NodeJS.Timeout> = new Map()
const ignoredPaths: Set<string> = new Set()

function isAudioFile(fileName: string): boolean {
  const ext = path.extname(fileName).toLowerCase()
  return AUDIO_EXTENSIONS.includes(ext)
}

function parsePath(filePath: string): { category: Category; characterName: string; fileName: string } | null {
  if (!currentProjectPath) return null
  const relative = path.relative(currentProjectPath, filePath)
  const parts = relative.split(path.sep)
  if (parts.length < 3) return null

  const category = parts[0] as Category
  if (!CATEGORIES.includes(category)) return null

  const characterName = parts[1]
  const fileName = parts.slice(2).join(path.sep)
  if (!isAudioFile(fileName)) return null

  return { category, characterName, fileName }
}

function sendToRenderer(channel: string, data: any): void {
  const windows = BrowserWindow.getAllWindows()
  for (const win of windows) {
    if (!win.isDestroyed()) win.webContents.send(channel, data)
  }
}

function debounced(key: string, fn: () => void): void {
  const existing = debounceTimers.get(key)
  if (existing) clearTimeout(existing)
  const timer = setTimeout(() => {
    debounceTimers.delete(key)
    fn()
  }, DEBOUNCE_MS)
  debounceTimers.set(key, timer)
}

export function ignorePathChange(filePath: string): void {
  ignoredPaths.add(filePath)
  setTimeout(() => ignoredPaths.delete(filePath), 3000)
}
function isIgnored(filePath: string): boolean {
  return ignoredPaths.has(filePath)
}

function toLowerCategory(category: Category): CatLower {
  if (category === 'Originals') return 'originals'
  if (category === 'Recording') return 'recording'
  return 'mixed'
}

function fieldForCategoryLower(category: CatLower): 'original_path' | 'recording_path' | 'mixed_path' {
  if (category === 'originals') return 'original_path'
  if (category === 'recording') return 'recording_path'
  return 'mixed_path'
}

function sanitize(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .trim()
}

function handleFileAdded(filePath: string): void {
  if (isIgnored(filePath)) return
  const parsed = parsePath(filePath)
  if (!parsed || !currentProjectId) return

  const { category, characterName, fileName } = parsed

  debounced(`add:${filePath}`, () => {
    // Move detection: pending delete var mı?
    const pendingKey = `${category}:${fileName}` // kategori+isim ile daha güvenli
    const pending = pendingDeletes.get(pendingKey)

    if (pending && Date.now() - pending.timestamp < MOVE_DETECTION_WINDOW_MS) {
      clearTimeout(pending.timeoutId)
      pendingDeletes.delete(pendingKey)

      handleFileMove(
        pending.category,
        pending.characterName,
        category,
        characterName,
        fileName,
        filePath
      )
      return
    }

    // Normal add (DB'ye otomatik ekleme)
    const char = db.getCharacterByName(currentProjectId!, characterName)

    sendToRenderer('file-watcher:event', {
      type: 'added',
      category: toLowerCategory(category),
      character_name: characterName,
      file_name: fileName,
      file_path: filePath,
      message: char
        ? `Yeni dosya algılandı: ${fileName} → ${characterName} (${category})`
        : `Yeni dosya algılandı: ${fileName} → Bilinmeyen karakter "${characterName}"`,
      needs_confirmation: false,
      character_exists: !!char,
    })

    if (char) {
      const existing = db.getAudioFileByFileName(currentProjectId!, fileName)
      const field = fieldForCategoryLower(toLowerCategory(category))

      if (existing) {
        db.updateAudioFile(existing.id, { [field]: filePath })
      } else {
        const payload: any = { character_id: char.id, file_name: fileName }
        payload[field] = filePath
        db.createAudioFile(currentProjectId!, payload)
      }

      db.createAuditLog(currentProjectId!, {
        action_type: 'create',
        entity_type: 'audio_file',
        entity_id: char.id,
        description: `[Watcher] Yeni dosya: ${fileName} → ${characterName} (${category})`,
        new_value: { file_name: fileName, category, character_name: characterName },
      })
    }
  })
}

function handleFileDeleted(filePath: string): void {
  if (isIgnored(filePath)) return
  const parsed = parsePath(filePath)
  if (!parsed || !currentProjectId) return

  const { category, characterName, fileName } = parsed

  // Move olabilir diye beklet
  const pendingKey = `${category}:${fileName}`
  const timeoutId = setTimeout(() => {
    pendingDeletes.delete(pendingKey)
    handleRealDelete(category, characterName, fileName, filePath)
  }, MOVE_DETECTION_WINDOW_MS)

  pendingDeletes.set(pendingKey, {
    filePath,
    fileName,
    category,
    characterName,
    timestamp: Date.now(),
    timeoutId,
  })
}

function handleRealDelete(category: Category, characterName: string, fileName: string, filePath: string): void {
  sendToRenderer('file-watcher:event', {
    type: 'deleted',
    category: toLowerCategory(category),
    character_name: characterName,
    file_name: fileName,
    file_path: filePath,
    message: `Dosya silindi: ${fileName} (${characterName}/${category})`,
    needs_confirmation: true,
  })
}

function handleFileMove(
  fromCategory: Category,
  fromCharacter: string,
  toCategory: Category,
  toCharacter: string,
  fileName: string,
  newFilePath: string
): void {
  if (!currentProjectId) return

  const existing = db.getAudioFileByFileName(currentProjectId, fileName)
  const fromChar = db.getCharacterByName(currentProjectId, fromCharacter)
  const toChar = db.getCharacterByName(currentProjectId, toCharacter)

  let translationInfo = null
  if (existing) {
    translationInfo = {
      original_text: existing.original_text,
      translated_text: existing.translated_text,
      has_recording: !!existing.recording_path,
      has_mixed: !!existing.mixed_path,
    }
  }

  sendToRenderer('file-watcher:event', {
    type: 'moved',
    category: toLowerCategory(toCategory),         // destination category
    from_category: toLowerCategory(fromCategory),  // source category
    from_character: fromCharacter,
    to_character: toCharacter,
    file_name: fileName,
    file_path: newFilePath,
    from_character_exists: !!fromChar,
    to_character_exists: !!toChar,
    existing_record: !!existing,
    translation_info: translationInfo,
    message: `Dosya taşındı: ${fileName} (${fromCharacter} → ${toCharacter}) [${fromCategory} → ${toCategory}]`,
    needs_confirmation: true,
  })
}

function applyFileMove(data: {
  file_name: string
  from_character: string
  to_character: string
  category: CatLower              // destination category
  from_category: CatLower         // source category
  move_all: boolean
  new_file_path: string
}): { success: boolean; error?: string } {
  if (!currentProjectId || !currentProjectPath) return { success: false, error: 'Proje açık değil.' }

  try {
    const existing = db.getAudioFileByFileName(currentProjectId, data.file_name)
    if (!existing) return { success: false, error: 'DB kaydı bulunamadı.' }

    const toChar = db.getCharacterByName(currentProjectId, data.to_character)
    if (!toChar) return { success: false, error: `"${data.to_character}" karakteri bulunamadı.` }

    const oldValue = { ...existing }

    const destField = fieldForCategoryLower(data.category)

    // record'u hedef karaktere taşı (tek modelimiz var)
    db.moveAudioFileToCharacter(existing.id, toChar.id)

    // taşıma yapılan kategorinin path'ini güncelle
    db.updateAudioFile(existing.id, { [destField]: data.new_file_path })

    if (data.move_all) {
      // diğer fiziksel dosyaları da taşı (varsa)
      const fromSan = sanitize(data.from_character)
      const toSan = sanitize(data.to_character)

      // Originals
      if (existing.original_path && fs.existsSync(existing.original_path)) {
        const newPath = existing.original_path.replace(
          path.join('Originals', fromSan),
          path.join('Originals', toSan)
        )
        const dir = path.dirname(newPath)
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
        if (existing.original_path !== newPath) {
          ignorePathChange(existing.original_path)
          ignorePathChange(newPath)
          try { fs.renameSync(existing.original_path, newPath) } catch {}
          db.updateAudioFile(existing.id, { original_path: newPath })
        }
      }

      // Recording
      if (existing.recording_path && fs.existsSync(existing.recording_path)) {
        const newPath = existing.recording_path.replace(
          path.join('Recording', fromSan),
          path.join('Recording', toSan)
        )
        const dir = path.dirname(newPath)
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
        if (existing.recording_path !== newPath) {
          ignorePathChange(existing.recording_path)
          ignorePathChange(newPath)
          try { fs.renameSync(existing.recording_path, newPath) } catch {}
          db.updateAudioFile(existing.id, { recording_path: newPath })
        }
      }

      // Mixed
      if (existing.mixed_path && fs.existsSync(existing.mixed_path)) {
        const newPath = existing.mixed_path.replace(
          path.join('Mixed', fromSan),
          path.join('Mixed', toSan)
        )
        const dir = path.dirname(newPath)
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
        if (existing.mixed_path !== newPath) {
          ignorePathChange(existing.mixed_path)
          ignorePathChange(newPath)
          try { fs.renameSync(existing.mixed_path, newPath) } catch {}
          db.updateAudioFile(existing.id, { mixed_path: newPath })
        }
      }
    }

    db.createAuditLog(currentProjectId, {
      action_type: 'move',
      entity_type: 'audio_file',
      entity_id: existing.id,
      description: `[Watcher] Move: ${data.file_name} (${data.from_character} → ${data.to_character}) [${data.from_category}→${data.category}]${data.move_all ? ' (all)' : ''}`,
      old_value: oldValue,
      new_value: { to_character: data.to_character, move_all: data.move_all, category: data.category },
    })

    return { success: true }
  } catch (e: any) {
    return { success: false, error: e?.message || 'Move error' }
  }
}

function applyFileDelete(data: {
  file_name: string
  character_name: string
  category: CatLower
  action: 'delete_record' | 'mark_missing'
}): { success: boolean; error?: string } {
  if (!currentProjectId) return { success: false, error: 'Proje açık değil.' }

  try {
    const existing = db.getAudioFileByFileName(currentProjectId, data.file_name)
    if (!existing) return { success: false, error: 'DB kaydı bulunamadı.' }

    const field = fieldForCategoryLower(data.category)

    // Güvenli davranış:
    // - originals silindiyse: delete_record = kaydı sil
    // - recording/mixed silindiyse: delete_record = sadece o path’i temizle (veriyi komple silmek tehlikeli)
    if (data.action === 'delete_record' && data.category === 'originals') {
      db.createAuditLog(currentProjectId, {
        action_type: 'delete',
        entity_type: 'audio_file',
        entity_id: existing.id,
        description: `[Watcher] Kayıt silindi (original silindi): ${data.file_name}`,
        old_value: existing,
      })
      db.deleteAudioFile(existing.id)
      return { success: true }
    }

    // mark_missing veya recording/mixed delete_record → sadece path temizle
    const oldValue = { [field]: (existing as any)[field] }
    db.updateAudioFile(existing.id, { [field]: null })

    db.createAuditLog(currentProjectId, {
      action_type: 'update',
      entity_type: 'audio_file',
      entity_id: existing.id,
      description: `[Watcher] Path temizlendi: ${data.file_name} (${data.category})`,
      old_value: oldValue,
      new_value: { [field]: null },
    })

    return { success: true }
  } catch (e: any) {
    return { success: false, error: e?.message || 'Delete error' }
  }
}

function applyFileRename(data: {
  old_name: string
  new_name: string
  character_name: string
}): { success: boolean; error?: string } {
  if (!currentProjectId) return { success: false, error: 'Proje açık değil.' }

  try {
    const existing = db.getAudioFileByFileName(currentProjectId, data.old_name)
    if (!existing) return { success: false, error: 'DB kaydı bulunamadı.' }

    const oldValue = { file_name: existing.file_name }

    db.updateAudioFile(existing.id, { file_name: data.new_name })

    // Path string update (fiziksel rename yok)
    const upd: any = {}
    if (existing.original_path) upd.original_path = existing.original_path.replace(data.old_name, data.new_name)
    if (existing.recording_path) upd.recording_path = existing.recording_path.replace(data.old_name, data.new_name)
    if (existing.mixed_path) upd.mixed_path = existing.mixed_path.replace(data.old_name, data.new_name)
    if (Object.keys(upd).length > 0) db.updateAudioFile(existing.id, upd)

    db.createAuditLog(currentProjectId, {
      action_type: 'rename',
      entity_type: 'audio_file',
      entity_id: existing.id,
      description: `[Watcher] Rename (DB): "${data.old_name}" → "${data.new_name}"`,
      old_value: oldValue,
      new_value: { file_name: data.new_name },
    })

    return { success: true }
  } catch (e: any) {
    return { success: false, error: e?.message || 'Rename error' }
  }
}

function startWatcher(projectId: string, projectPath: string): { success: boolean; error?: string } {
  if (isWatching) stopWatcher()

  try {
    currentProjectId = projectId
    currentProjectPath = projectPath

    const watchPaths = CATEGORIES.map(cat => path.join(projectPath, cat)).filter(p => fs.existsSync(p))
    if (watchPaths.length === 0) return { success: false, error: 'İzlenecek klasör bulunamadı.' }

    watcher = chokidar.watch(watchPaths, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
      depth: 2,
      ignored: [
        /(^|[\/\\])\../,
        /\.db$/,
        /\.json$/,
        /Thumbs\.db$/,
        /\.DS_Store$/,
      ],
    })

    watcher.on('add', (p: string) => handleFileAdded(p))
    watcher.on('unlink', (p: string) => handleFileDeleted(p))
    watcher.on('error', (err: Error) => {
      console.error('[Watcher] Hata:', err)
      sendToRenderer('file-watcher:error', { message: `Dosya izleme hatası: ${err.message}` })
    })

    isWatching = true
    sendToRenderer('file-watcher:status', { active: true })
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e?.message || 'Watcher start error' }
  }
}

function stopWatcher(): { success: boolean; error?: string } {
  try {
    if (watcher) {
      watcher.close()
      watcher = null
    }

    isWatching = false
    currentProjectId = null
    currentProjectPath = null

    for (const p of pendingDeletes.values()) clearTimeout(p.timeoutId)
    pendingDeletes.clear()

    for (const t of debounceTimers.values()) clearTimeout(t)
    debounceTimers.clear()

    ignoredPaths.clear()

    sendToRenderer('file-watcher:status', { active: false })
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e?.message || 'Watcher stop error' }
  }
}

export function registerWatcherHandlers(): void {
  ipcMain.handle('file-watcher:start', async (_event, data: { project_id: string; project_path: string }) => {
    return startWatcher(data.project_id, data.project_path)
  })

  ipcMain.handle('file-watcher:stop', async () => stopWatcher())

  ipcMain.handle('file-watcher:status', async () => ({ active: isWatching }))

  ipcMain.handle('file-watcher:confirm-move', async (_event, data: {
    file_name: string
    from_character: string
    to_character: string
    category: CatLower
    from_category: CatLower
    move_all: boolean
    new_file_path: string
  }) => {
    return applyFileMove(data)
  })

  ipcMain.handle('file-watcher:confirm-delete', async (_event, data: {
    file_name: string
    character_name: string
    category: CatLower
    action: 'delete_record' | 'mark_missing'
  }) => {
    return applyFileDelete(data)
  })

  ipcMain.handle('file-watcher:confirm-rename', async (_event, data: {
    old_name: string
    new_name: string
    character_name: string
  }) => {
    return applyFileRename(data)
  })

  ipcMain.handle('file-watcher:ignore-path', async (_event, filePath: string) => {
    ignorePathChange(filePath)
    return { success: true }
  })
}