import { createClient } from '@libsql/client';
import bcrypt from 'bcryptjs';
import 'dotenv/config';

// ─── Turso client ─────────────────────────────────────────────────────────────
// Falls back to a local SQLite file when TURSO_URL is not set (great for dev).
export const db = createClient({
  url:       process.env.TURSO_URL || 'file:neuron.db',
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// ─── Schema ───────────────────────────────────────────────────────────────────
export async function initSchema() {
  const stmts = [
    // Users
    `CREATE TABLE IF NOT EXISTS users (
       username     TEXT PRIMARY KEY,
       password     TEXT NOT NULL,
       role         TEXT NOT NULL DEFAULT 'user',
       banned       INTEGER NOT NULL DEFAULT 0,
       banned_until TEXT,
       created_at   TEXT NOT NULL DEFAULT (datetime('now'))
     )`,

    // Messages (general + staff channels)
    `CREATE TABLE IF NOT EXISTS messages (
       id        TEXT PRIMARY KEY,
       channel   TEXT NOT NULL DEFAULT 'general',
       author    TEXT NOT NULL,
       content   TEXT NOT NULL,
       type      TEXT NOT NULL DEFAULT 'text',
       media_url TEXT,
       link_url  TEXT,
       timestamp TEXT NOT NULL DEFAULT (datetime('now')),
       reply_to  TEXT,
       pinned    INTEGER NOT NULL DEFAULT 0,
       deleted   INTEGER NOT NULL DEFAULT 0
     )`,

    // Composite PK ensures one reaction-type per user per message.
    // Toggle is handled by DELETE + INSERT.
    `CREATE TABLE IF NOT EXISTS reactions (
       message_id TEXT NOT NULL,
       username   TEXT NOT NULL,
       type       TEXT NOT NULL,
       PRIMARY KEY (message_id, username)
     )`,

    // Announcements
    `CREATE TABLE IF NOT EXISTS announcements (
       id        TEXT PRIMARY KEY,
       text      TEXT NOT NULL,
       author    TEXT NOT NULL,
       timestamp TEXT NOT NULL DEFAULT (datetime('now'))
     )`,

    // Reports
    `CREATE TABLE IF NOT EXISTS reports (
       id        TEXT PRIMARY KEY,
       msg_id    TEXT,
       reporter  TEXT NOT NULL,
       reason    TEXT NOT NULL,
       timestamp TEXT NOT NULL DEFAULT (datetime('now')),
       status    TEXT NOT NULL DEFAULT 'pending',
       priority  INTEGER NOT NULL DEFAULT 0
     )`,
  ];

  for (const sql of stmts) {
    await db.execute(sql);
  }
}

// ─── Seed accounts ────────────────────────────────────────────────────────────
// Passwords are hashed. Roles are always enforced on startup so they can't
// be permanently altered by a DB edit without restarting the server.
const SEEDS = [
  { username: 'FTO_Ray',  password: 'FTORay#2024',   role: 'owner'   },
  { username: 'AMGProdZ', password: 'AMGProdZ#2024', role: 'supreme' },
];

export async function seedAccounts() {
  for (const s of SEEDS) {
    const row = (await db.execute({
      sql:  'SELECT username FROM users WHERE username = ?',
      args: [s.username],
    })).rows[0];

    if (!row) {
      const hash = await bcrypt.hash(s.password, 10);
      await db.execute({
        sql:  'INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
        args: [s.username, hash, s.role],
      });
    } else {
      // Always re-enforce the seeded role on startup.
      await db.execute({
        sql:  'UPDATE users SET role = ? WHERE username = ?',
        args: [s.role, s.username],
      });
    }
  }
}
