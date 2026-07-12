#!/usr/bin/env node
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});

// src/cli.ts
import { program } from "commander";
import { render } from "ink";
import React2 from "react";
import { existsSync as existsSync12, readFileSync as readFileSync4 } from "fs";
import { join as join8, dirname as dirname8 } from "path";
import { fileURLToPath as fileURLToPath3 } from "url";
import { spawn as spawn2 } from "child_process";

// src/ui/App.tsx
import { useState as useState2, useEffect as useEffect2, useCallback as useCallback2 } from "react";
import { Box as Box7, Text as Text7, useInput, useApp } from "ink";
import TextInput2 from "ink-text-input";
import Spinner from "ink-spinner";
import { basename as basename5, dirname as dirname4 } from "path";
import { existsSync as existsSync7 } from "fs";

// src/utils/config.ts
import { homedir } from "os";
import { join, basename, dirname } from "path";
import { mkdirSync, existsSync, copyFileSync } from "fs";
var CMEM_DIR = join(homedir(), ".cmem");
var DB_PATH = join(CMEM_DIR, "sessions.db");
var MODELS_DIR = join(CMEM_DIR, "models");
var BACKUPS_DIR = join(CMEM_DIR, "backups");
var CLAUDE_DIR = join(homedir(), ".claude");
var CLAUDE_PROJECTS_DIR = join(CLAUDE_DIR, "projects");
var CLAUDE_SESSIONS_DIR = join(CLAUDE_DIR, "sessions");
var EMBEDDING_MODEL = "nomic-ai/nomic-embed-text-v1.5";
var EMBEDDING_DIMENSIONS = 768;
var MAX_EMBEDDING_CHARS = 8e3;
var MAX_MESSAGE_PREVIEW_CHARS = 500;
var MAX_MESSAGES_FOR_CONTEXT = 20;
var DB_SIZE_ALERT_THRESHOLD = 5 * 1024 * 1024 * 1024;
var DEFAULT_PURGE_DAYS = 30;
function ensureCmemDir() {
  if (!existsSync(CMEM_DIR)) {
    mkdirSync(CMEM_DIR, { recursive: true });
  }
}
function ensureModelsDir() {
  ensureCmemDir();
  if (!existsSync(MODELS_DIR)) {
    mkdirSync(MODELS_DIR, { recursive: true });
  }
}
function ensureBackupsDir() {
  ensureCmemDir();
  if (!existsSync(BACKUPS_DIR)) {
    mkdirSync(BACKUPS_DIR, { recursive: true });
  }
}
function getBackupPath(sourceFile) {
  const projectDir = basename(dirname(sourceFile));
  const sessionFile = basename(sourceFile);
  return join(BACKUPS_DIR, projectDir, sessionFile);
}
function backupSessionFile(sourceFile) {
  try {
    if (!existsSync(sourceFile)) return false;
    ensureBackupsDir();
    const backupPath = getBackupPath(sourceFile);
    const backupDir = dirname(backupPath);
    if (!existsSync(backupDir)) {
      mkdirSync(backupDir, { recursive: true });
    }
    copyFileSync(sourceFile, backupPath);
    return true;
  } catch {
    return false;
  }
}
function hasBackup(sourceFile) {
  const backupPath = getBackupPath(sourceFile);
  return existsSync(backupPath);
}
function restoreFromBackup(sourceFile) {
  try {
    const backupPath = getBackupPath(sourceFile);
    if (!existsSync(backupPath)) return false;
    const sourceDir = dirname(sourceFile);
    if (!existsSync(sourceDir)) {
      mkdirSync(sourceDir, { recursive: true });
    }
    copyFileSync(backupPath, sourceFile);
    return true;
  } catch {
    return false;
  }
}

// src/db/maintenance.ts
import { statSync as statSync2, existsSync as existsSync4, unlinkSync, readdirSync as readdirSync2, rmdirSync } from "fs";
import { join as join3, dirname as dirname3 } from "path";

// src/db/index.ts
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { existsSync as existsSync3 } from "fs";

// src/parser/index.ts
import { readFileSync, readdirSync, existsSync as existsSync2, statSync } from "fs";
import { join as join2 } from "path";
var AUTOMATED_TITLE_PATTERNS = [
  /^<[a-z-]+>/i,
  // XML-like tags: <project-instructions>, <command-message>, etc.
  /^<[A-Z_]+>/,
  // Uppercase tags: <SYSTEM>, <TOOL_USE>, etc.
  /^\[system\]/i,
  // [system] prefix
  /^\/[a-z]+$/i
  // Slash commands: /init, /help, etc.
];
function isAutomatedByContent(title) {
  for (const pattern of AUTOMATED_TITLE_PATTERNS) {
    if (pattern.test(title.trim())) {
      return true;
    }
  }
  return false;
}
function extractSessionMetadata(filepath) {
  const content = readFileSync(filepath, "utf-8");
  const metadata = {
    isSidechain: false,
    isMeta: false
  };
  for (const line of content.split("\n")) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line);
      if (parsed.type === "user" && parsed.message) {
        if (parsed.isSidechain === true) {
          metadata.isSidechain = true;
        }
        if (parsed.agentId) {
          metadata.isSidechain = true;
        }
        if (parsed.isMeta === true) {
          metadata.isMeta = true;
        }
        break;
      }
    } catch {
    }
  }
  return metadata;
}
function parseSessionFile(filepath) {
  const content = readFileSync(filepath, "utf-8");
  const messages = [];
  for (const line of content.split("\n")) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line);
      if ((parsed.type === "user" || parsed.type === "assistant") && parsed.message) {
        const msg = parsed.message;
        if (msg.role && msg.content) {
          const content2 = Array.isArray(msg.content) ? msg.content.filter((c) => c.type === "text").map((c) => c.text).join("\n") : typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
          if (content2) {
            messages.push({
              role: msg.role,
              content: content2,
              timestamp: parsed.timestamp || (/* @__PURE__ */ new Date()).toISOString()
            });
          }
        }
      } else if (parsed.type === "message" && parsed.role && parsed.content) {
        messages.push({
          role: parsed.role,
          content: typeof parsed.content === "string" ? parsed.content : JSON.stringify(parsed.content),
          timestamp: parsed.timestamp || (/* @__PURE__ */ new Date()).toISOString()
        });
      } else if (parsed.role && parsed.content && !parsed.type) {
        messages.push({
          role: parsed.role,
          content: typeof parsed.content === "string" ? parsed.content : JSON.stringify(parsed.content),
          timestamp: parsed.timestamp || (/* @__PURE__ */ new Date()).toISOString()
        });
      }
    } catch {
    }
  }
  return messages;
}
function findSessionFiles() {
  const sessions = [];
  if (existsSync2(CLAUDE_PROJECTS_DIR)) {
    const projectDirs = readdirSync(CLAUDE_PROJECTS_DIR);
    for (const projectDir of projectDirs) {
      const projectDirPath = join2(CLAUDE_PROJECTS_DIR, projectDir);
      const stat = statSync(projectDirPath);
      if (!stat.isDirectory()) continue;
      const indexPath = join2(projectDirPath, "sessions-index.json");
      const sessionIndex = loadSessionIndex(indexPath);
      const indexedSessions = /* @__PURE__ */ new Map();
      if (sessionIndex) {
        for (const entry of sessionIndex.entries) {
          indexedSessions.set(entry.sessionId, entry);
        }
      }
      const entries = readdirSync(projectDirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith(".jsonl")) continue;
        const filePath = join2(projectDirPath, entry.name);
        const sessionId = entry.name.replace(".jsonl", "");
        try {
          const session = loadSession(filePath);
          if (session) {
            const indexEntry = indexedSessions.get(sessionId);
            if (indexEntry) {
              session.projectPath = indexEntry.projectPath;
            }
            const agentMessages = loadSubagentMessages(projectDirPath, sessionId);
            if (agentMessages.length > 0) {
              session.agentMessages = agentMessages;
            }
            sessions.push(session);
          }
        } catch {
        }
      }
    }
  }
  if (existsSync2(CLAUDE_SESSIONS_DIR)) {
    const sessionFiles = readdirSync(CLAUDE_SESSIONS_DIR).filter((f) => f.endsWith(".jsonl"));
    for (const sessionFile of sessionFiles) {
      const filePath = join2(CLAUDE_SESSIONS_DIR, sessionFile);
      try {
        const session = loadSession(filePath);
        if (session) {
          sessions.push(session);
        }
      } catch {
      }
    }
  }
  sessions.sort((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime());
  return sessions;
}
function loadSessionIndex(indexPath) {
  if (!existsSync2(indexPath)) return null;
  try {
    const content = readFileSync(indexPath, "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}
function loadSubagentMessages(projectDirPath, parentSessionId) {
  const subagentsDir = join2(projectDirPath, parentSessionId, "subagents");
  if (!existsSync2(subagentsDir)) return [];
  const messages = [];
  try {
    const agentFiles = readdirSync(subagentsDir).filter((f) => f.endsWith(".jsonl"));
    for (const agentFile of agentFiles) {
      const agentPath = join2(subagentsDir, agentFile);
      const agentMessages = parseSessionFile(agentPath);
      messages.push(...agentMessages);
    }
  } catch {
  }
  return messages;
}
function loadSession(filePath) {
  const rawData = readFileSync(filePath, "utf-8");
  const messages = parseSessionFile(filePath);
  if (messages.length === 0) {
    return null;
  }
  const stats = statSync(filePath);
  return {
    filePath,
    projectPath: null,
    messages,
    rawData,
    modifiedAt: stats.mtime
  };
}
function getMostRecentSession() {
  const sessions = findSessionFiles();
  return sessions.length > 0 ? sessions[0] : null;
}
function generateSummary(messages) {
  const firstUserMessage = messages.find((m) => m.role === "user");
  if (!firstUserMessage) {
    return "No user messages found";
  }
  const summary = firstUserMessage.content.slice(0, 300);
  return summary.length < firstUserMessage.content.length ? summary + "..." : summary;
}

// src/db/index.ts
var db = null;
function getDatabase() {
  if (db) return db;
  ensureCmemDir();
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  sqliteVec.load(db);
  initSchema(db);
  return db;
}
function initSchema(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);
  database.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      summary TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      message_count INTEGER DEFAULT 0,
      project_path TEXT,
      source_file TEXT,
      raw_data TEXT NOT NULL
    );
  `);
  try {
    database.exec(`ALTER TABLE sessions ADD COLUMN source_file TEXT`);
  } catch {
  }
  try {
    database.exec(`ALTER TABLE sessions ADD COLUMN is_sidechain INTEGER DEFAULT 0`);
  } catch {
  }
  try {
    database.exec(`ALTER TABLE sessions ADD COLUMN is_automated INTEGER DEFAULT 0`);
  } catch {
  }
  try {
    database.exec(`ALTER TABLE sessions ADD COLUMN custom_title TEXT`);
  } catch {
  }
  database.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );
  `);
  database.exec(`
    CREATE TABLE IF NOT EXISTS embedding_state (
      session_id TEXT PRIMARY KEY,
      content_length INTEGER NOT NULL,
      file_mtime TEXT,
      last_embedded_at TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );
  `);
  database.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS session_embeddings USING vec0(
      session_id TEXT PRIMARY KEY,
      embedding FLOAT[${EMBEDDING_DIMENSIONS}]
    );
  `);
  database.exec(`
    CREATE TABLE IF NOT EXISTS favorites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK (type IN ('session', 'folder')),
      value TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(type, value)
    );
  `);
  database.exec(`
    CREATE TABLE IF NOT EXISTS project_order (
      path TEXT PRIMARY KEY,
      sort_order INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
  `);
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions(updated_at DESC);
  `);
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_sessions_source ON sessions(source_file);
  `);
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_favorites_type ON favorites(type);
  `);
  database.exec(`
    CREATE TABLE IF NOT EXISTS lessons (
      id TEXT PRIMARY KEY,
      project_path TEXT NOT NULL,
      category TEXT NOT NULL CHECK (category IN (
        'architecture_decision', 'anti_pattern', 'bug_pattern',
        'project_convention', 'dependency_knowledge', 'domain_knowledge',
        'workflow', 'other'
      )),
      title TEXT NOT NULL,
      trigger_context TEXT NOT NULL,
      insight TEXT NOT NULL,
      reasoning TEXT,
      confidence REAL DEFAULT 0.5,
      times_applied INTEGER DEFAULT 0,
      times_validated INTEGER DEFAULT 0,
      times_rejected INTEGER DEFAULT 0,
      source_session_id TEXT,
      source_type TEXT DEFAULT 'synthesized',
      archived INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      last_applied_at TEXT
    );
  `);
  database.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS lesson_embeddings USING vec0(
      lesson_id TEXT PRIMARY KEY,
      embedding FLOAT[${EMBEDDING_DIMENSIONS}]
    );
  `);
  database.exec(`
    CREATE TABLE IF NOT EXISTS lesson_feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lesson_id TEXT NOT NULL,
      session_id TEXT,
      feedback_type TEXT NOT NULL CHECK (feedback_type IN (
        'validated', 'rejected', 'modified'
      )),
      comment TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE
    );
  `);
  database.exec(`
    CREATE TABLE IF NOT EXISTS synthesis_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL UNIQUE,
      project_path TEXT NOT NULL,
      queued_at TEXT DEFAULT (datetime('now')),
      status TEXT DEFAULT 'pending',
      processed_at TEXT,
      lessons_created INTEGER DEFAULT 0,
      error TEXT
    );
  `);
  database.exec(`
    CREATE TABLE IF NOT EXISTS session_injections (
      session_id TEXT NOT NULL,
      lesson_id TEXT NOT NULL,
      injected_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (session_id, lesson_id)
    );
  `);
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_lessons_project ON lessons(project_path);
  `);
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_lessons_category ON lessons(category);
  `);
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_lessons_confidence ON lessons(confidence DESC);
  `);
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_lessons_archived ON lessons(archived);
  `);
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_synthesis_queue_status ON synthesis_queue(status);
  `);
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_session_injections_session ON session_injections(session_id);
  `);
  runMigrations(database);
}
function runMigrations(database) {
  const migrationName = "populate_session_metadata_v1";
  const existing = database.prepare(
    "SELECT 1 FROM migrations WHERE name = ?"
  ).get(migrationName);
  if (existing) return;
  const sessions = database.prepare(`
    SELECT id, source_file FROM sessions WHERE source_file IS NOT NULL
  `).all();
  const updateStmt = database.prepare(`
    UPDATE sessions SET is_sidechain = ?, is_automated = ? WHERE id = ?
  `);
  const transaction = database.transaction(() => {
    for (const session of sessions) {
      if (!existsSync3(session.source_file)) continue;
      try {
        const metadata = extractSessionMetadata(session.source_file);
        const isAutomated = metadata.isSidechain || metadata.isMeta;
        updateStmt.run(
          metadata.isSidechain ? 1 : 0,
          isAutomated ? 1 : 0,
          session.id
        );
      } catch {
      }
    }
    database.prepare(
      "INSERT INTO migrations (name, applied_at) VALUES (?, ?)"
    ).run(migrationName, (/* @__PURE__ */ new Date()).toISOString());
  });
  transaction();
}

// src/db/maintenance.ts
function getDatabaseSize() {
  try {
    const stats = statSync2(DB_PATH);
    return stats.size;
  } catch {
    return 0;
  }
}
function getBackupsDirSize() {
  try {
    if (!existsSync4(BACKUPS_DIR)) return 0;
    return getDirSize(BACKUPS_DIR);
  } catch {
    return 0;
  }
}
function getDirSize(dirPath) {
  let size = 0;
  try {
    const entries = readdirSync2(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join3(dirPath, entry.name);
      if (entry.isDirectory()) {
        size += getDirSize(fullPath);
      } else {
        try {
          size += statSync2(fullPath).size;
        } catch {
        }
      }
    }
  } catch {
  }
  return size;
}
function getTotalStorageSize() {
  return getDatabaseSize() + getBackupsDirSize();
}
function getPurgePreview(days) {
  const db2 = getDatabase();
  const result = db2.prepare(`
    SELECT
      COUNT(*) as sessionCount,
      COALESCE(MIN(s.updated_at), '') as oldestDate,
      COALESCE(MAX(s.updated_at), '') as newestDate
    FROM sessions s
    LEFT JOIN favorites f ON f.type = 'session' AND f.value = s.id
    WHERE s.updated_at < datetime('now', '-' || ? || ' days')
      AND f.id IS NULL
  `).get(days);
  const messageResult = db2.prepare(`
    SELECT COALESCE(SUM(s.message_count), 0) as messageCount
    FROM sessions s
    LEFT JOIN favorites f ON f.type = 'session' AND f.value = s.id
    WHERE s.updated_at < datetime('now', '-' || ? || ' days')
      AND f.id IS NULL
  `).get(days);
  const sessionsWithSourceFiles = db2.prepare(`
    SELECT s.source_file as sourceFile
    FROM sessions s
    LEFT JOIN favorites f ON f.type = 'session' AND f.value = s.id
    WHERE s.updated_at < datetime('now', '-' || ? || ' days')
      AND f.id IS NULL
      AND s.source_file IS NOT NULL
  `).all(days);
  let backupFilesToDelete = 0;
  let backupBytesToFree = 0;
  for (const session of sessionsWithSourceFiles) {
    const backupPath = getBackupPath(session.sourceFile);
    if (existsSync4(backupPath)) {
      backupFilesToDelete++;
      try {
        backupBytesToFree += statSync2(backupPath).size;
      } catch {
      }
    }
  }
  return {
    sessionsToDelete: result.sessionCount,
    messagesInvolved: messageResult.messageCount,
    oldestSessionDate: result.oldestDate ? formatDate(result.oldestDate) : "",
    newestSessionDate: result.newestDate ? formatDate(result.newestDate) : "",
    backupFilesToDelete,
    backupBytesToFree
  };
}
function purgeOldSessions(days) {
  const db2 = getDatabase();
  const sessionsToDelete = db2.prepare(`
    SELECT s.id, s.source_file as sourceFile FROM sessions s
    LEFT JOIN favorites f ON f.type = 'session' AND f.value = s.id
    WHERE s.updated_at < datetime('now', '-' || ? || ' days')
      AND f.id IS NULL
  `).all(days);
  if (sessionsToDelete.length === 0) {
    return { sessionsDeleted: 0, backupsDeleted: 0 };
  }
  let backupsDeleted = 0;
  for (const session of sessionsToDelete) {
    if (session.sourceFile) {
      const backupPath = getBackupPath(session.sourceFile);
      if (existsSync4(backupPath)) {
        try {
          unlinkSync(backupPath);
          backupsDeleted++;
          const parentDir = dirname3(backupPath);
          try {
            const remaining = readdirSync2(parentDir);
            if (remaining.length === 0) {
              rmdirSync(parentDir);
            }
          } catch {
          }
        } catch {
        }
      }
    }
  }
  const transaction = db2.transaction(() => {
    for (const session of sessionsToDelete) {
      db2.prepare("DELETE FROM session_embeddings WHERE session_id = ?").run(session.id);
      db2.prepare("DELETE FROM embedding_state WHERE session_id = ?").run(session.id);
      db2.prepare("DELETE FROM messages WHERE session_id = ?").run(session.id);
      db2.prepare("DELETE FROM sessions WHERE id = ?").run(session.id);
    }
  });
  transaction();
  return { sessionsDeleted: sessionsToDelete.length, backupsDeleted };
}
function formatDate(isoDate) {
  try {
    const date = new Date(isoDate);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  } catch {
    return isoDate;
  }
}
function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

// src/db/sessions.ts
import { randomUUID } from "crypto";
function createSession(input) {
  const db2 = getDatabase();
  const id = randomUUID();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const insertSession = db2.prepare(`
    INSERT INTO sessions (id, title, summary, created_at, updated_at, message_count, project_path, source_file, raw_data, is_sidechain, is_automated)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertMessage = db2.prepare(`
    INSERT INTO messages (session_id, role, content, timestamp)
    VALUES (?, ?, ?, ?)
  `);
  const transaction = db2.transaction(() => {
    insertSession.run(
      id,
      input.title,
      input.summary || null,
      now,
      now,
      input.messages.length,
      input.projectPath || null,
      input.sourceFile || null,
      input.rawData,
      input.isSidechain ? 1 : 0,
      input.isAutomated ? 1 : 0
    );
    for (const msg of input.messages) {
      insertMessage.run(id, msg.role, msg.content, msg.timestamp);
    }
  });
  transaction();
  return id;
}
function updateSession(id, input) {
  const db2 = getDatabase();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const updates = ["updated_at = ?"];
  const values = [now];
  if (input.title !== void 0) {
    updates.push("title = ?");
    values.push(input.title);
  }
  if (input.summary !== void 0) {
    updates.push("summary = ?");
    values.push(input.summary);
  }
  if (input.rawData !== void 0) {
    updates.push("raw_data = ?");
    values.push(input.rawData);
  }
  if (input.messages !== void 0) {
    updates.push("message_count = ?");
    values.push(input.messages.length);
  }
  if (input.isSidechain !== void 0) {
    updates.push("is_sidechain = ?");
    values.push(input.isSidechain ? 1 : 0);
  }
  if (input.isAutomated !== void 0) {
    updates.push("is_automated = ?");
    values.push(input.isAutomated ? 1 : 0);
  }
  if (input.projectPath !== void 0) {
    updates.push("project_path = ?");
    values.push(input.projectPath);
  }
  values.push(id);
  const transaction = db2.transaction(() => {
    db2.prepare(`UPDATE sessions SET ${updates.join(", ")} WHERE id = ?`).run(...values);
    if (input.messages !== void 0) {
      db2.prepare("DELETE FROM messages WHERE session_id = ?").run(id);
      const insertMessage = db2.prepare(`
        INSERT INTO messages (session_id, role, content, timestamp)
        VALUES (?, ?, ?, ?)
      `);
      for (const msg of input.messages) {
        insertMessage.run(id, msg.role, msg.content, msg.timestamp);
      }
    }
  });
  transaction();
}
function getSession(id) {
  const db2 = getDatabase();
  const row = db2.prepare(`
    SELECT id, title, custom_title as customTitle, summary,
           created_at as createdAt, updated_at as updatedAt,
           message_count as messageCount, project_path as projectPath,
           source_file as sourceFile, raw_data as rawData,
           is_sidechain as isSidechain, is_automated as isAutomated
    FROM sessions WHERE id = ?
  `).get(id);
  if (!row) return null;
  return mapSessionRow(row);
}
function getSessionByIdPrefix(idPrefix) {
  const db2 = getDatabase();
  const row = db2.prepare(`
    SELECT id, title, custom_title as customTitle, summary,
           created_at as createdAt, updated_at as updatedAt,
           message_count as messageCount, project_path as projectPath,
           source_file as sourceFile, raw_data as rawData,
           is_sidechain as isSidechain, is_automated as isAutomated
    FROM sessions WHERE id LIKE ? || '%'
    LIMIT 1
  `).get(idPrefix);
  if (!row) return null;
  return mapSessionRow(row);
}
function getSessionBySourceFile(sourceFile) {
  const db2 = getDatabase();
  const row = db2.prepare(`
    SELECT id, title, custom_title as customTitle, summary,
           created_at as createdAt, updated_at as updatedAt,
           message_count as messageCount, project_path as projectPath,
           source_file as sourceFile, raw_data as rawData,
           is_sidechain as isSidechain, is_automated as isAutomated
    FROM sessions WHERE source_file = ?
  `).get(sourceFile);
  if (!row) return null;
  return mapSessionRow(row);
}
function getSessionMessages(sessionId) {
  const db2 = getDatabase();
  const rows = db2.prepare(`
    SELECT id, session_id as sessionId, role, content, timestamp
    FROM messages WHERE session_id = ?
    ORDER BY timestamp ASC
  `).all(sessionId);
  return rows;
}
function mapSessionRow(row) {
  return {
    ...row,
    customTitle: row.customTitle,
    isSidechain: row.isSidechain === 1,
    isAutomated: row.isAutomated === 1
  };
}
function listSessions(limit = 100) {
  const db2 = getDatabase();
  const rows = db2.prepare(`
    SELECT id, title, custom_title as customTitle, summary,
           created_at as createdAt, updated_at as updatedAt,
           message_count as messageCount, project_path as projectPath,
           source_file as sourceFile, raw_data as rawData,
           is_sidechain as isSidechain, is_automated as isAutomated
    FROM sessions
    ORDER BY updated_at DESC
    LIMIT ?
  `).all(limit);
  return rows.map(mapSessionRow);
}
function listHumanSessions(limit = 100) {
  const db2 = getDatabase();
  const rows = db2.prepare(`
    SELECT id, title, custom_title as customTitle, summary,
           created_at as createdAt, updated_at as updatedAt,
           message_count as messageCount, project_path as projectPath,
           source_file as sourceFile, raw_data as rawData,
           is_sidechain as isSidechain, is_automated as isAutomated
    FROM sessions
    WHERE is_sidechain = 0 AND is_automated = 0
    ORDER BY updated_at DESC
    LIMIT ?
  `).all(limit);
  return rows.map(mapSessionRow);
}
function listHumanSessionsByProject(projectPath, limit = 100) {
  const db2 = getDatabase();
  const rows = db2.prepare(`
    SELECT id, title, custom_title as customTitle, summary,
           created_at as createdAt, updated_at as updatedAt,
           message_count as messageCount, project_path as projectPath,
           source_file as sourceFile, raw_data as rawData,
           is_sidechain as isSidechain, is_automated as isAutomated
    FROM sessions
    WHERE is_sidechain = 0 AND is_automated = 0
      AND project_path LIKE ? || '%'
    ORDER BY updated_at DESC
    LIMIT ?
  `).all(projectPath, limit);
  return rows.map(mapSessionRow);
}
function deleteSession(id) {
  const db2 = getDatabase();
  const transaction = db2.transaction(() => {
    db2.prepare("DELETE FROM session_embeddings WHERE session_id = ?").run(id);
    db2.prepare("DELETE FROM embedding_state WHERE session_id = ?").run(id);
    db2.prepare("DELETE FROM messages WHERE session_id = ?").run(id);
    const result = db2.prepare("DELETE FROM sessions WHERE id = ?").run(id);
    return result.changes > 0;
  });
  return transaction();
}
function renameSession(id, customTitle) {
  const db2 = getDatabase();
  db2.prepare(`
    UPDATE sessions SET custom_title = ?, updated_at = ? WHERE id = ?
  `).run(customTitle, (/* @__PURE__ */ new Date()).toISOString(), id);
}
function getStats() {
  const db2 = getDatabase();
  const sessionCount = db2.prepare("SELECT COUNT(*) as count FROM sessions").get().count;
  const messageCount = db2.prepare("SELECT COUNT(*) as count FROM messages").get().count;
  const embeddingCount = db2.prepare("SELECT COUNT(*) as count FROM session_embeddings").get().count;
  return { sessionCount, messageCount, embeddingCount };
}
function sessionExists(rawData) {
  const db2 = getDatabase();
  const row = db2.prepare("SELECT 1 FROM sessions WHERE raw_data = ? LIMIT 1").get(rawData);
  return !!row;
}
function getEmbeddingState(sessionId) {
  const db2 = getDatabase();
  const row = db2.prepare(`
    SELECT session_id as sessionId, content_length as contentLength,
           file_mtime as fileMtime, last_embedded_at as lastEmbeddedAt
    FROM embedding_state WHERE session_id = ?
  `).get(sessionId);
  return row || null;
}
function updateEmbeddingState(sessionId, contentLength, fileMtime) {
  const db2 = getDatabase();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  db2.prepare(`
    INSERT OR REPLACE INTO embedding_state (session_id, content_length, file_mtime, last_embedded_at)
    VALUES (?, ?, ?, ?)
  `).run(sessionId, contentLength, fileMtime || null, now);
}
function needsReembedding(sessionId, currentContentLength, threshold = 500) {
  const state = getEmbeddingState(sessionId);
  if (!state) return true;
  return currentContentLength - state.contentLength >= threshold;
}
function addFavorite(type, value) {
  const db2 = getDatabase();
  try {
    db2.prepare(`
      INSERT OR IGNORE INTO favorites (type, value, created_at)
      VALUES (?, ?, ?)
    `).run(type, value, (/* @__PURE__ */ new Date()).toISOString());
    return true;
  } catch {
    return false;
  }
}
function removeFavorite(type, value) {
  const db2 = getDatabase();
  const result = db2.prepare(`
    DELETE FROM favorites WHERE type = ? AND value = ?
  `).run(type, value);
  return result.changes > 0;
}
function toggleFavorite(type, value) {
  if (isFavorite(type, value)) {
    removeFavorite(type, value);
    return false;
  } else {
    addFavorite(type, value);
    return true;
  }
}
function isFavorite(type, value) {
  const db2 = getDatabase();
  const row = db2.prepare(`
    SELECT 1 FROM favorites WHERE type = ? AND value = ?
  `).get(type, value);
  return !!row;
}
function getFavorites(type) {
  const db2 = getDatabase();
  const rows = db2.prepare(`
    SELECT id, type, value, created_at as createdAt
    FROM favorites
    WHERE type = ?
    ORDER BY created_at DESC
  `).all(type);
  return rows;
}
function getFavoriteSessionIds() {
  const favorites = getFavorites("session");
  return new Set(favorites.map((f) => f.value));
}
function hasFavoriteSessions() {
  const db2 = getDatabase();
  const row = db2.prepare(`
    SELECT 1 FROM favorites WHERE type = 'session' LIMIT 1
  `).get();
  return !!row;
}
function getProjectOrders() {
  const db2 = getDatabase();
  const rows = db2.prepare(`
    SELECT path, sort_order as sortOrder
    FROM project_order
    ORDER BY sort_order ASC
  `).all();
  const map = /* @__PURE__ */ new Map();
  for (const row of rows) {
    map.set(row.path, row.sortOrder);
  }
  return map;
}
function updateProjectOrders(orders) {
  const db2 = getDatabase();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const stmt = db2.prepare(`
    INSERT OR REPLACE INTO project_order (path, sort_order, updated_at)
    VALUES (?, ?, ?)
  `);
  const transaction = db2.transaction(() => {
    for (const order of orders) {
      stmt.run(order.path, order.sortOrder, now);
    }
  });
  transaction();
}
function hasCustomProjectOrder() {
  const db2 = getDatabase();
  const row = db2.prepare(`
    SELECT 1 FROM project_order LIMIT 1
  `).get();
  return !!row;
}

