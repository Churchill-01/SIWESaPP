import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '..', 'data', 'study.sqlite');
const db = new Database(dbPath);

console.log('='.repeat(65));
console.log('  SIWES STUDY APP - DATABASE & BACKEND VIEWER');
console.log('  Database File:', dbPath);
console.log('='.repeat(65));

// 1. Accounts Created
console.log('\n📌 1. ACCOUNTS CREATED (users table):');
const users = db.prepare('SELECT id, name, email, created_at FROM users ORDER BY created_at DESC').all();
if (users.length === 0) {
  console.log('   (No user accounts created yet)');
} else {
  console.table(users);
}

// 2. Active Sessions
console.log('\n📌 2. SESSIONS (sessions table):');
const sessions = db.prepare(`
  SELECT s.token, u.name, u.email, s.created_at, s.expires_at 
  FROM sessions s 
  JOIN users u ON s.user_id = u.id
  ORDER BY s.created_at DESC
`).all();
if (sessions.length === 0) {
  console.log('   (No active sessions found)');
} else {
  console.table(sessions);
}

// 3. User Quiz Progress
console.log('\n📌 3. USER QUIZ SCORES & PROGRESS (user_progress table):');
const progress = db.prepare(`
  SELECT u.name, p.subject, p.topic, (p.score || ' / ' || p.total_questions) AS score, p.completed_at 
  FROM user_progress p 
  JOIN users u ON p.user_id = u.id
  ORDER BY p.completed_at DESC
`).all();
if (progress.length === 0) {
  console.log('   (No quiz scores recorded yet)');
} else {
  console.table(progress);
}

console.log('='.repeat(65) + '\n');
