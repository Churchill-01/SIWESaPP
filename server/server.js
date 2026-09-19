import express from 'express';
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
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
const databasePath = process.env.DATABASE_PATH || path.join(dataRoot, 'study.sqlite');
const port = Number(process.env.PORT || 3000);
const scryptAsync = promisify(scrypt);

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
mkdirSync(path.dirname(databasePath), { recursive: true });
const database = new Database(databasePath);
database.pragma('journal_mode = WAL');
// Create the user and session tables on first launch.
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
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

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
  // Store a token linked to the user and return it to the caller.
  const token = createToken();
  database.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').run(token, user.id);
  return token;
}

// Lightweight health endpoint for local server checks.
app.get('/api/health', (_request, response) => {
  response.json({ status: 'ok', mode: 'local-first' });
});

// Register a user and create the first session for the new account.
app.post('/api/auth/register', async (request, response, next) => {
  const { name, email, password } = request.body || {};
  const trimmedName = String(name || '').trim();
  const trimmedEmail = String(email || '').trim().toLowerCase();
  const trimmedPassword = String(password || '');

  if (!trimmedName || !trimmedEmail || !trimmedPassword) {
    response.status(400).json({ error: 'Name, email, and password are required.' });
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

// Authenticate a user with email and password.
app.post('/api/auth/login', async (request, response, next) => {
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

// Serve the static client after API routes have been registered.
app.use(express.static(clientRoot));

// Support client-side screen routing by serving the app shell.
app.use((_request, response) => {
  response.sendFile(path.join(clientRoot, 'index.html'));
});

// Convert unexpected errors into a stable JSON response.
app.use((error, _request, response, _next) => {
  console.error(error);
  response.status(500).json({ error: 'Local catalog unavailable' });
});

// Start the local-first HTTP server.
app.listen(port, () => {
  console.log(`Local-first study app running at http://localhost:${port}`);
});
