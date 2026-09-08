# feitengacp-app

Combined frontend + backend for the Feitengacp Europe stock-portal web app.

- `client/` — React 19 + Tailwind frontend (CRA).
- `server/` — Express backend that talks to Exact Online via OAuth2.

The combined repo is the canonical source for both **local development** and **production** on the client's VPS (run via PM2). The older split frontend-only and Render-hosted-backend repos are being retired.

---

## Features

| Area | Status |
| ---- | ------ |
| Login against Exact contacts; JWT session | ✅ live |
| Live stock table (filters, CSV export for allow-listed users) | ✅ live |
| Incremental stock sync + in-memory caches | ✅ live |
| Express hardening (`helmet`, rate limit, `config.js`, `pino`, `exactClient.js`) | ✅ live |
| SQLite datastore + per-login customer profile cache | ✅ live |
| Ordering: cart → review → submit, order history + reorder | ✅ live |
| Order e-mail to `sales@` via Microsoft Graph | ✅ live |
| Admin area: orders per customer + CSV export | ✅ live |
| Forecast (per month, up to 12 months ahead) | planned |
| Admin: customer login status, forecasts per customer | planned |
| Nightly SQLite backup | planned |

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

# Skip the per-item ItemExtraField boot warm — that burst otherwise rate-limits
# (429) your logins for ~90s after every restart. Leave unset in production.
WARM_ITEM_FIELDS=false

# Who may reach /admin (separate list from EXPORT_ALLOWED_EMAILS).
ADMIN_EMAILS=you@example.com

# Order e-mail via Microsoft Graph (Entra app with Mail.Send application
# permission). In dev, point MAIL_TO at yourself so test orders don't reach the
# client's inbox. Omit these entirely and e-mail is skipped (orders still save).
GRAPH_TENANT_ID=
GRAPH_CLIENT_ID=
GRAPH_CLIENT_SECRET=
MAIL_FROM=sales@feitengacp.eu
MAIL_TO=you@example.com
```

> `DB_PATH` is optional — SQLite defaults to `server/storage/app.db`. Each machine
> (dev laptop, VPS) keeps its own database file; they are never shared.

> **macOS:** free port 5000 first — AirPlay Receiver claims it
> (System Settings → General → AirDrop & Handoff).

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

Quick sanity check: open `https://iritic-yanira-postgenital.ngrok-free.dev/oauth/authorize` in any browser. If ngrok is correctly forwarding to your local server, you'll be redirected to Exact's login page (`Cannot GET /` on the bare URL is also fine — it just means you reached the server with no route registered for `/`).

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
```

Then open `http://localhost:3000`, log in with a normal user account, and confirm the product list loads. That's the real proof — token flow → Exact API → product parser → frontend all working end-to-end.

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

Production uses its **own** `server/.env` with `NODE_ENV=production` (and no `TOKEN_PATH`, so it falls back to the existing `server/tokens.json`). Don't touch the prod tokens file from your dev machine.

The static-serve block in `server/server.js` is gated on `NODE_ENV=production`, so the same code base behaves correctly in both environments without changes.

Notes:

- **Database migrations run automatically** at boot — watch for `DB migration applied {version: N}` in `pm2 logs`. Never run SQL on the server by hand.
- Run `npm install` **only** when the pull actually changed `package.json`. It compiles `better-sqlite3` from source (no usable prebuilt for Node 20), which is memory-hungry: `pm2 stop` first, install, then `pm2 start`. A 2 GB swapfile exists because that compile once OOM-froze the box.
- `better-sqlite3` is pinned to **v12** — v13+ needs Node ≥ 22 and the VPS runs Node 20.
- A plain `pm2 restart` picks up `server/.env` edits (dotenv reads it at boot).

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
│       ├── App.js            # routes
│       ├── api.js            # axios instance (attaches the JWT)
│       ├── authContext.js    # session + canExport / isAdmin claims
│       ├── cartContext.js    # in-progress order (localStorage)
│       ├── components/
│       │   ├── Layout.js         # nav (cart badge, admin link)
│       │   ├── HomePage.js       # login
│       │   ├── ProductList.js    # stock table + add-to-cart
│       │   ├── CartPage.js       # order review + submit
│       │   ├── MyOrdersPage.js   # own order history + reorder
│       │   ├── AdminPage.js      # admin orders + CSV export
│       │   └── DownloadPage.js
│       └── hooks/
└── server/
    ├── .env                  # actual local env (gitignored)
    ├── .env.example          # template, committed
    ├── package.json
    ├── server.js             # routes + orchestration
    ├── config.js             # env validation
    ├── exactClient.js        # every Exact Online call
    ├── db.js                 # SQLite: schema, migrations, queries
    ├── mailer.js             # order e-mail via Microsoft Graph
    ├── stockCache.js         # in-memory stock cache + poller
    ├── itemFieldsCache.js    # per-item spec fields cache
    ├── data/
    │   └── pallet_qty.json
    ├── storage/              # gitignored; auto-created
    │   ├── tokens.dev.json   # dev OAuth tokens
    │   └── app.db            # SQLite database
    └── tokens.json           # legacy/prod token file (gitignored)
```
