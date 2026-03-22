// ============================================================
// DubLab — Ses Dosyası Modülü
// ============================================================
// Bu modül ses dosyası import, silme, listeleme,
// dosya kopyalama ve kategori yönetimi işlemlerini yönetir.
//
// 3 kategori: Originals, Recording, Mixed
// Her import işleminde dosya ilgili klasöre kopyalanır
// ve DB kaydı oluşturulur/güncellenir.
//
// Bağımlılıklar: database.ts (sadece import)
// Başka modüllere bağımlılığı YOKTUR.
// ============================================================

import { ipcMain } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import * as db from '../database'

// ────────────────────────────────────────────
// SABİTLER
// ────────────────────────────────────────────

const AUDIO_EXTENSIONS = ['.wav', '.mp3', '.ogg', '.flac']

const CATEGORY_FOLDERS: Record<string, string> = {
  originals: 'Originals',
  recording: 'Recording',
  mixed: 'Mixed',
}

// ────────────────────────────────────────────
// YARDIMCI FONKSİYONLAR
// ────────────────────────────────────────────

/**
 * Dosya adının geçerli bir ses dosyası olup olmadığını kontrol eder
 */
function isAudioFile(fileName: string): boolean {
  const ext = path.extname(fileName).toLowerCase()
  return AUDIO_EXTENSIONS.includes(ext)
}

/**
 * Klasör adını güvenli hale getirir
 */
function sanitizeFolderName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .trim()
}

/**
 * Hedef klasör yolunu oluşturur
 * Örnek: /proje/Originals/KarakterAdı/
 */
function getCategoryPath(
  projectPath: string,
  category: string,
  characterName: string
): string {
  const categoryFolder = CATEGORY_FOLDERS[category]
  if (!categoryFolder) {
    throw new Error(`Geçersiz kategori: ${category}`)
  }
  const sanitized = sanitizeFolderName(characterName)
  return path.join(projectPath, categoryFolder, sanitized)
}

/**
 * Dosyayı hedef klasöre kopyalar.
 * Aynı isimde dosya varsa üzerine yazar.
 * Klasör yoksa oluşturur.
 */
function copyFileToCategory(
  sourcePath: string,
  projectPath: string,
  category: string,
  characterName: string
): { destPath: string; fileName: string } {
  const destFolder = getCategoryPath(projectPath, category, characterName)

  // Klasör yoksa oluştur
  if (!fs.existsSync(destFolder)) {
    fs.mkdirSync(destFolder, { recursive: true })
  }

  const fileName = path.basename(sourcePath)
  const destPath = path.join(destFolder, fileName)

  // Kopyala
  fs.copyFileSync(sourcePath, destPath)

  return { destPath, fileName }
}

/**
 * Dosya boyutunu okunabilir formata çevirir
 */
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  const size = (bytes / Math.pow(1024, i)).toFixed(1)
  return `${size} ${units[i]}`
}

/**
 * Dosya bilgilerini okur
 */
function getFileInfo(filePath: string): {
  exists: boolean
  size: number
  size_formatted: string
  modified: string
} | null {
  try {
    if (!fs.existsSync(filePath)) {
      return { exists: false, size: 0, size_formatted: '0 B', modified: '' }
    }
    const stats = fs.statSync(filePath)
    return {
      exists: true,
      size: stats.size,
      size_formatted: formatFileSize(stats.size),
      modified: stats.mtime.toISOString(),
    }
  } catch {
    return null
  }
}

/**
 * Bir klasördeki tüm ses dosyalarını listeler
 */
function listAudioFilesInFolder(folderPath: string): string[] {
  if (!fs.existsSync(folderPath)) return []
  try {
    return fs.readdirSync(folderPath).filter(f => isAudioFile(f)).sort()
  } catch {
    return []
  }
}

// ────────────────────────────────────────────
// IPC HANDLER'LARI
// ────────────────────────────────────────────

