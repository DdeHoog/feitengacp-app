// Boot-time configuration. Loads .env, validates required vars, and exports a
// typed-ish object that the rest of the server consumes via `require('./config')`.
// If a required var is missing, the process exits before any route is wired up.

require('dotenv').config();
const path = require('path');

const REQUIRED = ['JWT_SECRET', 'CLIENT_ID', 'CLIENT_SECRET', 'REDIRECT_URI'];
const missing = REQUIRED.filter((k) => !process.env[k]);
if (missing.length > 0) {
    console.error(`[FATAL] Missing required environment variables: ${missing.join(', ')}`);
    console.error('Set them in server/.env (see server/.env.example) and restart.');
    process.exit(1);
}

const DEFAULT_ALLOWED_ORIGINS = [
    'http://localhost:3000',
    'http://www.feitengacp.eu',
    'https://www.feitengacp.eu',
    'http://feitengacp.eu',
    'https://feitengacp.eu',
];

const envOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const allowedOrigins = envOrigins.length > 0 ? envOrigins : DEFAULT_ALLOWED_ORIGINS;
const allowedOriginsSource = envOrigins.length > 0 ? 'env' : 'default';

// EXPORT_ALLOWED_EMAILS: comma-separated list of emails permitted to export the
// product table to CSV. Normalized to lowercase for case-insensitive matching.
// Unset = empty list = the export option is hidden for everyone (safe default).
const exportAllowedEmails = (process.env.EXPORT_ALLOWED_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

// TRUST_PROXY: set when the server sits behind a reverse proxy (nginx, Caddy,
// Cloudflare Tunnel, etc.) so Express reads the real client IP from
// X-Forwarded-For. Accepts: number of hops ('1'), 'true', 'loopback',
// 'linklocal', 'uniquelocal', or an IP/CIDR. Unset = no trust (safe default).
function parseTrustProxy(raw) {
    if (!raw) return false;
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    const asNumber = Number(raw);
    if (!Number.isNaN(asNumber)) return asNumber;
    return raw; // pass through string values like 'loopback'
}

// STOCK_SYNC_INTERVAL_MS: how often the background poller pulls StockPosition
// deltas from Exact. Default 5 minutes — stock changes infrequently, so this is
// plenty fresh. Lower it only for local testing.
const stockSyncIntervalMs = Number(process.env.STOCK_SYNC_INTERVAL_MS) || 5 * 60 * 1000;

module.exports = {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: Number(process.env.PORT) || 5000,
    jwtSecret: process.env.JWT_SECRET,
    clientId: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    redirectUri: process.env.REDIRECT_URI,
    tokenPath: process.env.TOKEN_PATH
        ? path.resolve(process.env.TOKEN_PATH)
        : path.join(__dirname, 'tokens.json'),
    // SQLite path; per-machine, so dev and prod DBs stay separate. Default: storage/app.db
    dbPath: process.env.DB_PATH
        ? path.resolve(process.env.DB_PATH)
        : path.join(__dirname, 'storage', 'app.db'),
    allowedOrigins,
    allowedOriginsSource,
    exportAllowedEmails,
    trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
    stockSyncIntervalMs,
    // itemFieldsCache boot warm is a per-item Exact burst that can 429-starve login
    // on cold start; disable in dev with WARM_ITEM_FIELDS=false. Unset = on (prod).
    warmItemFields: process.env.WARM_ITEM_FIELDS !== 'false',
};