// src/ui/components/StorageScreen.tsx
import { Box, Text } from "ink";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
var StorageScreen = ({
  stats,
  purgeOptions,
  selectedOption,
  mode
}) => {
  const selectedPurge = selectedOption !== null ? purgeOptions[selectedOption] : null;
  return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
    /* @__PURE__ */ jsx(Box, { marginBottom: 1, children: /* @__PURE__ */ jsx(Text, { bold: true, color: "cyan", children: "Storage Management" }) }),
    /* @__PURE__ */ jsxs(Box, { flexDirection: "column", marginBottom: 1, children: [
      /* @__PURE__ */ jsx(Text, { bold: true, children: "Current Storage:" }),
      /* @__PURE__ */ jsxs(Text, { children: [
        "  Database:  ",
        formatBytes(stats.dbSize)
      ] }),
      /* @__PURE__ */ jsxs(Text, { children: [
        "  Backups:   ",
        formatBytes(stats.backupsSize)
      ] }),
      /* @__PURE__ */ jsxs(Text, { bold: true, children: [
        "  Total:     ",
        formatBytes(stats.totalSize)
      ] }),
      /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
        "  (",
        stats.sessionCount,
        " sessions, ",
        stats.messageCount,
        " messages)"
      ] })
    ] }),
    mode === "view" ? /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsxs(Box, { flexDirection: "column", marginTop: 1, children: [
        /* @__PURE__ */ jsx(Text, { bold: true, children: "Purge Old Sessions:" }),
        /* @__PURE__ */ jsx(Text, { dimColor: true, children: "  (Deletes both database entries and backup files)" }),
        /* @__PURE__ */ jsx(Text, { dimColor: true, children: "  (Starred sessions are always preserved)" })
      ] }),
      /* @__PURE__ */ jsx(Box, { flexDirection: "column", marginTop: 1, children: purgeOptions.map((option, index) => {
        const hasData = option.preview.sessionsToDelete > 0;
        return /* @__PURE__ */ jsxs(Box, { children: [
          /* @__PURE__ */ jsxs(Text, { color: hasData ? "yellow" : "gray", children: [
            "[",
            index + 1,
            "] Older than ",
            option.days,
            " days: ",
            " "
          ] }),
          hasData ? /* @__PURE__ */ jsxs(Text, { children: [
            option.preview.sessionsToDelete,
            " sessions",
            option.preview.backupFilesToDelete > 0 && /* @__PURE__ */ jsxs(Text, { children: [
              ", ",
              option.preview.backupFilesToDelete,
              " backups"
            ] }),
            /* @__PURE__ */ jsxs(Text, { dimColor: true, children: [
              " (~",
              formatBytes(option.preview.backupBytesToFree),
              " freed)"
            ] })
          ] }) : /* @__PURE__ */ jsx(Text, { dimColor: true, children: "No sessions to purge" })
        ] }, option.days);
      }) }),
      /* @__PURE__ */ jsx(Box, { marginTop: 1, children: /* @__PURE__ */ jsx(Text, { dimColor: true, children: "[1/2/3] Select option  [Esc] Back" }) })
    ] }) : (
      /* Confirm mode */
      selectedPurge && /* @__PURE__ */ jsxs(Box, { flexDirection: "column", marginTop: 1, children: [
        /* @__PURE__ */ jsx(Text, { color: "red", bold: true, children: "Confirm Purge:" }),
        /* @__PURE__ */ jsxs(Text, { children: [
          "  Period: Older than ",
          selectedPurge.days,
          " days"
        ] }),
        /* @__PURE__ */ jsxs(Text, { children: [
          "  Sessions: ",
          selectedPurge.preview.sessionsToDelete
        ] }),
        /* @__PURE__ */ jsxs(Text, { children: [
          "  Messages: ",
          selectedPurge.preview.messagesInvolved
        ] }),
        selectedPurge.preview.backupFilesToDelete > 0 && /* @__PURE__ */ jsxs(Text, { children: [
          "  Backup files: ",
          selectedPurge.preview.backupFilesToDelete
        ] }),
        /* @__PURE__ */ jsxs(Text, { children: [
          "  Date range: ",
          selectedPurge.preview.oldestSessionDate,
          " to ",
          selectedPurge.preview.newestSessionDate
        ] }),
        /* @__PURE__ */ jsxs(Text, { children: [
          "  Space freed: ~",
          formatBytes(selectedPurge.preview.backupBytesToFree)
        ] }),
        /* @__PURE__ */ jsx(Box, { marginTop: 1, children: /* @__PURE__ */ jsx(Text, { color: "red", children: "This cannot be undone. Proceed? [y/n]" }) })
      ] })
    )
  ] });
};

// src/ui/components/Header.tsx
import { Box as Box2, Text as Text2 } from "ink";
import { basename as basename3 } from "path";
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
var Header = ({ embeddingsReady, projectFilter }) => {
  return /* @__PURE__ */ jsxs2(Box2, { marginBottom: 1, justifyContent: "space-between", children: [
    /* @__PURE__ */ jsxs2(Box2, { children: [
      /* @__PURE__ */ jsx2(Text2, { bold: true, color: "cyan", children: "cmem" }),
      projectFilter && /* @__PURE__ */ jsxs2(Text2, { color: "yellow", children: [
        " \u{1F4C1} ",
        basename3(projectFilter)
      ] }),
      !embeddingsReady && /* @__PURE__ */ jsx2(Text2, { color: "yellow", dimColor: true, children: " (loading model...)" })
    ] }),
    /* @__PURE__ */ jsx2(Text2, { dimColor: true, children: "[q] quit" })
  ] });
};

// src/ui/components/SearchInput.tsx
import { Box as Box3, Text as Text3 } from "ink";
import TextInput from "ink-text-input";
import { jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
var SearchInput = ({
  value,
  onChange,
  isFocused
}) => {
  return /* @__PURE__ */ jsxs3(Box3, { marginBottom: 1, children: [
    /* @__PURE__ */ jsx3(Text3, { children: "Search: " }),
    isFocused ? /* @__PURE__ */ jsx3(
      TextInput,
      {
        value,
        onChange,
        placeholder: "type to search...",
        focus: true
      }
    ) : /* @__PURE__ */ jsx3(Text3, { dimColor: true, children: value || "press / to search" })
  ] });
};

// src/ui/components/SessionList.tsx
import { Box as Box4, Text as Text4 } from "ink";
import { basename as basename4 } from "path";

// src/utils/format.ts
function formatTimeAgo(timestamp) {
  const date = new Date(timestamp);
  const now = /* @__PURE__ */ new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1e3);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);
  if (diffSecs < 60) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffWeeks < 4) return `${diffWeeks}w ago`;
  return `${diffMonths}mo ago`;
}
function truncate(text, maxLength) {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + "...";
}
function shortId(id) {
  return id.slice(0, 8);
}
function formatNumber(num) {
  return num.toLocaleString();
}
function formatBytes2(bytes) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}
function generateTitle(content) {
  const firstLine = content.split("\n")[0].trim();
  const title = truncate(firstLine, 50);
  return title || "Untitled Session";
}

