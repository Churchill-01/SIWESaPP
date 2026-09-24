import express from 'express';
import Database from 'better-sqlite3';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve project paths and runtime settings from the server location.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const clientRoot = path.join(projectRoot, 'client');
const catalogPath = path.join(projectRoot, 'subjects.json');
const dataRoot = path.join(projectRoot, 'data');
const projectEnvPath = path.join(projectRoot, '.env');
const serverEnvPath = path.join(__dirname, '.env');

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  try {
    const raw = readFileSync(filePath, 'utf8');
    const result = {};
    for (const rawLine of raw.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eqIdx = line.indexOf('=');
      if (eqIdx === -1) continue;
      const key = line.slice(0, eqIdx).trim();
      let val = line.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      result[key] = val;
    }
    return result;
  } catch (err) {
    console.warn(`[env] Could not read ${filePath}:`, err.message);
    return {};
  }
}

export function updateEnvFile(filePath, updates) {
  try {
    let lines = [];
    if (existsSync(filePath)) {
      lines = readFileSync(filePath, 'utf8').split(/\r?\n/);
    }
    const updatedKeys = new Set();
    const newLines = lines.map((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return line;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) return line;
      const key = trimmed.slice(0, eqIdx).trim();
      if (key in updates) {
        updatedKeys.add(key);
        return `${key}=${updates[key]}`;
      }
      return line;
    });

    for (const [key, val] of Object.entries(updates)) {
      if (!updatedKeys.has(key)) {
        newLines.push(`${key}=${val}`);
      }
    }

    writeFileSync(filePath, newLines.join('\n'), 'utf8');
  } catch (err) {
    console.error(`[env] Could not write ${filePath}:`, err.message);
  }
}

// Load .env variables into process.env before initializing database or AI
const loadedEnv = {
  ...loadEnvFile(serverEnvPath),
  ...loadEnvFile(projectEnvPath)
};

for (const [key, value] of Object.entries(loadedEnv)) {
  if (process.env[key] === undefined) {
    process.env[key] = value;
  }
}

const PROVIDER_PRESETS = {
  gemini: {
    name: 'Google Gemini',
    url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    model: 'gemini-1.5-flash'
  },
  groq: {
    name: 'Groq',
    url: 'https://api.groq.com/openai/v1/chat/completions',
    model: 'llama-3.3-70b-versatile'
  },
  openai: {
    name: 'OpenAI',
    url: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4o-mini'
  },
  openrouter: {
    name: 'OpenRouter',
    url: 'https://openrouter.ai/api/v1/chat/completions',
    model: 'meta-llama/llama-3.3-70b-instruct:free'
  }
};

const defaultProvider = process.env.ONLINE_AI_PROVIDER || 'gemini';
const defaultPreset = PROVIDER_PRESETS[defaultProvider] || PROVIDER_PRESETS.gemini;

const onlineAiConfig = {
  provider: defaultProvider,
  url: process.env.ONLINE_AI_URL || defaultPreset.url,
  key: process.env.ONLINE_AI_KEY || '',
  model: process.env.ONLINE_AI_MODEL || defaultPreset.model
};

function maskKey(key) {
  if (!key) return '';
  if (key.length <= 8) return '****';
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

const databasePath = process.env.DATABASE_PATH || path.join(dataRoot, 'study.sqlite');
const port = Number(process.env.PORT || 3000);
const scryptAsync = promisify(scrypt);
const SESSION_TTL_DAYS = 30;

// Create the HTTP application and allow local browser clients to connect.
const app = express();
app.use((request, response, next) => {
  const origin = request.get('Origin');
  const isLocalOrigin = !origin
    || origin === 'null'
    || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);

  if (isLocalOrigin) {
    response.set('Access-Control-Allow-Origin', origin || '*');
    response.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    response.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  }

  if (request.method === 'OPTIONS') {
    response.sendStatus(isLocalOrigin ? 204 : 403);
    return;
  }

  next();
});
app.use(express.json());

let catalogCache;
// Ensure the database directory exists before opening SQLite.
fs.mkdirSync('/var/data/uploads', { recursive: true });
const database = new Database(databasePath);
database.pragma('journal_mode = WAL');
database.pragma('foreign_keys = ON');

