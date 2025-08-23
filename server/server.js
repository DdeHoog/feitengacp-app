    require('dotenv').config(); // Load environment variables from .env file

    
    const axios = require('axios'); 
    const express = require('express'); 
    const cors = require('cors'); 
    const path = require('path');   
    const jwt = require('jsonwebtoken'); 
    const { Parser } = require('xml2js');
    const TOKEN_PATH = path.join(__dirname, 'tokens.json');
    const parser = new Parser({ explicitArray: false, ignoreAttrs: true });

    const app = express();
    const port = process.env.PORT || 5000; 
    const division = 3555770; // Exact division for Feitengacp
    const fs = require('fs').promises; 
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // For parsin description
    const KNOWN_COLORS = ['Ivorywhite', 'Yellow', 'Orange', 'Red', 'Blue', 'Green', 'Grey', 'Lightgrey', 'Traffic grey', 'Brown', 'Black', 'Silver metallic', 'Bronze', 'Copper', 'Gold', 'Whiteboard', 'White', 'ALU BF', 'BF'];
    const KNOWN_THICKNESSES = ['2mm', '3mm', '4mm', '6mm', '8mm'];
    const KNOWN_SKIN_TYPES = ['ECO', 'LITE', 'PLUS', 'PREMIUM', 'BUILDING GRADE'];

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

        // --- First Pass: Find Color, Thickness, and Skin Type ---
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
            const skinTypeRegex = new RegExp(`\\b${skinType.replace(' ', '\\s')}\\b`, 'i');
            if (skinTypeRegex.test(description)) {
                parsedData.typeOfSkin = skinType;
                break;
            }
        }

        // --- Second Pass (Conditional): Parse Dimensions if Color is White ---
        if (parsedData.color.toUpperCase() === 'WHITE' && typeof itemCode === 'string') {
            // Regex captures the last four digits as two separate groups of two. e.g., '30' and '50' from '...3050'.
            const match = itemCode.match(/(\d{2})(\d{2})$/);
            
            if (match) {
                const lengthCode = parseInt(match[1], 10);
                const widthCode = parseInt(match[2], 10); 

                // Calculate Length based on the rule: (XX * 100) + 50
                const calculatedLength = (lengthCode * 100) + 50;
                parsedData.length = `${calculatedLength}mm`; // e.g., "3050mm"

                // Calculate Width based on the special cases
                if (widthCode === 12) {
                    parsedData.width = '1250mm';
                } else {
                    // For all other cases like 15, 20, etc., multiply by 100
                    const calculatedWidth = widthCode * 100;
                    parsedData.width = `${calculatedWidth}mm`; // e.g., "1500mm", "2000mm"
                }
            }
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

            const {data: payload } = await axios.get(stockPositionUrl, {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    Accept: 'application/json',
                },
                params: stockPositionParams
            });

            
            
            let rawProducts = payload.d?.results || []; // Extract results from the response

            // To be filtered itemCodes
            const excludePrefixes = [  
                '20', '21', '22', '30', '317', '32', '33', '35', '60', '61', '615', '62', '62', '63', '63', '645', '65', '66', '71', '777', '97', '98', '981', '982', '230.ALUBF'
            ]; 

            // filter out unused products BEFORE calling extraFields
            const filteredProducts = rawProducts.filter(product => {
                const code = product.ItemCode;
                const freeStock = parseInt(product.FreeStock) || 0;
                const expectedStock = parseInt(product.ProjectedStock) || 0;
                const plannedIn = parseInt(product.PlanningIn) || 0;

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

                if (freeStock === 0 && plannedIn === 0 && expectedStock === 0) {
                    return false;
                }

                // If none of the above rules apply, keep the product
                return true;
            });

            console.log(`Initial products: ${rawProducts.length}, Filtered products: ${filteredProducts.length}`); // Log to see diff in size before and after filter

            const products = filteredProducts.map(r => {
                const parsedData = parseProductDescription(r.ItemDescription, r.ItemCode);
                return {
                    id: r.ItemId,
                    "Item Code":      r.ItemCode,
                    "Item Description": r.ItemDescription,
                    "Free Stock":     r.FreeStock,
                    "Planned In":     r.PlanningIn,
                    "Planning Out":   r.PlanningOut,
                    "Expected Stock": r.ProjectedStock,
                    "Type of Skin": parsedData.typeOfSkin,
                    "Thickness":    parsedData.thickness,
                    "Color":        parsedData.color,
                    "Length":         parsedData.length || '',
                    "Width":          parsedData.width || '',
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