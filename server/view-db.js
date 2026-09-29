import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as db from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

// Load environment variables (.env) if present
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

try {
  await db.initDatabase();
  const dbInfo = db.getDatabaseInfo();

  console.log('='.repeat(65));
  console.log('  SIWES STUDY APP - DATABASE VIEWER');
  console.log(`  Engine:   ${dbInfo.type.toUpperCase()}`);
  console.log(`  Target:   ${dbInfo.connection || dbInfo.path || 'Unknown'}`);
  console.log('='.repeat(65));

  const { users, sessions, progress } = await db.getAdminOverview();

  // 1. Accounts Created
  console.log('\n📌 1. ACCOUNTS CREATED (users table):');
  if (users.length === 0) {
    console.log('   (No user accounts created yet)');
  } else {
    console.table(users);
  }

  // 2. Active Sessions
  console.log('\n📌 2. SESSIONS (sessions table):');
  if (sessions.length === 0) {
    console.log('   (No active sessions found)');
  } else {
    console.table(sessions);
  }

  // 3. User Quiz Progress
  console.log('\n📌 3. USER QUIZ SCORES & PROGRESS (user_progress table):');
  if (progress.length === 0) {
    console.log('   (No quiz scores recorded yet)');
  } else {
    console.table(progress.map((p) => ({
      name: p.name,
      email: p.email,
      subject: p.subject,
      topic: p.topic,
      score: `${p.score} / ${p.total_questions}`,
      completed_at: p.completed_at
    })));
  }

  console.log('='.repeat(65) + '\n');
} catch (err) {
  console.error('Failed to view database:', err.message);
} finally {
  await db.closeDatabase();
}
