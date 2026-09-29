# BRAVOH

## Local-first client and backend

The app runs from a local Express server and reads course materials from the repository's `subjects.json` file. The browser service worker caches the app shell and catalog responses after the first successful load.

### Run locally

```powershell
cd server
npm install
npm start
```

Open http://localhost:3000.

### Database: Managed PostgreSQL & Local SQLite

The app supports **Managed PostgreSQL** (Neon, Supabase, Render Postgres) for durable production hosting, and falls back to **SQLite** (`data/study.sqlite`) for offline local development.

#### Production (Render / Neon / Supabase):
1. Create a free PostgreSQL database on [Neon.tech](https://neon.tech) or [Supabase.com](https://supabase.com).
2. Set the `DATABASE_URL` environment variable on Render (e.g. `postgresql://user:pass@host/dbname?sslmode=require`).
3. Migrate your local SQLite data to PostgreSQL:
   ```powershell
   cd server
   npm run backup
   npm run migrate:pg -- "YOUR_DATABASE_URL"
   ```

#### Local Development:
If `DATABASE_URL` is omitted, the server automatically uses local SQLite (`data/study.sqlite`). To set a custom SQLite path:
```powershell
$env:DATABASE_PATH = 'D:\persistent-data\study.sqlite'
npm start
```

### Local-first behavior

- `GET /api/catalog` serves the complete local catalog.
- `GET /api/subjects` serves available subjects.
- `GET /api/subjects/:subject/topics` serves topics for one subject.
- `GET /api/subjects/:subject/topics/:topic` serves one lesson record.
- The client falls back to cached/local catalog data if the API is unavailable.
- The service worker caches the client shell and successful GET requests for later offline use.

The first visit must happen while the server is running so the browser can cache the application and materials.

### Online/local AI switching

The client uses `client/utils/aiController.js`. When the browser is online, it asks the server proxy at `POST /api/ai/online`. If the request times out, fails, the provider is not configured, or the device is offline, it uses the bundled local tutor automatically.

Configure an OpenAI-compatible provider in the server environment without putting credentials in frontend files:

```powershell
$env:ONLINE_AI_KEY = 'your-provider-key'
$env:ONLINE_AI_URL = 'https://api.openai.com/v1/chat/completions'
$env:ONLINE_AI_MODEL = 'gpt-4o-mini'
cd server
npm start
```

`ONLINE_AI_URL` can point to another provider that supports the chat-completions request format. The proxy sends the selected lesson as curriculum context and instructs the provider not to answer beyond it.
