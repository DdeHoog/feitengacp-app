// Order-notification email via Microsoft Graph (sendMail over HTTPS). We use Graph,
// not SMTP, because the VPS blocks outbound mail ports. App-only (client-credentials)
// auth; the access token is cached until it nears expiry. If Graph isn't configured
// (env unset), sending is skipped — orders still persist (the DB is the source of truth).

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const config = require('./config');
const logger = require('./logger');
const { sheetsForLine, ASSUMED_PALLET_QTY } = require('./quantities');
const { fmtDay, fmtDateTime } = require('./dates');

// Footer banner, embedded as an inline (cid:) attachment — remote <img> URLs are
// blocked by default in most mail clients, base64 src doesn't render in Outlook.
const BANNER_PATH = path.join(__dirname, 'data', 'banner.png');
let bannerBase64 = null;
try {
    bannerBase64 = fs.readFileSync(BANNER_PATH).toString('base64');
} catch (err) {
    logger.warn({ path: BANNER_PATH }, 'Mail banner not found — sending without it');
}

const { tenantId, clientId, clientSecret, certKeyPath, certPath, secretExpires, mailFrom, mailTo } = config.graph;

// === Credential ===
// Client-credentials flow: the app authenticates ITSELF on every token request, so there
// is no refresh token — the credential is the long-lived thing, and Entra makes it expire.
// Preferred: a certificate we generated (lifetime is ours, private key stays on the VPS),
// presented as a signed JWT "client assertion". Fallback: the client secret Novuss issued.
let cert = null; // { key, x5t, validTo }
if (certKeyPath && certPath) {
    try {
        const x509 = new crypto.X509Certificate(fs.readFileSync(certPath));
        cert = {
            key: fs.readFileSync(certKeyPath, 'utf8'),
            // Entra matches the certificate by its SHA-1 thumbprint in the JWT header (base64url).
            x5t: Buffer.from(x509.fingerprint.replace(/:/g, ''), 'hex').toString('base64url'),
            validTo: new Date(x509.validTo),
        };
    } catch (err) {
        logger.error({ err: err.message, certPath, certKeyPath }, 'Graph certificate unusable — falling back to the client secret');
    }
}
const method = cert ? 'certificate' : (clientSecret ? 'secret' : null);
const enabled = !!(tenantId && clientId && method && mailFrom && mailTo);

const parseDate = (s) => { const d = s ? new Date(s) : null; return d && !Number.isNaN(d.getTime()) ? d : null; };
const expiresAt = cert ? cert.validTo : parseDate(secretExpires);
const daysLeft = () => (expiresAt ? Math.floor((expiresAt.getTime() - Date.now()) / 86_400_000) : null);

let lastError = null; // { at, message } of the most recent failed token request or send

// What the admin page shows: which credential, when it runs out, what last went wrong.
function status() {
    return { enabled, method, expiresAt: expiresAt ? expiresAt.toISOString().slice(0, 10) : null, daysLeft: daysLeft(), lastError };
}

// Boot-time reminder — the one moment someone reliably reads the log.
if (enabled) {
    const days = daysLeft();
    const ctx = { method, expiresAt: status().expiresAt, daysLeft: days };
    if (days == null) logger.warn(ctx, 'Graph mail credential expiry unknown — set GRAPH_SECRET_EXPIRES or switch to a certificate');
    else if (days < 0) logger.error(ctx, 'Graph mail credential EXPIRED — order e-mails fail until it is renewed');
    else if (days <= 30) logger.warn(ctx, 'Graph mail credential expires soon');
    else logger.info(ctx, 'Graph mail credential');
}

