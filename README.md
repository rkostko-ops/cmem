<div align="center">

# 🧠 cmem

### Self-Learning Memory for Claude Code

**Never lose a conversation. Claude learns from every session.**

**Semantic search • Auto-synthesis • Knowledge injection • Web GUI • 100% local**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)

<br />

### Get Started

```bash
npx @colbymchenry/cmem
```

<sub>Interactive installer configures Claude Code automatically</sub>

</div>

---

> ### ⚠️ This is a fork
>
> This repository is a **fork of upstream `@colbymchenry/cmem` 0.5.4** (MIT, © Colby McHenry), kept as
> an installable source. It carries fixes upstream does not have: a `vec0` KNN workaround, correct
> `project_path` attribution for synthesized lessons, and calibrated retrieval thresholds with semantic
> deduplication. **The `npx` command below is upstream's and does not install this fork.** Install with:
>
> ```bash
> npm i -g https://github.com/rkostko-ops/cmem/releases/download/v0.5.4-fork.8/colbymchenry-cmem-0.5.4-fork.8.tgz
> ```
>
> See **[FORK.md](FORK.md)** for what changed, why, and the measurements behind each threshold.
> A Polish-language description of the tool's internals is in
> [opis_dzialania_narzedzia.md](opis_dzialania_narzedzia.md).

---

## Stop Writing Markdown Files

Everyone tries to solve Claude's memory problem the same way: **manually writing markdown files**. `CLAUDE.md`, `ARCHITECTURE.md`, decision logs, convention docs...

It's tedious. It's incomplete. And you forget to update them.

**cmem takes a different approach.** Instead of *you* documenting everything, cmem watches your conversations and *automatically* extracts the knowledge Claude needs. Architecture decisions, bug patterns, project conventions, anti-patterns—all captured naturally as you work.

Think of it like giving Claude a **notebook for each project**. Every conversation adds notes. When Claude needs to answer a question, it semantically searches this organized, efficient knowledge base—finding exactly the right context without you lifting a finger.

> **Traditional approach:** You manually write docs → Claude reads them → Docs aren't detailed enough so Claude explores anyway → You forget to update → Outdated docs lead to bad suggestions
>
> **cmem approach:** You just code → cmem learns from every session → Knowledge stays current and detailed → Claude gives informed answers instantly

---

## What is cmem?

**cmem** is a self-learning memory system for Claude Code. It:

1. **Backs up every conversation** — Never lose work, even if Claude clears storage
2. **Learns from your sessions** — Auto-extracts lessons about your projects
3. **Injects relevant knowledge** — Claude starts each conversation with context about your codebase
4. **Searches your history** — Find past conversations by meaning, not keywords
5. **Rename and favorite sessions** - Never lose those valuable sessions between you and Claude
6. **View all sessions by project** - Organized chat sessions by what project you were working on
7. **Web GUI** — Manage learned knowledge through a beautiful interface

---

### MCP Integration

> **Using CMEM MCP to fetch conversational data about previous chat sessions**
>
> Claude can search through your conversation history and synthesize answers—all without cluttering your main session context.

