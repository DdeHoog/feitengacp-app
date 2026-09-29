#!/usr/bin/env node
// Nightly SQLite backup (Batch 7). Uses SQLite's online backup API (better-sqlite3
// `backup()`), so it is safe while the app is running: the DB is in WAL mode and recent
// writes live in app.db-wal, which a plain `cp app.db` would silently miss. Produces one
// consistent single-file copy, verifies it, then keeps only the newest BACKUP_KEEP files.
//
//   node server/scripts/backup-db.js         → <db dir>/backups/app-YYYY-MM-DD-HHMMSS.db
//   BACKUP_DIR=/path BACKUP_KEEP=14 node …   → overrides (defaults: beside the DB, 30)
//
// Reads DB_PATH from server/.env like the app does. Exit code 1 on any failure, so the
// cron log shows it. Cron line + restore steps: CLAUDE.md → Deploy.

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const Database = require('better-sqlite3');

const dbPath = process.env.DB_PATH ? path.resolve(process.env.DB_PATH) : path.join(__dirname, '..', 'storage', 'app.db');
const backupDir = process.env.BACKUP_DIR ? path.resolve(process.env.BACKUP_DIR) : path.join(path.dirname(dbPath), 'backups');
const keep = Math.max(1, Number(process.env.BACKUP_KEEP) || 30);
const NAME = /^app-\d{4}-\d{2}-\d{2}-\d{6}\.db$/;

const stamp = () => {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};
const log = (msg, extra = {}) => console.log(JSON.stringify({ time: new Date().toISOString(), msg, ...extra }));

async function main() {
    if (!fs.existsSync(dbPath)) throw new Error(`database not found: ${dbPath}`);
    fs.mkdirSync(backupDir, { recursive: true });
    const dest = path.join(backupDir, `app-${stamp()}.db`);
    const part = `${dest}.part`; // a half-written copy never sits under the final name

    // Open normally (not readonly): a readonly handle on a WAL database needs the -shm
    // file to already exist, which isn't guaranteed when the app is stopped.
    const src = new Database(dbPath, { fileMustExist: true });
    try {
        await src.backup(part);
    } finally {
        src.close();
    }

    // Trust the copy only after it passes SQLite's own check.
    const copy = new Database(part);
    let check; let version; let orders;
    try {
        check = copy.pragma('integrity_check', { simple: true });
        version = copy.pragma('user_version', { simple: true });
        orders = copy.prepare('SELECT COUNT(*) AS n FROM orders').get().n;
    } finally {
        copy.close();
    }
    if (check !== 'ok') {
        fs.rmSync(part, { force: true });
        throw new Error(`integrity_check failed: ${check}`);
    }
    fs.renameSync(part, dest);

    // Rotate: drop everything but the newest `keep` (names sort chronologically).
    const old = fs.readdirSync(backupDir).filter((f) => NAME.test(f)).sort().slice(0, -keep);
    for (const f of old) fs.rmSync(path.join(backupDir, f), { force: true });

    log('backup ok', { dest, bytes: fs.statSync(dest).size, user_version: version, orders, removed: old.length, keep });
}

main().catch((err) => {
    log('backup FAILED', { err: err.message });
    process.exit(1);
});
