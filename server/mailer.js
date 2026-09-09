// Order-notification email via Microsoft Graph (sendMail over HTTPS). We use Graph,
// not SMTP, because the VPS blocks outbound mail ports. App-only (client-credentials)
// auth; the access token is cached until it nears expiry. If Graph isn't configured
// (env unset), sending is skipped — orders still persist (the DB is the source of truth).

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const config = require('./config');
const logger = require('./logger');

// Footer banner, embedded as an inline (cid:) attachment — remote <img> URLs are
// blocked by default in most mail clients, base64 src doesn't render in Outlook.
const BANNER_PATH = path.join(__dirname, 'data', 'banner.png');
let bannerBase64 = null;
try {
    bannerBase64 = fs.readFileSync(BANNER_PATH).toString('base64');
} catch (err) {
    logger.warn({ path: BANNER_PATH }, 'Mail banner not found — sending without it');
}

const { tenantId, clientId, clientSecret, mailFrom, mailTo } = config.graph;
const enabled = !!(tenantId && clientId && clientSecret && mailFrom && mailTo);

let cachedToken = null; // { token, expiresAt }

async function getToken() {
    if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token;
    const body = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials',
    });
    const res = await axios.post(
        `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
        body.toString(),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15_000 }
    );
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

function renderHtml(order, lines, { heading, intro, signoff = false } = {}) {
    const rows = lines.map((l) => `
        <tr>
            <td style="padding:4px 10px;border-bottom:1px solid #eee">${esc(l.article_code)}</td>
            <td style="padding:4px 10px;border-bottom:1px solid #eee">${esc(l.description)}</td>
            <td style="padding:4px 10px;border-bottom:1px solid #eee;text-align:right">${esc(l.quantity)}</td>
        </tr>`).join('');
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
            ${field('Requested shipping date', order.desired_ship_date)}
            ${field('Date of order', new Date(order.created_at).toLocaleString('en-GB'))}
            <p style="margin:8px 0 2px"><strong>Delivery address:</strong></p>
            <p style="margin:0;white-space:pre-line">${esc(order.delivery_address)}</p>
            <table style="border-collapse:collapse;margin-top:12px;min-width:420px">
                <thead>
                    <tr style="text-align:left;color:#555">
                        <th style="padding:4px 10px;border-bottom:2px solid #ccc">Article</th>
                        <th style="padding:4px 10px;border-bottom:2px solid #ccc">Description</th>
                        <th style="padding:4px 10px;border-bottom:2px solid #ccc;text-align:right">Quantity</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
            ${signoff ? SIGNOFF : ''}
            ${bannerBase64 ? '<p style="margin:20px 0 0"><img src="cid:feitengbanner" alt="Feiteng Composites (Europe) B.V." width="724" style="max-width:100%;height:auto;display:block"></p>' : ''}
        </div>`;
}

async function send(to, subject, html) {
    const token = await getToken();
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

module.exports = { sendOrderEmail, sendCustomerCopy, enabled };
