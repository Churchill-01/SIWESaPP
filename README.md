# SIWES Study App

## Local-first client and backend

The app runs from a local Express server and reads course materials from the repository's `subjects.json` file. The browser service worker caches the app shell and catalog responses after the first successful load.

### Run locally

```powershell
cd server
npm install
npm start
```

Open http://localhost:3000.

### SQLite database

User accounts and login sessions are stored in `data/study.sqlite`. The database is created automatically when the server starts, and passwords are stored as secure `scrypt` hashes.

To use another database location, set `DATABASE_PATH` before starting the server:

```powershell
$env:DATABASE_PATH = 'D:\persistent-data\study.sqlite'
npm start
```

For hosting, configure `DATABASE_PATH` to a mounted persistent disk. Without persistent storage, the database will be lost when the host recreates the service.

### Local-first behavior

- `GET /api/catalog` serves the complete local catalog.
- `GET /api/subjects` serves available subjects.
- `GET /api/subjects/:subject/topics` serves topics for one subject.
- `GET /api/subjects/:subject/topics/:topic` serves one lesson record.
- The client falls back to cached/local catalog data if the API is unavailable.
- The service worker caches the client shell and successful GET requests for later offline use.

The first visit must happen while the server is running so the browser can cache the application and materials.
