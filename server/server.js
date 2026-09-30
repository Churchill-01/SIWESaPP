import express from 'express';
import * as db from './db.js';
import { mkdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import https from 'node:https';
import dns from 'node:dns';

// Resolve IPv4 first to prevent Node.js Undici connect timeouts on Windows
try {
  dns.setDefaultResultOrder('ipv4first');
} catch {}

function postJsonHttps(urlStr, headers, bodyObj, timeoutMs = 25000) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(urlStr);
    const postData = JSON.stringify(bodyObj);

    const req = https.request(parsedUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        ...headers
      },
      timeout: timeoutMs
    }, (res) => {
      let rawData = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { rawData += chunk; });
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(rawData);
        } catch {}
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          json: async () => json || {},
          text: async () => rawData
        });
      });
    });

    req.on('timeout', () => {
      req.destroy(new Error(`Connection timed out after ${timeoutMs / 1000}s`));
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.write(postData);
    req.end();
  });
}

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
    model: 'gemini-flash-lite-latest'
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


// Automatically detect provider from available API keys if not explicitly set
const detectedProvider = process.env.ONLINE_AI_PROVIDER
  || (process.env.GROQ_API_KEY ? 'groq' : null)
  || (process.env.OPENAI_API_KEY ? 'openai' : null)
  || (process.env.OPENROUTER_API_KEY ? 'openrouter' : null)
  || (process.env.GEMINI_API_KEY ? 'gemini' : null)
  || 'gemini';

const defaultPreset = PROVIDER_PRESETS[detectedProvider] || PROVIDER_PRESETS.gemini;

const resolvedAiKey = (
  process.env.ONLINE_AI_KEY
  || process.env.GEMINI_API_KEY
  || process.env.GROQ_API_KEY
  || process.env.OPENAI_API_KEY
  || process.env.OPENROUTER_API_KEY
  || process.env.AI_API_KEY
  || ''
).trim();

