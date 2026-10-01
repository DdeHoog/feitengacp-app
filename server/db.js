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
    // v3 — orders are placed in pallets (Ad, 2026-09-22). `unit` says what `quantity`
    // means: 'sheet' for every line before this migration, 'pallet' from now on.
    // `pallet_qty` = sheets per pallet snapshotted at order time (orders are immutable;
    // Exact's pallet size may change later); NULL = unknown → shown as "t.b.c.".
    (d) => {
        d.exec(`
            ALTER TABLE order_lines ADD COLUMN unit       TEXT NOT NULL DEFAULT 'sheet';
            ALTER TABLE order_lines ADD COLUMN pallet_qty INTEGER;
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

// --- Customers (admin) ---
// Everyone who has ever logged in — a profile row is written at login — newest login
// first, with their order count and last order: the admin "who uses the portal" view.
const getCustomersStmt = db.prepare(`
    SELECT p.exact_contact_id, p.company_name, p.debtor_number, p.full_name, p.email, p.last_login,
           (SELECT COUNT(*)        FROM orders o WHERE o.exact_contact_id = p.exact_contact_id) AS orders,
           (SELECT MAX(created_at) FROM orders o WHERE o.exact_contact_id = p.exact_contact_id) AS last_order_at
    FROM customer_profile p
    ORDER BY p.last_login DESC
`);
function getCustomers() {
    return getCustomersStmt.all();
}

// --- Orders ---
const insertOrderStmt = db.prepare(`
    INSERT INTO orders
        (our_reference, customer_reference, exact_contact_id, company_name, debtor_number, delivery_address, desired_ship_date, orderer_name, orderer_email, phone, email_status, created_at)
    VALUES
        (@our_reference, @customer_reference, @exact_contact_id, @company_name, @debtor_number, @delivery_address, @desired_ship_date, @orderer_name, @orderer_email, @phone, 'pending', @created_at)
`);
const insertLineStmt = db.prepare(`
    INSERT INTO order_lines (order_id, article_code, description, quantity, unit, pallet_qty)
    VALUES (@order_id, @article_code, @description, @quantity, @unit, @pallet_qty)
`);

// Create an order + its lines atomically, assigning the next PORTAL reference.
// `order` holds the snapshot fields; `lines` is [{article_code, description, quantity,
// unit, pallet_qty}] — quantity in `unit` ('pallet' for new orders), pallet_qty the
// sheets-per-pallet snapshot (null = unknown).
// (nextSequence is itself a transaction — better-sqlite3 nests it via a savepoint.)
const createOrder = db.transaction((order, lines) => {
    const our_reference = 'PORTAL' + String(nextSequence('portal_order')).padStart(4, '0');
    const info = insertOrderStmt.run({ ...order, our_reference, created_at: Date.now() });
    for (const l of lines) {
        insertLineStmt.run({
            order_id: info.lastInsertRowid,
            article_code: l.article_code,
            description: l.description ?? null,
            quantity: l.quantity,
            unit: l.unit ?? 'sheet',
            pallet_qty: l.pallet_qty ?? null,
        });
    }
    return { id: Number(info.lastInsertRowid), our_reference };
});

const getOrdersStmt = db.prepare('SELECT * FROM orders WHERE exact_contact_id = ? ORDER BY created_at DESC, id DESC');
const getLinesStmt = db.prepare('SELECT article_code, description, quantity, unit, pallet_qty FROM order_lines WHERE order_id = ?');
function getOrdersForContact(contactId) {
    return getOrdersStmt.all(contactId).map((o) => ({ ...o, lines: getLinesStmt.all(o.id) }));
}

// All orders across customers (admin view). Fine to return all at this volume;
// paginate later if needed.
const getAllOrdersStmt = db.prepare('SELECT * FROM orders ORDER BY created_at DESC, id DESC');
function getAllOrders() {
    return getAllOrdersStmt.all().map((o) => ({ ...o, lines: getLinesStmt.all(o.id) }));
}

// --- Forecast ---
// One row per (customer, article, year, month). Saving replaces the whole grid for
// that customer+year in one transaction: simpler and safer than diffing, since the
// client always sends the complete grid it is editing.
const getForecastStmt = db.prepare(
    'SELECT article_code, month, quantity FROM forecast WHERE exact_contact_id = ? AND fiscal_year = ? ORDER BY article_code, month'
);
function getForecast(contactId, year) {
    return getForecastStmt.all(contactId, year);
}

const deleteForecastYearStmt = db.prepare('DELETE FROM forecast WHERE exact_contact_id = ? AND fiscal_year = ?');
const insertForecastStmt = db.prepare(`
    INSERT INTO forecast (exact_contact_id, article_code, fiscal_year, month, quantity, updated_at)
    VALUES (@exact_contact_id, @article_code, @fiscal_year, @month, @quantity, @updated_at)
`);
const saveForecast = db.transaction((contactId, year, cells) => {
    deleteForecastYearStmt.run(contactId, year);
    const updated_at = Date.now();
    for (const c of cells) {
        insertForecastStmt.run({
            exact_contact_id: contactId,
            article_code: c.article_code,
            fiscal_year: year,
            month: c.month,
            quantity: c.quantity,
            updated_at,
        });
    }
});

// What the customer has actually ordered, bucketed by the month they asked it to
// ship. Shown alongside the forecast so they can see their real pattern and copy it.
// desired_ship_date is stored as 'YYYY-MM-DD' text, hence the substr slicing.
const getOrderedByMonthStmt = db.prepare(`
    SELECT ol.article_code,
           CAST(substr(o.desired_ship_date, 6, 2) AS INTEGER) AS month,
           SUM(ol.quantity) AS quantity
    FROM orders o
    JOIN order_lines ol ON ol.order_id = o.id
    WHERE o.exact_contact_id = ?
      AND substr(o.desired_ship_date, 1, 4) = ?
    GROUP BY ol.article_code, month
    ORDER BY ol.article_code, month
`);
function getOrderedByMonth(contactId, year) {
    return getOrderedByMonthStmt.all(contactId, String(year));
}

// Every customer's forecast for a year (admin overview), joined to the cached
// company name so the admin page can group by customer.
const getAllForecastsStmt = db.prepare(`
    SELECT f.exact_contact_id, f.article_code, f.month, f.quantity, f.updated_at,
           p.company_name, p.full_name, p.email
    FROM forecast f
    LEFT JOIN customer_profile p ON p.exact_contact_id = f.exact_contact_id
    WHERE f.fiscal_year = ?
    ORDER BY p.company_name, f.article_code, f.month
`);
function getAllForecasts(year) {
    return getAllForecastsStmt.all(year);
}

const setEmailStatusStmt = db.prepare('UPDATE orders SET email_status = ? WHERE id = ?');
function setOrderEmailStatus(id, status) {
    setEmailStatusStmt.run(status, id);
}

module.exports = {
    db, nextSequence,
    upsertCustomerProfile, getCustomerProfile, getCustomers,
    createOrder, getOrdersForContact, getAllOrders, setOrderEmailStatus,
    getForecast, saveForecast, getAllForecasts, getOrderedByMonth,
};
