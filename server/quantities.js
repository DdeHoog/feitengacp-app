// Order quantities are entered in PALLETS (Ad, 2026-09-22): "het aantal platen ingeven is
// teveel werk". Sheets are derived from the article's pallet size at order time and
// snapshotted on the line. Mirrored in client/src/quantities.js — keep the two in sync.

// Ad: "maximaal 50 pallets in 1 order" — the cap is per order in total, and doubles as
// the guard against a sheet count being typed into the pallet field.
const MAX_PALLETS_PER_ORDER = 50;
// Ad: no pallet size in Exact → "hanteer 50 stuks en mededeling t.b.c." The placeholder
// is never stored; the line keeps pallet_qty = NULL and every display derives from this.
const ASSUMED_PALLET_QTY = 50;

// Sheets for a stored/submitted line { quantity, unit, pallet_qty }. Lines from before
// pallet ordering (unit 'sheet') were entered in sheets. `tbc` = pallet size unknown.
function sheetsForLine(line) {
    if (line.unit !== 'pallet') return { sheets: line.quantity, tbc: false };
    return { sheets: line.quantity * (line.pallet_qty ?? ASSUMED_PALLET_QTY), tbc: line.pallet_qty == null };
}

module.exports = { MAX_PALLETS_PER_ORDER, ASSUMED_PALLET_QTY, sheetsForLine };