const onlineAiConfig = {
  provider: detectedProvider,
  url: process.env.ONLINE_AI_URL || defaultPreset.url,
  key: resolvedAiKey,
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

let catalogCache = null;
let catalogMtime = 0;
// Initialize database (PostgreSQL if DATABASE_URL is set, otherwise SQLite fallback)
await db.initDatabase();

async function readCatalog() {
  // Read and cache the subject catalog, reloading automatically if the file on disk is modified.
  try {
    const stats = statSync(catalogPath);
    if (!catalogCache || stats.mtimeMs > catalogMtime) {
      const contents = await readFile(catalogPath, 'utf8');
      catalogCache = JSON.parse(contents);
      catalogMtime = stats.mtimeMs;
      console.log(`[catalog] Loaded fresh catalog from disk (${catalogCache.records?.length || 0} records).`);
    }
  } catch (err) {
    if (!catalogCache) {
      const contents = await readFile(catalogPath, 'utf8');
      catalogCache = JSON.parse(contents);
    }
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

async function createSession(user) {
  // Store a token linked to the user with an expiration timestamp and return it.
  const token = createToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await db.createSession({ token, userId: user.id, expiresAt });
  return token;
}

function extractToken(request) {
  const authHeader = request.get('Authorization') || '';
  const match = authHeader.match(/^Bearer\s+([a-f0-9]+)$/i);
  return match ? match[1] : null;
}

async function getSessionUser(token) {
  if (!token) return null;
  return await db.getSessionUser(token);
}

async function requireAuth(request, response, next) {
  try {
    const token = extractToken(request);
    if (!token) {
      response.status(401).json({ error: 'Authentication required' });
      return;
    }
    const user = await getSessionUser(token);
    if (!user) {
      response.status(401).json({ error: 'Invalid or expired session token' });
      return;
    }
    request.user = user;
    request.token = token;
    next();
  } catch (err) {
    next(err);
  }
}

async function optionalAuth(request, _response, next) {
  try {
    const token = extractToken(request);
    if (token) {
      request.user = await getSessionUser(token);
      request.token = token;
    }
    next();
  } catch (err) {
    next(err);
  }
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

// Lightweight health endpoint for server checks.
app.get('/api/health', (_request, response) => {
  response.json({
    status: 'ok',
    mode: 'local-first',
    database: db.getDatabaseInfo().type
  });
});

// Explicit route to serve subjects.json with correct application/json header for Service Worker caching
app.get('/subjects.json', (_request, response) => {
  response.set('Cache-Control', 'no-cache, no-store, must-revalidate');
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

// Public AI key configuration is disabled.
// The API key is set server-side by the administrator for all students and public users.
app.post('/api/ai/config', (_request, response) => {
  response.status(403).json({
    error: 'Public AI key configuration is disabled. The API key is managed server-side by the administrator.'
  });
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

    const curriculum = record ? [
      `Subject: ${record.subject}`,
      `Topic: ${record.topic}`,
      record.subtopics?.length ? `Subtopics: ${record.subtopics.join(', ')}` : '',
      record.lesson?.key_points?.length ? `Key Points: ${record.lesson.key_points.slice(0, 5).join('; ')}` : ''
    ].filter(Boolean).join('\n') : 'Standard Nigerian secondary school curriculum';

    let upstream;
    let lastError = null;
    let usedModel = onlineAiConfig.model || 'gemini-flash-lite-latest';
    const modelsToTry = [
      onlineAiConfig.model,
      'gemini-flash-lite-latest',
      'gemini-3.1-flash-lite',
      'gemini-3.5-flash-lite'
    ];
    const uniqueModels = [...new Set(modelsToTry.filter(Boolean))];

    for (const modelName of uniqueModels) {
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          upstream = await postJsonHttps(
            onlineAiConfig.url,
            {
              Authorization: `Bearer ${onlineAiConfig.key}`,
              'x-goog-api-key': onlineAiConfig.key
            },
            {
              model: modelName,
              temperature: 0.5,
              messages: [
                {
                  role: 'system',
                  content: 'You are an engaging, supportive, and knowledgeable educational tutor for secondary school students. When explaining concepts and answering questions:\n1. Storytelling & Relatable Scenarios: Use vivid mini-stories, relatable everyday terms, and practical real-life examples (e.g., market trading, sports, cooking, mechanics, everyday household occurrences) to make complex concepts simple and memorable.\n2. Professional & Academic Rigor: Never lose or dilute the official scientific or academic terms, definitions, formulas, or principles. Always introduce and explain the professional terminology clearly alongside your relatable examples so students master both the concept and the correct exam syllabus vocabulary.\n3. Tone & Formatting: Be welcoming, encouraging, and natural (never robotic). Use clear structure with Markdown headings, bullet points, numbered steps, comparison tables, and highlighted formulas where applicable.'
                },
                {
                  role: 'user',
                  content: `--- BEGIN CURRICULUM CONTEXT ---\n${curriculum}\n--- END CURRICULUM CONTEXT ---\n\nStudent question:\n${question}`
                }
              ]
            },
            25000
          );

          if (upstream.ok) {
            usedModel = modelName;
            break;
          }

          if (upstream.status === 503 || upstream.status === 404) {
            console.warn(`[AI] Model ${modelName} returned HTTP ${upstream.status}, trying fallback model...`);
            break;
          }
        } catch (netErr) {
          lastError = netErr;
          console.warn(`[AI] Attempt ${attempt} for model ${modelName} failed (${netErr.message}), retrying...`);
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
      if (upstream && upstream.ok) break;
    }

    if (!upstream || !upstream.ok) {
      let detail = upstream ? `Provider returned HTTP ${upstream.status}` : (lastError?.message || 'Network timeout');
      try {
        if (upstream) {
          const errorBody = await upstream.json();
          detail = errorBody?.error?.message || errorBody?.message || detail;
        }
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
      model: usedModel,
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

  try {
    const existingUser = await db.findUserByEmail(trimmedEmail);
    if (existingUser) {
      response.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }

    const user = {
      id: randomUUID(),
      name: trimmedName,
      email: trimmedEmail
    };
    const passwordHash = await hashPassword(trimmedPassword);
    await db.createUser({
      id: user.id,
      name: user.name,
      email: user.email,
      passwordHash
    });

    const token = await createSession(user);
    response.status(201).json({
      token,
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
    const user = await db.findUserByEmail(trimmedEmail);
    const passwordMatches = user && await verifyPassword(trimmedPassword, user.password_hash);

    if (!passwordMatches) {
      response.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    const token = await createSession(user);
    response.json({
      token,
      user: sanitizeUser(user)
    });
  } catch (error) {
    next(error);
  }
});

// End the current session and remove the token.
app.post('/api/auth/logout', requireAuth, async (request, response, next) => {
  try {
    await db.deleteSession(request.token);
    response.json({ message: 'Logged out successfully.' });
  } catch (error) {
    next(error);
  }
});

// Return current authenticated user profile.
app.get('/api/auth/me', requireAuth, (request, response) => {
  response.json({ user: request.user });
});

// Retrieve student's saved quiz progress.
app.get('/api/progress', requireAuth, async (request, response, next) => {
  try {
    const records = await db.getUserProgress(request.user.id);
    response.json({ progress: records });
  } catch (error) {
    next(error);
  }
});

// Record or update a student's quiz progress for a subject and topic.
app.post('/api/progress', requireAuth, async (request, response, next) => {
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

    await db.saveUserProgress({
      id: randomUUID(),
      userId: request.user.id,
      subject: trimmedSubject,
      topic: trimmedTopic,
      score: numScore,
      total: numTotal
    });

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
    const catalog = await readCatalog();
    response.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    response.json(catalog);
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
app.get('/api/admin/overview', async (request, response) => {
  const ip = request.ip || request.socket.remoteAddress || '';
  const isLocal = ['127.0.0.1', '::1', '::ffff:127.0.0.1', 'localhost'].includes(request.hostname)
    || ip.includes('127.0.0.1') || ip === '::1';

  if (!isLocal) {
    response.status(403).json({ error: 'Access restricted to localhost' });
    return;
  }

  try {
    const { users, sessions, progress } = await db.getAdminOverview();
    const dbInfo = db.getDatabaseInfo();

    response.json({
      database: dbInfo,
      totalUsers: users.length,
      totalSessions: sessions.length,
      users,
      sessions,
      progress
    });
  } catch (err) {
    response.status(500).json({ error: err.message });
  }
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
  console.log(`BRAVOH running at http://localhost:${port}`);
});
