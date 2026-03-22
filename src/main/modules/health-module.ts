// ============================================================
// DubLab — Veri Sağlık Kontrolü Modülü
// ============================================================
// Bu modül dosya sistemi ile veritabanı arasındaki
// tutarlılığı kontrol eder ve sorunları raporlar.
//
// Kontrol edilen durumlar:
// - DB'de kayıt var ama dosya yok (kayıp dosya)
// - Dosya var ama DB'de kayıt yok (kayıtsız dosya)
// - Karakter klasörü var ama DB'de karakter yok
// - DB'de karakter var ama klasörü yok
// - Atanmamış karakterler
// - Çevirisi eksik satırlar
// - Kaydı yapılmamış satırlar
// - Çakışan dosya adları
//
// Her sorun için önem derecesi ve otomatik düzeltme önerisi sunar.
//
// Bağımlılıklar: database.ts (sadece import)
// Başka modüllere bağımlılığı YOKTUR.
// ============================================================

import { ipcMain } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import * as db from '../database'
import { v4 as uuidv4 } from 'uuid'

// ────────────────────────────────────────────
// TİP TANIMLARI
// ────────────────────────────────────────────

interface HealthIssue {
  id: string
  severity: 'error' | 'warning' | 'info'
  category: string
  message: string
  details: string
  auto_fixable: boolean
  entity_id?: string
  entity_type?: string
  fix_action?: string
}

interface HealthReport {
  checked_at: string
  overall_status: 'healthy' | 'warning' | 'critical'
  issues: HealthIssue[]
  summary: {
    total_checks: number
    errors: number
    warnings: number
    info: number
    passed: number
  }
}

// ────────────────────────────────────────────
// SABİTLER
// ────────────────────────────────────────────

const AUDIO_EXTENSIONS = ['.wav', '.mp3', '.ogg', '.flac']

// ────────────────────────────────────────────
// YARDIMCI FONKSİYONLAR
// ────────────────────────────────────────────

function isAudioFile(fileName: string): boolean {
  const ext = path.extname(fileName).toLowerCase()
  return AUDIO_EXTENSIONS.includes(ext)
}

function sanitizeFolderName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .trim()
}

function listAudioFilesInFolder(folderPath: string): string[] {
  if (!fs.existsSync(folderPath)) return []
  try {
    return fs.readdirSync(folderPath).filter(f => {
      const fullPath = path.join(folderPath, f)
      return fs.statSync(fullPath).isFile() && isAudioFile(f)
    })
  } catch {
    return []
  }
}

function listSubfolders(folderPath: string): string[] {
  if (!fs.existsSync(folderPath)) return []
  try {
    return fs.readdirSync(folderPath).filter(f => {
      return fs.statSync(path.join(folderPath, f)).isDirectory()
    })
  } catch {
    return []
  }
}

// ────────────────────────────────────────────
// KONTROL FONKSİYONLARI
// ────────────────────────────────────────────

/**
 * Ana sağlık kontrolü — tüm kontrolleri çalıştırır
 */
