// Dates the way Ad reads them: dd/mm/yyyy (2026-10-07). Mirrors server/dates.js.

// 'YYYY-MM-DD' of today in the browser's local time — the <input type="date"> floor.
export const todayISO = () => new Date().toLocaleDateString('sv-SE'); // sv-SE formats as ISO

// 'YYYY-MM-DD' (as stored) → '07/10/2026'.
export const fmtDay = (iso) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso || '—');
};

// epoch ms → '07/10/2026' / '07/10/2026, 16:09'.
export const fmtDate = (ms) => new Date(ms).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
export const fmtDateTime = (ms) => new Date(ms).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
