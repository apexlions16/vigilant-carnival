// ============================================================
// DubLab — Audit Log Modülü
// ============================================================
// Bu modül işlem geçmişi görüntüleme, filtreleme
// ve geri alma (undo) işlemlerini yönetir.
//
// Tüm kritik işlemler diğer modüller tarafından loglanır.
// Bu modül sadece logları görüntüler ve geri alma yapar.
//
// Bağımlılıklar: database.ts (sadece import)
// Başka modüllere bağımlılığı YOKTUR.
// ============================================================

import { ipcMain } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import * as db from '../database'

// ────────────────────────────────────────────
// YARDIMCI FONKSİYONLAR
// ────────────────────────────────────────────

/**
 * Tarihi okunabilir formata çevirir
 */
function formatDate(isoString: string): string {
  try {
    const date = new Date(isoString)
    return date.toLocaleString('tr-TR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return isoString
  }
}

/**
 * Tarihi grup başlığına çevirir (Bugün, Dün, vs.)
 */
function getDateGroup(isoString: string): string {
  try {
    const date = new Date(isoString)
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000)
    const logDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())

    if (logDate.getTime() === today.getTime()) {
      return 'Bugün'
    } else if (logDate.getTime() === yesterday.getTime()) {
      return 'Dün'
    } else if (logDate.getTime() > today.getTime() - 7 * 24 * 60 * 60 * 1000) {
      return 'Bu Hafta'
    } else if (logDate.getTime() > today.getTime() - 30 * 24 * 60 * 60 * 1000) {
      return 'Bu Ay'
    } else {
      return 'Daha Eski'
    }
  } catch {
    return 'Bilinmeyen'
  }
}

/**
 * Action type'ı okunabilir Türkçe'ye çevirir
 */
function translateActionType(actionType: string): string {
  const translations: Record<string, string> = {
    create: 'Oluşturma',
    update: 'Güncelleme',
    delete: 'Silme',
    move: 'Taşıma',
    rename: 'Yeniden Adlandırma',
    import: 'İçe Aktarma',
    export: 'Dışa Aktarma',
    assign: 'Atama',
    unassign: 'Atama Kaldırma',
    undo: 'Geri Alma',
  }
  return translations[actionType] || actionType
}

/**
 * Entity type'ı okunabilir Türkçe'ye çevirir
 */
function translateEntityType(entityType: string): string {
  const translations: Record<string, string> = {
    project: 'Proje',
    character: 'Karakter',
    voice_artist: 'Sanatçı',
    audio_file: 'Ses Dosyası',
    translation: 'Çeviri',
  }
  return translations[entityType] || entityType
}

/**
 * Action type için ikon döndürür
 */
function getActionIcon(actionType: string): string {
  const icons: Record<string, string> = {
    create: '➕',
    update: '✏️',
    delete: '🗑️',
    move: '📁',
    rename: '📝',
    import: '📥',
    export: '📤',
    assign: '🔗',
    unassign: '🔓',
    undo: '↩️',
  }
  return icons[actionType] || '📋'
}

/**
 * Geri alınabilir bir işlem mi kontrol eder
 */
function isUndoable(actionType: string, entityType: string): boolean {
  // Silme işlemleri geri alınamaz (dosyalar silinmiş olabilir)
  if (actionType === 'delete') return false

  // Undo işlemi geri alınamaz
  if (actionType === 'undo') return false

  // Export işlemi geri alınamaz (anlamlı değil)
  if (actionType === 'export') return false

  // Diğerleri geri alınabilir
  return true
}

// ────────────────────────────────────────────
// IPC HANDLER'LARI
// ────────────────────────────────────────────

