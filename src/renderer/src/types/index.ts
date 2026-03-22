// ============================================================
// DubLab - Oyun Dublaj Pipeline Yönetim Sistemi
// Tip Tanımları
// ============================================================
// Bu dosya tüm TypeScript interface ve type tanımlarını içerir.
// Hiçbir dış bağımlılığı yoktur. Tek başına çalışır.
// ============================================================

// ────────────────────────────────────────────
// PROJE
// ────────────────────────────────────────────

export interface Project {
  id: string
  name: string
  game_title: string
  source_language: string
  target_language: string
  project_path: string
  status: ProjectStatus
  created_at: string
  updated_at: string
}

export type ProjectStatus = 'active' | 'paused' | 'completed'

export interface CreateProjectInput {
  name: string
  game_title: string
  source_language: string
  target_language: string
  project_path: string
}

// ────────────────────────────────────────────
// KARAKTER
// ────────────────────────────────────────────

export interface Character {
  id: string
  project_id: string
  name: string
  description: string
  priority: CharacterPriority
  image_path: string | null
  assigned_artist_id: string | null
  created_at: string
  updated_at: string
}

export type CharacterPriority = 'main' | 'supporting' | 'npc' | 'extra'

export interface CreateCharacterInput {
  name: string
  description?: string
  priority?: CharacterPriority
  image_path?: string | null
}

// ────────────────────────────────────────────
// SESLENDİRME SANATÇISI
// ────────────────────────────────────────────

export interface VoiceArtist {
  id: string
  project_id: string
  name: string
  email: string | null
  phone: string | null
  notes: string | null
  created_at: string
}

export interface CreateVoiceArtistInput {
  name: string
  email?: string | null
  phone?: string | null
  notes?: string | null
}

// ────────────────────────────────────────────
// SES DOSYASI
// ────────────────────────────────────────────

export interface AudioFile {
  id: string
  project_id: string
  character_id: string
  file_name: string
  original_path: string | null
  recording_path: string | null
  mixed_path: string | null
  original_text: string | null
  translated_text: string | null
  translation_status: TranslationStatus
  recording_status: RecordingStatus
  mixing_status: MixingStatus
  created_at: string
  updated_at: string
}

export type TranslationStatus = 'empty' | 'has_original' | 'translated' | 'reviewed'
export type RecordingStatus = 'not_recorded' | 'recorded' | 'approved'
export type MixingStatus = 'not_mixed' | 'mixed' | 'approved'

export interface CreateAudioFileInput {
  character_id: string
  file_name: string
  original_path?: string | null
  recording_path?: string | null
  mixed_path?: string | null
}

// ────────────────────────────────────────────
// AUDIT LOG
// ────────────────────────────────────────────

export interface AuditLog {
  id: string
  timestamp: string
  action_type: AuditActionType
  entity_type: EntityType
  entity_id: string
  old_value: string | null
  new_value: string | null
  description: string
  is_undone: boolean
}

export type AuditActionType =
  | 'create'
  | 'update'
  | 'delete'
  | 'move'
  | 'rename'
  | 'import'
  | 'export'
  | 'assign'
  | 'unassign'
  | 'undo'

export type EntityType =
  | 'project'
  | 'character'
  | 'voice_artist'
  | 'audio_file'
  | 'translation'

// ────────────────────────────────────────────
// İLERLEME VE İSTATİSTİK
// ────────────────────────────────────────────

export interface ProjectProgress {
  total_files: number
  translated_count: number
  recorded_count: number
  mixed_count: number
  translation_percent: number
  recording_percent: number
  mixing_percent: number
  overall_percent: number
}

export interface CharacterProgress {
  character_id: string
  character_name: string
  assigned_artist: string | null
  priority: CharacterPriority
  total_files: number
  translated_count: number
  recorded_count: number
  mixed_count: number
  translation_percent: number
  recording_percent: number
  mixing_percent: number
}

export interface ArtistWorkload {
  artist_id: string
  artist_name: string
  assigned_characters: number
  total_lines: number
  recorded_lines: number
  remaining_lines: number
  progress_percent: number
}

// ────────────────────────────────────────────
// DOSYA İZLEME (FILE WATCHER)
// ────────────────────────────────────────────

export interface FileChangeEvent {
  type: FileChangeType
  category: AudioCategory
  character_name: string
  file_name: string
  old_path?: string
  new_path?: string
  old_character_name?: string
  new_character_name?: string
}

export type FileChangeType =
  | 'added'
  | 'deleted'
  | 'renamed'
  | 'moved'

export type AudioCategory = 'originals' | 'recording' | 'mixed'

// ────────────────────────────────────────────
// SAĞLIK KONTROLÜ
// ────────────────────────────────────────────

export interface HealthReport {
  checked_at: string
  overall_status: HealthStatus
  issues: HealthIssue[]
  summary: HealthSummary
}

export type HealthStatus = 'healthy' | 'warning' | 'critical'

