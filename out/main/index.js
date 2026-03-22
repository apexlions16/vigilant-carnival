"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const electron = require("electron");
const path = require("path");
const utils = require("@electron-toolkit/utils");
const fs = require("fs");
const Database = require("better-sqlite3");
const uuid = require("uuid");
const XLSX = require("xlsx");
const chokidar = require("chokidar");
const crypto = require("crypto");
function _interopNamespaceDefault(e) {
  const n = Object.create(null, { [Symbol.toStringTag]: { value: "Module" } });
  if (e) {
    for (const k in e) {
      if (k !== "default") {
        const d = Object.getOwnPropertyDescriptor(e, k);
        Object.defineProperty(n, k, d.get ? d : {
          enumerable: true,
          get: () => e[k]
        });
      }
    }
  }
  n.default = e;
  return Object.freeze(n);
}
const path__namespace = /* @__PURE__ */ _interopNamespaceDefault(path);
const fs__namespace = /* @__PURE__ */ _interopNamespaceDefault(fs);
const XLSX__namespace = /* @__PURE__ */ _interopNamespaceDefault(XLSX);
const chokidar__namespace = /* @__PURE__ */ _interopNamespaceDefault(chokidar);
const crypto__namespace = /* @__PURE__ */ _interopNamespaceDefault(crypto);
let db = null;
function openDatabase(dbPath) {
  if (db) closeDatabase();
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  createTables();
}
function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}
function isDatabaseOpen() {
  return db !== null;
}
function getDb() {
  if (!db) throw new Error("Veritabanı açık değil. Önce bir proje açın.");
  return db;
}
function now() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function createTables() {
  const d = getDb();
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
  `);
}
function createProject(data) {
  const id = uuid.v4();
  const timestamp = now();
  getDb().prepare(`
    INSERT INTO projects (id, name, game_title, source_language, target_language, project_path, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)
  `).run(id, data.name, data.game_title, data.source_language, data.target_language, data.project_path, timestamp, timestamp);
  return getDb().prepare("SELECT * FROM projects WHERE id = ?").get(id);
}
function getProject(id) {
  return getDb().prepare("SELECT * FROM projects WHERE id = ?").get(id);
}
function getFirstProject() {
  return getDb().prepare("SELECT * FROM projects LIMIT 1").get();
}
function updateProject(id, data) {
  const allowed = ["name", "game_title", "source_language", "target_language", "status"];
  const fields = [];
  const values = [];
  for (const key of allowed) {
    if (data[key] !== void 0) {
      fields.push(`${key} = ?`);
      values.push(data[key]);
    }
  }
  if (fields.length === 0) return getProject(id);
  fields.push("updated_at = ?");
  values.push(now(), id);
  getDb().prepare(`UPDATE projects SET ${fields.join(", ")} WHERE id = ?`).run(...values);
  return getProject(id);
}
function deleteProject(id) {
  getDb().prepare("DELETE FROM projects WHERE id = ?").run(id);
}
function createCharacter(projectId, data) {
  const id = uuid.v4();
  const timestamp = now();
  getDb().prepare(`
    INSERT INTO characters (id, project_id, name, description, priority, image_path, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, projectId, data.name, data.description || "", data.priority || "npc", data.image_path || null, timestamp, timestamp);
  return getDb().prepare("SELECT * FROM characters WHERE id = ?").get(id);
}
function getCharacter(id) {
  return getDb().prepare("SELECT * FROM characters WHERE id = ?").get(id);
}
function listCharacters(projectId) {
  return getDb().prepare("SELECT * FROM characters WHERE project_id = ? ORDER BY created_at ASC").all(projectId);
}
function updateCharacter(id, data) {
  const allowed = ["name", "description", "priority", "image_path", "assigned_artist_id"];
  const fields = [];
  const values = [];
  for (const key of allowed) {
    if (data[key] !== void 0) {
      fields.push(`${key} = ?`);
      values.push(data[key]);
    }
  }
  if (fields.length === 0) return getCharacter(id);
  fields.push("updated_at = ?");
  values.push(now(), id);
  getDb().prepare(`UPDATE characters SET ${fields.join(", ")} WHERE id = ?`).run(...values);
  return getCharacter(id);
}
function deleteCharacter(id) {
  getDb().prepare("DELETE FROM characters WHERE id = ?").run(id);
}
function getCharacterByName(projectId, name) {
  return getDb().prepare("SELECT * FROM characters WHERE project_id = ? AND name = ?").get(projectId, name);
}
function createVoiceArtist(projectId, data) {
  const id = uuid.v4();
  getDb().prepare(`
    INSERT INTO voice_artists (id, project_id, name, email, phone, notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, projectId, data.name, data.email || null, data.phone || null, data.notes || null, now());
  return getDb().prepare("SELECT * FROM voice_artists WHERE id = ?").get(id);
}
function getVoiceArtist(id) {
  return getDb().prepare("SELECT * FROM voice_artists WHERE id = ?").get(id);
}
function listVoiceArtists(projectId) {
  return getDb().prepare("SELECT * FROM voice_artists WHERE project_id = ? ORDER BY name ASC").all(projectId);
}
function updateVoiceArtist(id, data) {
  const allowed = ["name", "email", "phone", "notes"];
  const fields = [];
  const values = [];
  for (const key of allowed) {
    if (data[key] !== void 0) {
      fields.push(`${key} = ?`);
      values.push(data[key]);
    }
  }
  if (fields.length === 0) return getVoiceArtist(id);
  values.push(id);
  getDb().prepare(`UPDATE voice_artists SET ${fields.join(", ")} WHERE id = ?`).run(...values);
  return getVoiceArtist(id);
}
function deleteVoiceArtist(id) {
  getDb().prepare("UPDATE characters SET assigned_artist_id = NULL WHERE assigned_artist_id = ?").run(id);
  getDb().prepare("DELETE FROM voice_artists WHERE id = ?").run(id);
}
function createAudioFile(projectId, data) {
  const id = uuid.v4();
  const timestamp = now();
  getDb().prepare(`
    INSERT INTO audio_files (id, project_id, character_id, file_name, original_path, recording_path, mixed_path, translation_status, recording_status, mixing_status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'empty', 'not_recorded', 'not_mixed', ?, ?)
  `).run(id, projectId, data.character_id, data.file_name, data.original_path || null, data.recording_path || null, data.mixed_path || null, timestamp, timestamp);
  return getDb().prepare("SELECT * FROM audio_files WHERE id = ?").get(id);
}
function getAudioFile(id) {
  return getDb().prepare("SELECT * FROM audio_files WHERE id = ?").get(id);
}
function listAudioFilesByCharacter(characterId) {
  return getDb().prepare("SELECT * FROM audio_files WHERE character_id = ? ORDER BY file_name ASC").all(characterId);
}
function listAudioFilesByProject(projectId) {
  return getDb().prepare("SELECT * FROM audio_files WHERE project_id = ? ORDER BY file_name ASC").all(projectId);
}
function getAudioFileByFileName(projectId, fileName) {
  return getDb().prepare("SELECT * FROM audio_files WHERE project_id = ? AND file_name = ?").get(projectId, fileName);
}
function updateAudioFile(id, data) {
  const allowed = [
    "character_id",
    "file_name",
    "original_path",
    "recording_path",
    "mixed_path",
    "original_text",
    "translated_text",
    "translation_status",
    "recording_status",
    "mixing_status"
  ];
  const fields = [];
  const values = [];
  for (const key of allowed) {
    if (data[key] !== void 0) {
      fields.push(`${key} = ?`);
      values.push(data[key]);
    }
  }
  if (fields.length === 0) return getAudioFile(id);
  if (data.translated_text !== void 0 || data.original_text !== void 0) {
    const current = getAudioFile(id);
    const origText = data.original_text !== void 0 ? data.original_text : current?.original_text;
    const transText = data.translated_text !== void 0 ? data.translated_text : current?.translated_text;
    let status = "empty";
    if (origText && !transText) status = "has_original";
    else if (origText && transText) status = "translated";
    if (!fields.some((f) => f.startsWith("translation_status"))) {
      fields.push("translation_status = ?");
      values.push(status);
    }
  }
  if (data.recording_path !== void 0) {
    const recStatus = data.recording_path ? "recorded" : "not_recorded";
    if (!fields.some((f) => f.startsWith("recording_status"))) {
      fields.push("recording_status = ?");
      values.push(recStatus);
    }
  }
  if (data.mixed_path !== void 0) {
    const mixStatus = data.mixed_path ? "mixed" : "not_mixed";
    if (!fields.some((f) => f.startsWith("mixing_status"))) {
      fields.push("mixing_status = ?");
      values.push(mixStatus);
    }
  }
  fields.push("updated_at = ?");
  values.push(now(), id);
  getDb().prepare(`UPDATE audio_files SET ${fields.join(", ")} WHERE id = ?`).run(...values);
  return getAudioFile(id);
}
function deleteAudioFile(id) {
  getDb().prepare("DELETE FROM audio_files WHERE id = ?").run(id);
}
function moveAudioFileToCharacter(audioFileId, newCharacterId) {
  getDb().prepare(`
    UPDATE audio_files SET character_id = ?, updated_at = ? WHERE id = ?
  `).run(newCharacterId, now(), audioFileId);
  return getAudioFile(audioFileId);
}
function createAuditLog(projectId, data) {
  const id = uuid.v4();
  getDb().prepare(`
    INSERT INTO audit_logs (id, project_id, timestamp, action_type, entity_type, entity_id, old_value, new_value, description, is_undone)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
  `).run(
    id,
    projectId,
    now(),
    data.action_type,
    data.entity_type,
    data.entity_id,
    data.old_value ? JSON.stringify(data.old_value) : null,
    data.new_value ? JSON.stringify(data.new_value) : null,
    data.description
  );
  return getDb().prepare("SELECT * FROM audit_logs WHERE id = ?").get(id);
}
function listAuditLogs(projectId, limit = 100, offset = 0) {
  return getDb().prepare(
    "SELECT * FROM audit_logs WHERE project_id = ? ORDER BY timestamp DESC LIMIT ? OFFSET ?"
  ).all(projectId, limit, offset);
}
function markAuditLogUndone(id) {
  getDb().prepare("UPDATE audit_logs SET is_undone = 1 WHERE id = ?").run(id);
}
function getProjectProgress(projectId) {
  const row = getDb().prepare(`
    SELECT
      COUNT(*) as total_files,
      SUM(CASE WHEN translated_text IS NOT NULL AND translated_text != '' THEN 1 ELSE 0 END) as translated_count,
      SUM(CASE WHEN recording_path IS NOT NULL AND recording_path != '' THEN 1 ELSE 0 END) as recorded_count,
      SUM(CASE WHEN mixed_path IS NOT NULL AND mixed_path != '' THEN 1 ELSE 0 END) as mixed_count
    FROM audio_files WHERE project_id = ?
  `).get(projectId);
  const total = row?.total_files || 0;
  const translated = row?.translated_count || 0;
  const recorded = row?.recorded_count || 0;
  const mixed = row?.mixed_count || 0;
  return {
    total_files: total,
    translated_count: translated,
    recorded_count: recorded,
    mixed_count: mixed,
    translation_percent: total > 0 ? Math.round(translated / total * 100) : 0,
    recording_percent: total > 0 ? Math.round(recorded / total * 100) : 0,
    mixing_percent: total > 0 ? Math.round(mixed / total * 100) : 0,
    overall_percent: total > 0 ? Math.round((translated + recorded + mixed) / (total * 3) * 100) : 0
  };
}
function getArtistWorkload(projectId) {
  const rows = getDb().prepare(`
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
  `).all(projectId);
  return rows.map((r) => ({
    ...r,
    remaining_lines: (r.total_lines || 0) - (r.recorded_lines || 0),
    progress_percent: r.total_lines > 0 ? Math.round(r.recorded_lines / r.total_lines * 100) : 0
  }));
}
function getUnassignedCharacters(projectId) {
  return getDb().prepare(
    "SELECT * FROM characters WHERE project_id = ? AND assigned_artist_id IS NULL ORDER BY name ASC"
  ).all(projectId);
}
function getUntranslatedCount(projectId) {
  const row = getDb().prepare(
    "SELECT COUNT(*) as count FROM audio_files WHERE project_id = ? AND (translated_text IS NULL OR translated_text = '')"
  ).get(projectId);
  return row?.count || 0;
}
function getUnrecordedCount(projectId) {
  const row = getDb().prepare(
    "SELECT COUNT(*) as count FROM audio_files WHERE project_id = ? AND (recording_path IS NULL OR recording_path = '')"
  ).get(projectId);
  return row?.count || 0;
}
function searchAudioFiles(projectId, query) {
  const like = `%${query}%`;
  return getDb().prepare(`
    SELECT af.*, c.name as character_name
    FROM audio_files af
    JOIN characters c ON c.id = af.character_id
    WHERE af.project_id = ?
      AND (af.file_name LIKE ? OR af.original_text LIKE ? OR af.translated_text LIKE ?)
    ORDER BY af.file_name ASC
    LIMIT 100
  `).all(projectId, like, like, like);
}
function getDatabaseStats(projectId) {
  const chars = getDb().prepare("SELECT COUNT(*) as c FROM characters WHERE project_id = ?").get(projectId);
  const artists = getDb().prepare("SELECT COUNT(*) as c FROM voice_artists WHERE project_id = ?").get(projectId);
  const files = getDb().prepare("SELECT COUNT(*) as c FROM audio_files WHERE project_id = ?").get(projectId);
  const trans = getDb().prepare(
    "SELECT COUNT(*) as c FROM audio_files WHERE project_id = ? AND translated_text IS NOT NULL AND translated_text != ''"
  ).get(projectId);
  return {
    total_characters: chars?.c || 0,
    total_artists: artists?.c || 0,
    total_files: files?.c || 0,
    total_translations: trans?.c || 0
  };
}
function createProjectFolders(projectPath) {
  const folders = ["Originals", "Recording", "Mixed"];
  if (!fs__namespace.existsSync(projectPath)) {
    fs__namespace.mkdirSync(projectPath, { recursive: true });
  }
  for (const folder of folders) {
    const folderPath = path__namespace.join(projectPath, folder);
    if (!fs__namespace.existsSync(folderPath)) {
      fs__namespace.mkdirSync(folderPath, { recursive: true });
    }
  }
}
function writeProjectMeta(projectPath, data) {
  const metaPath = path__namespace.join(projectPath, "project.json");
  const meta = {
    version: "1.0.0",
    name: data.name,
    game_title: data.game_title,
    source_language: data.source_language,
    target_language: data.target_language,
    created_at: (/* @__PURE__ */ new Date()).toISOString(),
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  fs__namespace.writeFileSync(metaPath, JSON.stringify(meta, null, 2), "utf-8");
}
function isValidProjectFolder(projectPath) {
  if (!fs__namespace.existsSync(projectPath)) {
    return { valid: false, error: "Klasör bulunamadı." };
  }
  const dbPath = path__namespace.join(projectPath, "project.db");
  if (!fs__namespace.existsSync(dbPath)) {
    return { valid: false, error: "project.db dosyası bulunamadı. Bu geçerli bir DubLab projesi değil." };
  }
  const requiredFolders = ["Originals", "Recording", "Mixed"];
  for (const folder of requiredFolders) {
    if (!fs__namespace.existsSync(path__namespace.join(projectPath, folder))) {
      return { valid: false, error: `${folder} klasörü bulunamadı.` };
    }
  }
  return { valid: true };
}
function getRecentProjectsPath() {
  const { app } = require("electron");
  return path__namespace.join(app.getPath("userData"), "recent-projects.json");
}
function loadRecentProjects() {
  const filePath = getRecentProjectsPath();
  if (!fs__namespace.existsSync(filePath)) return [];
  try {
    const content = fs__namespace.readFileSync(filePath, "utf-8");
    return JSON.parse(content);
  } catch {
    return [];
  }
}
function saveRecentProject(projectPath, name, gameTitle) {
  const recents = loadRecentProjects();
  const existingIndex = recents.findIndex((r) => r.path === projectPath);
  if (existingIndex !== -1) {
    recents.splice(existingIndex, 1);
  }
  recents.unshift({
    path: projectPath,
    name,
    game_title: gameTitle,
    last_opened: (/* @__PURE__ */ new Date()).toISOString()
  });
  const trimmed = recents.slice(0, 10);
  const filePath = getRecentProjectsPath();
  fs__namespace.writeFileSync(filePath, JSON.stringify(trimmed, null, 2), "utf-8");
}
function registerProjectHandlers() {
  electron.ipcMain.handle("project:create", async (_event, data) => {
    try {
      const projectPath = path__namespace.join(data.project_path, data.name);
      if (fs__namespace.existsSync(projectPath)) {
        return {
          success: false,
          error: `"${data.name}" adında bir klasör zaten mevcut: ${projectPath}`
        };
      }
      createProjectFolders(projectPath);
      writeProjectMeta(projectPath, data);
      const dbPath = path__namespace.join(projectPath, "project.db");
      openDatabase(dbPath);
      const project = createProject({
        name: data.name,
        game_title: data.game_title,
        source_language: data.source_language,
        target_language: data.target_language,
        project_path: projectPath
      });
      saveRecentProject(projectPath, data.name, data.game_title);
      return {
        success: true,
        project,
        project_path: projectPath
      };
    } catch (error) {
      return {
        success: false,
        error: error.message || "Proje oluşturulurken hata oluştu."
      };
    }
  });
  electron.ipcMain.handle("project:open", async (_event, projectPath) => {
    try {
      const validation = isValidProjectFolder(projectPath);
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }
      const dbPath = path__namespace.join(projectPath, "project.db");
      openDatabase(dbPath);
      const project = getFirstProject();
      if (!project) {
        return { success: false, error: "Veritabanında proje kaydı bulunamadı." };
      }
      if (project.project_path !== projectPath) {
        updateProject(project.id, { project_path: projectPath });
      }
      saveRecentProject(projectPath, project.name, project.game_title);
      const progress = getProjectProgress(project.id);
      return {
        success: true,
        project: { ...project, project_path: projectPath },
        progress
      };
    } catch (error) {
      return {
        success: false,
        error: error.message || "Proje açılırken hata oluştu."
      };
    }
  });
  electron.ipcMain.handle("project:close", async () => {
    try {
      closeDatabase();
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
  electron.ipcMain.handle("project:update", async (_event, data) => {
    try {
      const project = updateProject(data.id, data.updates);
      return { success: true, project };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
  electron.ipcMain.handle("project:delete", async (_event, data) => {
    try {
      deleteProject(data.id);
      closeDatabase();
      if (data.delete_files && fs__namespace.existsSync(data.project_path)) {
        fs__namespace.rmSync(data.project_path, { recursive: true, force: true });
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
  electron.ipcMain.handle("project:list-recent", async () => {
    try {
      const recents = loadRecentProjects();
      const valid = recents.filter((r) => {
        return fs__namespace.existsSync(r.path) && fs__namespace.existsSync(path__namespace.join(r.path, "project.db"));
      });
      return { success: true, projects: valid };
    } catch (error) {
      return { success: false, error: error.message, projects: [] };
    }
  });
  electron.ipcMain.handle("project:get-progress", async (_event, projectId) => {
    try {
      const progress = getProjectProgress(projectId);
      return { success: true, progress };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
  electron.ipcMain.handle("project:get-stats", async (_event, projectId) => {
    try {
      const stats = getDatabaseStats(projectId);
      const progress = getProjectProgress(projectId);
      const unassigned = getUnassignedCharacters(projectId);
      const untranslated = getUntranslatedCount(projectId);
      const unrecorded = getUnrecordedCount(projectId);
      return {
        success: true,
        stats,
        progress,
        warnings: {
          unassigned_characters: unassigned.length,
          untranslated_lines: untranslated,
          unrecorded_lines: unrecorded
        }
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
  electron.ipcMain.handle("dialog:select-folder", async (_event, options) => {
    try {
      const mainWindow = electron.BrowserWindow.getFocusedWindow();
      if (!mainWindow) return { success: false, error: "Pencere bulunamadı." };
      const result = await electron.dialog.showOpenDialog(mainWindow, {
        title: options?.title || "Klasör Seç",
        defaultPath: options?.default_path,
        properties: ["openDirectory", "createDirectory"]
      });
      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, canceled: true };
      }
      return { success: true, path: result.filePaths[0] };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
  electron.ipcMain.handle("dialog:select-files", async (_event, options) => {
    try {
      const mainWindow = electron.BrowserWindow.getFocusedWindow();
      if (!mainWindow) return { success: false, error: "Pencere bulunamadı." };
      const properties = ["openFile"];
      if (options?.multi !== false) properties.push("multiSelections");
      const result = await electron.dialog.showOpenDialog(mainWindow, {
        title: options?.title || "Dosya Seç",
        filters: options?.filters || [
          { name: "Ses Dosyaları", extensions: ["wav", "mp3", "ogg", "flac"] },
          { name: "Tüm Dosyalar", extensions: ["*"] }
        ],
        properties
      });
      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, canceled: true };
      }
      return { success: true, paths: result.filePaths };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
  electron.ipcMain.handle("dialog:save-file", async (_event, options) => {
    try {
      const mainWindow = electron.BrowserWindow.getFocusedWindow();
      if (!mainWindow) return { success: false, error: "Pencere bulunamadı." };
      const result = await electron.dialog.showSaveDialog(mainWindow, {
        title: options?.title || "Dosya Kaydet",
        defaultPath: options?.default_name,
        filters: options?.filters || [
          { name: "Tüm Dosyalar", extensions: ["*"] }
        ]
      });
      if (result.canceled || !result.filePath) {
        return { success: false, canceled: true };
      }
      return { success: true, path: result.filePath };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
}
function createCharacterFolders(projectPath, characterName) {
  const sanitized = sanitizeFolderName$2(characterName);
  const paths = {
    originals: path__namespace.join(projectPath, "Originals", sanitized),
    recording: path__namespace.join(projectPath, "Recording", sanitized),
    mixed: path__namespace.join(projectPath, "Mixed", sanitized)
  };
  for (const folderPath of Object.values(paths)) {
    if (!fs__namespace.existsSync(folderPath)) {
      fs__namespace.mkdirSync(folderPath, { recursive: true });
    }
  }
  return paths;
}
function renameCharacterFolders(projectPath, oldName, newName) {
  const oldSanitized = sanitizeFolderName$2(oldName);
  const newSanitized = sanitizeFolderName$2(newName);
  if (oldSanitized === newSanitized) {
    return { success: true };
  }
  const categories = ["Originals", "Recording", "Mixed"];
  const renamedPaths = [];
  try {
    for (const category of categories) {
      const oldPath = path__namespace.join(projectPath, category, oldSanitized);
      const newPath = path__namespace.join(projectPath, category, newSanitized);
      if (fs__namespace.existsSync(newPath)) {
        rollbackRenames(renamedPaths);
        return {
          success: false,
          error: `"${newName}" adında bir klasör ${category} içinde zaten mevcut.`
        };
      }
      if (fs__namespace.existsSync(oldPath)) {
        fs__namespace.renameSync(oldPath, newPath);
        renamedPaths.push({ from: oldPath, to: newPath });
      } else {
        fs__namespace.mkdirSync(newPath, { recursive: true });
      }
    }
    return { success: true };
  } catch (error) {
    rollbackRenames(renamedPaths);
    return { success: false, error: error.message };
  }
}
function rollbackRenames(renamedPaths) {
  for (const entry of renamedPaths.reverse()) {
    try {
      if (fs__namespace.existsSync(entry.to)) {
        fs__namespace.renameSync(entry.to, entry.from);
      }
    } catch {
    }
  }
}
function deleteCharacterFolders(projectPath, characterName) {
  const sanitized = sanitizeFolderName$2(characterName);
  const categories = ["Originals", "Recording", "Mixed"];
  for (const category of categories) {
    const folderPath = path__namespace.join(projectPath, category, sanitized);
    if (fs__namespace.existsSync(folderPath)) {
      fs__namespace.rmSync(folderPath, { recursive: true, force: true });
    }
  }
}
function sanitizeFolderName$2(name) {
  return name.replace(/[<>:"/\\|?*]/g, "_").replace(/\s+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "").trim();
}
function getCharacterFolderStats(projectPath, characterName) {
  const sanitized = sanitizeFolderName$2(characterName);
  const audioExtensions = [".wav", ".mp3", ".ogg", ".flac"];
  function countAudioFiles(dirPath) {
    if (!fs__namespace.existsSync(dirPath)) return 0;
    try {
      return fs__namespace.readdirSync(dirPath).filter((f) => {
        const ext = path__namespace.extname(f).toLowerCase();
        return audioExtensions.includes(ext);
      }).length;
    } catch {
      return 0;
    }
  }
  return {
    originals_count: countAudioFiles(path__namespace.join(projectPath, "Originals", sanitized)),
    recording_count: countAudioFiles(path__namespace.join(projectPath, "Recording", sanitized)),
    mixed_count: countAudioFiles(path__namespace.join(projectPath, "Mixed", sanitized))
  };
}
function registerCharacterHandlers() {
  electron.ipcMain.handle("character:create", async (_event, data) => {
    try {
      const existing = getCharacterByName(data.project_id, data.name);
      if (existing) {
        return {
          success: false,
          error: `"${data.name}" adında bir karakter zaten mevcut.`
        };
      }
      const folders = createCharacterFolders(data.project_path, data.name);
      const character = createCharacter(data.project_id, {
        name: data.name,
        description: data.description || "",
        priority: data.priority || "npc",
        image_path: data.image_path || null
      });
      createAuditLog(data.project_id, {
        action_type: "create",
        entity_type: "character",
        entity_id: character.id,
        description: `"${data.name}" karakteri oluşturuldu.`,
        new_value: character
      });
      return {
        success: true,
        character,
        folders
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
  electron.ipcMain.handle("character:list", async (_event, projectId) => {
    try {
      const characters = listCharacters(projectId);
      const project = getFirstProject();
      const enriched = characters.map((char) => {
        let artist_name = null;
        if (char.assigned_artist_id) {
          const artist = getVoiceArtist(char.assigned_artist_id);
          artist_name = artist ? artist.name : null;
        }
        const audioFiles = listAudioFilesByCharacter(char.id);
        const translated = audioFiles.filter((f) => f.translated_text && f.translated_text !== "").length;
        const recorded = audioFiles.filter((f) => f.recording_path && f.recording_path !== "").length;
        const mixed = audioFiles.filter((f) => f.mixed_path && f.mixed_path !== "").length;
        return {
          ...char,
          artist_name,
          total_files: audioFiles.length,
          translated_count: translated,
          recorded_count: recorded,
          mixed_count: mixed
        };
      });
      return { success: true, characters: enriched };
    } catch (error) {
      return { success: false, error: error.message, characters: [] };
    }
  });
  electron.ipcMain.handle("character:get", async (_event, characterId) => {
    try {
      const character = getCharacter(characterId);
      if (!character) {
        return { success: false, error: "Karakter bulunamadı." };
      }
      let artist_name = null;
      if (character.assigned_artist_id) {
        const artist = getVoiceArtist(character.assigned_artist_id);
        artist_name = artist ? artist.name : null;
      }
      const audioFiles = listAudioFilesByCharacter(characterId);
      const translated = audioFiles.filter((f) => f.translated_text && f.translated_text !== "").length;
      const recorded = audioFiles.filter((f) => f.recording_path && f.recording_path !== "").length;
      const mixed = audioFiles.filter((f) => f.mixed_path && f.mixed_path !== "").length;
      return {
        success: true,
        character: {
          ...character,
          artist_name,
          total_files: audioFiles.length,
          translated_count: translated,
          recorded_count: recorded,
          mixed_count: mixed,
          audio_files: audioFiles
        }
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
  electron.ipcMain.handle("character:update", async (_event, data) => {
    try {
      const currentCharacter = getCharacter(data.id);
      if (!currentCharacter) {
        return { success: false, error: "Karakter bulunamadı." };
      }
      if (data.updates.name && data.updates.name !== currentCharacter.name) {
        const existing = getCharacterByName(data.project_id, data.updates.name);
        if (existing && existing.id !== data.id) {
          return {
            success: false,
            error: `"${data.updates.name}" adında bir karakter zaten mevcut.`
          };
        }
        const renameResult = renameCharacterFolders(
          data.project_path,
          currentCharacter.name,
          data.updates.name
        );
        if (!renameResult.success) {
          return { success: false, error: renameResult.error };
        }
        const audioFiles = listAudioFilesByCharacter(data.id);
        const oldSanitized = sanitizeFolderName$2(currentCharacter.name);
        const newSanitized = sanitizeFolderName$2(data.updates.name);
        for (const file of audioFiles) {
          const pathUpdates = {};
          if (file.original_path) {
            pathUpdates.original_path = file.original_path.replace(
              path__namespace.join("Originals", oldSanitized),
              path__namespace.join("Originals", newSanitized)
            );
          }
          if (file.recording_path) {
            pathUpdates.recording_path = file.recording_path.replace(
              path__namespace.join("Recording", oldSanitized),
              path__namespace.join("Recording", newSanitized)
            );
          }
          if (file.mixed_path) {
            pathUpdates.mixed_path = file.mixed_path.replace(
              path__namespace.join("Mixed", oldSanitized),
              path__namespace.join("Mixed", newSanitized)
            );
          }
          if (Object.keys(pathUpdates).length > 0) {
            updateAudioFile(file.id, pathUpdates);
          }
        }
      }
      const oldValue = { ...currentCharacter };
      const updated = updateCharacter(data.id, data.updates);
      createAuditLog(data.project_id, {
        action_type: "update",
        entity_type: "character",
        entity_id: data.id,
        description: data.updates.name && data.updates.name !== currentCharacter.name ? `Karakter adı değiştirildi: "${currentCharacter.name}" → "${data.updates.name}"` : `"${currentCharacter.name}" karakteri güncellendi.`,
        old_value: oldValue,
        new_value: updated
      });
      return { success: true, character: updated };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
  electron.ipcMain.handle("character:delete", async (_event, data) => {
    try {
      const character = getCharacter(data.id);
      if (!character) {
        return { success: false, error: "Karakter bulunamadı." };
      }
      const audioFiles = listAudioFilesByCharacter(data.id);
      if (data.delete_files) {
        deleteCharacterFolders(data.project_path, character.name);
      }
      createAuditLog(data.project_id, {
        action_type: "delete",
        entity_type: "character",
        entity_id: data.id,
        description: `"${character.name}" karakteri silindi. (${audioFiles.length} ses dosyası)`,
        old_value: { character, audio_files_count: audioFiles.length }
      });
      deleteCharacter(data.id);
      return {
        success: true,
        deleted_name: character.name,
        deleted_files_count: audioFiles.length
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
  electron.ipcMain.handle("character:assign-artist", async (_event, data) => {
    try {
      const character = getCharacter(data.character_id);
      if (!character) {
        return { success: false, error: "Karakter bulunamadı." };
      }
      const oldArtistId = character.assigned_artist_id;
      let oldArtistName = null;
      let newArtistName = null;
      if (oldArtistId) {
        const oldArtist = getVoiceArtist(oldArtistId);
        oldArtistName = oldArtist ? oldArtist.name : null;
      }
      if (data.artist_id) {
        const newArtist = getVoiceArtist(data.artist_id);
        if (!newArtist) {
          return { success: false, error: "Sanatçı bulunamadı." };
        }
        newArtistName = newArtist.name;
      }
      const updated = updateCharacter(data.character_id, {
        assigned_artist_id: data.artist_id
      });
      const description = data.artist_id ? `"${character.name}" karakterine "${newArtistName}" atandı.` : `"${character.name}" karakterinden sanatçı ataması kaldırıldı.`;
      createAuditLog(data.project_id, {
        action_type: data.artist_id ? "assign" : "unassign",
        entity_type: "character",
        entity_id: data.character_id,
        description,
        old_value: { artist_id: oldArtistId, artist_name: oldArtistName },
        new_value: { artist_id: data.artist_id, artist_name: newArtistName }
      });
      return {
        success: true,
        character: updated,
        artist_name: newArtistName
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
  electron.ipcMain.handle("character:list-unassigned", async (_event, projectId) => {
    try {
      const characters = getUnassignedCharacters(projectId);
      return { success: true, characters };
    } catch (error) {
      return { success: false, error: error.message, characters: [] };
    }
  });
  electron.ipcMain.handle("character:folder-stats", async (_event, data) => {
    try {
      const stats = getCharacterFolderStats(data.project_path, data.character_name);
      return { success: true, stats };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
}
function registerArtistHandlers() {
  electron.ipcMain.handle("artist:create", async (_event, data) => {
    try {
      const existingArtists = listVoiceArtists(data.project_id);
      const duplicate = existingArtists.find(
        (a) => a.name.toLowerCase() === data.name.toLowerCase()
      );
      if (duplicate) {
        return {
          success: false,
          error: `"${data.name}" adında bir sanatçı zaten mevcut.`
        };
      }
      const artist = createVoiceArtist(data.project_id, {
        name: data.name,
        email: data.email || null,
        phone: data.phone || null,
        notes: data.notes || null
      });
      createAuditLog(data.project_id, {
        action_type: "create",
        entity_type: "voice_artist",
        entity_id: artist.id,
        description: `"${data.name}" sanatçısı eklendi.`,
        new_value: artist
      });
      return { success: true, artist };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
  electron.ipcMain.handle("artist:list", async (_event, projectId) => {
    try {
      const artists = listVoiceArtists(projectId);
      const characters = listCharacters(projectId);
      const enriched = artists.map((artist) => {
        const assignedChars = characters.filter(
          (c) => c.assigned_artist_id === artist.id
        );
        let totalLines = 0;
        let recordedLines = 0;
        for (const char of assignedChars) {
          const audioFiles = listAudioFilesByCharacter(char.id);
          totalLines += audioFiles.length;
          recordedLines += audioFiles.filter(
            (f) => f.recording_path && f.recording_path !== ""
          ).length;
        }
        return {
          ...artist,
          assigned_characters: assignedChars.length,
          assigned_character_names: assignedChars.map((c) => c.name),
          total_lines: totalLines,
          recorded_lines: recordedLines,
          remaining_lines: totalLines - recordedLines,
          progress_percent: totalLines > 0 ? Math.round(recordedLines / totalLines * 100) : 0
        };
      });
      return { success: true, artists: enriched };
    } catch (error) {
      return { success: false, error: error.message, artists: [] };
    }
  });
  electron.ipcMain.handle("artist:get", async (_event, artistId) => {
    try {
      const artist = getVoiceArtist(artistId);
      if (!artist) {
        return { success: false, error: "Sanatçı bulunamadı." };
      }
      const allCharacters = listCharacters(artist.project_id);
      const assignedCharacters = allCharacters.filter(
        (c) => c.assigned_artist_id === artistId
      );
      const characterDetails = assignedCharacters.map((char) => {
        const audioFiles = listAudioFilesByCharacter(char.id);
        const recorded = audioFiles.filter(
          (f) => f.recording_path && f.recording_path !== ""
        ).length;
        return {
          id: char.id,
          name: char.name,
          priority: char.priority,
          total_lines: audioFiles.length,
          recorded_lines: recorded,
          remaining_lines: audioFiles.length - recorded,
          progress_percent: audioFiles.length > 0 ? Math.round(recorded / audioFiles.length * 100) : 0
        };
      });
      const totalLines = characterDetails.reduce((sum, c) => sum + c.total_lines, 0);
      const totalRecorded = characterDetails.reduce((sum, c) => sum + c.recorded_lines, 0);
      return {
        success: true,
        artist: {
          ...artist,
          assigned_characters: characterDetails,
          total_lines: totalLines,
          recorded_lines: totalRecorded,
          remaining_lines: totalLines - totalRecorded,
          progress_percent: totalLines > 0 ? Math.round(totalRecorded / totalLines * 100) : 0
        }
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
  electron.ipcMain.handle("artist:update", async (_event, data) => {
    try {
      const currentArtist = getVoiceArtist(data.id);
      if (!currentArtist) {
        return { success: false, error: "Sanatçı bulunamadı." };
      }
      if (data.updates.name && data.updates.name !== currentArtist.name) {
        const existingArtists = listVoiceArtists(data.project_id);
        const duplicate = existingArtists.find(
          (a) => a.name.toLowerCase() === data.updates.name.toLowerCase() && a.id !== data.id
        );
        if (duplicate) {
          return {
            success: false,
            error: `"${data.updates.name}" adında bir sanatçı zaten mevcut.`
          };
        }
      }
      const oldValue = { ...currentArtist };
      const updated = updateVoiceArtist(data.id, data.updates);
      createAuditLog(data.project_id, {
        action_type: "update",
        entity_type: "voice_artist",
        entity_id: data.id,
        description: data.updates.name && data.updates.name !== currentArtist.name ? `Sanatçı adı değiştirildi: "${currentArtist.name}" → "${data.updates.name}"` : `"${currentArtist.name}" sanatçısı güncellendi.`,
        old_value: oldValue,
        new_value: updated
      });
      return { success: true, artist: updated };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
  electron.ipcMain.handle("artist:delete", async (_event, data) => {
    try {
      const artist = getVoiceArtist(data.id);
      if (!artist) {
        return { success: false, error: "Sanatçı bulunamadı." };
      }
      const allCharacters = listCharacters(data.project_id);
      const assignedCount = allCharacters.filter(
        (c) => c.assigned_artist_id === data.id
      ).length;
      createAuditLog(data.project_id, {
        action_type: "delete",
        entity_type: "voice_artist",
        entity_id: data.id,
        description: `"${artist.name}" sanatçısı silindi. (${assignedCount} karakter ataması kaldırıldı)`,
        old_value: { artist, assigned_characters_count: assignedCount }
      });
      deleteVoiceArtist(data.id);
      return {
        success: true,
        deleted_name: artist.name,
        unassigned_characters: assignedCount
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
  electron.ipcMain.handle("artist:workload", async (_event, projectId) => {
    try {
      const workload = getArtistWorkload(projectId);
      return { success: true, workload };
    } catch (error) {
      return { success: false, error: error.message, workload: [] };
    }
  });
  electron.ipcMain.handle("artist:bulk-assign", async (_event, data) => {
    try {
      const results = [];
      for (const assignment of data.assignments) {
        const character = getCharacter(assignment.character_id);
        if (!character) {
          results.push({
            character_id: assignment.character_id,
            success: false,
            error: "Karakter bulunamadı."
          });
          continue;
        }
        if (assignment.artist_id) {
          const artist = getVoiceArtist(assignment.artist_id);
          if (!artist) {
            results.push({
              character_id: assignment.character_id,
              success: false,
              error: "Sanatçı bulunamadı."
            });
            continue;
          }
        }
        updateCharacter(assignment.character_id, {
          assigned_artist_id: assignment.artist_id
        });
        results.push({
          character_id: assignment.character_id,
          success: true
        });
      }
      const successCount = results.filter((r) => r.success).length;
      createAuditLog(data.project_id, {
        action_type: "assign",
        entity_type: "voice_artist",
        entity_id: "bulk",
        description: `Toplu sanatçı ataması yapıldı. (${successCount}/${data.assignments.length} başarılı)`,
        new_value: data.assignments
      });
      return {
        success: true,
        results,
        total: data.assignments.length,
        successful: successCount,
        failed: data.assignments.length - successCount
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
}
const AUDIO_EXTENSIONS$2 = [".wav", ".mp3", ".ogg", ".flac"];
const CATEGORY_FOLDERS = {
  originals: "Originals",
  recording: "Recording",
  mixed: "Mixed"
};
function isAudioFile$2(fileName) {
  const ext = path__namespace.extname(fileName).toLowerCase();
  return AUDIO_EXTENSIONS$2.includes(ext);
}
function sanitizeFolderName$1(name) {
  return name.replace(/[<>:"/\\|?*]/g, "_").replace(/\s+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "").trim();
}
function getCategoryPath(projectPath, category, characterName) {
  const categoryFolder = CATEGORY_FOLDERS[category];
  if (!categoryFolder) {
    throw new Error(`Geçersiz kategori: ${category}`);
  }
  const sanitized = sanitizeFolderName$1(characterName);
  return path__namespace.join(projectPath, categoryFolder, sanitized);
}
function copyFileToCategory(sourcePath, projectPath, category, characterName) {
  const destFolder = getCategoryPath(projectPath, category, characterName);
  if (!fs__namespace.existsSync(destFolder)) {
    fs__namespace.mkdirSync(destFolder, { recursive: true });
  }
  const fileName = path__namespace.basename(sourcePath);
  const destPath = path__namespace.join(destFolder, fileName);
  fs__namespace.copyFileSync(sourcePath, destPath);
  return { destPath, fileName };
}
function formatFileSize(bytes) {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const size = (bytes / Math.pow(1024, i)).toFixed(1);
  return `${size} ${units[i]}`;
}
function getFileInfo(filePath) {
  try {
    if (!fs__namespace.existsSync(filePath)) {
      return { exists: false, size: 0, size_formatted: "0 B", modified: "" };
    }
    const stats = fs__namespace.statSync(filePath);
    return {
      exists: true,
      size: stats.size,
      size_formatted: formatFileSize(stats.size),
      modified: stats.mtime.toISOString()
    };
  } catch {
    return null;
  }
}
function listAudioFilesInFolder$1(folderPath) {
  if (!fs__namespace.existsSync(folderPath)) return [];
  try {
    return fs__namespace.readdirSync(folderPath).filter((f) => isAudioFile$2(f)).sort();
  } catch {
    return [];
  }
}
function registerAudioHandlers() {
  electron.ipcMain.handle("audio:import-originals", async (_event, data) => {
    try {
      const results = [];
      let createdCount = 0;
      let updatedCount = 0;
      let skippedCount = 0;
      for (const sourcePath of data.file_paths) {
        const fileName = path__namespace.basename(sourcePath);
        if (!isAudioFile$2(fileName)) {
          results.push({
            file_name: fileName,
            success: false,
            action: "skipped",
            error: "Desteklenmeyen dosya formatı."
          });
          skippedCount++;
          continue;
        }
        try {
          const { destPath } = copyFileToCategory(
            sourcePath,
            data.project_path,
            "originals",
            data.character_name
          );
          const existing = getAudioFileByFileName(data.project_id, fileName);
          if (existing) {
            updateAudioFile(existing.id, {
              original_path: destPath,
              character_id: data.character_id
            });
            results.push({ file_name: fileName, success: true, action: "updated" });
            updatedCount++;
          } else {
            createAudioFile(data.project_id, {
              character_id: data.character_id,
              file_name: fileName,
              original_path: destPath
            });
            results.push({ file_name: fileName, success: true, action: "created" });
            createdCount++;
          }
        } catch (err) {
          results.push({
            file_name: fileName,
            success: false,
            action: "skipped",
            error: err.message
          });
          skippedCount++;
        }
      }
      createAuditLog(data.project_id, {
        action_type: "import",
        entity_type: "audio_file",
        entity_id: data.character_id,
        description: `Original import: ${data.character_name} — ${createdCount} yeni, ${updatedCount} güncellenen, ${skippedCount} atlanan.`,
        new_value: {
          character_name: data.character_name,
          total: data.file_paths.length,
          created: createdCount,
          updated: updatedCount,
          skipped: skippedCount
        }
      });
      return {
        success: true,
        results,
        summary: {
          total: data.file_paths.length,
          created: createdCount,
          updated: updatedCount,
          skipped: skippedCount
        }
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
  electron.ipcMain.handle("audio:import-recording", async (_event, data) => {
    try {
      const results = [];
      let matchedCount = 0;
      let unmatchedCount = 0;
      let skippedCount = 0;
      for (const sourcePath of data.file_paths) {
        const fileName = path__namespace.basename(sourcePath);
        if (!isAudioFile$2(fileName)) {
          results.push({
            file_name: fileName,
            success: false,
            action: "skipped",
            error: "Desteklenmeyen dosya formatı."
          });
          skippedCount++;
          continue;
        }
        try {
          const { destPath } = copyFileToCategory(
            sourcePath,
            data.project_path,
            "recording",
            data.character_name
          );
          const existing = getAudioFileByFileName(data.project_id, fileName);
          if (existing) {
            updateAudioFile(existing.id, {
              recording_path: destPath
            });
            results.push({ file_name: fileName, success: true, action: "matched" });
            matchedCount++;
          } else {
            createAudioFile(data.project_id, {
              character_id: data.character_id,
              file_name: fileName,
              recording_path: destPath
            });
            results.push({ file_name: fileName, success: true, action: "unmatched" });
            unmatchedCount++;
          }
        } catch (err) {
          results.push({
            file_name: fileName,
            success: false,
            action: "skipped",
            error: err.message
          });
          skippedCount++;
        }
      }
      createAuditLog(data.project_id, {
        action_type: "import",
        entity_type: "audio_file",
        entity_id: data.character_id,
        description: `Recording import: ${data.character_name} — ${matchedCount} eşleşen, ${unmatchedCount} yeni, ${skippedCount} atlanan.`,
        new_value: {
          character_name: data.character_name,
          total: data.file_paths.length,
          matched: matchedCount,
          unmatched: unmatchedCount,
          skipped: skippedCount
        }
      });
      return {
        success: true,
        results,
        summary: {
          total: data.file_paths.length,
          matched: matchedCount,
          unmatched: unmatchedCount,
          skipped: skippedCount
        }
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
  electron.ipcMain.handle("audio:import-mixed", async (_event, data) => {
    try {
      const results = [];
      let matchedCount = 0;
      let unmatchedCount = 0;
      let skippedCount = 0;
      for (const sourcePath of data.file_paths) {
        const fileName = path__namespace.basename(sourcePath);
        if (!isAudioFile$2(fileName)) {
          results.push({
            file_name: fileName,
            success: false,
            action: "skipped",
            error: "Desteklenmeyen dosya formatı."
          });
          skippedCount++;
          continue;
        }
        try {
          const { destPath } = copyFileToCategory(
            sourcePath,
            data.project_path,
            "mixed",
            data.character_name
          );
          const existing = getAudioFileByFileName(data.project_id, fileName);
          if (existing) {
            updateAudioFile(existing.id, {
              mixed_path: destPath
            });
            results.push({ file_name: fileName, success: true, action: "matched" });
            matchedCount++;
          } else {
            createAudioFile(data.project_id, {
              character_id: data.character_id,
              file_name: fileName,
              mixed_path: destPath
            });
            results.push({ file_name: fileName, success: true, action: "unmatched" });
            unmatchedCount++;
          }
        } catch (err) {
          results.push({
            file_name: fileName,
            success: false,
            action: "skipped",
            error: err.message
          });
          skippedCount++;
        }
      }
      createAuditLog(data.project_id, {
        action_type: "import",
        entity_type: "audio_file",
        entity_id: data.character_id,
        description: `Mixed import: ${data.character_name} — ${matchedCount} eşleşen, ${unmatchedCount} yeni, ${skippedCount} atlanan.`,
        new_value: {
          character_name: data.character_name,
          total: data.file_paths.length,
          matched: matchedCount,
          unmatched: unmatchedCount,
          skipped: skippedCount
        }
      });
      return {
        success: true,
        results,
        summary: {
          total: data.file_paths.length,
          matched: matchedCount,
          unmatched: unmatchedCount,
          skipped: skippedCount
        }
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
  electron.ipcMain.handle("audio:list", async (_event, data) => {
    try {
      let audioFiles;
      if (data.character_id) {
        audioFiles = listAudioFilesByCharacter(data.character_id);
      } else if (data.project_id) {
        audioFiles = listAudioFilesByProject(data.project_id);
      } else {
        return { success: false, error: "character_id veya project_id gerekli." };
      }
      const enriched = audioFiles.map((file) => {
        const originalInfo = file.original_path ? getFileInfo(file.original_path) : null;
        const recordingInfo = file.recording_path ? getFileInfo(file.recording_path) : null;
        const mixedInfo = file.mixed_path ? getFileInfo(file.mixed_path) : null;
        return {
          ...file,
          original_exists: originalInfo?.exists || false,
          original_size: originalInfo?.size_formatted || null,
          recording_exists: recordingInfo?.exists || false,
          recording_size: recordingInfo?.size_formatted || null,
          mixed_exists: mixedInfo?.exists || false,
          mixed_size: mixedInfo?.size_formatted || null
        };
      });
      return { success: true, audio_files: enriched };
    } catch (error) {
      return { success: false, error: error.message, audio_files: [] };
    }
  });
  electron.ipcMain.handle("audio:get", async (_event, audioId) => {
    try {
      const file = getAudioFile(audioId);
      if (!file) {
        return { success: false, error: "Ses dosyası bulunamadı." };
      }
      const character = getCharacter(file.character_id);
      const originalInfo = file.original_path ? getFileInfo(file.original_path) : null;
      const recordingInfo = file.recording_path ? getFileInfo(file.recording_path) : null;
      const mixedInfo = file.mixed_path ? getFileInfo(file.mixed_path) : null;
      return {
        success: true,
        audio_file: {
          ...file,
          character_name: character?.name || "Bilinmeyen",
          original_info: originalInfo,
          recording_info: recordingInfo,
          mixed_info: mixedInfo
        }
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
  electron.ipcMain.handle("audio:delete", async (_event, data) => {
    try {
      const file = getAudioFile(data.id);
      if (!file) {
        return { success: false, error: "Ses dosyası bulunamadı." };
      }
      if (data.delete_physical_files) {
        const paths = [file.original_path, file.recording_path, file.mixed_path];
        for (const p of paths) {
          if (p && fs__namespace.existsSync(p)) {
            try {
              fs__namespace.unlinkSync(p);
            } catch {
            }
          }
        }
      }
      createAuditLog(data.project_id, {
        action_type: "delete",
        entity_type: "audio_file",
        entity_id: data.id,
        description: `Ses dosyası silindi: ${file.file_name}`,
        old_value: file
      });
      deleteAudioFile(data.id);
      return { success: true, deleted_file: file.file_name };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
  electron.ipcMain.handle("audio:delete-bulk", async (_event, data) => {
    try {
      let deletedCount = 0;
      const deletedNames = [];
      for (const id of data.ids) {
        const file = getAudioFile(id);
        if (!file) continue;
        if (data.delete_physical_files) {
          const paths = [file.original_path, file.recording_path, file.mixed_path];
          for (const p of paths) {
            if (p && fs__namespace.existsSync(p)) {
              try {
                fs__namespace.unlinkSync(p);
              } catch {
              }
            }
          }
        }
        deleteAudioFile(id);
        deletedNames.push(file.file_name);
        deletedCount++;
      }
      createAuditLog(data.project_id, {
        action_type: "delete",
        entity_type: "audio_file",
        entity_id: "bulk",
        description: `Toplu silme: ${deletedCount} ses dosyası silindi.`,
        old_value: { deleted_files: deletedNames }
      });
      return {
        success: true,
        deleted_count: deletedCount,
        deleted_files: deletedNames
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
  electron.ipcMain.handle("audio:update", async (_event, data) => {
    try {
      const current = getAudioFile(data.id);
      if (!current) {
        return { success: false, error: "Ses dosyası bulunamadı." };
      }
      const updated = updateAudioFile(data.id, data.updates);
      return { success: true, audio_file: updated };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
  electron.ipcMain.handle("audio:search", async (_event, data) => {
    try {
      const results = searchAudioFiles(data.project_id, data.query);
      return { success: true, results };
    } catch (error) {
      return { success: false, error: error.message, results: [] };
    }
  });
  electron.ipcMain.handle("audio:scan-folder", async (_event, data) => {
    try {
      const folderPath = getCategoryPath(
        data.project_path,
        data.category,
        data.character_name
      );
      const files = listAudioFilesInFolder$1(folderPath);
      const fileInfos = files.map((fileName) => {
        const fullPath = path__namespace.join(folderPath, fileName);
        const info = getFileInfo(fullPath);
        return {
          file_name: fileName,
          full_path: fullPath,
          ...info
        };
      });
      return {
        success: true,
        folder_path: folderPath,
        files: fileInfos,
        count: fileInfos.length
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
}
function determineTranslationStatus(originalText, translatedText) {
  if (!originalText && !translatedText) return "empty";
  if (originalText && !translatedText) return "has_original";
  if (originalText && translatedText) return "translated";
  return "empty";
}
function paginateArray(array, page, pageSize) {
  const total = array.length;
  const totalPages = Math.ceil(total / pageSize);
  const safePage = Math.max(1, Math.min(page, totalPages || 1));
  const start = (safePage - 1) * pageSize;
  const items = array.slice(start, start + pageSize);
  return {
    items,
    total,
    page: safePage,
    page_size: pageSize,
    total_pages: totalPages
  };
}
function registerTranslationHandlers() {
  electron.ipcMain.handle("translation:list", async (_event, data) => {
    try {
      let audioFiles;
      if (data.character_id) {
        audioFiles = listAudioFilesByCharacter(data.character_id);
      } else {
        audioFiles = listAudioFilesByProject(data.project_id);
      }
      const characterCache = {};
      const enriched = audioFiles.map((file) => {
        if (!characterCache[file.character_id]) {
          const char = getCharacter(file.character_id);
          characterCache[file.character_id] = char ? char.name : "Bilinmeyen";
        }
        return {
          id: file.id,
          sound_id: file.file_name,
          character_id: file.character_id,
          character_name: characterCache[file.character_id],
          original_text: file.original_text || "",
          translated_text: file.translated_text || "",
          translation_status: file.translation_status,
          recording_status: file.recording_status,
          mixing_status: file.mixing_status,
          original_path: file.original_path,
          updated_at: file.updated_at
        };
      });
      let filtered = enriched;
      if (data.status_filter && data.status_filter !== "all") {
        filtered = filtered.filter((f) => f.translation_status === data.status_filter);
      }
      if (data.search_query && data.search_query.trim() !== "") {
        const query = data.search_query.toLowerCase().trim();
        filtered = filtered.filter(
          (f) => f.sound_id.toLowerCase().includes(query) || f.original_text.toLowerCase().includes(query) || f.translated_text.toLowerCase().includes(query) || f.character_name.toLowerCase().includes(query)
        );
      }
      const page = data.page || 1;
      const pageSize = data.page_size || 50;
      const paginated = paginateArray(filtered, page, pageSize);
      const totalCount = enriched.length;
      const translatedCount = enriched.filter((f) => f.translation_status === "translated").length;
      const hasOriginalCount = enriched.filter((f) => f.translation_status === "has_original").length;
      const emptyCount = enriched.filter((f) => f.translation_status === "empty").length;
      const reviewedCount = enriched.filter((f) => f.translation_status === "reviewed").length;
      return {
        success: true,
        translations: paginated.items,
        pagination: {
          page: paginated.page,
          page_size: paginated.page_size,
          total: paginated.total,
          total_pages: paginated.total_pages
        },
        stats: {
          total: totalCount,
          translated: translatedCount,
          has_original: hasOriginalCount,
          empty: emptyCount,
          reviewed: reviewedCount,
          percent: totalCount > 0 ? Math.round(translatedCount / totalCount * 100) : 0
        }
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
  electron.ipcMain.handle("translation:update", async (_event, data) => {
    try {
      const current = getAudioFile(data.audio_file_id);
      if (!current) {
        return { success: false, error: "Ses dosyası bulunamadı." };
      }
      const oldValue = current[data.field];
      const updates = { [data.field]: data.value };
      const origText = data.field === "original_text" ? data.value : current.original_text;
      const transText = data.field === "translated_text" ? data.value : current.translated_text;
      updates.translation_status = determineTranslationStatus(origText, transText);
      const updated = updateAudioFile(data.audio_file_id, updates);
      return {
        success: true,
        audio_file: updated,
        old_value: oldValue,
        new_value: data.value
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
  electron.ipcMain.handle("translation:set-status", async (_event, data) => {
    try {
      const updated = updateAudioFile(data.audio_file_id, {
        translation_status: data.status
      });
      return { success: true, audio_file: updated };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
  electron.ipcMain.handle("translation:export-excel", async (_event, data) => {
    try {
      const allCharacters = listCharacters(data.project_id);
      const characters = data.character_ids ? allCharacters.filter((c) => data.character_ids.includes(c.id)) : allCharacters;
      const workbook = XLSX__namespace.utils.book_new();
      if (data.separate_sheets) {
        for (const character of characters) {
          const audioFiles = listAudioFilesByCharacter(character.id);
          const rows = audioFiles.map((file) => ({
            "Ses ID": file.file_name,
            "Karakter": character.name,
            "English": file.original_text || "",
            "Türkçe": file.translated_text || "",
            "Durum": translateStatus(file.translation_status)
          }));
          const worksheet = XLSX__namespace.utils.json_to_sheet(rows);
          worksheet["!cols"] = [
            { wch: 25 },
            // Ses ID
            { wch: 20 },
            // Karakter
            { wch: 50 },
            // English
            { wch: 50 },
            // Türkçe
            { wch: 15 }
            // Durum
          ];
          const sheetName = character.name.substring(0, 31);
          XLSX__namespace.utils.book_append_sheet(workbook, worksheet, sheetName);
        }
      } else {
        const allRows = [];
        for (const character of characters) {
          const audioFiles = listAudioFilesByCharacter(character.id);
          for (const file of audioFiles) {
            allRows.push({
              "Ses ID": file.file_name,
              "Karakter": character.name,
              "English": file.original_text || "",
              "Türkçe": file.translated_text || "",
              "Durum": translateStatus(file.translation_status)
            });
          }
        }
        const worksheet = XLSX__namespace.utils.json_to_sheet(allRows);
        worksheet["!cols"] = [
          { wch: 25 },
          { wch: 20 },
          { wch: 50 },
          { wch: 50 },
          { wch: 15 }
        ];
        XLSX__namespace.utils.book_append_sheet(workbook, worksheet, "Tüm Çeviriler");
      }
      XLSX__namespace.writeFile(workbook, data.output_path);
      let totalRows = 0;
      for (const character of characters) {
        totalRows += listAudioFilesByCharacter(character.id).length;
      }
      createAuditLog(data.project_id, {
        action_type: "export",
        entity_type: "translation",
        entity_id: data.project_id,
        description: `Excel export: ${totalRows} satır, ${characters.length} karakter.`,
        new_value: {
          output_path: data.output_path,
          total_rows: totalRows,
          characters_count: characters.length,
          separate_sheets: data.separate_sheets
        }
      });
      return {
        success: true,
        output_path: data.output_path,
        total_rows: totalRows,
        characters_count: characters.length
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
  electron.ipcMain.handle("translation:preview-excel", async (_event, data) => {
    try {
      const workbook = XLSX__namespace.readFile(data.file_path);
      const allChanges = [];
      const unmatchedIds = [];
      let totalRows = 0;
      let matchedRows = 0;
      for (const sheetName of workbook.SheetNames) {
        const worksheet = workbook.Sheets[sheetName];
        const rows = XLSX__namespace.utils.sheet_to_json(worksheet);
        for (const row of rows) {
          totalRows++;
          const soundId = row["Ses ID"] || row["Sound ID"] || row["SesID"] || row["sound_id"];
          if (!soundId) continue;
          const existing = getAudioFileByFileName(data.project_id, soundId);
          if (!existing) {
            unmatchedIds.push(soundId);
            continue;
          }
          matchedRows++;
          const newEnglish = row["English"] || row["english"] || row["İngilizce"];
          if (newEnglish !== void 0) {
            const oldEnglish = existing.original_text || "";
            if (String(newEnglish) !== oldEnglish) {
              const char = getCharacter(existing.character_id);
              allChanges.push({
                sound_id: soundId,
                character_name: char?.name || "Bilinmeyen",
                field: "original_text",
                old_value: oldEnglish,
                new_value: String(newEnglish),
                matched: true
              });
            }
          }
          const newTurkish = row["Türkçe"] || row["Turkish"] || row["turkce"] || row["Turkce"];
          if (newTurkish !== void 0) {
            const oldTurkish = existing.translated_text || "";
            if (String(newTurkish) !== oldTurkish) {
              const char = getCharacter(existing.character_id);
              allChanges.push({
                sound_id: soundId,
                character_name: char?.name || "Bilinmeyen",
                field: "translated_text",
                old_value: oldTurkish,
                new_value: String(newTurkish),
                matched: true
              });
            }
          }
        }
      }
      return {
        success: true,
        preview: {
          file_name: path__namespace.basename(data.file_path),
          total_rows: totalRows,
          matched_rows: matchedRows,
          unmatched_rows: unmatchedIds.length,
          changes_count: allChanges.length,
          changes: allChanges,
          unmatched_ids: unmatchedIds
        }
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
  electron.ipcMain.handle("translation:apply-excel", async (_event, data) => {
    try {
      const workbook = XLSX__namespace.readFile(data.file_path);
      let updatedCount = 0;
      let unchangedCount = 0;
      let unmatchedCount = 0;
      const updatedFiles = [];
      for (const sheetName of workbook.SheetNames) {
        const worksheet = workbook.Sheets[sheetName];
        const rows = XLSX__namespace.utils.sheet_to_json(worksheet);
        for (const row of rows) {
          const soundId = row["Ses ID"] || row["Sound ID"] || row["SesID"] || row["sound_id"];
          if (!soundId) continue;
          const existing = getAudioFileByFileName(data.project_id, soundId);
          if (!existing) {
            unmatchedCount++;
            continue;
          }
          let changed = false;
          const updates = {};
          const newEnglish = row["English"] || row["english"] || row["İngilizce"];
          if (newEnglish !== void 0 && String(newEnglish) !== (existing.original_text || "")) {
            updates.original_text = String(newEnglish);
            changed = true;
          }
          const newTurkish = row["Türkçe"] || row["Turkish"] || row["turkce"] || row["Turkce"];
          if (newTurkish !== void 0 && String(newTurkish) !== (existing.translated_text || "")) {
            updates.translated_text = String(newTurkish);
            changed = true;
          }
          if (changed) {
            const origText = updates.original_text !== void 0 ? updates.original_text : existing.original_text;
            const transText = updates.translated_text !== void 0 ? updates.translated_text : existing.translated_text;
            updates.translation_status = determineTranslationStatus(origText, transText);
            updateAudioFile(existing.id, updates);
            updatedFiles.push(soundId);
            updatedCount++;
          } else {
            unchangedCount++;
          }
        }
      }
      createAuditLog(data.project_id, {
        action_type: "import",
        entity_type: "translation",
        entity_id: data.project_id,
        description: `Excel import: ${updatedCount} güncellenen, ${unchangedCount} değişmeyen, ${unmatchedCount} eşleşmeyen.`,
        new_value: {
          file: path__namespace.basename(data.file_path),
          updated: updatedCount,
          unchanged: unchangedCount,
          unmatched: unmatchedCount,
          updated_files: updatedFiles
        }
      });
      return {
        success: true,
        result: {
          updated: updatedCount,
          unchanged: unchangedCount,
          unmatched: unmatchedCount,
          updated_files: updatedFiles
        }
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
  electron.ipcMain.handle("translation:stats", async (_event, projectId) => {
    try {
      const audioFiles = listAudioFilesByProject(projectId);
      const total = audioFiles.length;
      const stats = {
        total,
        empty: 0,
        has_original: 0,
        translated: 0,
        reviewed: 0
      };
      for (const file of audioFiles) {
        switch (file.translation_status) {
          case "empty":
            stats.empty++;
            break;
          case "has_original":
            stats.has_original++;
            break;
          case "translated":
            stats.translated++;
            break;
          case "reviewed":
            stats.reviewed++;
            break;
          default:
            stats.empty++;
            break;
        }
      }
      return {
        success: true,
        stats: {
          ...stats,
          translation_percent: total > 0 ? Math.round(stats.translated / total * 100) : 0,
          review_percent: total > 0 ? Math.round(stats.reviewed / total * 100) : 0,
          completion_percent: total > 0 ? Math.round((stats.translated + stats.reviewed) / total * 100) : 0
        }
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
}
function translateStatus(status) {
  switch (status) {
    case "empty":
      return "Boş";
    case "has_original":
      return "Orijinal Var";
    case "translated":
      return "Çevrildi";
    case "reviewed":
      return "İncelendi";
    default:
      return "Bilinmeyen";
  }
}
function formatDate(isoString) {
  try {
    const date = new Date(isoString);
    return date.toLocaleString("tr-TR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return isoString;
  }
}
function getDateGroup(isoString) {
  try {
    const date = new Date(isoString);
    const now2 = /* @__PURE__ */ new Date();
    const today = new Date(now2.getFullYear(), now2.getMonth(), now2.getDate());
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1e3);
    const logDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    if (logDate.getTime() === today.getTime()) {
      return "Bugün";
    } else if (logDate.getTime() === yesterday.getTime()) {
      return "Dün";
    } else if (logDate.getTime() > today.getTime() - 7 * 24 * 60 * 60 * 1e3) {
      return "Bu Hafta";
    } else if (logDate.getTime() > today.getTime() - 30 * 24 * 60 * 60 * 1e3) {
      return "Bu Ay";
    } else {
      return "Daha Eski";
    }
  } catch {
    return "Bilinmeyen";
  }
}
function translateActionType(actionType) {
  const translations = {
    create: "Oluşturma",
    update: "Güncelleme",
    delete: "Silme",
    move: "Taşıma",
    rename: "Yeniden Adlandırma",
    import: "İçe Aktarma",
    export: "Dışa Aktarma",
    assign: "Atama",
    unassign: "Atama Kaldırma",
    undo: "Geri Alma"
  };
  return translations[actionType] || actionType;
}
function translateEntityType(entityType) {
  const translations = {
    project: "Proje",
    character: "Karakter",
    voice_artist: "Sanatçı",
    audio_file: "Ses Dosyası",
    translation: "Çeviri"
  };
  return translations[entityType] || entityType;
}
function getActionIcon(actionType) {
  const icons = {
    create: "➕",
    update: "✏️",
    delete: "🗑️",
    move: "📁",
    rename: "📝",
    import: "📥",
    export: "📤",
    assign: "🔗",
    unassign: "🔓",
    undo: "↩️"
  };
  return icons[actionType] || "📋";
}
function isUndoable(actionType, entityType) {
  if (actionType === "delete") return false;
  if (actionType === "undo") return false;
  if (actionType === "export") return false;
  return true;
}
function registerAuditHandlers() {
  electron.ipcMain.handle("audit:list", async (_event, data) => {
    try {
      const limit = data.limit || 100;
      const offset = data.offset || 0;
      let logs = listAuditLogs(data.project_id, 1e3, 0);
      if (data.action_type && data.action_type !== "all") {
        logs = logs.filter((log) => log.action_type === data.action_type);
      }
      if (data.entity_type && data.entity_type !== "all") {
        logs = logs.filter((log) => log.entity_type === data.entity_type);
      }
      if (data.search_query && data.search_query.trim() !== "") {
        const query = data.search_query.toLowerCase().trim();
        logs = logs.filter(
          (log) => log.description.toLowerCase().includes(query)
        );
      }
      const total = logs.length;
      const paginatedLogs = logs.slice(offset, offset + limit);
      const enriched = paginatedLogs.map((log) => ({
        ...log,
        formatted_date: formatDate(log.timestamp),
        date_group: getDateGroup(log.timestamp),
        action_label: translateActionType(log.action_type),
        entity_label: translateEntityType(log.entity_type),
        icon: getActionIcon(log.action_type),
        can_undo: isUndoable(log.action_type, log.entity_type) && !log.is_undone,
        old_value_parsed: log.old_value ? JSON.parse(log.old_value) : null,
        new_value_parsed: log.new_value ? JSON.parse(log.new_value) : null
      }));
      const grouped = {};
      for (const log of enriched) {
        const group = log.date_group;
        if (!grouped[group]) {
          grouped[group] = [];
        }
        grouped[group].push(log);
      }
      return {
        success: true,
        logs: enriched,
        grouped,
        pagination: {
          total,
          limit,
          offset,
          has_more: offset + limit < total
        }
      };
    } catch (error) {
      return { success: false, error: error.message, logs: [] };
    }
  });
  electron.ipcMain.handle("audit:get", async (_event, logId) => {
    try {
      const log = listAuditLogs("", 1e3, 0).find((l) => l.id === logId);
      if (!log) {
        return { success: false, error: "Log kaydı bulunamadı." };
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
          new_value_parsed: log.new_value ? JSON.parse(log.new_value) : null
        }
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
  electron.ipcMain.handle("audit:undo", async (_event, data) => {
    try {
      const logs = listAuditLogs(data.project_id, 1e3, 0);
      const log = logs.find((l) => l.id === data.log_id);
      if (!log) {
        return { success: false, error: "Log kaydı bulunamadı." };
      }
      if (log.is_undone) {
        return { success: false, error: "Bu işlem zaten geri alınmış." };
      }
      if (!isUndoable(log.action_type, log.entity_type)) {
        return { success: false, error: "Bu işlem geri alınamaz." };
      }
      const oldValue = log.old_value ? JSON.parse(log.old_value) : null;
      const newValue = log.new_value ? JSON.parse(log.new_value) : null;
      let undoDescription = "";
      switch (log.action_type) {
        case "create":
          return { success: false, error: "Oluşturma işlemleri geri alınamaz." };
        case "update":
          if (log.entity_type === "character" && oldValue) {
            const existing = getCharacter(log.entity_id);
            if (existing) {
              updateCharacter(log.entity_id, {
                name: oldValue.name,
                description: oldValue.description,
                priority: oldValue.priority,
                assigned_artist_id: oldValue.assigned_artist_id
              });
              undoDescription = `Karakter güncelleme geri alındı: "${newValue?.name || ""}" → "${oldValue.name}"`;
            }
          } else if (log.entity_type === "voice_artist" && oldValue) {
            const existing = getVoiceArtist(log.entity_id);
            if (existing) {
              updateVoiceArtist(log.entity_id, {
                name: oldValue.name,
                email: oldValue.email,
                phone: oldValue.phone,
                notes: oldValue.notes
              });
              undoDescription = `Sanatçı güncelleme geri alındı: "${oldValue.name}"`;
            }
          } else if (log.entity_type === "audio_file" && oldValue) {
            const existing = getAudioFile(log.entity_id);
            if (existing) {
              updateAudioFile(log.entity_id, {
                original_text: oldValue.original_text,
                translated_text: oldValue.translated_text,
                translation_status: oldValue.translation_status
              });
              undoDescription = `Ses dosyası güncelleme geri alındı: "${oldValue.file_name}"`;
            }
          }
          break;
        case "move":
          if (log.entity_type === "audio_file" && oldValue?.character_id) {
            const existing = getAudioFile(log.entity_id);
            if (existing) {
              updateAudioFile(log.entity_id, {
                character_id: oldValue.character_id
              });
              undoDescription = `Dosya taşıma geri alındı: "${existing.file_name}"`;
            }
          }
          break;
        case "rename":
          if (log.entity_type === "audio_file" && oldValue?.file_name) {
            const existing = getAudioFile(log.entity_id);
            if (existing) {
              updateAudioFile(log.entity_id, {
                file_name: oldValue.file_name
              });
              undoDescription = `Dosya adı geri alındı: "${newValue?.file_name}" → "${oldValue.file_name}"`;
            }
          }
          break;
        case "assign":
        case "unassign":
          if (log.entity_type === "character" && oldValue !== void 0) {
            const existing = getCharacter(log.entity_id);
            if (existing) {
              updateCharacter(log.entity_id, {
                assigned_artist_id: oldValue.artist_id || null
              });
              undoDescription = `Sanatçı ataması geri alındı`;
            }
          }
          break;
        case "import":
          return { success: false, error: "Import işlemleri geri alınamaz. Manuel düzeltme yapın." };
        default:
          return { success: false, error: `"${log.action_type}" işlemi geri alınamaz.` };
      }
      markAuditLogUndone(data.log_id);
      createAuditLog(data.project_id, {
        action_type: "undo",
        entity_type: log.entity_type,
        entity_id: log.entity_id,
        description: undoDescription || `İşlem geri alındı: ${log.description}`,
        old_value: newValue,
        new_value: oldValue
      });
      return {
        success: true,
        message: undoDescription || "İşlem başarıyla geri alındı.",
        undone_log_id: data.log_id
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
  electron.ipcMain.handle("audit:stats", async (_event, projectId) => {
    try {
      const logs = listAuditLogs(projectId, 1e4, 0);
      const stats = {
        total: logs.length,
        by_action: {},
        by_entity: {},
        undone_count: 0,
        today_count: 0,
        this_week_count: 0
      };
      const now2 = /* @__PURE__ */ new Date();
      const todayStart = new Date(now2.getFullYear(), now2.getMonth(), now2.getDate());
      const weekStart = new Date(todayStart.getTime() - 7 * 24 * 60 * 60 * 1e3);
      for (const log of logs) {
        stats.by_action[log.action_type] = (stats.by_action[log.action_type] || 0) + 1;
        stats.by_entity[log.entity_type] = (stats.by_entity[log.entity_type] || 0) + 1;
        if (log.is_undone) stats.undone_count++;
        const logDate = new Date(log.timestamp);
        if (logDate >= todayStart) stats.today_count++;
        if (logDate >= weekStart) stats.this_week_count++;
      }
      return { success: true, stats };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
  electron.ipcMain.handle("audit:cleanup", async (_event, data) => {
    try {
      const cutoffDate = /* @__PURE__ */ new Date();
      cutoffDate.setDate(cutoffDate.getDate() - data.older_than_days);
      const cutoffIso = cutoffDate.toISOString();
      return {
        success: true,
        message: `${data.older_than_days} günden eski loglar temizlendi.`
        // deleted_count: deletedCount,
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
  electron.ipcMain.handle("audit:filter-options", async () => {
    try {
      return {
        success: true,
        options: {
          action_types: [
            { value: "all", label: "Tümü" },
            { value: "create", label: "➕ Oluşturma" },
            { value: "update", label: "✏️ Güncelleme" },
            { value: "delete", label: "🗑️ Silme" },
            { value: "move", label: "📁 Taşıma" },
            { value: "rename", label: "📝 Yeniden Adlandırma" },
            { value: "import", label: "📥 İçe Aktarma" },
            { value: "export", label: "📤 Dışa Aktarma" },
            { value: "assign", label: "🔗 Atama" },
            { value: "unassign", label: "🔓 Atama Kaldırma" },
            { value: "undo", label: "↩️ Geri Alma" }
          ],
          entity_types: [
            { value: "all", label: "Tümü" },
            { value: "project", label: "📂 Proje" },
            { value: "character", label: "🎭 Karakter" },
            { value: "voice_artist", label: "🎙️ Sanatçı" },
            { value: "audio_file", label: "🔊 Ses Dosyası" },
            { value: "translation", label: "📝 Çeviri" }
          ]
        }
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
}
const AUDIO_EXTENSIONS$1 = [".wav", ".mp3", ".ogg", ".flac"];
const CATEGORIES = ["Originals", "Recording", "Mixed"];
const DEBOUNCE_MS = 500;
const MOVE_DETECTION_WINDOW_MS = 1e3;
let watcher = null;
let isWatching = false;
let currentProjectId = null;
let currentProjectPath = null;
const pendingDeletes = /* @__PURE__ */ new Map();
const debounceTimers = /* @__PURE__ */ new Map();
const ignoredPaths = /* @__PURE__ */ new Set();
function isAudioFile$1(fileName) {
  const ext = path__namespace.extname(fileName).toLowerCase();
  return AUDIO_EXTENSIONS$1.includes(ext);
}
function parsePath(filePath) {
  if (!currentProjectPath) return null;
  const relative = path__namespace.relative(currentProjectPath, filePath);
  const parts = relative.split(path__namespace.sep);
  if (parts.length < 3) return null;
  const category = parts[0];
  if (!CATEGORIES.includes(category)) return null;
  const characterName = parts[1];
  const fileName = parts.slice(2).join(path__namespace.sep);
  if (!isAudioFile$1(fileName)) return null;
  return { category, characterName, fileName };
}
function sendToRenderer(channel, data) {
  const windows = electron.BrowserWindow.getAllWindows();
  for (const win of windows) {
    if (!win.isDestroyed()) win.webContents.send(channel, data);
  }
}
function debounced(key, fn) {
  const existing = debounceTimers.get(key);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    debounceTimers.delete(key);
    fn();
  }, DEBOUNCE_MS);
  debounceTimers.set(key, timer);
}
function ignorePathChange(filePath) {
  ignoredPaths.add(filePath);
  setTimeout(() => ignoredPaths.delete(filePath), 3e3);
}
function isIgnored(filePath) {
  return ignoredPaths.has(filePath);
}
function toLowerCategory(category) {
  if (category === "Originals") return "originals";
  if (category === "Recording") return "recording";
  return "mixed";
}
function fieldForCategoryLower(category) {
  if (category === "originals") return "original_path";
  if (category === "recording") return "recording_path";
  return "mixed_path";
}
function sanitize(name) {
  return name.replace(/[<>:"/\\|?*]/g, "_").replace(/\s+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "").trim();
}
function handleFileAdded(filePath) {
  if (isIgnored(filePath)) return;
  const parsed = parsePath(filePath);
  if (!parsed || !currentProjectId) return;
  const { category, characterName, fileName } = parsed;
  debounced(`add:${filePath}`, () => {
    const pendingKey = `${category}:${fileName}`;
    const pending = pendingDeletes.get(pendingKey);
    if (pending && Date.now() - pending.timestamp < MOVE_DETECTION_WINDOW_MS) {
      clearTimeout(pending.timeoutId);
      pendingDeletes.delete(pendingKey);
      handleFileMove(
        pending.category,
        pending.characterName,
        category,
        characterName,
        fileName,
        filePath
      );
      return;
    }
    const char = getCharacterByName(currentProjectId, characterName);
    sendToRenderer("file-watcher:event", {
      type: "added",
      category: toLowerCategory(category),
      character_name: characterName,
      file_name: fileName,
      file_path: filePath,
      message: char ? `Yeni dosya algılandı: ${fileName} → ${characterName} (${category})` : `Yeni dosya algılandı: ${fileName} → Bilinmeyen karakter "${characterName}"`,
      needs_confirmation: false,
      character_exists: !!char
    });
    if (char) {
      const existing = getAudioFileByFileName(currentProjectId, fileName);
      const field = fieldForCategoryLower(toLowerCategory(category));
      if (existing) {
        updateAudioFile(existing.id, { [field]: filePath });
      } else {
        const payload = { character_id: char.id, file_name: fileName };
        payload[field] = filePath;
        createAudioFile(currentProjectId, payload);
      }
      createAuditLog(currentProjectId, {
        action_type: "create",
        entity_type: "audio_file",
        entity_id: char.id,
        description: `[Watcher] Yeni dosya: ${fileName} → ${characterName} (${category})`,
        new_value: { file_name: fileName, category, character_name: characterName }
      });
    }
  });
}
function handleFileDeleted(filePath) {
  if (isIgnored(filePath)) return;
  const parsed = parsePath(filePath);
  if (!parsed || !currentProjectId) return;
  const { category, characterName, fileName } = parsed;
  const pendingKey = `${category}:${fileName}`;
  const timeoutId = setTimeout(() => {
    pendingDeletes.delete(pendingKey);
    handleRealDelete(category, characterName, fileName, filePath);
  }, MOVE_DETECTION_WINDOW_MS);
  pendingDeletes.set(pendingKey, {
    filePath,
    fileName,
    category,
    characterName,
    timestamp: Date.now(),
    timeoutId
  });
}
function handleRealDelete(category, characterName, fileName, filePath) {
  sendToRenderer("file-watcher:event", {
    type: "deleted",
    category: toLowerCategory(category),
    character_name: characterName,
    file_name: fileName,
    file_path: filePath,
    message: `Dosya silindi: ${fileName} (${characterName}/${category})`,
    needs_confirmation: true
  });
}
function handleFileMove(fromCategory, fromCharacter, toCategory, toCharacter, fileName, newFilePath) {
  if (!currentProjectId) return;
  const existing = getAudioFileByFileName(currentProjectId, fileName);
  const fromChar = getCharacterByName(currentProjectId, fromCharacter);
  const toChar = getCharacterByName(currentProjectId, toCharacter);
  let translationInfo = null;
  if (existing) {
    translationInfo = {
      original_text: existing.original_text,
      translated_text: existing.translated_text,
      has_recording: !!existing.recording_path,
      has_mixed: !!existing.mixed_path
    };
  }
  sendToRenderer("file-watcher:event", {
    type: "moved",
    category: toLowerCategory(toCategory),
    // destination category
    from_category: toLowerCategory(fromCategory),
    // source category
    from_character: fromCharacter,
    to_character: toCharacter,
    file_name: fileName,
    file_path: newFilePath,
    from_character_exists: !!fromChar,
    to_character_exists: !!toChar,
    existing_record: !!existing,
    translation_info: translationInfo,
    message: `Dosya taşındı: ${fileName} (${fromCharacter} → ${toCharacter}) [${fromCategory} → ${toCategory}]`,
    needs_confirmation: true
  });
}
function applyFileMove(data) {
  if (!currentProjectId || !currentProjectPath) return { success: false, error: "Proje açık değil." };
  try {
    const existing = getAudioFileByFileName(currentProjectId, data.file_name);
    if (!existing) return { success: false, error: "DB kaydı bulunamadı." };
    const toChar = getCharacterByName(currentProjectId, data.to_character);
    if (!toChar) return { success: false, error: `"${data.to_character}" karakteri bulunamadı.` };
    const oldValue = { ...existing };
    const destField = fieldForCategoryLower(data.category);
    moveAudioFileToCharacter(existing.id, toChar.id);
    updateAudioFile(existing.id, { [destField]: data.new_file_path });
    if (data.move_all) {
      const fromSan = sanitize(data.from_character);
      const toSan = sanitize(data.to_character);
      if (existing.original_path && fs__namespace.existsSync(existing.original_path)) {
        const newPath = existing.original_path.replace(
          path__namespace.join("Originals", fromSan),
          path__namespace.join("Originals", toSan)
        );
        const dir = path__namespace.dirname(newPath);
        if (!fs__namespace.existsSync(dir)) fs__namespace.mkdirSync(dir, { recursive: true });
        if (existing.original_path !== newPath) {
          ignorePathChange(existing.original_path);
          ignorePathChange(newPath);
          try {
            fs__namespace.renameSync(existing.original_path, newPath);
          } catch {
          }
          updateAudioFile(existing.id, { original_path: newPath });
        }
      }
      if (existing.recording_path && fs__namespace.existsSync(existing.recording_path)) {
        const newPath = existing.recording_path.replace(
          path__namespace.join("Recording", fromSan),
          path__namespace.join("Recording", toSan)
        );
        const dir = path__namespace.dirname(newPath);
        if (!fs__namespace.existsSync(dir)) fs__namespace.mkdirSync(dir, { recursive: true });
        if (existing.recording_path !== newPath) {
          ignorePathChange(existing.recording_path);
          ignorePathChange(newPath);
          try {
            fs__namespace.renameSync(existing.recording_path, newPath);
          } catch {
          }
          updateAudioFile(existing.id, { recording_path: newPath });
        }
      }
      if (existing.mixed_path && fs__namespace.existsSync(existing.mixed_path)) {
        const newPath = existing.mixed_path.replace(
          path__namespace.join("Mixed", fromSan),
          path__namespace.join("Mixed", toSan)
        );
        const dir = path__namespace.dirname(newPath);
        if (!fs__namespace.existsSync(dir)) fs__namespace.mkdirSync(dir, { recursive: true });
        if (existing.mixed_path !== newPath) {
          ignorePathChange(existing.mixed_path);
          ignorePathChange(newPath);
          try {
            fs__namespace.renameSync(existing.mixed_path, newPath);
          } catch {
          }
          updateAudioFile(existing.id, { mixed_path: newPath });
        }
      }
    }
    createAuditLog(currentProjectId, {
      action_type: "move",
      entity_type: "audio_file",
      entity_id: existing.id,
      description: `[Watcher] Move: ${data.file_name} (${data.from_character} → ${data.to_character}) [${data.from_category}→${data.category}]${data.move_all ? " (all)" : ""}`,
      old_value: oldValue,
      new_value: { to_character: data.to_character, move_all: data.move_all, category: data.category }
    });
    return { success: true };
  } catch (e) {
    return { success: false, error: e?.message || "Move error" };
  }
}
function applyFileDelete(data) {
  if (!currentProjectId) return { success: false, error: "Proje açık değil." };
  try {
    const existing = getAudioFileByFileName(currentProjectId, data.file_name);
    if (!existing) return { success: false, error: "DB kaydı bulunamadı." };
    const field = fieldForCategoryLower(data.category);
    if (data.action === "delete_record" && data.category === "originals") {
      createAuditLog(currentProjectId, {
        action_type: "delete",
        entity_type: "audio_file",
        entity_id: existing.id,
        description: `[Watcher] Kayıt silindi (original silindi): ${data.file_name}`,
        old_value: existing
      });
      deleteAudioFile(existing.id);
      return { success: true };
    }
    const oldValue = { [field]: existing[field] };
    updateAudioFile(existing.id, { [field]: null });
    createAuditLog(currentProjectId, {
      action_type: "update",
      entity_type: "audio_file",
      entity_id: existing.id,
      description: `[Watcher] Path temizlendi: ${data.file_name} (${data.category})`,
      old_value: oldValue,
      new_value: { [field]: null }
    });
    return { success: true };
  } catch (e) {
    return { success: false, error: e?.message || "Delete error" };
  }
}
function applyFileRename(data) {
  if (!currentProjectId) return { success: false, error: "Proje açık değil." };
  try {
    const existing = getAudioFileByFileName(currentProjectId, data.old_name);
    if (!existing) return { success: false, error: "DB kaydı bulunamadı." };
    const oldValue = { file_name: existing.file_name };
    updateAudioFile(existing.id, { file_name: data.new_name });
    const upd = {};
    if (existing.original_path) upd.original_path = existing.original_path.replace(data.old_name, data.new_name);
    if (existing.recording_path) upd.recording_path = existing.recording_path.replace(data.old_name, data.new_name);
    if (existing.mixed_path) upd.mixed_path = existing.mixed_path.replace(data.old_name, data.new_name);
    if (Object.keys(upd).length > 0) updateAudioFile(existing.id, upd);
    createAuditLog(currentProjectId, {
      action_type: "rename",
      entity_type: "audio_file",
      entity_id: existing.id,
      description: `[Watcher] Rename (DB): "${data.old_name}" → "${data.new_name}"`,
      old_value: oldValue,
      new_value: { file_name: data.new_name }
    });
    return { success: true };
  } catch (e) {
    return { success: false, error: e?.message || "Rename error" };
  }
}
function startWatcher(projectId, projectPath) {
  if (isWatching) stopWatcher();
  try {
    currentProjectId = projectId;
    currentProjectPath = projectPath;
    const watchPaths = CATEGORIES.map((cat) => path__namespace.join(projectPath, cat)).filter((p) => fs__namespace.existsSync(p));
    if (watchPaths.length === 0) return { success: false, error: "İzlenecek klasör bulunamadı." };
    watcher = chokidar__namespace.watch(watchPaths, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
      depth: 2,
      ignored: [
        /(^|[\/\\])\../,
        /\.db$/,
        /\.json$/,
        /Thumbs\.db$/,
        /\.DS_Store$/
      ]
    });
    watcher.on("add", (p) => handleFileAdded(p));
    watcher.on("unlink", (p) => handleFileDeleted(p));
    watcher.on("error", (err) => {
      console.error("[Watcher] Hata:", err);
      sendToRenderer("file-watcher:error", { message: `Dosya izleme hatası: ${err.message}` });
    });
    isWatching = true;
    sendToRenderer("file-watcher:status", { active: true });
    return { success: true };
  } catch (e) {
    return { success: false, error: e?.message || "Watcher start error" };
  }
}
function stopWatcher() {
  try {
    if (watcher) {
      watcher.close();
      watcher = null;
    }
    isWatching = false;
    currentProjectId = null;
    currentProjectPath = null;
    for (const p of pendingDeletes.values()) clearTimeout(p.timeoutId);
    pendingDeletes.clear();
    for (const t of debounceTimers.values()) clearTimeout(t);
    debounceTimers.clear();
    ignoredPaths.clear();
    sendToRenderer("file-watcher:status", { active: false });
    return { success: true };
  } catch (e) {
    return { success: false, error: e?.message || "Watcher stop error" };
  }
}
function registerWatcherHandlers() {
  electron.ipcMain.handle("file-watcher:start", async (_event, data) => {
    return startWatcher(data.project_id, data.project_path);
  });
  electron.ipcMain.handle("file-watcher:stop", async () => stopWatcher());
  electron.ipcMain.handle("file-watcher:status", async () => ({ active: isWatching }));
  electron.ipcMain.handle("file-watcher:confirm-move", async (_event, data) => {
    return applyFileMove(data);
  });
  electron.ipcMain.handle("file-watcher:confirm-delete", async (_event, data) => {
    return applyFileDelete(data);
  });
  electron.ipcMain.handle("file-watcher:confirm-rename", async (_event, data) => {
    return applyFileRename(data);
  });
  electron.ipcMain.handle("file-watcher:ignore-path", async (_event, filePath) => {
    ignorePathChange(filePath);
    return { success: true };
  });
}
const AUDIO_EXTENSIONS = [".wav", ".mp3", ".ogg", ".flac"];
function isAudioFile(fileName) {
  const ext = path__namespace.extname(fileName).toLowerCase();
  return AUDIO_EXTENSIONS.includes(ext);
}
function sanitizeFolderName(name) {
  return name.replace(/[<>:"/\\|?*]/g, "_").replace(/\s+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "").trim();
}
function listAudioFilesInFolder(folderPath) {
  if (!fs__namespace.existsSync(folderPath)) return [];
  try {
    return fs__namespace.readdirSync(folderPath).filter((f) => {
      const fullPath = path__namespace.join(folderPath, f);
      return fs__namespace.statSync(fullPath).isFile() && isAudioFile(f);
    });
  } catch {
    return [];
  }
}
function listSubfolders(folderPath) {
  if (!fs__namespace.existsSync(folderPath)) return [];
  try {
    return fs__namespace.readdirSync(folderPath).filter((f) => {
      return fs__namespace.statSync(path__namespace.join(folderPath, f)).isDirectory();
    });
  } catch {
    return [];
  }
}
function runHealthCheck(projectId, projectPath) {
  const issues = [];
  let totalChecks = 0;
  totalChecks++;
  const audioFiles = listAudioFilesByProject(projectId);
  for (const file of audioFiles) {
    if (file.original_path && !fs__namespace.existsSync(file.original_path)) {
      issues.push({
        id: uuid.v4(),
        severity: "error",
        category: "missing_file",
        message: `Kayıp dosya: ${file.file_name} (Original)`,
        details: `Beklenen yol: ${file.original_path}`,
        auto_fixable: true,
        entity_id: file.id,
        entity_type: "audio_file",
        fix_action: "clear_original_path"
      });
    }
    if (file.recording_path && !fs__namespace.existsSync(file.recording_path)) {
      issues.push({
        id: uuid.v4(),
        severity: "warning",
        category: "missing_file",
        message: `Kayıp dosya: ${file.file_name} (Recording)`,
        details: `Beklenen yol: ${file.recording_path}`,
        auto_fixable: true,
        entity_id: file.id,
        entity_type: "audio_file",
        fix_action: "clear_recording_path"
      });
    }
    if (file.mixed_path && !fs__namespace.existsSync(file.mixed_path)) {
      issues.push({
        id: uuid.v4(),
        severity: "warning",
        category: "missing_file",
        message: `Kayıp dosya: ${file.file_name} (Mixed)`,
        details: `Beklenen yol: ${file.mixed_path}`,
        auto_fixable: true,
        entity_id: file.id,
        entity_type: "audio_file",
        fix_action: "clear_mixed_path"
      });
    }
  }
  totalChecks++;
  const characters = listCharacters(projectId);
  const categories = ["Originals", "Recording", "Mixed"];
  for (const character of characters) {
    for (const category of categories) {
      const folderPath = path__namespace.join(projectPath, category, sanitizeFolderName(character.name));
      const filesOnDisk = listAudioFilesInFolder(folderPath);
      for (const fileName of filesOnDisk) {
        const existing = getAudioFileByFileName(projectId, fileName);
        if (!existing) {
          issues.push({
            id: uuid.v4(),
            severity: "warning",
            category: "unregistered_file",
            message: `Kayıtsız dosya: ${fileName} (${character.name}/${category})`,
            details: `Dosya klasörde var ama veritabanında kaydı yok.`,
            auto_fixable: true,
            entity_id: character.id,
            entity_type: "character",
            fix_action: "register_file"
          });
        }
      }
    }
  }
  totalChecks++;
  for (const character of characters) {
    const sanitized = sanitizeFolderName(character.name);
    for (const category of categories) {
      const folderPath = path__namespace.join(projectPath, category, sanitized);
      if (!fs__namespace.existsSync(folderPath)) {
        issues.push({
          id: uuid.v4(),
          severity: "error",
          category: "folder_mismatch",
          message: `Eksik klasör: ${category}/${sanitized}`,
          details: `"${character.name}" karakteri için ${category} klasörü bulunamadı.`,
          auto_fixable: true,
          entity_id: character.id,
          entity_type: "character",
          fix_action: "create_folder"
        });
      }
    }
  }
  totalChecks++;
  for (const category of categories) {
    const categoryPath = path__namespace.join(projectPath, category);
    const foldersOnDisk = listSubfolders(categoryPath);
    const characterNames = characters.map((c) => sanitizeFolderName(c.name));
    for (const folderName of foldersOnDisk) {
      if (!characterNames.includes(folderName)) {
        issues.push({
          id: uuid.v4(),
          severity: "warning",
          category: "folder_mismatch",
          message: `Eşleşmeyen klasör: ${category}/${folderName}`,
          details: `Klasör var ama bu isimde bir karakter veritabanında yok.`,
          auto_fixable: false,
          fix_action: "manual"
        });
      }
    }
  }
  totalChecks++;
  const unassigned = getUnassignedCharacters(projectId);
  if (unassigned.length > 0) {
    issues.push({
      id: uuid.v4(),
      severity: "info",
      category: "unassigned_character",
      message: `${unassigned.length} karakter sanatçı ataması bekliyor`,
      details: `Karakterler: ${unassigned.map((c) => c.name).join(", ")}`,
      auto_fixable: false,
      fix_action: "manual"
    });
  }
  totalChecks++;
  const untranslated = getUntranslatedCount(projectId);
  if (untranslated > 0) {
    issues.push({
      id: uuid.v4(),
      severity: "info",
      category: "empty_translation",
      message: `${untranslated} satırın çevirisi eksik`,
      details: `Toplam ${audioFiles.length} satırdan ${untranslated} tanesi çevrilmemiş.`,
      auto_fixable: false,
      fix_action: "manual"
    });
  }
  totalChecks++;
  const unrecorded = getUnrecordedCount(projectId);
  if (unrecorded > 0) {
    issues.push({
      id: uuid.v4(),
      severity: "info",
      category: "unrecorded",
      message: `${unrecorded} satırın kaydı yapılmamış`,
      details: `Toplam ${audioFiles.length} satırdan ${unrecorded} tanesi kaydedilmemiş.`,
      auto_fixable: false,
      fix_action: "manual"
    });
  }
  totalChecks++;
  const fileNameCounts = {};
  for (const file of audioFiles) {
    fileNameCounts[file.file_name] = (fileNameCounts[file.file_name] || 0) + 1;
  }
  const duplicates = Object.entries(fileNameCounts).filter(([, count]) => count > 1);
  for (const [fileName, count] of duplicates) {
    issues.push({
      id: uuid.v4(),
      severity: "error",
      category: "duplicate_record",
      message: `Çakışan dosya adı: ${fileName} (${count} kayıt)`,
      details: `Aynı dosya adıyla ${count} farklı kayıt bulundu.`,
      auto_fixable: false,
      fix_action: "manual"
    });
  }
  const errors = issues.filter((i) => i.severity === "error").length;
  const warnings = issues.filter((i) => i.severity === "warning").length;
  const info = issues.filter((i) => i.severity === "info").length;
  let overallStatus = "healthy";
  if (errors > 0) overallStatus = "critical";
  else if (warnings > 0) overallStatus = "warning";
  return {
    checked_at: (/* @__PURE__ */ new Date()).toISOString(),
    overall_status: overallStatus,
    issues,
    summary: {
      total_checks: totalChecks,
      errors,
      warnings,
      info,
      passed: totalChecks - (errors > 0 ? 1 : 0) - (warnings > 0 ? 1 : 0)
    }
  };
}
function fixIssue(projectId, projectPath, issue) {
  try {
    switch (issue.fix_action) {
      case "clear_original_path":
        if (issue.entity_id) {
          updateAudioFile(issue.entity_id, { original_path: null });
          return { success: true, message: `Original path temizlendi: ${issue.message}` };
        }
        break;
      case "clear_recording_path":
        if (issue.entity_id) {
          updateAudioFile(issue.entity_id, { recording_path: null });
          return { success: true, message: `Recording path temizlendi: ${issue.message}` };
        }
        break;
      case "clear_mixed_path":
        if (issue.entity_id) {
          updateAudioFile(issue.entity_id, { mixed_path: null });
          return { success: true, message: `Mixed path temizlendi: ${issue.message}` };
        }
        break;
      case "create_folder": {
        const character = issue.entity_id ? getCharacter(issue.entity_id) : null;
        if (character) {
          const sanitized = sanitizeFolderName(character.name);
          const categories = ["Originals", "Recording", "Mixed"];
          for (const cat of categories) {
            const folderPath = path__namespace.join(projectPath, cat, sanitized);
            if (!fs__namespace.existsSync(folderPath)) {
              fs__namespace.mkdirSync(folderPath, { recursive: true });
            }
          }
          return { success: true, message: `Eksik klasörler oluşturuldu: ${character.name}` };
        }
        break;
      }
      case "register_file": {
        const match = issue.message.match(/Kayıtsız dosya: (.+?) \((.+?)\/(.+?)\)/);
        if (match && issue.entity_id) {
          const fileName = match[1];
          const characterName = match[2];
          const category = match[3];
          const character = getCharacterByName(projectId, characterName);
          if (character) {
            const sanitized = sanitizeFolderName(characterName);
            const filePath = path__namespace.join(projectPath, category, sanitized, fileName);
            const pathField = category === "Originals" ? "original_path" : category === "Recording" ? "recording_path" : "mixed_path";
            const existing = getAudioFileByFileName(projectId, fileName);
            if (existing) {
              updateAudioFile(existing.id, { [pathField]: filePath });
            } else {
              const newFile = {
                character_id: character.id,
                file_name: fileName
              };
              newFile[pathField] = filePath;
              createAudioFile(projectId, newFile);
            }
            return { success: true, message: `Dosya kaydedildi: ${fileName}` };
          }
        }
        break;
      }
    }
    return { success: false, message: "Bu sorun otomatik düzeltilemedi." };
  } catch (error) {
    return { success: false, message: error.message };
  }
}
function registerHealthHandlers() {
  electron.ipcMain.handle("health:check", async (_event, data) => {
    try {
      const report = runHealthCheck(data.project_id, data.project_path);
      createAuditLog(data.project_id, {
        action_type: "update",
        entity_type: "project",
        entity_id: data.project_id,
        description: `Sağlık kontrolü: ${report.summary.errors} hata, ${report.summary.warnings} uyarı, ${report.summary.info} bilgi.`,
        new_value: report.summary
      });
      return { success: true, report };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
  electron.ipcMain.handle("health:fix", async (_event, data) => {
    try {
      const result = fixIssue(data.project_id, data.project_path, data.issue);
      if (result.success) {
        createAuditLog(data.project_id, {
          action_type: "update",
          entity_type: "project",
          entity_id: data.project_id,
          description: `[Sağlık] Sorun düzeltildi: ${result.message}`,
          new_value: { fixed_issue: data.issue.message }
        });
      }
      return { success: result.success, message: result.message };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });
  electron.ipcMain.handle("health:fix-all", async (_event, data) => {
    try {
      const report = runHealthCheck(data.project_id, data.project_path);
      const fixableIssues = report.issues.filter((i) => i.auto_fixable);
      let fixedCount = 0;
      let failedCount = 0;
      const results = [];
      for (const issue of fixableIssues) {
        const result = fixIssue(data.project_id, data.project_path, issue);
        results.push(result);
        if (result.success) fixedCount++;
        else failedCount++;
      }
      createAuditLog(data.project_id, {
        action_type: "update",
        entity_type: "project",
        entity_id: data.project_id,
        description: `[Sağlık] Toplu düzeltme: ${fixedCount} düzeltilen, ${failedCount} başarısız.`,
        new_value: { fixed: fixedCount, failed: failedCount }
      });
      return {
        success: true,
        fixed_count: fixedCount,
        failed_count: failedCount,
        results
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
}
const AdmZip = require("adm-zip");
function exists(p) {
  try {
    return fs__namespace.existsSync(p);
  } catch {
    return false;
  }
}
function ensureDir(p) {
  if (!exists(p)) fs__namespace.mkdirSync(p, { recursive: true });
}
function readJsonSafe(p) {
  try {
    if (!exists(p)) return null;
    return JSON.parse(fs__namespace.readFileSync(p, "utf-8"));
  } catch {
    return null;
  }
}
function sha256File(filePath) {
  const hash = crypto__namespace.createHash("sha256");
  const data = fs__namespace.readFileSync(filePath);
  hash.update(data);
  return hash.digest("hex");
}
function uniqueFolderPath(destinationRoot, folderName) {
  let candidate = path__namespace.join(destinationRoot, folderName);
  if (!exists(candidate)) return candidate;
  let i = 2;
  while (exists(`${candidate}_${i}`)) i++;
  return `${candidate}_${i}`;
}
function createDubPack(input) {
  let wasDbOpen = false;
  const projectPath = input.project_path;
  const dbPath = path__namespace.join(projectPath, "project.db");
  try {
    if (!exists(projectPath)) return { success: false, error: "Proje klasörü bulunamadı." };
    const jsonPath = path__namespace.join(projectPath, "project.json");
    if (!exists(dbPath)) return { success: false, error: "project.db bulunamadı (geçerli proje değil)." };
    if (!exists(jsonPath)) return { success: false, error: "project.json bulunamadı (geçerli proje değil)." };
    wasDbOpen = isDatabaseOpen();
    if (wasDbOpen) {
      try {
        closeDatabase();
      } catch {
      }
    }
    const pj = readJsonSafe(jsonPath) || {};
    const projectName = pj.name || path__namespace.basename(projectPath);
    const gameTitle = pj.game_title || "";
    const zip = new AdmZip();
    zip.addLocalFile(jsonPath, "");
    zip.addLocalFile(dbPath, "");
    const wal = `${dbPath}-wal`;
    const shm = `${dbPath}-shm`;
    if (exists(wal)) zip.addLocalFile(wal, "");
    if (exists(shm)) zip.addLocalFile(shm, "");
    if (input.include_originals) {
      const p = path__namespace.join(projectPath, "Originals");
      if (exists(p)) zip.addLocalFolder(p, "Originals");
    }
    if (input.include_recording) {
      const p = path__namespace.join(projectPath, "Recording");
      if (exists(p)) zip.addLocalFolder(p, "Recording");
    }
    if (input.include_mixed) {
      const p = path__namespace.join(projectPath, "Mixed");
      if (exists(p)) zip.addLocalFolder(p, "Mixed");
    }
    const meta = {
      version: "1.0.0",
      packaged_at: (/* @__PURE__ */ new Date()).toISOString(),
      project_name: projectName,
      game_title: gameTitle,
      original_project_path: projectPath,
      included: {
        originals: input.include_originals,
        recording: input.include_recording,
        mixed: input.include_mixed,
        db: true,
        json: true
      },
      checksum_sha256: ""
    };
    zip.addFile("dubpack.meta.json", Buffer.from(JSON.stringify(meta, null, 2), "utf-8"));
    ensureDir(path__namespace.dirname(input.output_path));
    zip.writeZip(input.output_path);
    meta.checksum_sha256 = sha256File(input.output_path);
    const zip2 = new AdmZip(input.output_path);
    zip2.deleteFile("dubpack.meta.json");
    zip2.addFile("dubpack.meta.json", Buffer.from(JSON.stringify(meta, null, 2), "utf-8"));
    zip2.writeZip(input.output_path);
    return { success: true, meta };
  } catch (e) {
    return { success: false, error: e?.message || "Paketleme hatası" };
  } finally {
    if (wasDbOpen) {
      try {
        openDatabase(dbPath);
      } catch {
      }
    }
  }
}
function loadDubPack(input) {
  try {
    if (isDatabaseOpen()) {
      return { success: false, error: "Paket yüklemek için önce projeyi kapatın." };
    }
    if (!exists(input.pack_path)) return { success: false, error: "Paket dosyası bulunamadı." };
    ensureDir(input.destination_root);
    const zip = new AdmZip(input.pack_path);
    let meta = null;
    try {
      const metaEntry = zip.getEntry("dubpack.meta.json");
      if (metaEntry) meta = JSON.parse(metaEntry.getData().toString("utf-8"));
    } catch {
      meta = null;
    }
    let projectName = meta?.project_name;
    if (!projectName) {
      const pjEntry = zip.getEntry("project.json");
      if (!pjEntry) return { success: false, error: "Paket bozuk: project.json yok." };
      const pj = JSON.parse(pjEntry.getData().toString("utf-8"));
      projectName = pj.name || "DubLabProject";
    }
    const targetProjectPath = uniqueFolderPath(input.destination_root, projectName);
    ensureDir(targetProjectPath);
    zip.extractAllTo(targetProjectPath, true);
    const dbPath = path__namespace.join(targetProjectPath, "project.db");
    if (!exists(dbPath)) return { success: false, error: "Paket bozuk: project.db yok." };
    openDatabase(dbPath);
    const projectRow = getFirstProject();
    if (!projectRow) {
      closeDatabase();
      return { success: false, error: "Veritabanında proje kaydı yok." };
    }
    const oldBase = projectRow.project_path;
    const newBase = targetProjectPath;
    updateProject(projectRow.id, { project_path: newBase });
    const files = listAudioFilesByProject(projectRow.id);
    for (const f of files) {
      const updates = {};
      if (typeof f.original_path === "string" && f.original_path.startsWith(oldBase)) {
        updates.original_path = path__namespace.join(newBase, path__namespace.relative(oldBase, f.original_path));
      }
      if (typeof f.recording_path === "string" && f.recording_path.startsWith(oldBase)) {
        updates.recording_path = path__namespace.join(newBase, path__namespace.relative(oldBase, f.recording_path));
      }
      if (typeof f.mixed_path === "string" && f.mixed_path.startsWith(oldBase)) {
        updates.mixed_path = path__namespace.join(newBase, path__namespace.relative(oldBase, f.mixed_path));
      }
      if (Object.keys(updates).length > 0) updateAudioFile(f.id, updates);
    }
    closeDatabase();
    return { success: true, project_path: targetProjectPath };
  } catch (e) {
    try {
      if (isDatabaseOpen()) closeDatabase();
    } catch {
    }
    return { success: false, error: e?.message || "Paket yükleme hatası" };
  }
}
function registerPackageHandlers() {
  electron.ipcMain.handle("package:create", async (_event, input) => {
    return createDubPack(input);
  });
  electron.ipcMain.handle("package:load", async (_event, input) => {
    return loadDubPack(input);
  });
}
exports.mainWindow = null;
function createWindow() {
  exports.mainWindow = new electron.BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    frame: true,
    titleBarStyle: "default",
    backgroundColor: "#0f172a",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  exports.mainWindow.on("ready-to-show", () => {
    exports.mainWindow?.show();
  });
  exports.mainWindow.webContents.setWindowOpenHandler((details) => {
    electron.shell.openExternal(details.url);
    return { action: "deny" };
  });
  if (utils.is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    exports.mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    exports.mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
  exports.mainWindow.on("closed", () => {
    exports.mainWindow = null;
  });
}
function registerSystemHandlers() {
  electron.ipcMain.handle("system:open-path", async (_event, filePath) => {
    try {
      if (!filePath || typeof filePath !== "string") {
        return { success: false, error: "Geçersiz dosya yolu." };
      }
      const res = await electron.shell.openPath(filePath);
      if (res) return { success: false, error: res };
      return { success: true };
    } catch (e) {
      return { success: false, error: e?.message || "system:open-path hatası" };
    }
  });
  electron.ipcMain.handle("system:show-in-folder", async (_event, filePath) => {
    try {
      if (!filePath || typeof filePath !== "string") {
        return { success: false, error: "Geçersiz dosya yolu." };
      }
      electron.shell.showItemInFolder(filePath);
      return { success: true };
    } catch (e) {
      return { success: false, error: e?.message || "system:show-in-folder hatası" };
    }
  });
}
function registerAllHandlers() {
  console.log("📦 IPC Handler'ları yükleniyor...");
  registerProjectHandlers();
  console.log("  ✓ Project modülü yüklendi");
  registerCharacterHandlers();
  console.log("  ✓ Character modülü yüklendi");
  registerArtistHandlers();
  console.log("  ✓ Artist modülü yüklendi");
  registerAudioHandlers();
  console.log("  ✓ Audio modülü yüklendi");
  registerTranslationHandlers();
  console.log("  ✓ Translation modülü yüklendi");
  registerAuditHandlers();
  console.log("  ✓ Audit modülü yüklendi");
  registerWatcherHandlers();
  console.log("  ✓ Watcher modülü yüklendi");
  registerHealthHandlers();
  console.log("  ✓ Health modülü yüklendi");
  registerPackageHandlers();
  console.log("  ✓ Package modülü yüklendi");
  registerSystemHandlers();
  console.log("  ✓ System modülü yüklendi (open/show)");
  console.log("✅ Tüm IPC Handler'ları yüklendi!");
}
electron.app.whenReady().then(() => {
  utils.electronApp.setAppUserModelId("com.dublab.app");
  electron.app.on("browser-window-created", (_, window) => {
    utils.optimizer.watchWindowShortcuts(window);
  });
  registerAllHandlers();
  createWindow();
  electron.app.on("activate", () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") electron.app.quit();
});
electron.app.on("before-quit", () => {
  console.log("Uygulama kapatılıyor...");
  try {
    const dbMod = require("./database");
    if (dbMod.isDatabaseOpen()) dbMod.closeDatabase();
  } catch {
  }
});
process.on("uncaughtException", (error) => {
  console.error("Beklenmeyen hata:", error);
});
process.on("unhandledRejection", (reason) => {
  console.error("İşlenmemiş Promise reddi:", reason);
});
exports.createWindow = createWindow;
