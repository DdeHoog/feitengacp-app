// The forecast's planning window (rework 2026-10-12, Damian): the 12 months AFTER the
// current one. This month is excluded on purpose — whatever ships now has been ordered
// already; a forecast is about what comes next (Ad: ≥ 3 months production + shipping lead
// time, so plan at least 6 ahead). "Now" is Dutch local time (the VPS runs UTC), via
// dates.js. Client mirror: the window comes back in GET /api/forecast, never recomputed
// in the browser.

const { todayISO } = require('./dates');

const WINDOW_MONTHS = 12;

// year*100+month — a sortable integer key so a range spanning the year end is one BETWEEN.
const ymKey = (year, month) => year * 100 + month;

function currentWindow() {
    const [y, m] = todayISO().split('-').map(Number);
    const months = [];
    let year = y;
    let month = m;
    for (let i = 0; i < WINDOW_MONTHS; i += 1) {
        month += 1;
        if (month > 12) { month = 1; year += 1; }
        months.push({ year, month });
    }
    const first = months[0];
    const last = months[months.length - 1];
    return { months, fromYM: ymKey(first.year, first.month), toYM: ymKey(last.year, last.month) };
}

module.exports = { WINDOW_MONTHS, ymKey, currentWindow };
