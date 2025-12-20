/**
 * Session Manager - Persists thread → session mappings using SQLite
 *
 * Each Discord thread maintains a persistent Claude Code session.
 * Sessions can be resumed, forked, or cleared.
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../../data');

export interface Session {
  threadId: string;
  sessionId: string;
  channelId: string;
  directory: string;
  agentAlias: string;
  modelOverride: string | null;
  createdAt: Date;
  lastActiveAt: Date;
  messageCount: number;
}

export class SessionManager {
  private db: Database.Database;

  constructor(dbPath?: string) {
    const fullPath = dbPath || path.join(DATA_DIR, 'sessions.db');
    this.db = new Database(fullPath);
    this.initializeSchema();
  }

  private initializeSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        thread_id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        directory TEXT NOT NULL,
        agent_alias TEXT NOT NULL DEFAULT 'claude',
        model_override TEXT DEFAULT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        last_active_at TEXT NOT NULL DEFAULT (datetime('now')),
        message_count INTEGER NOT NULL DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_channel ON sessions(channel_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_last_active ON sessions(last_active_at);
    `);

    // Migration: Add model_override column if missing (for existing databases)
    const columns = this.db.prepare("PRAGMA table_info(sessions)").all() as { name: string }[];
    const hasModelOverride = columns.some(col => col.name === 'model_override');
    if (!hasModelOverride) {
      this.db.exec('ALTER TABLE sessions ADD COLUMN model_override TEXT DEFAULT NULL');
      console.log('  Migrated sessions table: added model_override column');
    }
  }

  /**
   * Get existing session for a thread, or null if none exists
   */
  getSession(threadId: string): Session | null {
    const row = this.db.prepare(`
      SELECT
        thread_id as threadId,
        session_id as sessionId,
        channel_id as channelId,
        directory,
        agent_alias as agentAlias,
        model_override as modelOverride,
        created_at as createdAt,
        last_active_at as lastActiveAt,
        message_count as messageCount
      FROM sessions
      WHERE thread_id = ?
    `).get(threadId) as (Omit<Session, 'createdAt' | 'lastActiveAt'> & { createdAt: string; lastActiveAt: string }) | undefined;

    if (!row) return null;

    return {
      ...row,
      createdAt: new Date(row.createdAt),
      lastActiveAt: new Date(row.lastActiveAt),
    };
  }

  /**
   * Create a new session for a thread
   */
  createSession(params: {
    threadId: string;
    sessionId: string;
    channelId: string;
    directory: string;
    agentAlias: string;
  }): Session {
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO sessions (thread_id, session_id, channel_id, directory, agent_alias, model_override, created_at, last_active_at, message_count)
      VALUES (?, ?, ?, ?, ?, NULL, ?, ?, 0)
    `).run(
      params.threadId,
      params.sessionId,
      params.channelId,
      params.directory,
      params.agentAlias,
      now,
      now
    );

    return {
      ...params,
      modelOverride: null,
      createdAt: new Date(now),
      lastActiveAt: new Date(now),
      messageCount: 0,
    };
  }

  /**
   * Update session after a message exchange
   */
  updateSessionActivity(threadId: string, newSessionId?: string): void {
    const updates = newSessionId
      ? "session_id = ?, last_active_at = datetime('now'), message_count = message_count + 1"
      : "last_active_at = datetime('now'), message_count = message_count + 1";

    const params = newSessionId ? [newSessionId, threadId] : [threadId];

    this.db.prepare(`
      UPDATE sessions SET ${updates} WHERE thread_id = ?
    `).run(...params);
  }

  /**
   * Clear/reset a session (for /clear command)
   */
  clearSession(threadId: string): void {
    this.db.prepare(`
      DELETE FROM sessions WHERE thread_id = ?
    `).run(threadId);
  }

  /**
   * Update the model override for a session (for /model command)
   */
  updateSessionModel(threadId: string, model: string | null): void {
    this.db.prepare(`
      UPDATE sessions SET model_override = ? WHERE thread_id = ?
    `).run(model, threadId);
  }

  /**
   * Get all sessions for a channel
   */
  getChannelSessions(channelId: string): Session[] {
    const rows = this.db.prepare(`
      SELECT
        thread_id as threadId,
        session_id as sessionId,
        channel_id as channelId,
        directory,
        agent_alias as agentAlias,
        model_override as modelOverride,
        created_at as createdAt,
        last_active_at as lastActiveAt,
        message_count as messageCount
      FROM sessions
      WHERE channel_id = ?
      ORDER BY last_active_at DESC
    `).all(channelId) as (Omit<Session, 'createdAt' | 'lastActiveAt'> & { createdAt: string; lastActiveAt: string })[];

    return rows.map(row => ({
      ...row,
      createdAt: new Date(row.createdAt),
      lastActiveAt: new Date(row.lastActiveAt),
    }));
  }

  /**
   * Get recently active sessions (for cleanup/stats)
   */
  getRecentSessions(limit: number = 10): Session[] {
    const rows = this.db.prepare(`
      SELECT
        thread_id as threadId,
        session_id as sessionId,
        channel_id as channelId,
        directory,
        agent_alias as agentAlias,
        model_override as modelOverride,
        created_at as createdAt,
        last_active_at as lastActiveAt,
        message_count as messageCount
      FROM sessions
      ORDER BY last_active_at DESC
      LIMIT ?
    `).all(limit) as (Omit<Session, 'createdAt' | 'lastActiveAt'> & { createdAt: string; lastActiveAt: string })[];

    return rows.map(row => ({
      ...row,
      createdAt: new Date(row.createdAt),
      lastActiveAt: new Date(row.lastActiveAt),
    }));
  }

  /**
   * Clean up old sessions (sessions inactive for more than N days)
   */
  cleanupOldSessions(daysInactive: number = 30): number {
    const result = this.db.prepare(`
      DELETE FROM sessions
      WHERE last_active_at < datetime('now', '-' || ? || ' days')
    `).run(daysInactive);

    return result.changes;
  }

  /**
   * Close the database connection
   */
  close(): void {
    this.db.close();
  }
}

// Singleton instance
let instance: SessionManager | null = null;

export function getSessionManager(): SessionManager {
  if (!instance) {
    instance = new SessionManager();
  }
  return instance;
}