// src/ui/components/SessionList.tsx
import { jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
var SessionList = ({
  sessions,
  selectedIndex
}) => {
  if (sessions.length === 0) {
    return /* @__PURE__ */ jsxs4(
      Box4,
      {
        flexDirection: "column",
        borderStyle: "round",
        borderColor: "gray",
        paddingX: 1,
        paddingY: 0,
        children: [
          /* @__PURE__ */ jsx4(Text4, { bold: true, children: "Sessions" }),
          /* @__PURE__ */ jsx4(Text4, { dimColor: true, children: "No sessions found" }),
          /* @__PURE__ */ jsx4(Text4, { dimColor: true, children: "Run: cmem save --latest" })
        ]
      }
    );
  }
  const visibleCount = 8;
  let startIndex = Math.max(0, selectedIndex - Math.floor(visibleCount / 2));
  const endIndex = Math.min(sessions.length, startIndex + visibleCount);
  if (endIndex - startIndex < visibleCount) {
    startIndex = Math.max(0, endIndex - visibleCount);
  }
  const visibleSessions = sessions.slice(startIndex, endIndex);
  return /* @__PURE__ */ jsxs4(
    Box4,
    {
      flexDirection: "column",
      borderStyle: "round",
      borderColor: "gray",
      paddingX: 1,
      paddingY: 0,
      children: [
        /* @__PURE__ */ jsxs4(Text4, { bold: true, children: [
          "Sessions (",
          sessions.length,
          ")"
        ] }),
        visibleSessions.map((session, i) => {
          const actualIndex = startIndex + i;
          const isSelected = actualIndex === selectedIndex;
          return /* @__PURE__ */ jsx4(
            SessionItem,
            {
              session,
              isSelected
            },
            session.id
          );
        }),
        sessions.length > visibleCount && /* @__PURE__ */ jsxs4(Text4, { dimColor: true, children: [
          startIndex > 0 ? "\u2191 more above" : "",
          startIndex > 0 && endIndex < sessions.length ? " | " : "",
          endIndex < sessions.length ? "\u2193 more below" : ""
        ] })
      ]
    }
  );
};
var SessionItem = ({ session, isSelected }) => {
  const hasCustomTitle = !!session.customTitle;
  const displayTitle = truncate(session.customTitle || session.title, 38);
  const folderName = session.projectPath ? truncate(basename4(session.projectPath), 38) : "";
  const msgs = String(session.messageCount).padStart(3);
  const updated = formatTimeAgo(session.updatedAt);
  const getTitleColor = () => {
    if (isSelected) return "cyan";
    if (session.isFavorite) return "yellow";
    if (hasCustomTitle) return "magenta";
    return void 0;
  };
  return /* @__PURE__ */ jsxs4(Box4, { children: [
    /* @__PURE__ */ jsx4(Text4, { color: isSelected ? "cyan" : void 0, children: isSelected ? "\u25B8 " : "  " }),
    /* @__PURE__ */ jsx4(Text4, { color: "yellow", children: session.isFavorite ? "\u2B50" : "  " }),
    /* @__PURE__ */ jsx4(Text4, { bold: isSelected, color: getTitleColor(), wrap: "truncate", children: displayTitle.padEnd(38) }),
    /* @__PURE__ */ jsxs4(Text4, { color: "blue", children: [
      " ",
      folderName.padEnd(38)
    ] }),
    /* @__PURE__ */ jsxs4(Text4, { dimColor: true, children: [
      " ",
      msgs,
      " "
    ] }),
    /* @__PURE__ */ jsx4(Text4, { dimColor: true, children: updated.padStart(8) })
  ] });
};

// src/ui/components/ProjectList.tsx
import { Box as Box5, Text as Text5 } from "ink";
import { jsx as jsx5, jsxs as jsxs5 } from "react/jsx-runtime";
var ProjectList = ({
  projects,
  selectedIndex
}) => {
  if (projects.length === 0) {
    return /* @__PURE__ */ jsxs5(
      Box5,
      {
        flexDirection: "column",
        borderStyle: "round",
        borderColor: "gray",
        paddingX: 1,
        paddingY: 0,
        children: [
          /* @__PURE__ */ jsx5(Text5, { bold: true, children: "Projects" }),
          /* @__PURE__ */ jsx5(Text5, { dimColor: true, children: "No projects found" }),
          /* @__PURE__ */ jsx5(Text5, { dimColor: true, children: "Start using Claude Code in a project directory" })
        ]
      }
    );
  }
  const visibleCount = 8;
  let startIndex = Math.max(0, selectedIndex - Math.floor(visibleCount / 2));
  const endIndex = Math.min(projects.length, startIndex + visibleCount);
  if (endIndex - startIndex < visibleCount) {
    startIndex = Math.max(0, endIndex - visibleCount);
  }
  const visibleProjects = projects.slice(startIndex, endIndex);
  return /* @__PURE__ */ jsxs5(
    Box5,
    {
      flexDirection: "column",
      borderStyle: "round",
      borderColor: "gray",
      paddingX: 1,
      paddingY: 0,
      children: [
        /* @__PURE__ */ jsxs5(Text5, { bold: true, children: [
          "Projects (",
          projects.length,
          ")"
        ] }),
        visibleProjects.map((project, i) => {
          const actualIndex = startIndex + i;
          const isSelected = actualIndex === selectedIndex;
          return /* @__PURE__ */ jsx5(
            ProjectItem,
            {
              project,
              isSelected
            },
            project.path
          );
        }),
        projects.length > visibleCount && /* @__PURE__ */ jsxs5(Text5, { dimColor: true, children: [
          startIndex > 0 ? "\u2191 more above" : "",
          startIndex > 0 && endIndex < projects.length ? " | " : "",
          endIndex < projects.length ? "\u2193 more below" : ""
        ] })
      ]
    }
  );
};
var ProjectItem = ({ project, isSelected }) => {
  const displayName = truncate(project.name, 40);
  const sessions = `${project.sessionCount} session${project.sessionCount !== 1 ? "s" : ""}`;
  const messages = `${project.totalMessages} msgs`;
  const updated = formatTimeAgo(project.lastUpdated);
  const orderBadge = project.sortOrder !== null ? `${project.sortOrder + 1}.` : "  ";
  return /* @__PURE__ */ jsxs5(Box5, { children: [
    /* @__PURE__ */ jsx5(Text5, { color: isSelected ? "cyan" : void 0, children: isSelected ? "\u25B8 " : "  " }),
    /* @__PURE__ */ jsxs5(Text5, { dimColor: true, children: [
      orderBadge.padStart(3),
      " "
    ] }),
    /* @__PURE__ */ jsx5(Text5, { color: "blue", children: "\u{1F4C1} " }),
    /* @__PURE__ */ jsx5(Text5, { bold: isSelected, color: isSelected ? "cyan" : void 0, wrap: "truncate", children: displayName.padEnd(35) }),
    /* @__PURE__ */ jsxs5(Text5, { dimColor: true, children: [
      " ",
      sessions.padEnd(12)
    ] }),
    /* @__PURE__ */ jsxs5(Text5, { dimColor: true, children: [
      " ",
      messages.padEnd(10)
    ] }),
    /* @__PURE__ */ jsx5(Text5, { dimColor: true, children: updated.padStart(10) })
  ] });
};

// src/ui/components/Preview.tsx
import { Box as Box6, Text as Text6 } from "ink";
import { jsx as jsx6, jsxs as jsxs6 } from "react/jsx-runtime";
var Preview = ({ session }) => {
  if (!session) {
    return null;
  }
  const summary = session.summary ? truncate(session.summary, 200) : "No summary available";
  return /* @__PURE__ */ jsxs6(
    Box6,
    {
      flexDirection: "column",
      borderStyle: "round",
      borderColor: "gray",
      paddingX: 1,
      paddingY: 0,
      marginTop: 1,
      children: [
        /* @__PURE__ */ jsxs6(Box6, { children: [
          /* @__PURE__ */ jsx6(Text6, { bold: true, children: "Preview" }),
          session.isFavorite && /* @__PURE__ */ jsx6(Text6, { color: "yellow", children: " \u2B50" }),
          session.projectPath && /* @__PURE__ */ jsxs6(Text6, { bold: true, color: "blue", children: [
            "  \u{1F4C1} ",
            session.projectPath
          ] })
        ] }),
        /* @__PURE__ */ jsx6(Text6, { wrap: "wrap", children: summary }),
        /* @__PURE__ */ jsxs6(Text6, { dimColor: true, children: [
          "Messages: ",
          session.messageCount
        ] })
      ]
    }
  );
};

// src/ui/hooks/useSessions.ts
import { useState, useEffect, useCallback } from "react";

// src/db/vectors.ts
function storeEmbedding(sessionId, embedding) {
  const db2 = getDatabase();
  const embeddingJson = JSON.stringify(embedding);
  db2.prepare(`
    INSERT OR REPLACE INTO session_embeddings (session_id, embedding)
    VALUES (?, ?)
  `).run(sessionId, embeddingJson);
}
function searchSessions(queryEmbedding, limit = 10) {
  const db2 = getDatabase();
  const embeddingJson = JSON.stringify(queryEmbedding);
  const rows = db2.prepare(`
    SELECT s.id, s.title, s.summary, s.created_at as createdAt, s.updated_at as updatedAt,
           s.message_count as messageCount, s.project_path as projectPath, s.raw_data as rawData,
           vec_distance_L2(e.embedding, ?) as distance
    FROM session_embeddings e
    JOIN sessions s ON e.session_id = s.id
    ORDER BY distance ASC
    LIMIT ?
  `).all(embeddingJson, limit);
  return rows;
}

// src/embeddings/index.ts
import { existsSync as existsSync5 } from "fs";
import { join as join4 } from "path";
var transformersModule = null;
var pipeline = null;
var initialized = false;
async function getTransformers() {
  if (!transformersModule) {
    transformersModule = await import("@xenova/transformers");
  }
  return transformersModule;
}
function isModelCached() {
  const modelCachePath = join4(MODELS_DIR, EMBEDDING_MODEL);
  return existsSync5(modelCachePath);
}
async function initializeEmbeddings(onProgress) {
  if (initialized && pipeline) {
    return;
  }
  ensureModelsDir();
  const { pipeline: createPipeline, env } = await getTransformers();
  env.cacheDir = MODELS_DIR;
  const cached = isModelCached();
  if (cached) {
    env.allowRemoteModels = false;
    onProgress?.({ status: "loading" });
  } else {
    onProgress?.({ status: "downloading" });
  }
  pipeline = await createPipeline("feature-extraction", EMBEDDING_MODEL, {
    progress_callback: onProgress ? (progress) => {
      if (progress.status === "progress" && progress.file && progress.progress !== void 0) {
        onProgress({
          status: "downloading",
          file: progress.file,
          progress: progress.progress
        });
      }
    } : void 0
  });
  initialized = true;
  onProgress?.({ status: "ready" });
}
function isReady() {
  return initialized && pipeline !== null;
}
async function getEmbedding(text) {
  if (!initialized) {
    await initializeEmbeddings();
  }
  const truncated = text.slice(0, MAX_EMBEDDING_CHARS);
  const output = await pipeline(truncated, {
    pooling: "mean",
    normalize: true
  });
  return Array.from(output.data);
}
function createEmbeddingText(title, summary, messages) {
  const parts = [];
  parts.push(`Title: ${title}`);
  if (summary) {
    parts.push(`Summary: ${summary}`);
  }
  const userMessages = messages.filter((m) => m.role === "user").slice(0, 5).map((m) => m.content.slice(0, MAX_MESSAGE_PREVIEW_CHARS));
  if (userMessages.length > 0) {
    parts.push("User messages:");
    parts.push(...userMessages);
  }
  const assistantMessages = messages.filter((m) => m.role === "assistant").slice(0, 3).map((m) => m.content.slice(0, MAX_MESSAGE_PREVIEW_CHARS));
  if (assistantMessages.length > 0) {
    parts.push("Assistant responses:");
    parts.push(...assistantMessages);
  }
  return parts.join("\n\n");
}

// src/ui/hooks/useSessions.ts
import { existsSync as existsSync6 } from "fs";
function isRecoverable(session) {
  if (!session.sourceFile) return false;
  if (existsSync6(session.sourceFile)) return true;
  if (hasBackup(session.sourceFile)) return true;
  return false;
}
function ensureBackedUp(session) {
  if (!session.sourceFile) return;
  if (existsSync6(session.sourceFile) && !hasBackup(session.sourceFile)) {
    backupSessionFile(session.sourceFile);
  }
}
function useSessions(options = {}) {
  const [sessions, setSessions] = useState([]);
  const [allSessions, setAllSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [embeddingsReady, setEmbeddingsReady] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [projectFilter, setProjectFilter] = useState(options.projectFilter ?? null);
  const [favoriteSessionIds, setFavoriteSessionIds] = useState(/* @__PURE__ */ new Set());
  const [hasFavSessions, setHasFavSessions] = useState(false);
  const [projectOrderMap, setProjectOrderMap] = useState(/* @__PURE__ */ new Map());
  const [hasCustomOrder, setHasCustomOrder] = useState(false);
  const smartSort = useCallback((sessionList, favIds) => {
    const withFavorites = sessionList.map((s) => ({
      ...s,
      isFavorite: favIds.has(s.id)
    }));
    return withFavorites.sort((a, b) => {
      const aHasCustom = !!a.customTitle;
      const bHasCustom = !!b.customTitle;
      const aTier = a.isFavorite ? 0 : aHasCustom ? 1 : 2;
      const bTier = b.isFavorite ? 0 : bHasCustom ? 1 : 2;
      if (aTier !== bTier) return aTier - bTier;
      if (a.messageCount !== b.messageCount) return b.messageCount - a.messageCount;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }, []);
  const [projects, setProjects] = useState([]);
  const calculateProjects = useCallback((sessionList, orderMap) => {
    const projectMap = /* @__PURE__ */ new Map();
    for (const session of sessionList) {
      if (!session.projectPath) continue;
      const existing = projectMap.get(session.projectPath);
      if (existing) {
        existing.sessionCount++;
        existing.totalMessages += session.messageCount;
        if (new Date(session.updatedAt) > new Date(existing.lastUpdated)) {
          existing.lastUpdated = session.updatedAt;
        }
      } else {
        const pathParts = session.projectPath.split("/");
        projectMap.set(session.projectPath, {
          path: session.projectPath,
          name: pathParts[pathParts.length - 1] || session.projectPath,
          sessionCount: 1,
          totalMessages: session.messageCount,
          sortOrder: orderMap.get(session.projectPath) ?? null,
          lastUpdated: session.updatedAt
        });
      }
    }
    return Array.from(projectMap.values()).sort((a, b) => {
      if (a.sortOrder !== null && b.sortOrder !== null) {
        return a.sortOrder - b.sortOrder;
      }
      if (a.sortOrder !== null && b.sortOrder === null) return -1;
      if (a.sortOrder === null && b.sortOrder !== null) return 1;
      if (a.totalMessages !== b.totalMessages) return b.totalMessages - a.totalMessages;
      return new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime();
    });
  }, []);
  const loadSessions = useCallback(() => {
    try {
      const loaded = projectFilter ? listHumanSessionsByProject(projectFilter) : listHumanSessions();
      loaded.forEach(ensureBackedUp);
      const recoverable = loaded.filter(isRecoverable);
      const favIds = getFavoriteSessionIds();
      const orderMap = getProjectOrders();
      setFavoriteSessionIds(favIds);
      setProjectOrderMap(orderMap);
      setHasFavSessions(hasFavoriteSessions());
      setHasCustomOrder(hasCustomProjectOrder());
      const sorted = smartSort(recoverable, favIds);
      setAllSessions(sorted);
      setSessions(sorted);
      if (!projectFilter) {
        setProjects(calculateProjects(sorted, orderMap));
      }
      setError(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [projectFilter, smartSort, calculateProjects]);
  const initEmbeddings = useCallback(async () => {
    if (isReady()) {
      setEmbeddingsReady(true);
      return;
    }
    try {
      await initializeEmbeddings();
      setEmbeddingsReady(true);
    } catch {
      setEmbeddingsReady(false);
    }
  }, []);
  useEffect(() => {
    loadSessions();
    initEmbeddings();
  }, [loadSessions, initEmbeddings]);
  useEffect(() => {
    loadSessions();
  }, [projectFilter, loadSessions]);
  const search = useCallback(async (query) => {
    if (!query.trim()) {
      setSessions(allSessions);
      setIsSearching(false);
      return;
    }
    if (!embeddingsReady) {
      const filtered = allSessions.filter(
        (s) => s.title.toLowerCase().includes(query.toLowerCase()) || s.summary && s.summary.toLowerCase().includes(query.toLowerCase())
      );
      setSessions(smartSort(filtered, favoriteSessionIds));
      setIsSearching(true);
      return;
    }
    try {
      setLoading(true);
      const queryEmbedding = await getEmbedding(query);
      const results = searchSessions(queryEmbedding, 20);
      setSessions(smartSort(results, favoriteSessionIds));
      setIsSearching(true);
    } catch (err) {
      setError(String(err));
      const filtered = allSessions.filter(
        (s) => s.title.toLowerCase().includes(query.toLowerCase()) || s.summary && s.summary.toLowerCase().includes(query.toLowerCase())
      );
      setSessions(smartSort(filtered, favoriteSessionIds));
    } finally {
      setLoading(false);
    }
  }, [allSessions, embeddingsReady, favoriteSessionIds, smartSort]);
  const clearSearch = useCallback(() => {
    setSessions(allSessions);
    setIsSearching(false);
  }, [allSessions]);
  const deleteSessionHandler = useCallback((id) => {
    const deleted = deleteSession(id);
    if (deleted) {
      setAllSessions((prev) => prev.filter((s) => s.id !== id));
      setSessions((prev) => prev.filter((s) => s.id !== id));
    }
  }, []);
  const getSessionById = useCallback((id) => {
    return getSession(id);
  }, []);
  const toggleFavoriteHandler = useCallback((sessionId) => {
    const isNowFavorite = toggleFavorite("session", sessionId);
    const newFavIds = new Set(favoriteSessionIds);
    if (isNowFavorite) {
      newFavIds.add(sessionId);
    } else {
      newFavIds.delete(sessionId);
    }
    setFavoriteSessionIds(newFavIds);
    setHasFavSessions(newFavIds.size > 0);
    setAllSessions((prev) => smartSort(prev, newFavIds));
    setSessions((prev) => smartSort(prev, newFavIds));
    return isNowFavorite;
  }, [favoriteSessionIds, smartSort]);
  const moveProject = useCallback((fromIndex, toIndex) => {
    if (fromIndex === toIndex) return;
    if (fromIndex < 0 || toIndex < 0) return;
    if (fromIndex >= projects.length || toIndex >= projects.length) return;
    const newProjects = [...projects];
    const [movedProject] = newProjects.splice(fromIndex, 1);
    newProjects.splice(toIndex, 0, movedProject);
    const orders = newProjects.map((project, index) => ({
      path: project.path,
      sortOrder: index
    }));
    updateProjectOrders(orders);
    const newOrderMap = /* @__PURE__ */ new Map();
    for (const order of orders) {
      newOrderMap.set(order.path, order.sortOrder);
    }
    setProjectOrderMap(newOrderMap);
    setHasCustomOrder(true);
    setProjects(newProjects.map((p, i) => ({ ...p, sortOrder: i })));
  }, [projects]);
  return {
    sessions,
    projects,
    loading,
    error,
    embeddingsReady,
    projectFilter,
    setProjectFilter,
    refresh: loadSessions,
    search,
    clearSearch,
    deleteSession: deleteSessionHandler,
    getSessionById,
    toggleFavorite: toggleFavoriteHandler,
    favoriteSessionIds,
    hasFavoriteSessions: hasFavSessions,
    moveProject,
    hasCustomProjectOrder: hasCustomOrder
  };
}

// src/ui/App.tsx
import { jsx as jsx7, jsxs as jsxs7 } from "react/jsx-runtime";
var App = ({ onResume, projectFilter: initialProjectFilter }) => {
  const { exit } = useApp();
  const {
    sessions,
    projects,
    loading,
    embeddingsReady,
    projectFilter,
    setProjectFilter,
    search,
    clearSearch,
    deleteSession: deleteSession2,
    refresh,
    toggleFavorite: toggleFavorite2,
    moveProject
  } = useSessions({ projectFilter: initialProjectFilter });
  const [selectedIndex, setSelectedIndex] = useState2(0);
  const [searchQuery, setSearchQuery] = useState2("");
  const [mode, setMode] = useState2("list");
  const [statusMessage, setStatusMessage] = useState2(null);
  const [renameValue, setRenameValue] = useState2("");
  const [currentTab, setCurrentTab] = useState2("global");
  const [selectedProjectPath, setSelectedProjectPath] = useState2(null);
  const [renderKey, setRenderKey] = useState2(0);
  const [dbSizeAlertShown, setDbSizeAlertShown] = useState2(false);
  const [purgePreview, setPurgePreview] = useState2(null);
  const [dbSize, setDbSize] = useState2(0);
  const [storageStats, setStorageStats] = useState2(null);
  const [purgeOptions, setPurgeOptions] = useState2([]);
  const [selectedPurgeOption, setSelectedPurgeOption] = useState2(null);
  const getCurrentView = useCallback2(() => {
    if (currentTab === "projects") {
      return selectedProjectPath ? "project-sessions" : "projects";
    }
    return "sessions";
  }, [currentTab, selectedProjectPath]);
  const currentView = getCurrentView();
  const projectSessions = selectedProjectPath ? sessions.filter((s) => s.projectPath === selectedProjectPath) : [];
  useEffect2(() => {
    setSelectedIndex(0);
  }, [currentTab, selectedProjectPath]);
  useEffect2(() => {
    if (!loading && !dbSizeAlertShown) {
      const size = getTotalStorageSize();
      if (size >= DB_SIZE_ALERT_THRESHOLD) {
        const preview = getPurgePreview(DEFAULT_PURGE_DAYS);
        if (preview.sessionsToDelete > 0) {
          setDbSize(size);
          setPurgePreview(preview);
          setMode("db-size-alert");
        }
      }
      setDbSizeAlertShown(true);
    }
  }, [loading, dbSizeAlertShown]);
  useEffect2(() => {
    const maxIndex = currentView === "projects" ? projects.length - 1 : currentView === "project-sessions" ? projectSessions.length - 1 : sessions.length - 1;
    if (selectedIndex > maxIndex) {
      setSelectedIndex(Math.max(0, maxIndex));
    }
  }, [currentView, projects.length, projectSessions.length, sessions.length, selectedIndex]);
  useEffect2(() => {
    if (mode === "search" && searchQuery.length > 2) {
      const timer = setTimeout(() => {
        search(searchQuery);
      }, 300);
      return () => clearTimeout(timer);
    } else if (mode === "search" && searchQuery.length === 0) {
      clearSearch();
    }
  }, [searchQuery, mode, search, clearSearch]);
  useEffect2(() => {
    if (statusMessage) {
      const timer = setTimeout(() => setStatusMessage(null), 3e3);
      return () => clearTimeout(timer);
    }
  }, [statusMessage]);
  const getCurrentSessions = useCallback2(() => {
    if (currentView === "project-sessions") {
      return projectSessions;
    }
    return sessions;
  }, [currentView, projectSessions, sessions]);
  const handleRestore = useCallback2(() => {
    const currentSessions2 = getCurrentSessions();
    const session = currentSessions2[selectedIndex];
    if (!session) return;
    if (session.sourceFile) {
      if (!existsSync7(session.sourceFile)) {
        if (hasBackup(session.sourceFile)) {
          const restored = restoreFromBackup(session.sourceFile);
          if (restored) {
            setStatusMessage("Restored session from backup");
          } else {
            setStatusMessage("Failed to restore session from backup");
            return;
          }
        } else {
          setStatusMessage("Session file deleted and no backup - cannot resume");
          return;
        }
      }
      const filename = basename5(session.sourceFile);
      const claudeSessionId = filename.replace(".jsonl", "");
      let projectPath = session.projectPath;
      if (!projectPath) {
        const projectDirName = basename5(dirname4(session.sourceFile));
        if (projectDirName.startsWith("-")) {
          const segments = projectDirName.substring(1).split("-");
          let currentPath = "";
          let remainingSegments = [...segments];
          while (remainingSegments.length > 0) {
            let found = false;
            for (let i = remainingSegments.length; i > 0; i--) {
              const testSegment = remainingSegments.slice(0, i).join("-");
              const testPath = currentPath + "/" + testSegment;
              if (existsSync7(testPath)) {
                currentPath = testPath;
                remainingSegments = remainingSegments.slice(i);
                found = true;
                break;
              }
            }
            if (!found) {
              currentPath = currentPath + "/" + remainingSegments.join("-");
              break;
            }
          }
          if (currentPath && existsSync7(currentPath)) {
            projectPath = currentPath;
          }
        }
      }
      if (onResume) {
        onResume(claudeSessionId, projectPath);
        exit();
      }
    } else {
      setStatusMessage("No source file - cannot resume this session");
    }
  }, [getCurrentSessions, selectedIndex, onResume, exit]);
  const handleEnterProject = useCallback2(() => {
    const project = projects[selectedIndex];
    if (project) {
      setRenderKey((k) => k + 1);
      setSelectedProjectPath(project.path);
      setSelectedIndex(0);
    }
  }, [projects, selectedIndex]);
  const handleBackToProjects = useCallback2(() => {
    setRenderKey((k) => k + 1);
    setSelectedProjectPath(null);
    setSelectedIndex(0);
  }, []);
  const handleDelete = useCallback2(() => {
    const currentSessions2 = getCurrentSessions();
    const session = currentSessions2[selectedIndex];
    if (session) {
      deleteSession2(session.id);
      setStatusMessage(`Deleted: ${session.customTitle || session.title}`);
      setMode("list");
    }
  }, [getCurrentSessions, selectedIndex, deleteSession2]);
  const handleRename = useCallback2(() => {
    const currentSessions2 = getCurrentSessions();
    const session = currentSessions2[selectedIndex];
    if (session && renameValue.trim()) {
      renameSession(session.id, renameValue.trim());
      setStatusMessage(`Renamed to: ${renameValue.trim()}`);
      refresh();
    }
    setMode("list");
    setRenameValue("");
  }, [getCurrentSessions, selectedIndex, renameValue, refresh]);
  const handleClearRename = useCallback2(() => {
    const currentSessions2 = getCurrentSessions();
    const session = currentSessions2[selectedIndex];
    if (session && session.customTitle) {
      renameSession(session.id, null);
      setStatusMessage(`Cleared custom name`);
      refresh();
    }
    setMode("list");
  }, [getCurrentSessions, selectedIndex, refresh]);
  useInput((input, key) => {
    if (input === "q" && mode !== "search" && mode !== "rename" && mode !== "sort-project" && mode !== "db-size-alert" && mode !== "confirm-purge" && mode !== "storage" && mode !== "storage-confirm") {
      exit();
      return;
    }
    if (mode === "confirm-delete") {
      if (input === "y" || input === "Y") {
        handleDelete();
      } else {
        setMode("list");
      }
      return;
    }
    if (mode === "rename") {
      if (key.escape) {
        setMode("list");
        setRenameValue("");
        return;
      }
      if (key.return) {
        handleRename();
        return;
      }
      return;
    }
    if (mode === "search") {
      if (key.escape) {
        setMode("list");
        setSearchQuery("");
        clearSearch();
        return;
      }
      if (key.return) {
        setMode("list");
        return;
      }
      return;
    }
    if (mode === "sort-project") {
      if (key.escape || key.return) {
        setMode("list");
        return;
      }
      if (key.upArrow || input === "k") {
        if (selectedIndex > 0) {
          moveProject(selectedIndex, selectedIndex - 1);
          setSelectedIndex(selectedIndex - 1);
        }
        return;
      }
      if (key.downArrow || input === "j") {
        if (selectedIndex < projects.length - 1) {
          moveProject(selectedIndex, selectedIndex + 1);
          setSelectedIndex(selectedIndex + 1);
        }
        return;
      }
      return;
    }
    if (mode === "db-size-alert") {
      if (input === "y" || input === "Y") {
        setMode("confirm-purge");
      } else {
        setMode("list");
      }
      return;
    }
    if (mode === "confirm-purge") {
      if (input === "y" || input === "Y") {
        const result = purgeOldSessions(DEFAULT_PURGE_DAYS);
        const parts = [];
        if (result.sessionsDeleted > 0) {
          parts.push(`${result.sessionsDeleted} session${result.sessionsDeleted !== 1 ? "s" : ""}`);
        }
        if (result.backupsDeleted > 0) {
          parts.push(`${result.backupsDeleted} backup${result.backupsDeleted !== 1 ? "s" : ""}`);
        }
        setStatusMessage(`Purged ${parts.join(" and ")}`);
        refresh();
        setMode("list");
      } else {
        setMode("list");
      }
      return;
    }
    if (mode === "storage") {
      if (key.escape || input === "q") {
        setMode("list");
        return;
      }
      const optionIndex = parseInt(input, 10) - 1;
      if (optionIndex >= 0 && optionIndex < purgeOptions.length) {
        const option = purgeOptions[optionIndex];
        if (option && option.preview.sessionsToDelete > 0) {
          setSelectedPurgeOption(optionIndex);
          setMode("storage-confirm");
        }
      }
      return;
    }
    if (mode === "storage-confirm") {
      if (input === "y" || input === "Y") {
        if (selectedPurgeOption !== null && purgeOptions[selectedPurgeOption]) {
          const days = purgeOptions[selectedPurgeOption].days;
          const result = purgeOldSessions(days);
          const parts = [];
          if (result.sessionsDeleted > 0) {
            parts.push(`${result.sessionsDeleted} session${result.sessionsDeleted !== 1 ? "s" : ""}`);
          }
          if (result.backupsDeleted > 0) {
            parts.push(`${result.backupsDeleted} backup${result.backupsDeleted !== 1 ? "s" : ""}`);
          }
          setStatusMessage(`Purged ${parts.join(" and ")}`);
          refresh();
          setSelectedPurgeOption(null);
          setMode("list");
        }
      } else {
        setSelectedPurgeOption(null);
        setMode("storage");
      }
      return;
    }
    if (input === "/") {
      setMode("search");
      return;
    }
    if (input === "P") {
      const dbStats = getStats();
      const dbSizeVal = getDatabaseSize();
      const backupsSizeVal = getBackupsDirSize();
      setStorageStats({
        dbSize: dbSizeVal,
        backupsSize: backupsSizeVal,
        totalSize: dbSizeVal + backupsSizeVal,
        sessionCount: dbStats.sessionCount,
        messageCount: dbStats.messageCount
      });
      setPurgeOptions([
        { days: 15, preview: getPurgePreview(15) },
        { days: 30, preview: getPurgePreview(30) },
        { days: 60, preview: getPurgePreview(60) }
      ]);
      setMode("storage");
      return;
    }
    if ((key.escape || key.backspace || key.delete) && currentView === "project-sessions") {
      handleBackToProjects();
      return;
    }
    if (input === "r" && currentView !== "projects") {
      const currentSessions2 = getCurrentSessions();
      if (currentSessions2.length > 0) {
        const session = currentSessions2[selectedIndex];
        setRenameValue(session?.customTitle || "");
        setMode("rename");
      }
      return;
    }
    if (input === "R" && currentView !== "projects") {
      handleClearRename();
      return;
    }
    if (key.leftArrow || input === "h") {
      if (currentTab === "projects") {
        setRenderKey((k) => k + 1);
        setCurrentTab("global");
        setSelectedProjectPath(null);
      }
      return;
    }
    if (key.rightArrow || input === "l") {
      if (currentTab === "global") {
        setRenderKey((k) => k + 1);
        setCurrentTab("projects");
      }
      return;
    }
    if (key.upArrow || input === "k") {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
      return;
    }
    if (key.downArrow || input === "j") {
      const maxIndex = currentView === "projects" ? projects.length - 1 : currentView === "project-sessions" ? projectSessions.length - 1 : sessions.length - 1;
      setSelectedIndex((prev) => Math.min(maxIndex, prev + 1));
      return;
    }
    if (key.return) {
      if (currentView === "projects") {
        handleEnterProject();
      } else {
        handleRestore();
      }
      return;
    }
    if (input === "d" && currentView !== "projects") {
      const currentSessions2 = getCurrentSessions();
      if (currentSessions2.length > 0) {
        setMode("confirm-delete");
      }
      return;
    }
    if (input === "s") {
      if (currentView === "projects") {
        if (projects.length > 0) {
          setMode("sort-project");
          setStatusMessage("Sort mode: use \u2191\u2193 to move, Enter to confirm");
        }
      } else {
        const currentSessions2 = getCurrentSessions();
        const session = currentSessions2[selectedIndex];
        if (session) {
          const isNowFavorite = toggleFavorite2(session.id);
          setStatusMessage(isNowFavorite ? "\u2B50 Added to favorites" : "Removed from favorites");
        }
      }
      return;
    }
  });
  const handleSearchChange = useCallback2((value) => {
    setSearchQuery(value);
    setSelectedIndex(0);
  }, []);
  if (loading && sessions.length === 0) {
    return /* @__PURE__ */ jsxs7(Box7, { padding: 1, children: [
      /* @__PURE__ */ jsx7(Spinner, { type: "dots" }),
      /* @__PURE__ */ jsx7(Text7, { children: " Loading sessions..." })
    ] });
  }
  const currentSessions = getCurrentSessions();
  const selectedSession = currentView !== "projects" ? currentSessions[selectedIndex] || null : null;
  const selectedProject = currentView === "projects" ? projects[selectedIndex] || null : null;
  if ((mode === "storage" || mode === "storage-confirm") && storageStats) {
    return /* @__PURE__ */ jsx7(Box7, { flexDirection: "column", padding: 1, children: /* @__PURE__ */ jsx7(
      StorageScreen,
      {
        stats: storageStats,
        purgeOptions,
        selectedOption: selectedPurgeOption,
        mode: mode === "storage-confirm" ? "confirm" : "view"
      }
    ) }, renderKey);
  }
  return /* @__PURE__ */ jsxs7(Box7, { flexDirection: "column", padding: 1, children: [
    /* @__PURE__ */ jsx7(Header, { embeddingsReady, projectFilter: selectedProjectPath }),
    currentTab === "global" ? /* @__PURE__ */ jsx7(
      SearchInput,
      {
        value: searchQuery,
        onChange: handleSearchChange,
        isFocused: mode === "search"
      }
    ) : currentView === "project-sessions" && selectedProjectPath ? /* @__PURE__ */ jsxs7(Box7, { children: [
      /* @__PURE__ */ jsx7(Text7, { dimColor: true, children: "Projects \u2192 " }),
      /* @__PURE__ */ jsx7(Text7, { color: "blue", children: basename5(selectedProjectPath) })
    ] }) : /* @__PURE__ */ jsx7(Box7, { children: /* @__PURE__ */ jsx7(Text7, { dimColor: true, children: "Browse projects below" }) }),
    currentView === "projects" ? /* @__PURE__ */ jsx7(
      ProjectList,
      {
        projects,
        selectedIndex,
        onSelect: setSelectedIndex
      }
    ) : /* @__PURE__ */ jsx7(
      SessionList,
      {
        sessions: currentSessions,
        selectedIndex,
        onSelect: setSelectedIndex
      }
    ),
    selectedSession && /* @__PURE__ */ jsx7(Preview, { session: selectedSession }),
    selectedProject && /* @__PURE__ */ jsxs7(
      Box7,
      {
        flexDirection: "column",
        borderStyle: "round",
        borderColor: "gray",
        paddingX: 1,
        paddingY: 0,
        marginTop: 1,
        children: [
          /* @__PURE__ */ jsxs7(Box7, { children: [
            /* @__PURE__ */ jsx7(Text7, { bold: true, children: "Project Preview" }),
            selectedProject.sortOrder !== null && /* @__PURE__ */ jsxs7(Text7, { dimColor: true, children: [
              " (#",
              selectedProject.sortOrder + 1,
              ")"
            ] })
          ] }),
          /* @__PURE__ */ jsxs7(Text7, { color: "blue", children: [
            "\u{1F4C1} ",
            selectedProject.path
          ] }),
          /* @__PURE__ */ jsxs7(Text7, { dimColor: true, children: [
            selectedProject.sessionCount,
            " session",
            selectedProject.sessionCount !== 1 ? "s" : "",
            " \u2022 ",
            selectedProject.totalMessages,
            " messages"
          ] })
        ]
      }
    ),
    /* @__PURE__ */ jsx7(Box7, { marginTop: 1, children: mode === "db-size-alert" ? /* @__PURE__ */ jsxs7(Box7, { flexDirection: "column", children: [
      /* @__PURE__ */ jsxs7(Text7, { color: "yellow", bold: true, children: [
        "\u26A0 Storage size: ",
        formatBytes(dbSize),
        " (exceeds 5GB)"
      ] }),
      /* @__PURE__ */ jsxs7(Text7, { color: "yellow", children: [
        "Purge ",
        purgePreview?.sessionsToDelete,
        " sessions older than ",
        DEFAULT_PURGE_DAYS,
        " days? [y/n]"
      ] }),
      purgePreview && purgePreview.backupFilesToDelete > 0 && /* @__PURE__ */ jsxs7(Text7, { dimColor: true, children: [
        "  (",
        purgePreview.backupFilesToDelete,
        " backup files, ~",
        formatBytes(purgePreview.backupBytesToFree),
        ")"
      ] }),
      /* @__PURE__ */ jsx7(Text7, { dimColor: true, children: "(Starred sessions will be kept)" })
    ] }) : mode === "confirm-purge" ? /* @__PURE__ */ jsxs7(Box7, { flexDirection: "column", children: [
      /* @__PURE__ */ jsx7(Text7, { color: "red", bold: true, children: "Confirm purge:" }),
      /* @__PURE__ */ jsxs7(Text7, { children: [
        "  ",
        purgePreview?.sessionsToDelete,
        " sessions (",
        purgePreview?.messagesInvolved,
        " messages)"
      ] }),
      purgePreview && purgePreview.backupFilesToDelete > 0 && /* @__PURE__ */ jsxs7(Text7, { children: [
        "  ",
        purgePreview.backupFilesToDelete,
        " backup files (~",
        formatBytes(purgePreview.backupBytesToFree),
        ")"
      ] }),
      /* @__PURE__ */ jsxs7(Text7, { children: [
        "  Range: ",
        purgePreview?.oldestSessionDate,
        " to ",
        purgePreview?.newestSessionDate
      ] }),
      /* @__PURE__ */ jsx7(Text7, { color: "red", children: "This cannot be undone. Proceed? [y/n]" })
    ] }) : mode === "confirm-delete" ? /* @__PURE__ */ jsxs7(Text7, { color: "yellow", children: [
      'Delete "',
      selectedSession?.customTitle || selectedSession?.title,
      '"? [y/n]'
    ] }) : mode === "rename" ? /* @__PURE__ */ jsxs7(Box7, { children: [
      /* @__PURE__ */ jsx7(Text7, { color: "magenta", children: "Rename: " }),
      /* @__PURE__ */ jsx7(
        TextInput2,
        {
          value: renameValue,
          onChange: setRenameValue,
          placeholder: "Enter new name..."
        }
      ),
      /* @__PURE__ */ jsx7(Text7, { dimColor: true, children: "  [Enter] Save  [Esc] Cancel" })
    ] }) : mode === "sort-project" ? /* @__PURE__ */ jsx7(Text7, { color: "cyan", children: "Sort mode: [\u2191\u2193] Move project  [Enter/Esc] Done" }) : statusMessage ? /* @__PURE__ */ jsx7(Text7, { color: "green", children: statusMessage }) : currentView === "projects" ? /* @__PURE__ */ jsx7(Text7, { dimColor: true, children: "[\u2191\u2193] Navigate  [Enter] Open  [s] Sort  [P] Storage  [\u2190\u2192] Tabs  [q] Quit" }) : currentView === "project-sessions" ? /* @__PURE__ */ jsx7(Text7, { dimColor: true, children: "[\u2191\u2193] Navigate  [Enter] Resume  [s] Star  [Esc] Back  [r] Rename  [d] Delete  [P] Storage  [q] Quit" }) : /* @__PURE__ */ jsx7(Text7, { dimColor: true, children: "[\u2191\u2193] Navigate  [Enter] Resume  [s] Star  [r] Rename  [d] Delete  [/] Search  [P] Storage  [q] Quit" }) }),
    /* @__PURE__ */ jsxs7(Box7, { marginTop: 1, children: [
      /* @__PURE__ */ jsx7(
        Text7,
        {
          backgroundColor: currentTab === "global" ? "green" : void 0,
          color: currentTab === "global" ? "white" : void 0,
          bold: currentTab === "global",
          dimColor: currentTab !== "global",
          children: currentTab === "global" ? " Global " : "Global"
        }
      ),
      /* @__PURE__ */ jsx7(Text7, { children: " " }),
      /* @__PURE__ */ jsx7(
        Text7,
        {
          backgroundColor: currentTab === "projects" ? "magenta" : void 0,
          color: currentTab === "projects" ? "white" : void 0,
          bold: currentTab === "projects",
          dimColor: currentTab !== "projects",
          children: currentTab === "projects" ? " Projects " : "Projects"
        }
      ),
      /* @__PURE__ */ jsx7(Text7, { dimColor: true, children: "  [\u2190\u2192] switch" })
    ] })
  ] }, renderKey);
};

// src/commands/save.ts
import chalk from "chalk";
async function saveCommand(options) {
  console.log(chalk.cyan("Scanning for Claude Code sessions..."));
  let embeddingsReady = isReady();
  if (!embeddingsReady) {
    console.log(chalk.dim("Initializing embedding model..."));
    try {
      await initializeEmbeddings();
      embeddingsReady = true;
    } catch (err) {
      console.log(chalk.yellow("Warning: Could not initialize embeddings."));
      console.log(chalk.yellow("Semantic search will not be available."));
    }
  }
  const sessions = findSessionFiles();
  if (sessions.length === 0) {
    console.log(chalk.red("No Claude Code sessions found."));
    console.log(chalk.dim("Looking in:"));
    console.log(chalk.dim("  ~/.claude/projects/"));
    console.log(chalk.dim("  ~/.claude/sessions/"));
    console.log(chalk.dim("\nUse Claude Code first, then run: cmem save --latest"));
    return;
  }
  console.log(chalk.green(`Found ${sessions.length} session(s)`));
  let sessionToSave = options.latest ? getMostRecentSession() : sessions[0];
  if (!sessionToSave) {
    console.log(chalk.red("No valid session found."));
    return;
  }
  if (sessionExists(sessionToSave.rawData)) {
    console.log(chalk.yellow("This session has already been saved."));
    return;
  }
  const firstUserMsg = sessionToSave.messages.find((m) => m.role === "user");
  const title = options.title || (firstUserMsg ? generateTitle(firstUserMsg.content) : "Untitled Session");
  const summary = generateSummary(sessionToSave.messages);
  console.log(chalk.dim(`Title: ${title}`));
  console.log(chalk.dim(`Messages: ${sessionToSave.messages.length}`));
  console.log(chalk.dim(`Project: ${sessionToSave.projectPath || "Unknown"}`));
  const sessionId = createSession({
    title,
    summary,
    projectPath: sessionToSave.projectPath || void 0,
    rawData: sessionToSave.rawData,
    messages: sessionToSave.messages
  });
  console.log(chalk.green(`Session saved with ID: ${sessionId.slice(0, 8)}`));
  if (embeddingsReady) {
    console.log(chalk.dim("Generating embedding..."));
    try {
      const embeddingText = createEmbeddingText(title, summary, sessionToSave.messages);
      const embedding = await getEmbedding(embeddingText);
      storeEmbedding(sessionId, embedding);
      console.log(chalk.green("Embedding stored for semantic search."));
    } catch (err) {
      console.log(chalk.yellow("Failed to generate embedding. Semantic search may not work for this session."));
    }
  }
  console.log(chalk.green("\nSession saved successfully!"));
}

// src/commands/list.ts
import chalk2 from "chalk";
async function listCommand(options = {}) {
  const sessions = options.all ? listSessions() : listHumanSessions();
  if (sessions.length === 0) {
    console.log(chalk2.yellow("No saved sessions."));
    console.log(chalk2.dim("Run: cmem save --latest"));
    return;
  }
  console.log(chalk2.cyan(`Saved Sessions (${sessions.length})
`));
  console.log(
    chalk2.dim(
      "ID".padEnd(10) + "Title".padEnd(40) + "Msgs".padEnd(6) + "Updated".padEnd(10) + "Project"
    )
  );
  console.log(chalk2.dim("\u2500".repeat(90)));
  for (const session of sessions) {
    const id = shortId(session.id);
    const title = truncate(session.title, 38);
    const msgs = String(session.messageCount).padStart(4);
    const updated = formatTimeAgo(session.updatedAt);
    const project = session.projectPath ? truncate(session.projectPath, 25) : chalk2.dim("\u2014");
    console.log(
      chalk2.white(id.padEnd(10)) + title.padEnd(40) + chalk2.dim(msgs.padEnd(6)) + chalk2.dim(updated.padEnd(10)) + chalk2.dim(project)
    );
  }
  console.log(chalk2.dim("\n\u2500".repeat(90)));
  console.log(chalk2.dim("Use: cmem restore <id> to restore a session"));
}

// src/commands/search.ts
import chalk3 from "chalk";
async function searchCommand(query) {
  console.log(chalk3.cyan(`Searching for: "${query}"...
`));
  if (!isReady()) {
    console.log(chalk3.dim("Initializing embedding model..."));
    try {
      await initializeEmbeddings((progress) => {
        if (progress.status === "downloading" && progress.progress !== void 0) {
          process.stdout.write(`\r${chalk3.dim(`Downloading model... ${Math.round(progress.progress)}%`)}`);
        }
      });
      console.log(chalk3.green("\r\u2713 Model ready                    \n"));
    } catch (err) {
      console.log(chalk3.red("Failed to initialize embedding model."));
      console.log(chalk3.dim(String(err)));
      return;
    }
  }
  try {
    const queryEmbedding = await getEmbedding(query);
    const results = searchSessions(queryEmbedding, 10);
    if (results.length === 0) {
      console.log(chalk3.yellow("No matching sessions found."));
      console.log(chalk3.dim("Try a different search query or save more sessions."));
      return;
    }
    console.log(chalk3.green(`Found ${results.length} matching session(s)
`));
    console.log(
      chalk3.dim(
        "ID".padEnd(10) + "Title".padEnd(40) + "Msgs".padEnd(6) + "Updated"
      )
    );
    console.log(chalk3.dim("\u2500".repeat(70)));
    for (const session of results) {
      const id = shortId(session.id);
      const title = truncate(session.title, 38);
      const msgs = String(session.messageCount).padStart(4);
      const updated = formatTimeAgo(session.updatedAt);
      console.log(
        chalk3.white(id.padEnd(10)) + title.padEnd(40) + chalk3.dim(msgs.padEnd(6)) + chalk3.dim(updated)
      );
      if (session.summary) {
        console.log(chalk3.dim("  " + truncate(session.summary, 65)));
      }
    }
    console.log(chalk3.dim("\n\u2500".repeat(70)));
    console.log(chalk3.dim("Use: cmem restore <id> to restore a session"));
  } catch (err) {
    console.log(chalk3.red("Search failed."));
    console.log(chalk3.dim(String(err)));
  }
}

// src/commands/restore.ts
import chalk4 from "chalk";

// src/utils/clipboard.ts
import clipboard from "clipboardy";
async function copyToClipboard(text) {
  await clipboard.write(text);
}

// src/commands/restore.ts
async function restoreCommand(id, options) {
  let session = getSession(id);
  if (!session) {
    const sessions = listSessions();
    const match = sessions.find((s) => s.id.startsWith(id));
    if (match) {
      session = match;
    }
  }
  if (!session) {
    console.log(chalk4.red(`Session not found: ${id}`));
    console.log(chalk4.dim("Run: cmem list to see available sessions"));
    return;
  }
  const messages = getSessionMessages(session.id);
  const format = options.format || "context";
  let output;
  switch (format) {
    case "json":
      output = formatAsJson(session, messages);
      break;
    case "markdown":
      output = formatAsMarkdown(session, messages);
      break;
    case "context":
    default:
      output = formatAsContext(session, messages);
      break;
  }
  if (options.copy) {
    await copyToClipboard(output);
    console.log(chalk4.green("Session context copied to clipboard!"));
    console.log(chalk4.dim(`Session: ${session.title}`));
    console.log(chalk4.dim(`Messages: ${messages.length}`));
  } else {
    console.log(output);
  }
}
function formatAsContext(session, messages) {
  const lines = [];
  lines.push("# Previous Session Context");
  lines.push("");
  lines.push(`**Session:** ${session.title}`);
  if (session.projectPath) {
    lines.push(`**Project:** ${session.projectPath}`);
  }
  lines.push(`**Messages:** ${messages.length} total (showing last ${Math.min(messages.length, MAX_MESSAGES_FOR_CONTEXT)})`);
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## Conversation History");
  lines.push("");
  const recentMessages = messages.slice(-MAX_MESSAGES_FOR_CONTEXT);
  for (const msg of recentMessages) {
    const roleLabel = msg.role === "user" ? "**User:**" : "**Claude:**";
    lines.push(roleLabel);
    lines.push(msg.content);
    lines.push("");
  }
  lines.push("---");
  lines.push("");
  lines.push("*Continue this conversation in Claude Code*");
  return lines.join("\n");
}
function formatAsMarkdown(session, messages) {
  const lines = [];
  lines.push(`# ${session.title}`);
  lines.push("");
  if (session.projectPath) {
    lines.push(`**Project:** ${session.projectPath}`);
    lines.push("");
  }
  if (session.summary) {
    lines.push("## Summary");
    lines.push(session.summary);
    lines.push("");
  }
  lines.push("## Conversation");
  lines.push("");
  for (const msg of messages) {
    lines.push(`### ${msg.role === "user" ? "User" : "Claude"}`);
    lines.push(`*${msg.timestamp}*`);
    lines.push("");
    lines.push(msg.content);
    lines.push("");
  }
  return lines.join("\n");
}
function formatAsJson(session, messages) {
  return JSON.stringify(
    {
      session: {
        id: session.id,
        title: session.title,
        projectPath: session.projectPath,
        summary: session.summary,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt
      },
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
        timestamp: m.timestamp
      }))
    },
    null,
    2
  );
}

// src/commands/delete.ts
import chalk5 from "chalk";
async function deleteCommand(id) {
  let session = getSession(id);
  if (!session) {
    const sessions = listSessions();
    const match = sessions.find((s) => s.id.startsWith(id));
    if (match) {
      session = match;
    }
  }
  if (!session) {
    console.log(chalk5.red(`Session not found: ${id}`));
    console.log(chalk5.dim("Run: cmem list to see available sessions"));
    return;
  }
  const deleted = deleteSession(session.id);
  if (deleted) {
    console.log(chalk5.green(`Deleted session: ${shortId(session.id)} - ${session.title}`));
  } else {
    console.log(chalk5.red("Failed to delete session."));
  }
}

// src/commands/stats.ts
import chalk6 from "chalk";
import { statSync as statSync3, existsSync as existsSync8 } from "fs";
async function statsCommand() {
  console.log(chalk6.cyan("cmem Storage Statistics\n"));
  const stats = getStats();
  console.log(chalk6.white("Database:"));
  console.log(`  Sessions:    ${formatNumber(stats.sessionCount)}`);
  console.log(`  Messages:    ${formatNumber(stats.messageCount)}`);
  console.log(`  Embeddings:  ${formatNumber(stats.embeddingCount)}`);
  let totalSize = 0;
  if (existsSync8(DB_PATH)) {
    const dbStats = statSync3(DB_PATH);
    console.log(`  DB Size:     ${formatBytes2(dbStats.size)}`);
    totalSize += dbStats.size;
  }
  const backupsSize = getBackupsDirSize();
  if (backupsSize > 0) {
    console.log(`  Backups:     ${formatBytes2(backupsSize)}`);
    totalSize += backupsSize;
  }
  if (totalSize > 0) {
    console.log(`  Total:       ${formatBytes2(totalSize)}`);
  }
  console.log(`  Location:    ${CMEM_DIR}`);
  console.log("");
  console.log(chalk6.white("Embeddings:"));
  const modelCached = isModelCached();
  if (modelCached) {
    console.log(`  Model:       ${chalk6.green(EMBEDDING_MODEL)}`);
    console.log(`  Location:    ${MODELS_DIR}`);
  } else {
    console.log(`  Model:       ${chalk6.yellow("Not downloaded")}`);
    console.log(chalk6.dim("  Run cmem setup to download the embedding model"));
  }
  console.log("");
  console.log(chalk6.white("Coverage:"));
  const coveragePercent = stats.sessionCount > 0 ? Math.round(stats.embeddingCount / stats.sessionCount * 100) : 0;
  console.log(`  Semantic:    ${coveragePercent}% of sessions have embeddings`);
  if (coveragePercent < 100 && stats.sessionCount > 0) {
    console.log(chalk6.dim("  Run cmem watch to generate missing embeddings"));
  }
}

// src/commands/watch.ts
import chalk7 from "chalk";
import chokidar from "chokidar";
import { statSync as statSync4, existsSync as existsSync9, readFileSync as readFileSync2, readdirSync as readdirSync3 } from "fs";
import { join as join5, dirname as dirname5, basename as basename6 } from "path";
var spinnerFrames = ["\u280B", "\u2819", "\u2839", "\u2838", "\u283C", "\u2834", "\u2826", "\u2827", "\u2807", "\u280F"];
var Spinner2 = class {
  interval = null;
  frameIndex = 0;
  message;
  constructor(message) {
    this.message = message;
  }
  start() {
    process.stdout.write(`  ${spinnerFrames[0]} ${this.message}`);
    this.interval = setInterval(() => {
      this.frameIndex = (this.frameIndex + 1) % spinnerFrames.length;
      process.stdout.write(`\r  ${chalk7.cyan(spinnerFrames[this.frameIndex])} ${this.message}`);
    }, 80);
  }
  update(message) {
    this.message = message;
    process.stdout.write(`\r  ${chalk7.cyan(spinnerFrames[this.frameIndex])} ${this.message}                              `);
  }
  succeed(message) {
    this.stop();
    console.log(`\r  ${chalk7.green("\u2713")} ${message || this.message}                              `);
  }
  fail(message) {
    this.stop();
    console.log(`\r  ${chalk7.red("\u2717")} ${message || this.message}                              `);
  }
  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }
};
var processingDebounce = /* @__PURE__ */ new Map();
var DEBOUNCE_MS = 2e3;
async function watchCommand(options) {
  const verbose = options.verbose ?? false;
  const embedThreshold = options.embedThreshold ?? 500;
  console.log(chalk7.cyan("\u{1F50D} cmem watch - Monitoring Claude Code sessions\n"));
  const modelSpinner = new Spinner2("Initializing embedding model...");
  modelSpinner.start();
  try {
    await initializeEmbeddings((progress) => {
      if (progress.status === "downloading" && progress.progress !== void 0) {
        const fileName = progress.file ? progress.file.split("/").pop() : "model";
        modelSpinner.update(`Downloading ${fileName}... ${Math.round(progress.progress)}%`);
      } else if (progress.status === "loading") {
        modelSpinner.update("Loading model...");
      }
    });
    modelSpinner.succeed("Embedding model ready");
  } catch (err) {
    modelSpinner.fail("Could not initialize embeddings");
    console.log(chalk7.yellow("  Sessions will be saved but not vectorized.\n"));
  }
  const embeddingsReady = isReady();
  console.log("");
  const scanSpinner = new Spinner2("Scanning for existing sessions...");
  scanSpinner.start();
  const existingFiles = findAllSessionFiles(CLAUDE_DIR);
  const totalFiles = existingFiles.length;
  const statsBefore = getStats();
  const alreadyIndexed = statsBefore.sessionCount;
  const needsIndexing = totalFiles - alreadyIndexed;
  if (totalFiles === 0) {
    scanSpinner.succeed("No Claude Code sessions found yet");
  } else if (needsIndexing <= 0) {
    scanSpinner.succeed(`Found ${totalFiles} sessions (all indexed)`);
  } else {
    scanSpinner.update(`Found ${totalFiles} sessions, indexing ${needsIndexing} new...`);
    let processed = 0;
    let newlyIndexed = 0;
    for (const filePath of existingFiles) {
      processed++;
      const wasNew = await processSessionFile(filePath, embeddingsReady, embedThreshold, false, true);
      if (wasNew) newlyIndexed++;
      const percent = Math.round(processed / totalFiles * 100);
      scanSpinner.update(`Indexing sessions... ${percent}% (${processed}/${totalFiles})`);
    }
    scanSpinner.succeed(`Indexed ${totalFiles} sessions (${newlyIndexed} new, ${totalFiles - newlyIndexed} updated)`);
  }
  console.log("");
  console.log(chalk7.dim(`Watching: ${CLAUDE_DIR}`));
  console.log(chalk7.dim(`Embed threshold: ${embedThreshold} chars
`));
  const watcher = chokidar.watch(CLAUDE_DIR, {
    persistent: true,
    ignoreInitial: true,
    // We already processed existing files above
    depth: 10,
    awaitWriteFinish: {
      stabilityThreshold: 1e3,
      pollInterval: 100
    }
  });
  watcher.on("add", (filePath) => {
    if (!filePath.endsWith(".jsonl")) return;
    if (filePath.includes("/subagents/")) {
      if (verbose) console.log(chalk7.dim(`[skip agent] ${filePath}`));
      return;
    }
    if (verbose) console.log(chalk7.dim(`[new] ${filePath}`));
    debouncedProcess(filePath, embeddingsReady, embedThreshold, verbose);
  });
  watcher.on("change", (filePath) => {
    if (!filePath.endsWith(".jsonl")) return;
    if (filePath.includes("/subagents/")) {
      if (verbose) console.log(chalk7.dim(`[skip agent] ${filePath}`));
      return;
    }
    if (verbose) console.log(chalk7.dim(`[changed] ${filePath}`));
    debouncedProcess(filePath, embeddingsReady, embedThreshold, verbose);
  });
  watcher.on("error", (error) => {
    console.error(chalk7.red("Watcher error:"), error);
  });
  watcher.on("ready", () => {
    console.log(chalk7.green("\u2713 Watching for session changes..."));
    console.log(chalk7.dim("Press Ctrl+C to stop\n"));
  });
  process.on("SIGINT", () => {
    console.log(chalk7.dim("\nShutting down watcher..."));
    watcher.close();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    watcher.close();
    process.exit(0);
  });
}
function findAllSessionFiles(dir) {
  const files = [];
  if (!existsSync9(dir)) return files;
  function scanDir(currentDir, depth = 0) {
    if (depth > 10) return;
    try {
      const entries = readdirSync3(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join5(currentDir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === "subagents") continue;
          scanDir(fullPath, depth + 1);
        } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
          files.push(fullPath);
        }
      }
    } catch {
    }
  }
  scanDir(dir);
  return files;
}
function debouncedProcess(filePath, embeddingsReady, embedThreshold, verbose) {
  const existing = processingDebounce.get(filePath);
  if (existing) {
    clearTimeout(existing);
  }
  const timer = setTimeout(async () => {
    processingDebounce.delete(filePath);
    await processSessionFile(filePath, embeddingsReady, embedThreshold, verbose);
  }, DEBOUNCE_MS);
  processingDebounce.set(filePath, timer);
}
async function processSessionFile(filePath, embeddingsReady, embedThreshold, verbose, forceMetadataUpdate = false) {
  try {
    const messages = parseSessionFile(filePath);
    if (messages.length === 0) {
      if (verbose) console.log(chalk7.dim(`  Skipping empty session: ${filePath}`));
      return false;
    }
    const stats = statSync4(filePath);
    const fileMtime = stats.mtime.toISOString();
    const existingSession = getSessionBySourceFile(filePath);
    const sessionId_from_file = basename6(filePath, ".jsonl");
    const agentMessages = loadSubagentMessages2(dirname5(filePath), sessionId_from_file);
    const allMessages = [...messages, ...agentMessages];
    const contentLength = allMessages.reduce((sum, m) => sum + m.content.length, 0);
    const firstUserMsg = messages.find((m) => m.role === "user");
    const title = firstUserMsg ? generateTitle(firstUserMsg.content) : "Untitled Session";
    const summary = generateSummary(messages);
    const rawData = JSON.stringify({ filePath, messages, mtime: fileMtime });
    const projectPath = getProjectPathFromIndex(filePath, sessionId_from_file);
    const metadata = extractSessionMetadata(filePath);
    const isAutomated = metadata.isSidechain || metadata.isMeta || isAutomatedByContent(title);
    let sessionId;
    let isNew = false;
    if (existingSession) {
      sessionId = existingSession.id;
      const needsMetadataUpdate = forceMetadataUpdate || !existingSession.isSidechain && !existingSession.isAutomated && isAutomated;
      const needsProjectPathUpdate = !existingSession.projectPath && projectPath;
      if (existingSession.messageCount !== messages.length || needsMetadataUpdate || needsProjectPathUpdate) {
        updateSession(sessionId, {
          title,
          summary,
          rawData,
          messages,
          isSidechain: metadata.isSidechain,
          isAutomated,
          projectPath: projectPath || void 0
        });
        if (verbose) {
          const automatedTag = isAutomated ? chalk7.dim(" [auto]") : "";
          console.log(chalk7.blue(`\u21BB Updated: ${title} (${messages.length} msgs)${automatedTag}`));
        }
      }
    } else {
      isNew = true;
      sessionId = createSession({
        title,
        summary,
        projectPath,
        sourceFile: filePath,
        rawData,
        messages,
        isSidechain: metadata.isSidechain,
        isAutomated
      });
      if (verbose) {
        const automatedTag = isAutomated ? chalk7.dim(" [auto]") : "";
        console.log(chalk7.green(`\u2713 Saved: ${title} (${messages.length} msgs)${automatedTag}`));
      }
    }
    if (embeddingsReady) {
      const shouldEmbed = needsReembedding(sessionId, contentLength, embedThreshold);
      if (shouldEmbed) {
        try {
          const embeddingText = createEmbeddingText(title, summary, allMessages);
          const embedding = await getEmbedding(embeddingText);
          storeEmbedding(sessionId, embedding);
          updateEmbeddingState(sessionId, contentLength, fileMtime);
          if (verbose) {
            const agentCount = agentMessages.length;
            const agentInfo = agentCount > 0 ? ` (+${agentCount} agent msgs)` : "";
            console.log(chalk7.dim(`  Embedded: ${title}${agentInfo}`));
          }
        } catch (err) {
          if (verbose) {
            console.log(chalk7.yellow(`  Failed to embed: ${title}`));
            console.log(chalk7.dim(`    ${err}`));
          }
        }
      }
    }
    const backedUp = backupSessionFile(filePath);
    if (verbose && backedUp) {
      console.log(chalk7.dim(`  Backed up: ${basename6(filePath)}`));
    }
    return isNew;
  } catch (err) {
    if (verbose) console.log(chalk7.red(`Error processing ${filePath}:`), err);
    return false;
  }
}
function loadSubagentMessages2(projectDirPath, parentSessionId) {
  const subagentsDir = join5(projectDirPath, parentSessionId, "subagents");
  if (!existsSync9(subagentsDir)) return [];
  const messages = [];
  try {
    const agentFiles = readdirSync3(subagentsDir).filter((f) => f.endsWith(".jsonl"));
    for (const agentFile of agentFiles) {
      const agentPath = join5(subagentsDir, agentFile);
      const agentMessages = parseSessionFile(agentPath);
      messages.push(...agentMessages);
    }
  } catch {
  }
  return messages;
}
function getProjectPathFromIndex(filePath, sessionId) {
  const projectDir = dirname5(filePath);
  const indexPath = join5(projectDir, "sessions-index.json");
  if (!existsSync9(indexPath)) return null;
  try {
    const content = readFileSync2(indexPath, "utf-8");
    const index = JSON.parse(content);
    const entry = index.entries.find((e) => e.sessionId === sessionId);
    return entry?.projectPath || null;
  } catch {
    return null;
  }
}

// src/commands/mcp.ts
import chalk8 from "chalk";

// src/mcp/server.ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from "@modelcontextprotocol/sdk/types.js";

// src/utils/claude-cli.ts
import { spawn } from "child_process";
import { execSync } from "child_process";
function getClaudePath() {
  try {
    const result = execSync("which claude", { encoding: "utf-8" }).trim();
    return result || null;
  } catch {
    return null;
  }
}
function parseStreamJsonLine(line) {
  if (!line.trim()) return null;
  try {
    const data = JSON.parse(line);
    if (data.type === "assistant") {
      if (data.message?.content && Array.isArray(data.message.content)) {
        const textBlocks = [];
        for (const block of data.message.content) {
          if (block.type === "text" && block.text) {
            textBlocks.push(block.text);
          }
        }
        if (textBlocks.length > 0) {
          return { type: "text", content: textBlocks.join("\n") };
        }
      }
    } else if (data.type === "content_block_delta") {
      if (data.delta?.type === "text_delta" && data.delta.text) {
        return { type: "text", content: data.delta.text };
      }
    } else if (data.type === "result") {
      if (data.is_error) {
        return { type: "error", content: data.result || "Unknown error" };
      }
      const usage = data.usage || {};
      const inputTokens = (usage.input_tokens || 0) + (usage.cache_read_input_tokens || 0);
      const outputTokens = usage.output_tokens || 0;
      return {
        type: "done",
        inputTokens,
        outputTokens,
        costUsd: data.total_cost_usd,
        durationMs: data.duration_ms
      };
    } else if (data.type === "error") {
      return {
        type: "error",
        content: data.error?.message || JSON.stringify(data.error) || "Unknown error"
      };
    }
    return { type: "skip" };
  } catch {
    return null;
  }
}
async function runClaudePrompt(prompt, options = {}) {
  const claudePath = getClaudePath();
  if (!claudePath) {
    return {
      success: false,
      content: "",
      error: "Claude CLI not found. Please install Claude Code CLI."
    };
  }
  const { model = "haiku" } = options;
  const args = [
    "-p",
    prompt,
    "--output-format",
    "stream-json",
    "--verbose",
    // Required when using stream-json with -p
    "--model",
    model,
    "--permission-mode",
    "plan"
    // Read-only, no tools needed for summarization
  ];
  return new Promise((resolve) => {
    const childProcess = spawn(claudePath, args, {
      env: {
        ...process.env,
        CI: "true"
        // Prevent interactive prompts
      },
      stdio: ["pipe", "pipe", "pipe"]
    });
    childProcess.stdin?.end();
    let buffer = "";
    const textChunks = [];
    let finalResult = null;
    let errorContent = "";
    childProcess.stdout?.on("data", (data) => {
      buffer += data.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.trim()) continue;
        const chunk = parseStreamJsonLine(line);
        if (chunk) {
          if (chunk.type === "text" && chunk.content) {
            textChunks.push(chunk.content);
          } else if (chunk.type === "done") {
            finalResult = chunk;
          } else if (chunk.type === "error" && chunk.content) {
            errorContent = chunk.content;
          }
        }
      }
    });
    childProcess.stderr?.on("data", (data) => {
      const text = data.toString().toLowerCase();
      if (text.includes("error") || text.includes("failed")) {
        errorContent = data.toString().trim();
      }
    });
    childProcess.on("close", (code) => {
      if (buffer.trim()) {
        const chunk = parseStreamJsonLine(buffer);
        if (chunk) {
          if (chunk.type === "text" && chunk.content) {
            textChunks.push(chunk.content);
          } else if (chunk.type === "done") {
            finalResult = chunk;
          } else if (chunk.type === "error" && chunk.content) {
            errorContent = chunk.content;
          }
        }
      }
      const content = textChunks.join("");
      if (errorContent && !content) {
        resolve({
          success: false,
          content: "",
          error: errorContent
        });
      } else {
        resolve({
          success: code === 0 && content.length > 0,
          content,
          error: errorContent || void 0,
          inputTokens: finalResult?.inputTokens,
          outputTokens: finalResult?.outputTokens,
          costUsd: finalResult?.costUsd,
          durationMs: finalResult?.durationMs
        });
      }
    });
    childProcess.on("error", (err) => {
      resolve({
        success: false,
        content: "",
        error: err.message
      });
    });
    setTimeout(() => {
      childProcess.kill("SIGTERM");
      resolve({
        success: false,
        content: textChunks.join(""),
        error: "Request timed out after 60 seconds"
      });
    }, 6e4);
  });
}
function isClaudeCliAvailable() {
  return getClaudePath() !== null;
}

