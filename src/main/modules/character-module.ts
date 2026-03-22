// ============================================================
// DubLab — Karakter Modülü
// ============================================================
// Bu modül karakter oluşturma, düzenleme, silme,
// klasör senkronizasyonu ve sanatçı atama işlemlerini yönetir.
//
// Karakter oluşturulduğunda Originals/Recording/Mixed altında
// otomatik klasör oluşturulur. Karakter adı değiştiğinde
// 3 klasör de yeniden adlandırılır.
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
 * Karakter için 3 alt klasör oluşturur:
 * - Originals/KarakterAdı/
 * - Recording/KarakterAdı/
 * - Mixed/KarakterAdı/
 */
function createCharacterFolders(projectPath: string, characterName: string): {
  originals: string
  recording: string
  mixed: string
} {
  const sanitized = sanitizeFolderName(characterName)

  const paths = {
    originals: path.join(projectPath, 'Originals', sanitized),
    recording: path.join(projectPath, 'Recording', sanitized),
    mixed: path.join(projectPath, 'Mixed', sanitized),
  }

  for (const folderPath of Object.values(paths)) {
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true })
    }
  }

  return paths
}

/**
 * Karakter klasörlerini yeniden adlandırır.
 * Eski isimden yeni isme 3 klasörü birden rename eder.
 */
function renameCharacterFolders(
  projectPath: string,
  oldName: string,
  newName: string
): { success: boolean; error?: string } {
  const oldSanitized = sanitizeFolderName(oldName)
  const newSanitized = sanitizeFolderName(newName)

  if (oldSanitized === newSanitized) {
    return { success: true }
  }

  const categories = ['Originals', 'Recording', 'Mixed']
  const renamedPaths: Array<{ from: string; to: string }> = []

  try {
    for (const category of categories) {
      const oldPath = path.join(projectPath, category, oldSanitized)
      const newPath = path.join(projectPath, category, newSanitized)

      // Yeni isimde klasör zaten varsa hata
      if (fs.existsSync(newPath)) {
        // Önceki başarılı rename'leri geri al
        rollbackRenames(renamedPaths)
        return {
          success: false,
          error: `"${newName}" adında bir klasör ${category} içinde zaten mevcut.`,
        }
      }

      // Eski klasör varsa rename et
      if (fs.existsSync(oldPath)) {
        fs.renameSync(oldPath, newPath)
        renamedPaths.push({ from: oldPath, to: newPath })
      } else {
        // Eski klasör yoksa yeni isimle oluştur
        fs.mkdirSync(newPath, { recursive: true })
      }
    }

    return { success: true }
  } catch (error: any) {
    // Hata olursa önceki rename'leri geri al
    rollbackRenames(renamedPaths)
    return { success: false, error: error.message }
  }
}

/**
 * Başarısız rename işlemlerini geri alır
 */
function rollbackRenames(renamedPaths: Array<{ from: string; to: string }>): void {
  for (const entry of renamedPaths.reverse()) {
    try {
      if (fs.existsSync(entry.to)) {
        fs.renameSync(entry.to, entry.from)
      }
    } catch {
      // Geri alma da başarısız olursa sessizce devam et
    }
  }
}

/**
 * Karakter klasörlerini tamamen siler
 */
function deleteCharacterFolders(projectPath: string, characterName: string): void {
  const sanitized = sanitizeFolderName(characterName)
  const categories = ['Originals', 'Recording', 'Mixed']

  for (const category of categories) {
    const folderPath = path.join(projectPath, category, sanitized)
    if (fs.existsSync(folderPath)) {
      fs.rmSync(folderPath, { recursive: true, force: true })
    }
  }
}

/**
 * Klasör adında kullanılamayacak karakterleri temizler
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
 * Karakter klasörlerindeki dosya sayılarını döndürür
 */
function getCharacterFolderStats(projectPath: string, characterName: string): {
  originals_count: number
  recording_count: number
  mixed_count: number
} {
  const sanitized = sanitizeFolderName(characterName)
  const audioExtensions = ['.wav', '.mp3', '.ogg', '.flac']

  function countAudioFiles(dirPath: string): number {
    if (!fs.existsSync(dirPath)) return 0
    try {
      return fs.readdirSync(dirPath).filter(f => {
        const ext = path.extname(f).toLowerCase()
        return audioExtensions.includes(ext)
      }).length
    } catch {
      return 0
    }
  }

  return {
    originals_count: countAudioFiles(path.join(projectPath, 'Originals', sanitized)),
    recording_count: countAudioFiles(path.join(projectPath, 'Recording', sanitized)),
    mixed_count: countAudioFiles(path.join(projectPath, 'Mixed', sanitized)),
  }
}

// ────────────────────────────────────────────
// IPC HANDLER'LARI
// ────────────────────────────────────────────

