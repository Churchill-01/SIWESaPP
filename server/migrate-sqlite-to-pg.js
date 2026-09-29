import pg from 'pg';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const dataDir = path.join(projectRoot, 'data');
const sqlitePath = path.join(dataDir, 'study.sqlite');
const jsonBackupPath = path.join(dataDir, 'sqlite-backup.json');

// Helper to load .env variables if not already set
function loadEnv() {
  const envPaths = [path.join(projectRoot, '.env'), path.join(__dirname, '.env')];
  for (const envPath of envPaths) {
    if (existsSync(envPath)) {
      try {
        const raw = readFileSync(envPath, 'utf8');
        for (const line of raw.split(/\r?\n/)) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const eq = trimmed.indexOf('=');
          if (eq === -1) continue;
          const k = trimmed.slice(0, eq).trim();
          let v = trimmed.slice(eq + 1).trim();
          if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
            v = v.slice(1, -1);
          }
          if (!process.env[k]) {
            process.env[k] = v;
          }
        }
      } catch {}
    }
  }
}

loadEnv();

const targetUrl = process.argv[2] || process.env.DATABASE_URL;

console.log('='.repeat(65));
console.log('  SIWES STUDY APP - SQLITE TO POSTGRESQL MIGRATION');
console.log('='.repeat(65));

if (!targetUrl) {
  console.error('\n❌ ERROR: No target PostgreSQL connection string provided.');
  console.error('\nUsage:');
  console.error('  node migrate-sqlite-to-pg.js "postgresql://user:password@host/database"');
  console.error('  or set DATABASE_URL in your .env or environment.\n');
  console.error('Example (Neon / Supabase / Render):');
  console.error('  node migrate-sqlite-to-pg.js "postgresql://neondb_owner:xyz@ep-cool-fog.us-east-2.aws.neon.tech/neondb?sslmode=require"\n');
  process.exit(1);
}

// 1. Gather source data
let users = [];
let sessions = [];
let progress = [];

if (existsSync(jsonBackupPath)) {
  try {
    const raw = JSON.parse(readFileSync(jsonBackupPath, 'utf8'));
    users = raw.tables?.users || [];
    sessions = raw.tables?.sessions || [];
    progress = raw.tables?.user_progress || [];
    console.log(`[source] Loaded ${users.length} users, ${sessions.length} sessions, ${progress.length} progress records from JSON backup.`);
  } catch (err) {
    console.warn(`[source] Could not read JSON backup (${err.message}). Trying SQLite file...`);
  }
}

if (users.length === 0 && existsSync(sqlitePath)) {
  try {
    const { default: Database } = await import('better-sqlite3');
    const db = new Database(sqlitePath, { readonly: true });
    users = db.prepare('SELECT id, name, email, password_hash, created_at FROM users').all();
    sessions = db.prepare('SELECT token, user_id, created_at, expires_at FROM sessions').all();
    progress = db.prepare('SELECT id, user_id, subject, topic, score, total_questions, completed_at FROM user_progress').all();
    db.close();
    console.log(`[source] Loaded ${users.length} users, ${sessions.length} sessions, ${progress.length} progress records directly from SQLite.`);
  } catch (err) {
    console.error(`[source] Failed to read SQLite database: ${err.message}`);
  }
}

if (users.length === 0 && sessions.length === 0 && progress.length === 0) {
  console.log('[source] Note: No existing SQLite records found to migrate. Tables will still be initialized.');
}

// 2. Connect to PostgreSQL
const isLocalhost = targetUrl.includes('localhost') || targetUrl.includes('127.0.0.1');
const sslConfig = isLocalhost ? false : { rejectUnauthorized: false };

const client = new pg.Client({
  connectionString: targetUrl,
  ssl: sslConfig
});

try {
  await client.connect();
  console.log('✅ Connected successfully to PostgreSQL.');

  // 3. Create schema
  console.log('[schema] Creating PostgreSQL tables and indexes...');
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
  console.log('✅ PostgreSQL schema verified.');

  // 4. Migrate users
  let migratedUsers = 0;
  for (const u of users) {
    await client.query(`
      INSERT INTO users (id, name, email, password_hash, created_at)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        email = EXCLUDED.email,
        password_hash = EXCLUDED.password_hash
    `, [u.id, u.name, u.email.toLowerCase(), u.password_hash, u.created_at ? new Date(u.created_at) : new Date()]);
    migratedUsers++;
  }
  console.log(`✅ Migrated ${migratedUsers} user accounts.`);

  // 5. Migrate sessions
  let migratedSessions = 0;
  for (const s of sessions) {
    await client.query(`
      INSERT INTO sessions (token, user_id, created_at, expires_at)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (token) DO UPDATE SET
        expires_at = EXCLUDED.expires_at
    `, [
      s.token,
      s.user_id,
      s.created_at ? new Date(s.created_at) : new Date(),
      s.expires_at ? new Date(s.expires_at) : null
    ]);
    migratedSessions++;
  }
  console.log(`✅ Migrated ${migratedSessions} user sessions.`);

  // 6. Migrate user progress
  let migratedProgress = 0;
  for (const p of progress) {
    await client.query(`
      INSERT INTO user_progress (id, user_id, subject, topic, score, total_questions, completed_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (user_id, subject, topic) DO UPDATE SET
        score = EXCLUDED.score,
        total_questions = EXCLUDED.total_questions,
        completed_at = EXCLUDED.completed_at
    `, [
      p.id,
      p.user_id,
      p.subject,
      p.topic,
      p.score,
      p.total_questions,
      p.completed_at ? new Date(p.completed_at) : new Date()
    ]);
    migratedProgress++;
  }
  console.log(`✅ Migrated ${migratedProgress} quiz progress records.`);

  // 7. Verify counts in Postgres
  const userCount = await client.query('SELECT COUNT(*) FROM users');
  const sessionCount = await client.query('SELECT COUNT(*) FROM sessions');
  const progressCount = await client.query('SELECT COUNT(*) FROM user_progress');

  console.log('\n📊 Current PostgreSQL Database Totals:');
  console.log(`   - Users:         ${userCount.rows[0].count}`);
  console.log(`   - Sessions:      ${sessionCount.rows[0].count}`);
  console.log(`   - Quiz Progress: ${progressCount.rows[0].count}`);
  console.log('\n🎉 Migration completed successfully!');
  console.log('='.repeat(65));
} catch (err) {
  console.error('\n❌ Migration failed:', err.message);
} finally {
  await client.end();
}