// src/db/lessons.ts
import { randomUUID as randomUUID2 } from "crypto";
function mapLessonRow(row) {
  return {
    id: row.id,
    projectPath: row.project_path,
    category: row.category,
    title: row.title,
    triggerContext: row.trigger_context,
    insight: row.insight,
    reasoning: row.reasoning ?? void 0,
    confidence: row.confidence,
    timesApplied: row.times_applied,
    timesValidated: row.times_validated,
    timesRejected: row.times_rejected,
    sourceSessionId: row.source_session_id ?? void 0,
    sourceType: row.source_type,
    archived: row.archived === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastAppliedAt: row.last_applied_at ?? void 0
  };
}
function createLesson(input) {
  const db2 = getDatabase();
  const id = randomUUID2();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  db2.prepare(`
    INSERT INTO lessons (
      id, project_path, category, title, trigger_context, insight,
      reasoning, confidence, source_session_id, source_type,
      created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.projectPath,
    input.category,
    input.title,
    input.triggerContext,
    input.insight,
    input.reasoning ?? null,
    input.confidence ?? 0.5,
    input.sourceSessionId ?? null,
    input.sourceType ?? "synthesized",
    now,
    now
  );
  return getLesson(id);
}
function updateLesson(id, updates) {
  const db2 = getDatabase();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const fields = ["updated_at = ?"];
  const values = [now];
  if (updates.category !== void 0) {
    fields.push("category = ?");
    values.push(updates.category);
  }
  if (updates.title !== void 0) {
    fields.push("title = ?");
    values.push(updates.title);
  }
  if (updates.triggerContext !== void 0) {
    fields.push("trigger_context = ?");
    values.push(updates.triggerContext);
  }
  if (updates.insight !== void 0) {
    fields.push("insight = ?");
    values.push(updates.insight);
  }
  if (updates.reasoning !== void 0) {
    fields.push("reasoning = ?");
    values.push(updates.reasoning);
  }
  if (updates.confidence !== void 0) {
    fields.push("confidence = ?");
    values.push(updates.confidence);
  }
  if (updates.archived !== void 0) {
    fields.push("archived = ?");
    values.push(updates.archived ? 1 : 0);
  }
  values.push(id);
  db2.prepare(`
    UPDATE lessons SET ${fields.join(", ")} WHERE id = ?
  `).run(...values);
  return getLesson(id);
}
function deleteLesson(id) {
  const db2 = getDatabase();
  const transaction = db2.transaction(() => {
    db2.prepare("DELETE FROM lesson_embeddings WHERE lesson_id = ?").run(id);
    db2.prepare("DELETE FROM lesson_feedback WHERE lesson_id = ?").run(id);
    const result = db2.prepare("DELETE FROM lessons WHERE id = ?").run(id);
    return result.changes > 0;
  });
  return transaction();
}
function archiveLesson(id) {
  const db2 = getDatabase();
  db2.prepare(`
    UPDATE lessons SET archived = 1, updated_at = ? WHERE id = ?
  `).run((/* @__PURE__ */ new Date()).toISOString(), id);
}
function unarchiveLesson(id) {
  const db2 = getDatabase();
  db2.prepare(`
    UPDATE lessons SET archived = 0, updated_at = ? WHERE id = ?
  `).run((/* @__PURE__ */ new Date()).toISOString(), id);
}
function getLesson(id) {
  const db2 = getDatabase();
  const row = db2.prepare(`
    SELECT * FROM lessons WHERE id = ?
  `).get(id);
  return row ? mapLessonRow(row) : null;
}
function getLessonsByProject(projectPath, options = {}) {
  const db2 = getDatabase();
  let query = "SELECT * FROM lessons WHERE project_path = ?";
  const params = [projectPath];
  if (options.category) {
    query += " AND category = ?";
    params.push(options.category);
  }
  if (options.archived !== void 0) {
    query += " AND archived = ?";
    params.push(options.archived ? 1 : 0);
  } else {
    query += " AND archived = 0";
  }
  if (options.minConfidence !== void 0) {
    query += " AND confidence >= ?";
    params.push(options.minConfidence);
  }
  query += " ORDER BY confidence DESC, times_applied DESC";
  if (options.limit) {
    query += " LIMIT ?";
    params.push(options.limit);
  }
  const rows = db2.prepare(query).all(...params);
  return rows.map(mapLessonRow);
}
function getCoreLessons(projectPath, limit = 3) {
  const db2 = getDatabase();
  const rows = db2.prepare(`
    SELECT * FROM lessons
    WHERE project_path = ?
      AND archived = 0
      AND confidence >= 0.7
    ORDER BY
      times_validated DESC,
      confidence DESC,
      times_applied DESC
    LIMIT ?
  `).all(projectPath, limit);
  return rows.map(mapLessonRow);
}
function getAllLessons(options = {}) {
  const db2 = getDatabase();
  let query = "SELECT * FROM lessons WHERE 1=1";
  const params = [];
  if (options.category) {
    query += " AND category = ?";
    params.push(options.category);
  }
  if (options.archived !== void 0) {
    query += " AND archived = ?";
    params.push(options.archived ? 1 : 0);
  }
  if (options.minConfidence !== void 0) {
    query += " AND confidence >= ?";
    params.push(options.minConfidence);
  }
  query += " ORDER BY updated_at DESC";
  if (options.limit) {
    query += " LIMIT ?";
    params.push(options.limit);
  }
  const rows = db2.prepare(query).all(...params);
  return rows.map(mapLessonRow);
}
function recordLessonApplication(id) {
  const db2 = getDatabase();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  db2.prepare(`
    UPDATE lessons
    SET times_applied = times_applied + 1,
        last_applied_at = ?,
        updated_at = ?
    WHERE id = ?
  `).run(now, now, id);
}
function recordLessonValidation(id, sessionId, comment) {
  const db2 = getDatabase();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const transaction = db2.transaction(() => {
    db2.prepare(`
      UPDATE lessons
      SET times_validated = times_validated + 1, updated_at = ?
      WHERE id = ?
    `).run(now, id);
    db2.prepare(`
      INSERT INTO lesson_feedback (lesson_id, session_id, feedback_type, comment)
      VALUES (?, ?, 'validated', ?)
    `).run(id, sessionId ?? null, comment ?? null);
  });
  transaction();
}
function recordLessonRejection(id, sessionId, comment) {
  const db2 = getDatabase();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const transaction = db2.transaction(() => {
    db2.prepare(`
      UPDATE lessons
      SET times_rejected = times_rejected + 1, updated_at = ?
      WHERE id = ?
    `).run(now, id);
    db2.prepare(`
      INSERT INTO lesson_feedback (lesson_id, session_id, feedback_type, comment)
      VALUES (?, ?, 'rejected', ?)
    `).run(id, sessionId ?? null, comment ?? null);
  });
  transaction();
}
function storeLessonEmbedding(lessonId, embedding) {
  const db2 = getDatabase();
  db2.prepare("DELETE FROM lesson_embeddings WHERE lesson_id = ?").run(lessonId);
  db2.prepare(`
    INSERT INTO lesson_embeddings (lesson_id, embedding)
    VALUES (?, ?)
  `).run(lessonId, JSON.stringify(embedding));
}
function searchLessonsByEmbedding(embedding, projectPath, limit = 5) {
  return searchLessonsByEmbeddingWithDistance(embedding, projectPath, limit).map((r) => r.lesson);
}
function searchLessonsByEmbeddingWithDistance(embedding, projectPath, limit = 5) {
  const db2 = getDatabase();
  const rows = db2.prepare(`
    SELECT
      l.*,
      vec_distance_L2(le.embedding, ?) as distance
    FROM lesson_embeddings le
    JOIN lessons l ON l.id = le.lesson_id
    WHERE l.project_path = ?
      AND l.archived = 0
    ORDER BY distance ASC
    LIMIT ?
  `).all(JSON.stringify(embedding), projectPath, limit);
  return rows.map((row) => ({
    lesson: mapLessonRow(row),
    distance: row.distance
  }));
}
function getPendingSynthesis(limit = 5) {
  const db2 = getDatabase();
  const rows = db2.prepare(`
    SELECT
      id,
      session_id as sessionId,
      project_path as projectPath,
      queued_at as queuedAt,
      status,
      processed_at as processedAt,
      lessons_created as lessonsCreated,
      error
    FROM synthesis_queue
    WHERE status = 'pending'
    ORDER BY queued_at ASC
    LIMIT ?
  `).all(limit);
  return rows;
}
function markSynthesisProcessing(id) {
  const db2 = getDatabase();
  db2.prepare(`
    UPDATE synthesis_queue SET status = 'processing' WHERE id = ?
  `).run(id);
}
function markSynthesisComplete(id, lessonsCreated) {
  const db2 = getDatabase();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  db2.prepare(`
    UPDATE synthesis_queue
    SET status = 'completed', processed_at = ?, lessons_created = ?
    WHERE id = ?
  `).run(now, lessonsCreated, id);
}
function markSynthesisFailed(id, error) {
  const db2 = getDatabase();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  db2.prepare(`
    UPDATE synthesis_queue
    SET status = 'failed', processed_at = ?, error = ?
    WHERE id = ?
  `).run(now, error, id);
}
function getSynthesisStats() {
  const db2 = getDatabase();
  const pending = db2.prepare(`
    SELECT COUNT(*) as count FROM synthesis_queue WHERE status = 'pending'
  `).get().count;
  const processing = db2.prepare(`
    SELECT COUNT(*) as count FROM synthesis_queue WHERE status = 'processing'
  `).get().count;
  const completed = db2.prepare(`
    SELECT COUNT(*) as count FROM synthesis_queue WHERE status = 'completed'
  `).get().count;
  const failed = db2.prepare(`
    SELECT COUNT(*) as count FROM synthesis_queue WHERE status = 'failed'
  `).get().count;
  const totalLessonsCreated = db2.prepare(`
    SELECT COALESCE(SUM(lessons_created), 0) as total FROM synthesis_queue WHERE status = 'completed'
  `).get().total;
  return { pending, processing, completed, failed, totalLessonsCreated };
}
function getLessonStats() {
  const db2 = getDatabase();
  const totalLessons = db2.prepare(`
    SELECT COUNT(*) as count FROM lessons
  `).get().count;
  const activeLessons = db2.prepare(`
    SELECT COUNT(*) as count FROM lessons WHERE archived = 0
  `).get().count;
  const archivedLessons = totalLessons - activeLessons;
  const categoryRows = db2.prepare(`
    SELECT category, COUNT(*) as count
    FROM lessons
    WHERE archived = 0
    GROUP BY category
  `).all();
  const byCategory = {
    architecture_decision: 0,
    anti_pattern: 0,
    bug_pattern: 0,
    project_convention: 0,
    dependency_knowledge: 0,
    domain_knowledge: 0,
    workflow: 0,
    other: 0
  };
  for (const row of categoryRows) {
    byCategory[row.category] = row.count;
  }
  const avgConfidence = db2.prepare(`
    SELECT COALESCE(AVG(confidence), 0) as avg FROM lessons WHERE archived = 0
  `).get().avg;
  return {
    totalLessons,
    activeLessons,
    archivedLessons,
    byCategory,
    avgConfidence
  };
}
function getQueueStatus() {
  return getSynthesisStats();
}
function cleanupOldInjections(daysOld = 7) {
  const db2 = getDatabase();
  const cutoff = /* @__PURE__ */ new Date();
  cutoff.setDate(cutoff.getDate() - daysOld);
  const result = db2.prepare(`
    DELETE FROM session_injections WHERE injected_at < ?
  `).run(cutoff.toISOString());
  return result.changes;
}
function getDistinctProjects() {
  const db2 = getDatabase();
  const rows = db2.prepare(`
    SELECT DISTINCT project_path
    FROM lessons
    WHERE project_path IS NOT NULL AND project_path != ''
    ORDER BY project_path ASC
  `).all();
  return rows.map((row) => row.project_path);
}

// src/learning/LessonManager.ts
var VALIDATION_BOOST = 0.1;
var REJECTION_PENALTY = 0.2;
var MIN_CONFIDENCE = 0;
var MAX_CONFIDENCE = 1;
var AUTO_ARCHIVE_THRESHOLD = 0.1;
var DECAY_RATE = 0.05;
var LessonManager = class {
  /**
   * Create a new lesson and generate its embedding
   */
  async create(input) {
    const lesson = createLesson(input);
    try {
      const embeddingText = this.buildEmbeddingText(lesson);
      const embedding = await getEmbedding(embeddingText);
      storeLessonEmbedding(lesson.id, embedding);
    } catch {
    }
    return lesson;
  }
  /**
   * Update a lesson
   */
  update(id, updates) {
    return updateLesson(id, updates);
  }
  /**
   * Update a lesson and regenerate its embedding
   */
  async updateWithEmbedding(id, updates) {
    const lesson = updateLesson(id, updates);
    if (lesson) {
      if (updates.title || updates.triggerContext || updates.insight) {
        try {
          const embeddingText = this.buildEmbeddingText(lesson);
          const embedding = await getEmbedding(embeddingText);
          storeLessonEmbedding(lesson.id, embedding);
        } catch {
        }
      }
    }
    return lesson;
  }
  /**
   * Delete a lesson permanently
   */
  delete(id) {
    return deleteLesson(id);
  }
  /**
   * Archive a lesson (soft delete)
   */
  archive(id) {
    archiveLesson(id);
  }
  /**
   * Unarchive a lesson
   */
  unarchive(id) {
    unarchiveLesson(id);
  }
  /**
   * Get a lesson by ID
   */
  get(id) {
    return getLesson(id);
  }
  /**
   * Get lessons for a project
   */
  getByProject(projectPath, options) {
    return getLessonsByProject(projectPath, options);
  }
  /**
   * Get core lessons (high confidence, well-validated)
   */
  getCore(projectPath, limit) {
    return getCoreLessons(projectPath, limit);
  }
  /**
   * Get all lessons
   */
  getAll(options) {
    return getAllLessons(options);
  }
  /**
   * Record that a lesson was applied (shown to user)
   */
  recordApplication(id) {
    recordLessonApplication(id);
  }
  /**
   * Record validation feedback - boosts confidence
   */
  recordValidation(id, sessionId, comment) {
    recordLessonValidation(id, sessionId, comment);
    const lesson = getLesson(id);
    if (lesson) {
      const newConfidence = Math.min(MAX_CONFIDENCE, lesson.confidence + VALIDATION_BOOST);
      updateLesson(id, { confidence: newConfidence });
    }
  }
  /**
   * Record rejection feedback - reduces confidence
   * Auto-archives if confidence drops too low
   */
  recordRejection(id, sessionId, comment) {
    recordLessonRejection(id, sessionId, comment);
    const lesson = getLesson(id);
    if (lesson) {
      const newConfidence = Math.max(MIN_CONFIDENCE, lesson.confidence - REJECTION_PENALTY);
      if (newConfidence < AUTO_ARCHIVE_THRESHOLD) {
        archiveLesson(id);
      } else {
        updateLesson(id, { confidence: newConfidence });
      }
    }
  }
  /**
   * Decay confidence of unused lessons
   * Should be run periodically (e.g., weekly)
   */
  decayUnusedLessons(daysThreshold = 30) {
    const lessons = getAllLessons({ archived: false });
    const cutoffDate = /* @__PURE__ */ new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysThreshold);
    let decayedCount = 0;
    for (const lesson of lessons) {
      const lastUsed = lesson.lastAppliedAt ? new Date(lesson.lastAppliedAt) : new Date(lesson.createdAt);
      if (lastUsed < cutoffDate) {
        const newConfidence = Math.max(MIN_CONFIDENCE, lesson.confidence - DECAY_RATE);
        if (newConfidence < AUTO_ARCHIVE_THRESHOLD) {
          archiveLesson(lesson.id);
        } else {
          updateLesson(lesson.id, { confidence: newConfidence });
        }
        decayedCount++;
      }
    }
    return decayedCount;
  }
  /**
   * Build text for embedding generation
   */
  buildEmbeddingText(lesson) {
    const parts = [
      `Title: ${lesson.title}`,
      `Category: ${lesson.category}`,
      `When to apply: ${lesson.triggerContext}`,
      `Insight: ${lesson.insight}`
    ];
    if (lesson.reasoning) {
      parts.push(`Reasoning: ${lesson.reasoning}`);
    }
    return parts.join("\n\n");
  }
};
var lessonManager = new LessonManager();

// src/learning/types.ts
var VALID_CATEGORIES = [
  "architecture_decision",
  "anti_pattern",
  "bug_pattern",
  "project_convention",
  "dependency_knowledge",
  "domain_knowledge",
  "workflow",
  "other"
];

// src/mcp/server.ts
function createMcpServer() {
  const server = new Server(
    {
      name: "cmem",
      version: "0.1.0"
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "search_sessions",
          description: "Semantic search across all saved Claude Code conversation sessions. Use this to find past conversations about specific topics, projects, or problems. Returns matching sessions ranked by relevance.",
          inputSchema: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: 'Natural language search query. Examples: "React hooks discussion", "database migration", "authentication implementation"'
              },
              limit: {
                type: "number",
                description: "Maximum number of results to return (default: 5)"
              }
            },
            required: ["query"]
          }
        },
        {
          name: "list_sessions",
          description: "List all saved Claude Code conversation sessions, ordered by most recently updated. Use this to browse available sessions or find recent conversations.",
          inputSchema: {
            type: "object",
            properties: {
              limit: {
                type: "number",
                description: "Maximum number of sessions to return (default: 10)"
              }
            }
          }
        },
        {
          name: "get_session",
          description: "Get detailed information about a specific conversation session, including its full message history. Use this after finding a session via search or list.",
          inputSchema: {
            type: "object",
            properties: {
              sessionId: {
                type: "string",
                description: "The session ID to retrieve"
              },
              includeMessages: {
                type: "boolean",
                description: "Whether to include the full message history (default: true)"
              },
              messageLimit: {
                type: "number",
                description: "Maximum number of messages to include (default: 50, from most recent)"
              }
            },
            required: ["sessionId"]
          }
        },
        {
          name: "get_session_context",
          description: "Get a formatted context summary from a past session that can be used to continue or reference that conversation. Returns key information and recent messages in a readable format.",
          inputSchema: {
            type: "object",
            properties: {
              sessionId: {
                type: "string",
                description: "The session ID to get context from"
              },
              messageCount: {
                type: "number",
                description: "Number of recent messages to include (default: 10)"
              }
            },
            required: ["sessionId"]
          }
        },
        {
          name: "search_and_summarize",
          description: "Search past Claude Code sessions and get an AI-generated summary tailored to your specific question. This spawns a separate Claude instance to read and synthesize the relevant sessions, keeping your main context clean. Use this when you need insights from past conversations.",
          inputSchema: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: 'Your question or topic to search for. Examples: "What did we decide about the database schema?", "How did we implement authentication?", "What was the bug fix for the login issue?"'
              },
              sessionLimit: {
                type: "number",
                description: "Maximum number of sessions to analyze (default: 3)"
              },
              model: {
                type: "string",
                enum: ["haiku", "sonnet", "opus"],
                description: "Model to use for summarization (default: haiku for speed)"
              }
            },
            required: ["query"]
          }
        },
        // ==================== LESSON TOOLS ====================
        {
          name: "search_lessons",
          description: "Search learned lessons for a project using semantic search. Returns lessons that match the query context.",
          inputSchema: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "Search query describing what you want to find"
              },
              projectPath: {
                type: "string",
                description: "Project path to search lessons for (defaults to current directory)"
              },
              limit: {
                type: "number",
                description: "Maximum number of results (default: 5)"
              }
            },
            required: ["query"]
          }
        },
        {
          name: "get_lesson",
          description: "Get details of a specific learned lesson by ID.",
          inputSchema: {
            type: "object",
            properties: {
              lessonId: {
                type: "string",
                description: "The lesson ID to retrieve"
              }
            },
            required: ["lessonId"]
          }
        },
        {
          name: "save_lesson",
          description: "Manually save a new lesson. Use this when you learn something important about a project that should be remembered.",
          inputSchema: {
            type: "object",
            properties: {
              projectPath: {
                type: "string",
                description: "Project path this lesson applies to"
              },
              category: {
                type: "string",
                enum: VALID_CATEGORIES,
                description: "Category of the lesson"
              },
              title: {
                type: "string",
                description: "Short title (max 60 chars)"
              },
              triggerContext: {
                type: "string",
                description: "When this lesson should be surfaced"
              },
              insight: {
                type: "string",
                description: "The actual knowledge (specific, actionable)"
              },
              reasoning: {
                type: "string",
                description: "Why this is true (optional)"
              }
            },
            required: ["projectPath", "category", "title", "triggerContext", "insight"]
          }
        },
        {
          name: "validate_lesson",
          description: "Mark a lesson as helpful/correct. Boosts its confidence score.",
          inputSchema: {
            type: "object",
            properties: {
              lessonId: {
                type: "string",
                description: "The lesson ID to validate"
              },
              comment: {
                type: "string",
                description: "Optional comment about why it was helpful"
              }
            },
            required: ["lessonId"]
          }
        },
        {
          name: "reject_lesson",
          description: "Mark a lesson as unhelpful/incorrect. Reduces its confidence score.",
          inputSchema: {
            type: "object",
            properties: {
              lessonId: {
                type: "string",
                description: "The lesson ID to reject"
              },
              comment: {
                type: "string",
                description: "Optional comment about why it was wrong"
              }
            },
            required: ["lessonId"]
          }
        },
        {
          name: "list_lessons",
          description: "List all lessons for a project.",
          inputSchema: {
            type: "object",
            properties: {
              projectPath: {
                type: "string",
                description: "Project path to list lessons for"
              },
              category: {
                type: "string",
                enum: VALID_CATEGORIES,
                description: "Filter by category"
              },
              includeArchived: {
                type: "boolean",
                description: "Include archived lessons (default: false)"
              },
              limit: {
                type: "number",
                description: "Maximum number of results (default: 20)"
              }
            },
            required: ["projectPath"]
          }
        }
      ]
    };
  });
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
      switch (name) {
        case "search_sessions":
          return await handleSearchSessions(args);
        case "list_sessions":
          return await handleListSessions(args);
        case "get_session":
          return await handleGetSession(
            args
          );
        case "get_session_context":
          return await handleGetSessionContext(
            args
          );
        case "search_and_summarize":
          return await handleSearchAndSummarize(
            args
          );
        // ==================== LESSON HANDLERS ====================
        case "search_lessons":
          return await handleSearchLessons(
            args
          );
        case "get_lesson":
          return await handleGetLesson(args);
        case "save_lesson":
          return await handleSaveLesson(
            args
          );
        case "validate_lesson":
          return await handleValidateLesson(
            args
          );
        case "reject_lesson":
          return await handleRejectLesson(
            args
          );
        case "list_lessons":
          return await handleListLessons(
            args
          );
        default:
          return {
            content: [{ type: "text", text: `Unknown tool: ${name}` }],
            isError: true
          };
      }
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${String(error)}` }],
        isError: true
      };
    }
  });
  return server;
}
async function handleSearchSessions(args) {
  const { query, limit = 5 } = args;
  if (!isReady()) {
    try {
      await initializeEmbeddings();
    } catch {
      const allSessions = listSessions(100);
      const queryLower = query.toLowerCase();
      const filtered = allSessions.filter(
        (s) => s.title.toLowerCase().includes(queryLower) || s.summary && s.summary.toLowerCase().includes(queryLower)
      ).slice(0, limit);
      return {
        content: [
          {
            type: "text",
            text: formatSessionList(filtered, `Text search results for "${query}" (embeddings unavailable)`)
          }
        ]
      };
    }
  }
  const queryEmbedding = await getEmbedding(query);
  const results = searchSessions(queryEmbedding, limit);
  return {
    content: [
      {
        type: "text",
        text: formatSessionList(results, `Semantic search results for "${query}"`)
      }
    ]
  };
}
async function handleListSessions(args) {
  const { limit = 10 } = args;
  const sessions = listSessions(limit);
  return {
    content: [
      {
        type: "text",
        text: formatSessionList(sessions, "Recent sessions")
      }
    ]
  };
}
async function handleGetSession(args) {
  const { sessionId, includeMessages = true, messageLimit = 50 } = args;
  let session = getSession(sessionId) || getSessionByIdPrefix(sessionId);
  if (!session) {
    return {
      content: [{ type: "text", text: `Session not found: ${sessionId}` }],
      isError: true
    };
  }
  const lines = [
    `# Session: ${session.title}`,
    "",
    `**ID:** ${session.id}`,
    `**Created:** ${session.createdAt}`,
    `**Updated:** ${session.updatedAt} (${formatTimeAgo(session.updatedAt)})`,
    `**Messages:** ${session.messageCount}`
  ];
  if (session.projectPath) {
    lines.push(`**Project:** ${session.projectPath}`);
  }
  if (session.summary) {
    lines.push("", "## Summary", session.summary);
  }
  if (includeMessages) {
    const messages = getSessionMessages(session.id);
    const recentMessages = messages.slice(-messageLimit);
    lines.push("", "## Messages", "");
    for (const msg of recentMessages) {
      lines.push(`### ${msg.role === "user" ? "User" : "Assistant"}`);
      lines.push(msg.content);
      lines.push("");
    }
    if (messages.length > messageLimit) {
      lines.push(`_...${messages.length - messageLimit} earlier messages omitted_`);
    }
  }
  return {
    content: [{ type: "text", text: lines.join("\n") }]
  };
}
async function handleGetSessionContext(args) {
  const { sessionId, messageCount = 10 } = args;
  let session = getSession(sessionId) || getSessionByIdPrefix(sessionId);
  if (!session) {
    return {
      content: [{ type: "text", text: `Session not found: ${sessionId}` }],
      isError: true
    };
  }
  const messages = getSessionMessages(session.id);
  const recentMessages = messages.slice(-messageCount);
  const lines = [
    "# Context from Previous Session",
    "",
    `**Topic:** ${session.title}`
  ];
  if (session.projectPath) {
    lines.push(`**Project:** ${session.projectPath}`);
  }
  if (session.summary) {
    lines.push("", "## Summary", session.summary);
  }
  lines.push(
    "",
    "## Recent Conversation",
    `_Last ${recentMessages.length} of ${messages.length} messages_`,
    ""
  );
  for (const msg of recentMessages) {
    const role = msg.role === "user" ? "**User:**" : "**Assistant:**";
    lines.push(role);
    lines.push(truncate(msg.content, 2e3));
    lines.push("");
  }
  return {
    content: [{ type: "text", text: lines.join("\n") }]
  };
}
async function handleSearchAndSummarize(args) {
  const { query, sessionLimit = 3, model = "haiku" } = args;
  if (!isClaudeCliAvailable()) {
    return {
      content: [
        {
          type: "text",
          text: "Claude CLI not found. This tool requires Claude Code CLI to be installed."
        }
      ],
      isError: true
    };
  }
  if (!isReady()) {
    try {
      await initializeEmbeddings();
    } catch {
      return {
        content: [
          {
            type: "text",
            text: "Embedding model not available. Please run `cmem setup` first."
          }
        ],
        isError: true
      };
    }
  }
  const queryEmbedding = await getEmbedding(query);
  const sessions = searchSessions(queryEmbedding, sessionLimit);
  if (sessions.length === 0) {
    return {
      content: [
        {
          type: "text",
          text: `No relevant sessions found for: "${query}"`
        }
      ]
    };
  }
  const sessionContents = [];
  for (const session of sessions) {
    const messages = getSessionMessages(session.id);
    if (messages.length === 0) continue;
    const sessionText = [
      `## Session: ${session.title}`,
      `Project: ${session.projectPath || "Unknown"}`,
      `Date: ${session.updatedAt}`,
      "",
      ...messages.slice(-20).map((m) => `**${m.role}:** ${truncate(m.content, 1500)}`)
    ].join("\n");
    sessionContents.push(sessionText);
  }
  if (sessionContents.length === 0) {
    return {
      content: [
        {
          type: "text",
          text: `Found ${sessions.length} sessions but they appear to be empty.`
        }
      ]
    };
  }
  const prompt = `You are analyzing past Claude Code conversation sessions to answer a user's question.

<user_question>
${query}
</user_question>

<past_sessions>
${sessionContents.join("\n\n---\n\n")}
</past_sessions>

Based on the past sessions above, provide a concise and helpful answer to the user's question. Focus on:
1. Directly answering their question with specific details from the conversations
2. Mentioning which session(s) the information came from
3. Highlighting any relevant decisions, code snippets, or conclusions

If the sessions don't contain relevant information to answer the question, say so clearly.

Keep your response concise but complete.`;
  const response = await runClaudePrompt(prompt, { model });
  if (!response.success) {
    return {
      content: [
        {
          type: "text",
          text: `Error generating summary: ${response.error || "Unknown error"}`
        }
      ],
      isError: true
    };
  }
  const resultLines = [
    response.content,
    "",
    "---",
    `*Analyzed ${sessions.length} session(s) | Model: ${model}${response.durationMs ? ` | ${(response.durationMs / 1e3).toFixed(1)}s` : ""}${response.outputTokens ? ` | ${response.outputTokens} tokens` : ""}*`
  ];
  return {
    content: [{ type: "text", text: resultLines.join("\n") }]
  };
}
function formatSessionList(sessions, header) {
  if (sessions.length === 0) {
    return `${header}

No sessions found.`;
  }
  const lines = [header, ""];
  for (const session of sessions) {
    lines.push(`### ${session.title}`);
    lines.push(`- **ID:** \`${session.id.slice(0, 8)}\` (use this to get full session)`);
    lines.push(`- **Messages:** ${session.messageCount}`);
    lines.push(`- **Updated:** ${formatTimeAgo(session.updatedAt)}`);
    if (session.projectPath) {
      lines.push(`- **Project:** ${session.projectPath}`);
    }
    if (session.summary) {
      lines.push(`- **Summary:** ${truncate(session.summary, 150)}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
async function handleSearchLessons(args) {
  const { query, projectPath = process.cwd(), limit = 5 } = args;
  if (!isReady()) {
    try {
      await initializeEmbeddings();
    } catch {
      return {
        content: [
          {
            type: "text",
            text: "Embedding model not available. Cannot perform semantic search."
          }
        ],
        isError: true
      };
    }
  }
  const queryEmbedding = await getEmbedding(query);
  const lessons = searchLessonsByEmbedding(queryEmbedding, projectPath, limit);
  if (lessons.length === 0) {
    return {
      content: [
        {
          type: "text",
          text: `No lessons found for query: "${query}" in project: ${projectPath}`
        }
      ]
    };
  }
  const lines = [`# Lessons matching "${query}"`, ""];
  for (const lesson of lessons) {
    lines.push(`### ${lesson.title}`);
    lines.push(`- **ID:** \`${lesson.id.slice(0, 8)}\``);
    lines.push(`- **Category:** ${lesson.category}`);
    lines.push(`- **Confidence:** ${(lesson.confidence * 100).toFixed(0)}%`);
    lines.push(`- **When to apply:** ${lesson.triggerContext}`);
    lines.push("");
    lines.push(`**Insight:** ${lesson.insight}`);
    if (lesson.reasoning) {
      lines.push(`**Reasoning:** ${lesson.reasoning}`);
    }
    lines.push("");
  }
  return {
    content: [{ type: "text", text: lines.join("\n") }]
  };
}
async function handleGetLesson(args) {
  const { lessonId } = args;
  const lesson = getLesson(lessonId);
  if (!lesson) {
    return {
      content: [{ type: "text", text: `Lesson not found: ${lessonId}` }],
      isError: true
    };
  }
  const lines = [
    `# ${lesson.title}`,
    "",
    `**ID:** ${lesson.id}`,
    `**Category:** ${lesson.category}`,
    `**Project:** ${lesson.projectPath}`,
    `**Confidence:** ${(lesson.confidence * 100).toFixed(0)}%`,
    `**Times Applied:** ${lesson.timesApplied}`,
    `**Times Validated:** ${lesson.timesValidated}`,
    `**Times Rejected:** ${lesson.timesRejected}`,
    `**Archived:** ${lesson.archived ? "Yes" : "No"}`,
    `**Created:** ${lesson.createdAt}`,
    `**Updated:** ${lesson.updatedAt}`,
    "",
    "## When to Apply",
    lesson.triggerContext,
    "",
    "## Insight",
    lesson.insight
  ];
  if (lesson.reasoning) {
    lines.push("", "## Reasoning", lesson.reasoning);
  }
  if (lesson.sourceSessionId) {
    lines.push("", `**Source Session:** ${lesson.sourceSessionId}`);
  }
  return {
    content: [{ type: "text", text: lines.join("\n") }]
  };
}
async function handleSaveLesson(args) {
  const input = {
    projectPath: args.projectPath,
    category: args.category,
    title: args.title,
    triggerContext: args.triggerContext,
    insight: args.insight,
    reasoning: args.reasoning,
    sourceType: "manual",
    confidence: 0.6
    // Manual lessons start with moderate confidence
  };
  try {
    const lesson = await lessonManager.create(input);
    return {
      content: [
        {
          type: "text",
          text: `Lesson saved successfully!

**ID:** ${lesson.id}
**Title:** ${lesson.title}`
        }
      ]
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Failed to save lesson: ${String(error)}`
        }
      ],
      isError: true
    };
  }
}
async function handleValidateLesson(args) {
  const { lessonId, comment } = args;
  const lesson = getLesson(lessonId);
  if (!lesson) {
    return {
      content: [{ type: "text", text: `Lesson not found: ${lessonId}` }],
      isError: true
    };
  }
  lessonManager.recordValidation(lessonId, void 0, comment);
  const updated = getLesson(lessonId);
  return {
    content: [
      {
        type: "text",
        text: `Lesson validated: "${lesson.title}"
New confidence: ${((updated?.confidence ?? 0) * 100).toFixed(0)}%`
      }
    ]
  };
}
async function handleRejectLesson(args) {
  const { lessonId, comment } = args;
  const lesson = getLesson(lessonId);
  if (!lesson) {
    return {
      content: [{ type: "text", text: `Lesson not found: ${lessonId}` }],
      isError: true
    };
  }
  lessonManager.recordRejection(lessonId, void 0, comment);
  const updated = getLesson(lessonId);
  let message = `Lesson rejected: "${lesson.title}"`;
  if (updated?.archived) {
    message += "\nLesson has been auto-archived due to low confidence.";
  } else if (updated) {
    message += `
New confidence: ${(updated.confidence * 100).toFixed(0)}%`;
  }
  return {
    content: [{ type: "text", text: message }]
  };
}
async function handleListLessons(args) {
  const { projectPath, category, includeArchived = false, limit = 20 } = args;
  const lessons = getLessonsByProject(projectPath, {
    category,
    archived: includeArchived ? void 0 : false,
    limit
  });
  if (lessons.length === 0) {
    return {
      content: [
        {
          type: "text",
          text: `No lessons found for project: ${projectPath}`
        }
      ]
    };
  }
  const stats = getLessonStats();
  const lines = [
    `# Lessons for ${projectPath}`,
    "",
    `**Total:** ${lessons.length} | **Active:** ${stats.activeLessons} | **Archived:** ${stats.archivedLessons}`,
    ""
  ];
  for (const lesson of lessons) {
    const archived = lesson.archived ? " [ARCHIVED]" : "";
    lines.push(`### ${lesson.title}${archived}`);
    lines.push(`- **ID:** \`${lesson.id.slice(0, 8)}\``);
    lines.push(`- **Category:** ${lesson.category}`);
    lines.push(`- **Confidence:** ${(lesson.confidence * 100).toFixed(0)}%`);
    lines.push(`- **Applied:** ${lesson.timesApplied} | **Validated:** ${lesson.timesValidated} | **Rejected:** ${lesson.timesRejected}`);
    lines.push(`- **Insight:** ${truncate(lesson.insight, 100)}`);
    lines.push("");
  }
  return {
    content: [{ type: "text", text: lines.join("\n") }]
  };
}
async function startMcpServer() {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// src/commands/mcp.ts
async function mcpCommand() {
  console.error(chalk8.cyan("Starting cmem MCP server..."));
  try {
    await startMcpServer();
  } catch (err) {
    console.error(chalk8.red("MCP server error:"), err);
    process.exit(1);
  }
}

// src/commands/setup.ts
import chalk9 from "chalk";
import { execSync as execSync2 } from "child_process";
import { existsSync as existsSync10, readFileSync as readFileSync3, writeFileSync, mkdirSync as mkdirSync2, readdirSync as readdirSync4, statSync as statSync5 } from "fs";
import { homedir as homedir2 } from "os";
import { join as join6, dirname as dirname6, basename as basename7 } from "path";
import { fileURLToPath } from "url";
import { createInterface } from "readline";
var __filename = fileURLToPath(import.meta.url);
var __dirname = dirname6(__filename);
var CLAUDE_JSON_PATH = join6(homedir2(), ".claude.json");
var CLAUDE_SETTINGS_PATH = join6(homedir2(), ".claude", "settings.json");
var CMEM_DIR2 = join6(homedir2(), ".cmem");
var SETUP_MARKER = join6(CMEM_DIR2, ".setup-complete");
var CMEM_PERMISSIONS = [
  "mcp__cmem__search_sessions",
  "mcp__cmem__list_sessions",
  "mcp__cmem__get_session",
  "mcp__cmem__get_session_context",
  "mcp__cmem__search_and_summarize",
  "mcp__cmem__search_lessons",
  "mcp__cmem__get_lesson",
  "mcp__cmem__save_lesson",
  "mcp__cmem__validate_lesson",
  "mcp__cmem__reject_lesson",
  "mcp__cmem__list_lessons"
];
var spinnerFrames2 = ["\u280B", "\u2819", "\u2839", "\u2838", "\u283C", "\u2834", "\u2826", "\u2827", "\u2807", "\u280F"];
var Spinner3 = class {
  interval = null;
  frameIndex = 0;
  message;
  constructor(message) {
    this.message = message;
  }
  start() {
    process.stdout.write(`  ${spinnerFrames2[0]} ${this.message}`);
    this.interval = setInterval(() => {
      this.frameIndex = (this.frameIndex + 1) % spinnerFrames2.length;
      process.stdout.write(`\r  ${chalk9.cyan(spinnerFrames2[this.frameIndex])} ${this.message}`);
    }, 80);
  }
  update(message) {
    this.message = message;
    process.stdout.write(`\r  ${chalk9.cyan(spinnerFrames2[this.frameIndex])} ${this.message}                    `);
  }
  succeed(message) {
    this.stop();
    console.log(`\r  ${chalk9.green("\u2713")} ${message || this.message}                    `);
  }
  fail(message) {
    this.stop();
    console.log(`\r  ${chalk9.red("\u2717")} ${message || this.message}                    `);
  }
  warn(message) {
    this.stop();
    console.log(`\r  ${chalk9.yellow("!")} ${message || this.message}                    `);
  }
  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }
};
function printBanner(version) {
  const magenta = chalk9.magenta;
  const cyan = chalk9.cyan;
  const dim = chalk9.dim;
  console.log("");
  console.log(magenta("   \u2588\u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2588\u2557   \u2588\u2588\u2588\u2557 \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2588\u2557   \u2588\u2588\u2588\u2557"));
  console.log(magenta("  \u2588\u2588\u2554\u2550\u2550\u2550\u2550\u255D \u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2588\u2588\u2551 \u2588\u2588\u2554\u2550\u2550\u2550\u2550\u255D \u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2588\u2588\u2551"));
  console.log(magenta("  \u2588\u2588\u2551      \u2588\u2588\u2554\u2588\u2588\u2588\u2588\u2554\u2588\u2588\u2551 \u2588\u2588\u2588\u2588\u2588\u2557   \u2588\u2588\u2554\u2588\u2588\u2588\u2588\u2554\u2588\u2588\u2551"));
  console.log(magenta("  \u2588\u2588\u2551      \u2588\u2588\u2551\u255A\u2588\u2588\u2554\u255D\u2588\u2588\u2551 \u2588\u2588\u2554\u2550\u2550\u255D   \u2588\u2588\u2551\u255A\u2588\u2588\u2554\u255D\u2588\u2588\u2551"));
  console.log(magenta("  \u255A\u2588\u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2551 \u255A\u2550\u255D \u2588\u2588\u2551 \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2551 \u255A\u2550\u255D \u2588\u2588\u2551"));
  console.log(magenta("   \u255A\u2550\u2550\u2550\u2550\u2550\u255D \u255A\u2550\u255D     \u255A\u2550\u255D \u255A\u2550\u2550\u2550\u2550\u2550\u2550\u255D \u255A\u2550\u255D     \u255A\u2550\u255D"));
  console.log("");
  console.log(cyan(`  cmem v${version}`));
  console.log(dim("  Persistent memory & semantic search for Claude Code"));
  console.log(dim("  Created by Colby McHenry"));
  console.log("");
}
async function promptChoice(question, options, defaultChoice = 1) {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });
  options.forEach((opt, i) => {
    console.log(chalk9.dim(`  ${i + 1}) ${opt}`));
  });
  console.log("");
  return new Promise((resolve) => {
    rl.question(chalk9.white(`  Choice [${defaultChoice}]: `), (answer) => {
      rl.close();
      const num = parseInt(answer.trim(), 10);
      if (isNaN(num) || num < 1 || num > options.length) {
        resolve(defaultChoice);
      } else {
        resolve(num);
      }
    });
  });
}
async function promptYesNo(question, defaultYes = true) {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });
  const hint = defaultYes ? "[Y/n]" : "[y/N]";
  return new Promise((resolve) => {
    rl.question(chalk9.white(`  ${question} ${chalk9.dim(hint)} `), (answer) => {
      rl.close();
      const normalized = answer.toLowerCase().trim();
      if (normalized === "") {
        resolve(defaultYes);
      } else {
        resolve(normalized === "y" || normalized === "yes");
      }
    });
  });
}
function isRunningViaNpx() {
  const execPath = process.argv[1] || "";
  return execPath.includes("_npx") || execPath.includes(".npm/_cacache");
}
function isGloballyInstalled() {
  try {
    const result = execSync2("which cmem 2>/dev/null || where cmem 2>/dev/null", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"]
    }).trim();
    return result.length > 0 && !result.includes("_npx");
  } catch {
    return false;
  }
}
function getCmemVersion() {
  try {
    const packagePath = join6(__dirname, "..", "package.json");
    if (existsSync10(packagePath)) {
      const pkg = JSON.parse(readFileSync3(packagePath, "utf-8"));
      return pkg.version || "0.1.0";
    }
  } catch {
  }
  return "0.1.0";
}
function getInstalledVersion() {
  try {
    const result = execSync2("cmem --version 2>/dev/null", {
      encoding: "utf-8"
    }).trim();
    return result;
  } catch {
    return null;
  }
}
function getCmemDistPath() {
  try {
    const globalPath = execSync2("npm root -g 2>/dev/null", {
      encoding: "utf-8"
    }).trim();
    const cmemGlobalPath = join6(globalPath, "@colbymchenry", "cmem", "dist");
    if (existsSync10(cmemGlobalPath)) {
      return cmemGlobalPath;
    }
    const parentDist = dirname6(__dirname);
    if (existsSync10(join6(parentDist, "hooks"))) {
      return parentDist;
    }
    return null;
  } catch {
    const parentDist = dirname6(__dirname);
    if (existsSync10(parentDist)) {
      return parentDist;
    }
    return null;
  }
}
function cleanupOldDaemon() {
  const plistPath = join6(homedir2(), "Library", "LaunchAgents", "com.cmem.watch.plist");
  if (existsSync10(plistPath)) {
    try {
      execSync2(`launchctl unload "${plistPath}" 2>/dev/null`, { stdio: "pipe" });
    } catch {
    }
    try {
      const { unlinkSync: unlinkSync2 } = __require("fs");
      unlinkSync2(plistPath);
    } catch {
    }
  }
}
async function setupCommand() {
  const currentVersion = getCmemVersion();
  const installedVersion = getInstalledVersion();
  const isGlobal = isGloballyInstalled();
  const isNpx = isRunningViaNpx();
  printBanner(currentVersion);
  cleanupOldDaemon();
  if (!isGlobal || isNpx) {
    console.log(chalk9.yellow("  Install cmem globally?"));
    console.log(chalk9.dim("  Makes the `cmem` command available everywhere\n"));
    const choice = await promptChoice("", [
      "Yes - install globally via npm",
      "No - I'll use npx each time"
    ], 1);
    if (choice === 1) {
      console.log(chalk9.dim("\n  Installing @colbymchenry/cmem globally...\n"));
      try {
        execSync2("npm install -g @colbymchenry/cmem", { stdio: "inherit" });
        console.log(chalk9.green("\n  \u2713 Installed globally\n"));
      } catch {
        console.log(chalk9.red("\n  \u2717 Failed to install. Try: sudo npm install -g @colbymchenry/cmem\n"));
      }
    } else {
      console.log(chalk9.dim("\n  Skipped. Use `npx @colbymchenry/cmem` to run.\n"));
    }
  } else if (installedVersion && installedVersion !== currentVersion) {
    console.log(chalk9.yellow(`  Update available: ${installedVersion} \u2192 ${currentVersion}`));
    const shouldUpdate = await promptYesNo("Update to latest version?");
    if (shouldUpdate) {
      console.log(chalk9.dim("\n  Updating @colbymchenry/cmem...\n"));
      try {
        execSync2("npm install -g @colbymchenry/cmem", { stdio: "inherit" });
        console.log(chalk9.green("\n  \u2713 Updated\n"));
      } catch {
        console.log(chalk9.red("\n  \u2717 Failed to update\n"));
      }
    } else {
      console.log("");
    }
  } else {
    console.log(chalk9.green("  \u2713 cmem is installed globally\n"));
  }
  console.log(chalk9.yellow("  Semantic search setup"));
  console.log(chalk9.dim("  Enables searching conversations by meaning\n"));
  const modelSpinner = new Spinner3("Checking embedding model...");
  modelSpinner.start();
  const cached = isModelCached();
  if (cached) {
    modelSpinner.succeed("Embedding model ready");
  } else {
    modelSpinner.update("Downloading embedding model (~130MB)...");
    try {
      await initializeEmbeddings((progress) => {
        if (progress.status === "downloading" && progress.progress !== void 0) {
          const percent = Math.round(progress.progress);
          const fileName = progress.file ? progress.file.split("/").pop() : "";
          modelSpinner.update(`Downloading ${fileName}... ${percent}%`);
        } else if (progress.status === "loading") {
          modelSpinner.update("Loading model...");
        }
      });
      modelSpinner.succeed("Embedding model ready");
    } catch (err) {
      modelSpinner.fail("Failed to download embedding model");
      console.log(chalk9.dim(`  Error: ${err}
`));
    }
  }
  console.log("");
  const mcpConfigured = isMcpConfigured();
  if (mcpConfigured) {
    console.log(chalk9.green("  \u2713 MCP server configured in Claude Code\n"));
  } else {
    console.log(chalk9.yellow("  Add MCP server to Claude Code?"));
    console.log(chalk9.dim("  Lets Claude search your past conversations\n"));
    const choice = await promptChoice("", [
      "Yes - configure automatically (recommended)",
      "No - I'll configure it manually"
    ], 1);
    if (choice === 1) {
      const success = configureMcpServer();
      if (success) {
        console.log(chalk9.green("\n  \u2713 Added MCP server to ~/.claude.json"));
        console.log(chalk9.green("  \u2713 Added permissions to ~/.claude/settings.json"));
        console.log(chalk9.dim("  Restart Claude Code or run /mcp to connect\n"));
      } else {
        console.log(chalk9.red("\n  \u2717 Failed to configure MCP server\n"));
      }
    } else {
      console.log(chalk9.dim("\n  Skipped.\n"));
    }
  }
  const hooksConfigured = areHooksConfigured();
  if (hooksConfigured) {
    console.log(chalk9.green("  \u2713 Learning hooks configured\n"));
  } else {
    console.log(chalk9.yellow("  Enable automatic learning?"));
    console.log(chalk9.dim("  Hooks sync sessions and inject knowledge automatically\n"));
    const choice = await promptChoice("", [
      "Yes - enable hooks (recommended)",
      "No - I'll manage manually"
    ], 1);
    if (choice === 1) {
      const result = configureHooks();
      if (result.success) {
        console.log(chalk9.green("\n  \u2713 Configured hooks in ~/.claude/settings.json"));
        console.log(chalk9.dim("  \u2022 UserPromptSubmit: Injects relevant lessons"));
        console.log(chalk9.dim("  \u2022 Stop/PreCompact: Syncs and backs up sessions\n"));
      } else {
        console.log(chalk9.red(`
  \u2717 Failed to configure hooks: ${result.message}`));
        console.log(chalk9.dim("  You can configure hooks manually in ~/.claude/settings.json\n"));
      }
    } else {
      console.log(chalk9.dim("\n  Skipped. Run `cmem watch` for manual sync.\n"));
    }
  }
  console.log(chalk9.yellow("  Initial session indexing"));
  console.log(chalk9.dim("  Scanning and indexing your existing Claude Code conversations\n"));
  await indexExistingSessions();
  if (!existsSync10(CMEM_DIR2)) {
    mkdirSync2(CMEM_DIR2, { recursive: true });
  }
  writeFileSync(SETUP_MARKER, (/* @__PURE__ */ new Date()).toISOString());
  console.log(chalk9.magenta("  \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550"));
  console.log(chalk9.green.bold("\n  \u2713 Setup complete!\n"));
  console.log(chalk9.white("  Commands:"));
  console.log(chalk9.dim("    cmem              Browse sessions (TUI)"));
  console.log(chalk9.dim('    cmem search "X"   Semantic search'));
  console.log(chalk9.dim("    cmem synthesize   Extract lessons from sessions"));
  console.log(chalk9.dim("    cmem stats        Storage statistics"));
  console.log(chalk9.dim("    cmem --help       All commands"));
  console.log(chalk9.white("\n  MCP Tools (available to Claude):"));
  console.log(chalk9.dim("    search_sessions   Find past conversations"));
  console.log(chalk9.dim("    search_lessons    Find project knowledge"));
  console.log(chalk9.dim("    save_lesson       Save important insights"));
  if (areHooksConfigured()) {
    console.log(chalk9.green("\n  \u{1F9E0} Learning is enabled!"));
    console.log(chalk9.dim("    \u2022 Lessons are injected before each prompt"));
    console.log(chalk9.dim("    \u2022 Sessions sync automatically on stop/compact"));
    console.log(chalk9.dim("    \u2022 Run `cmem synthesize` to extract lessons"));
  }
  console.log("");
}
function isMcpConfigured() {
  if (!existsSync10(CLAUDE_JSON_PATH)) {
    return false;
  }
  try {
    const config = JSON.parse(readFileSync3(CLAUDE_JSON_PATH, "utf-8"));
    return !!config.mcpServers?.cmem;
  } catch {
    return false;
  }
}
function configureMcpServer() {
  try {
    let claudeJson = {};
    if (existsSync10(CLAUDE_JSON_PATH)) {
      try {
        claudeJson = JSON.parse(readFileSync3(CLAUDE_JSON_PATH, "utf-8"));
      } catch {
        claudeJson = {};
      }
    }
    if (!claudeJson.mcpServers) {
      claudeJson.mcpServers = {};
    }
    claudeJson.mcpServers.cmem = {
      type: "stdio",
      command: "cmem",
      args: ["mcp"]
    };
    writeFileSync(CLAUDE_JSON_PATH, JSON.stringify(claudeJson, null, 2) + "\n");
    const claudeDir = dirname6(CLAUDE_SETTINGS_PATH);
    if (!existsSync10(claudeDir)) {
      mkdirSync2(claudeDir, { recursive: true });
    }
    let settings = {};
    if (existsSync10(CLAUDE_SETTINGS_PATH)) {
      try {
        settings = JSON.parse(readFileSync3(CLAUDE_SETTINGS_PATH, "utf-8"));
      } catch {
        settings = {};
      }
    }
    if (!settings.permissions) {
      settings.permissions = {};
    }
    if (!settings.permissions.allow) {
      settings.permissions.allow = [];
    }
    for (const perm of CMEM_PERMISSIONS) {
      if (!settings.permissions.allow.includes(perm)) {
        settings.permissions.allow.push(perm);
      }
    }
    writeFileSync(CLAUDE_SETTINGS_PATH, JSON.stringify(settings, null, 2) + "\n");
    return true;
  } catch (err) {
    console.error(chalk9.red("Error configuring MCP:"), err);
    return false;
  }
}
function configureHooks() {
  try {
    const distPath = getCmemDistPath();
    if (!distPath) {
      return { success: false, message: "Could not find cmem installation path" };
    }
    const consultPath = join6(distPath, "hooks", "consult.js");
    const syncPath = join6(distPath, "hooks", "sync.js");
    if (!existsSync10(consultPath)) {
      return { success: false, message: `Hook file not found: ${consultPath}` };
    }
    const claudeDir = dirname6(CLAUDE_SETTINGS_PATH);
    if (!existsSync10(claudeDir)) {
      mkdirSync2(claudeDir, { recursive: true });
    }
    let settings = {};
    if (existsSync10(CLAUDE_SETTINGS_PATH)) {
      try {
        settings = JSON.parse(readFileSync3(CLAUDE_SETTINGS_PATH, "utf-8"));
      } catch {
        settings = {};
      }
    }
    if (!settings.hooks) {
      settings.hooks = {};
    }
    const hasCmemHook = (hookArray) => {
      if (!hookArray) return false;
      return hookArray.some((h) => h.hooks?.some((hk) => hk.command?.includes("cmem")));
    };
    if (!hasCmemHook(settings.hooks.UserPromptSubmit)) {
      if (!settings.hooks.UserPromptSubmit) {
        settings.hooks.UserPromptSubmit = [];
      }
      settings.hooks.UserPromptSubmit.push({
        matcher: ".*",
        hooks: [{
          type: "command",
          command: `node "${consultPath}"`,
          timeout: 5e3
        }]
      });
    }
    if (!hasCmemHook(settings.hooks.Stop)) {
      if (!settings.hooks.Stop) {
        settings.hooks.Stop = [];
      }
      settings.hooks.Stop.push({
        matcher: ".*",
        hooks: [{
          type: "command",
          command: `node "${syncPath}"`
        }]
      });
    }
    if (!hasCmemHook(settings.hooks.PreCompact)) {
      if (!settings.hooks.PreCompact) {
        settings.hooks.PreCompact = [];
      }
      settings.hooks.PreCompact.push({
        matcher: ".*",
        hooks: [{
          type: "command",
          command: `node "${syncPath}"`
        }]
      });
    }
    writeFileSync(CLAUDE_SETTINGS_PATH, JSON.stringify(settings, null, 2) + "\n");
    return { success: true, message: "Hooks configured successfully" };
  } catch (err) {
    return { success: false, message: String(err) };
  }
}
function areHooksConfigured() {
  if (!existsSync10(CLAUDE_SETTINGS_PATH)) {
    return false;
  }
  try {
    const settings = JSON.parse(readFileSync3(CLAUDE_SETTINGS_PATH, "utf-8"));
    const hooks = settings.hooks;
    if (!hooks) return false;
    const hasCmemHook = (hookArray) => {
      if (!hookArray) return false;
      return hookArray.some((h) => h.hooks?.some((hk) => hk.command?.includes("cmem")));
    };
    return hasCmemHook(hooks.UserPromptSubmit) || hasCmemHook(hooks.Stop);
  } catch {
    return false;
  }
}
function shouldRunSetup() {
  const isNpx = isRunningViaNpx();
  const setupComplete = existsSync10(SETUP_MARKER);
  const isGlobal = isGloballyInstalled();
  if (isNpx) return true;
  if (!isGlobal && !setupComplete) return true;
  const currentVersion = getCmemVersion();
  const installedVersion = getInstalledVersion();
  if (installedVersion && installedVersion !== currentVersion) {
    return true;
  }
  return false;
}
function findAllSessionFiles2(dir) {
  const files = [];
  if (!existsSync10(dir)) return files;
  function scanDir(currentDir, depth = 0) {
    if (depth > 10) return;
    try {
      const entries = readdirSync4(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join6(currentDir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === "subagents") continue;
          scanDir(fullPath, depth + 1);
        } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
          files.push(fullPath);
        }
      }
    } catch {
    }
  }
  scanDir(dir);
  return files;
}
async function indexSessionFile(filePath, embeddingsReady) {
  try {
    const messages = parseSessionFile(filePath);
    if (messages.length === 0) return false;
    const existing = getSessionBySourceFile(filePath);
    if (existing) return false;
    const stats = statSync5(filePath);
    const fileMtime = stats.mtime.toISOString();
    const firstUserMsg = messages.find((m) => m.role === "user");
    const title = firstUserMsg ? generateTitle(firstUserMsg.content) : "Untitled Session";
    const summary = generateSummary(messages);
    const rawData = JSON.stringify({ filePath, messages, mtime: fileMtime });
    const sessionId_from_file = basename7(filePath, ".jsonl");
    const sessionId = createSession({
      title,
      summary,
      projectPath: null,
      sourceFile: filePath,
      rawData,
      messages
    });
    if (embeddingsReady) {
      const contentLength = messages.reduce((sum, m) => sum + m.content.length, 0);
      const shouldEmbed = needsReembedding(sessionId, contentLength, 500);
      if (shouldEmbed) {
        try {
          const embeddingText = createEmbeddingText(title, summary, messages);
          const embedding = await getEmbedding(embeddingText);
          storeEmbedding(sessionId, embedding);
          updateEmbeddingState(sessionId, contentLength, fileMtime);
        } catch {
        }
      }
    }
    return true;
  } catch {
    return false;
  }
}
async function indexExistingSessions() {
  const spinner = new Spinner3("Scanning for sessions...");
  spinner.start();
  const sessionFiles = findAllSessionFiles2(CLAUDE_DIR);
  const totalFiles = sessionFiles.length;
  if (totalFiles === 0) {
    spinner.succeed("No Claude Code sessions found yet");
    console.log(chalk9.dim("  Start using Claude Code, then run cmem to see your sessions\n"));
    return;
  }
  const statsBefore = getStats();
  const alreadyIndexed = statsBefore.sessionCount;
  if (alreadyIndexed >= totalFiles) {
    spinner.succeed(`Found ${totalFiles} sessions (all indexed)`);
    console.log("");
    return;
  }
  spinner.update(`Found ${totalFiles} sessions, indexing...`);
  const embeddingsReady = isReady();
  let processed = 0;
  let newlyIndexed = 0;
  for (const filePath of sessionFiles) {
    processed++;
    const wasNew = await indexSessionFile(filePath, embeddingsReady);
    if (wasNew) newlyIndexed++;
    const percent = Math.round(processed / totalFiles * 100);
    spinner.update(`Indexing sessions... ${percent}% (${processed}/${totalFiles})`);
  }
  spinner.succeed(`Indexed ${totalFiles} sessions (${newlyIndexed} new)`);
  const statsAfter = getStats();
  console.log(chalk9.dim(`  ${statsAfter.sessionCount} sessions, ${statsAfter.embeddingCount} with embeddings
`));
}

