// ============================================================
// DubLab — Çeviri Modülü
// ============================================================
// Bu modül çeviri editörü, Excel export/import
// ve çeviri durumu yönetimi işlemlerini yönetir.
//
// Excel formatı: .xlsx (sütunlu yapı, CSV değil)
// Ses ID = dosya adı + uzantı
//
// Bağımlılıklar: database.ts (sadece import), xlsx
// Başka modüllere bağımlılığı YOKTUR.
// ============================================================

import { ipcMain } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import * as XLSX from 'xlsx'
import * as db from '../database'

// ────────────────────────────────────────────
// YARDIMCI FONKSİYONLAR
// ────────────────────────────────────────────

/**
 * Çeviri durumunu belirler
 */
function determineTranslationStatus(
  originalText: string | null,
  translatedText: string | null
): string {
  if (!originalText && !translatedText) return 'empty'
  if (originalText && !translatedText) return 'has_original'
  if (originalText && translatedText) return 'translated'
  return 'empty'
}

/**
 * Çeviri verilerini sayfalandırır
 */
function paginateArray<T>(array: T[], page: number, pageSize: number): {
  items: T[]
  total: number
  page: number
  page_size: number
  total_pages: number
} {
  const total = array.length
  const totalPages = Math.ceil(total / pageSize)
  const safePage = Math.max(1, Math.min(page, totalPages || 1))
  const start = (safePage - 1) * pageSize
  const items = array.slice(start, start + pageSize)

  return {
    items,
    total,
    page: safePage,
    page_size: pageSize,
    total_pages: totalPages,
  }
}

// ────────────────────────────────────────────
// IPC HANDLER'LARI
// ────────────────────────────────────────────

