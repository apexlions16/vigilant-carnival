// ============================================================
// DubLab — Seslendirme Sanatçısı Modülü
// ============================================================
// Bu modül seslendirme sanatçısı ekleme, düzenleme, silme
// ve iş yükü görüntüleme işlemlerini yönetir.
//
// Bağımlılıklar: database.ts (sadece import)
// Başka modüllere bağımlılığı YOKTUR.
// ============================================================

import { ipcMain } from 'electron'
import * as db from '../database'

// ────────────────────────────────────────────
// IPC HANDLER'LARI
// ────────────────────────────────────────────

export function registerArtistHandlers(): void {

  // ══════════════════════════════════════════
  // SANATÇI OLUŞTURMA
  // ══════════════════════════════════════════
  ipcMain.handle('artist:create', async (_event, data: {
    project_id: string
    name: string
    email?: string | null
    phone?: string | null
    notes?: string | null
  }) => {
    try {
      // Aynı isimde sanatçı var mı kontrol et
      const existingArtists = db.listVoiceArtists(data.project_id)
      const duplicate = existingArtists.find(
        (a: any) => a.name.toLowerCase() === data.name.toLowerCase()
      )
      if (duplicate) {
        return {
          success: false,
          error: `"${data.name}" adında bir sanatçı zaten mevcut.`,
        }
      }

      // DB'ye kaydet
      const artist = db.createVoiceArtist(data.project_id, {
        name: data.name,
        email: data.email || null,
        phone: data.phone || null,
        notes: data.notes || null,
      })

      // Audit log
      db.createAuditLog(data.project_id, {
        action_type: 'create',
        entity_type: 'voice_artist',
        entity_id: artist.id,
        description: `"${data.name}" sanatçısı eklendi.`,
        new_value: artist,
      })

      return { success: true, artist }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // ══════════════════════════════════════════
  // SANATÇI LİSTELEME
  // ══════════════════════════════════════════
  ipcMain.handle('artist:list', async (_event, projectId: string) => {
    try {
      const artists = db.listVoiceArtists(projectId)

      // Her sanatçı için atanmış karakter sayısını hesapla
      const characters = db.listCharacters(projectId)

      const enriched = artists.map((artist: any) => {
        const assignedChars = characters.filter(
          (c: any) => c.assigned_artist_id === artist.id
        )

        // Toplam satır sayısı
        let totalLines = 0
        let recordedLines = 0

        for (const char of assignedChars) {
          const audioFiles = db.listAudioFilesByCharacter(char.id)
          totalLines += audioFiles.length
          recordedLines += audioFiles.filter(
            (f: any) => f.recording_path && f.recording_path !== ''
          ).length
        }

        return {
          ...artist,
          assigned_characters: assignedChars.length,
          assigned_character_names: assignedChars.map((c: any) => c.name),
          total_lines: totalLines,
          recorded_lines: recordedLines,
          remaining_lines: totalLines - recordedLines,
          progress_percent: totalLines > 0
            ? Math.round((recordedLines / totalLines) * 100)
            : 0,
        }
      })

      return { success: true, artists: enriched }
    } catch (error: any) {
      return { success: false, error: error.message, artists: [] }
    }
  })

  // ══════════════════════════════════════════
  // TEK SANATÇI GETİRME
  // ══════════════════════════════════════════
  ipcMain.handle('artist:get', async (_event, artistId: string) => {
    try {
      const artist = db.getVoiceArtist(artistId)
      if (!artist) {
        return { success: false, error: 'Sanatçı bulunamadı.' }
      }

      // Atanmış karakterleri bul
      const allCharacters = db.listCharacters(artist.project_id)
      const assignedCharacters = allCharacters.filter(
        (c: any) => c.assigned_artist_id === artistId
      )

      // Her karakter için dosya bilgisi
      const characterDetails = assignedCharacters.map((char: any) => {
        const audioFiles = db.listAudioFilesByCharacter(char.id)
        const recorded = audioFiles.filter(
          (f: any) => f.recording_path && f.recording_path !== ''
        ).length

        return {
          id: char.id,
          name: char.name,
          priority: char.priority,
          total_lines: audioFiles.length,
          recorded_lines: recorded,
          remaining_lines: audioFiles.length - recorded,
          progress_percent: audioFiles.length > 0
            ? Math.round((recorded / audioFiles.length) * 100)
            : 0,
        }
      })

      // Toplam istatistikler
      const totalLines = characterDetails.reduce((sum, c) => sum + c.total_lines, 0)
      const totalRecorded = characterDetails.reduce((sum, c) => sum + c.recorded_lines, 0)

      return {
        success: true,
        artist: {
          ...artist,
          assigned_characters: characterDetails,
          total_lines: totalLines,
          recorded_lines: totalRecorded,
          remaining_lines: totalLines - totalRecorded,
          progress_percent: totalLines > 0
            ? Math.round((totalRecorded / totalLines) * 100)
            : 0,
        },
      }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // ══════════════════════════════════════════
  // SANATÇI GÜNCELLEME
  // ══════════════════════════════════════════
  ipcMain.handle('artist:update', async (_event, data: {
    id: string
    project_id: string
    updates: {
      name?: string
      email?: string | null
      phone?: string | null
      notes?: string | null
    }
  }) => {
    try {
      const currentArtist = db.getVoiceArtist(data.id)
      if (!currentArtist) {
        return { success: false, error: 'Sanatçı bulunamadı.' }
      }

      // İsim değişiyorsa aynı isimde başka sanatçı var mı kontrol et
      if (data.updates.name && data.updates.name !== currentArtist.name) {
        const existingArtists = db.listVoiceArtists(data.project_id)
        const duplicate = existingArtists.find(
          (a: any) => a.name.toLowerCase() === data.updates.name!.toLowerCase() && a.id !== data.id
        )
        if (duplicate) {
          return {
            success: false,
            error: `"${data.updates.name}" adında bir sanatçı zaten mevcut.`,
          }
        }
      }

      const oldValue = { ...currentArtist }
      const updated = db.updateVoiceArtist(data.id, data.updates)

      // Audit log
      db.createAuditLog(data.project_id, {
        action_type: 'update',
        entity_type: 'voice_artist',
        entity_id: data.id,
        description: data.updates.name && data.updates.name !== currentArtist.name
          ? `Sanatçı adı değiştirildi: "${currentArtist.name}" → "${data.updates.name}"`
          : `"${currentArtist.name}" sanatçısı güncellendi.`,
        old_value: oldValue,
        new_value: updated,
      })

      return { success: true, artist: updated }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // ══════════════════════════════════════════
  // SANATÇI SİLME
  // ══════════════════════════════════════════
  ipcMain.handle('artist:delete', async (_event, data: {
    id: string
    project_id: string
  }) => {
    try {
      const artist = db.getVoiceArtist(data.id)
      if (!artist) {
        return { success: false, error: 'Sanatçı bulunamadı.' }
      }

      // Kaç karaktere atanmış?
      const allCharacters = db.listCharacters(data.project_id)
      const assignedCount = allCharacters.filter(
        (c: any) => c.assigned_artist_id === data.id
      ).length

      // Audit log (silmeden önce)
      db.createAuditLog(data.project_id, {
        action_type: 'delete',
        entity_type: 'voice_artist',
        entity_id: data.id,
        description: `"${artist.name}" sanatçısı silindi. (${assignedCount} karakter ataması kaldırıldı)`,
        old_value: { artist, assigned_characters_count: assignedCount },
      })

      // DB'den sil (assigned_artist_id otomatik NULL olur)
      db.deleteVoiceArtist(data.id)

      return {
        success: true,
        deleted_name: artist.name,
        unassigned_characters: assignedCount,
      }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // ══════════════════════════════════════════
  // SANATÇI İŞ YÜKÜ RAPORU
  // ══════════════════════════════════════════
  ipcMain.handle('artist:workload', async (_event, projectId: string) => {
    try {
      const workload = db.getArtistWorkload(projectId)
      return { success: true, workload }
    } catch (error: any) {
      return { success: false, error: error.message, workload: [] }
    }
  })

  // ══════════════════════════════════════════
  // TOPLU SANATÇI ATAMA
  // ══════════════════════════════════════════
  ipcMain.handle('artist:bulk-assign', async (_event, data: {
    project_id: string
    assignments: Array<{
      character_id: string
      artist_id: string | null
    }>
  }) => {
    try {
      const results: Array<{
        character_id: string
        success: boolean
        error?: string
      }> = []

      for (const assignment of data.assignments) {
        const character = db.getCharacter(assignment.character_id)
        if (!character) {
          results.push({
            character_id: assignment.character_id,
            success: false,
            error: 'Karakter bulunamadı.',
          })
          continue
        }

        if (assignment.artist_id) {
          const artist = db.getVoiceArtist(assignment.artist_id)
          if (!artist) {
            results.push({
              character_id: assignment.character_id,
              success: false,
              error: 'Sanatçı bulunamadı.',
            })
            continue
          }
        }

        db.updateCharacter(assignment.character_id, {
          assigned_artist_id: assignment.artist_id,
        })

        results.push({
          character_id: assignment.character_id,
          success: true,
        })
      }

      const successCount = results.filter(r => r.success).length

      // Toplu audit log
      db.createAuditLog(data.project_id, {
        action_type: 'assign',
        entity_type: 'voice_artist',
        entity_id: 'bulk',
        description: `Toplu sanatçı ataması yapıldı. (${successCount}/${data.assignments.length} başarılı)`,
        new_value: data.assignments,
      })

      return {
        success: true,
        results,
        total: data.assignments.length,
        successful: successCount,
        failed: data.assignments.length - successCount,
      }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })
}