// Thin client for Exact Online's REST API. All HTTP calls to start.exactonline.nl
// live here so server.js only orchestrates business logic. The module itself is
// silent — pass an `onPage` callback to observe pagination progress if needed.

const axios = require('axios');
const config = require('./config');

const BASE_URL = 'https://start.exactonline.nl';
const DIVISION = Number(process.env.EXACT_DIVISION) || 3555770;

const client = axios.create({
    baseURL: BASE_URL,
    timeout: 30_000, // 30s — Exact is occasionally slow
    headers: { Accept: 'application/json' },
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// GET with retry on HTTP 429 (Exact rate limit). Honors the Retry-After header
// when present, else exponential backoff. Used for the per-item ItemExtraField
// fan-out and the Items sync, which can otherwise burst past Exact's per-minute
// limit. Non-429 errors (and exhausted retries) propagate to the caller.
async function getWithRetry(url, options, { retries = 5 } = {}) {
    for (let attempt = 0; ; attempt++) {
        try {
            return await client.get(url, options);
        } catch (err) {
            if (err.response?.status === 429 && attempt < retries) {
                const retryAfter = Number(err.response.headers?.['retry-after']);
                const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
                    ? retryAfter * 1000
                    : Math.min(1000 * 2 ** attempt, 30_000);
                await sleep(waitMs);
                continue;
            }
            throw err;
        }
    }
}

function tokenFormBody(extra) {
    const params = new URLSearchParams();
    params.append('client_id', config.clientId);
    params.append('client_secret', config.clientSecret);
    for (const [key, value] of Object.entries(extra)) {
        params.append(key, value);
    }
    return params.toString();
}

function withExpiresAt(tokens) {
    return { ...tokens, expires_at: Date.now() + (tokens.expires_in * 1000) };
}

// === OAuth ===

async function exchangeAuthCode(code) {
    const body = tokenFormBody({
        grant_type: 'authorization_code',
        code,
        redirect_uri: config.redirectUri,
    });
    const response = await client.post('/api/oauth2/token', body, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    return withExpiresAt(response.data);
}

async function refreshTokens(refreshToken) {
    const body = tokenFormBody({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
    });
    const response = await client.post('/api/oauth2/token', body, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    return withExpiresAt(response.data);
}

// === Business endpoints ===

async function getContactByEmail(accessToken, email) {
    const response = await client.get(`/api/v1/${DIVISION}/crm/Contacts`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: {
            '$filter': `Email eq '${email}' and SocialSecurityNumber ne null`,
            '$select': 'ID,SocialSecurityNumber,Email,FullName',
        },
    });
    return response.data.d?.results || [];
}

// `sinceTimestamp` drives Exact's incremental sync: rows carry a monotonic
// `Timestamp` row-version, so `Timestamp gt <n>` returns only rows changed since
// `n`. Default 1 = everything (the original full-pull behavior, unchanged for
// existing callers). The stock cache passes its last-seen Timestamp for deltas.
async function getAllStockPositions(accessToken, { onPage, sinceTimestamp = 1 } = {}) {
    const path = `/api/v1/${DIVISION}/sync/Inventory/StockPositions`;
    const initialParams = {
        '$filter': `Timestamp gt ${sinceTimestamp}`,
        '$select': [
            'ID', 'ItemId', 'ItemCode', 'ItemDescription',
            'FreeStock', 'PlanningIn', 'PlanningOut', 'ProjectedStock', 'Timestamp',
        ].join(','),
    };

    const all = [];
    // Exact's __next is a fully-qualified URL, so the first request bypasses the
    // axios baseURL and uses an absolute URL. Subsequent pages do the same.
    let nextUrl = `${BASE_URL}${path}?${new URLSearchParams(initialParams).toString()}`;

    while (nextUrl) {
        const response = await client.get(nextUrl, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        const page = response.data.d?.results || [];
        all.push(...page);
        nextUrl = response.data.d?.__next || null;
        if (nextUrl && onPage) onPage(all.length);
    }

    return all;
}

// Per-item product spec fields. ItemExtraField is per-item only (no bulk), so
// the caller fetches one item at a time (the item-fields cache batches these
// with a concurrency cap). `modified` is required by Exact; a permissive old
// date returns all of the item's fields.
async function getItemExtraFields(accessToken, itemId, modifiedSince = '2014-01-01') {
    const response = await getWithRetry(`/api/v1/${DIVISION}/read/logistics/ItemExtraField`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: {
            itemId: `guid'${itemId}'`,
            modified: `datetime'${modifiedSince}'`,
        },
    });
    // `read/` function endpoints return the array directly under `d` — no `results` wrapper
    // (unlike the `sync/` and entity endpoints). Don't reach for `.d.results` here.
    return response.data.d || [];
}

// Items changed since `sinceTimestamp`, via the Items sync feed. Lets the
// item-fields cache detect WHICH items changed (so it refetches only those
// ItemExtraFields) without polling every item. Returns { ID, Code, Timestamp }.
async function getChangedItems(accessToken, sinceTimestamp = 1) {
    const path = `/api/v1/${DIVISION}/sync/Logistics/Items`;
    const initialParams = {
        '$filter': `Timestamp gt ${sinceTimestamp}`,
        '$select': 'ID,Code,Timestamp',
    };

    const all = [];
    let nextUrl = `${BASE_URL}${path}?${new URLSearchParams(initialParams).toString()}`;
    while (nextUrl) {
        const response = await getWithRetry(nextUrl, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        const page = response.data.d?.results || [];
        all.push(...page);
        nextUrl = response.data.d?.__next || null;
    }
    return all;
}

// Generic GET for the dev-only debug proxy. Accepts any Exact API path so the
// caller can probe endpoints during investigation. Requires path to start with
// '/api/' so an attacker who somehow bypasses the route gates can't redirect
// us to an arbitrary host. NEVER mount the calling route in production.
async function debugGet(path, params, accessToken) {
    if (typeof path !== 'string' || !path.startsWith('/api/')) {
        const err = new Error("debugGet: path must be a string starting with /api/");
        err.status = 400;
        throw err;
    }
    const response = await client.get(path, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params,
    });
    return { status: response.status, data: response.data };
}

module.exports = {
    DIVISION,
    exchangeAuthCode,
    refreshTokens,
    getContactByEmail,
    getAllStockPositions,
    getItemExtraFields,
    getChangedItems,
    debugGet,
};
