#!/usr/bin/env node

// src/hooks/sync.ts
import { statSync as statSync2, existsSync as existsSync5, readFileSync as readFileSync2, readdirSync as readdirSync2 } from "fs";
import { join as join3, dirname as dirname2, basename as basename2 } from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";

// src/parser/index.ts
import { readFileSync, readdirSync, existsSync as existsSync2, statSync } from "fs";

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
var DB_SIZE_ALERT_THRESHOLD = 5 * 1024 * 1024 * 1024;
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

// src/parser/index.ts
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
function generateSummary(messages) {
  const firstUserMessage = messages.find((m) => m.role === "user");
  if (!firstUserMessage) {
    return "No user messages found";
  }
  const summary = firstUserMessage.content.slice(0, 300);
  return summary.length < firstUserMessage.content.length ? summary + "..." : summary;
}

// src/db/index.ts
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { existsSync as existsSync3 } from "fs";
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
function mapSessionRow(row) {
  return {
    ...row,
    customTitle: row.customTitle,
    isSidechain: row.isSidechain === 1,
    isAutomated: row.isAutomated === 1
  };
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

// src/db/vectors.ts
function storeEmbedding(sessionId, embedding) {
  const db2 = getDatabase();
  const embeddingJson = JSON.stringify(embedding);
  db2.prepare(`
    INSERT OR REPLACE INTO session_embeddings (session_id, embedding)
    VALUES (?, ?)
  `).run(sessionId, embeddingJson);
}

// src/embeddings/index.ts
import { existsSync as existsSync4 } from "fs";
import { join as join2 } from "path";
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
  const modelCachePath = join2(MODELS_DIR, EMBEDDING_MODEL);
  return existsSync4(modelCachePath);
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

// src/utils/format.ts
function truncate(text, maxLength) {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + "...";
}
function generateTitle(content) {
  const firstLine = content.split("\n")[0].trim();
  const title = truncate(firstLine, 50);
  return title || "Untitled Session";
}

// src/db/lessons.ts
function queueForSynthesis(sessionId, projectPath) {
  const db2 = getDatabase();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  db2.prepare(`
    INSERT OR REPLACE INTO synthesis_queue (session_id, project_path, queued_at, status)
    VALUES (?, ?, ?, 'pending')
  `).run(sessionId, projectPath, now);
}
function clearSessionInjections(sessionId) {
  const db2 = getDatabase();
  db2.prepare("DELETE FROM session_injections WHERE session_id = ?").run(sessionId);
}

// src/hooks/sync.ts
var __filename = fileURLToPath(import.meta.url);
var __dirname = dirname2(__filename);
async function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("readable", () => {
      let chunk;
      while ((chunk = process.stdin.read()) !== null) {
        data += chunk;
      }
    });
    process.stdin.on("end", () => {
      resolve(data);
    });
    setTimeout(() => resolve(data), 100);
  });
}
function spawnBackgroundSynthesis() {
  try {
    const synthesizePath = join3(__dirname, "synthesize.js");
    if (!existsSync5(synthesizePath)) {
      return;
    }
    const child = spawn("node", [synthesizePath, "1"], {
      detached: true,
      stdio: "ignore",
      // Don't inherit stdio
      env: { ...process.env }
    });
    child.unref();
  } catch {
  }
}
function findSessionFile(sessionId, cwd) {
  if (existsSync5(CLAUDE_PROJECTS_DIR)) {
    const projectDirs = readdirSync2(CLAUDE_PROJECTS_DIR);
    for (const projectDir of projectDirs) {
      const projectPath = join3(CLAUDE_PROJECTS_DIR, projectDir);
      const sessionFile = join3(projectPath, `${sessionId}.jsonl`);
      if (existsSync5(sessionFile)) {
        return sessionFile;
      }
    }
  }
  return null;
}
function getProjectPathFromIndex(filePath, sessionId) {
  const projectDir = dirname2(filePath);
  const indexPath = join3(projectDir, "sessions-index.json");
  if (!existsSync5(indexPath)) return null;
  try {
    const content = readFileSync2(indexPath, "utf-8");
    const index = JSON.parse(content);
    const entry = index.entries.find((e) => e.sessionId === sessionId);
    return entry?.projectPath || null;
  } catch {
    return null;
  }
}
function loadSubagentMessages(projectDirPath, parentSessionId) {
  const subagentsDir = join3(projectDirPath, parentSessionId, "subagents");
  if (!existsSync5(subagentsDir)) return [];
  const messages = [];
  try {
    const agentFiles = readdirSync2(subagentsDir).filter((f) => f.endsWith(".jsonl"));
    for (const agentFile of agentFiles) {
      const agentPath = join3(subagentsDir, agentFile);
      const agentMessages = parseSessionFile(agentPath);
      messages.push(...agentMessages);
    }
  } catch {
  }
  return messages;
}
async function processSessionFile(filePath, embeddingsReady, embedThreshold = 500) {
  try {
    const messages = parseSessionFile(filePath);
    if (messages.length === 0) {
      return null;
    }
    const stats = statSync2(filePath);
    const fileMtime = stats.mtime.toISOString();
    const existingSession = getSessionBySourceFile(filePath);
    const sessionIdFromFile = basename2(filePath, ".jsonl");
    const agentMessages = loadSubagentMessages(dirname2(filePath), sessionIdFromFile);
    const allMessages = [...messages, ...agentMessages];
    const contentLength = allMessages.reduce((sum, m) => sum + m.content.length, 0);
    const firstUserMsg = messages.find((m) => m.role === "user");
    const title = firstUserMsg ? generateTitle(firstUserMsg.content) : "Untitled Session";
    const summary = generateSummary(messages);
    const rawData = JSON.stringify({ filePath, messages, mtime: fileMtime });
    const projectPath = getProjectPathFromIndex(filePath, sessionIdFromFile);
    const metadata = extractSessionMetadata(filePath);
    const isAutomated = metadata.isSidechain || metadata.isMeta || isAutomatedByContent(title);
    let sessionId;
    let isNew = false;
    if (existingSession) {
      sessionId = existingSession.id;
      if (existingSession.messageCount !== messages.length) {
        updateSession(sessionId, {
          title,
          summary,
          rawData,
          messages,
          isSidechain: metadata.isSidechain,
          isAutomated,
          projectPath: projectPath || void 0
        });
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
    }
    if (embeddingsReady) {
      const shouldEmbed = needsReembedding(sessionId, contentLength, embedThreshold);
      if (shouldEmbed) {
        try {
          const embeddingText = createEmbeddingText(title, summary, allMessages);
          const embedding = await getEmbedding(embeddingText);
          storeEmbedding(sessionId, embedding);
          updateEmbeddingState(sessionId, contentLength, fileMtime);
        } catch {
        }
      }
    }
    backupSessionFile(filePath);
    return { sessionId, isNew };
  } catch {
    return null;
  }
}
async function main() {
  try {
    const stdinData = await readStdin();
    const input = stdinData ? JSON.parse(stdinData) : {};
    let sessionFile = null;
    if (input.transcript_path && existsSync5(input.transcript_path)) {
      sessionFile = input.transcript_path;
    } else if (input.session_id && input.cwd) {
      sessionFile = findSessionFile(input.session_id, input.cwd);
    }
    if (!sessionFile) {
      process.exit(0);
    }
    let embeddingsReady = false;
    if (isReady()) {
      embeddingsReady = true;
    } else {
      try {
        await initializeEmbeddings();
        embeddingsReady = isReady();
      } catch {
      }
    }
    const result = await processSessionFile(sessionFile, embeddingsReady);
    if (result) {
      const projectPath = getProjectPathFromIndex(sessionFile, result.sessionId) || input.cwd || "";
      try {
        queueForSynthesis(result.sessionId, projectPath);
        spawnBackgroundSynthesis();
      } catch {
      }
    }
    if (input.session_id) {
      try {
        clearSessionInjections(input.session_id);
      } catch {
      }
    }
    process.exit(0);
  } catch {
    process.exit(1);
  }
}
main();
//# sourceMappingURL=sync.js.map