![Query All Conversational History](https://github.com/user-attachments/assets/03accdee-7d3b-4d60-8b30-548e4a3a8101)

---

### Session Navigation

> **Easily navigate between previous chat sessions and pick back up right where you left off**
>
> Browse, search, filter, rename, and restore any conversation with the interactive TUI.

![Filter by Folder : Rename : Resume Sessions](https://github.com/user-attachments/assets/d0c8eb76-2d82-4740-81b7-4d8f88fad84f)

#### Open all previous chat sessions in current directory

![Open all sessions in current directory](https://github.com/user-attachments/assets/3783343c-815c-47ba-a6da-fb96cb25ee1b)

---

## Web GUI

Manage your learned knowledge through a clean web interface.

![GUI](https://github.com/user-attachments/assets/70f0d89b-6e1e-4f3e-bada-185197d226e8)

```bash
cmem gui
```

**Features:**
- Browse all lessons by project and category
- Edit, archive, or delete lessons
- View confidence scores and usage stats
- Create lessons manually
- Filter by category (architecture, bugs, conventions, etc.)

## Features

### 📚 Self-Learning Knowledge Base

cmem automatically extracts reusable lessons from your conversations:
- **Architecture decisions** and their rationale
- **Anti-patterns** — what NOT to do and why
- **Bug patterns** — common issues and root causes
- **Project conventions** — code style, naming, organization
- **Dependency knowledge** — library quirks, version issues
- **Domain knowledge** — business logic, requirements

<img width="848" height="348" alt="PNG image" src="https://github.com/user-attachments/assets/f3abd9b0-0efa-4da8-a668-cb8d7532b24c" />

These lessons are automatically surfaced when relevant to your current task

### 🔍 Semantic Search

Find conversations by meaning, not keywords. "That React hooks discussion" or "the database migration plan" just works.

### 🤖 Claude Remembers

Via MCP integration, Claude can search your past conversations and learned knowledge:
- "What did we decide about auth last week?"
- "How do we handle errors in this project?"
- "What's the convention for API endpoints?"

### 💾 Automatic Backup

Every conversation is backed up to `~/.cmem/backups/`. Even if Claude Code clears its storage, cmem restores your sessions instantly.

### 🪝 Hook-Based Integration

cmem integrates with Claude Code via hooks (no background daemon):
- **UserPromptSubmit** — Injects relevant lessons before Claude responds
- **Stop/PreCompact** — Syncs and backs up sessions automatically

### 📦 100% Local & Private

Everything runs on your machine:
- SQLite database with vector embeddings
- Local AI embeddings (nomic-embed-text-v1.5)
- No cloud services, no API keys required

## Quick Start

```bash
npx @colbymchenry/cmem
```

The setup wizard will:
1. Install `cmem` globally
2. Download the embedding model (~130MB, one-time)
3. Configure MCP server in Claude Code
4. Set up hooks for automatic sync and learning
5. Clean up any old daemon from previous versions

**Upgrading?** Just run the same command — it handles everything automatically.

## Requirements

- **Node.js 18+**
- **Claude Code CLI** (for synthesis features)

## Usage

```bash
cmem                    # Browse sessions in beautiful TUI
cmem --local            # Browse sessions from current folder only
cmem gui                # Launch web-based lesson management UI
cmem stats              # See what's stored
```

## MCP Tools

Claude Code gains these abilities:

| Tool | Description |
|------|-------------|
| `search_and_summarize` | AI-synthesized answers from past sessions |
| `search_sessions` | Find sessions by semantic similarity |
| `search_lessons` | Find learned knowledge for current project |
| `save_lesson` | Manually save important knowledge |
| `validate_lesson` | Mark a lesson as helpful (boosts confidence) |
| `reject_lesson` | Mark a lesson as wrong (reduces confidence) |
| `list_lessons` | Browse all lessons for a project |
| `list_sessions` | Browse recent sessions |
| `get_session` | Retrieve full conversation history |

## How It Works

### Knowledge Injection (Hooks)

When you send a prompt to Claude:

1. **UserPromptSubmit hook** triggers
2. cmem searches for relevant lessons
3. Matching lessons are injected as `<project_knowledge>`
4. Claude sees this context before responding

### Session Sync (Hooks)

When a session ends or compacts:

1. **Stop/PreCompact hook** triggers
2. cmem parses and indexes the session
3. Session is backed up to `~/.cmem/backups/`
4. Session is queued for lesson extraction

### Lesson Synthesis

Sessions in the queue are processed by the synthesis engine:

```bash
cmem synthesize        # Process pending sessions
cmem synthesize -s     # Show queue status
```

The synthesis engine uses Claude (via CLI) to analyze sessions and extract reusable lessons.

## Lesson Confidence System

Each lesson has a confidence score (0-100%):

- **Synthesized lessons** start at 30-70% based on evidence
- **Manual lessons** start at 60%
- **Validation** boosts confidence by 10%
- **Rejection** reduces confidence by 20%
- **Very low confidence** lessons are auto-archived
- **Unused lessons** decay over time

## TUI Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `←/→` or `h/l` | Switch tabs (Global / Projects) |
| `↑/↓` or `j/k` | Navigate |
| `Enter` | Resume session / Open project |
| `s` | Star session (Global) / Sort mode (Projects) |
| `r` | Rename session |
| `R` | Clear custom name |
| `d` | Delete session |
| `/` | Search (Global tab) |
| `Esc` | Back / Cancel |
| `q` | Quit |

## Data Storage

All data is stored locally in `~/.cmem/`:

```
~/.cmem/
├── sessions.db      # SQLite database (sessions, lessons, embeddings)
├── models/          # Downloaded embedding model (~130MB)
└── backups/         # Full copies of all conversation JSONLs
```

## Plugin Architecture

cmem is designed as a Claude Code plugin:

```
.claude-plugin/
├── plugin.json      # Plugin manifest
commands/
├── cmem.md          # /cmem slash command
skills/
└── memory-search/
    └── SKILL.md     # Memory search skill
hooks/
└── hooks.json       # UserPromptSubmit, Stop, PreCompact hooks
.mcp.json            # MCP server configuration
```

## Tech Stack

- **SQLite** + **sqlite-vec** — Embedded vector database
- **transformers.js** + **nomic-embed-text-v1.5** — Local AI embeddings
- **ink** — Beautiful terminal UI (React for CLI)
- **React** + **Vite** + **Tailwind** — Web GUI
- **MCP** — Model Context Protocol for Claude integration
- **Claude Code Hooks** — Event-driven integration (no daemon)

## Upgrading from Previous Versions

If you're upgrading from a version that used the background daemon:

```bash
npx @colbymchenry/cmem
```

The setup wizard will:
- Automatically stop and remove the old daemon
- Configure the new hook-based system
- Your existing sessions and data are preserved

## License

MIT

---

<p align="center">
  <b>Stop losing your best conversations. Start learning from them.</b><br>
  <code>npx @colbymchenry/cmem</code>
</p>
