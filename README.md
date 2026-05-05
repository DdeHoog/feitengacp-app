# feitengacp-app

Combined frontend + backend for the Feitengacp Europe stock-portal web app.

- `client/` — React 19 + Tailwind frontend (CRA).
- `server/` — Express backend that talks to Exact Online via OAuth2.

The combined repo is the canonical source for both **local development** and **production** on the client's VPS (run via PM2). The older split frontend-only and Render-hosted-backend repos are being retired.

---

## Migration progress (RepoMerge branch)

| # | Step | Status |
| - | ---- | ------ |
| 1 | Rewrite `server/.env.example` with real env vars | ✅ done |
| 2 | Make `TOKEN_PATH` configurable | ✅ done |
| 3 | Make CORS allowed origins configurable (`ALLOWED_ORIGINS`) | ✅ done |
| 4 | Create local `server/.env` (gitignored) | ✅ done |
| 5 | Create local `client/.env.development` (gitignored) | ✅ done |
| 6 | Add root `package.json` with `dev` / `build` / `start` | ✅ done |
| 7 | Gate static-serve + catch-all on `NODE_ENV=production` | ✅ done |
| 8 | Get `CLIENT_ID` / `CLIENT_SECRET` from a new Exact dev app | ⏳ waiting on client |
| 9 | Authorize ngrok callback with the client | ⏳ waiting on client |
| 10 | Express hardening (`helmet`, rate limit, `config.js`, `pino`, `exactClient.js`) | not started |
| 11 | Incremental sync + product cache | not started |
| 12 | TanStack Table refactor on `ProductList.js` | not started |

After step 9 the dev environment is self-sufficient — no more dependency on the Render dev backend.

---

## Local development

### One-time setup

```powershell
# At the repo root
npm install
```

The repo is configured as an **npm workspace** with `client` and `server` as members. A single `npm install` at root installs everything — dependencies are hoisted into the root `node_modules`, no per-package install needed.

### Required env files

Both files are **gitignored** — they only exist on your machine.

#### `server/.env` (committed example: `server/.env.example`)

```dotenv
NODE_ENV=development
PORT=5000

# Exact Online OAuth2 (dev app) — fill these in once the client provides them.
CLIENT_ID=
CLIENT_SECRET=
REDIRECT_URI=https://iritic-yanira-postgenital.ngrok-free.dev/oauth/callback

JWT_SECRET=<long random string>

TOKEN_PATH=./storage/tokens.dev.json

ALLOWED_ORIGINS=http://localhost:3000,https://iritic-yanira-postgenital.ngrok-free.dev
```

#### `client/.env.development`

```dotenv
REACT_APP_API_BASE_URL=http://localhost:5000
```

### Run both halves

```powershell
npm run dev
```

This uses `concurrently` to start the Express server on `:5000` (label `[server]`) and the CRA dev server on `:3000` (label `[client]`). Visit `http://localhost:3000`.

Healthy boot looks like:

```
[server] ✅ CORS allowed origins (env): [
[server]   'http://localhost:3000',
[server]   'https://iritic-yanira-postgenital.ngrok-free.dev'
[server] ]
[server] Server running on port 5000
[server] ✅ Loaded pallet qty map: 154 entries
[client] Compiled successfully!
[client]   http://localhost:3000
```

To stop, hit `Ctrl+C` in the terminal. If a stuck process holds a port:

```powershell
# kill anything on 5000
$pids = (Get-NetTCPConnection -LocalPort 5000 -ErrorAction SilentlyContinue).OwningProcess | Sort-Object -Unique
foreach ($p in $pids) { Stop-Process -Id $p -Force }
# same for 3000
```

---

## ngrok (for Exact OAuth callbacks)

Exact Online needs a public HTTPS URL to redirect back to after login. ngrok tunnels public traffic to your local `:5000`.

### One-time

1. Install ngrok: <https://ngrok.com/download>.
2. Sign in to ngrok and run `ngrok config add-authtoken <token>` once.
3. The reserved domain is **`iritic-yanira-postgenital.ngrok-free.dev`**. It needs to be claimed under your ngrok account (Dashboard → Domains).

### Each time you want to do an OAuth round

```powershell
# Run this in a SEPARATE terminal from `npm run dev`.
ngrok http --url=https://iritic-yanira-postgenital.ngrok-free.dev 5000
```

You should see:

```
Forwarding   https://iritic-yanira-postgenital.ngrok-free.dev -> http://localhost:5000
```

