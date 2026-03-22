// ============================================================
// DubLab — Veritabanı Servisi (SQLite)
// ============================================================
// Bu dosya tüm veritabanı işlemlerini yönetir.
// Her proje kendi .db dosyasına sahiptir.
// Bağımlılıklar: better-sqlite3, uuid
// ============================================================

import Database from 'better-sqlite3'
import { v4 as uuidv4 } from 'uuid'

let db: Database.Database | null = null

// ────────────────────────────────────────────
// BAĞLANTI YÖNETİMİ
// ────────────────────────────────────────────

export function openDatabase(dbPath: string): void {
  if (db) closeDatabase()
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  createTables()
}

export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
  }
}

export function isDatabaseOpen(): boolean {
  return db !== null
}

function getDb(): Database.Database {
  if (!db) throw new Error('Veritabanı açık değil. Önce bir proje açın.')
  return db
}

function now(): string {
  return new Date().toISOString()
}

// ────────────────────────────────────────────
// TABLO OLUŞTURMA
// ────────────────────────────────────────────

function createTables(): void {
  const d = getDb()

  d.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      game_title TEXT NOT NULL,
      source_language TEXT NOT NULL DEFAULT 'en',
      target_language TEXT NOT NULL DEFAULT 'tr',
      project_path TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS voice_artists (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS characters (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      priority TEXT NOT NULL DEFAULT 'npc',
      image_path TEXT,
      assigned_artist_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (assigned_artist_id) REFERENCES voice_artists(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS audio_files (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      character_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      original_path TEXT,
      recording_path TEXT,
      mixed_path TEXT,
      original_text TEXT,
      translated_text TEXT,
      translation_status TEXT NOT NULL DEFAULT 'empty',
      recording_status TEXT NOT NULL DEFAULT 'not_recorded',
      mixing_status TEXT NOT NULL DEFAULT 'not_mixed',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      action_type TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      old_value TEXT,
      new_value TEXT,
      description TEXT NOT NULL,
      is_undone INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_characters_project ON characters(project_id);
    CREATE INDEX IF NOT EXISTS idx_audio_project ON audio_files(project_id);
    CREATE INDEX IF NOT EXISTS idx_audio_character ON audio_files(character_id);
    CREATE INDEX IF NOT EXISTS idx_audio_filename ON audio_files(file_name);
    CREATE INDEX IF NOT EXISTS idx_audit_project ON audit_logs(project_id);
    CREATE INDEX IF NOT EXISTS idx_artists_project ON voice_artists(project_id);
  `)
}

// ────────────────────────────────────────────
// PROJE CRUD
// ────────────────────────────────────────────

export function createProject(data: {
  name: string
  game_title: string
  source_language: string
  target_language: string
  project_path: string
}): any {
  const id = uuidv4()
  const timestamp = now()
  getDb().prepare(`
    INSERT INTO projects (id, name, game_title, source_language, target_language, project_path, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)
  `).run(id, data.name, data.game_title, data.source_language, data.target_language, data.project_path, timestamp, timestamp)
  return getDb().prepare('SELECT * FROM projects WHERE id = ?').get(id)
}

export function getProject(id: string): any {
  return getDb().prepare('SELECT * FROM projects WHERE id = ?').get(id)
}

export function getFirstProject(): any {
  return getDb().prepare('SELECT * FROM projects LIMIT 1').get()
}

export function updateProject(id: string, data: Record<string, any>): any {
  const allowed = ['name', 'game_title', 'source_language', 'target_language', 'status']
  const fields: string[] = []
  const values: any[] = []

  for (const key of allowed) {
    if (data[key] !== undefined) {
      fields.push(`${key} = ?`)
      values.push(data[key])
    }
  }
  if (fields.length === 0) return getProject(id)

  fields.push('updated_at = ?')
  values.push(now(), id)

  getDb().prepare(`UPDATE projects SET ${fields.join(', ')} WHERE id = ?`).run(...values)
  return getProject(id)
}

export function deleteProject(id: string): void {
  getDb().prepare('DELETE FROM projects WHERE id = ?').run(id)
}

// ────────────────────────────────────────────
// KARAKTER CRUD
// ────────────────────────────────────────────

export function createCharacter(projectId: string, data: {
  name: string
  description?: string
  priority?: string
  image_path?: string | null
}): any {
  const id = uuidv4()
  const timestamp = now()
  getDb().prepare(`
    INSERT INTO characters (id, project_id, name, description, priority, image_path, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, projectId, data.name, data.description || '', data.priority || 'npc', data.image_path || null, timestamp, timestamp)
  return getDb().prepare('SELECT * FROM characters WHERE id = ?').get(id)
}

export function getCharacter(id: string): any {
  return getDb().prepare('SELECT * FROM characters WHERE id = ?').get(id)
}

export function listCharacters(projectId: string): any[] {
  return getDb().prepare('SELECT * FROM characters WHERE project_id = ? ORDER BY created_at ASC').all(projectId)
}

export function updateCharacter(id: string, data: Record<string, any>): any {
  const allowed = ['name', 'description', 'priority', 'image_path', 'assigned_artist_id']
  const fields: string[] = []
  const values: any[] = []

  for (const key of allowed) {
    if (data[key] !== undefined) {
      fields.push(`${key} = ?`)
      values.push(data[key])
    }
  }
  if (fields.length === 0) return getCharacter(id)

  fields.push('updated_at = ?')
  values.push(now(), id)

  getDb().prepare(`UPDATE characters SET ${fields.join(', ')} WHERE id = ?`).run(...values)
  return getCharacter(id)
}

export function deleteCharacter(id: string): void {
  getDb().prepare('DELETE FROM characters WHERE id = ?').run(id)
}

export function getCharacterByName(projectId: string, name: string): any {
  return getDb().prepare('SELECT * FROM characters WHERE project_id = ? AND name = ?').get(projectId, name)
}

// ────────────────────────────────────────────
// SESLENDİRME SANATÇISI CRUD
// ────────────────────────────────────────────

export function createVoiceArtist(projectId: string, data: {
  name: string
  email?: string | null
  phone?: string | null
  notes?: string | null
}): any {
  const id = uuidv4()
  getDb().prepare(`
    INSERT INTO voice_artists (id, project_id, name, email, phone, notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, projectId, data.name, data.email || null, data.phone || null, data.notes || null, now())
  return getDb().prepare('SELECT * FROM voice_artists WHERE id = ?').get(id)
}

export function getVoiceArtist(id: string): any {
  return getDb().prepare('SELECT * FROM voice_artists WHERE id = ?').get(id)
}

export function listVoiceArtists(projectId: string): any[] {
  return getDb().prepare('SELECT * FROM voice_artists WHERE project_id = ? ORDER BY name ASC').all(projectId)
}

export function updateVoiceArtist(id: string, data: Record<string, any>): any {
  const allowed = ['name', 'email', 'phone', 'notes']
  const fields: string[] = []
  const values: any[] = []

  for (const key of allowed) {
    if (data[key] !== undefined) {
      fields.push(`${key} = ?`)
      values.push(data[key])
    }
  }
  if (fields.length === 0) return getVoiceArtist(id)
  values.push(id)

  getDb().prepare(`UPDATE voice_artists SET ${fields.join(', ')} WHERE id = ?`).run(...values)
  return getVoiceArtist(id)
}

export function deleteVoiceArtist(id: string): void {
  // Atanmış karakterlerdeki referansı temizle
  getDb().prepare('UPDATE characters SET assigned_artist_id = NULL WHERE assigned_artist_id = ?').run(id)
  getDb().prepare('DELETE FROM voice_artists WHERE id = ?').run(id)
}

// ────────────────────────────────────────────
// SES DOSYASI CRUD
// ────────────────────────────────────────────

export function createAudioFile(projectId: string, data: {
  character_id: string
  file_name: string
  original_path?: string | null
  recording_path?: string | null
  mixed_path?: string | null
}): any {
  const id = uuidv4()
  const timestamp = now()
  getDb().prepare(`
    INSERT INTO audio_files (id, project_id, character_id, file_name, original_path, recording_path, mixed_path, translation_status, recording_status, mixing_status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'empty', 'not_recorded', 'not_mixed', ?, ?)
  `).run(id, projectId, data.character_id, data.file_name, data.original_path || null, data.recording_path || null, data.mixed_path || null, timestamp, timestamp)
  return getDb().prepare('SELECT * FROM audio_files WHERE id = ?').get(id)
}

export function getAudioFile(id: string): any {
  return getDb().prepare('SELECT * FROM audio_files WHERE id = ?').get(id)
}

export function listAudioFilesByCharacter(characterId: string): any[] {
  return getDb().prepare('SELECT * FROM audio_files WHERE character_id = ? ORDER BY file_name ASC').all(characterId)
}

export function listAudioFilesByProject(projectId: string): any[] {
  return getDb().prepare('SELECT * FROM audio_files WHERE project_id = ? ORDER BY file_name ASC').all(projectId)
}

export function getAudioFileByFileName(projectId: string, fileName: string): any {
  return getDb().prepare('SELECT * FROM audio_files WHERE project_id = ? AND file_name = ?').get(projectId, fileName)
}

export function getAudioFileByPath(originalPath: string): any {
  return getDb().prepare('SELECT * FROM audio_files WHERE original_path = ?').get(originalPath)
}

export function updateAudioFile(id: string, data: Record<string, any>): any {
  const allowed = [
    'character_id', 'file_name',
    'original_path', 'recording_path', 'mixed_path',
    'original_text', 'translated_text',
    'translation_status', 'recording_status', 'mixing_status'
  ]
  const fields: string[] = []
  const values: any[] = []

  for (const key of allowed) {
    if (data[key] !== undefined) {
      fields.push(`${key} = ?`)
      values.push(data[key])
    }
  }
  if (fields.length === 0) return getAudioFile(id)

  // Çeviri durumunu otomatik hesapla
  if (data.translated_text !== undefined || data.original_text !== undefined) {
    const current = getAudioFile(id)
    const origText = data.original_text !== undefined ? data.original_text : current?.original_text
    const transText = data.translated_text !== undefined ? data.translated_text : current?.translated_text

    let status = 'empty'
    if (origText && !transText) status = 'has_original'
    else if (origText && transText) status = 'translated'
    if (!fields.some(f => f.startsWith('translation_status'))) {
      fields.push('translation_status = ?')
      values.push(status)
    }
  }

  // Recording durumunu otomatik hesapla
  if (data.recording_path !== undefined) {
    const recStatus = data.recording_path ? 'recorded' : 'not_recorded'
    if (!fields.some(f => f.startsWith('recording_status'))) {
      fields.push('recording_status = ?')
      values.push(recStatus)
    }
  }

  // Mixing durumunu otomatik hesapla
  if (data.mixed_path !== undefined) {
    const mixStatus = data.mixed_path ? 'mixed' : 'not_mixed'
    if (!fields.some(f => f.startsWith('mixing_status'))) {
      fields.push('mixing_status = ?')
      values.push(mixStatus)
    }
  }

  fields.push('updated_at = ?')
  values.push(now(), id)

  getDb().prepare(`UPDATE audio_files SET ${fields.join(', ')} WHERE id = ?`).run(...values)
  return getAudioFile(id)
}

export function deleteAudioFile(id: string): void {
  getDb().prepare('DELETE FROM audio_files WHERE id = ?').run(id)
}

export function moveAudioFileToCharacter(audioFileId: string, newCharacterId: string): any {
  getDb().prepare(`
    UPDATE audio_files SET character_id = ?, updated_at = ? WHERE id = ?
  `).run(newCharacterId, now(), audioFileId)
  return getAudioFile(audioFileId)
}

export function bulkUpdateAudioFilePaths(updates: Array<{ id: string; field: string; value: string | null }>): void {
  const stmt = getDb().prepare(`UPDATE audio_files SET ${updates[0]?.field || 'updated_at'} = ?, updated_at = ? WHERE id = ?`)
  const transaction = getDb().transaction(() => {
    const timestamp = now()
    for (const u of updates) {
      getDb().prepare(`UPDATE audio_files SET ${u.field} = ?, updated_at = ? WHERE id = ?`).run(u.value, timestamp, u.id)
    }
  })
  transaction()
}

// ────────────────────────────────────────────
// AUDIT LOG
// ────────────────────────────────────────────

export function createAuditLog(projectId: string, data: {
  action_type: string
  entity_type: string
  entity_id: string
  description: string
  old_value?: any
  new_value?: any
}): any {
  const id = uuidv4()
  getDb().prepare(`
    INSERT INTO audit_logs (id, project_id, timestamp, action_type, entity_type, entity_id, old_value, new_value, description, is_undone)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
  `).run(
    id, projectId, now(), data.action_type, data.entity_type, data.entity_id,
    data.old_value ? JSON.stringify(data.old_value) : null,
    data.new_value ? JSON.stringify(data.new_value) : null,
    data.description
  )
  return getDb().prepare('SELECT * FROM audit_logs WHERE id = ?').get(id)
}

export function listAuditLogs(projectId: string, limit: number = 100, offset: number = 0): any[] {
  return getDb().prepare(
    'SELECT * FROM audit_logs WHERE project_id = ? ORDER BY timestamp DESC LIMIT ? OFFSET ?'
  ).all(projectId, limit, offset)
}

export function markAuditLogUndone(id: string): void {
  getDb().prepare('UPDATE audit_logs SET is_undone = 1 WHERE id = ?').run(id)
}

// ────────────────────────────────────────────
// İLERLEME HESAPLAMA
// ────────────────────────────────────────────

export function getProjectProgress(projectId: string): {
  total_files: number
  translated_count: number
  recorded_count: number
  mixed_count: number
  translation_percent: number
  recording_percent: number
  mixing_percent: number
  overall_percent: number
} {
  const row: any = getDb().prepare(`
    SELECT
      COUNT(*) as total_files,
      SUM(CASE WHEN translated_text IS NOT NULL AND translated_text != '' THEN 1 ELSE 0 END) as translated_count,
      SUM(CASE WHEN recording_path IS NOT NULL AND recording_path != '' THEN 1 ELSE 0 END) as recorded_count,
      SUM(CASE WHEN mixed_path IS NOT NULL AND mixed_path != '' THEN 1 ELSE 0 END) as mixed_count
    FROM audio_files WHERE project_id = ?
  `).get(projectId)

  const total = row?.total_files || 0
  const translated = row?.translated_count || 0
  const recorded = row?.recorded_count || 0
  const mixed = row?.mixed_count || 0

  return {
    total_files: total,
    translated_count: translated,
    recorded_count: recorded,
    mixed_count: mixed,
    translation_percent: total > 0 ? Math.round((translated / total) * 100) : 0,
    recording_percent: total > 0 ? Math.round((recorded / total) * 100) : 0,
    mixing_percent: total > 0 ? Math.round((mixed / total) * 100) : 0,
    overall_percent: total > 0 ? Math.round(((translated + recorded + mixed) / (total * 3)) * 100) : 0,
  }
}

export function getCharacterProgress(projectId: string): Array<{
  character_id: string
  character_name: string
  priority: string
  assigned_artist: string | null
  total_files: number
  translated_count: number
  recorded_count: number
  mixed_count: number
  translation_percent: number
  recording_percent: number
  mixing_percent: number
}> {
  const rows: any[] = getDb().prepare(`
    SELECT
      c.id as character_id,
      c.name as character_name,
      c.priority,
      va.name as assigned_artist,
      COUNT(af.id) as total_files,
      SUM(CASE WHEN af.translated_text IS NOT NULL AND af.translated_text != '' THEN 1 ELSE 0 END) as translated_count,
      SUM(CASE WHEN af.recording_path IS NOT NULL AND af.recording_path != '' THEN 1 ELSE 0 END) as recorded_count,
      SUM(CASE WHEN af.mixed_path IS NOT NULL AND af.mixed_path != '' THEN 1 ELSE 0 END) as mixed_count
    FROM characters c
    LEFT JOIN audio_files af ON af.character_id = c.id
    LEFT JOIN voice_artists va ON va.id = c.assigned_artist_id
    WHERE c.project_id = ?
    GROUP BY c.id
    ORDER BY c.name ASC
  `).all(projectId)

  return rows.map(r => {
    const total = r.total_files || 0
    return {
      ...r,
      translation_percent: total > 0 ? Math.round((r.translated_count / total) * 100) : 0,
      recording_percent: total > 0 ? Math.round((r.recorded_count / total) * 100) : 0,
      mixing_percent: total > 0 ? Math.round((r.mixed_count / total) * 100) : 0,
    }
  })
}

export function getArtistWorkload(projectId: string): Array<{
  artist_id: string
  artist_name: string
  assigned_characters: number
  total_lines: number
  recorded_lines: number
  remaining_lines: number
  progress_percent: number
}> {
  const rows: any[] = getDb().prepare(`
    SELECT
      va.id as artist_id,
      va.name as artist_name,
      COUNT(DISTINCT c.id) as assigned_characters,
      COUNT(af.id) as total_lines,
      SUM(CASE WHEN af.recording_path IS NOT NULL AND af.recording_path != '' THEN 1 ELSE 0 END) as recorded_lines
    FROM voice_artists va
    LEFT JOIN characters c ON c.assigned_artist_id = va.id
    LEFT JOIN audio_files af ON af.character_id = c.id
    WHERE va.project_id = ?
    GROUP BY va.id
    ORDER BY va.name ASC
  `).all(projectId)

  return rows.map(r => ({
    ...r,
    remaining_lines: (r.total_lines || 0) - (r.recorded_lines || 0),
    progress_percent: r.total_lines > 0 ? Math.round((r.recorded_lines / r.total_lines) * 100) : 0,
  }))
}

// ────────────────────────────────────────────
// YARDIMCI SORGULAR
// ────────────────────────────────────────────

export function getUnassignedCharacters(projectId: string): any[] {
  return getDb().prepare(
    'SELECT * FROM characters WHERE project_id = ? AND assigned_artist_id IS NULL ORDER BY name ASC'
  ).all(projectId)
}

export function getUntranslatedCount(projectId: string): number {
  const row: any = getDb().prepare(
    "SELECT COUNT(*) as count FROM audio_files WHERE project_id = ? AND (translated_text IS NULL OR translated_text = '')"
  ).get(projectId)
  return row?.count || 0
}

export function getUnrecordedCount(projectId: string): number {
  const row: any = getDb().prepare(
    "SELECT COUNT(*) as count FROM audio_files WHERE project_id = ? AND (recording_path IS NULL OR recording_path = '')"
  ).get(projectId)
  return row?.count || 0
}

export function searchAudioFiles(projectId: string, query: string): any[] {
  const like = `%${query}%`
  return getDb().prepare(`
    SELECT af.*, c.name as character_name
    FROM audio_files af
    JOIN characters c ON c.id = af.character_id
    WHERE af.project_id = ?
      AND (af.file_name LIKE ? OR af.original_text LIKE ? OR af.translated_text LIKE ?)
    ORDER BY af.file_name ASC
    LIMIT 100
  `).all(projectId, like, like, like)
}

export function getDatabaseStats(projectId: string): {
  total_characters: number
  total_artists: number
  total_files: number
  total_translations: number
} {
  const chars: any = getDb().prepare('SELECT COUNT(*) as c FROM characters WHERE project_id = ?').get(projectId)
  const artists: any = getDb().prepare('SELECT COUNT(*) as c FROM voice_artists WHERE project_id = ?').get(projectId)
  const files: any = getDb().prepare('SELECT COUNT(*) as c FROM audio_files WHERE project_id = ?').get(projectId)
  const trans: any = getDb().prepare(
    "SELECT COUNT(*) as c FROM audio_files WHERE project_id = ? AND translated_text IS NOT NULL AND translated_text != ''"
  ).get(projectId)

  return {
    total_characters: chars?.c || 0,
    total_artists: artists?.c || 0,
    total_files: files?.c || 0,
    total_translations: trans?.c || 0,
  }
}