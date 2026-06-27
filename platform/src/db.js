'use strict';

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs   = require('fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'platform.db'));

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS config (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id         TEXT PRIMARY KEY,
    node_id    TEXT NOT NULL,
    node_name  TEXT NOT NULL,
    system_id  TEXT NOT NULL DEFAULT 'banking-system',
    status     TEXT NOT NULL DEFAULT 'open',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS session_evidence (
    session_id TEXT PRIMARY KEY,
    calm_ctx   TEXT,
    logs       TEXT,
    logs_note  TEXT,
    commits    TEXT NOT NULL DEFAULT '[]'
  );

  CREATE TABLE IF NOT EXISTS session_messages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    role       TEXT NOT NULL,
    content    TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS session_prs (
    session_id TEXT NOT NULL,
    pr_url     TEXT NOT NULL,
    branch     TEXT NOT NULL,
    file_path  TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

function prepare(sql) { return db.prepare(sql); }

module.exports = {
  raw: db,
  config: {
    get:  prepare('SELECT value FROM config WHERE key = ?'),
    set:  prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)'),
    list: prepare('SELECT key FROM config'),
  },
  sessions: {
    insert: prepare(`
      INSERT INTO sessions (id, node_id, node_name, system_id)
      VALUES (?, ?, ?, ?)
    `),
    get:    prepare('SELECT * FROM sessions WHERE id = ?'),
    list:   prepare('SELECT * FROM sessions ORDER BY created_at DESC LIMIT 50'),
    updateStatus: prepare(`UPDATE sessions SET status = ?, updated_at = datetime('now') WHERE id = ?`),
  },
  evidence: {
    insert: prepare(`
      INSERT OR REPLACE INTO session_evidence
        (session_id, calm_ctx, logs, logs_note, commits)
      VALUES (?, ?, ?, ?, ?)
    `),
    get: prepare('SELECT * FROM session_evidence WHERE session_id = ?'),
  },
  messages: {
    insert: prepare('INSERT INTO session_messages (session_id, role, content) VALUES (?, ?, ?)'),
    get:    prepare('SELECT * FROM session_messages WHERE session_id = ? ORDER BY id'),
  },
  prs: {
    insert: prepare('INSERT INTO session_prs (session_id, pr_url, branch, file_path) VALUES (?, ?, ?, ?)'),
    get:    prepare('SELECT * FROM session_prs WHERE session_id = ?'),
  },
};
