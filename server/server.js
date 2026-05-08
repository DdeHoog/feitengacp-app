    const config = require('./config'); // Loads + validates .env on require
    const logger = require('./logger');
    const exactClient = require('./exactClient');

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

    async function saveTokens(tokens) {
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

    async function refreshAccessToken(refreshToken) {
        const newTokens = await exactClient.refreshTokens(refreshToken);
        await saveTokens(newTokens);
        return newTokens;
    }

    // This function will be called when the access token is expired or about to expire
    async function getAccessToken() {
        let tokens = await readTokens();
        if (!tokens) {
            logger.error('No tokens found. Please authenticate via /oauth/authorize first.');
            return null; 
        }

        const now = Date.now();

        // Refresh token if it has expired or about to expire in 1 min
        if (!tokens.expires_at || tokens.expires_at < now + 60 * 1000){
            logger.info('Access token expired or near expiry; refreshing');
            tokens = await refreshAccessToken(tokens.refresh_token);
        }

        return tokens.access_token; // Return the valid access token
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
                const user = { id: matchedContact.ID, email: matchedContact.Email, name: matchedContact.FullName };
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

    // Example API endpoint to test token retrieval
    app.get('/api/test-token', asyncHandler(async (req, res) => {
        const accessToken = await getAccessToken();
        if (accessToken){
            res.json({ message: 'Access token retreived successfully', token: accessToken });
        }else {
            res.status(401).json({ error: 'Failed to retrieve access token' });
        }
    }));

    // === Product page API, sync from stockPosition with extra fields for product details ===
    app.get('/api/products', authenticateToken, asyncHandler(async (req, res) => {
           const accessToken = await getAccessToken();
            if (!accessToken) {
                return res.status(401).json({ error: 'Unauthorized - No valid access token' });
            }

            logger.info('Starting paginated stock pull from Exact');
            const rawProducts = await exactClient.getAllStockPositions(accessToken, {
                onPage: (currentTotal) => logger.debug({ currentTotal }, 'Fetching next stock page'),
            });

            // To be filtered itemCodes
            const excludePrefixes = [  
                '20', '21', '22', '30', '317', '321', '322', '323', '324', '326', '327', '328', '329', '33', '35', '60', '61', '615', '62', '62', '63', '63', '645', '65', '66', '71', '777', '97', '98', '981', '982', '99', '230.ALUBF'
            ]; 

            // filter out unused products BEFORE calling extraFields
            const filteredProducts = rawProducts.filter(product => {
                const code = product.ItemCode;
                const freeStock = parseInt(product.FreeStock) || 0;
                const expectedStock = parseInt(product.ProjectedStock) || 0;
                const plannedIn = parseInt(product.PlanningIn) || 0;
                const plannedOut = parseInt(product.PlanningOut) || 0;

                if (typeof code !== 'string') return false;

                if (code.toUpperCase().includes('EBRI')) {
                    return false;
                }

                if (code.startsWith('9')) {
                    
                    if (freeStock === 0 || expectedStock === 0) {
                        return false;
                    }
                }
                
                const startsWithExcluded = excludePrefixes.some(prefix => code.startsWith(prefix));
                if (startsWithExcluded) {
                    return false;
                }

                if (freeStock === 0 && plannedIn === 0 && expectedStock === 0 && plannedOut === 0) {
                    return false;
                }

                // If none of the above rules apply, keep the product
                return true;
            });

            logger.info({ raw: rawProducts.length, filtered: filteredProducts.length }, 'Product fetch complete');

            const products = filteredProducts.map(r => {
                const parsedData = parseProductDescription(r.ItemDescription, r.ItemCode);

                const palletKey = normalizeItemCode(r.ItemCode);
                const palletQty = palletQtyMap[palletKey] ?? null;

                return {
                    id: r.ItemId,
                    "Item Code": r.ItemCode,
                    "Item Description": r.ItemDescription,
                    "Free Stock": r.FreeStock,
                    "Planned In": r.PlanningIn,
                    "Planning Out": r.PlanningOut,
                    "Expected Stock": r.ProjectedStock,
                    "Type of Skin": parsedData.typeOfSkin,
                    "Thickness": parsedData.thickness,
                    "Color": parsedData.color,
                    "Length": parsedData.length || '',
                    "Width": parsedData.width || '',
                    "Pallet QTY": palletQty,
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

    // Start the server
    app.listen(port, () => {
        logger.info({ port, env: config.nodeEnv }, 'Server running');
    });