// Order-notification email via Microsoft Graph (sendMail over HTTPS). We use Graph,
// not SMTP, because the VPS blocks outbound mail ports. App-only (client-credentials)
// auth; the access token is cached until it nears expiry. If Graph isn't configured
// (env unset), sending is skipped — orders still persist (the DB is the source of truth).

const axios = require('axios');
const config = require('./config');
const logger = require('./logger');

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

function renderHtml(order, lines, { heading, intro } = {}) {
    const rows = lines.map((l) => `
        <tr>
            <td style="padding:4px 10px;border-bottom:1px solid #eee">${esc(l.article_code)}</td>
            <td style="padding:4px 10px;border-bottom:1px solid #eee">${esc(l.description)}</td>
            <td style="padding:4px 10px;border-bottom:1px solid #eee;text-align:right">${esc(l.quantity)}</td>
        </tr>`).join('');
    const field = (label, value) => `<p style="margin:2px 0"><strong>${label}:</strong> ${esc(value) || '—'}</p>`;
    return `
        <div style="font-family:Arial,sans-serif;font-size:14px;color:#222">
            <h2 style="color:#004EA2">${esc(heading || `Nieuwe order ${order.our_reference}`)}</h2>
            ${intro ? `<p style="margin:0 0 10px">${esc(intro)}</p>` : ''}
            ${field('Bedrijf', order.company_name)}
            ${field('Debiteurnr', order.debtor_number)}
            ${field('Besteller', order.orderer_name)}
            ${field('E-mail', order.orderer_email)}
            ${field('Telefoon', order.phone)}
            ${field('Klant-referentie', order.customer_reference)}
            ${field('Gewenste verzenddatum', order.desired_ship_date)}
            ${field('Besteldatum', new Date(order.created_at).toLocaleString('nl-NL'))}
            <p style="margin:8px 0 2px"><strong>Afleveradres:</strong></p>
            <p style="margin:0;white-space:pre-line">${esc(order.delivery_address)}</p>
            <table style="border-collapse:collapse;margin-top:12px;min-width:420px">
                <thead>
                    <tr style="text-align:left;color:#555">
                        <th style="padding:4px 10px;border-bottom:2px solid #ccc">Artikel</th>
                        <th style="padding:4px 10px;border-bottom:2px solid #ccc">Omschrijving</th>
                        <th style="padding:4px 10px;border-bottom:2px solid #ccc;text-align:right">Aantal</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
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
        `Nieuwe order ${order.our_reference} — ${order.company_name || ''}`.trim(),
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
        `Bevestiging van uw order ${order.our_reference}`,
        renderHtml(order, lines, {
            heading: `Bevestiging van uw order ${order.our_reference}`,
            intro: 'Bedankt voor uw bestelling. Hieronder vindt u een overzicht van uw order. Wij nemen zo spoedig mogelijk contact met u op.',
        })
    );
    return true;
}

module.exports = { sendOrderEmail, sendCustomerCopy, enabled };
