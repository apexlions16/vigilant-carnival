import { ipcMain } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import * as db from '../database'

// adm-zip (CJS uyumlu)
const AdmZip = require('adm-zip')

type PackageCreateInput = {
  project_path: string
  output_path: string
  include_originals: boolean
  include_recording: boolean
  include_mixed: boolean
}

type PackageLoadInput = {
  pack_path: string
  destination_root: string
}

type DubPackMeta = {
  version: string
  packaged_at: string
  project_name: string
  game_title: string
  original_project_path: string
  included: {
    originals: boolean
    recording: boolean
    mixed: boolean
    db: boolean
    json: boolean
  }
  checksum_sha256: string
}

function exists(p: string): boolean {
  try {
    return fs.existsSync(p)
  } catch {
    return false
  }
}

function ensureDir(p: string): void {
  if (!exists(p)) fs.mkdirSync(p, { recursive: true })
}

function readJsonSafe(p: string): any | null {
  try {
    if (!exists(p)) return null
    return JSON.parse(fs.readFileSync(p, 'utf-8'))
  } catch {
    return null
  }
}

function sha256File(filePath: string): string {
  const hash = crypto.createHash('sha256')
  const data = fs.readFileSync(filePath)
  hash.update(data)
  return hash.digest('hex')
}

function uniqueFolderPath(destinationRoot: string, folderName: string): string {
  let candidate = path.join(destinationRoot, folderName)
  if (!exists(candidate)) return candidate

  let i = 2
  while (exists(`${candidate}_${i}`)) i++
  return `${candidate}_${i}`
}

/**
 * DB açıkken paketleme yapmak için:
 * - DB’yi geçici kapatırız (WAL/SHM daha stabil olur)
 * - zip oluştururuz
 * - sonra DB’yi yeniden açarız (uygulama çalışmaya devam eder)
 */
function createDubPack(input: PackageCreateInput): { success: boolean; error?: string; meta?: DubPackMeta } {
  let wasDbOpen = false
  const projectPath = input.project_path
  const dbPath = path.join(projectPath, 'project.db')

  try {
    if (!exists(projectPath)) return { success: false, error: 'Proje klasörü bulunamadı.' }

    const jsonPath = path.join(projectPath, 'project.json')
    if (!exists(dbPath)) return { success: false, error: 'project.db bulunamadı (geçerli proje değil).' }
    if (!exists(jsonPath)) return { success: false, error: 'project.json bulunamadı (geçerli proje değil).' }

    // DB açıksa kapat (paketleme için güvenli)
    wasDbOpen = db.isDatabaseOpen()
    if (wasDbOpen) {
      try {
        db.closeDatabase()
      } catch {
        // ignore
      }
    }

    const pj = readJsonSafe(jsonPath) || {}
    const projectName = pj.name || path.basename(projectPath)
    const gameTitle = pj.game_title || ''

    const zip = new AdmZip()

    // project.json
    zip.addLocalFile(jsonPath, '')

    // DB + WAL/SHM (varsa)
    zip.addLocalFile(dbPath, '')
    const wal = `${dbPath}-wal`
    const shm = `${dbPath}-shm`
    if (exists(wal)) zip.addLocalFile(wal, '')
    if (exists(shm)) zip.addLocalFile(shm, '')

    // Seçili klasörler
    if (input.include_originals) {
      const p = path.join(projectPath, 'Originals')
      if (exists(p)) zip.addLocalFolder(p, 'Originals')
    }
    if (input.include_recording) {
      const p = path.join(projectPath, 'Recording')
      if (exists(p)) zip.addLocalFolder(p, 'Recording')
    }
    if (input.include_mixed) {
      const p = path.join(projectPath, 'Mixed')
      if (exists(p)) zip.addLocalFolder(p, 'Mixed')
    }

    const meta: DubPackMeta = {
      version: '1.0.0',
      packaged_at: new Date().toISOString(),
      project_name: projectName,
      game_title: gameTitle,
      original_project_path: projectPath,
      included: {
        originals: input.include_originals,
        recording: input.include_recording,
        mixed: input.include_mixed,
        db: true,
        json: true,
      },
      checksum_sha256: '',
    }

    // meta (checksum sonra)
    zip.addFile('dubpack.meta.json', Buffer.from(JSON.stringify(meta, null, 2), 'utf-8'))

    ensureDir(path.dirname(input.output_path))
    zip.writeZip(input.output_path)

    // checksum hesapla ve meta’yı zip içinde güncelle
    meta.checksum_sha256 = sha256File(input.output_path)
    const zip2 = new AdmZip(input.output_path)
    zip2.deleteFile('dubpack.meta.json')
    zip2.addFile('dubpack.meta.json', Buffer.from(JSON.stringify(meta, null, 2), 'utf-8'))
    zip2.writeZip(input.output_path)

    return { success: true, meta }
  } catch (e: any) {
    return { success: false, error: e?.message || 'Paketleme hatası' }
  } finally {
    // DB kapattıysak geri aç (uygulama bozulmasın)
    if (wasDbOpen) {
      try {
        db.openDatabase(dbPath)
      } catch {
        // Eğer açamazsa, sonraki IPC çağrılarında proje yeniden açılınca toparlar
      }
    }
  }
}

