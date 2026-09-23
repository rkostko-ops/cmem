#!/usr/bin/env node

// src/embeddings/index.ts
import { existsSync as existsSync2 } from "fs";
import { join as join2 } from "path";

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

// src/embeddings/index.ts
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
  return existsSync2(modelCachePath);
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

// src/db/lessons.ts
import { randomUUID } from "crypto";

// src/db/index.ts
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { existsSync as existsSync4 } from "fs";

// src/parser/index.ts
import { readFileSync, readdirSync, existsSync as existsSync3, statSync } from "fs";
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
      if (!existsSync4(session.source_file)) continue;
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

// src/db/lessons.ts
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
  // fork.4 (2026-08-18): tiebreaker `created_at DESC` zamiast `times_applied DESC`.
  // times_applied rosnie od samego WSTRZYKNIECIA, nie od pozytku, wiec sortowanie po nim
  // domykalo petle samopotwierdzajaca: zmierzone 2276 z 3309 aktywnych lekcji ma 0,
  // a 84 lekcje z 50+ okupowalyby slot core na zawsze. Swiezosc jest niecyrkularna.
  const rows = db2.prepare(`
    SELECT * FROM lessons
    WHERE project_path = ?
      AND archived = 0
      AND confidence >= 0.7
    ORDER BY
      times_validated DESC,
      confidence DESC,
      created_at DESC
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
function getInjectedLessonIds(sessionId) {
  const db2 = getDatabase();
  const rows = db2.prepare(`
    SELECT lesson_id FROM session_injections WHERE session_id = ?
  `).all(sessionId);
  return new Set(rows.map((row) => row.lesson_id));
}
function recordInjectedLessons(sessionId, lessonIds) {
  if (lessonIds.length === 0) return;
  const db2 = getDatabase();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const stmt = db2.prepare(`
    INSERT OR IGNORE INTO session_injections (session_id, lesson_id, injected_at)
    VALUES (?, ?, ?)
  `);
  const transaction = db2.transaction(() => {
    for (const lessonId of lessonIds) {
      stmt.run(sessionId, lessonId, now);
    }
  });
  transaction();
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
var LESSON_CATEGORY_NAMES = {
  architecture_decision: "Architecture Decision",
  anti_pattern: "Anti-Pattern",
  bug_pattern: "Bug Pattern",
  project_convention: "Project Convention",
  dependency_knowledge: "Dependency Knowledge",
  domain_knowledge: "Domain Knowledge",
  workflow: "Workflow",
  other: "Other"
};

// src/learning/LessonConsultant.ts
var DEFAULT_MAX_SEMANTIC = 5;
var DEFAULT_MAX_CORE = 3;
var MAX_TOTAL_LESSONS = 8;
// fork.3 (2026-08-17): 1.2 lezalo POWYZEJ maksimum realnych dystansow (zmierzone: max 1.147-1.163
// w 4 pulach 230-839 lekcji) => filtr nie odrzucal niczego, wstrzykiwane bylo zawsze top-5 kNN.
// 0.85 ~ p10 realnego rozkladu: wpuszcza gorne ~10% puli, a przy prompcie nie na temat zero lekcji.
var SIMILARITY_THRESHOLD = 0.85;
var MIN_CONFIDENCE2 = 0.3;
var LessonConsultant = class {
  /**
   * Consult lessons based on a prompt
   * Returns relevant lessons and formatted context for injection
   *
   * @param prompt - The user's prompt
   * @param projectPath - Current project path
   * @param options - Consultation options
   * @param sessionId - Claude session ID for deduplication (optional)
   */
  async consult(prompt, projectPath, options, sessionId) {
    const maxSemantic = options?.maxSemantic ?? DEFAULT_MAX_SEMANTIC;
    const maxCore = options?.maxCore ?? DEFAULT_MAX_CORE;
    const alreadyInjected = sessionId ? getInjectedLessonIds(sessionId) : /* @__PURE__ */ new Set();
    if (!isReady()) {
      try {
        await initializeEmbeddings();
      } catch {
        const coreLessons2 = this.filterLessons(
          getCoreLessons(projectPath, maxCore),
          alreadyInjected
        );
        return this.buildResult(coreLessons2, sessionId);
      }
    }
    let semanticLessons = [];
    try {
      const promptEmbedding = await getEmbedding(prompt);
      const results = searchLessonsByEmbeddingWithDistance(
        promptEmbedding,
        projectPath,
        maxSemantic * 2
        // Fetch extra since we'll filter
      );
      // fork.3 (2026-08-17): brakowalo obciecia do maxSemantic. Pobierane jest 2x maxSemantic
      // ("fetch extra since we'll filter"), ale wynik nigdy nie byl przycinany, wiec przy progu,
      // ktory nic nie odrzucal, limit dzialal podwojnie (10 semantycznych + 3 core -> MAX_TOTAL 8).
      semanticLessons = results.filter((r) => r.distance < SIMILARITY_THRESHOLD).filter((r) => r.lesson.confidence >= MIN_CONFIDENCE2).map((r) => r.lesson).slice(0, maxSemantic);
    } catch {
    }
    const coreLessons = getCoreLessons(projectPath, maxCore);
    const allLessons = this.mergeAndRank([...semanticLessons, ...coreLessons]);
    const newLessons = this.filterLessons(allLessons, alreadyInjected);
    const finalLessons = newLessons.slice(0, MAX_TOTAL_LESSONS);
    for (const lesson of finalLessons) {
      lessonManager.recordApplication(lesson.id);
    }
    return this.buildResult(finalLessons, sessionId);
  }
  /**
   * Quick consult without embeddings - just return core lessons
   */
  consultCore(projectPath, limit, sessionId) {
    const alreadyInjected = sessionId ? getInjectedLessonIds(sessionId) : /* @__PURE__ */ new Set();
    const coreLessons = this.filterLessons(
      getCoreLessons(projectPath, limit ?? DEFAULT_MAX_CORE),
      alreadyInjected
    );
    for (const lesson of coreLessons) {
      lessonManager.recordApplication(lesson.id);
    }
    return this.buildResult(coreLessons, sessionId);
  }
  /**
   * Filter out already-injected lessons
   */
  filterLessons(lessons, alreadyInjected) {
    if (alreadyInjected.size === 0) {
      return lessons;
    }
    return lessons.filter((lesson) => !alreadyInjected.has(lesson.id));
  }
  /**
   * Merge lessons and remove duplicates, ranking by relevance
   */
  mergeAndRank(lessons) {
    const seen = /* @__PURE__ */ new Set();
    const unique = [];
    for (const lesson of lessons) {
      if (!seen.has(lesson.id)) {
        seen.add(lesson.id);
        unique.push(lesson);
      }
    }
    return unique.sort((a, b) => {
      const scoreA = a.confidence * (1 + a.timesValidated * 0.1);
      const scoreB = b.confidence * (1 + b.timesValidated * 0.1);
      return scoreB - scoreA;
    });
  }
  /**
   * Build the consult result with formatted context
   * Also records injections for session deduplication
   */
  buildResult(lessons, sessionId) {
    const formattedContext = this.formatForInjection(lessons);
    if (sessionId && lessons.length > 0) {
      recordInjectedLessons(sessionId, lessons.map((l) => l.id));
    }
    return { lessons, formattedContext };
  }
  /**
   * Format lessons for injection into Claude's context
   */
  formatForInjection(lessons) {
    if (lessons.length === 0) {
      return "";
    }
    const lines = [
      "<project_knowledge>",
      "Claims from earlier sessions - may be stale or wrong; verify before relying on them.",
      ""
    ];
    const byCategory = this.groupByCategory(lessons);
    for (const [category, categoryLessons] of Object.entries(byCategory)) {
      if (categoryLessons.length === 0) continue;
      const categoryName = LESSON_CATEGORY_NAMES[category] || category;
      lines.push(`## ${categoryName}`);
      lines.push("");
      for (const lesson of categoryLessons) {
        lines.push(`### ${lesson.title}`);
        lines.push(lesson.insight);
        if (lesson.reasoning) {
          lines.push(`_Reason: ${lesson.reasoning}_`);
        }
        if (lesson.timesValidated > 0) {
          lines.push(`_(Validated ${lesson.timesValidated} times)_`);
        }
        lines.push("");
      }
    }
    lines.push("</project_knowledge>");
    return lines.join("\n");
  }
  /**
   * Group lessons by category
   */
  groupByCategory(lessons) {
    const groups = {
      architecture_decision: [],
      anti_pattern: [],
      bug_pattern: [],
      project_convention: [],
      dependency_knowledge: [],
      domain_knowledge: [],
      workflow: [],
      other: []
    };
    for (const lesson of lessons) {
      groups[lesson.category].push(lesson);
    }
    return groups;
  }
};
var lessonConsultant = new LessonConsultant();