function runHealthCheck(projectId: string, projectPath: string): HealthReport {
  const issues: HealthIssue[] = []
  let totalChecks = 0

  // ─── 1. KAYIP DOSYA KONTROLÜ ───
  // DB'de kayıt var ama dosya yok
  totalChecks++
  const audioFiles = db.listAudioFilesByProject(projectId)
  for (const file of audioFiles) {
    // Original path kontrolü
    if (file.original_path && !fs.existsSync(file.original_path)) {
      issues.push({
        id: uuidv4(),
        severity: 'error',
        category: 'missing_file',
        message: `Kayıp dosya: ${file.file_name} (Original)`,
        details: `Beklenen yol: ${file.original_path}`,
        auto_fixable: true,
        entity_id: file.id,
        entity_type: 'audio_file',
        fix_action: 'clear_original_path',
      })
    }

    // Recording path kontrolü
    if (file.recording_path && !fs.existsSync(file.recording_path)) {
      issues.push({
        id: uuidv4(),
        severity: 'warning',
        category: 'missing_file',
        message: `Kayıp dosya: ${file.file_name} (Recording)`,
        details: `Beklenen yol: ${file.recording_path}`,
        auto_fixable: true,
        entity_id: file.id,
        entity_type: 'audio_file',
        fix_action: 'clear_recording_path',
      })
    }

    // Mixed path kontrolü
    if (file.mixed_path && !fs.existsSync(file.mixed_path)) {
      issues.push({
        id: uuidv4(),
        severity: 'warning',
        category: 'missing_file',
        message: `Kayıp dosya: ${file.file_name} (Mixed)`,
        details: `Beklenen yol: ${file.mixed_path}`,
        auto_fixable: true,
        entity_id: file.id,
        entity_type: 'audio_file',
        fix_action: 'clear_mixed_path',
      })
    }
  }

  // ─── 2. KAYITSIZ DOSYA KONTROLÜ ───
  // Dosya var ama DB'de kayıt yok
  totalChecks++
  const characters = db.listCharacters(projectId)
  const categories = ['Originals', 'Recording', 'Mixed']

  for (const character of characters) {
    for (const category of categories) {
      const folderPath = path.join(projectPath, category, sanitizeFolderName(character.name))
      const filesOnDisk = listAudioFilesInFolder(folderPath)

      for (const fileName of filesOnDisk) {
        const existing = db.getAudioFileByFileName(projectId, fileName)
        if (!existing) {
          issues.push({
            id: uuidv4(),
            severity: 'warning',
            category: 'unregistered_file',
            message: `Kayıtsız dosya: ${fileName} (${character.name}/${category})`,
            details: `Dosya klasörde var ama veritabanında kaydı yok.`,
            auto_fixable: true,
            entity_id: character.id,
            entity_type: 'character',
            fix_action: 'register_file',
          })
        }
      }
    }
  }

  // ─── 3. KLASÖR TUTARLILIĞI ───
  // DB'de karakter var ama klasörü yok
  totalChecks++
  for (const character of characters) {
    const sanitized = sanitizeFolderName(character.name)
    for (const category of categories) {
      const folderPath = path.join(projectPath, category, sanitized)
      if (!fs.existsSync(folderPath)) {
        issues.push({
          id: uuidv4(),
          severity: 'error',
          category: 'folder_mismatch',
          message: `Eksik klasör: ${category}/${sanitized}`,
          details: `"${character.name}" karakteri için ${category} klasörü bulunamadı.`,
          auto_fixable: true,
          entity_id: character.id,
          entity_type: 'character',
          fix_action: 'create_folder',
        })
      }
    }
  }

  // Klasör var ama DB'de karakter yok
  totalChecks++
  for (const category of categories) {
    const categoryPath = path.join(projectPath, category)
    const foldersOnDisk = listSubfolders(categoryPath)
    const characterNames = characters.map((c: any) => sanitizeFolderName(c.name))

    for (const folderName of foldersOnDisk) {
      if (!characterNames.includes(folderName)) {
        issues.push({
          id: uuidv4(),
          severity: 'warning',
          category: 'folder_mismatch',
          message: `Eşleşmeyen klasör: ${category}/${folderName}`,
          details: `Klasör var ama bu isimde bir karakter veritabanında yok.`,
          auto_fixable: false,
          fix_action: 'manual',
        })
      }
    }
  }

  // ─── 4. ATANMAMIŞ KARAKTER KONTROLÜ ───
  totalChecks++
  const unassigned = db.getUnassignedCharacters(projectId)
  if (unassigned.length > 0) {
    issues.push({
      id: uuidv4(),
      severity: 'info',
      category: 'unassigned_character',
      message: `${unassigned.length} karakter sanatçı ataması bekliyor`,
      details: `Karakterler: ${unassigned.map((c: any) => c.name).join(', ')}`,
      auto_fixable: false,
      fix_action: 'manual',
    })
  }

  // ─── 5. ÇEVİRİ EKSİĞİ KONTROLÜ ───
  totalChecks++
  const untranslated = db.getUntranslatedCount(projectId)
  if (untranslated > 0) {
    issues.push({
      id: uuidv4(),
      severity: 'info',
      category: 'empty_translation',
      message: `${untranslated} satırın çevirisi eksik`,
      details: `Toplam ${audioFiles.length} satırdan ${untranslated} tanesi çevrilmemiş.`,
      auto_fixable: false,
      fix_action: 'manual',
    })
  }

  // ─── 6. KAYIT EKSİĞİ KONTROLÜ ───
  totalChecks++
  const unrecorded = db.getUnrecordedCount(projectId)
  if (unrecorded > 0) {
    issues.push({
      id: uuidv4(),
      severity: 'info',
      category: 'unrecorded',
      message: `${unrecorded} satırın kaydı yapılmamış`,
      details: `Toplam ${audioFiles.length} satırdan ${unrecorded} tanesi kaydedilmemiş.`,
      auto_fixable: false,
      fix_action: 'manual',
    })
  }

  // ─── 7. ÇAKIŞAN DOSYA ADI KONTROLÜ ───
  totalChecks++
  const fileNameCounts: Record<string, number> = {}
  for (const file of audioFiles) {
    fileNameCounts[file.file_name] = (fileNameCounts[file.file_name] || 0) + 1
  }
  const duplicates = Object.entries(fileNameCounts).filter(([, count]) => count > 1)
  for (const [fileName, count] of duplicates) {
    issues.push({
      id: uuidv4(),
      severity: 'error',
      category: 'duplicate_record',
      message: `Çakışan dosya adı: ${fileName} (${count} kayıt)`,
      details: `Aynı dosya adıyla ${count} farklı kayıt bulundu.`,
      auto_fixable: false,
      fix_action: 'manual',
    })
  }

  // ─── RAPOR OLUŞTUR ───
  const errors = issues.filter(i => i.severity === 'error').length
  const warnings = issues.filter(i => i.severity === 'warning').length
  const info = issues.filter(i => i.severity === 'info').length

  let overallStatus: 'healthy' | 'warning' | 'critical' = 'healthy'
  if (errors > 0) overallStatus = 'critical'
  else if (warnings > 0) overallStatus = 'warning'

  return {
    checked_at: new Date().toISOString(),
    overall_status: overallStatus,
    issues,
    summary: {
      total_checks: totalChecks,
      errors,
      warnings,
      info,
      passed: totalChecks - (errors > 0 ? 1 : 0) - (warnings > 0 ? 1 : 0),
    },
  }
}

