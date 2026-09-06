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

async function readCatalog() {
  if (!catalogCache) {
    const contents = await readFile(catalogPath, 'utf8');
    catalogCache = JSON.parse(contents);
  }
  return catalogCache;
}

app.get('/api/health', (_request, response) => {
  response.json({ status: 'ok', mode: 'local-first' });
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