export function registerAudioHandlers(): void {

  // ══════════════════════════════════════════
  // ORIGINAL SES IMPORT
  // ══════════════════════════════════════════
  ipcMain.handle('audio:import-originals', async (_event, data: {
    project_id: string
    project_path: string
    character_id: string
    character_name: string
    file_paths: string[]
  }) => {
    try {
      const results: Array<{
        file_name: string
        success: boolean
        action: 'created' | 'updated' | 'skipped'
        error?: string
      }> = []

      let createdCount = 0
      let updatedCount = 0
      let skippedCount = 0

      for (const sourcePath of data.file_paths) {
        const fileName = path.basename(sourcePath)

        // Ses dosyası mı kontrol et
        if (!isAudioFile(fileName)) {
          results.push({
            file_name: fileName,
            success: false,
            action: 'skipped',
            error: 'Desteklenmeyen dosya formatı.',
          })
          skippedCount++
          continue
        }

        try {
          // Dosyayı Originals klasörüne kopyala
          const { destPath } = copyFileToCategory(
            sourcePath,
            data.project_path,
            'originals',
            data.character_name
          )

          // DB'de bu dosya var mı kontrol et
          const existing = db.getAudioFileByFileName(data.project_id, fileName)

          if (existing) {
            // Varsa güncelle
            db.updateAudioFile(existing.id, {
              original_path: destPath,
              character_id: data.character_id,
            })
            results.push({ file_name: fileName, success: true, action: 'updated' })
            updatedCount++
          } else {
            // Yoksa yeni kayıt oluştur
            db.createAudioFile(data.project_id, {
              character_id: data.character_id,
              file_name: fileName,
              original_path: destPath,
            })
            results.push({ file_name: fileName, success: true, action: 'created' })
            createdCount++
          }
        } catch (err: any) {
          results.push({
            file_name: fileName,
            success: false,
            action: 'skipped',
            error: err.message,
          })
          skippedCount++
        }
      }

      // Audit log
      db.createAuditLog(data.project_id, {
        action_type: 'import',
        entity_type: 'audio_file',
        entity_id: data.character_id,
        description: `Original import: ${data.character_name} — ${createdCount} yeni, ${updatedCount} güncellenen, ${skippedCount} atlanan.`,
        new_value: {
          character_name: data.character_name,
          total: data.file_paths.length,
          created: createdCount,
          updated: updatedCount,
          skipped: skippedCount,
        },
      })

      return {
        success: true,
        results,
        summary: {
          total: data.file_paths.length,
          created: createdCount,
          updated: updatedCount,
          skipped: skippedCount,
        },
      }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // ══════════════════════════════════════════
  // RECORDING SES IMPORT
  // ══════════════════════════════════════════
  ipcMain.handle('audio:import-recording', async (_event, data: {
    project_id: string
    project_path: string
    character_id: string
    character_name: string
    file_paths: string[]
  }) => {
    try {
      const results: Array<{
        file_name: string
        success: boolean
        action: 'matched' | 'unmatched' | 'skipped'
        error?: string
      }> = []

      let matchedCount = 0
      let unmatchedCount = 0
      let skippedCount = 0

      for (const sourcePath of data.file_paths) {
        const fileName = path.basename(sourcePath)

        if (!isAudioFile(fileName)) {
          results.push({
            file_name: fileName,
            success: false,
            action: 'skipped',
            error: 'Desteklenmeyen dosya formatı.',
          })
          skippedCount++
          continue
        }

        try {
          // Dosyayı Recording klasörüne kopyala
          const { destPath } = copyFileToCategory(
            sourcePath,
            data.project_path,
            'recording',
            data.character_name
          )

          // DB'de aynı dosya adıyla eşleştir
          const existing = db.getAudioFileByFileName(data.project_id, fileName)

          if (existing) {
            // Eşleşen kayıt var — recording_path güncelle
            db.updateAudioFile(existing.id, {
              recording_path: destPath,
            })
            results.push({ file_name: fileName, success: true, action: 'matched' })
            matchedCount++
          } else {
            // Eşleşen kayıt yok — yine de yeni kayıt oluştur
            db.createAudioFile(data.project_id, {
              character_id: data.character_id,
              file_name: fileName,
              recording_path: destPath,
            })
            results.push({ file_name: fileName, success: true, action: 'unmatched' })
            unmatchedCount++
          }
        } catch (err: any) {
          results.push({
            file_name: fileName,
            success: false,
            action: 'skipped',
            error: err.message,
          })
          skippedCount++
        }
      }

      // Audit log
      db.createAuditLog(data.project_id, {
        action_type: 'import',
        entity_type: 'audio_file',
        entity_id: data.character_id,
        description: `Recording import: ${data.character_name} — ${matchedCount} eşleşen, ${unmatchedCount} yeni, ${skippedCount} atlanan.`,
        new_value: {
          character_name: data.character_name,
          total: data.file_paths.length,
          matched: matchedCount,
          unmatched: unmatchedCount,
          skipped: skippedCount,
        },
      })

      return {
        success: true,
        results,
        summary: {
          total: data.file_paths.length,
          matched: matchedCount,
          unmatched: unmatchedCount,
          skipped: skippedCount,
        },
      }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // ══════════════════════════════════════════
  // MIXED SES IMPORT
  // ══════════════════════════════════════════
  ipcMain.handle('audio:import-mixed', async (_event, data: {
    project_id: string
    project_path: string
    character_id: string
    character_name: string
    file_paths: string[]
  }) => {
    try {
      const results: Array<{
        file_name: string
        success: boolean
        action: 'matched' | 'unmatched' | 'skipped'
        error?: string
      }> = []

      let matchedCount = 0
      let unmatchedCount = 0
      let skippedCount = 0

      for (const sourcePath of data.file_paths) {
        const fileName = path.basename(sourcePath)

        if (!isAudioFile(fileName)) {
          results.push({
            file_name: fileName,
            success: false,
            action: 'skipped',
            error: 'Desteklenmeyen dosya formatı.',
          })
          skippedCount++
          continue
        }

        try {
          const { destPath } = copyFileToCategory(
            sourcePath,
            data.project_path,
            'mixed',
            data.character_name
          )

          const existing = db.getAudioFileByFileName(data.project_id, fileName)

          if (existing) {
            db.updateAudioFile(existing.id, {
              mixed_path: destPath,
            })
            results.push({ file_name: fileName, success: true, action: 'matched' })
            matchedCount++
          } else {
            db.createAudioFile(data.project_id, {
              character_id: data.character_id,
              file_name: fileName,
              mixed_path: destPath,
            })
            results.push({ file_name: fileName, success: true, action: 'unmatched' })
            unmatchedCount++
          }
        } catch (err: any) {
          results.push({
            file_name: fileName,
            success: false,
            action: 'skipped',
            error: err.message,
          })
          skippedCount++
        }
      }

      // Audit log
      db.createAuditLog(data.project_id, {
        action_type: 'import',
        entity_type: 'audio_file',
        entity_id: data.character_id,
        description: `Mixed import: ${data.character_name} — ${matchedCount} eşleşen, ${unmatchedCount} yeni, ${skippedCount} atlanan.`,
        new_value: {
          character_name: data.character_name,
          total: data.file_paths.length,
          matched: matchedCount,
          unmatched: unmatchedCount,
          skipped: skippedCount,
        },
      })

      return {
        success: true,
        results,
        summary: {
          total: data.file_paths.length,
          matched: matchedCount,
          unmatched: unmatchedCount,
          skipped: skippedCount,
        },
      }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // ══════════════════════════════════════════
  // SES DOSYASI LİSTELEME (Karakter bazlı)
  // ══════════════════════════════════════════
  ipcMain.handle('audio:list', async (_event, data: {
    character_id?: string
    project_id?: string
  }) => {
    try {
      let audioFiles: any[]

      if (data.character_id) {
        audioFiles = db.listAudioFilesByCharacter(data.character_id)
      } else if (data.project_id) {
        audioFiles = db.listAudioFilesByProject(data.project_id)
      } else {
        return { success: false, error: 'character_id veya project_id gerekli.' }
      }

      // Her dosya için ek bilgi ekle
      const enriched = audioFiles.map((file: any) => {
        const originalInfo = file.original_path ? getFileInfo(file.original_path) : null
        const recordingInfo = file.recording_path ? getFileInfo(file.recording_path) : null
        const mixedInfo = file.mixed_path ? getFileInfo(file.mixed_path) : null

        return {
          ...file,
          original_exists: originalInfo?.exists || false,
          original_size: originalInfo?.size_formatted || null,
          recording_exists: recordingInfo?.exists || false,
          recording_size: recordingInfo?.size_formatted || null,
          mixed_exists: mixedInfo?.exists || false,
          mixed_size: mixedInfo?.size_formatted || null,
        }
      })

      return { success: true, audio_files: enriched }
    } catch (error: any) {
      return { success: false, error: error.message, audio_files: [] }
    }
  })

  // ══════════════════════════════════════════
  // TEK SES DOSYASI GETİRME
  // ══════════════════════════════════════════
  ipcMain.handle('audio:get', async (_event, audioId: string) => {
    try {
      const file = db.getAudioFile(audioId)
      if (!file) {
        return { success: false, error: 'Ses dosyası bulunamadı.' }
      }

      // Karakter bilgisi
      const character = db.getCharacter(file.character_id)

      // Dosya bilgileri
      const originalInfo = file.original_path ? getFileInfo(file.original_path) : null
      const recordingInfo = file.recording_path ? getFileInfo(file.recording_path) : null
      const mixedInfo = file.mixed_path ? getFileInfo(file.mixed_path) : null

      return {
        success: true,
        audio_file: {
          ...file,
          character_name: character?.name || 'Bilinmeyen',
          original_info: originalInfo,
          recording_info: recordingInfo,
          mixed_info: mixedInfo,
        },
      }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // ══════════════════════════════════════════
  // SES DOSYASI SİLME
  // ══════════════════════════════════════════
  ipcMain.handle('audio:delete', async (_event, data: {
    id: string
    project_id: string
    delete_physical_files: boolean
  }) => {
    try {
      const file = db.getAudioFile(data.id)
      if (!file) {
        return { success: false, error: 'Ses dosyası bulunamadı.' }
      }

      // Fiziksel dosyaları sil (kullanıcı isterse)
      if (data.delete_physical_files) {
        const paths = [file.original_path, file.recording_path, file.mixed_path]
        for (const p of paths) {
          if (p && fs.existsSync(p)) {
            try {
              fs.unlinkSync(p)
            } catch {
              // Silinemezse sessizce devam et
            }
          }
        }
      }

      // Audit log
      db.createAuditLog(data.project_id, {
        action_type: 'delete',
        entity_type: 'audio_file',
        entity_id: data.id,
        description: `Ses dosyası silindi: ${file.file_name}`,
        old_value: file,
      })

      // DB'den sil
      db.deleteAudioFile(data.id)

      return { success: true, deleted_file: file.file_name }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // ══════════════════════════════════════════
  // TOPLU SES DOSYASI SİLME
  // ══════════════════════════════════════════
  ipcMain.handle('audio:delete-bulk', async (_event, data: {
    ids: string[]
    project_id: string
    delete_physical_files: boolean
  }) => {
    try {
      let deletedCount = 0
      const deletedNames: string[] = []

      for (const id of data.ids) {
        const file = db.getAudioFile(id)
        if (!file) continue

        if (data.delete_physical_files) {
          const paths = [file.original_path, file.recording_path, file.mixed_path]
          for (const p of paths) {
            if (p && fs.existsSync(p)) {
              try { fs.unlinkSync(p) } catch { /* devam */ }
            }
          }
        }

        db.deleteAudioFile(id)
        deletedNames.push(file.file_name)
        deletedCount++
      }

      // Audit log
      db.createAuditLog(data.project_id, {
        action_type: 'delete',
        entity_type: 'audio_file',
        entity_id: 'bulk',
        description: `Toplu silme: ${deletedCount} ses dosyası silindi.`,
        old_value: { deleted_files: deletedNames },
      })

      return {
        success: true,
        deleted_count: deletedCount,
        deleted_files: deletedNames,
      }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // ══════════════════════════════════════════
  // SES DOSYASI GÜNCELLEME
  // ══════════════════════════════════════════
  ipcMain.handle('audio:update', async (_event, data: {
    id: string
    project_id: string
    updates: Record<string, any>
  }) => {
    try {
      const current = db.getAudioFile(data.id)
      if (!current) {
        return { success: false, error: 'Ses dosyası bulunamadı.' }
      }

      const updated = db.updateAudioFile(data.id, data.updates)
      return { success: true, audio_file: updated }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // ══════════════════════════════════════════
  // ARAMA
  // ══════════════════════════════════════════
  ipcMain.handle('audio:search', async (_event, data: {
    project_id: string
    query: string
  }) => {
    try {
      const results = db.searchAudioFiles(data.project_id, data.query)
      return { success: true, results }
    } catch (error: any) {
      return { success: false, error: error.message, results: [] }
    }
  })

  // ══════════════════════════════════════════
  // KLASÖR İÇERİĞİNİ TARA (DB dışı)
  // ══════════════════════════════════════════
  ipcMain.handle('audio:scan-folder', async (_event, data: {
    project_path: string
    category: string
    character_name: string
  }) => {
    try {
      const folderPath = getCategoryPath(
        data.project_path,
        data.category,
        data.character_name
      )

      const files = listAudioFilesInFolder(folderPath)

      const fileInfos = files.map(fileName => {
        const fullPath = path.join(folderPath, fileName)
        const info = getFileInfo(fullPath)
        return {
          file_name: fileName,
          full_path: fullPath,
          ...info,
        }
      })

      return {
        success: true,
        folder_path: folderPath,
        files: fileInfos,
        count: fileInfos.length,
      }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })
}