Quick sanity check from any browser: `https://iritic-yanira-postgenital.ngrok-free.dev/api/test-token`. If the local server is reachable, you'll see a JSON response (it'll say "Failed to retrieve access token" until the OAuth step is done — that's expected).

> **ngrok must be running every time you authorize, log into Exact through the app, or refresh tokens via the dev OAuth app.** Once tokens are saved to `tokens.dev.json`, normal `/api/products` calls go directly through your local server and don't need ngrok — but the moment a refresh fails or you re-authorize, the callback URL must reach your local server again.

---

## OAuth authorization with the client (the one-time setup)

Tokens for the new dev Exact app can only be created by someone with the right Exact account credentials — likely your client. **You and the client need to be coordinating during a ~5 minute window**, because the authorization code that comes back from Exact expires in ~60 seconds.

### Prerequisites (do these BEFORE the call)

1. ✅ The client has registered a **new Exact Online app** named e.g. "Feitengacp Dev (ngrok)".
2. ✅ That app's redirect URI is set to **`https://iritic-yanira-postgenital.ngrok-free.dev/oauth/callback`**.
3. ✅ The client has shared the new app's `CLIENT_ID` and `CLIENT_SECRET` with you.
4. ✅ You've pasted those into `server/.env`.

### The authorization itself

1. Start the backend + frontend: `npm run dev` (terminal 1).
2. Start ngrok: `ngrok http --url=https://iritic-yanira-postgenital.ngrok-free.dev 5000` (terminal 2).
3. Confirm both came up cleanly.
4. Send the client this exact link: **`https://iritic-yanira-postgenital.ngrok-free.dev/oauth/authorize`**.
5. The client opens it, logs into Exact, clicks "consent / allow".
6. Exact redirects his browser to your `…/oauth/callback?code=…`.
7. ngrok forwards that to your local server, which exchanges the code for tokens and writes them to `server/storage/tokens.dev.json`.
8. The client's browser sees a JSON blob with `access_token`, `refresh_token`, `expires_at`. That's success.

### How to verify after authorization

```powershell
# Inspect that the tokens file exists
Test-Path .\server\storage\tokens.dev.json

# Hit the dev test-token endpoint (not authenticated — public)
curl http://localhost:5000/api/test-token
# Should return: {"message":"Access token retreived successfully","token":"..."}
```

Once that works, the dev environment is self-sufficient. The server auto-refreshes tokens before they expire. The client never needs to do this again unless the refresh token itself is invalidated (Exact rotates them after ~30 days of inactivity).

> **If something goes wrong** — the code expires before exchange, network hiccup, ngrok wasn't up — just resend the `/oauth/authorize` link to the client. There's no penalty for re-running it.

---

## Production deployment

Production is **not** part of `npm run dev`. The VPS still runs the old way:

```bash
# On the VPS, via SSH/Git Bash
git pull
npm run build               # builds client/build
pm2 restart <process-name>  # or: pm2 reload all
```

Production uses its **own** `server/.env` with `NODE_ENV=production` (and probably no `TOKEN_PATH`, so it falls back to the existing `server/tokens.json`). Don't touch the prod tokens file from your dev machine.

The static-serve block in `server/server.js` is gated on `NODE_ENV=production`, so the same code base behaves correctly in both environments without changes.

---

## Useful npm scripts

| Command | What it does |
| ------- | ------------ |
| `npm run dev` | Run server + client locally, both with hot reload from CRA / dotenv from `server/.env`. |
| `npm run build` | Build the React app into `client/build` (used in prod). |
| `npm start` | Start only the server (no client dev server). Used in prod / by PM2. |
| `npm install` | Install all workspace dependencies (root + server + client) into a hoisted `node_modules`. |

---

## File map (for orientation)

```
feitengacp-app/
├── package.json              # root: dev/build/start scripts
├── README.md                 # this file
├── CLAUDE.md                 # project context for AI sessions
├── client/
│   ├── .env.development      # REACT_APP_API_BASE_URL (gitignored)
│   ├── package.json
│   └── src/
│       ├── App.js
│       ├── api.js
│       ├── authContext.js
│       ├── components/
│       └── hooks/
└── server/
    ├── .env                  # actual local env (gitignored)
    ├── .env.example          # template, committed
    ├── package.json
    ├── server.js
    ├── data/
    │   └── pallet_qty.json
    ├── storage/              # auto-created on first OAuth callback
    │   └── tokens.dev.json   # gitignored
    └── tokens.json           # legacy/prod token file (gitignored)
```
