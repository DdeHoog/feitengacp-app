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

async function getAllStockPositions(accessToken, { onPage } = {}) {
    const path = `/api/v1/${DIVISION}/sync/Inventory/StockPositions`;
    const initialParams = {
        '$filter': 'Timestamp gt 1',
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
    debugGet,
};