// src/commands/purge.ts
import chalk10 from "chalk";
import { createInterface as createInterface2 } from "readline";
async function purgeCommand(options) {
  const days = options.days ? parseInt(options.days, 10) : DEFAULT_PURGE_DAYS;
  if (isNaN(days) || days < 1) {
    console.log(chalk10.red("Invalid days value. Must be a positive number."));
    return;
  }
  const preview = getPurgePreview(days);
  if (preview.sessionsToDelete === 0) {
    console.log(chalk10.green("No sessions eligible for purge."));
    console.log(chalk10.dim("(Sessions must be older than " + days + " days and not starred)"));
    return;
  }
  console.log(chalk10.bold("\nPurge Preview:"));
  console.log(chalk10.dim("\u2500".repeat(50)));
  console.log(`  Database size: ${chalk10.cyan(formatBytes(getDatabaseSize()))}`);
  console.log(`  Backups size:  ${chalk10.cyan(formatBytes(getBackupsDirSize()))}`);
  console.log(`  Total storage: ${chalk10.cyan(formatBytes(getTotalStorageSize()))}`);
  console.log();
  console.log(`  Sessions to delete: ${chalk10.yellow(preview.sessionsToDelete.toString())}`);
  console.log(`  Messages involved:  ${chalk10.yellow(preview.messagesInvolved.toString())}`);
  if (preview.backupFilesToDelete > 0) {
    console.log(`  Backup files:       ${chalk10.yellow(preview.backupFilesToDelete.toString())} (~${formatBytes(preview.backupBytesToFree)})`);
  }
  console.log(`  Date range: ${chalk10.dim(preview.oldestSessionDate)} to ${chalk10.dim(preview.newestSessionDate)}`);
  console.log(chalk10.dim("  (Starred sessions will be preserved)"));
  console.log(chalk10.dim("\u2500".repeat(50)));
  if (options.dryRun) {
    console.log(chalk10.cyan("\n[Dry run] No changes made."));
    return;
  }
  if (!options.force) {
    const confirmed = await confirm(
      chalk10.red(`
Delete ${preview.sessionsToDelete} sessions? This cannot be undone. [y/N] `)
    );
    if (!confirmed) {
      console.log(chalk10.dim("Cancelled."));
      return;
    }
  }
  const result = purgeOldSessions(days);
  console.log(chalk10.green(`
Purged ${result.sessionsDeleted} session${result.sessionsDeleted !== 1 ? "s" : ""}.`));
  if (result.backupsDeleted > 0) {
    console.log(chalk10.green(`Deleted ${result.backupsDeleted} backup file${result.backupsDeleted !== 1 ? "s" : ""}.`));
  }
  console.log(`New storage size: ${chalk10.cyan(formatBytes(getTotalStorageSize()))}`);
}
function confirm(prompt) {
  const rl = createInterface2({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes");
    });
  });
}

