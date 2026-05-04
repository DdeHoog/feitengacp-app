# CLAUDE.md

## Project context

This project is a React + JavaScript web application for a client. The app is hosted on the client's VPS/domain and fetches product/stock data from the Exact Online business API.

There are currently 3 repositories involved:

1. **Frontend development repo**
   - Used locally.
   - React frontend.
   - Runs on localhost for UI testing.
   - Easier to test frontend-only changes.

2. **Backend development repo**
   - Hosted on Render.com.
   - Currently used awkwardly for backend/API testing.
   - Has its own Exact Online OAuth authorization.
   - Causes friction because tokens often need to be refreshed/pasted manually or coordinated with the frontend.

3. **Combined production repo**
   - Contains both frontend and backend.
   - Hosted on the VPS.
   - Pulled via SSH/Git Bash.
   - Run with PM2.
   - This should become the single source of truth.

## Safety posture

Production is on a stable footing and must stay that way during this work:

- All refactor work happens on a feature branch off `main`. `main` is treated as the deployable line.
- The VPS pulls manually (no auto-deploy, no CI). Production cannot change until someone explicitly SSHes in and pulls.
- The combined repo on the VPS is the **canonical source**. The two split repos (frontend-only, Render-hosted backend) are not pulled from and not synced into this one. If something exists only there, copy it manually after review.
- **Additive-change principle:** every refactor in Tasks 2–4 must fall back to current behavior when its env var is absent. Pulling the new code onto the VPS without setting any new env vars must produce identical behavior to today.

  ```js
  // example
  const TOKEN_PATH = process.env.TOKEN_PATH
    || path.join(__dirname, 'tokens.json');
  ```

  This makes every step independently shippable and reversible.

## Current goal

The immediate goal is to eliminate the separate frontend/backend development repositories and use the combined repo for both:

- local development
- production deployment

The desired setup:

```txt
combined-repo/
  client/
  server/
  package.json
  .env.example
  .env.development
  .env.production
```

The development environment should run locally, with the backend exposed through a persistent ngrok URL so Exact Online OAuth can redirect back to the local backend.

## Current deployment situation

### Production

- Combined repo is hosted on the VPS.
- App is run with PM2.
- Frontend is built and served by the Express server.
- Server serves `../client/build`.
- Production domain is the client domain.

### Development

- Frontend currently runs locally from a separate repo.
- Backend currently points to a Render.com-hosted dev backend.
- Render.com backend uses a different Exact Online app/authorization.
- This setup works, but is awkward and slows down backend/API debugging.

## Important Exact Online OAuth context

Exact Online requires a registered redirect URI.

The intended new dev setup:

- Local backend: `localhost:5000`
- ngrok: `https://<persistent-ngrok-domain>`
- Exact dev redirect URI: `https://<persistent-ngrok-domain>/oauth/callback`

The backend already has:

- `GET /oauth/authorize`
- `GET /oauth/callback`

The callback route must remain available before authorizing the ngrok URL in Exact.

There should be separate Exact app registrations/configs for:

- development/ngrok
- production/client domain

Avoid manually copying tokens between environments.

### Transition from the current Render.com dev app

The current Render-hosted dev backend has its own Exact authorization. During the migration:

- The new ngrok dev app and the existing prod (domain) app become the two active authorizations.
- The Render dev app does **not** need to be deauthorized as part of the migration. Leave it alone until the ngrok flow is proven end-to-end; then ignore or revoke it at leisure.
- At no point should three apps be in concurrent active use — once ngrok works, stop using Render.

## Token handling

Currently the app stores Exact OAuth tokens in `tokens.json`.

This is acceptable short-term for a single-client/single-server setup, but should be improved.

**Required improvement:** make token path configurable via env.

```bash
TOKEN_PATH=./storage/tokens.dev.json
```

Production example:

```bash
TOKEN_PATH=/var/lib/feitengacp/tokens.prod.json
```

The dev and prod token files must not be shared.

Token storage should eventually be moved to a database or more robust secure store, but for the first migration step, configurable file storage is enough.

## API testing strategy (Postman / curl)

Postman does not need its own Exact OAuth authorization, provided the dev backend already holds a valid token. Two approaches:

1. **Borrow the dev backend's token (preferred).** Add an authenticated, dev-only debug endpoint that returns the current access token. Paste it into Postman as a `Bearer` header. The backend continues to refresh on schedule; Postman just consumes the latest token.

   ```js
   // dev only — gate behind NODE_ENV !== 'production' AND authenticateToken
   app.get('/api/debug/access-token', authenticateToken, async (req, res) => {
     if (process.env.NODE_ENV === 'production') return res.sendStatus(404);
     const token = await getAccessToken();
     res.json({ access_token: token });
   });
   ```

2. **Register Postman's callback in the dev Exact app.** Exact accepts multiple redirect URIs per app. Add `https://oauth.pstmn.io/v1/callback`, configure Postman's OAuth2 Auth tab, and Postman caches the token itself. More setup, fully self-contained.

Use approach (1) unless you specifically need Postman to drive the OAuth flow.

## Current backend concerns

The existing `server.js` is too large and mixes many concerns:

- Express setup
- OAuth routes
- token read/write/refresh
- login
- Exact API requests
- product parsing
- product filtering
- static frontend serving
- hardcoded item exceptions

Claude Code should avoid large rewrites at first. Prefer small safe refactors.

Suggested future backend structure:

```txt
server/
  src/
    app.js
    server.js
    config.js
    routes/
      auth.routes.js
      oauth.routes.js
      products.routes.js
    services/
      exactClient.js
      tokenStore.js
      productParser.js
      palletQtyService.js
    data/
      pallet_qty.json
```

Initial priority should be environment/dev setup, not architectural perfection.

### Concrete Express hardening checklist

In rough priority order, once the dev/prod split is stable:

1. **`config.js` with boot-time validation.** Read all env vars in one place; throw at startup if `JWT_SECRET`, `CLIENT_ID`, `CLIENT_SECRET`, or `REDIRECT_URI` is missing. Today the `JWT_SECRET` check fires *after* the password compare in `/api/login`, which is too late.
2. **`helmet`** for default security headers.
3. **`express-rate-limit`** on `/api/login` (and ideally `/api/products`). Currently nothing prevents credential brute-force.
4. **`asyncHandler`** wrapper to drop the repetitive try/catch around every route.
5. **Centralized error middleware** so all routes return a consistent JSON error shape.
6. **Structured logging via `pino` (or `morgan`)** instead of `console.log` + ad-hoc `fs.appendFile` to `successful_logins.log`. Add log rotation.
7. **`exactClient.js` service** that owns: an `axios.create` instance with timeout, base URL, division, auth header injection, pagination traversal, and 401-retry-after-token-refresh.
8. **Validation** of request bodies on `/api/login` (e.g. Zod) — reject malformed input before hitting Exact.
9. **CORS allowlist from env.** Already in Task 4 below.
10. **Static file serving gated on `NODE_ENV === 'production'`.** In dev, the Express server should not serve `client/build`; CRA handles the frontend.

These are independent and can be merged one at a time.

### Known bugs to fix during cleanup

- **Duplicate keys in `itemCodeExceptions`** — `365.24040`, `365.24120`, `365.30125`, `365.30125-2` each appear twice; only the last definition wins, so some intended overrides are silently ignored.
- **`'180.330202  '`** has trailing whitespace and will never match a normalized item code.
- **`Layout.js`** imports a non-existent `logout` from `authContext`. Works only because of variable shadowing; the import line should be removed.
- **`useProducts.js`** defines an unused Dutch→English `headerMapping`. Either delete it or actually use it on responses.
- **`ProductPage.js`** is a one-line passthrough around `ProductList`. Collapse.
- **`xml2js`** is imported in `server.js` but never used.
- **`xlsx`** is in client deps but unreferenced; `public/stock.xlsx` is also unused.
- **`server/.env.example`** documents DB vars that the code doesn't use and omits the ones it does (`CLIENT_ID`, `CLIENT_SECRET`, `REDIRECT_URI`, `JWT_SECRET`).

## Performance: incremental sync and caching

Currently `GET /api/products` triggers a full paginated pull of `sync/Inventory/StockPositions` from Exact on every request. Latency is high and API quota is burned needlessly.

Exact's `sync/*` endpoints are designed for incremental use. The `Timestamp gt 1` filter already in place returns everything; replacing `1` with the last seen timestamp returns only deltas.

Recommended pattern:

- Maintain a server-side cache of the full table (in-memory at first; later DB-backed).
- Background poller (e.g. every 5–10 minutes via `setInterval` or `node-cron`) calls Exact with `Timestamp gt <lastSync>` and merges the result into the cache.
- `/api/products` reads from the cache → millisecond response.
- If Exact is unreachable, the cache continues to serve last-known data.

| Aspect | Current | Cached + incremental |
| --- | --- | --- |
| Per-request latency | Seconds (full pull) | Milliseconds |
| Exact API quota | High | Low (delta only) |
| Freshness | Real-time | Up to N minutes stale |
| Resilience to Exact downtime | Endpoint fails | Cache still serves |

This change pairs naturally with future per-user visibility filtering — you filter the cached list per user instead of issuing a fresh Exact pull per request.

Defer until the dev/prod environment split is stable; then implement before introducing the DB.

## Current frontend concerns

The product table in `ProductList.js` is hand-rolled — manual dropdown positioning via `getBoundingClientRect`, manual filter state, manual outside-click handling, ad-hoc string-vs-number coercion in `getUniqueValues`. It works but is fragile.

Refactor target: **TanStack Table v8 (`@tanstack/react-table`)**.

- Move column definitions into a `columns` array with built-in `accessorKey`, `header`, `cell`, and per-column filter/sort metadata.
- Use TanStack's filter and sorting state instead of the custom `filters` object and `sortedProducts` memo.
- Drop the manual dropdown — use a headless `<Popover>` or simply a native `<select>` per filterable column.
- If product count grows, add `@tanstack/react-virtual` for row virtualization.

Net effect: ~half the component disappears and the edge cases (the `parseInt` coercion in filter compare, the dropdown-position recalculation on scroll) go away.

Do not prioritize this until the dev/prod setup is stable.

## Product parsing issue

The backend currently does a lot of manual product remapping because the intended Exact endpoint for product details/extra fields returns empty arrays or no matching data.

There are many hardcoded mappings such as:

- color
- thickness
- skin type
- length
- width
- pallet quantity

**Long-term goal:**

- investigate the Exact endpoint that should provide this data
- reduce hardcoded exceptions
- eventually use a cache or database-backed mapping/admin UI

**Short-term:**

- preserve current product behavior
- do not remove existing mappings unless tests confirm equivalent output

## Login/security context

Current login checks:

- email from request
- password compared against Exact Online field `SocialSecurityNumber`

The client currently wants to keep passwords in Exact so they can change them there.

This is not ideal:

- Plaintext password storage in Exact is a security risk.
- The `SocialSecurityNumber` field is intended for BSN (Dutch national ID) — repurposing it as a credential is a GDPR concern in addition to a security one.
- There is no rate limiting on `/api/login`, no failed-login log, and no account lockout.

**Preferred future direction (worth pushing back on the client for):**

- introduce a small database on the VPS (SQLite is sufficient).
- store users locally with bcrypt password hashes only.
- link local users to Exact contacts by email or Exact `ID` so per-customer business data still flows from Exact.
- provide an admin page for inviting users / resetting passwords.
- the client retains full control over *who* can log in (manage in admin UI), Exact stays the source of truth for everything else.

For now, do not break the existing login flow unless explicitly asked. When the DB is introduced, run both auth paths in parallel for one release before flipping the switch.

## Future features requested by client

The client has requested:

- Specific product-code visibility rules for specific logged-in users.
- An admin page / content management area so the client can make small adjustments himself.
- Better maintainability around product mappings.
- Better development workflow.

These features probably require a local database eventually.

Possible DB choices:

- **SQLite:** simple and suitable for one VPS/small app.
- **Postgres:** more robust long-term.

Do not introduce a DB immediately unless instructed. First stabilize the repo and environment setup.

## Development setup goal

Root-level scripts should eventually allow:

```bash
npm run dev
npm run build
npm start
```

Expected behavior:

- `npm run dev`: runs backend and frontend locally.
- backend uses `.env.development`
- frontend runs on localhost
- backend is exposed via ngrok for Exact OAuth
- production uses `.env.production`
- production frontend build is served by Express

## Suggested first tasks

Claude Code should proceed in very small, reviewable steps.

### Task 1: Inspect repository structure

Determine:

- current root layout
- client/server folders
- package scripts
- how PM2 starts the app
- where `.env` is expected
- whether `server.js` is root-level or inside `server/`

Do not modify yet.

### Task 2: Add/update `.env.example`