// Signed JWT proving we hold the certificate's private key (RFC 7523 / Entra "client
// assertion"). Short-lived and single-use (jti) — Entra rejects replays.
function clientAssertion() {
    const now = Math.floor(Date.now() / 1000);
    return jwt.sign(
        { aud: `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, iss: clientId, sub: clientId, jti: crypto.randomUUID(), nbf: now, exp: now + 300 },
        cert.key,
        { algorithm: 'RS256', header: { x5t: cert.x5t } }
    );
}

// Entra error codes worth naming plainly (the raw description is a wall of text).
const KNOWN_ERRORS = [
    ['AADSTS7000222', 'client secret has expired'],
    ['AADSTS7000215', 'client secret is invalid (wrong value, or it was rotated)'],
    ['AADSTS700027', 'certificate not accepted (thumbprint unknown to the app registration, or bad signature)'],
    ['AADSTS700024', 'client assertion expired (server clock skew?)'],
];
function recordError(err, what) {
    const desc = err.response?.data?.error_description || err.response?.data?.error?.message || err.message || String(err);
    const known = KNOWN_ERRORS.find(([code]) => desc.includes(code));
    const message = known ? `${known[1]} (${known[0]})` : desc.split(/\r?\n/)[0].slice(0, 300);
    lastError = { at: new Date().toISOString(), message };
    logger.error({ what, method, message }, 'Graph mail failed');
}

let cachedToken = null; // { token, expiresAt }

async function getToken() {
    if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token;
    const body = new URLSearchParams({ client_id: clientId, scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials' });
    if (cert) {
        body.set('client_assertion_type', 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer');
        body.set('client_assertion', clientAssertion());
    } else {
        body.set('client_secret', clientSecret);
    }
    let res;
    try {
        res = await axios.post(
            `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
            body.toString(),
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15_000 }
        );
    } catch (err) {
        recordError(err, 'token');
        throw err;
    }
    cachedToken = { token: res.data.access_token, expiresAt: Date.now() + res.data.expires_in * 1000 };
    return cachedToken.token;
}

const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

// Company details mirror the site footer (client/src/components/Layout.js).
const SIGNOFF = `
    <p style="margin:18px 0 2px">Kind regards,</p>
    <p style="margin:0 0 10px"><strong>Feiteng Composites (Europe) B.V.</strong></p>
    <p style="margin:0;color:#555;font-size:13px;line-height:1.5">
        Industriestraat 4<br>
        5804 CK Venray<br>
        The Netherlands<br>
        Phone: +31 (0)85 016 1962<br>
        Email: <a href="mailto:sales@feitengacp.eu" style="color:#004EA2">sales@feitengacp.eu</a>
    </p>`;

// Lines are in pallets (Ad, 2026-09-22) with the derived sheet count beside them —
// "3 pallets (210 sheets)" is what he asked to see; "t.b.c." marks a line whose pallet
// size isn't registered in Exact (sheets then assume ASSUMED_PALLET_QTY per pallet).
function renderHtml(order, lines, { heading, intro, signoff = false } = {}) {
    const cell = 'padding:4px 10px;border-bottom:1px solid #eee';
    const rows = lines.map((l) => {
        const { sheets, tbc } = sheetsForLine(l);
        return `
        <tr>
            <td style="${cell}">${esc(l.article_code)}</td>
            <td style="${cell}">${esc(l.description)}</td>
            <td style="${cell};text-align:right">${l.unit === 'pallet' ? esc(l.quantity) : '—'}</td>
            <td style="${cell};text-align:right">${esc(sheets.toLocaleString('en-GB'))}${tbc ? ' <em>t.b.c.</em>' : ''}</td>
        </tr>`;
    }).join('');
    const anyTbc = lines.some((l) => sheetsForLine(l).tbc);
    const field = (label, value) => `<p style="margin:2px 0"><strong>${label}:</strong> ${esc(value) || '—'}</p>`;
    return `
        <div style="font-family:Arial,sans-serif;font-size:14px;color:#222">
            <h2 style="color:#004EA2">${esc(heading || `New order ${order.our_reference}`)}</h2>
            ${intro ? `<p style="margin:0 0 10px">${esc(intro)}</p>` : ''}
            ${field('Company name', order.company_name)}
            ${field('Customer number', order.debtor_number)}
            ${field('Name of Purchaser', order.orderer_name)}
            ${field('E-mail', order.orderer_email)}
            ${field('Telephone', order.phone)}
            ${field('Your reference / order number', order.customer_reference)}
            ${field('Requested shipping date', fmtDay(order.desired_ship_date))}
            ${field('Date of order', fmtDateTime(order.created_at))}
            <p style="margin:8px 0 2px"><strong>Delivery address:</strong></p>
            <p style="margin:0;white-space:pre-line">${esc(order.delivery_address)}</p>
            <table style="border-collapse:collapse;margin-top:12px;min-width:420px">
                <thead>
                    <tr style="text-align:left;color:#555">
                        <th style="padding:4px 10px;border-bottom:2px solid #ccc">Article</th>
                        <th style="padding:4px 10px;border-bottom:2px solid #ccc">Description</th>
                        <th style="padding:4px 10px;border-bottom:2px solid #ccc;text-align:right">Pallets</th>
                        <th style="padding:4px 10px;border-bottom:2px solid #ccc;text-align:right">Sheets</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
            ${anyTbc ? `<p style="margin:6px 0 0;color:#555;font-size:12px"><em>t.b.c.</em> = exact quantity to be confirmed: no pallet size is registered for this article, so ${ASSUMED_PALLET_QTY} sheets per pallet were assumed.</p>` : ''}
            ${signoff ? SIGNOFF : ''}
            ${bannerBase64 ? '<p style="margin:20px 0 0"><img src="cid:feitengbanner" alt="Feiteng Composites (Europe) B.V." width="724" style="max-width:100%;height:auto;display:block"></p>' : ''}
        </div>`;
}

