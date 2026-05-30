// In-memory cache of Exact StockPosition rows, kept fresh by incremental sync.
//
// Exact's `sync/Inventory/StockPositions` rows carry a monotonic `Timestamp`
// row-version. We remember the highest Timestamp merged so far and ask for
// `Timestamp gt <lastTimestamp>` on each poll, so after the initial full pull
// we only fetch the handful of rows that actually changed. `/api/products`
// reads getAll() instead of hitting Exact on every request → ms responses, and
// the cache keeps serving last-known data if Exact is briefly unreachable.
//
// In-memory only (no DB): a server restart triggers one full sync on boot.
// Deletions in Exact are not tracked (acceptable per product decision); a full
// resync only happens on restart.

const config = require('./config');
const logger = require('./logger');
const exactClient = require('./exactClient');

const rows = new Map();   // StockPosition ID -> raw Exact row
let lastTimestamp = 0;    // highest Timestamp merged so far
let lastSyncAt = null;    // Date of last successful sync
let lastError = null;     // message of last failed sync, or null
let ready = false;        // true once an initial full sync has succeeded
let syncing = false;      // guard against overlapping polls
let timer = null;         // setInterval handle

function getAll() {
    return Array.from(rows.values());
}

function isReady() {
    return ready;
}

// Snapshot for a future debug/admin status endpoint.
function getStatus() {
    return {
        ready,
        syncing,
        entries: rows.size,
        lastTimestamp,
        lastSyncAt,
        lastError,
        intervalMs: config.stockSyncIntervalMs,
    };
}

function mergeRows(page) {
    for (const row of page) {
        if (row.ID == null) continue;
        rows.set(row.ID, row);
        const ts = Number(row.Timestamp) || 0;
        if (ts > lastTimestamp) lastTimestamp = ts;
    }
}

// Runs one sync pass. `full` pulls from scratch (Timestamp gt 1) and replaces
// the cache; otherwise it pulls only deltas since lastTimestamp. Never throws —
// a failed pass logs and leaves the last good cache in place.
async function runSync(getAccessToken, { full = false } = {}) {
    if (syncing) {
        logger.debug('stockCache: sync already running; skipping this tick');
        return false;
    }
    syncing = true;
    const mode = full ? 'full' : 'incremental';
    try {
        const accessToken = await getAccessToken();
        if (!accessToken) throw new Error('no Exact access token available');

        // Fetch fully into a local array first; only mutate the cache once the
        // network work has succeeded, so a failed pull never empties the cache.
        const fetched = await exactClient.getAllStockPositions(accessToken, {
            sinceTimestamp: full ? 1 : lastTimestamp,
        });

        // clear + merge run synchronously (no await between them), so a
        // concurrent getAll() can never observe a half-cleared cache.
        if (full) {
            rows.clear();
            lastTimestamp = 0;
        }
        mergeRows(fetched);

        lastSyncAt = new Date();
        lastError = null;
        ready = true;
        logger.info({ mode, fetched: fetched.length, entries: rows.size, lastTimestamp }, 'stockCache synced');
        return true;
    } catch (err) {
        lastError = err.message;
        logger.error({ mode, err: err.message }, 'stockCache sync failed; serving last good cache');
        return false;
    } finally {
        syncing = false;
    }
}

// Kicks off an initial full sync (not awaited — boot stays fast and the route
// falls back to a live pull until the cache is warm) and schedules delta polls.
// `getAccessToken` is injected to avoid a circular dependency on server.js.
function start(getAccessToken) {
    if (timer) return; // already started
    runSync(getAccessToken, { full: true });
    timer = setInterval(() => {
        runSync(getAccessToken, { full: false });
    }, config.stockSyncIntervalMs);
    if (timer.unref) timer.unref(); // don't keep the process alive just for the poller
    logger.info({ intervalMs: config.stockSyncIntervalMs }, 'stockCache poller started');
}

module.exports = { start, getAll, isReady, getStatus };
