// Order quantities are entered in pallets (Ad, 2026-09-22); sheets are derived from the
// article's pallet size ("Pallet QTY" in the stock table). Mirrors server/quantities.js
// — keep the two in sync. The server re-derives and snapshots; these are for display.

export const MAX_PALLETS_PER_ORDER = 50; // per order in total (Ad), also caps each line
export const ASSUMED_PALLET_QTY = 50;    // no pallet size registered → assume 50, say "t.b.c."

export const TBC_HINT = `No pallet size registered for this article — ${ASSUMED_PALLET_QTY} sheets per pallet assumed; the exact quantity is to be confirmed by sales.`;

const fmt = (n) => Number(n).toLocaleString('en-GB');

// Sheets for `pallets` of an article with pallet size `palletQty` (null = unknown).
export const sheetsFor = (pallets, palletQty) => ({
    sheets: pallets * (palletQty ?? ASSUMED_PALLET_QTY),
    tbc: palletQty == null,
});

// "210 sheets" / "150 sheets (t.b.c.)"
export const formatSheets = (pallets, palletQty) => {
    const { sheets, tbc } = sheetsFor(pallets, palletQty);
    return `${fmt(sheets)} sheets${tbc ? ' (t.b.c.)' : ''}`;
};

// Sheet text for a stored order line; lines from before pallet ordering hold sheets.
export const sheetsOfLine = (line) => (
    line.unit === 'pallet' ? formatSheets(line.quantity, line.pallet_qty) : `${fmt(line.quantity)} sheets`
);

// One-cell summary: "3 pallets (210 sheets)" / "3 pallets (150 sheets, t.b.c.)" / "120 sheets"
export const formatLine = (line) => {
    if (line.unit !== 'pallet') return `${fmt(line.quantity)} sheets`;
    const { sheets, tbc } = sheetsFor(line.quantity, line.pallet_qty);
    return `${line.quantity} pallet${line.quantity === 1 ? '' : 's'} (${fmt(sheets)} sheets${tbc ? ', t.b.c.' : ''})`;
};