// Create user, session, and progress tables on first launch.
database.exec(`
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

// Ensure sessions table has expires_at column if created by an older version.
const sessionColumns = database.pragma('table_info(sessions)');
if (!sessionColumns.some((col) => col.name === 'expires_at')) {
  database.exec('ALTER TABLE sessions ADD COLUMN expires_at TEXT');
}

async function readCatalog() {
  // Read and cache the static subject catalog for repeated API requests.
  if (!catalogCache) {
    const contents = await readFile(catalogPath, 'utf8');
    catalogCache = JSON.parse(contents);
  }
  return catalogCache;
}

function createToken() {
  // Generate an opaque random session token.
  return randomBytes(32).toString('hex');
}

function sanitizeUser(user) {
  // Return public user fields without exposing the password hash.
  return {
    id: user.id,
    name: user.name,
    email: user.email
  };
}

async function hashPassword(password) {
  // Hash a password with a per-user salt before storing it.
  const salt = randomBytes(16).toString('hex');
  const derivedKey = await scryptAsync(password, salt, 64);
  return `${salt}:${derivedKey.toString('hex')}`;
}

async function verifyPassword(password, storedHash) {
  // Compare a supplied password against the stored salted hash.
  const [salt, key] = storedHash.split(':');
  if (!salt || !key) return false;

  const derivedKey = await scryptAsync(password, salt, 64);
  const storedKey = Buffer.from(key, 'hex');
  return storedKey.length === derivedKey.length && timingSafeEqual(storedKey, derivedKey);
}

function createSession(user) {
  // Store a token linked to the user with an expiration timestamp and return it.
  const token = createToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  database.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, user.id, expiresAt);
  return token;
}

function extractToken(request) {
  const authHeader = request.get('Authorization') || '';
  const match = authHeader.match(/^Bearer\s+([a-f0-9]+)$/i);
  return match ? match[1] : null;
}

function getSessionUser(token) {
  if (!token) return null;
  const now = new Date().toISOString();
  const row = database.prepare(`
    SELECT u.id, u.name, u.email, s.token, s.expires_at
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.token = ? AND (s.expires_at IS NULL OR s.expires_at > ?)
  `).get(token, now);
  return row ? { id: row.id, name: row.name, email: row.email } : null;
}

function requireAuth(request, response, next) {
  const token = extractToken(request);
  if (!token) {
    response.status(401).json({ error: 'Authentication required' });
    return;
  }
  const user = getSessionUser(token);
  if (!user) {
    response.status(401).json({ error: 'Invalid or expired session token' });
    return;
  }
  request.user = user;
  request.token = token;
  next();
}

function optionalAuth(request, _response, next) {
  const token = extractToken(request);
  if (token) {
    request.user = getSessionUser(token);
    request.token = token;
  }
  next();
}

// In-memory sliding window rate limiter
function createRateLimiter(windowMs, maxRequests, message = 'Too many requests, please try again later.') {
  const clients = new Map();

  return (request, response, next) => {
    const ip = request.ip || request.socket.remoteAddress || '127.0.0.1';
    const now = Date.now();
    const clientData = clients.get(ip) || { count: 0, resetTime: now + windowMs };

    if (now > clientData.resetTime) {
      clientData.count = 1;
      clientData.resetTime = now + windowMs;
    } else {
      clientData.count += 1;
    }

    clients.set(ip, clientData);

    if (clients.size > 2000) {
      for (const [key, val] of clients.entries()) {
        if (now > val.resetTime) clients.delete(key);
      }
    }

    if (clientData.count > maxRequests) {
      response.status(429).json({ error: message });
      return;
    }

    next();
  };
}

const authRateLimiter = createRateLimiter(60 * 1000, 15, 'Too many login or registration attempts. Please wait a minute.');
const aiRateLimiter = createRateLimiter(60 * 1000, 20, 'AI tutor request limit reached. Please wait a minute.');

// Email validation helper
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Lightweight health endpoint for local server checks.
app.get('/api/health', (_request, response) => {
  response.json({ status: 'ok', mode: 'local-first' });
});

// Explicit route to serve subjects.json with correct application/json header for Service Worker caching
app.get('/subjects.json', (_request, response) => {
  response.sendFile(catalogPath);
});

// Expose online AI status so the client knows if a live provider is connected.
app.get('/api/ai/status', (_request, response) => {
  response.json({
    configured: Boolean(onlineAiConfig.key),
    provider: onlineAiConfig.provider,
    model: onlineAiConfig.model,
    url: onlineAiConfig.url,
    maskedKey: maskKey(onlineAiConfig.key)
  });
});

// Configure or test an online AI provider and persist key to .env.
app.post('/api/ai/config', async (request, response) => {
  try {
    const { provider = 'gemini', key = '', url, model } = request.body || {};
    const trimmedKey = String(key || '').trim();

    // If clearing key:
    if (!trimmedKey) {
      onlineAiConfig.key = '';
      updateEnvFile(projectEnvPath, { ONLINE_AI_KEY: '' });
      response.json({
        success: true,
        configured: false,
        message: 'Online AI key cleared. The tutor will now operate using local offline curriculum intelligence.'
      });
      return;
    }

    const preset = PROVIDER_PRESETS[provider];
    const targetUrl = (url && String(url).trim()) || preset?.url || onlineAiConfig.url;
    const targetModel = (model && String(model).trim()) || preset?.model || onlineAiConfig.model;

    // Test upstream connection with the key by making a minimal test call
    const testResponse = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${trimmedKey}`
      },
      body: JSON.stringify({
        model: targetModel,
        messages: [{ role: 'user', content: 'Say "OK"' }],
        max_tokens: 5
      })
    });

    if (!testResponse.ok) {
      let detail = `Provider returned HTTP ${testResponse.status}`;
      try {
        const errorBody = await testResponse.json();
        detail = errorBody?.error?.message || errorBody?.message || detail;
      } catch {}
      response.status(400).json({
        error: `Could not verify API key with ${preset?.name || provider}: ${detail}`
      });
      return;
    }

    // Key is verified. Update server runtime config and save to .env
    onlineAiConfig.provider = provider;
    onlineAiConfig.url = targetUrl;
    onlineAiConfig.key = trimmedKey;
    onlineAiConfig.model = targetModel;

    updateEnvFile(projectEnvPath, {
      ONLINE_AI_PROVIDER: provider,
      ONLINE_AI_URL: targetUrl,
      ONLINE_AI_MODEL: targetModel,
      ONLINE_AI_KEY: trimmedKey
    });

    response.json({
      success: true,
      configured: true,
      provider,
      model: targetModel,
      maskedKey: maskKey(trimmedKey),
      message: `Successfully connected to ${preset?.name || provider} (${targetModel})!`
    });
  } catch (error) {
    response.status(500).json({ error: `Failed to configure AI: ${error.message}` });
  }
});

