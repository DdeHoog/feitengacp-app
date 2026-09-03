// App-owned data Exact doesn't hold: cached customer profiles, submitted orders,
// forecasts. Everything keys on the Exact contact ID, never the login credential.
// better-sqlite3 is synchronous — fits the app's no-await-between-writes style and
// makes transactions trivially atomic.

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const config = require('./config');
const logger = require('./logger');

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });

const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL'); // readers (admin) don't block the writer
db.pragma('foreign_keys = ON');  // enforce order_lines -> orders + cascade

// Append-only migrations; user_version records how far we've run. Never edit a
// shipped step (it desyncs already-migrated DBs) — add a new one to change schema.
const MIGRATIONS = [
    (d) => {
        d.exec(`
            CREATE TABLE customer_profile (
                exact_contact_id TEXT PRIMARY KEY,
                account_id       TEXT,
                company_name     TEXT,
                debtor_number    TEXT,
                delivery_address TEXT,   -- provisional shape; refined in Batch 2
                email            TEXT,
                full_name        TEXT,
                last_login       INTEGER,
                updated_at       INTEGER
            );

            CREATE TABLE orders (
                id                 INTEGER PRIMARY KEY AUTOINCREMENT,
                our_reference      TEXT UNIQUE NOT NULL,
                customer_reference TEXT,
                exact_contact_id   TEXT NOT NULL,
                company_name       TEXT,   -- snapshot: an order keeps values as-sent,
                debtor_number      TEXT,   -- not a live link back to the profile
                delivery_address   TEXT,
                desired_ship_date  TEXT,
                email_status       TEXT NOT NULL DEFAULT 'pending',
                created_at         INTEGER NOT NULL,
                FOREIGN KEY (exact_contact_id) REFERENCES customer_profile(exact_contact_id)
            );
            CREATE INDEX idx_orders_contact ON orders(exact_contact_id);

            CREATE TABLE order_lines (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                order_id     INTEGER NOT NULL,
                article_code TEXT NOT NULL,
                description  TEXT,
                quantity     INTEGER NOT NULL,
                FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
            );
            CREATE INDEX idx_order_lines_order ON order_lines(order_id);

            CREATE TABLE forecast (
                id               INTEGER PRIMARY KEY AUTOINCREMENT,
                exact_contact_id TEXT NOT NULL,
                article_code     TEXT NOT NULL,
                fiscal_year      INTEGER NOT NULL,
                month            INTEGER NOT NULL,
                quantity         INTEGER NOT NULL,
                updated_at       INTEGER NOT NULL,
                UNIQUE (exact_contact_id, article_code, fiscal_year, month)
            );
            CREATE INDEX idx_forecast_contact ON forecast(exact_contact_id);

            CREATE TABLE sequences (name TEXT PRIMARY KEY, value INTEGER NOT NULL);
        `);
    },
    // v2 — orderer contact details on orders (Ad: name / email / phone, all required)
    (d) => {
        d.exec(`
            ALTER TABLE orders ADD COLUMN orderer_name  TEXT;
            ALTER TABLE orders ADD COLUMN orderer_email TEXT;
            ALTER TABLE orders ADD COLUMN phone         TEXT;
        `);
    },
];

function migrate() {
    const current = db.pragma('user_version', { simple: true });
    for (let v = current; v < MIGRATIONS.length; v += 1) {
        db.transaction(() => {
            MIGRATIONS[v](db);
            db.pragma(`user_version = ${v + 1}`);
        })();
        logger.info({ version: v + 1 }, 'DB migration applied');
    }
}

migrate();

// Atomic named counter (e.g. the PORTAL order reference) — transaction so two
// concurrent orders can't be handed the same number.
const nextSequence = db.transaction((name) => {
    db.prepare('INSERT INTO sequences (name, value) VALUES (?, 0) ON CONFLICT(name) DO NOTHING').run(name);
    db.prepare('UPDATE sequences SET value = value + 1 WHERE name = ?').run(name);
    return db.prepare('SELECT value FROM sequences WHERE name = ?').get(name).value;
});

