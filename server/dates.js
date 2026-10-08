// Date formatting + "today" for the order flow. Ad reads dates as dd/mm/yyyy (2026-10-07);
// the VPS clock is UTC, so anything shown to people is pinned to Europe/Amsterdam.
// Mirrored (minus the server-only bits) in client/src/dates.js.

const TZ = 'Europe/Amsterdam';

// 'YYYY-MM-DD' of today in the Netherlands — the floor for a requested shipping date.
function todayISO() {
    return new Date().toLocaleDateString('sv-SE', { timeZone: TZ }); // sv-SE formats as ISO
}

// 'YYYY-MM-DD' (how desired_ship_date is stored) → '07/10/2026'. Anything else passes through.
function fmtDay(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso || '—');
}

// epoch ms → '07/10/2026, 16:09' in Dutch local time.
function fmtDateTime(ms) {
    return new Date(ms).toLocaleString('en-GB', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

module.exports = { todayISO, fmtDay, fmtDateTime };