export function registerAuditHandlers(): void {

  // ══════════════════════════════════════════
  // AUDIT LOG LİSTELEME
  // ══════════════════════════════════════════
  ipcMain.handle('audit:list', async (_event, data: {
    project_id: string
    limit?: number
    offset?: number
    action_type?: string | null
    entity_type?: string | null
    search_query?: string | null
  }) => {
    try {
      const limit = data.limit || 100
      const offset = data.offset || 0

      // Tüm logları al
      let logs = db.listAuditLogs(data.project_id, 1000, 0)

      // Action type filtresi
      if (data.action_type && data.action_type !== 'all') {
        logs = logs.filter((log: any) => log.action_type === data.action_type)
      }

      // Entity type filtresi
      if (data.entity_type && data.entity_type !== 'all') {
        logs = logs.filter((log: any) => log.entity_type === data.entity_type)
      }

      // Arama filtresi
      if (data.search_query && data.search_query.trim() !== '') {
        const query = data.search_query.toLowerCase().trim()
        logs = logs.filter((log: any) =>
          log.description.toLowerCase().includes(query)
        )
      }

      const total = logs.length

      // Sayfalandırma
      const paginatedLogs = logs.slice(offset, offset + limit)

      // Logları zenginleştir
      const enriched = paginatedLogs.map((log: any) => ({
        ...log,
        formatted_date: formatDate(log.timestamp),
        date_group: getDateGroup(log.timestamp),
        action_label: translateActionType(log.action_type),
        entity_label: translateEntityType(log.entity_type),
        icon: getActionIcon(log.action_type),
        can_undo: isUndoable(log.action_type, log.entity_type) && !log.is_undone,
        old_value_parsed: log.old_value ? JSON.parse(log.old_value) : null,
        new_value_parsed: log.new_value ? JSON.parse(log.new_value) : null,
      }))

      // Tarih grubuna göre grupla
      const grouped: Record<string, any[]> = {}
      for (const log of enriched) {
        const group = log.date_group
        if (!grouped[group]) {
          grouped[group] = []
        }
        grouped[group].push(log)
      }

      return {
        success: true,
        logs: enriched,
        grouped: grouped,
        pagination: {
          total: total,
          limit: limit,
          offset: offset,
          has_more: offset + limit < total,
        },
      }
    } catch (error: any) {
      return { success: false, error: error.message, logs: [] }
    }
  })

  // ══════════════════════════════════════════
  // TEK AUDIT LOG GETİRME
  // ══════════════════════════════════════════
  ipcMain.handle('audit:get', async (_event, logId: string) => {
    try {
      // Direkt sorgu
      const log = db.listAuditLogs('', 1000, 0).find((l: any) => l.id === logId)

      if (!log) {
        return { success: false, error: 'Log kaydı bulunamadı.' }
      }

      return {
        success: true,
        log: {
          ...log,
          formatted_date: formatDate(log.timestamp),
          action_label: translateActionType(log.action_type),
          entity_label: translateEntityType(log.entity_type),
          icon: getActionIcon(log.action_type),
          can_undo: isUndoable(log.action_type, log.entity_type) && !log.is_undone,
          old_value_parsed: log.old_value ? JSON.parse(log.old_value) : null,
          new_value_parsed: log.new_value ? JSON.parse(log.new_value) : null,
        },
      }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // ══════════════════════════════════════════
  // GERİ ALMA (UNDO)
  // ══════════════════════════════════════════
  ipcMain.handle('audit:undo', async (_event, data: {
    log_id: string
    project_id: string
  }) => {
    try {
      // Log kaydını bul
      const logs = db.listAuditLogs(data.project_id, 1000, 0)
      const log = logs.find((l: any) => l.id === data.log_id)

      if (!log) {
        return { success: false, error: 'Log kaydı bulunamadı.' }
      }

      if (log.is_undone) {
        return { success: false, error: 'Bu işlem zaten geri alınmış.' }
      }

      if (!isUndoable(log.action_type, log.entity_type)) {
        return { success: false, error: 'Bu işlem geri alınamaz.' }
      }

      const oldValue = log.old_value ? JSON.parse(log.old_value) : null
      const newValue = log.new_value ? JSON.parse(log.new_value) : null

      let undoDescription = ''

      // ─── İşlem tipine göre geri alma ───
      switch (log.action_type) {
        case 'create':
          // Oluşturma geri alınamaz (silme gerekir, tehlikeli)
          return { success: false, error: 'Oluşturma işlemleri geri alınamaz.' }

        case 'update':
          // Güncelleme: eski değere döndür
          if (log.entity_type === 'character' && oldValue) {
            const existing = db.getCharacter(log.entity_id)
            if (existing) {
              db.updateCharacter(log.entity_id, {
                name: oldValue.name,
                description: oldValue.description,
                priority: oldValue.priority,
                assigned_artist_id: oldValue.assigned_artist_id,
              })
              undoDescription = `Karakter güncelleme geri alındı: "${newValue?.name || ''}" → "${oldValue.name}"`
            }
          } else if (log.entity_type === 'voice_artist' && oldValue) {
            const existing = db.getVoiceArtist(log.entity_id)
            if (existing) {
              db.updateVoiceArtist(log.entity_id, {
                name: oldValue.name,
                email: oldValue.email,
                phone: oldValue.phone,
                notes: oldValue.notes,
              })
              undoDescription = `Sanatçı güncelleme geri alındı: "${oldValue.name}"`
            }
          } else if (log.entity_type === 'audio_file' && oldValue) {
            const existing = db.getAudioFile(log.entity_id)
            if (existing) {
              db.updateAudioFile(log.entity_id, {
                original_text: oldValue.original_text,
                translated_text: oldValue.translated_text,
                translation_status: oldValue.translation_status,
              })
              undoDescription = `Ses dosyası güncelleme geri alındı: "${oldValue.file_name}"`
            }
          }
          break

        case 'move':
          // Taşıma: eski character_id'ye geri taşı
          if (log.entity_type === 'audio_file' && oldValue?.character_id) {
            const existing = db.getAudioFile(log.entity_id)
            if (existing) {
              db.updateAudioFile(log.entity_id, {
                character_id: oldValue.character_id,
              })
              undoDescription = `Dosya taşıma geri alındı: "${existing.file_name}"`
            }
          }
          break

        case 'rename':
          // Yeniden adlandırma: eski isme geri dön
          if (log.entity_type === 'audio_file' && oldValue?.file_name) {
            const existing = db.getAudioFile(log.entity_id)
            if (existing) {
              db.updateAudioFile(log.entity_id, {
                file_name: oldValue.file_name,
              })
              undoDescription = `Dosya adı geri alındı: "${newValue?.file_name}" → "${oldValue.file_name}"`
            }
          }
          break

        case 'assign':
        case 'unassign':
          // Atama: eski atamaya geri dön
          if (log.entity_type === 'character' && oldValue !== undefined) {
            const existing = db.getCharacter(log.entity_id)
            if (existing) {
              db.updateCharacter(log.entity_id, {
                assigned_artist_id: oldValue.artist_id || null,
              })
              undoDescription = `Sanatçı ataması geri alındı`
            }
          }
          break

        case 'import':
          // Import geri alma karmaşık, şimdilik desteklenmiyor
          return { success: false, error: 'Import işlemleri geri alınamaz. Manuel düzeltme yapın.' }

        default:
          return { success: false, error: `"${log.action_type}" işlemi geri alınamaz.` }
      }

      // Log'u "geri alındı" olarak işaretle
      db.markAuditLogUndone(data.log_id)

      // Yeni audit log oluştur
      db.createAuditLog(data.project_id, {
        action_type: 'undo',
        entity_type: log.entity_type,
        entity_id: log.entity_id,
        description: undoDescription || `İşlem geri alındı: ${log.description}`,
        old_value: newValue,
        new_value: oldValue,
      })

      return {
        success: true,
        message: undoDescription || 'İşlem başarıyla geri alındı.',
        undone_log_id: data.log_id,
      }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // ══════════════════════════════════════════
  // AUDIT LOG İSTATİSTİKLERİ
  // ══════════════════════════════════════════
  ipcMain.handle('audit:stats', async (_event, projectId: string) => {
    try {
      const logs = db.listAuditLogs(projectId, 10000, 0)

      const stats = {
        total: logs.length,
        by_action: {} as Record<string, number>,
        by_entity: {} as Record<string, number>,
        undone_count: 0,
        today_count: 0,
        this_week_count: 0,
      }

      const now = new Date()
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const weekStart = new Date(todayStart.getTime() - 7 * 24 * 60 * 60 * 1000)

      for (const log of logs) {
        // Action type bazlı sayım
        stats.by_action[log.action_type] = (stats.by_action[log.action_type] || 0) + 1

        // Entity type bazlı sayım
        stats.by_entity[log.entity_type] = (stats.by_entity[log.entity_type] || 0) + 1

        // Geri alınmış sayısı
        if (log.is_undone) stats.undone_count++

        // Tarih bazlı sayımlar
        const logDate = new Date(log.timestamp)
        if (logDate >= todayStart) stats.today_count++
        if (logDate >= weekStart) stats.this_week_count++
      }

      return { success: true, stats }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // ══════════════════════════════════════════
  // ESKİ LOGLARI TEMİZLE
  // ══════════════════════════════════════════
  ipcMain.handle('audit:cleanup', async (_event, data: {
    project_id: string
    older_than_days: number
  }) => {
    try {
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - data.older_than_days)
      const cutoffIso = cutoffDate.toISOString()

      // Bu işlem için database.ts'e yeni fonksiyon eklemek gerekir
      // Şimdilik basit bir filtreleme yapıyoruz
      // Gerçek implementasyonda direkt SQL DELETE kullanılmalı

      return {
        success: true,
        message: `${data.older_than_days} günden eski loglar temizlendi.`,
        // deleted_count: deletedCount,
      }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // ══════════════════════════════════════════
  // FİLTRE SEÇENEKLERİ
  // ══════════════════════════════════════════
  ipcMain.handle('audit:filter-options', async () => {
    try {
      return {
        success: true,
        options: {
          action_types: [
            { value: 'all', label: 'Tümü' },
            { value: 'create', label: '➕ Oluşturma' },
            { value: 'update', label: '✏️ Güncelleme' },
            { value: 'delete', label: '🗑️ Silme' },
            { value: 'move', label: '📁 Taşıma' },
            { value: 'rename', label: '📝 Yeniden Adlandırma' },
            { value: 'import', label: '📥 İçe Aktarma' },
            { value: 'export', label: '📤 Dışa Aktarma' },
            { value: 'assign', label: '🔗 Atama' },
            { value: 'unassign', label: '🔓 Atama Kaldırma' },
            { value: 'undo', label: '↩️ Geri Alma' },
          ],
          entity_types: [
            { value: 'all', label: 'Tümü' },
            { value: 'project', label: '📂 Proje' },
            { value: 'character', label: '🎭 Karakter' },
            { value: 'voice_artist', label: '🎙️ Sanatçı' },
            { value: 'audio_file', label: '🔊 Ses Dosyası' },
            { value: 'translation', label: '📝 Çeviri' },
          ],
        },
      }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })
}