// src/commands/synthesize.ts
import chalk11 from "chalk";

// src/learning/SynthesisEngine.ts
var SIMILARITY_THRESHOLD = 0.85;
var MAX_MESSAGES_FOR_SYNTHESIS = 50;
var MAX_MESSAGE_LENGTH = 2e3;
var SynthesisEngine = class {
  /**
   * Synthesize lessons from a session
   */
  async synthesize(session, messages, projectPathOverride) {
    const result = {
      lessonsCreated: 0,
      lessonsSkipped: 0,
      errors: []
    };
    if (!isClaudeCliAvailable()) {
      result.errors.push("Claude CLI not available for synthesis");
      return result;
    }
    if (messages.length < 3) {
      result.errors.push("Session too short for meaningful synthesis");
      return result;
    }
    try {
      const prompt = this.buildSynthesisPrompt(session, messages);
      const response = await runClaudePrompt(prompt, {
        model: "haiku",
        // Use haiku for speed and cost
        maxTokens: 2e3
      });
      if (!response.success) {
        result.errors.push(`Claude error: ${response.error}`);
        return result;
      }
      const rawLessons = this.parseResponse(response.content);
      if (rawLessons.length === 0) {
        return result;
      }
      const projectPath = projectPathOverride || session.projectPath || "";
      for (const raw of rawLessons) {
        try {
          const stored = await this.dedupeAndStore(raw, session, projectPath);
          if (stored) {
            result.lessonsCreated++;
          } else {
            result.lessonsSkipped++;
          }
        } catch (error) {
          result.errors.push(`Failed to store lesson: ${String(error)}`);
        }
      }
      return result;
    } catch (error) {
      result.errors.push(`Synthesis failed: ${String(error)}`);
      return result;
    }
  }
  /**
   * Build the synthesis prompt for Claude
   */
  buildSynthesisPrompt(session, messages) {
    const formattedMessages = this.formatMessages(messages);
    return `You are analyzing a Claude Code conversation session to extract reusable lessons.

## Session Information
- Project: ${session.projectPath || "Unknown"}
- Title: ${session.title}
- Messages: ${messages.length}

## Conversation
${formattedMessages}

## Task
Extract reusable lessons from this conversation. Focus on:

1. **Architecture Decisions** - Design choices and their rationale
2. **Anti-Patterns** - What NOT to do and why
3. **Bug Patterns** - Common bugs and their root causes
4. **Project Conventions** - Code style, naming, file organization
5. **Dependency Knowledge** - Library quirks, version issues, APIs
6. **Domain Knowledge** - Business logic, rules, requirements
7. **Workflows** - Processes, commands, deployment steps

## Requirements
- Only extract genuinely reusable lessons
- Be specific and actionable, not generic
- Include context for when the lesson applies
- Skip trivial or one-off fixes
- Focus on knowledge that would help future work

## Output Format
Return a JSON array of lessons. Each lesson must have:
\`\`\`json
[
  {
    "category": "architecture_decision|anti_pattern|bug_pattern|project_convention|dependency_knowledge|domain_knowledge|workflow|other",
    "title": "Short descriptive title (max 60 chars)",
    "trigger_context": "When this lesson should be surfaced (what kind of prompt/task)",
    "insight": "The actual knowledge - specific and actionable",
    "reasoning": "Why this is true or important (optional)",
    "confidence": 0.3-0.7
  }
]
\`\`\`

Confidence guidelines:
- 0.3-0.4: Observed once, might be specific to this case
- 0.5: Reasonable general lesson
- 0.6-0.7: Clear pattern with strong evidence

Return an empty array [] if no reusable lessons can be extracted.

Output only the JSON array, no other text.`;
  }
  /**
   * Format messages for the prompt
   */
  formatMessages(messages) {
    const relevantMessages = messages.slice(-MAX_MESSAGES_FOR_SYNTHESIS);
    return relevantMessages.map((m) => {
      const role = m.role === "user" ? "User" : "Assistant";
      const content = m.content.length > MAX_MESSAGE_LENGTH ? m.content.slice(0, MAX_MESSAGE_LENGTH) + "...[truncated]" : m.content;
      return `### ${role}
${content}`;
    }).join("\n\n");
  }
  /**
   * Parse Claude's response into raw lessons
   */
  parseResponse(content) {
    try {
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        return [];
      }
      const parsed = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed.filter((item) => this.isValidRawLesson(item)).map((item) => ({
        category: item.category,
        title: String(item.title).slice(0, 60),
        triggerContext: String(item.trigger_context),
        insight: String(item.insight),
        reasoning: item.reasoning ? String(item.reasoning) : void 0,
        confidence: Math.min(0.7, Math.max(0.3, Number(item.confidence) || 0.5))
      }));
    } catch {
      return [];
    }
  }
  /**
   * Validate a raw lesson object
   */
  isValidRawLesson(item) {
    if (typeof item !== "object" || item === null) {
      return false;
    }
    const obj = item;
    return typeof obj.category === "string" && VALID_CATEGORIES.includes(obj.category) && typeof obj.title === "string" && obj.title.length > 0 && typeof obj.trigger_context === "string" && obj.trigger_context.length > 0 && typeof obj.insight === "string" && obj.insight.length > 0;
  }
  /**
   * Check for duplicates and store if unique
   */
  async dedupeAndStore(raw, session, projectPath) {
    const embeddingText = `${raw.title} ${raw.triggerContext} ${raw.insight}`;
    try {
      const embedding = await getEmbedding(embeddingText);
      const similar = searchLessonsByEmbedding(embedding, projectPath, 1);
      if (similar.length > 0 && this.isTooSimilar(similar[0], raw)) {
        return null;
      }
      const input = {
        projectPath,
        category: raw.category,
        title: raw.title,
        triggerContext: raw.triggerContext,
        insight: raw.insight,
        reasoning: raw.reasoning,
        confidence: raw.confidence,
        sourceSessionId: session.id,
        sourceType: "synthesized"
      };
      const lesson = await lessonManager.create(input);
      return lesson;
    } catch {
      const input = {
        projectPath,
        category: raw.category,
        title: raw.title,
        triggerContext: raw.triggerContext,
        insight: raw.insight,
        reasoning: raw.reasoning,
        confidence: raw.confidence,
        sourceSessionId: session.id,
        sourceType: "synthesized"
      };
      return lessonManager.create(input);
    }
  }
  /**
   * Check if a raw lesson is too similar to an existing lesson
   */
  isTooSimilar(existing, raw) {
    const existingText = `${existing.title} ${existing.insight}`.toLowerCase();
    const rawText = `${raw.title} ${raw.insight}`.toLowerCase();
    const existingWords = new Set(existingText.split(/\s+/));
    const rawWords = rawText.split(/\s+/);
    let commonCount = 0;
    for (const word of rawWords) {
      if (existingWords.has(word)) {
        commonCount++;
      }
    }
    const similarity = commonCount / Math.max(existingWords.size, rawWords.length);
    return similarity > SIMILARITY_THRESHOLD;
  }
};
var synthesisEngine = new SynthesisEngine();

