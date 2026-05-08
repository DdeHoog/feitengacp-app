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
    allowedOrigins,
    allowedOriginsSource,
};
