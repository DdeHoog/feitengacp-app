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
    // v4 — landing-page news (Ad, 2026-10-07): banner + press releases, admin-managed.
    // `published_at` is the date shown (admin-editable, 'YYYY-MM-DD'); order on the page is
    // pinned first, then newest date. The image sits in its own table so listing news never
    // drags BLOBs along; it is in the DB rather than on disk so the nightly backup and the
    // restore procedure cover it unchanged, and deleting an item deletes its image.
    (d) => {
        d.exec(`
            CREATE TABLE news (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                title        TEXT NOT NULL,
                body         TEXT NOT NULL DEFAULT '',
                link_url     TEXT,
                published_at TEXT NOT NULL,
                visible      INTEGER NOT NULL DEFAULT 0,
                pinned       INTEGER NOT NULL DEFAULT 0,
                created_at   INTEGER NOT NULL,
                updated_at   INTEGER NOT NULL
            );

            CREATE TABLE news_image (
                news_id    INTEGER PRIMARY KEY REFERENCES news(id) ON DELETE CASCADE,
                mime       TEXT NOT NULL,
                bytes      BLOB NOT NULL,
                size       INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
        `);
    },
    // v5 — every login, not just the last one (Ad, 2026-10-20: pick a customer → their whole
    // login history). customer_profile.last_login stays as the fast "latest" column. No FK to
    // customer_profile: the profile is written in the background after login and may land
    // later. UNIQUE(contact, at) makes the one-off backfill from successful_logins.log
    // re-runnable — the live handler stamps the log line and this row with the same instant.
    (d) => {
        d.exec(`
            CREATE TABLE login_event (
                id               INTEGER PRIMARY KEY AUTOINCREMENT,
                exact_contact_id TEXT NOT NULL,
                at               INTEGER NOT NULL,
                UNIQUE (exact_contact_id, at)
            );
        `);
    },
    // v6 — news reach (Ad, 2026-10-20: "who reads it"): one row per item per customer.
    // seen_at = first time the card was on screen ~2 s in the opened news panel; clicks on its
    // link counted separately. Reading itself can't be measured — the admin page says "seen".
    (d) => {
        d.exec(`
            CREATE TABLE news_view (
                news_id          INTEGER NOT NULL REFERENCES news(id) ON DELETE CASCADE,
                exact_contact_id TEXT NOT NULL,
                seen_at          INTEGER NOT NULL,
                first_click_at   INTEGER,
                clicks           INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (news_id, exact_contact_id)
            );
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

// --- Login history (admin) ---
// `at` is passed in so the audit log line and this row carry the same instant (see v5).
const insertLoginStmt = db.prepare('INSERT OR IGNORE INTO login_event (exact_contact_id, at) VALUES (?, ?)');
function recordLogin(contactId, at) {
    insertLoginStmt.run(contactId, at);
}

const getLoginsStmt = db.prepare('SELECT at FROM login_event WHERE exact_contact_id = ? ORDER BY at DESC');
function getLoginsForContact(contactId) {
    return getLoginsStmt.all(contactId).map((r) => r.at);
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
// One row per (customer, article, year, month). Since the 2026-10-12 rework the customer
// edits a rolling WINDOW (the next 12 months, spanning the year end), so the queries take a
// range of year*100+month keys — `fromYM`..`toYM`, e.g. 202611..202710 — and saving replaces
// exactly that window in one transaction: the client always sends the complete window it
// edited, so replace beats diffing, and months outside it (history) are never touched.
const getForecastWindowStmt = db.prepare(`
    SELECT article_code, fiscal_year AS year, month, quantity, updated_at
    FROM forecast
    WHERE exact_contact_id = ? AND fiscal_year * 100 + month BETWEEN ? AND ?
    ORDER BY article_code, fiscal_year, month
`);
function getForecastWindow(contactId, fromYM, toYM) {
    return getForecastWindowStmt.all(contactId, fromYM, toYM);
}

const deleteForecastWindowStmt = db.prepare(
    'DELETE FROM forecast WHERE exact_contact_id = ? AND fiscal_year * 100 + month BETWEEN ? AND ?'
);
const insertForecastStmt = db.prepare(`
    INSERT INTO forecast (exact_contact_id, article_code, fiscal_year, month, quantity, updated_at)
    VALUES (@exact_contact_id, @article_code, @fiscal_year, @month, @quantity, @updated_at)
`);
// `cells` = [{article_code, year, month, quantity}], all inside the window (the route checks).
const saveForecastWindow = db.transaction((contactId, fromYM, toYM, cells) => {
    deleteForecastWindowStmt.run(contactId, fromYM, toYM);
    const updated_at = Date.now();
    for (const c of cells) {
        insertForecastStmt.run({
            exact_contact_id: contactId,
            article_code: c.article_code,
            fiscal_year: c.year,
            month: c.month,
            quantity: c.quantity,
            updated_at,
        });
    }
    return updated_at;
});

// What the customer has already ordered for months INSIDE the window, in PALLETS, by the
// month they asked it to ship — shown greyed under the plan so "already ordered for
// December" is visible. Only pallet-unit lines count: the handful of orders placed in
// sheets before 2026-09-22 would otherwise show as hundreds of "pallets".
// desired_ship_date is 'YYYY-MM-DD' text, hence the substr slicing.
const getOrderedInWindowStmt = db.prepare(`
    SELECT ol.article_code,
           CAST(substr(o.desired_ship_date, 1, 4) AS INTEGER) AS year,
           CAST(substr(o.desired_ship_date, 6, 2) AS INTEGER) AS month,
           SUM(ol.quantity) AS quantity
    FROM orders o
    JOIN order_lines ol ON ol.order_id = o.id
    WHERE o.exact_contact_id = ?
      AND ol.unit = 'pallet'
      AND CAST(substr(o.desired_ship_date, 1, 4) AS INTEGER) * 100 + CAST(substr(o.desired_ship_date, 6, 2) AS INTEGER) BETWEEN ? AND ?
    GROUP BY ol.article_code, year, month
    ORDER BY ol.article_code, year, month
`);
function getOrderedInWindow(contactId, fromYM, toYM) {
    return getOrderedInWindowStmt.all(contactId, fromYM, toYM);
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

// --- News (landing page) ---
// `image_v` = the image's updated_at (null = no image): the client puts it in the image URL,
// so an image can be cached forever and a re-upload still shows up at once.
const NEWS_COLUMNS = `
    n.id, n.title, n.body, n.link_url, n.published_at, n.visible, n.pinned, n.created_at, n.updated_at,
    i.updated_at AS image_v, i.size AS image_size
`;
const NEWS_ORDER = 'ORDER BY n.pinned DESC, n.published_at DESC, n.id DESC';
const listVisibleNewsStmt = db.prepare(`SELECT ${NEWS_COLUMNS} FROM news n LEFT JOIN news_image i ON i.news_id = n.id WHERE n.visible = 1 ${NEWS_ORDER}`);
const listAllNewsStmt = db.prepare(`SELECT ${NEWS_COLUMNS} FROM news n LEFT JOIN news_image i ON i.news_id = n.id ${NEWS_ORDER}`);
const getNewsStmt = db.prepare(`SELECT ${NEWS_COLUMNS} FROM news n LEFT JOIN news_image i ON i.news_id = n.id WHERE n.id = ?`);
function listNews({ visibleOnly }) {
    return (visibleOnly ? listVisibleNewsStmt : listAllNewsStmt).all();
}
function getNews(id) {
    return getNewsStmt.get(id) || null;
}

const insertNewsStmt = db.prepare(`
    INSERT INTO news (title, body, link_url, published_at, visible, pinned, created_at, updated_at)
    VALUES (@title, @body, @link_url, @published_at, @visible, @pinned, @now, @now)
`);
function createNews(fields) {
    return Number(insertNewsStmt.run({ ...fields, now: Date.now() }).lastInsertRowid);
}

const updateNewsStmt = db.prepare(`
    UPDATE news SET title = @title, body = @body, link_url = @link_url, published_at = @published_at,
                    visible = @visible, pinned = @pinned, updated_at = @now
    WHERE id = @id
`);
function updateNews(id, fields) {
    return updateNewsStmt.run({ ...fields, id, now: Date.now() }).changes > 0;
}

const deleteNewsStmt = db.prepare('DELETE FROM news WHERE id = ?'); // cascades to news_image
function deleteNews(id) {
    return deleteNewsStmt.run(id).changes > 0;
}

const getNewsImageStmt = db.prepare('SELECT mime, bytes, updated_at FROM news_image WHERE news_id = ?');
function getNewsImage(id) {
    return getNewsImageStmt.get(id) || null;
}

const upsertNewsImageStmt = db.prepare(`
    INSERT INTO news_image (news_id, mime, bytes, size, updated_at)
    VALUES (@news_id, @mime, @bytes, @size, @updated_at)
    ON CONFLICT(news_id) DO UPDATE SET mime = excluded.mime, bytes = excluded.bytes, size = excluded.size, updated_at = excluded.updated_at
`);
function setNewsImage(id, mime, bytes) {
    upsertNewsImageStmt.run({ news_id: id, mime, bytes, size: bytes.length, updated_at: Date.now() });
}

const deleteNewsImageStmt = db.prepare('DELETE FROM news_image WHERE news_id = ?');
function deleteNewsImage(id) {
    return deleteNewsImageStmt.run(id).changes > 0;
}

// --- News reach ---
// First sighting wins (seen_at never moves); a click also counts as seen.
const markNewsSeenStmt = db.prepare(`
    INSERT INTO news_view (news_id, exact_contact_id, seen_at) VALUES (?, ?, ?)
    ON CONFLICT(news_id, exact_contact_id) DO NOTHING
`);
const markNewsClickStmt = db.prepare(`
    INSERT INTO news_view (news_id, exact_contact_id, seen_at, first_click_at, clicks) VALUES (@news_id, @contact, @now, @now, 1)
    ON CONFLICT(news_id, exact_contact_id) DO UPDATE SET
        first_click_at = COALESCE(first_click_at, excluded.first_click_at),
        clicks         = clicks + 1
`);
function markNewsSeen(newsId, contactId) {
    markNewsSeenStmt.run(newsId, contactId, Date.now());
}
function markNewsClick(newsId, contactId) {
    markNewsClickStmt.run({ news_id: newsId, contact: contactId, now: Date.now() });
}

// Admin list = the public columns + reach counts (kept off the public /api/news on purpose).
const listNewsWithReachStmt = db.prepare(`
    SELECT ${NEWS_COLUMNS},
           (SELECT COUNT(*) FROM news_view v WHERE v.news_id = n.id)                       AS seen_by,
           (SELECT COUNT(*) FROM news_view v WHERE v.news_id = n.id AND v.clicks > 0)      AS clicked_by
    FROM news n LEFT JOIN news_image i ON i.news_id = n.id ${NEWS_ORDER}
`);
function listNewsWithReach() {
    return listNewsWithReachStmt.all();
}

const getNewsReachStmt = db.prepare(`
    SELECT v.exact_contact_id, v.seen_at, v.first_click_at, v.clicks,
           p.company_name, p.full_name, p.email
    FROM news_view v
    LEFT JOIN customer_profile p ON p.exact_contact_id = v.exact_contact_id
    WHERE v.news_id = ?
    ORDER BY v.seen_at DESC
`);
function getNewsReach(newsId) {
    return getNewsReachStmt.all(newsId);
}

module.exports = {
    db, nextSequence,
    upsertCustomerProfile, getCustomerProfile, getCustomers, recordLogin, getLoginsForContact,
    createOrder, getOrdersForContact, getAllOrders, setOrderEmailStatus,
    getForecastWindow, saveForecastWindow, getAllForecasts, getOrderedInWindow,
    listNews, getNews, createNews, updateNews, deleteNews, getNewsImage, setNewsImage, deleteNewsImage,
    markNewsSeen, markNewsClick, listNewsWithReach, getNewsReach,
};