// src/learning/processQueue.ts
async function processSynthesisQueue(limit = 5) {
  const result = {
    processed: 0,
    lessonsCreated: 0,
    failed: 0,
    errors: []
  };
  const pending = getPendingSynthesis(limit);
  if (pending.length === 0) {
    return result;
  }
  for (const item of pending) {
    try {
      markSynthesisProcessing(item.id);
      const session = getSession(item.sessionId);
      if (!session) {
        markSynthesisFailed(item.id, "Session not found");
        result.failed++;
        result.errors.push(`Session not found: ${item.sessionId}`);
        continue;
      }
      const messages = getSessionMessages(session.id);
      if (messages.length === 0) {
        markSynthesisFailed(item.id, "Session has no messages");
        result.failed++;
        continue;
      }
      const synthesisResult = await synthesisEngine.synthesize(session, messages, item.projectPath);
      if (synthesisResult.errors.length > 0) {
        result.errors.push(...synthesisResult.errors);
      }
      markSynthesisComplete(item.id, synthesisResult.lessonsCreated);
      result.processed++;
      result.lessonsCreated += synthesisResult.lessonsCreated;
    } catch (error) {
      markSynthesisFailed(item.id, String(error));
      result.failed++;
      result.errors.push(`Failed to process ${item.sessionId}: ${String(error)}`);
    }
  }
  return result;
}
function getQueueStatus2() {
  return getSynthesisStats();
}

