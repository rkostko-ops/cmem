// src/mcp/server.ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from "@modelcontextprotocol/sdk/types.js";

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

// src/db/vectors.ts
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
    SELECT l.*, le_d.distance
    FROM lessons l
    INNER JOIN (
      SELECT lesson_id, vec_distance_L2(embedding, ?) as distance
      FROM lesson_embeddings
    ) le_d ON le_d.lesson_id = l.id
    WHERE l.project_path = ?
      AND l.archived = 0
    ORDER BY le_d.distance ASC
    LIMIT ?
  `).all(JSON.stringify(embedding), projectPath, limit);
  return rows.map((row) => ({
    lesson: mapLessonRow(row),
    distance: row.distance
  }));
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
export {
  createMcpServer,
  startMcpServer
};
//# sourceMappingURL=server.js.map