# Deployment Readiness

## Surfaces

- Public app: `/`
- Tele display: `/tele`
- Admin console: `/admin`

## Environment

Copy `.env.example` to the environment mechanism used by the host and set a real password.

```text
PORT=8097
SWEEPSTAKE_DB=data/sweepstake.sqlite
ADMIN_USER=admin
ADMIN_PASSWORD=<strong password>
COOKIE_SECURE=0
```

Set `COOKIE_SECURE=1` only when serving over HTTPS.

## Build

```bash
npm install
npm run build
```

## Start

```bash
npm start
```

`npm start` runs:

```bash
node --experimental-sqlite server/index.js
```

Node 22+ is required because the app uses built-in `node:sqlite`.

## Windows service options

Recommended simple options:

1. **NSSM**
   - Application: path to `node.exe`
   - Arguments: `--experimental-sqlite server/index.js`
   - Startup directory: project folder
   - Environment: set `PORT`, `SWEEPSTAKE_DB`, `ADMIN_USER`, `ADMIN_PASSWORD`, `COOKIE_SECURE`

2. **PM2 on Windows**
   - Works if Node/PM2 are already accepted by IT.
   - Still set env vars securely.

3. **Task Scheduler**
   - Acceptable for a small office app, but less service-like.

## Backup checklist

Before the real draw:

1. Upload employee CSV.
2. Download **full backup** from Admin.
3. Download **participants CSV** if needed.
4. Run draw.
5. Download another full backup immediately after draw.

The SQLite DB lives at `SWEEPSTAKE_DB`, default:

```text
data/sweepstake.sqlite
```

Back up the SQLite file plus any `-wal`/`-shm` companions if copying while the service is running. Admin JSON export is safer during live use.

## Security notes

- Do not use the preview password for office deployment.
- Do not commit `.env` files.
- Keep Admin URL private where practical, but rely on server-side auth, not hiding links.
- Public state does not expose participant emails.