export function registerCharacterHandlers(): void {

  // ══════════════════════════════════════════
  // KARAKTER OLUŞTURMA
  // ══════════════════════════════════════════
  ipcMain.handle('character:create', async (_event, data: {
    project_id: string
    project_path: string
    name: string
    description?: string
    priority?: string
    image_path?: string | null
  }) => {
    try {
      // 1. Aynı isimde karakter var mı kontrol et
      const existing = db.getCharacterByName(data.project_id, data.name)
      if (existing) {
        return {
          success: false,
          error: `"${data.name}" adında bir karakter zaten mevcut.`,
        }
      }

      // 2. Klasörleri oluştur
      const folders = createCharacterFolders(data.project_path, data.name)

      // 3. DB'ye kaydet
      const character = db.createCharacter(data.project_id, {
        name: data.name,
        description: data.description || '',
        priority: data.priority || 'npc',
        image_path: data.image_path || null,
      })

      // 4. Audit log
      db.createAuditLog(data.project_id, {
        action_type: 'create',
        entity_type: 'character',
        entity_id: character.id,
        description: `"${data.name}" karakteri oluşturuldu.`,
        new_value: character,
      })

      return {
        success: true,
        character: character,
        folders: folders,
      }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // ══════════════════════════════════════════
  // KARAKTER LİSTELEME
  // ══════════════════════════════════════════
  ipcMain.handle('character:list', async (_event, projectId: string) => {
    try {
      const characters = db.listCharacters(projectId)

      // Her karakter için ek bilgileri ekle
      const project = db.getFirstProject()
      const enriched = characters.map((char: any) => {
        // Atanmış sanatçı bilgisi
        let artist_name: string | null = null
        if (char.assigned_artist_id) {
          const artist = db.getVoiceArtist(char.assigned_artist_id)
          artist_name = artist ? artist.name : null
        }

        // Dosya sayısı
        const audioFiles = db.listAudioFilesByCharacter(char.id)
        const translated = audioFiles.filter((f: any) => f.translated_text && f.translated_text !== '').length
        const recorded = audioFiles.filter((f: any) => f.recording_path && f.recording_path !== '').length
        const mixed = audioFiles.filter((f: any) => f.mixed_path && f.mixed_path !== '').length

        return {
          ...char,
          artist_name,
          total_files: audioFiles.length,
          translated_count: translated,
          recorded_count: recorded,
          mixed_count: mixed,
        }
      })

      return { success: true, characters: enriched }
    } catch (error: any) {
      return { success: false, error: error.message, characters: [] }
    }
  })

  // ══════════════════════════════════════════
  // TEK KARAKTER GETİRME
  // ══════════════════════════════════════════
  ipcMain.handle('character:get', async (_event, characterId: string) => {
    try {
      const character = db.getCharacter(characterId)
      if (!character) {
        return { success: false, error: 'Karakter bulunamadı.' }
      }

      // Sanatçı bilgisi
      let artist_name: string | null = null
      if (character.assigned_artist_id) {
        const artist = db.getVoiceArtist(character.assigned_artist_id)
        artist_name = artist ? artist.name : null
      }

      // Dosya bilgileri
      const audioFiles = db.listAudioFilesByCharacter(characterId)
      const translated = audioFiles.filter((f: any) => f.translated_text && f.translated_text !== '').length
      const recorded = audioFiles.filter((f: any) => f.recording_path && f.recording_path !== '').length
      const mixed = audioFiles.filter((f: any) => f.mixed_path && f.mixed_path !== '').length

      return {
        success: true,
        character: {
          ...character,
          artist_name,
          total_files: audioFiles.length,
          translated_count: translated,
          recorded_count: recorded,
          mixed_count: mixed,
          audio_files: audioFiles,
        },
      }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // ══════════════════════════════════════════
  // KARAKTER GÜNCELLEME
  // ══════════════════════════════════════════
  ipcMain.handle('character:update', async (_event, data: {
    id: string
    project_id: string
    project_path: string
    updates: {
      name?: string
      description?: string
      priority?: string
      image_path?: string | null
    }
  }) => {
    try {
      const currentCharacter = db.getCharacter(data.id)
      if (!currentCharacter) {
        return { success: false, error: 'Karakter bulunamadı.' }
      }

      // İsim değişiyorsa klasörleri de güncelle
      if (data.updates.name && data.updates.name !== currentCharacter.name) {
        // Aynı isimde başka karakter var mı?
        const existing = db.getCharacterByName(data.project_id, data.updates.name)
        if (existing && existing.id !== data.id) {
          return {
            success: false,
            error: `"${data.updates.name}" adında bir karakter zaten mevcut.`,
          }
        }

        // Klasörleri yeniden adlandır
        const renameResult = renameCharacterFolders(
          data.project_path,
          currentCharacter.name,
          data.updates.name
        )

        if (!renameResult.success) {
          return { success: false, error: renameResult.error }
        }

        // DB'deki dosya yollarını güncelle
        const audioFiles = db.listAudioFilesByCharacter(data.id)
        const oldSanitized = sanitizeFolderName(currentCharacter.name)
        const newSanitized = sanitizeFolderName(data.updates.name)

        for (const file of audioFiles) {
          const pathUpdates: Record<string, any> = {}

          if (file.original_path) {
            pathUpdates.original_path = file.original_path.replace(
              path.join('Originals', oldSanitized),
              path.join('Originals', newSanitized)
            )
          }
          if (file.recording_path) {
            pathUpdates.recording_path = file.recording_path.replace(
              path.join('Recording', oldSanitized),
              path.join('Recording', newSanitized)
            )
          }
          if (file.mixed_path) {
            pathUpdates.mixed_path = file.mixed_path.replace(
              path.join('Mixed', oldSanitized),
              path.join('Mixed', newSanitized)
            )
          }

          if (Object.keys(pathUpdates).length > 0) {
            db.updateAudioFile(file.id, pathUpdates)
          }
        }
      }

      // DB'yi güncelle
      const oldValue = { ...currentCharacter }
      const updated = db.updateCharacter(data.id, data.updates)

      // Audit log
      db.createAuditLog(data.project_id, {
        action_type: 'update',
        entity_type: 'character',
        entity_id: data.id,
        description: data.updates.name && data.updates.name !== currentCharacter.name
          ? `Karakter adı değiştirildi: "${currentCharacter.name}" → "${data.updates.name}"`
          : `"${currentCharacter.name}" karakteri güncellendi.`,
        old_value: oldValue,
        new_value: updated,
      })

      return { success: true, character: updated }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // ══════════════════════════════════════════
  // KARAKTER SİLME
  // ══════════════════════════════════════════
  ipcMain.handle('character:delete', async (_event, data: {
    id: string
    project_id: string
    project_path: string
    delete_files: boolean
  }) => {
    try {
      const character = db.getCharacter(data.id)
      if (!character) {
        return { success: false, error: 'Karakter bulunamadı.' }
      }

      // Dosya sayısı bilgisi (uyarı için)
      const audioFiles = db.listAudioFilesByCharacter(data.id)

      // Klasörleri sil (kullanıcı isterse)
      if (data.delete_files) {
        deleteCharacterFolders(data.project_path, character.name)
      }

      // Audit log (silmeden önce kaydet)
      db.createAuditLog(data.project_id, {
        action_type: 'delete',
        entity_type: 'character',
        entity_id: data.id,
        description: `"${character.name}" karakteri silindi. (${audioFiles.length} ses dosyası)`,
        old_value: { character, audio_files_count: audioFiles.length },
      })

      // DB'den sil (cascade ile audio_files de silinir)
      db.deleteCharacter(data.id)

      return {
        success: true,
        deleted_name: character.name,
        deleted_files_count: audioFiles.length,
      }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // ══════════════════════════════════════════
  // KARAKTER-SANATÇI ATAMA
  // ══════════════════════════════════════════
  ipcMain.handle('character:assign-artist', async (_event, data: {
    character_id: string
    project_id: string
    artist_id: string | null
  }) => {
    try {
      const character = db.getCharacter(data.character_id)
      if (!character) {
        return { success: false, error: 'Karakter bulunamadı.' }
      }

      const oldArtistId = character.assigned_artist_id
      let oldArtistName: string | null = null
      let newArtistName: string | null = null

      if (oldArtistId) {
        const oldArtist = db.getVoiceArtist(oldArtistId)
        oldArtistName = oldArtist ? oldArtist.name : null
      }

      if (data.artist_id) {
        const newArtist = db.getVoiceArtist(data.artist_id)
        if (!newArtist) {
          return { success: false, error: 'Sanatçı bulunamadı.' }
        }
        newArtistName = newArtist.name
      }

      // DB güncelle
      const updated = db.updateCharacter(data.character_id, {
        assigned_artist_id: data.artist_id,
      })

      // Audit log
      const description = data.artist_id
        ? `"${character.name}" karakterine "${newArtistName}" atandı.`
        : `"${character.name}" karakterinden sanatçı ataması kaldırıldı.`

      db.createAuditLog(data.project_id, {
        action_type: data.artist_id ? 'assign' : 'unassign',
        entity_type: 'character',
        entity_id: data.character_id,
        description,
        old_value: { artist_id: oldArtistId, artist_name: oldArtistName },
        new_value: { artist_id: data.artist_id, artist_name: newArtistName },
      })

      return {
        success: true,
        character: updated,
        artist_name: newArtistName,
      }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // ══════════════════════════════════════════
  // ATANMAMIŞ KARAKTERLERİ LİSTELE
  // ══════════════════════════════════════════
  ipcMain.handle('character:list-unassigned', async (_event, projectId: string) => {
    try {
      const characters = db.getUnassignedCharacters(projectId)
      return { success: true, characters }
    } catch (error: any) {
      return { success: false, error: error.message, characters: [] }
    }
  })

  // ══════════════════════════════════════════
  // KARAKTER KLASÖR İSTATİSTİKLERİ
  // ══════════════════════════════════════════
  ipcMain.handle('character:folder-stats', async (_event, data: {
    project_path: string
    character_name: string
  }) => {
    try {
      const stats = getCharacterFolderStats(data.project_path, data.character_name)
      return { success: true, stats }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })
}