// src/hooks/consult.ts
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
async function main() {
  try {
    const stdinData = await readStdin();
    if (!stdinData) {
      process.exit(0);
    }
    const input = JSON.parse(stdinData);
    if (!input.prompt || !input.cwd) {
      process.exit(0);
    }
    if (input.prompt.length < 10) {
      process.exit(0);
    }
    const { formattedContext } = await lessonConsultant.consult(
      input.prompt,
      input.cwd,
      {
        // fork.3 (2026-08-17): 5+3 slotow => 3 z 8 wstrzyknietych bylo NIEZALEZNE od zapytania
        // (getCoreLessons sortuje po times_validated, ktore jest ~0, wiec de facto po times_applied,
        // a ten licznik rosnie od samego wstrzykniecia => petla samopotwierdzajaca).
        maxSemantic: 3,
        // fork.6 (2026-09-23): maxCore 1 -> 0. Slot core byl ZAMROZONY (sort po times_validated,
        // ktore ma wartosc >0 u garstki lekcji): ta sama lekcja wchodzila w 89,3% polecen, czyli
        // ~26% budzetu. Slepa ocena 39 wstrzyknietych lekcji core: 8% TRAFNYCH, wobec 7% dla
        // lekcji LOSOWEJ z tego samego projektu - slot byl statystycznie nieodroznialny od losu.
        // Bilans na 43 poleceniach: precyzja 36,7% -> 45,0% przy NIEZMIENIONYM pokryciu 76,7%.
        maxCore: 0
      },
      input.session_id
      // Session ID for deduplication - don't re-inject same lessons
    );
    if (formattedContext) {
      console.log(formattedContext);
    }
    process.exit(0);
  } catch (error) {
    console.error("Consult hook error:", error);
    process.exit(0);
  }
}
main();
//# sourceMappingURL=consult.js.map