import express from 'express';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const clientRoot = path.join(projectRoot, 'client');
const catalogPath = path.join(projectRoot, 'subjects.json');
const port = Number(process.env.PORT || 3000);

const app = express();
app.use(express.json());

let catalogCache;
const users = new Map();
const activeTokens = new Map();

async function readCatalog() {
  if (!catalogCache) {
    const contents = await readFile(catalogPath, 'utf8');
    catalogCache = JSON.parse(contents);
  }
  return catalogCache;
}

function createToken(user) {
  return `study-${user.id}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function sanitizeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email
  };
}

app.get('/api/health', (_request, response) => {
  response.json({ status: 'ok', mode: 'local-first' });
});

app.post('/api/auth/register', (request, response) => {
  const { name, email, password } = request.body || {};
  const trimmedName = String(name || '').trim();
  const trimmedEmail = String(email || '').trim().toLowerCase();
  const trimmedPassword = String(password || '');

  if (!trimmedName || !trimmedEmail || !trimmedPassword) {
    response.status(400).json({ error: 'Name, email, and password are required.' });
    return;
  }

  if (users.has(trimmedEmail)) {
    response.status(409).json({ error: 'An account with this email already exists.' });
    return;
  }

  const user = {
    id: crypto.randomUUID(),
    name: trimmedName,
    email: trimmedEmail,
    password: trimmedPassword
  };

  const token = createToken(user);
  users.set(trimmedEmail, user);
  activeTokens.set(token, user.email);

  response.status(201).json({
    token,
    user: sanitizeUser(user)
  });
});

app.post('/api/auth/login', (request, response) => {
  const { email, password } = request.body || {};
  const trimmedEmail = String(email || '').trim().toLowerCase();
  const trimmedPassword = String(password || '');

  if (!trimmedEmail || !trimmedPassword) {
    response.status(400).json({ error: 'Email and password are required.' });
    return;
  }

  const user = users.get(trimmedEmail);
  if (!user || user.password !== trimmedPassword) {
    response.status(401).json({ error: 'Invalid email or password.' });
    return;
  }

  const token = createToken(user);
  activeTokens.set(token, user.email);

  response.json({
    token,
    user: sanitizeUser(user)
  });
});

app.get('/api/catalog', async (_request, response, next) => {
  try {
    response.json(await readCatalog());
  } catch (error) {
    next(error);
  }
});

app.get('/api/subjects', async (_request, response, next) => {
  try {
    const catalog = await readCatalog();
    response.json({ subjects: catalog.subjects || [] });
  } catch (error) {
    next(error);
  }
});

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

app.use(express.static(clientRoot));

app.use((_request, response) => {
  response.sendFile(path.join(clientRoot, 'index.html'));
});

app.use((error, _request, response, _next) => {
  console.error(error);
  response.status(500).json({ error: 'Local catalog unavailable' });
});

app.listen(port, () => {
  console.log(`Local-first study app running at http://localhost:${port}`);
});
