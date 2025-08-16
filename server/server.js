    require('dotenv').config(); // Load environment variables from .env file

    const axios = require('axios'); 
    const express = require('express'); 
    const cors = require('cors'); 
    const path = require('path');   
    const jwt = require('jsonwebtoken'); 
    const { Parser } = require('xml2js');
    const parser = new Parser({ explicitArray: false, ignoreAttrs: true });

    const app = express();
    const port = process.env.PORT || 5000; 
    const division = 3555770; // Exact division for Feitengacp
    const fs = require('fs').promises; 
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async function saveTokens(tokens) {
        memoryTokens = tokens; // Store tokens in memory for development on render.com
        console.log('New tokens:', JSON.stringify(tokens, null, 2));// copy into env for new tokens
        console.log('✅ Tokens saved in memory for development');

/*      try{
            await fs.writeFile('tokens.json', JSON.stringify(tokens, null, 2), 'utf-8' );
            console.log('✅ Tokens saved to tokens.json');
        }catch (err){
            console.error('❌ Error saving tokens:', err);
        } */
    }

    let memoryTokens = null; // Variable to store tokens in memory for development on render.com
    

    async function readTokens() {
        if (memoryTokens) return memoryTokens; // Return in-memory tokens if available

        // Try loading tokens from render.com memory/env
        if (process.env.TOKENS_JSON) {
            try {
                memoryTokens = JSON.parse(process.env.TOKENS_JSON);
                console.log('✅ Tokens loaded from environment variable');
                return memoryTokens;
            } catch (err) {
                console.error('❌ Error parsing tokens from environment variable:', err);
                return null; // Return null if parsing fails
            }
        }

        /*try {
            const data = await fs.readFile('tokens.json', 'utf-8');
            return JSON.parse(data);
        } catch (err) {
            console.error('❌ Error reading tokens:', err);
            return null; // Return null if file doesn't exist or can't be read
        } */
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

    //  --- Middleware ---
    app.use(cors()); // Enable CORS for all routes - Crucial for development across different origins
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

    // Uncomment the next line when build React app for production
    // app.use(express.static(path.join(__dirname, '../client/build')));


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

    // --- API Routes ---
    // account bulk extract for data -- crm/Contact is correct route for BSN.
    app.get('/api/dump-accounts', async (req, res) => {
        try {
            const accessToken = await getAccessToken();
            if (!accessToken) {
                return res.status(500).json({ message: 'Server error: Cannot connect to Exact Online.' });
            }

            let allContacts = [];

            const selectFields = 'ID,Email,FirstName,LastName,FullName,SocialSecurityNumber';
            const filterQuery = 'SocialSecurityNumber ne null'; // Filter out contacts without BSN
            let nextUrl = `https://start.exactonline.nl/api/v1/${division}/crm/Contacts?$select=${selectFields}&$filter=${filterQuery}`;

            console.log('--- STARTING CONTACTS DUMP (SSN NOT NULL!) ---');
            console.log(`Fetching accounts from: ${nextUrl.split`?`[0]}`); // base URL without query params

            while (nextUrl) {
                const exactResponse = await axios.get(nextUrl, {
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        Accept: 'application/json',
                    },
                });

                const contactsOnPage = exactResponse.data.d?.results || [];
                allContacts.push(...contactsOnPage);

                // The API provides a `__next` property with the URL for the next page
                nextUrl = exactResponse.data.d?.__next;
                if (nextUrl) {
                    console.log(`Fetching next page: ${nextUrl}`);
                }
            }
            
            console.log('--- RAW EXACT ONLINE CRM CONTACTS RESPONSE (COMPLETE DUMP) ---');
            console.log(JSON.stringify(allContacts, null, 2));
            console.log(`------------------- END OF DUMP: ${allContacts.length} contacts found -------------------`);

            res.json({ message: `Successfully dumped ${allContacts.length} contacts. Check server logs.` });

        } catch (error) {
            console.error('❌ Error during /api/dump-accounts:', error.response?.data || error.message);
            res.status(500).json({ message: 'Server error during contacts dump.' });
        }
    });

    // ===API endpoint for login verification===
    app.post('/api/login', async (req, res) => {
        const { email, password } = req.body; //receive email and password from homepage.js submit form
        console.log(`Login attempt for email: ${email}, password: ${password}`);//REMOVE PASSWORD IN PRODUCTION, ONLY FOR TESTING

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
            console.log('--- RAW EXACT ONLINE CRM ACCOUNTS RESPONSE (FOR INSPECTION) ---');
            console.log(JSON.stringify(exactContacts, null, 2));
            console.log('--------------------------------------------------------------');


            
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

    // Product page API, sync from stockPosition with extra fields for product details
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
                if (typeof code !== 'string') return false;

                if (code.toUpperCase().includes('EBRI')) {
                    return false;
                }

                if (code.startsWith('9')) {
                    const freeStock = parseInt(product.FreeStock) || 0;
                    const expectedStock = parseInt(product.ProjectedStock) || 0;
                    if (freeStock === 0 || expectedStock === 0) {
                        return false;
                    }
                }
                
                const startsWithExcluded = excludePrefixes.some(prefix => code.startsWith(prefix));
                if (startsWithExcluded) {
                    return false;
                }

                // If none of the above rules apply, keep the product
                return true;
            });

            console.log(`Initial products: ${rawProducts.length}, Filtered products: ${filteredProducts.length}`); // Log to see diff in size before and after filter

            /* //Array of promises to fetch extra fields for each product
            const extraFieldPromises = filteredProducts.map(async (product, index) =>{
                const itemIDForExtraField = product.ItemId; //Guid to call extra field for filtered products - ItemId stockPosition matches ItemID in ItemExtraField

                const extraFieldUrl= `https://start.exactonline.nl/api/v1/${division}/read/logistics/ItemExtraField`;
                const fullUrl = `${extraFieldUrl}?itemId=guid'${itemIDForExtraField}'`;

                await sleep(index * 100) // Set a delay to avoid hitting API rate limits

                // 🔍 DEBUG LOG: Print the exact request being made
                //console.log(`🔍 Manually constructed URL: ${fullUrl}`);

                try {
                    const response = await axios.get(fullUrl, {
                        headers: {
                            Authorization: `Bearer ${accessToken}`,
                            Accept: 'application/json',
                        },
                    });
                    return response;
                }catch(err ) {
                    const apiErrorData = err.response?.data; // This is the key part!
                    const status = err.response?.status;
                    const statusText = err.response?.statusText;

                    console.error(
                        `Failed to fetch extra fields for ItemID ${itemIDForExtraField}. Status: ${status} ${statusText}. Details:`,
                        apiErrorData || err.message // Log the data or the generic message as a fallback
                    );
                    return null;
                };
            });

            // Execute all promises and wait for results
            const extraFieldsResponses = await Promise.all(extraFieldPromises);

            const extraFieldsMap = new Map(); // Map to store extra fields by ItemId
            extraFieldsResponses.forEach(response => {
                if (response && response.data && response.data.d) {
                    const results = response.data.d.results || [];// Extract results from the response

                    // ✅ NEW DEBUG LOG: Log the raw results array from ItemExtraField
                    console.log(`🔍 ItemExtraField API response for ItemID: ${response.data.d.ItemID || 'N/A'}:`, JSON.stringify(results, null, 2));

                    // ✅ DEBUG: log every field's metadata
                    results.forEach(field => {
                        console.log(`ItemID: ${field.ItemID}, Description: ${field.Description}, Value: ${field.Value}`);
                    });

                    results.forEach(field => {
                        const lowerDesc = field.Description?.toLowerCase?.() || '';
                        if (!extraFieldsMap.has(field.ItemID)){
                            extraFieldsMap.set(field.ItemID, {});
                        }
                        // Assuming descript is 'materiaal' from image benjamin
                        if (lowerDesc.includes('materiaal')) {
                            extraFieldsMap.get(field.ItemID)['Type of Skin'] = field.Value;
                        } else if (lowerDesc.includes('hoogte')) {
                            extraFieldsMap.get(field.ItemID)['Height'] = field.Value;
                        } else if (lowerDesc.includes('dikte')) {
                            extraFieldsMap.get(field.ItemID)['Thickness'] = field.Value;
                        } else if (lowerDesc.includes('breedte')) {
                            extraFieldsMap.get(field.ItemID)['Width'] = field.Value;
                        }
                    });                 
                }
            });*/

            const products = filteredProducts.map(r => {
                //const extraData = extraFieldsMap.get(r.ItemId) || {}; // ItemId stockPosition matches ItemID in ItemExtraField
                return {
                    id: r.ItemId,
                    "Item Code":      r.ItemCode,
                    "Item Description": r.ItemDescription,
                    "Free Stock":     r.FreeStock,
                    "Planned In":     r.PlanningIn,
                    "Planning Out":   r.PlanningOut,
                    "Expected Stock": r.ProjectedStock,
                    //"Type of Skin": extraData['Type of Skin'] || 'NA',
                    //"Height":       extraData['Height'] || 'NA',
                    //"Thickness":    extraData['Thickness'] || 'NA',
                    //"Width":        extraData['Width'] || 'NA',
                };
            }); 

            // Dump it to  logs to inspect
            //console.log('fitlered sync API response:', JSON.stringify(products, null, 2));
            //console.log(`✅ Successfully enriched ${products.length} products with extra fields.`);
            res.json(products); // Send the products data as JSON response

        } catch (error) {
            console.error('❌ Error fetching products from Exact - /api/products:', error.response?.data || error.message);
            res.status(500).json({ error: 'Server error contacting Exact' });
        }
    });

    // A robust route that can handle either an XML or JSON response
    app.get('/api/test-extra-fields', authenticateToken, async (req, res) => {
        try {
            const accessToken = await getAccessToken();
            if (!accessToken) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            const knownGoodItemId = '8238316a-e168-479c-a71e-426615b8f2d9';
            const testUrl = `https://start.exactonline.nl/api/v1/${division}/read/logistics/ItemExtraField?itemId=guid'${knownGoodItemId}'`;

            console.log(`--- RUNNING ROBUST EXTRA FIELD TEST ---`);
            console.log(`🔍 Calling URL: ${testUrl}`);

            const exactResponse = await axios.get(testUrl, {
                responseType: 'text' // We always want the raw string
            });

            const responseData = exactResponse.data;
            let results = [];

            console.log('✅ Raw text response received. Checking format...');

            // --- KEY LOGIC: Check if the response is XML or JSON ---
            if (responseData && responseData.trim().startsWith('<')) {
                console.log("Response format is XML. Parsing with xml2js...");
                const jsonData = await parser.parseStringPromise(responseData);
                results = jsonData.ItemExtraField.element || [];
            } else {
                console.log("Response format is JSON. Parsing with JSON.parse()...");
                try {
                    // It's a JSON string, so we parse it normally.
                    const jsonData = JSON.parse(responseData);
                    results = jsonData.d?.results || [];
                } catch (e) {
                    console.error("Failed to parse the response as JSON.", e);
                }
            }

            console.log('✅ Response successfully parsed. Result:');
            console.log(JSON.stringify(results, null, 2));
            console.log(`--- END OF TEST: ${results.length} fields found ---`);

            res.json({ message: 'Test finished. Response parsed successfully.', data: results });

        } catch (error) {
            console.error('❌ Error during /api/test-extra-fields:', error.response?.data || error.message);
            res.status(500).json({ message: 'Server error during extra field test.' });
        }
    });


    // --- Static File Serving (for production build) ---
    app.use(express.static(path.resolve(__dirname, '../client/build')));


    // --- Catch-all Route (for Single Page Applications) ---
    /* app.get('*', (req, res) => {
        res.sendFile(path.resolve(__dirname, '../client/build', 'index.html'));
    }); */

    // Start the server
    app.listen(port, () => {
        console.log(`Server running on port ${port}`);
    });