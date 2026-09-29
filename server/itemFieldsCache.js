// Second in-memory cache: per-item product spec fields from Exact's
// `read/logistics/ItemExtraField` (color, length, width, thickness, skin type,
// pallet qty, ...). That endpoint is per-item only, so we issue one call per
// visible item (concurrency-capped) and cache the result.
//
// Spec fields are static — they only change when the client edits an item in
// Exact — so we refresh lazily: the `sync/Logistics/Items` delta feed tells us
// WHICH items changed, and we refetch ItemExtraField only for those.
//
// Drives /api/products (API values win over the regex parser) and, since pallet
// ordering (2026-09-22), the pallet size an order's sheet count is derived from — so
// an item whose fetch failed is retried on the next poll instead of staying blank
// until a restart. In-memory only; re-warmed on each server restart.

const logger = require('./logger');
const exactClient = require('./exactClient');

const fields = new Map();      // ItemId (GUID) -> mapped fields object
const retry = new Map();       // ItemId -> {ItemId, ItemCode} whose fetch failed; retried on the next poll
const MISSING_PER_POLL = 20;   // newly-visible items fetched per poll — bounded so a big batch can't 429-burst
let lastItemsTimestamp = 0;    // Items sync high-water mark for delta detection
let lastWarmAt = null;
let lastError = null;
let ready = false;
let warming = false;

// ItemExtraField rows are positional: `Number` is the stable key, `Value` the
// data (`Description` is Dutch). Mapping per the documented layout — see
// CLAUDE.md "Product parsing issue".
function mapFields(rows) {
    const byNumber = {};
    for (const row of rows) byNumber[row.Number] = row.Value;
    const clean = (v) => (v == null ? null : String(v).trim());
    return {
        width: clean(byNumber[1]),          // Breedte  e.g. "1500"
        length: clean(byNumber[2]),         // Lengte   e.g. "3050"
        thickness: clean(byNumber[3]),      // Dikte    e.g. "3 mm"
        skinThickness: clean(byNumber[4]),  // Toplaag
        color: clean(byNumber[5]),          // Kleur    e.g. "9003 Wit" (Dutch)
        palletQty: clean(byNumber[6]),      // Pallet aantal
        stockPolicy: clean(byNumber[7]),
        moq: clean(byNumber[8]),
        m2PerSheet: clean(byNumber[9]),
        skinType: clean(byNumber[10]),      // Type of SKIN (not always present)
    };
}

function get(itemId) {
    return fields.get(itemId) || null;
}

function getStatus() {
    return { ready, warming, entries: fields.size, retryPending: retry.size, lastItemsTimestamp, lastWarmAt, lastError };
}

// Fetch extra fields for a list of items [{ItemId, ItemCode}], concurrency-capped.
// Low concurrency + the 429-retry in exactClient keeps us under Exact's per-minute
// rate limit; a full ~110-item warm self-paces in the background.
async function fetchForItems(accessToken, items, concurrency = 3) {
    let cursor = 0;
    let ok = 0;
    let failed = 0;
    async function worker() {
        while (cursor < items.length) {
            const item = items[cursor++];
            try {
                const rows = await exactClient.getItemExtraFields(accessToken, item.ItemId);
                fields.set(item.ItemId, mapFields(rows));
                retry.delete(item.ItemId);
                ok++;
            } catch (err) {
                failed++;
                retry.set(item.ItemId, { ItemId: item.ItemId, ItemCode: item.ItemCode });
                logger.warn({ itemId: item.ItemId, code: item.ItemCode, err: err.message }, 'ItemExtraField fetch failed');
            }
        }
    }
    const pool = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
    await Promise.all(pool);
    return { ok, failed };
}

// Warm the cache for the currently-visible items. `getVisibleItems` returns
// [{ItemId, ItemCode, ItemDescription}] (injected to avoid a server.js dep).
async function warm(getAccessToken, getVisibleItems) {
    if (warming) return;
    warming = true;
    try {
        const accessToken = await getAccessToken();
        if (!accessToken) throw new Error('no Exact access token available');

        const items = (getVisibleItems() || []).filter((it) => it.ItemId);
        const { ok, failed } = await fetchForItems(accessToken, items);

        // Establish the Items high-water mark so later delta checks return only
        // genuinely-changed items (avoids re-fetching everything on first poll).
        try {
            const allItems = await exactClient.getChangedItems(accessToken, 0);
            for (const it of allItems) {
                const ts = Number(it.Timestamp) || 0;
                if (ts > lastItemsTimestamp) lastItemsTimestamp = ts;
            }
        } catch (err) {
            logger.warn({ err: err.message }, 'itemFieldsCache: could not establish Items high-water mark');
        }

        lastWarmAt = new Date();
        lastError = null;
        ready = true;
        logger.info({ items: items.length, ok, failed, entries: fields.size, lastItemsTimestamp }, 'itemFieldsCache warmed');
    } catch (err) {
        lastError = err.message;
        logger.error({ err: err.message }, 'itemFieldsCache warm failed');
    } finally {
        warming = false;
    }
}

// Per poll: refetch (a) tracked items the Items sync delta reports as changed, (b) visible
// items that have no fields yet — an article whose stock arrived after boot wasn't in the
// warm, and without this it would show "—" / order as t.b.c. until the next restart
// (the old JSON-map fallback used to mask exactly that) — and (c) earlier failures.
// `getVisibleItems` is the same injected getter the warm uses. Cheap: usually nothing.
async function refreshChanged(getAccessToken, getVisibleItems) {
    if (warming || !ready) return;
    try {
        const accessToken = await getAccessToken();
        if (!accessToken) throw new Error('no Exact access token available');

        const changed = await exactClient.getChangedItems(accessToken, lastItemsTimestamp);
        for (const it of changed) {
            const ts = Number(it.Timestamp) || 0;
            if (ts > lastItemsTimestamp) lastItemsTimestamp = ts;
        }

        const tracked = changed.filter((it) => fields.has(it.ID)).map((it) => ({ ItemId: it.ID, ItemCode: it.Code }));
        const missing = (getVisibleItems ? getVisibleItems() || [] : [])
            .filter((it) => it.ItemId && !fields.has(it.ItemId) && !retry.has(it.ItemId))
            .slice(0, MISSING_PER_POLL)
            .map((it) => ({ ItemId: it.ItemId, ItemCode: it.ItemCode }));
        const items = [...new Map([...tracked, ...missing, ...retry.values()].map((it) => [it.ItemId, it])).values()];
        if (items.length === 0) {
            if (changed.length > 0) logger.debug({ changed: changed.length }, 'itemFieldsCache: changes not in visible set');
            return;
        }
        const { ok, failed } = await fetchForItems(accessToken, items);
        lastError = null;
        logger.info({ changed: changed.length, tracked: tracked.length, missing: missing.length, refetched: items.length, ok, failed, retryPending: retry.size }, 'itemFieldsCache refreshed changed items');
    } catch (err) {
        lastError = err.message;
        logger.error({ err: err.message }, 'itemFieldsCache refresh failed');
    }
}

module.exports = { warm, refreshChanged, get, getStatus, mapFields };