Create or update:

```bash
NODE_ENV=
PORT=
CLIENT_ID=
CLIENT_SECRET=
REDIRECT_URI=
JWT_SECRET=
TOKEN_PATH=
ALLOWED_ORIGINS=
```

Do not commit real secrets.

### Task 3: Make token file path configurable

Replace hardcoded token path with env-based path.

Preferred behavior:

```js
const TOKEN_PATH = process.env.TOKEN_PATH || path.join(__dirname, 'storage', 'tokens.json');
```

Ensure the directory exists before writing.

### Task 4: Make allowed origins configurable

Replace hardcoded CORS origins with env-based list.

Example:

```bash
ALLOWED_ORIGINS=http://localhost:3000,https://example.ngrok-free.app,https://www.feitengacp.eu
```

Keep existing origins as fallback if env is missing.

### Task 5: Add dev/prod scripts

Add root scripts if missing.

Possible scripts:

```json
{
  "scripts": {
    "dev": "concurrently \"npm run dev --prefix server\" \"npm start --prefix client\"",
    "build": "npm run build --prefix client",
    "start": "npm start --prefix server"
  }
}
```

Adapt to actual repository structure.

### Task 6: Add setup documentation

Update README with:

- local frontend start
- local backend start
- ngrok command
- Exact dev callback URL
- production deployment/pull/build/restart flow
- token files and env separation

### Task 7: Add safe debug tooling later

Later, add an authenticated debug route for Exact endpoint troubleshooting.

Example:

```txt
GET /api/debug/exact?path=/api/v1/<division>/...
GET /api/debug/access-token   (returns the current Exact access token, dev only)
```

Both routes must be gated on `NODE_ENV !== 'production'` AND require a valid JWT. Only add this after authentication and environment setup is stable.

### Task 8: Express hardening

After the dev/prod split is working, work through the **Concrete Express hardening checklist** above. Pick items individually, one PR each:

- `config.js` with boot-time env validation
- `helmet`
- `express-rate-limit` on `/api/login`
- `asyncHandler` + central error middleware
- structured logging via `pino`
- extract `exactClient.js` service module

### Task 9: Incremental sync + product cache

Once env is stable, implement the cached/incremental flow described in **Performance: incremental sync and caching**:

- in-memory map keyed by `ItemId`, with `lastSync` timestamp
- background poller pulling deltas via `Timestamp gt <lastSync>`
- `/api/products` reads from cache
- preserve current API response shape exactly so the frontend is unaffected

### Task 10: Frontend table refactor (TanStack)

Migrate `ProductList.js` to `@tanstack/react-table` per the **Current frontend concerns** section. Defer until backend is stable; this is pure UI work and can ship independently.

## Constraints

- Do not perform a full rewrite.
- **Stack decision:** stay on React + Express/Node. Do not migrate to Symfony.
- Do not introduce a database yet unless explicitly asked. SQLite is the preferred choice when that step happens.
- Exact Online remains the source of truth for product/stock data. A future DB is for users, password hashes, per-user visibility rules, admin-edited mappings, and optional product cache — not for replacing Exact.
- **Preserve production behavior with no env changes required.** A clean pull onto the VPS without updating env vars must behave identically to the current deployment. New behavior is opt-in via env.
- Preserve existing API response shape for frontend (the `"Item Code"` / `"Free Stock"` etc. keys with spaces).
- Preserve existing product filtering and parsing behavior. Do not remove `itemCodeExceptions` entries until equivalent output is verified from a real Exact endpoint.
- **Preserve the existing visual style.** The Tailwind classes, color palette (the blue `#003F84` / `#004EA2`, light-blue side bars, etc.), logos and layout are the client's in-house brand. Refactors (including the TanStack Table migration) must keep the rendered look identical.
- The combined repo is canonical. Do not pull from or sync with the split frontend/backend repos.
- Do not commit secrets, `tokens.json` (any variant), or any `.env*` file.
- Prefer small commits.
- Prefer low-risk changes.
- Avoid breaking PM2 production startup.

## Main objective

Turn the combined production repository into the single usable repository for both development and production.

The first milestone is:

- Developer can run frontend + backend locally,
- Expose backend through persistent ngrok,
- Authorize Exact Online against the ngrok callback,
- Generate/use local dev tokens,
- And test backend/API changes without Render.com or manual token copying.
