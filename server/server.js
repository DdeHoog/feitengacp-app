    const config = require('./config'); // Loads + validates .env on require
    const logger = require('./logger');
    const exactClient = require('./exactClient');
    const stockCache = require('./stockCache');
    const itemFieldsCache = require('./itemFieldsCache');

    const express = require('express');
    const cors = require('cors');
    const helmet = require('helmet');
    const rateLimit = require('express-rate-limit');
    const path = require('path');
    const jwt = require('jsonwebtoken');
    const fs = require('fs').promises;
    const TOKEN_PATH = config.tokenPath;
    const PALLET_MAP_PATH = path.join(__dirname, 'data', 'pallet_qty.json');
    let palletQtyMap = {};

    function normalizeItemCode(code) {
        if (!code) return '';
        return String(code)
            .trim()
            .toUpperCase()
            .replace(/\s+/g, '')
            .replace(/\./g, ''); // your JSON keys have no dots
    }

    async function loadPalletQtyMap() {
        try {
            const raw = await fs.readFile(PALLET_MAP_PATH, 'utf-8');
            palletQtyMap = JSON.parse(raw);
            logger.info({ entries: Object.keys(palletQtyMap).length }, 'Loaded pallet qty map');
        } catch (err) {
            logger.warn({ err: err.message, path: PALLET_MAP_PATH }, 'Could not load pallet qty map; pallet QTY will be null');
            palletQtyMap = {};
        }
    }

    // Load once on startup (non-blocking)
    loadPalletQtyMap();


    const app = express();
    // Required so express-rate-limit (and req.ip) can read the real client IP
    // from X-Forwarded-For when the server is behind a reverse proxy in prod.
    // Configured via TRUST_PROXY env var; falls back to false (no trust) in dev.
    if (config.trustProxy !== false) {
        app.set('trust proxy', config.trustProxy);
    }
    // CSP is disabled for now: CRA dev uses inline scripts/eval for HMR, and the
    // CRA prod build embeds an inline runtime loader in index.html. Both would be
    // broken by helmet's default CSP. Tightening CSP is a separate hardening step.
    // CORP: in prod the SPA and API share an origin, so 'same-origin' is correct.
    // In dev, CRA on :3000 fetches from API on :5000 (cross-origin) — must relax.
    app.use(helmet({
        contentSecurityPolicy: false,
        crossOriginResourcePolicy: {
            policy: config.nodeEnv === 'production' ? 'same-origin' : 'cross-origin',
        },
    }));

    // Rate limiter for /api/login: caps brute-force / credential-stuffing attempts.
    // 10 attempts per 15-minute window per IP. Real users with typos still have
    // headroom; an attacker hits the wall in seconds.
    const loginLimiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 10,
        standardHeaders: true,
        legacyHeaders: false,
        message: { message: 'Too many login attempts. Try again in 15 minutes.' },
    });

    const port = config.port;

    // Wrap async route handlers so thrown rejections are forwarded to the
    // central error middleware via next(err). Express 4 doesn't do this natively.
    const asyncHandler = (fn) => (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };

    // For parsin description
    const KNOWN_COLORS = ['Ivorywhite', 'Ivory', 'Yellow', 'Orange', 'Red', 'Blue', 'Green', 'Grey', 'Lightgrey', 'Traffic grey', 'Brown', 'Black', 'Black / White', 'Silver metallic', 'Bronze', 'Copper', 'Gold', 'Gold Mirror', 'Whiteboard', 'White', 'ALU BF', 'BF', 'Silver', 'Silver Mirror',];
    const KNOWN_THICKNESSES = ['2mm', '3mm', '4mm', '6mm', '8mm'];
    const KNOWN_SKIN_TYPES = ['ECO', 'LITE', 'PLUS', 'PREMIUM', /BG|BUILDING GRADE/i];

    // === EXCEPTION RULES MAP ===
    const itemCodeExceptions = {
        '105.33115': { length: '3050mm', width: '1500mm' },
        '150.330156': { length: '3050mm', width: '1560mm' },
        '160.390052': { width: '2050mm' },
        '160.3903905': { color: 'Black / White' },
        '160.39039052': { color: 'Black / White' },
        '190.390052-1': { width: '2000mm' },
        '230.30112': { color: 'BF', width: '1520mm' },
        '365.24020': { length: '2440mm', width: '1220mm', color:'BF' },
        '365.24040': { length: '2440mm', width: '1220mm', color:'BF' },
        '365.24050': { length: '2440mm', width: '1220mm', color: 'BF' },
        '365.24110': { length: '2440mm', width: '1220mm' },
        '640.41010': { color: 'Grey/Black' },
        '640.41020': { color: 'Grey/White' },
        '640.41020-1': { length: '3050mm', width: '1500mm', color: 'Grey/White' },
        '399.32412': { length: '2440mm', width: '1220mm' },
        '399.33012': { width: '1220mm' },
        '9375.34015': { length: '4050mm' },
        '9399.32412': { length: '2440mm', width: '1220mm' },
        '9315.33015-1': { length: '3050mm', width: '1500mm' },
        '365.24120-125': {length: '2440mm', width: '1250mm', color: 'Silver Mirror' },
        '365.24120': {color: 'Silver Mirror/Primer' },
        '157.33015': {color: 'Silver/White' },
        '157.33020': {color: 'Silver/White' },
        '157.34015': {color: 'Silver/White' },
        '157.32512': {color: 'Silver/White' },
        '257.32512': {color: 'Silver/White' },
        '257.33015': {color: 'Silver/White' },
        '195.390052': {length: '3050mm', width: '2050mm'},
        '9399.33012-4': {length: '3050mm', width: '1220mm'},
        '160.39039052': {length: '3050mm', width: '2050mm', color: 'Black / White'},
        '365.30125': {length: '3050mm', width: '1250mm', color: 'Silver Mirror'},
        '365.30125-2': {length: '3050mm', width: '1250mm'},
        '180.330202': {length: '3050mm', width: '2050mm'},
        '251.33015': {typeOfSkin: 'LITE B1 FR'},
        '251.32512': {typeOfSkin: 'LITE B1 FR'},
    };

    async function logSuccessfulLogin(email){
        const timestamp = new Date().toISOString();// e.g., "2024-06-15T12:34:56.789Z"
        const logEntry = `${timestamp} - Successful login for: ${email}\n`;
        const logFilePath = 'successful_logins.log';

        try {
            await fs.appendFile(logFilePath, logEntry, 'utf-8');
            logger.info({ email, file: logFilePath }, 'Login written to audit file');
        } catch (err) {
            logger.error({ err: err.message, email }, 'Failed to write login to audit file');
        }
    }

    // In-memory copy of the current tokens, loaded from disk on first use and
    // kept in sync by saveTokens(). A single in-process source of truth is what
    // makes the single-flight refresh below correct.
    let cachedTokens = null;

    // Guards concurrent refreshes. Exact rotates the refresh token on every use
    // and invalidates the previous one, so two refreshes racing would make the
    // second present an already-consumed token ("Old refresh token used") and
    // could persist a dead token. While a refresh is in flight, all callers
    // await this same promise instead of each starting their own.
    let refreshPromise = null;

    async function saveTokens(tokens) {
        cachedTokens = tokens; // keep memory in sync (incl. the OAuth callback path)
        try {
            await fs.mkdir(path.dirname(TOKEN_PATH), { recursive: true });
            await fs.writeFile(TOKEN_PATH, JSON.stringify(tokens, null, 2), 'utf-8');
            logger.info({ path: TOKEN_PATH }, 'Tokens saved');
        } catch (err) {
            logger.error({ err, path: TOKEN_PATH }, 'FATAL: failed to save tokens');
        }
    }
  
    async function readTokens() {
        try {
            const data = await fs.readFile(TOKEN_PATH, 'utf-8');
            return JSON.parse(data);
        } catch (err) {
            logger.info({ path: TOKEN_PATH }, 'No token file yet; will be created after authorization');
            return null;
        }
    }

    // Performs the refresh exactly once for any number of concurrent callers.
    // On success the rotated tokens are persisted and cached; on failure the
    // Exact error is logged and re-thrown to every awaiting caller.
    async function refreshTokensOnce(refreshToken) {
        if (!refreshPromise) {
            refreshPromise = (async () => {
                logger.info('Access token expired or near expiry; refreshing');
                try {
                    const newTokens = await exactClient.refreshTokens(refreshToken);
                    await saveTokens(newTokens);
                    return newTokens;
                } catch (err) {
                    logger.error(
                        { err: err.response?.data || err.message },
                        'Token refresh failed — re-authorize via /oauth/authorize if this persists',
                    );
                    throw err;
                }
            })().finally(() => { refreshPromise = null; });
        }
        return refreshPromise;
    }

    // Returns a valid Exact access token, refreshing if it has expired or is
    // within 1 min of expiry. Concurrent callers share one in-flight refresh.
    async function getAccessToken() {
        if (!cachedTokens) {
            cachedTokens = await readTokens();
        }
        if (!cachedTokens) {
            logger.error('No tokens found. Please authenticate via /oauth/authorize first.');
            return null;
        }

        // Refresh if expired or about to expire within 1 min.
        if (!cachedTokens.expires_at || cachedTokens.expires_at < Date.now() + 60 * 1000) {
            const tokens = await refreshTokensOnce(cachedTokens.refresh_token);
            return tokens.access_token;
        }

        return cachedTokens.access_token; // still valid
    }

    //  === Middleware ===
    const allowedOrigins = config.allowedOrigins;
    logger.info({ origins: allowedOrigins, source: config.allowedOriginsSource }, 'CORS allowed origins configured');

    const corsOptions = {
        origin: function (origin, callback) {
            // Allow requests with no origin (like mobile apps or curl requests)
            if (!origin) return callback(null, true);
            if (allowedOrigins.indexOf(origin) === -1) {
                const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
                return callback(new Error(msg), false);
            }
            return callback(null, true);
        }
    };
    app.use(cors(corsOptions)); // Enable CORS for all routes - Crucial for development across different origins
    app.use(express.json()); // To parse JSON request bodies (future-proof to add POST requests)

    function authenticateToken(req, res, next) {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1]; // Get the token from the Authorization header

        if (token == null) {
            logger.warn({ url: req.originalUrl }, 'No token in request');
            return res.sendStatus(401); // If no token, unauthorized
        }

        jwt.verify(token, config.jwtSecret, (err, user) => {
            if (err) {
                logger.warn({ err: err.message, url: req.originalUrl }, 'Invalid or expired JWT presented');
                return res.status(403).json({ error: 'Invalid or expired token.' });
            }
            req.user = user; // Attach user info to request object
            next(); 
        })
    };

    //===PARSER===
    function parseProductDescription(description, itemCode) {
        let parsedData = {
            color: '',
            thickness: '',
            typeOfSkin: '',
            length: '',
            width: ''
        };

        if (typeof description !== 'string' || description === '') {
            return parsedData;
        }

        // --- Pass 1: Rule based description parsing ---
        for (const color of KNOWN_COLORS) {
            const colorRegex = new RegExp(`\\b${color.replace(' ', '\\s')}\\b`, 'i');
            if (colorRegex.test(description)) {
                parsedData.color = color;
                break;
            }
        }
        for (const thickness of KNOWN_THICKNESSES) {
            const thicknessRegex = new RegExp(`\\b${thickness}\\b`, 'i');
            if (thicknessRegex.test(description)) {
                parsedData.thickness = thickness;
                break;
            }
        }
        for (const skinType of KNOWN_SKIN_TYPES) {
            const isBuildingGradeRule = skinType instanceof RegExp;
            const skinTypeRegex =  isBuildingGradeRule ? skinType : new RegExp(`\\b${skinType.replace(' ', '\\s')}\\b`, 'i');

            if (skinTypeRegex.test(description)) {
                if (isBuildingGradeRule) {
                    parsedData.typeOfSkin = 'BUILDING GRADE'; // To match BG and Building Grade both to "BUILDING GRADE"
                }
                else {
                    parsedData.typeOfSkin = skinType;
                }
                break;
            }
        }

        // --- Pass 2: Set defaults for white(itemCode based) and non-white products ---
        const isWhite = parsedData.color.toUpperCase() === 'WHITE';
        if (isWhite && typeof itemCode === 'string'){
            //White item rules based on itemCode patterns
            const match = itemCode.match(/(\d{2})(\d{2})$/);
            if (match){
                const lengthCode = parseInt(match[1], 10);
                const widthCode = parseInt(match[2], 10);
                parsedData.length = `${(lengthCode * 100) + 50}mm`;
                if (widthCode === 12) {
                    parsedData.width = '1250mm';
                } else if (widthCode === 20) {
                    parsedData.width = '2050mm';
                } else {
                    parsedData.width = `${widthCode * 100}mm`;
                }
            }
        } else if (!isWhite){ //Default rules for non-white products
            parsedData.length = '3050mm';
            parsedData.width = '1500mm';
        }

        if (itemCodeExceptions[itemCode]) {//Exception handling
            const exceptions = itemCodeExceptions[itemCode];
            Object.assign(parsedData, exceptions);
        }
        
        return parsedData;
    }

    // Item-code prefixes excluded from the catalog (non-ACP ranges, accessories,
    // etc.). Shared by /api/products and the item-fields warmer so both agree on
    // which items are "visible". The future admin show/hide-products toggle will
    // replace this hardcoded list.
    const EXCLUDE_PREFIXES = [
        '20', '21', '22', '30', '317', '321', '322', '323', '324', '326', '327', '328', '329', '33', '35', '60', '61', '615', '62', '62', '63', '63', '645', '65', '66', '71', '777', '97', '98', '981', '982', '99', '230.ALUBF'
    ];

    // Apply the catalog visibility rules to raw StockPosition rows.
    function filterVisibleProducts(rawRows) {
        return rawRows.filter((product) => {
            const code = product.ItemCode;
            const freeStock = parseInt(product.FreeStock) || 0;
            const expectedStock = parseInt(product.ProjectedStock) || 0;
            const plannedIn = parseInt(product.PlanningIn) || 0;
            const plannedOut = parseInt(product.PlanningOut) || 0;

            if (typeof code !== 'string') return false;
            if (code.toUpperCase().includes('EBRI')) return false;
            if (code.startsWith('9')) {
                if (freeStock === 0 || expectedStock === 0) return false;
            }
            if (EXCLUDE_PREFIXES.some((prefix) => code.startsWith(prefix))) return false;
            if (freeStock === 0 && plannedIn === 0 && expectedStock === 0 && plannedOut === 0) return false;

            return true;
        });
    }

    // Dutch/RAL color strings from ItemExtraField (field 5) → the English labels
    // the UI uses. Keys are lowercased for case-insensitive lookup. Built from the
    // full set of distinct catalog values (2026-05-30). Two corrections vs the old
    // regex output: "9005 Zwart" was wrongly shown as Red (it's Black), and
    // "Gold Mirror" showed as just Gold. Unmapped values fall back to the regex
    // color and are logged once so new colors can be added here.
    const COLOR_MAP = {
        '1015 ivoorwit': 'Ivory',
        '1023 geel': 'Yellow',
        '3020 rood': 'Red',
        '5002 blauw': 'Blue',
        '5022 blauw': 'Blue',
        '6005 groen': 'Green',
        '6024 groen': 'Green',
        '7016 grey 9005 blck': 'Grey/Black',
        '7016 grijs': 'Grey',
        '7021 grey 9010 white': 'Grey/White',
        '7042 traffic grey': 'Grey',
        '9003 whiteboard': 'Whiteboard',
        '9003 wit 9006 silver': 'Silver/White',
        '9003 wit': 'White',
        '9003 wit / 9005 zwart': 'Black / White',
        '9005 zwart': 'Black',
        '9006 zilver metallic': 'Silver',
        'alu bf digital / 9006 m': 'ALU BF Digital',
        'black bf / primer': 'Black BF',
        'copper (bf) / primer': 'Copper BF',
        'gold bf / primer': 'Gold BF',
        'gold mirror / primer': 'Gold Mirror',
        'silver mirror / primer': 'Silver Mirror',
    };

    const warnedColors = new Set();
    function translateColor(apiColor) {
        const key = String(apiColor).trim().toLowerCase();
        const mapped = COLOR_MAP[key];
        if (mapped) return mapped;
        if (!warnedColors.has(key)) {
            warnedColors.add(key);
            logger.warn({ apiColor }, 'Unmapped API color — using regex fallback; add it to COLOR_MAP');
        }
        return null;
    }

    // Resolve a product's spec fields, preferring cached ItemExtraField (API)
    // values over the legacy regex/exception parser. API is authoritative; regex
    // is the fallback when an API field is missing (and for any unmapped color).
    // Formatting matches the existing UI: mm appended to dimensions, thickness
    // de-spaced ("2 mm" -> "2mm"), pallet qty as a number.
    function resolveProductFields(r) {
        const regex = parseProductDescription(r.ItemDescription, r.ItemCode);
        const regexPallet = palletQtyMap[normalizeItemCode(r.ItemCode)] ?? null;
        const api = itemFieldsCache.get(r.ItemId);

        const withUnit = (v) => (v == null || v === '' ? null : `${String(v).trim()}mm`);
        const noSpace = (v) => (v == null || v === '' ? null : String(v).replace(/\s+/g, ''));
        const apiColor = api && api.color ? translateColor(api.color) : null;

        return {
            typeOfSkin: (api && api.skinType) || regex.typeOfSkin || '',
            thickness: noSpace(api && api.thickness) || regex.thickness || '',
            color: apiColor || regex.color || '',
            length: withUnit(api && api.length) || regex.length || '',
            width: withUnit(api && api.width) || regex.width || '',
            palletQty: api && api.palletQty != null ? Number(api.palletQty) : regexPallet,
        };
    }


    // === API ROUTES ===
    // === Exact OAuth2: Authorize Redirect ===
    app.get('/oauth/authorize', (req, res) => {
        const base = 'https://start.exactonline.nl/api/oauth2/auth';
        const url = `${base}?client_id=${config.clientId}&redirect_uri=${encodeURIComponent(config.redirectUri)}&response_type=code&force_login=1`;
        res.redirect(url);
    });

    // === Exact OAuth2: Callback Handler ===
    // If lost tokens, call this endpoint to re-authorize. Needs login from client.
    app.get('/oauth/callback', asyncHandler(async (req, res) => {
        const { code } = req.query;
        logger.info({ codeLength: code?.length, query: Object.keys(req.query) }, 'OAuth authorization code received');

        if (!code) {
            return res.status(400).send('Missing authorization code');
        }

        const tokens = await exactClient.exchangeAuthCode(code);
        await saveTokens(tokens);

        logger.info({ expiresIn: tokens.expires_in }, 'OAuth tokens received and persisted');
        res.json(tokens);
    }));

    // === API endpoint for login verification ===
    app.post('/api/login', loginLimiter, asyncHandler(async (req, res) => {
        const { email, password } = req.body; //receive email and password from homepage.js submit form
        logger.info({ email }, 'Login attempt');

        const accessToken = await getAccessToken();
        if (!accessToken) {
            logger.error('No Exact Online access token available for login check');
            return res.status(500).json({ message: 'Server error: Cannot connect to Exact Online for login.' });
        }

        const exactContacts = await exactClient.getContactByEmail(accessToken, email);

        if (exactContacts.length > 0) {
            const matchedContact = exactContacts[0]; // The filter should only return one.

            if (matchedContact.SocialSecurityNumber === password) {
                const canExport = config.exportAllowedEmails.includes(
                    (matchedContact.Email || '').toLowerCase()
                );
                const user = {
                    id: matchedContact.ID,
                    email: matchedContact.Email,
                    name: matchedContact.FullName,
                    canExport,
                };
                const token = jwt.sign(user, config.jwtSecret, { expiresIn: '1h' });

                await logSuccessfulLogin(email);

                logger.info({ email }, 'Login successful; JWT issued');
                return res.json({ message: 'Login successful.', token: token });
            }

            logger.warn({ email }, 'Login failed: password mismatch');
            // Generic error for security. Does not reveal if the email exists or not.
            return res.status(401).json({ message: 'Invalid credentials.' });
        }

        // No user found with that email that ALSO has a password set.
        logger.warn({ email }, 'Login failed: no Exact account with credentials for this email');
        return res.status(401).json({ message: 'Invalid credentials.' });
    }));

    // Dev-only debug endpoints. Mounted only when NOT production AND require a
    // valid JWT. Useful for probing Exact API endpoints during investigation
    // (e.g., finding the right endpoint for product specs to replace
    // itemCodeExceptions / palletQty hardcoded data).
    if (config.nodeEnv !== 'production') {
        app.get('/api/debug/access-token', authenticateToken, asyncHandler(async (req, res) => {
            const accessToken = await getAccessToken();
            if (!accessToken) return res.status(404).json({ error: 'No tokens available — run /oauth/authorize' });
            const tokens = await readTokens();
            res.json({ access_token: accessToken, expires_at: tokens?.expires_at });
        }));

        app.get('/api/debug/exact', authenticateToken, asyncHandler(async (req, res) => {
            const { path: exactPath, ...params } = req.query;
            const accessToken = await getAccessToken();
            if (!accessToken) return res.status(401).json({ error: 'No Exact access token' });
            try {
                const { status, data } = await exactClient.debugGet(exactPath, params, accessToken);
                res.status(status).json(data);
            } catch (err) {
                if (err.response) {
                    // Surface Exact's own error response so the caller can see
                    // exactly what Exact said (status code + body).
                    return res.status(err.response.status).json({
                        exactStatus: err.response.status,
                        exactBody: err.response.data,
                    });
                }
                throw err; // unknown — let central error middleware handle it
            }
        }));

        // Stock cache state — confirm the poller is warm without grepping logs.
        app.get('/api/debug/cache', authenticateToken, (req, res) => {
            res.json(stockCache.getStatus());
        });

        // Phase 1 ItemExtraField audit: per visible item, compare the cached API
        // spec fields against the current regex/exception parser. Observe-only —
        // /api/products output is still driven by the regex path. Dimensions are
        // compared digits-only (regex "1500mm" vs API "1500" should match); Color
        // is reported raw (Dutch API vs English regex) and not counted as a diff
        // until the Phase 2 color mapping lands.
        app.get('/api/debug/item-fields', authenticateToken, (req, res) => {
            const digits = (v) => (v == null ? '' : String(v).replace(/\D/g, ''));
            const text = (v) => (v == null ? '' : String(v).trim().toUpperCase());
            const visible = filterVisibleProducts(stockCache.getAll());
            let withApi = 0;
            let withDiffs = 0;
            const items = visible.map((r) => {
                const regex = parseProductDescription(r.ItemDescription, r.ItemCode);
                const regexPallet = palletQtyMap[normalizeItemCode(r.ItemCode)] ?? null;
                const api = itemFieldsCache.get(r.ItemId);
                if (!api) return { code: r.ItemCode, itemId: r.ItemId, api: null };
                withApi++;
                const diffs = {};
                if (digits(regex.width) !== digits(api.width)) diffs.width = { regex: regex.width, api: api.width };
                if (digits(regex.length) !== digits(api.length)) diffs.length = { regex: regex.length, api: api.length };
                if (digits(regex.thickness) !== digits(api.thickness)) diffs.thickness = { regex: regex.thickness, api: api.thickness };
                if (text(regex.typeOfSkin) !== text(api.skinType)) diffs.skinType = { regex: regex.typeOfSkin, api: api.skinType };
                if (digits(regexPallet) !== digits(api.palletQty)) diffs.palletQty = { regex: regexPallet, api: api.palletQty };
                if (Object.keys(diffs).length) withDiffs++;
                return { code: r.ItemCode, itemId: r.ItemId, color: { regex: regex.color, api: api.color }, diffs };
            });
            res.json({
                cache: itemFieldsCache.getStatus(),
                summary: { visible: visible.length, withApi, withDiffs },
                items,
            });
        });

        logger.info('DEBUG endpoints enabled: /api/debug/access-token, /api/debug/exact, /api/debug/cache, /api/debug/item-fields');
    }

    // === Product page API, sync from stockPosition with extra fields for product details ===
    app.get('/api/products', authenticateToken, asyncHandler(async (req, res) => {
            // Serve from the warm cache (ms response, and still served even if
            // Exact is briefly unreachable). On a cold start — before the boot
            // sync has filled the cache — fall back to a one-off live pull so
            // the very first request still works; every request after reads cache.
            let rawProducts;
            if (stockCache.isReady()) {
                rawProducts = stockCache.getAll();
            } else {
                const accessToken = await getAccessToken();
                if (!accessToken) {
                    return res.status(401).json({ error: 'Unauthorized - No valid access token' });
                }
                logger.info('stockCache not ready; serving /api/products from a one-off live pull');
                rawProducts = await exactClient.getAllStockPositions(accessToken, {
                    onPage: (currentTotal) => logger.debug({ currentTotal }, 'Fetching next stock page'),
                });
            }

            const filteredProducts = filterVisibleProducts(rawProducts);

            logger.info({ raw: rawProducts.length, filtered: filteredProducts.length }, 'Product fetch complete');

            const products = filteredProducts.map(r => {
                const f = resolveProductFields(r);
                return {
                    id: r.ItemId,
                    "Item Code": r.ItemCode,
                    "Item Description": r.ItemDescription,
                    "Free Stock": r.FreeStock,
                    "Planned In": r.PlanningIn,
                    "Planning Out": r.PlanningOut,
                    "Expected Stock": r.ProjectedStock,
                    "Type of Skin": f.typeOfSkin,
                    "Thickness": f.thickness,
                    "Color": f.color,
                    "Length": f.length,
                    "Width": f.width,
                    "Pallet QTY": f.palletQty,
                };
            });

            res.json(products); // Send the products data as JSON response
    }));


    // --- Static File Serving (production only) ---
    // In dev, CRA serves the frontend on its own port; the API server should not
    // try to serve client/build (which may not even exist).
    if (config.nodeEnv === 'production') {
        const clientBuildPath = path.resolve(__dirname, '../client/build');
        app.use(express.static(clientBuildPath));

        // Catch-all for SPA client-side routing.
        app.get('*', (req, res) => {
            res.sendFile(path.join(clientBuildPath, 'index.html'));
        });
    }

    // Central error handler. Runs whenever a route forwards an error via
    // next(err) or asyncHandler catches an async rejection. Logs with route
    // context and returns a consistent JSON shape. The dual `error`/`message`
    // keys exist for backwards compat with existing frontend readers.
    app.use((err, req, res, next) => {
        if (res.headersSent) return next(err);

        const status = err.status || err.statusCode || 500;
        const detail = err.response?.data || err.stack || err.message || err;
        logger.error({ method: req.method, url: req.originalUrl, status, err: detail }, 'Request error');

        const clientMessage = status >= 500
            ? 'Internal server error'
            : (err.publicMessage || err.message || 'Request failed');
        res.status(status).json({ error: clientMessage, message: clientMessage });
    });

    // Warm the product cache and start the delta poller. Not awaited: the first
    // /api/products request before the cache is ready falls back to a one-off
    // live pull (see the route), and every request after reads the warm cache.
    // Once the stock cache is ready, warm the item-fields (ItemExtraField) cache
    // for the visible items, and refresh changed items on each poll tick — this
    // piggybacks the same 5-min cadence rather than running a second timer.
    const getVisibleItems = () => filterVisibleProducts(stockCache.getAll());
    stockCache.start(getAccessToken, {
        onReady: () => itemFieldsCache.warm(getAccessToken, getVisibleItems),
        onPoll: () => itemFieldsCache.refreshChanged(getAccessToken),
    });

    // Start the server
    app.listen(port, () => {
        logger.info({ port, env: config.nodeEnv }, 'Server running');
    });