import pg from 'pg';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const dataRoot = path.join(projectRoot, 'data');
const defaultSqlitePath = process.env.DATABASE_PATH || path.join(dataRoot, 'study.sqlite');

let pool = null;
let sqliteDb = null;
let activeEngine = 'none';

function sanitizeConnectionUrl(url) {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    if (parsed.password) {
      parsed.password = '****';
    }
    return parsed.toString();
  } catch {
    return 'postgresql://[masked]';
  }
}

export function getDatabaseInfo() {
  if (activeEngine === 'postgres') {
    return {
      type: 'postgres',
      connection: sanitizeConnectionUrl(process.env.DATABASE_URL)
    };
  }
  if (activeEngine === 'sqlite') {
    return {
      type: 'sqlite',
      path: defaultSqlitePath
    };
  }
  return { type: 'uninitialized' };
}

export async function initDatabase() {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (databaseUrl && (databaseUrl.startsWith('postgres://') || databaseUrl.startsWith('postgresql://'))) {
    // ----------------------------------------------------
    // PostgreSQL Mode (Render, Neon, Supabase, etc.)
    // ----------------------------------------------------
    const isLocalhost = databaseUrl.includes('localhost') || databaseUrl.includes('127.0.0.1');
    const sslConfig = isLocalhost ? false : { rejectUnauthorized: false };

    pool = new pg.Pool({
      connectionString: databaseUrl,
      ssl: sslConfig,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000
    });

    pool.on('error', (err) => {
      console.error('[db:pg] Unexpected error on idle PostgreSQL client:', err.message);
    });

    // Test connection and initialize tables
    const client = await pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          email TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS sessions (
          token TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          expires_at TIMESTAMPTZ
        );

        CREATE TABLE IF NOT EXISTS user_progress (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          subject TEXT NOT NULL,
          topic TEXT NOT NULL,
          score INTEGER NOT NULL,
          total_questions INTEGER NOT NULL,
          completed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_id, subject, topic)
        );

        CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
        CREATE INDEX IF NOT EXISTS idx_user_progress_user ON user_progress(user_id);
      `);

      activeEngine = 'postgres';
      console.log(`[db] Initialized PostgreSQL connection: ${sanitizeConnectionUrl(databaseUrl)}`);
    } finally {
      client.release();
    }
    return;
  }

  // ----------------------------------------------------
  // SQLite Fallback Mode (Local offline development)
  // ----------------------------------------------------
  try {
    const { default: Database } = await import('better-sqlite3');
    mkdirSync(path.dirname(defaultSqlitePath), { recursive: true });
    sqliteDb = new Database(defaultSqlitePath);
    sqliteDb.pragma('journal_mode = WAL');
    sqliteDb.pragma('foreign_keys = ON');

    sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        expires_at TEXT
      );

      CREATE TABLE IF NOT EXISTS user_progress (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        subject TEXT NOT NULL,
        topic TEXT NOT NULL,
        score INTEGER NOT NULL,
        total_questions INTEGER NOT NULL,
        completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, subject, topic)
      );
    `);

    const sessionColumns = sqliteDb.pragma('table_info(sessions)');
    if (!sessionColumns.some((col) => col.name === 'expires_at')) {
      sqliteDb.exec('ALTER TABLE sessions ADD COLUMN expires_at TEXT');
    }

    activeEngine = 'sqlite';
    console.log(`[db] Using local SQLite database at: ${defaultSqlitePath}`);
    console.log('[db] Tip: Set DATABASE_URL to connect to managed PostgreSQL (Neon / Supabase / Render).');
  } catch (err) {
    throw new Error(
      `No DATABASE_URL set and failed to load SQLite: ${err.message}. ` +
      'Please configure DATABASE_URL in your environment or .env file.'
    );
  }
}

// ---------------------------------------------------------------------------
// Database Operations
// ---------------------------------------------------------------------------

export async function findUserByEmail(email) {
  const normalizedEmail = email.trim().toLowerCase();
  if (activeEngine === 'postgres') {
    const { rows } = await pool.query(
      'SELECT id, name, email, password_hash, created_at FROM users WHERE email = $1',
      [normalizedEmail]
    );
    return rows[0] || null;
  }
  return sqliteDb.prepare(
    'SELECT id, name, email, password_hash, created_at FROM users WHERE email = ?'
  ).get(normalizedEmail) || null;
}

export async function createUser({ id, name, email, passwordHash }) {
  const normalizedEmail = email.trim().toLowerCase();
  if (activeEngine === 'postgres') {
    await pool.query(
      'INSERT INTO users (id, name, email, password_hash) VALUES ($1, $2, $3, $4)',
      [id, name.trim(), normalizedEmail, passwordHash]
    );
    return;
  }
  sqliteDb.prepare(
    'INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)'
  ).run(id, name.trim(), normalizedEmail, passwordHash);
}