async function send(to, subject, html) {
    const token = await getToken();
    try {
        await sendMail(token, to, subject, html);
        lastError = null;
    } catch (err) {
        recordError(err, 'send');
        throw err;
    }
}

async function sendMail(token, to, subject, html) {
    await axios.post(
        `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailFrom)}/sendMail`,
        {
            message: {
                subject,
                body: { contentType: 'HTML', content: html },
                toRecipients: to.map((address) => ({ emailAddress: { address } })),
                ...(bannerBase64 && {
                    attachments: [{
                        '@odata.type': '#microsoft.graph.fileAttachment',
                        name: 'banner.png',
                        contentType: 'image/png',
                        isInline: true,
                        contentId: 'feitengbanner',
                        contentBytes: bannerBase64,
                    }],
                }),
            },
            saveToSentItems: true,
        },
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, timeout: 20_000 }
    );
}

// Order notification to sales@. Throws on failure so the caller records
// email_status='failed'. Returns false (no throw) when Graph isn't configured.
async function sendOrderEmail(order, lines) {
    if (!enabled) {
        logger.warn({ our_reference: order.our_reference }, 'Graph mail not configured — skipping order email');
        return false;
    }
    // MAIL_TO may hold several comma-separated addresses.
    const recipients = mailTo.split(',').map((s) => s.trim()).filter(Boolean);
    await send(
        recipients,
        `New order ${order.our_reference} — ${order.company_name || ''}`.trim(),
        renderHtml(order, lines)
    );
    return true;
}

// Confirmation copy to the customer who placed the order. Sent separately (not CC)
// so it reads as a confirmation rather than an internal notification. Best-effort:
// its failure is logged but doesn't affect the order's email_status.
async function sendCustomerCopy(order, lines) {
    if (!enabled || !order.orderer_email) return false;
    await send(
        [order.orderer_email],
        `Confirmation of your order request ${order.our_reference}`,
        renderHtml(order, lines, {
            heading: `Confirmation of your order request ${order.our_reference}`,
            intro: 'Many thanks for your order. Below find the details of your order. We will contact you a.s.a.p.',
            signoff: true, // customer-facing; the internal sales@ notification doesn't need one
        })
    );
    return true;
}

module.exports = {
    sendOrderEmail, sendCustomerCopy, enabled, status,
    renderHtml, _clientAssertion: () => (cert ? clientAssertion() : null), // exported for tests
};
