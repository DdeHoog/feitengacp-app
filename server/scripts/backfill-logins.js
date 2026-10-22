#!/usr/bin/env node
// One-off: copy the login history from successful_logins.log into login_event (migration
// v5), so the admin page shows logins from before the table existed. The log only has the
// e-mail address as typed; it is matched (case-insensitive) to customer_profile.email to get
// the Exact contact ID. Lines that match no profile, or more than one, are reported and
// skipped — never guessed.
//
//   node server/scripts/backfill-logins.js [path/to/successful_logins.log] [--dry-run]
//
// Safe to re-run, also while the app is running: rows are INSERT OR IGNORE on
// (contact, time), and since v5 the app stamps the log line and the row with the same
// instant, so new logins are never counted twice. Run it after the app has booted once
// with v5 (the table must exist).

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const Database = require('better-sqlite3');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const logPath = path.resolve(args.find((a) => !a.startsWith('--')) || path.join(__dirname, '..', 'successful_logins.log'));
const dbPath = process.env.DB_PATH ? path.resolve(process.env.DB_PATH) : path.join(__dirname, '..', 'storage', 'app.db');
const LINE = /^(\S+) - Successful login for: (.+)$/;

function main() {
    if (!fs.existsSync(logPath)) throw new Error(`log file not found: ${logPath}`);
    const db = new Database(dbPath, { fileMustExist: true });
    db.pragma('busy_timeout = 5000'); // the running app may hold the write lock for a moment
    if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'login_event'").get()) {
        throw new Error('table login_event missing — start the app once so migration v5 runs');
    }

    const contactsByEmail = new Map();
    for (const p of db.prepare('SELECT exact_contact_id, email FROM customer_profile WHERE email IS NOT NULL').all()) {
        const key = p.email.trim().toLowerCase();
        contactsByEmail.set(key, [...(contactsByEmail.get(key) || []), p.exact_contact_id]);
    }

    const rows = [];
    const unmatched = new Map(); // email → line count
    let unreadable = 0;
    for (const line of fs.readFileSync(logPath, 'utf-8').split('\n')) {
        if (!line.trim()) continue;
        const m = LINE.exec(line.trim());
        const at = m && Date.parse(m[1]);
        if (!m || Number.isNaN(at)) { unreadable += 1; continue; }
        const email = m[2].trim().toLowerCase();
        const ids = contactsByEmail.get(email) || [];
        if (ids.length !== 1) { unmatched.set(email, (unmatched.get(email) || 0) + 1); continue; }
        rows.push({ id: ids[0], at });
    }

    let inserted = 0;
    if (!dryRun) {
        const insert = db.prepare('INSERT OR IGNORE INTO login_event (exact_contact_id, at) VALUES (?, ?)');
        db.transaction(() => { for (const r of rows) inserted += insert.run(r.id, r.at).changes; })();
    }
    db.close();

    console.log(JSON.stringify({
        log: logPath, db: dbPath, dryRun,
        matched: rows.length, inserted: dryRun ? undefined : inserted, alreadyPresent: dryRun ? undefined : rows.length - inserted,
        unreadableLines: unreadable,
        unmatched: Object.fromEntries(unmatched), // e-mail → lines; no profile, or shared by several
    }, null, 2));
}

try {
    main();
} catch (err) {
    console.error(`backfill-logins failed: ${err.message}`);
    process.exit(1);
}