// COALESCE(excluded.x, x) keeps previously-fetched account data when a login's
// Exact enrichment comes back null (e.g. a 429); last_login/updated_at always advance.
const upsertProfileStmt = db.prepare(`
    INSERT INTO customer_profile
        (exact_contact_id, account_id, company_name, debtor_number, delivery_address, email, full_name, last_login, updated_at)
    VALUES
        (@exact_contact_id, @account_id, @company_name, @debtor_number, @delivery_address, @email, @full_name, @last_login, @updated_at)
    ON CONFLICT(exact_contact_id) DO UPDATE SET
        account_id       = COALESCE(excluded.account_id, account_id),
        company_name     = COALESCE(excluded.company_name, company_name),
        debtor_number    = COALESCE(excluded.debtor_number, debtor_number),
        delivery_address = COALESCE(excluded.delivery_address, delivery_address),
        email            = COALESCE(excluded.email, email),
        full_name        = COALESCE(excluded.full_name, full_name),
        last_login       = excluded.last_login,
        updated_at       = excluded.updated_at
`);

// better-sqlite3 rejects undefined named params, so coalesce every field to null.
function upsertCustomerProfile(profile) {
    const now = Date.now();
    upsertProfileStmt.run({
        exact_contact_id: profile.exact_contact_id,
        account_id: profile.account_id ?? null,
        company_name: profile.company_name ?? null,
        debtor_number: profile.debtor_number ?? null,
        delivery_address: profile.delivery_address ?? null,
        email: profile.email ?? null,
        full_name: profile.full_name ?? null,
        last_login: profile.last_login ?? now,
        updated_at: profile.updated_at ?? profile.last_login ?? now,
    });
}

const getProfileStmt = db.prepare('SELECT * FROM customer_profile WHERE exact_contact_id = ?');
function getCustomerProfile(contactId) {
    return getProfileStmt.get(contactId) || null;
}

// --- Orders ---
const insertOrderStmt = db.prepare(`
    INSERT INTO orders
        (our_reference, customer_reference, exact_contact_id, company_name, debtor_number, delivery_address, desired_ship_date, orderer_name, orderer_email, phone, email_status, created_at)
    VALUES
        (@our_reference, @customer_reference, @exact_contact_id, @company_name, @debtor_number, @delivery_address, @desired_ship_date, @orderer_name, @orderer_email, @phone, 'pending', @created_at)
`);
const insertLineStmt = db.prepare(`
    INSERT INTO order_lines (order_id, article_code, description, quantity)
    VALUES (@order_id, @article_code, @description, @quantity)
`);

// Create an order + its lines atomically, assigning the next PORTAL reference.
// `order` holds the snapshot fields; `lines` is [{article_code, description, quantity}].
// (nextSequence is itself a transaction — better-sqlite3 nests it via a savepoint.)
const createOrder = db.transaction((order, lines) => {
    const our_reference = 'PORTAL' + String(nextSequence('portal_order')).padStart(4, '0');
    const info = insertOrderStmt.run({ ...order, our_reference, created_at: Date.now() });
    for (const l of lines) {
        insertLineStmt.run({ order_id: info.lastInsertRowid, article_code: l.article_code, description: l.description ?? null, quantity: l.quantity });
    }
    return { id: Number(info.lastInsertRowid), our_reference };
});

const getOrdersStmt = db.prepare('SELECT * FROM orders WHERE exact_contact_id = ? ORDER BY created_at DESC, id DESC');
const getLinesStmt = db.prepare('SELECT article_code, description, quantity FROM order_lines WHERE order_id = ?');
function getOrdersForContact(contactId) {
    return getOrdersStmt.all(contactId).map((o) => ({ ...o, lines: getLinesStmt.all(o.id) }));
}

// All orders across customers (admin view). Fine to return all at this volume;
// paginate later if needed.
const getAllOrdersStmt = db.prepare('SELECT * FROM orders ORDER BY created_at DESC, id DESC');
function getAllOrders() {
    return getAllOrdersStmt.all().map((o) => ({ ...o, lines: getLinesStmt.all(o.id) }));
}

module.exports = { db, nextSequence, upsertCustomerProfile, getCustomerProfile, createOrder, getOrdersForContact, getAllOrders };