export async function createSession({ token, userId, expiresAt }) {
  if (activeEngine === 'postgres') {
    await pool.query(
      'INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, $3)',
      [token, userId, expiresAt]
    );
    return;
  }
  sqliteDb.prepare(
    'INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)'
  ).run(token, userId, expiresAt);
}

export async function getSessionUser(token) {
  const now = new Date().toISOString();
  if (activeEngine === 'postgres') {
    const { rows } = await pool.query(`
      SELECT u.id, u.name, u.email, s.token, s.expires_at
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.token = $1 AND (s.expires_at IS NULL OR s.expires_at > $2)
    `, [token, now]);
    if (!rows[0]) return null;
    return { id: rows[0].id, name: rows[0].name, email: rows[0].email };
  }

  const row = sqliteDb.prepare(`
    SELECT u.id, u.name, u.email, s.token, s.expires_at
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.token = ? AND (s.expires_at IS NULL OR s.expires_at > ?)
  `).get(token, now);
  if (!row) return null;
  return { id: row.id, name: row.name, email: row.email };
}

export async function deleteSession(token) {
  if (activeEngine === 'postgres') {
    await pool.query('DELETE FROM sessions WHERE token = $1', [token]);
    return;
  }
  sqliteDb.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

export async function getUserProgress(userId) {
  if (activeEngine === 'postgres') {
    const { rows } = await pool.query(`
      SELECT subject, topic, score, total_questions, completed_at
      FROM user_progress
      WHERE user_id = $1
      ORDER BY completed_at DESC
    `, [userId]);
    return rows;
  }
  return sqliteDb.prepare(`
    SELECT subject, topic, score, total_questions, completed_at
    FROM user_progress
    WHERE user_id = ?
    ORDER BY completed_at DESC
  `).all(userId);
}

export async function saveUserProgress({ id, userId, subject, topic, score, total }) {
  if (activeEngine === 'postgres') {
    await pool.query(`
      INSERT INTO user_progress (id, user_id, subject, topic, score, total_questions, completed_at)
      VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id, subject, topic) DO UPDATE SET
        score = EXCLUDED.score,
        total_questions = EXCLUDED.total_questions,
        completed_at = CURRENT_TIMESTAMP
    `, [id, userId, subject, topic, score, total]);
    return;
  }
  sqliteDb.prepare(`
    INSERT INTO user_progress (id, user_id, subject, topic, score, total_questions, completed_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(user_id, subject, topic) DO UPDATE SET
      score = excluded.score,
      total_questions = excluded.total_questions,
      completed_at = datetime('now')
  `).run(id, userId, subject, topic, score, total);
}

export async function getAdminOverview() {
  if (activeEngine === 'postgres') {
    const users = (await pool.query(
      'SELECT id, name, email, created_at FROM users ORDER BY created_at DESC'
    )).rows;
    const sessions = (await pool.query(`
      SELECT s.token, s.user_id, u.name, u.email, s.created_at, s.expires_at 
      FROM sessions s 
      JOIN users u ON s.user_id = u.id
      ORDER BY s.created_at DESC
    `)).rows;
    const progress = (await pool.query(`
      SELECT u.name, u.email, p.subject, p.topic, p.score, p.total_questions, p.completed_at 
      FROM user_progress p 
      JOIN users u ON p.user_id = u.id
      ORDER BY p.completed_at DESC
    `)).rows;
    return { users, sessions, progress };
  }

  const users = sqliteDb.prepare(
    'SELECT id, name, email, created_at FROM users ORDER BY created_at DESC'
  ).all();
  const sessions = sqliteDb.prepare(`
    SELECT s.token, s.user_id, u.name, u.email, s.created_at, s.expires_at 
    FROM sessions s 
    JOIN users u ON s.user_id = u.id
    ORDER BY s.created_at DESC
  `).all();
  const progress = sqliteDb.prepare(`
    SELECT u.name, u.email, p.subject, p.topic, p.score, p.total_questions, p.completed_at 
    FROM user_progress p 
    JOIN users u ON p.user_id = u.id
    ORDER BY p.completed_at DESC
  `).all();
  return { users, sessions, progress };
}

export async function closeDatabase() {
  if (pool) {
    await pool.end();
    pool = null;
  }
  if (sqliteDb) {
    sqliteDb.close();
    sqliteDb = null;
  }
  activeEngine = 'none';
}