export interface HealthIssue {
  id: string
  severity: 'error' | 'warning' | 'info'
  category: HealthIssueCategory
  message: string
  details: string
  auto_fixable: boolean
  entity_id?: string
  entity_type?: EntityType
}

export type HealthIssueCategory =
  | 'missing_file'
  | 'unregistered_file'
  | 'folder_mismatch'
  | 'duplicate_record'
  | 'orphan_record'
  | 'unassigned_character'
  | 'empty_translation'
  | 'path_invalid'

export interface HealthSummary {
  total_checks: number
  errors: number
  warnings: number
  passed: number
}

// ────────────────────────────────────────────
// EXCEL IMPORT / EXPORT
// ────────────────────────────────────────────

export interface ExcelExportOptions {
  characters: string[] | 'all'
  columns: ExcelColumn[]
  separate_sheets: boolean
  file_name: string
}

export type ExcelColumn =
  | 'sound_id'
  | 'character'
  | 'original_text'
  | 'translated_text'
  | 'translation_status'

export interface ExcelImportResult {
  total_rows: number
  matched_rows: number
  unmatched_rows: number
  updated_rows: number
  unchanged_rows: number
  changes: ExcelImportChange[]
  unmatched_ids: string[]
}

export interface ExcelImportChange {
  sound_id: string
  character_name: string
  field: 'original_text' | 'translated_text'
  old_value: string | null
  new_value: string | null
}

// ────────────────────────────────────────────
// PROJE PAKETLEME
// ────────────────────────────────────────────

export interface ProjectPackageMeta {
  version: string
  project_name: string
  game_title: string
  created_at: string
  packaged_at: string
  total_characters: number
  total_files: number
  total_translations: number
  checksum: string
}

export interface PackageOptions {
  include_originals: boolean
  include_recordings: boolean
  include_mixed: boolean
  output_path: string
}

export interface PackageLoadResult {
  success: boolean
  meta: ProjectPackageMeta | null
  error?: string
}

// ────────────────────────────────────────────
// UI YARDIMCI TİPLER
// ────────────────────────────────────────────

export interface RecentProject {
  path: string
  name: string
  game_title: string
  last_opened: string
}

export interface SidebarItem {
  id: string
  label: string
  icon: string
  path: string
  badge?: number
}

export interface ToastMessage {
  id: string
  type: 'success' | 'error' | 'warning' | 'info'
  title: string
  message?: string
  duration?: number
}

export interface ConfirmDialogProps {
  title: string
  message: string
  detail?: string
  confirm_text: string
  cancel_text: string
  danger?: boolean
}

// ────────────────────────────────────────────
// IPC KANAL İSİMLERİ (sabitler)
// ────────────────────────────────────────────

export const IPC_CHANNELS = {
  // Proje
  PROJECT_CREATE: 'project:create',
  PROJECT_OPEN: 'project:open',
  PROJECT_CLOSE: 'project:close',
  PROJECT_LIST_RECENT: 'project:list-recent',
  PROJECT_GET_PROGRESS: 'project:get-progress',

  // Karakter
  CHARACTER_CREATE: 'character:create',
  CHARACTER_UPDATE: 'character:update',
  CHARACTER_DELETE: 'character:delete',
  CHARACTER_LIST: 'character:list',
  CHARACTER_GET: 'character:get',
  CHARACTER_ASSIGN_ARTIST: 'character:assign-artist',

  // Sanatçı
  ARTIST_CREATE: 'artist:create',
  ARTIST_UPDATE: 'artist:update',
  ARTIST_DELETE: 'artist:delete',
  ARTIST_LIST: 'artist:list',
  ARTIST_WORKLOAD: 'artist:workload',

  // Ses dosyası
  AUDIO_IMPORT: 'audio:import',
  AUDIO_DELETE: 'audio:delete',
  AUDIO_LIST: 'audio:list',
  AUDIO_GET: 'audio:get',
  AUDIO_UPDATE: 'audio:update',

  // Çeviri
  TRANSLATION_UPDATE: 'translation:update',
  TRANSLATION_EXPORT_EXCEL: 'translation:export-excel',
  TRANSLATION_IMPORT_EXCEL: 'translation:import-excel',

  // Dosya izleme
  FILE_WATCHER_EVENT: 'file-watcher:event',
  FILE_WATCHER_START: 'file-watcher:start',
  FILE_WATCHER_STOP: 'file-watcher:stop',

  // Sağlık
  HEALTH_CHECK: 'health:check',
  HEALTH_FIX: 'health:fix',

  // Audit
  AUDIT_LIST: 'audit:list',
  AUDIT_UNDO: 'audit:undo',

  // Paketleme
  PACKAGE_CREATE: 'package:create',
  PACKAGE_LOAD: 'package:load',

  // Dialog
  DIALOG_SELECT_FOLDER: 'dialog:select-folder',
  DIALOG_SELECT_FILES: 'dialog:select-files',
  DIALOG_SAVE_FILE: 'dialog:save-file',
} as const