/**
 * Tek bir sorunu otomatik düzeltir
 */
function fixIssue(
  projectId: string,
  projectPath: string,
  issue: HealthIssue
): { success: boolean; message: string } {
  try {
    switch (issue.fix_action) {
      case 'clear_original_path':
        if (issue.entity_id) {
          db.updateAudioFile(issue.entity_id, { original_path: null })
          return { success: true, message: `Original path temizlendi: ${issue.message}` }
        }
        break

      case 'clear_recording_path':
        if (issue.entity_id) {
          db.updateAudioFile(issue.entity_id, { recording_path: null })
          return { success: true, message: `Recording path temizlendi: ${issue.message}` }
        }
        break

      case 'clear_mixed_path':
        if (issue.entity_id) {
          db.updateAudioFile(issue.entity_id, { mixed_path: null })
          return { success: true, message: `Mixed path temizlendi: ${issue.message}` }
        }
        break

      case 'create_folder': {
        // Eksik klasörü oluştur
        const character = issue.entity_id ? db.getCharacter(issue.entity_id) : null
        if (character) {
          const sanitized = sanitizeFolderName(character.name)
          const categories = ['Originals', 'Recording', 'Mixed']
          for (const cat of categories) {
            const folderPath = path.join(projectPath, cat, sanitized)
            if (!fs.existsSync(folderPath)) {
              fs.mkdirSync(folderPath, { recursive: true })
            }
          }
          return { success: true, message: `Eksik klasörler oluşturuldu: ${character.name}` }
        }
        break
      }

      case 'register_file': {
        // Kayıtsız dosyayı DB'ye ekle
        // Detaylardan dosya adı ve kategoriyi çıkar
        const match = issue.message.match(/Kayıtsız dosya: (.+?) \((.+?)\/(.+?)\)/)
        if (match && issue.entity_id) {
          const fileName = match[1]
          const characterName = match[2]
          const category = match[3]

          const character = db.getCharacterByName(projectId, characterName)
          if (character) {
            const sanitized = sanitizeFolderName(characterName)
            const filePath = path.join(projectPath, category, sanitized, fileName)

            const pathField = category === 'Originals' ? 'original_path'
              : category === 'Recording' ? 'recording_path'
              : 'mixed_path'

            // Mevcut kayıt var mı?
            const existing = db.getAudioFileByFileName(projectId, fileName)
            if (existing) {
              db.updateAudioFile(existing.id, { [pathField]: filePath })
            } else {
              const newFile: any = {
                character_id: character.id,
                file_name: fileName,
              }
              newFile[pathField] = filePath
              db.createAudioFile(projectId, newFile)
            }

            return { success: true, message: `Dosya kaydedildi: ${fileName}` }
          }
        }
        break
      }
    }

    return { success: false, message: 'Bu sorun otomatik düzeltilemedi.' }
  } catch (error: any) {
    return { success: false, message: error.message }
  }
}