// src/commands/synthesize.ts
async function synthesizeCommand(options) {
  const status = getQueueStatus2();
  const lessonStats = getLessonStats();
  if (options.status) {
    console.log(chalk11.cyan("Synthesis Queue Status\n"));
    console.log(`  Pending:    ${chalk11.yellow(status.pending)}`);
    console.log(`  Processing: ${chalk11.blue(status.processing)}`);
    console.log(`  Completed:  ${chalk11.green(status.completed)}`);
    console.log(`  Failed:     ${chalk11.red(status.failed)}`);
    console.log("");
    console.log(chalk11.cyan("Lesson Statistics\n"));
    console.log(`  Total:    ${lessonStats.totalLessons}`);
    console.log(`  Active:   ${lessonStats.activeLessons}`);
    console.log(`  Archived: ${lessonStats.archivedLessons}`);
    console.log(`  Avg Confidence: ${(lessonStats.avgConfidence * 100).toFixed(0)}%`);
    console.log("");
    console.log(chalk11.dim("Categories:"));
    for (const [category, count] of Object.entries(lessonStats.byCategory)) {
      if (count > 0) {
        console.log(`    ${category}: ${count}`);
      }
    }
    return;
  }
  if (status.pending === 0) {
    console.log(chalk11.yellow("No sessions pending synthesis."));
    console.log(chalk11.dim(`
Total lessons: ${lessonStats.totalLessons}`));
    return;
  }
  const limit = parseInt(options.limit || "5", 10);
  console.log(chalk11.cyan("Processing synthesis queue...\n"));
  console.log(`  Queue: ${status.pending} pending`);
  console.log(`  Processing up to ${limit} sessions
`);
  const result = await processSynthesisQueue(limit);
  console.log(chalk11.cyan("\nResults:\n"));
  console.log(`  Processed:       ${chalk11.green(result.processed)}`);
  console.log(`  Lessons created: ${chalk11.green(result.lessonsCreated)}`);
  console.log(`  Failed:          ${result.failed > 0 ? chalk11.red(result.failed) : "0"}`);
  if (result.errors.length > 0) {
    console.log(chalk11.yellow("\nWarnings:"));
    for (const error of result.errors.slice(0, 5)) {
      console.log(chalk11.dim(`  - ${error}`));
    }
    if (result.errors.length > 5) {
      console.log(chalk11.dim(`  ... and ${result.errors.length - 5} more`));
    }
  }
  const newStats = getLessonStats();
  const newStatus = getQueueStatus2();
  console.log("");
  console.log(`Remaining in queue: ${newStatus.pending}`);
  console.log(`Total lessons: ${newStats.totalLessons}`);
  try {
    const cleaned = cleanupOldInjections(7);
    if (cleaned > 0) {
      console.log(chalk11.dim(`
Cleaned up ${cleaned} old injection cache records`));
    }
  } catch {
  }
}

// src/commands/gui.ts
import chalk12 from "chalk";

// src/api/server.ts
import express from "express";
import cors from "cors";
import { join as join7, dirname as dirname7 } from "path";
import { fileURLToPath as fileURLToPath2 } from "url";
import { existsSync as existsSync11 } from "fs";

// src/api/routes.ts
import { Router } from "express";
var apiRouter = Router();
apiRouter.get("/lessons", (req, res) => {
  try {
    const {
      projectPath,
      category,
      archived,
      minConfidence,
      limit
    } = req.query;
    let lessons;
    if (projectPath) {
      lessons = getLessonsByProject(projectPath, {
        category,
        archived: archived === "true",
        minConfidence: minConfidence ? parseFloat(minConfidence) : void 0,
        limit: limit ? parseInt(limit, 10) : void 0
      });
    } else {
      lessons = getAllLessons({
        category,
        archived: archived === "true",
        minConfidence: minConfidence ? parseFloat(minConfidence) : void 0,
        limit: limit ? parseInt(limit, 10) : void 0
      });
    }
    res.json(lessons);
  } catch (error) {
    console.error("Error fetching lessons:", error);
    res.status(500).json({ message: "Failed to fetch lessons" });
  }
});
apiRouter.get("/lessons/:id", (req, res) => {
  try {
    const lesson = getLesson(req.params.id);
    if (!lesson) {
      res.status(404).json({ message: "Lesson not found" });
      return;
    }
    res.json(lesson);
  } catch (error) {
    console.error("Error fetching lesson:", error);
    res.status(500).json({ message: "Failed to fetch lesson" });
  }
});
apiRouter.post("/lessons", (req, res) => {
  try {
    const input = req.body;
    if (!input.projectPath || !input.category || !input.title || !input.triggerContext || !input.insight) {
      res.status(400).json({ message: "Missing required fields" });
      return;
    }
    const lesson = createLesson(input);
    res.status(201).json(lesson);
  } catch (error) {
    console.error("Error creating lesson:", error);
    res.status(500).json({ message: "Failed to create lesson" });
  }
});
apiRouter.put("/lessons/:id", (req, res) => {
  try {
    const existing = getLesson(req.params.id);
    if (!existing) {
      res.status(404).json({ message: "Lesson not found" });
      return;
    }
    const updates = req.body;
    const lesson = updateLesson(req.params.id, updates);
    res.json(lesson);
  } catch (error) {
    console.error("Error updating lesson:", error);
    res.status(500).json({ message: "Failed to update lesson" });
  }
});
apiRouter.delete("/lessons/:id", (req, res) => {
  try {
    const existing = getLesson(req.params.id);
    if (!existing) {
      res.status(404).json({ message: "Lesson not found" });
      return;
    }
    deleteLesson(req.params.id);
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting lesson:", error);
    res.status(500).json({ message: "Failed to delete lesson" });
  }
});
apiRouter.post("/lessons/:id/validate", (req, res) => {
  try {
    const existing = getLesson(req.params.id);
    if (!existing) {
      res.status(404).json({ message: "Lesson not found" });
      return;
    }
    const { comment } = req.body;
    recordLessonValidation(req.params.id, comment);
    const newConfidence = Math.min(1, existing.confidence + 0.1);
    const lesson = updateLesson(req.params.id, { confidence: newConfidence });
    res.json(lesson);
  } catch (error) {
    console.error("Error validating lesson:", error);
    res.status(500).json({ message: "Failed to validate lesson" });
  }
});
apiRouter.post("/lessons/:id/reject", (req, res) => {
  try {
    const existing = getLesson(req.params.id);
    if (!existing) {
      res.status(404).json({ message: "Lesson not found" });
      return;
    }
    const { comment } = req.body;
    recordLessonRejection(req.params.id, comment);
    const newConfidence = Math.max(0, existing.confidence - 0.2);
    if (newConfidence < 0.1) {
      archiveLesson(req.params.id);
    }
    const lesson = updateLesson(req.params.id, { confidence: newConfidence });
    res.json(lesson);
  } catch (error) {
    console.error("Error rejecting lesson:", error);
    res.status(500).json({ message: "Failed to reject lesson" });
  }
});
apiRouter.post("/lessons/:id/archive", (req, res) => {
  try {
    const existing = getLesson(req.params.id);
    if (!existing) {
      res.status(404).json({ message: "Lesson not found" });
      return;
    }
    archiveLesson(req.params.id);
    const lesson = getLesson(req.params.id);
    res.json(lesson);
  } catch (error) {
    console.error("Error archiving lesson:", error);
    res.status(500).json({ message: "Failed to archive lesson" });
  }
});
apiRouter.get("/stats", (_req, res) => {
  try {
    const lessonStats = getLessonStats();
    const queueStatus = getQueueStatus();
    res.json({
      ...lessonStats,
      synthesisQueue: queueStatus
    });
  } catch (error) {
    console.error("Error fetching stats:", error);
    res.status(500).json({ message: "Failed to fetch stats" });
  }
});
apiRouter.get("/projects", (_req, res) => {
  try {
    const projects = getDistinctProjects();
    res.json(projects);
  } catch (error) {
    console.error("Error fetching projects:", error);
    res.status(500).json({ message: "Failed to fetch projects" });
  }
});

// src/api/server.ts
var __filename2 = fileURLToPath2(import.meta.url);
var __dirname2 = dirname7(__filename2);
var DEFAULT_PORT = 3848;
async function startServer(options = {}) {
  const port = options.port ?? DEFAULT_PORT;
  getDatabase();
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use("/api", (_req, res, next) => {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    next();
  });
  app.use("/api", apiRouter);
  const guiDistPath = join7(__dirname2, "../gui/dist");
  if (existsSync11(guiDistPath)) {
    app.use(express.static(guiDistPath));
    app.get("/{*path}", (_req, res) => {
      res.sendFile(join7(guiDistPath, "index.html"));
    });
  } else {
    app.get("/", (_req, res) => {
      res.json({
        message: "CMEM API Server",
        note: "GUI not built. Run: cd gui && npm run build",
        endpoints: {
          lessons: "/api/lessons",
          stats: "/api/stats",
          projects: "/api/projects"
        }
      });
    });
  }
  app.listen(port, () => {
    console.log(`CMEM GUI server running at http://localhost:${port}`);
    if (options.open) {
      const url = `http://localhost:${port}`;
      const openCommand = process.platform === "darwin" ? `open "${url}"` : process.platform === "win32" ? `start "" "${url}"` : `xdg-open "${url}"`;
      import("child_process").then(({ exec }) => {
        exec(openCommand);
      });
    }
  });
}

// src/commands/gui.ts
async function guiCommand(options) {
  const port = options.port ? parseInt(options.port, 10) : 3848;
  console.log(chalk12.cyan("Starting CMEM GUI..."));
  console.log("");
  await startServer({
    port,
    open: options.open !== false
    // Default to opening browser
  });
}

// src/cli.ts
var sessionToResume = null;
function getVersion() {
  try {
    const __filename3 = fileURLToPath3(import.meta.url);
    const __dirname3 = dirname8(__filename3);
    const packagePath = join8(__dirname3, "..", "package.json");
    if (existsSync12(packagePath)) {
      const pkg = JSON.parse(readFileSync4(packagePath, "utf-8"));
      return pkg.version || "0.1.0";
    }
  } catch {
  }
  return "0.1.0";
}
program.name("cmem").description("Persistent session storage for Claude Code CLI").version(getVersion()).option("-l, --local", "Filter to sessions from current directory").action(async (options) => {
  if (shouldRunSetup()) {
    await setupCommand();
    return;
  }
  const handleResume = (sessionId, projectPath) => {
    sessionToResume = { sessionId, projectPath };
  };
  const projectFilter = options.local ? process.cwd() : null;
  const { waitUntilExit } = render(React2.createElement(App, { onResume: handleResume, projectFilter }));
  await waitUntilExit();
  if (sessionToResume) {
    const args = ["--resume", sessionToResume.sessionId];
    const cwd = sessionToResume.projectPath || process.cwd();
    console.log(`
Resuming session in: ${cwd}
`);
    const child = spawn2("claude", args, {
      cwd,
      stdio: "inherit",
      shell: true
    });
    child.on("error", (err) => {
      console.error("Failed to start Claude:", err.message);
      process.exit(1);
    });
    child.on("exit", (code) => {
      process.exit(code || 0);
    });
  }
});
program.command("setup").description("Run interactive setup wizard").action(async () => {
  await setupCommand();
});
program.command("save").description("Save a Claude Code session").option("-t, --title <title>", "Custom title").option("--latest", "Auto-save most recent session").action(async (options) => {
  await saveCommand(options);
});
program.command("list").description("List saved sessions (human sessions only by default)").option("-a, --all", "Show all sessions including automated ones").action(async (options) => {
  await listCommand(options);
});
program.command("search <query>").description("Semantic search across sessions").action(async (query) => {
  await searchCommand(query);
});
program.command("restore <id>").description("Restore a session").option("--copy", "Copy to clipboard").option("--format <format>", "Output format: context|json|markdown", "context").action(async (id, options) => {
  await restoreCommand(id, options);
});
program.command("delete <id>").description("Delete a session").action(async (id) => {
  await deleteCommand(id);
});
program.command("purge").description("Delete old sessions to free up space").option("-d, --days <n>", "Delete sessions older than N days (default: 30)").option("--dry-run", "Preview what would be deleted without making changes").option("-f, --force", "Skip confirmation prompt").action(async (options) => {
  await purgeCommand(options);
});
program.command("stats").description("Show storage statistics").action(async () => {
  await statsCommand();
});
program.command("watch").description("Watch for Claude Code session changes and auto-sync").option("-v, --verbose", "Show detailed output").option("--embed-threshold <chars>", "Re-embed after this many new chars", "500").action(async (options) => {
  await watchCommand({
    verbose: options.verbose,
    embedThreshold: parseInt(options.embedThreshold, 10)
  });
});
program.command("mcp").description("Start MCP server for Claude Code integration").action(async () => {
  await mcpCommand();
});
program.command("synthesize").description("Extract lessons from sessions in the synthesis queue").option("-n, --limit <n>", "Maximum number of sessions to process", "5").option("-s, --status", "Show queue status only").action(async (options) => {
  await synthesizeCommand(options);
});
program.command("gui").description("Launch the web-based lesson management interface").option("-p, --port <port>", "Port to run server on", "3848").option("--no-open", "Do not open browser automatically").action(async (options) => {
  await guiCommand(options);
});
program.parse();
//# sourceMappingURL=cli.js.map