import Database from 'better-sqlite3';
import { copyFileSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, '..', 'data');
const sqlitePath = path.join(dataDir, 'study.sqlite');
const backupPath = path.join(dataDir, 'study.sqlite.backup');
const jsonBackupPath = path.join(dataDir, 'sqlite-backup.json');

console.log('='.repeat(60));
console.log('  SIWES STUDY APP - DATABASE BACKUP UTILITY');
console.log('='.repeat(60));

if (!existsSync(sqlitePath)) {
  console.error(`[backup] SQLite database file not found at: ${sqlitePath}`);
  process.exit(1);
}

// 1. Binary file backup
try {
  copyFileSync(sqlitePath, backupPath);
  console.log(`[backup] Binary copy saved to: ${backupPath}`);
} catch (err) {
  console.error(`[backup] Error creating binary backup: ${err.message}`);
}

// 2. Structured JSON dump
try {
  const db = new Database(sqlitePath, { readonly: true });
  
  const users = db.prepare('SELECT id, name, email, password_hash, created_at FROM users').all();
  const sessions = db.prepare('SELECT token, user_id, created_at, expires_at FROM sessions').all();
  const progress = db.prepare('SELECT id, user_id, subject, topic, score, total_questions, completed_at FROM user_progress').all();
  
  db.close();

  const exportData = {
    exportedAt: new Date().toISOString(),
    stats: {
      usersCount: users.length,
      sessionsCount: sessions.length,
      progressCount: progress.length
    },
    tables: {
      users,
      sessions,
      user_progress: progress
    }
  };

  writeFileSync(jsonBackupPath, JSON.stringify(exportData, null, 2), 'utf8');
  console.log(`[backup] JSON export saved to: ${jsonBackupPath}`);
  console.log(`[backup] Backed up ${users.length} users, ${sessions.length} sessions, ${progress.length} progress records.`);
  console.log('='.repeat(60));
} catch (err) {
  console.error(`[backup] Error exporting SQLite data to JSON: ${err.message}`);
  process.exit(1);
}