// ────────────────────────────────────────────
// IPC HANDLER'LARI
// ────────────────────────────────────────────

export function registerHealthHandlers(): void {

  // Sağlık kontrolü çalıştır
  ipcMain.handle('health:check', async (_event, data: {
    project_id: string
    project_path: string
  }) => {
    try {
      const report = runHealthCheck(data.project_id, data.project_path)

      // Audit log
      db.createAuditLog(data.project_id, {
        action_type: 'update',
        entity_type: 'project',
        entity_id: data.project_id,
        description: `Sağlık kontrolü: ${report.summary.errors} hata, ${report.summary.warnings} uyarı, ${report.summary.info} bilgi.`,
        new_value: report.summary,
      })

      return { success: true, report }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // Tek sorun düzelt
  ipcMain.handle('health:fix', async (_event, data: {
    project_id: string
    project_path: string
    issue: HealthIssue
  }) => {
    try {
      const result = fixIssue(data.project_id, data.project_path, data.issue)

      if (result.success) {
        db.createAuditLog(data.project_id, {
          action_type: 'update',
          entity_type: 'project',
          entity_id: data.project_id,
          description: `[Sağlık] Sorun düzeltildi: ${result.message}`,
          new_value: { fixed_issue: data.issue.message },
        })
      }

      return { success: result.success, message: result.message }
    } catch (error: any) {
      return { success: false, message: error.message }
    }
  })

  // Tüm düzeltilebilir sorunları düzelt
  ipcMain.handle('health:fix-all', async (_event, data: {
    project_id: string
    project_path: string
  }) => {
    try {
      const report = runHealthCheck(data.project_id, data.project_path)
      const fixableIssues = report.issues.filter(i => i.auto_fixable)

      let fixedCount = 0
      let failedCount = 0
      const results: Array<{ message: string; success: boolean }> = []

      for (const issue of fixableIssues) {
        const result = fixIssue(data.project_id, data.project_path, issue)
        results.push(result)
        if (result.success) fixedCount++
        else failedCount++
      }

      db.createAuditLog(data.project_id, {
        action_type: 'update',
        entity_type: 'project',
        entity_id: data.project_id,
        description: `[Sağlık] Toplu düzeltme: ${fixedCount} düzeltilen, ${failedCount} başarısız.`,
        new_value: { fixed: fixedCount, failed: failedCount },
      })

      return {
        success: true,
        fixed_count: fixedCount,
        failed_count: failedCount,
        results,
      }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })
}