// Proxy the optional online tutor with optional auth, rate limiting, and intelligent curriculum context resolution.
app.post('/api/ai/online', optionalAuth, aiRateLimiter, async (request, response, next) => {
  try {
    const question = String(request.body?.question || '').trim();
    if (!question) {
      response.status(400).json({ error: 'A question is required.' });
      return;
    }
    if (question.length > 500) {
      response.status(400).json({ error: 'Question is too long (maximum 500 characters).' });
      return;
    }
    if (!onlineAiConfig.key) {
      response.status(503).json({ error: 'Online tutor is not configured with an API key.' });
      return;
    }

    const catalog = await readCatalog();
    const requestedSubject = String(request.body?.subject || '').trim();
    const requestedTopic = String(request.body?.topic || '').trim();

    // Check if the explicitly requested record exists
    let record = (catalog.records || []).find((item) => (
      item.subject === requestedSubject && item.topic === requestedTopic
    ));

    // If requested record does not match or user question suggests another topic, resolve closest matching curriculum record
    const qLower = question.toLowerCase();
    const matchedRecord = (catalog.records || []).find((item) => (
      qLower.includes(item.topic.toLowerCase()) ||
      (item.subtopics || []).some((st) => qLower.includes(st.toLowerCase()))
    ));

    if (matchedRecord) {
      record = matchedRecord;
    }

    const curriculum = record ? JSON.stringify({
      subject: record.subject,
      topic: record.topic,
      subtopics: record.subtopics,
      lesson: record.lesson,
      practice_questions: record.practice_questions
    }) : 'No matching lesson was selected.';

    const upstream = await fetch(onlineAiConfig.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${onlineAiConfig.key}`
      },
      body: JSON.stringify({
        model: onlineAiConfig.model,
        temperature: 0.3,
        messages: [
          {
            role: 'system',
            content: 'You are an educational tutor for secondary school students. Answer the student\'s question clearly, encouragingly, and accurately using the curriculum context when available. If the curriculum does not cover the topic, answer accurately using standard secondary school syllabus facts. Be concise, well-structured, and easy to understand.'
          },
          {
            role: 'user',
            content: `--- BEGIN CURRICULUM CONTEXT ---\n${curriculum}\n--- END CURRICULUM CONTEXT ---\n\nStudent question:\n${question}`
          }
        ]
      })
    });

    if (!upstream.ok) {
      let detail = `Provider returned HTTP ${upstream.status}`;
      try {
        const errorBody = await upstream.json();
        detail = errorBody?.error?.message || errorBody?.message || detail;
      } catch {}
      response.status(502).json({ error: `Online AI error: ${detail}` });
      return;
    }

    const payload = await upstream.json();
    const answer = payload.choices?.[0]?.message?.content?.trim();
    if (!answer) {
      response.status(502).json({ error: 'Online tutor returned an empty answer.' });
      return;
    }

    response.json({
      answer,
      model: onlineAiConfig.model,
      provider: onlineAiConfig.provider,
      context: {
        subject: record?.subject || requestedSubject,
        topic: record?.topic || requestedTopic
      }
    });
  } catch (error) {
    next(error);
  }
});

// Register a user and create the first session for the new account with validation and rate limiting.
app.post('/api/auth/register', authRateLimiter, async (request, response, next) => {
  const { name, email, password } = request.body || {};
  const trimmedName = String(name || '').trim();
  const trimmedEmail = String(email || '').trim().toLowerCase();
  const trimmedPassword = String(password || '');

  if (!trimmedName || trimmedName.length < 2) {
    response.status(400).json({ error: 'Please enter your full name (at least 2 characters).' });
    return;
  }
  if (!trimmedEmail || !EMAIL_REGEX.test(trimmedEmail)) {
    response.status(400).json({ error: 'Please provide a valid email address.' });
    return;
  }
  if (!trimmedPassword || trimmedPassword.length < 6) {
    response.status(400).json({ error: 'Password must be at least 6 characters long.' });
    return;
  }

  const existingUser = database.prepare('SELECT id FROM users WHERE email = ?').get(trimmedEmail);
  if (existingUser) {
    response.status(409).json({ error: 'An account with this email already exists.' });
    return;
  }

  try {
    const user = {
      id: randomUUID(),
      name: trimmedName,
      email: trimmedEmail
    };
    const passwordHash = await hashPassword(trimmedPassword);
    database.prepare(
      'INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)'
    ).run(user.id, user.name, user.email, passwordHash);

    response.status(201).json({
      token: createSession(user),
      user: sanitizeUser(user)
    });
  } catch (error) {
    next(error);
  }
});

// Authenticate a user with email and password with rate limiting.
app.post('/api/auth/login', authRateLimiter, async (request, response, next) => {
  const { email, password } = request.body || {};
  const trimmedEmail = String(email || '').trim().toLowerCase();
  const trimmedPassword = String(password || '');

  if (!trimmedEmail || !trimmedPassword) {
    response.status(400).json({ error: 'Email and password are required.' });
    return;
  }

  try {
    const user = database.prepare(
      'SELECT id, name, email, password_hash FROM users WHERE email = ?'
    ).get(trimmedEmail);
    const passwordMatches = user && await verifyPassword(trimmedPassword, user.password_hash);

    if (!passwordMatches) {
      response.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    response.json({
      token: createSession(user),
      user: sanitizeUser(user)
    });
  } catch (error) {
    next(error);
  }
});

// End the current session and remove the token.
app.post('/api/auth/logout', requireAuth, (request, response) => {
  database.prepare('DELETE FROM sessions WHERE token = ?').run(request.token);
  response.json({ message: 'Logged out successfully.' });
});

// Return current authenticated user profile.
app.get('/api/auth/me', requireAuth, (request, response) => {
  response.json({ user: request.user });
});

// Retrieve student's saved quiz progress.
app.get('/api/progress', requireAuth, (request, response, next) => {
  try {
    const records = database.prepare(`
      SELECT subject, topic, score, total_questions, completed_at
      FROM user_progress
      WHERE user_id = ?
      ORDER BY completed_at DESC
    `).all(request.user.id);
    response.json({ progress: records });
  } catch (error) {
    next(error);
  }
});

// Record or update a student's quiz progress for a subject and topic.
app.post('/api/progress', requireAuth, (request, response, next) => {
  try {
    const { subject, topic, score, total } = request.body || {};
    const trimmedSubject = String(subject || '').trim();
    const trimmedTopic = String(topic || '').trim();
    const numScore = Number(score);
    const numTotal = Number(total);

    if (!trimmedSubject || !trimmedTopic || isNaN(numScore) || isNaN(numTotal)) {
      response.status(400).json({ error: 'Subject, topic, score, and total are required.' });
      return;
    }

    database.prepare(`
      INSERT INTO user_progress (id, user_id, subject, topic, score, total_questions, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(user_id, subject, topic) DO UPDATE SET
        score = excluded.score,
        total_questions = excluded.total_questions,
        completed_at = datetime('now')
    `).run(randomUUID(), request.user.id, trimmedSubject, trimmedTopic, numScore, numTotal);

    response.json({
      status: 'ok',
      subject: trimmedSubject,
      topic: trimmedTopic,
      score: numScore,
      total: numTotal
    });
  } catch (error) {
    next(error);
  }
});

// Return the complete catalog used by the client.
app.get('/api/catalog', async (_request, response, next) => {
  try {
    response.json(await readCatalog());
  } catch (error) {
    next(error);
  }
});

// Return only the catalog subject names.
app.get('/api/subjects', async (_request, response, next) => {
  try {
    const catalog = await readCatalog();
    response.json({ subjects: catalog.subjects || [] });
  } catch (error) {
    next(error);
  }
});

// Return all topics belonging to one subject.
app.get('/api/subjects/:subject/topics', async (request, response, next) => {
  try {
    const catalog = await readCatalog();
    const subject = decodeURIComponent(request.params.subject);
    const records = (catalog.records || []).filter((record) => record.subject === subject);
    response.json({
      subject,
      topics: records.map((record) => ({ id: record.id, topic: record.topic }))
    });
  } catch (error) {
    next(error);
  }
});

// Return the full lesson record for one subject and topic.
app.get('/api/subjects/:subject/topics/:topic', async (request, response, next) => {
  try {
    const catalog = await readCatalog();
    const subject = decodeURIComponent(request.params.subject);
    const topic = decodeURIComponent(request.params.topic);
    const record = (catalog.records || []).find((item) => item.subject === subject && item.topic === topic);

    if (!record) {
      response.status(404).json({ error: 'Topic not found' });
      return;
    }

    response.json(record);
  } catch (error) {
    next(error);
  }
});

// Local developer inspection endpoint to view accounts, sessions, and progress in browser
app.get('/api/admin/overview', (request, response) => {
  const ip = request.ip || request.socket.remoteAddress || '';
  const isLocal = ['127.0.0.1', '::1', '::ffff:127.0.0.1', 'localhost'].includes(request.hostname)
    || ip.includes('127.0.0.1') || ip === '::1';

  if (!isLocal) {
    response.status(403).json({ error: 'Access restricted to localhost' });
    return;
  }

  const users = database.prepare('SELECT id, name, email, created_at FROM users ORDER BY created_at DESC').all();
  const sessions = database.prepare(`
    SELECT s.token, s.user_id, u.name, u.email, s.created_at, s.expires_at 
    FROM sessions s 
    JOIN users u ON s.user_id = u.id
    ORDER BY s.created_at DESC
  `).all();
  const progress = database.prepare(`
    SELECT u.name, u.email, p.subject, p.topic, p.score, p.total_questions, p.completed_at 
    FROM user_progress p 
    JOIN users u ON p.user_id = u.id
    ORDER BY p.completed_at DESC
  `).all();

  response.json({
    databasePath,
    totalUsers: users.length,
    totalSessions: sessions.length,
    users,
    sessions,
    progress
  });
});

// Serve the static client after API routes have been registered.
app.use(express.static(clientRoot));

// Explicit routes for the dedicated authentication and onboarding page.
app.get(['/auth', '/login', '/signup', '/auth.html'], (_request, response) => {
  response.sendFile(path.join(clientRoot, 'auth.html'));
});

// Support client-side screen routing by serving the app shell.
app.use((_request, response) => {
  response.sendFile(path.join(clientRoot, 'index.html'));
});

// Convert unexpected errors into a stable JSON response.
app.use((error, _request, response, _next) => {
  console.error(error);
  response.status(500).json({ error: error.message || 'Internal server error' });
});

// Start the local-first HTTP server.
app.listen(port, () => {
  console.log(`Local-first study app running at http://localhost:${port}`);
});
