    require('dotenv').config(); // Load environment variables from .env file

    
    const axios = require('axios'); 
    const express = require('express'); 
    const cors = require('cors'); 
    const path = require('path');   
    const jwt = require('jsonwebtoken'); 
    const fs = require('fs').promises;
    const { Parser } = require('xml2js');
    const TOKEN_PATH = path.join(__dirname, 'tokens.json');
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
            console.log(`✅ Loaded pallet qty map: ${Object.keys(palletQtyMap).length} entries`);
        } catch (err) {
            console.warn(`⚠️ Could not load pallet qty map at ${PALLET_MAP_PATH}. Pallet QTY will be null.`, err.message);
            palletQtyMap = {};
        }
    }

    // Load once on startup (non-blocking)
    loadPalletQtyMap();


    const parser = new Parser({ explicitArray: false, ignoreAttrs: true });

    const app = express();
    const port = process.env.PORT || 5000; 
    const division = 3555770; // Exact division for Feitengacp
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // For parsin description
    const KNOWN_COLORS = ['Ivorywhite', 'Ivory', 'Yellow', 'Orange', 'Red', 'Blue', 'Green', 'Grey', 'Lightgrey', 'Traffic grey', 'Brown', 'Black', 'Silver metallic', 'Bronze', 'Copper', 'Gold', 'Whiteboard', 'White', 'ALU BF', 'BF', 'Silver'];
    const KNOWN_THICKNESSES = ['2mm', '3mm', '4mm', '6mm', '8mm'];
    const KNOWN_SKIN_TYPES = ['ECO', 'LITE', 'PLUS', 'PREMIUM', /BG|BUILDING GRADE/i];

    // === EXCEPTION RULES MAP ===
    const itemCodeExceptions = {
        '105.33115': { length: '3050mm', width: '1500mm' },
        '160.390052': { width: '2050mm' },
        '230.30112': { color: 'BF', width: '1520mm' },
        '365.24020': { length: '2440mm', width: '1220mm' },
        '365.24040': { length: '2440mm', width: '1220mm' },
        '365.24050': { length: '2440mm', width: '1220mm' },
        '365.24110': { length: '2440mm', width: '1220mm' },
        '365.30125': { width: '1250mm' },
        '640.41010': { color: 'Grey/Black' },
        '640.41020': { color: 'Grey/White' },
        '640.41020-1': { length: '3050mm', width: '1500mm', color: 'Grey/White' },
        '399.32412': { length: '2440mm', width: '1220mm' },
        '399.33012': { width: '1220mm' },
        '9375.34015': { length: '4050mm' },
        '9399.32412': { length: '2440mm', width: '1220mm' },
        '9315.33015-1': { length: '3050mm', width: '1500mm' },
        '365.24120': { length: '2440mm', width: '1220mm' },
        '365.24120-125': {length: '2440mm', width: '1250mm', color: 'Silver Mirror' },
        '365.24120': {color: 'Silver Mirror/Primer' },
        '365.30125': {color: 'Silver Mirror/Primer' },
        '157.33015': {color: 'Silver/White' },
        '157.33020': {color: 'Silver/White' },
        '157.34015': {color: 'Silver/White' },
        '257.32512': {color: 'Silver/White' },
        '257.33015': {color: 'Silver/White' },
        '195.390052': {length: '3050mm', width: '2050mm'},
        '9399.33012-4': {length: '3050mm', width: '1220mm'},
        '160.39039052': {length: '3050mm', width: '2050mm'},
        '365.30125': {length: '3050mm', width: '1250mm'},
        '365.30125-2': {length: '3050mm', width: '1250mm'},
        '180.330202  ': {length: '3050mm', width: '2050mm'},
    };

    async function logSuccessfulLogin(email){
        const timestamp = new Date().toISOString();// e.g., "2024-06-15T12:34:56.789Z"
        const logEntry = `${timestamp} - Successful login for: ${email}\n`;
        const logFilePath = 'successful_logins.log';

        try {
            await fs.appendFile(logFilePath, logEntry, 'utf-8');
            console.log(`✅ Logged successful login for ${email} to ${logFilePath} `);
        } catch (err) {
            console.error(`❌ Error logging successful login for ${email}:`, err.message);
        }
    }

    async function saveTokens(tokens) {
        try {
            await fs.writeFile(TOKEN_PATH, JSON.stringify(tokens, null, 2), 'utf-8');
            console.log('✅ Tokens saved to tokens.json');
        } catch (err) {
            console.error('❌ FATAL: Error saving tokens to file:', err);
        }
    }
  
    async function readTokens() {
        try {
            const data = await fs.readFile(TOKEN_PATH, 'utf-8');
            return JSON.parse(data);
        } catch (err) {
            console.log('Could not read tokens.json. A new one will be created after authorization.');
            return null;
        }
    }

    async function refreshAccessToken(refreshToken) {
        const params = new URLSearchParams();
        params.append('grant_type', 'refresh_token');
        params.append('refresh_token', refreshToken);
        params.append('client_id', process.env.CLIENT_ID);
        params.append('client_secret', process.env.CLIENT_SECRET);

        const response = await axios.post('https://start.exactonline.nl/api/oauth2/token', params.toString(), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        });

        const newTokens = response.data;
        newTokens.expires_at = Date.now() + (newTokens.expires_in * 1000); // Store expiration time in milliseconds
        await saveTokens(newTokens); 
        return newTokens; 
    }

    // This function will be called when the access token is expired or about to expire
    async function getAccessToken() {
        let tokens = await readTokens();
        if (!tokens) {
            console.error('❌ No tokens found. Please authenticate first.');
            return null; 
        }

        const now = Date.now();

        // Refresh token if it has expired or about to expire in 1 min
        if (!tokens.expires_at || tokens.expires_at < now + 60 * 1000){
            console.log('Access token expired or about to expire. Refreshing...');
            tokens = await refreshAccessToken(tokens.refresh_token);
        }

        return tokens.access_token; // Return the valid access token
    }

    //  === Middleware ===
    const allowedOrigins = [
        'http://localhost:3000',
        'http://www.feitengacp.eu',
        'https://www.feitengacp.eu',
        'http://feitengacp.eu',
        'https://feitengacp.eu'
    ];

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
            console.log('❌ No token provided in request');
            return res.sendStatus(401); // If no token, unauthorized
        }

        jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
            if (err) {
                console.log('❌ Invalid or expired token presented.', err.message);
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
        const url = `${base}?client_id=${process.env.CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.REDIRECT_URI)}&response_type=code&force_login=1`;
        res.redirect(url);
    });

    // === Exact OAuth2: Callback Handler ===
    // If lost tokens, call this endpoint to re-authorize. Needs login from client.
    app.get('/oauth/callback', async (req, res) => {
        const { code } = req.query;
        console.log("Authorization code received:", code);
        console.log('Full query:', req.query);

        if (!code) {
            return res.status(400).send('Missing authorization code');
        }

        try {
            // Note: axios.post with params will automatically set Content-Type to application/x-www-form-urlencoded
            const params = new URLSearchParams();
            params.append('grant_type', 'authorization_code');
            params.append('code', code);
            params.append('redirect_uri', process.env.REDIRECT_URI);
            params.append('client_id', process.env.CLIENT_ID);
            params.append('client_secret', process.env.CLIENT_SECRET);

            const tokenResponse = await axios.post(
                'https://start.exactonline.nl/api/oauth2/token',
                params.toString(), 
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                }
            )

            const tokens = tokenResponse.data;
            tokens.expires_at = Date.now() + (tokens.expires_in * 1000); 
            
            await saveTokens(tokens); 

            console.log('✅ OAuth tokens received from Exact:', tokens);
            res.json(tokens); 
                
        } catch (error) { 
            console.error('❌ Error during token exchange:', error.response?.data || error.message);
            res.status(500).send('OAuth failed. See server logs for details.');
        }
    });

    // === API endpoint for login verification ===
    app.post('/api/login', async (req, res) => {
        const { email, password } = req.body; //receive email and password from homepage.js submit form
        console.log(`Login attempt for email: ${email}`);

        try {
            const accessToken = await getAccessToken();
            if (!accessToken) {
                console.error('❌ No Exact Online access token available for login check.');
                return res.status(500).json({ message: 'Server error: Cannot connect to Exact Online for login.' });
            }

            const exactApiUrl = `https://start.exactonline.nl/api/v1/${division}/crm/Contacts`;
            const exactParams = {
                '$filter': `Email eq '${email}' and SocialSecurityNumber ne null`, 
                '$select': 'ID,SocialSecurityNumber,Email,FullName' 
            };

            const exactResponse = await axios.get(exactApiUrl, {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    Accept: 'application/json',
                },
                params: exactParams
            });

            const exactContacts = exactResponse.data.d?.results || []; // Extract results from the response
            /* console.log('--- RAW EXACT ONLINE CRM ACCOUNTS RESPONSE (FOR INSPECTION) ---');
            console.log(JSON.stringify(exactContacts, null, 2));
            console.log('--------------------------------------------------------------'); */


            
            if (exactContacts.length > 0) {
                // Find the account that matches the provided email (case-insensitive for robustness)
                const matchedContact = exactContacts[0] // The filter should only return one.

                if (matchedContact.SocialSecurityNumber === password) {

                    if (!process.env.JWT_SECRET) {
                        console.error('FATAL ERROR: JWT_SECRET is not defined in environment variables.');
                        return res.status(500).json({ message: 'Server configuration error.' });
                    }
                    
                    const user = { id: matchedContact.ID, email: matchedContact.Email, name: matchedContact.FullName };
                    const token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '1h' }); // Create a JWT token with user data

                    await logSuccessfulLogin(email); // print the login to the log file for inspection

                    console.log(`✅ Login successful for ${email}. JWT generated.`);
                    res.json({ message: 'Login successful.', token: token });

                } else {
                    console.log('❌ Password mismatch for email:', email);
                    // Generic error for security. Does not reveal if the email exists or not.
                    return res.status(401).json({ message: 'Invalid credentials.' });
                } 
            } else {
                // This means "no user found with that email that ALSO has a password set".
                console.log('❌ No valid login account found in Exact Online for this email.');
                return res.status(401).json({ message: 'Invalid credentials.' });
            }
        } catch (error) {
                console.error('❌ Error during /api/login:', error.response?.data || error.message);
                return res.status(500).json({ message: 'Server error during login process.' });
        }
    });

    // Example API endpoint to test token retrieval
    app.get('/api/test-token', async (req, res) => {
        const accessToken = await getAccessToken();
        if (accessToken){
            res.json({ message: 'Access token retreived successfully', token: accessToken });
        }else {
            res.status(401).json({ error: 'Failed to retrieve access token' });
        }
    });

    // === Product page API, sync from stockPosition with extra fields for product details ===
    app.get('/api/products', authenticateToken, async (req, res) => {
        try {
           const accessToken = await getAccessToken();
            if (!accessToken) {
                return res.status(401).json({ error: 'Unauthorized - No valid access token' });
            } 
            
            const stockPositionUrl = `https://start.exactonline.nl/api/v1/${division}/sync/Inventory/StockPositions`
            const stockPositionParams = { 
                '$filter': 'Timestamp gt 1',
                '$select': [
                    'ID', //filter ItemExtraField by this
                    'ItemId',
                    'ItemCode',
                    'ItemDescription',
                    'FreeStock',
                    'PlanningIn',
                    'PlanningOut',
                    'ProjectedStock',
                    'Timestamp'
                ].join(',')
             }; 

            // === START OF PAGINATION FIX ===
            let allProducts = [];
            // Construct the full URL with parameters for the first request
            let nextUrl = stockPositionUrl + '?' + new URLSearchParams(stockPositionParams).toString();

            console.log('--- STARTING PAGINATED STOCK PULL ---');

            while (nextUrl) {
                const response = await axios.get(nextUrl, {
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        Accept: 'application/json',
                    },
                });

                const productsOnPage = response.data.d?.results || [];
                allProducts.push(...productsOnPage);
                
                // Get the URL for the next page from the __next link
                nextUrl = response.data.d?.__next; 
                
                if (nextUrl) {
                    console.log(`Fetching next page... (current total: ${allProducts.length})`);
                }
            }
            
            let rawProducts = allProducts; // Use the complete list for filtering

            // === END OF PAGINATION FIX ===

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

            console.log(`Initial products: ${rawProducts.length}, Filtered products: ${filteredProducts.length}`); // Log to see diff in size before and after filter

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

        } catch (error) {
            console.error('❌ Error fetching products from Exact - /api/products:', error.response?.data || error.message);
            res.status(500).json({ error: 'Server error contacting Exact' });
        }
    });


    // --- Static File Serving (for production build) ---
    app.use(express.static(path.resolve(__dirname, '../client/build')));


    // --- Catch-all Route (for Single Page Applications) ---
    app.get('*', (req, res) => {
        res.sendFile(path.resolve(__dirname, '../client/build', 'index.html'));
    });

    // Start the server
    app.listen(port, () => {
        console.log(`Server running on port ${port}`);
    });