/**
 * Paketi açar, hedef klasöre çıkarır ve DB içindeki absolute path’leri yeni konuma göre günceller.
 * (Bu işlem sırasında DB açık olmamalı → UI zaten önce projeyi kapatacak)
 */
function loadDubPack(input: PackageLoadInput): { success: boolean; error?: string; project_path?: string } {
  try {
    if (db.isDatabaseOpen()) {
      return { success: false, error: 'Paket yüklemek için önce projeyi kapatın.' }
    }

    if (!exists(input.pack_path)) return { success: false, error: 'Paket dosyası bulunamadı.' }
    ensureDir(input.destination_root)

    const zip = new AdmZip(input.pack_path)

    // Meta oku
    let meta: DubPackMeta | null = null
    try {
      const metaEntry = zip.getEntry('dubpack.meta.json')
      if (metaEntry) meta = JSON.parse(metaEntry.getData().toString('utf-8'))
    } catch {
      meta = null
    }

    // project.json’dan isim çek (fallback)
    let projectName = meta?.project_name
    if (!projectName) {
      const pjEntry = zip.getEntry('project.json')
      if (!pjEntry) return { success: false, error: 'Paket bozuk: project.json yok.' }
      const pj = JSON.parse(pjEntry.getData().toString('utf-8'))
      projectName = pj.name || 'DubLabProject'
    }

    const targetProjectPath = uniqueFolderPath(input.destination_root, projectName)
    ensureDir(targetProjectPath)

    zip.extractAllTo(targetProjectPath, true)

    const dbPath = path.join(targetProjectPath, 'project.db')
    if (!exists(dbPath)) return { success: false, error: 'Paket bozuk: project.db yok.' }

    // DB aç → eski path’i al → rewrite
    db.openDatabase(dbPath)
    const projectRow = db.getFirstProject()
    if (!projectRow) {
      db.closeDatabase()
      return { success: false, error: 'Veritabanında proje kaydı yok.' }
    }

    const oldBase = projectRow.project_path as string
    const newBase = targetProjectPath

    db.updateProject(projectRow.id, { project_path: newBase } as any)

    const files = db.listAudioFilesByProject(projectRow.id)
    for (const f of files) {
      const updates: Record<string, any> = {}

      if (typeof f.original_path === 'string' && f.original_path.startsWith(oldBase)) {
        updates.original_path = path.join(newBase, path.relative(oldBase, f.original_path))
      }
      if (typeof f.recording_path === 'string' && f.recording_path.startsWith(oldBase)) {
        updates.recording_path = path.join(newBase, path.relative(oldBase, f.recording_path))
      }
      if (typeof f.mixed_path === 'string' && f.mixed_path.startsWith(oldBase)) {
        updates.mixed_path = path.join(newBase, path.relative(oldBase, f.mixed_path))
      }

      if (Object.keys(updates).length > 0) db.updateAudioFile(f.id, updates)
    }

    db.closeDatabase()
    return { success: true, project_path: targetProjectPath }
  } catch (e: any) {
    try {
      if (db.isDatabaseOpen()) db.closeDatabase()
    } catch {}
    return { success: false, error: e?.message || 'Paket yükleme hatası' }
  }
}

export function registerPackageHandlers(): void {
  ipcMain.handle('package:create', async (_event, input: PackageCreateInput) => {
    return createDubPack(input)
  })

  ipcMain.handle('package:load', async (_event, input: PackageLoadInput) => {
    return loadDubPack(input)
  })
}