export function registerTranslationHandlers(): void {

  // ══════════════════════════════════════════
  // ÇEVİRİ LİSTELEME (Sayfalandırmalı)
  // ══════════════════════════════════════════
  ipcMain.handle('translation:list', async (_event, data: {
    project_id: string
    character_id?: string | null
    status_filter?: string | null
    search_query?: string | null
    page?: number
    page_size?: number
  }) => {
    try {
      // Tüm ses dosyalarını al
      let audioFiles: any[]

      if (data.character_id) {
        audioFiles = db.listAudioFilesByCharacter(data.character_id)
      } else {
        audioFiles = db.listAudioFilesByProject(data.project_id)
      }

      // Karakter bilgilerini ekle
      const characterCache: Record<string, string> = {}
      const enriched = audioFiles.map((file: any) => {
        if (!characterCache[file.character_id]) {
          const char = db.getCharacter(file.character_id)
          characterCache[file.character_id] = char ? char.name : 'Bilinmeyen'
        }

        return {
          id: file.id,
          sound_id: file.file_name,
          character_id: file.character_id,
          character_name: characterCache[file.character_id],
          original_text: file.original_text || '',
          translated_text: file.translated_text || '',
          translation_status: file.translation_status,
          recording_status: file.recording_status,
          mixing_status: file.mixing_status,
          original_path: file.original_path,
          updated_at: file.updated_at,
        }
      })

      // Durum filtresi
      let filtered = enriched
      if (data.status_filter && data.status_filter !== 'all') {
        filtered = filtered.filter(f => f.translation_status === data.status_filter)
      }

      // Arama filtresi
      if (data.search_query && data.search_query.trim() !== '') {
        const query = data.search_query.toLowerCase().trim()
        filtered = filtered.filter(f =>
          f.sound_id.toLowerCase().includes(query) ||
          f.original_text.toLowerCase().includes(query) ||
          f.translated_text.toLowerCase().includes(query) ||
          f.character_name.toLowerCase().includes(query)
        )
      }

      // Sayfalandırma
      const page = data.page || 1
      const pageSize = data.page_size || 50
      const paginated = paginateArray(filtered, page, pageSize)

      // İstatistikler (filtrelenmemiş toplam üzerinden)
      const totalCount = enriched.length
      const translatedCount = enriched.filter(f => f.translation_status === 'translated').length
      const hasOriginalCount = enriched.filter(f => f.translation_status === 'has_original').length
      const emptyCount = enriched.filter(f => f.translation_status === 'empty').length
      const reviewedCount = enriched.filter(f => f.translation_status === 'reviewed').length

      return {
        success: true,
        translations: paginated.items,
        pagination: {
          page: paginated.page,
          page_size: paginated.page_size,
          total: paginated.total,
          total_pages: paginated.total_pages,
        },
        stats: {
          total: totalCount,
          translated: translatedCount,
          has_original: hasOriginalCount,
          empty: emptyCount,
          reviewed: reviewedCount,
          percent: totalCount > 0 ? Math.round((translatedCount / totalCount) * 100) : 0,
        },
      }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // ══════════════════════════════════════════
  // TEK ÇEVİRİ GÜNCELLEME
  // ══════════════════════════════════════════
  ipcMain.handle('translation:update', async (_event, data: {
    audio_file_id: string
    project_id: string
    field: 'original_text' | 'translated_text'
    value: string
  }) => {
    try {
      const current = db.getAudioFile(data.audio_file_id)
      if (!current) {
        return { success: false, error: 'Ses dosyası bulunamadı.' }
      }

      const oldValue = current[data.field]
      const updates: Record<string, any> = { [data.field]: data.value }

      // Durumu otomatik hesapla
      const origText = data.field === 'original_text' ? data.value : current.original_text
      const transText = data.field === 'translated_text' ? data.value : current.translated_text
      updates.translation_status = determineTranslationStatus(origText, transText)

      const updated = db.updateAudioFile(data.audio_file_id, updates)

      return {
        success: true,
        audio_file: updated,
        old_value: oldValue,
        new_value: data.value,
      }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // ══════════════════════════════════════════
  // ÇEVİRİ DURUMUNU DEĞİŞTİR
  // ══════════════════════════════════════════
  ipcMain.handle('translation:set-status', async (_event, data: {
    audio_file_id: string
    status: string
  }) => {
    try {
      const updated = db.updateAudioFile(data.audio_file_id, {
        translation_status: data.status,
      })
      return { success: true, audio_file: updated }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // ══════════════════════════════════════════
  // EXCEL EXPORT
  // ══════════════════════════════════════════
  ipcMain.handle('translation:export-excel', async (_event, data: {
    project_id: string
    output_path: string
    character_ids?: string[] | null
    separate_sheets: boolean
  }) => {
    try {
      // Karakterleri al
      const allCharacters = db.listCharacters(data.project_id)
      const characters = data.character_ids
        ? allCharacters.filter((c: any) => data.character_ids!.includes(c.id))
        : allCharacters

      // Workbook oluştur
      const workbook = XLSX.utils.book_new()

      if (data.separate_sheets) {
        // ─── Her karakter ayrı sheet ───
        for (const character of characters) {
          const audioFiles = db.listAudioFilesByCharacter(character.id)

          const rows = audioFiles.map((file: any) => ({
            'Ses ID': file.file_name,
            'Karakter': character.name,
            'English': file.original_text || '',
            'Türkçe': file.translated_text || '',
            'Durum': translateStatus(file.translation_status),
          }))

          const worksheet = XLSX.utils.json_to_sheet(rows)

          // Sütun genişlikleri
          worksheet['!cols'] = [
            { wch: 25 },  // Ses ID
            { wch: 20 },  // Karakter
            { wch: 50 },  // English
            { wch: 50 },  // Türkçe
            { wch: 15 },  // Durum
          ]

          // Sheet adı (max 31 karakter, Excel limiti)
          const sheetName = character.name.substring(0, 31)
          XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)
        }
      } else {
        // ─── Tüm karakterler tek sheet ───
        const allRows: any[] = []

        for (const character of characters) {
          const audioFiles = db.listAudioFilesByCharacter(character.id)

          for (const file of audioFiles) {
            allRows.push({
              'Ses ID': file.file_name,
              'Karakter': character.name,
              'English': file.original_text || '',
              'Türkçe': file.translated_text || '',
              'Durum': translateStatus(file.translation_status),
            })
          }
        }

        const worksheet = XLSX.utils.json_to_sheet(allRows)

        worksheet['!cols'] = [
          { wch: 25 },
          { wch: 20 },
          { wch: 50 },
          { wch: 50 },
          { wch: 15 },
        ]

        XLSX.utils.book_append_sheet(workbook, worksheet, 'Tüm Çeviriler')
      }

      // Dosyayı yaz
      XLSX.writeFile(workbook, data.output_path)

      // Toplam satır sayısı
      let totalRows = 0
      for (const character of characters) {
        totalRows += db.listAudioFilesByCharacter(character.id).length
      }

      // Audit log
      db.createAuditLog(data.project_id, {
        action_type: 'export',
        entity_type: 'translation',
        entity_id: data.project_id,
        description: `Excel export: ${totalRows} satır, ${characters.length} karakter.`,
        new_value: {
          output_path: data.output_path,
          total_rows: totalRows,
          characters_count: characters.length,
          separate_sheets: data.separate_sheets,
        },
      })

      return {
        success: true,
        output_path: data.output_path,
        total_rows: totalRows,
        characters_count: characters.length,
      }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // ══════════════════════════════════════════
  // EXCEL IMPORT — ÖNİZLEME
  // ══════════════════════════════════════════
  ipcMain.handle('translation:preview-excel', async (_event, data: {
    project_id: string
    file_path: string
  }) => {
    try {
      // Excel dosyasını oku
      const workbook = XLSX.readFile(data.file_path)

      const allChanges: Array<{
        sound_id: string
        character_name: string
        field: string
        old_value: string
        new_value: string
        matched: boolean
      }> = []

      const unmatchedIds: string[] = []
      let totalRows = 0
      let matchedRows = 0

      // Her sheet'i tara
      for (const sheetName of workbook.SheetNames) {
        const worksheet = workbook.Sheets[sheetName]
        const rows: any[] = XLSX.utils.sheet_to_json(worksheet)

        for (const row of rows) {
          totalRows++

          // Ses ID sütununu bul (farklı header isimleri destekle)
          const soundId = row['Ses ID'] || row['Sound ID'] || row['SesID'] || row['sound_id']
          if (!soundId) continue

          // DB'de eşleşen kayıt bul
          const existing = db.getAudioFileByFileName(data.project_id, soundId)

          if (!existing) {
            unmatchedIds.push(soundId)
            continue
          }

          matchedRows++

          // English sütununu kontrol et
          const newEnglish = row['English'] || row['english'] || row['İngilizce']
          if (newEnglish !== undefined) {
            const oldEnglish = existing.original_text || ''
            if (String(newEnglish) !== oldEnglish) {
              const char = db.getCharacter(existing.character_id)
              allChanges.push({
                sound_id: soundId,
                character_name: char?.name || 'Bilinmeyen',
                field: 'original_text',
                old_value: oldEnglish,
                new_value: String(newEnglish),
                matched: true,
              })
            }
          }

          // Türkçe sütununu kontrol et
          const newTurkish = row['Türkçe'] || row['Turkish'] || row['turkce'] || row['Turkce']
          if (newTurkish !== undefined) {
            const oldTurkish = existing.translated_text || ''
            if (String(newTurkish) !== oldTurkish) {
              const char = db.getCharacter(existing.character_id)
              allChanges.push({
                sound_id: soundId,
                character_name: char?.name || 'Bilinmeyen',
                field: 'translated_text',
                old_value: oldTurkish,
                new_value: String(newTurkish),
                matched: true,
              })
            }
          }
        }
      }

      return {
        success: true,
        preview: {
          file_name: path.basename(data.file_path),
          total_rows: totalRows,
          matched_rows: matchedRows,
          unmatched_rows: unmatchedIds.length,
          changes_count: allChanges.length,
          changes: allChanges,
          unmatched_ids: unmatchedIds,
        },
      }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // ══════════════════════════════════════════
  // EXCEL IMPORT — UYGULAMA
  // ══════════════════════════════════════════
  ipcMain.handle('translation:apply-excel', async (_event, data: {
    project_id: string
    file_path: string
  }) => {
    try {
      // Excel dosyasını oku
      const workbook = XLSX.readFile(data.file_path)

      let updatedCount = 0
      let unchangedCount = 0
      let unmatchedCount = 0
      const updatedFiles: string[] = []

      // Her sheet'i tara
      for (const sheetName of workbook.SheetNames) {
        const worksheet = workbook.Sheets[sheetName]
        const rows: any[] = XLSX.utils.sheet_to_json(worksheet)

        for (const row of rows) {
          const soundId = row['Ses ID'] || row['Sound ID'] || row['SesID'] || row['sound_id']
          if (!soundId) continue

          const existing = db.getAudioFileByFileName(data.project_id, soundId)
          if (!existing) {
            unmatchedCount++
            continue
          }

          let changed = false
          const updates: Record<string, any> = {}

          // English
          const newEnglish = row['English'] || row['english'] || row['İngilizce']
          if (newEnglish !== undefined && String(newEnglish) !== (existing.original_text || '')) {
            updates.original_text = String(newEnglish)
            changed = true
          }

          // Türkçe
          const newTurkish = row['Türkçe'] || row['Turkish'] || row['turkce'] || row['Turkce']
          if (newTurkish !== undefined && String(newTurkish) !== (existing.translated_text || '')) {
            updates.translated_text = String(newTurkish)
            changed = true
          }

          if (changed) {
            // Durumu otomatik hesapla
            const origText = updates.original_text !== undefined
              ? updates.original_text
              : existing.original_text
            const transText = updates.translated_text !== undefined
              ? updates.translated_text
              : existing.translated_text
            updates.translation_status = determineTranslationStatus(origText, transText)

            db.updateAudioFile(existing.id, updates)
            updatedFiles.push(soundId)
            updatedCount++
          } else {
            unchangedCount++
          }
        }
      }

      // Audit log
      db.createAuditLog(data.project_id, {
        action_type: 'import',
        entity_type: 'translation',
        entity_id: data.project_id,
        description: `Excel import: ${updatedCount} güncellenen, ${unchangedCount} değişmeyen, ${unmatchedCount} eşleşmeyen.`,
        new_value: {
          file: path.basename(data.file_path),
          updated: updatedCount,
          unchanged: unchangedCount,
          unmatched: unmatchedCount,
          updated_files: updatedFiles,
        },
      })

      return {
        success: true,
        result: {
          updated: updatedCount,
          unchanged: unchangedCount,
          unmatched: unmatchedCount,
          updated_files: updatedFiles,
        },
      }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // ══════════════════════════════════════════
  // ÇEVİRİ İSTATİSTİKLERİ
  // ══════════════════════════════════════════
  ipcMain.handle('translation:stats', async (_event, projectId: string) => {
    try {
      const audioFiles = db.listAudioFilesByProject(projectId)
      const total = audioFiles.length

      const stats = {
        total: total,
        empty: 0,
        has_original: 0,
        translated: 0,
        reviewed: 0,
      }

      for (const file of audioFiles) {
        switch (file.translation_status) {
          case 'empty': stats.empty++; break
          case 'has_original': stats.has_original++; break
          case 'translated': stats.translated++; break
          case 'reviewed': stats.reviewed++; break
          default: stats.empty++; break
        }
      }

      return {
        success: true,
        stats: {
          ...stats,
          translation_percent: total > 0
            ? Math.round((stats.translated / total) * 100)
            : 0,
          review_percent: total > 0
            ? Math.round((stats.reviewed / total) * 100)
            : 0,
          completion_percent: total > 0
            ? Math.round(((stats.translated + stats.reviewed) / total) * 100)
            : 0,
        },
      }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })
}

// ────────────────────────────────────────────
// YARDIMCI (Modül içi)
// ────────────────────────────────────────────

/**
 * Durum kodunu okunabilir Türkçe'ye çevirir (Excel export için)
 */
function translateStatus(status: string): string {
  switch (status) {
    case 'empty': return 'Boş'
    case 'has_original': return 'Orijinal Var'
    case 'translated': return 'Çevrildi'
    case 'reviewed': return 'İncelendi'
    default: return 'Bilinmeyen'
  }
}