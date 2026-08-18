#!/usr/bin/env node

// src/db/index.ts
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { existsSync as existsSync3 } from "fs";

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

// src/parser/index.ts
import { readFileSync, readdirSync, existsSync as existsSync2, statSync } from "fs";
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

// src/db/sessions.ts
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

// src/db/lessons.ts
import { randomUUID } from "crypto";
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
  const id = randomUUID();
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
- HARD LIMIT: return AT MOST 3 lessons. Fewer is better than more.
- Prefer ONE excellent, durable lesson over several mediocre ones. An almost-empty
  array is the correct answer for a routine session — most sessions teach nothing reusable.
- Do NOT restate facts that are obvious from the codebase, nor generic engineering advice.

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
      })).slice(0, 3);
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
    // fork.3 (2026-08-17): dwie poprawki dedupu.
    // (1) SYMETRIA METRYKI: baza trzyma embedding tekstu z etykietami (buildEmbeddingText),
    //     a tu embedowano surowe "title trigger insight" => dystanse systematycznie zawyzone.
    //     Po zrownaniu formatow mediana dystansu znanych duplikatow spadla 0.582 -> 0.422.
    // (2) PROG SEMANTYCZNY zamiast leksykalnego isTooSimilar() (pokrycie slow > 0.85, czyli
    //     praktycznie identyczny tekst; kazda parafraza przechodzila).
    // fork.5 (2026-08-18): PROG 0.48 -> 0.35. Kalibracja fork.3 opierala sie na 12 recznie
    //     obejrzanych parach z waskiego pasma decyzyjnego — zbyt mala i obciazona probka.
    //     Zmierzone na pelnym rozkladzie (dystans do najblizszej INNEJ lekcji, 3 projekty,
    //     ~1600 lekcji): przy 0.48 odrzucone zostaloby 65-88% lekcji ODREBNYCH, a od ~0.38
    //     dopasowania biora sie z FORMY retorycznej, nie z tresci (zmierzony przypadek: dwie
    //     rozne rady zaczynajace sie tym samym zwrotem, d=0.403). Ponizej 0.35 obejrzane pary
    //     graniczne to prawdziwe duplikaty. Under-merge jest tu bezpiecznym trybem awarii:
    //     zdublowana lekcja kosztuje slot, blednie odrzucona kosztuje wiedze bezpowrotnie.
    // UWAGA: duplikatow MIEDZYJEZYKOWYCH ten mechanizm NIE lapie i zadny prog tego nie zmieni —
    //     model embeddingow grupuje po jezyku. Zmierzone: parafraza tego samego faktu w drugim
    //     jezyku lezy od oryginalu na 0.575 i wypada poza 10 najblizszych sasiadow, podczas gdy
    //     ta sama parafraza w jezyku oryginalu lezy na 0.327 (sasiad #1). Nie dobierac do tego progu.
    const embeddingText = [
      `Title: ${raw.title}`,
      `Category: ${raw.category}`,
      `When to apply: ${raw.triggerContext}`,
      `Insight: ${raw.insight}`
    ].concat(raw.reasoning ? [`Reasoning: ${raw.reasoning}`] : []).join("\n\n");
    try {
      const embedding = await getEmbedding(embeddingText);
      const similar = searchLessonsByEmbeddingWithDistance(embedding, projectPath, 1);
      if (similar.length > 0 && similar[0].distance < 0.35) {
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
function getQueueStatus() {
  return getSynthesisStats();
}

// src/hooks/synthesize.ts
async function main() {
  const limit = parseInt(process.argv[2], 10) || 5;
  const status = getQueueStatus();
  if (status.pending === 0) {
    console.log("No sessions pending synthesis.");
    process.exit(0);
  }
  console.log(`Processing up to ${limit} sessions...`);
  console.log(`Queue: ${status.pending} pending, ${status.processing} processing
`);
  const result = await processSynthesisQueue(limit);
  console.log("\nSynthesis complete:");
  console.log(`  Processed: ${result.processed}`);
  console.log(`  Lessons created: ${result.lessonsCreated}`);
  console.log(`  Failed: ${result.failed}`);
  if (result.errors.length > 0) {
    console.log("\nErrors:");
    for (const error of result.errors) {
      console.log(`  - ${error}`);
    }
  }
  const newStatus = getQueueStatus();
  console.log(`
Queue now: ${newStatus.pending} pending, ${newStatus.completed} completed`);
  console.log(`Total lessons created: ${newStatus.totalLessonsCreated}`);
  process.exit(result.failed > 0 ? 1 : 0);
}
main().catch((error) => {
  console.error("Synthesis error:", error);
  process.exit(1);
});
//# sourceMappingURL=synthesize.js.map