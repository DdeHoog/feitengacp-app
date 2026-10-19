import React, { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../authContext';
import useProducts from '../hooks/useProducts';
import apiClient from '../api';
import { ASSUMED_PALLET_QTY } from '../quantities';
import { fmtDate, fmtDateTime } from '../dates';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const SHOW_OPTIONS = [6, 12];   // months on screen; the window itself is always 12
const RECENT_ORDERS = 3;        // orders offered as a starting point

// Cells are keyed 'YYYY-MM' because the window runs across the year end.
const key = (m) => `${m.year}-${String(m.month).padStart(2, '0')}`;
const label = (m) => `${MONTHS[m.month - 1]} ${m.year}`;

// Rework 2026-10-12 (Damian): a forecast is about what comes NEXT, so the grid shows the
// 12 months after the current one (6 by default), never the past and not this month —
// what ships now has been ordered already. Past orders are not columns but a source panel:
// "add this order to <month>", then → repeats a row forward. Grid state is
// `{ [article_code]: { 'YYYY-MM': pallets } }`; saving sends the whole window and the
// server replaces it. The window comes from the server; the browser never computes it.
function ForecastPage() {
    const { isAuthReady, isAuthenticated, features } = useAuth();
    const { products } = useProducts();

    const [months, setMonths] = useState([]);     // the window, from the server
    const [show, setShow] = useState(SHOW_OPTIONS[0]);
    const [grid, setGrid] = useState({});
    const [ordered, setOrdered] = useState({});   // { code: { 'YYYY-MM': pallets } } already ordered
    const [orders, setOrders] = useState([]);     // recent orders for the source panel
    const [planMonth, setPlanMonth] = useState(''); // where "add this order" lands
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [savedAt, setSavedAt] = useState(null); // last save, from the server
    const [status, setStatus] = useState(null);
    const [error, setError] = useState(null);
    const [search, setSearch] = useState('');
    const [undo, setUndo] = useState(null);       // { grid, label } — the grid before the last operation
    const [dirty, setDirty] = useState(false);    // edits since the last load / save
    const [help, setHelp] = useState(false);

    useEffect(() => {
        if (!isAuthenticated) return undefined;
        let cancelled = false;
        setLoading(true);
        // The orders are a convenience — if that call fails the grid still loads.
        Promise.all([
            apiClient.get('/api/forecast'),
            apiClient.get('/api/orders').catch(() => ({ data: [] })),
        ])
            .then(([fc, od]) => {
                if (cancelled) return;
                const next = {};
                for (const c of fc.data.cells) {
                    next[c.article_code] = { ...(next[c.article_code] || {}), [key(c)]: c.quantity };
                }
                const ord = {};
                for (const o of fc.data.ordered || []) {
                    ord[o.article_code] = { ...(ord[o.article_code] || {}), [key(o)]: o.quantity };
                }
                setMonths(fc.data.months);
                setPlanMonth(key(fc.data.months[0]));
                setGrid(next);
                setOrdered(ord);
                setSavedAt(fc.data.updated_at);
                setOrders(od.data.slice(0, RECENT_ORDERS));
                setDirty(false);
            })
            .catch((err) => { if (!cancelled) setError(err.response?.data?.error || 'Could not load your forecast.'); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [isAuthenticated]);

    // Refresh / tab close with unsaved edits: the browser asks first. In-app links can't
    // be guarded the same way (useBlocker needs a data router; the app uses <BrowserRouter>).
    useEffect(() => {
        if (!dirty) return undefined;
        const warn = (e) => { e.preventDefault(); e.returnValue = 'You have unsaved forecast changes.'; };
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, [dirty]);

    const byCode = useMemo(() => {
        const map = {};
        for (const p of products || []) map[p['Item Code']] = p;
        return map;
    }, [products]);

    const visible = useMemo(() => months.slice(0, show), [months, show]);

    // Union of planned and already-ordered articles, so a December order shows even
    // without a plan for it.
    const rows = useMemo(
        () => [...new Set([...Object.keys(grid), ...Object.keys(ordered)])].sort(),
        [grid, ordered]
    );

    // Type-ahead to add a row — not a second catalogue (the stock page is for browsing).
    const suggestions = useMemo(() => {
        const term = search.trim().toLowerCase();
        if (!term) return [];
        return (products || [])
            .filter((p) => !grid[p['Item Code']] && !ordered[p['Item Code']])
            .filter((p) => String(p['Item Code']).toLowerCase().includes(term)
                || String(p['Item Description'] || '').toLowerCase().includes(term))
            .slice(0, 8);
    }, [products, search, grid, ordered]);

    if (!isAuthReady) return null;
    if (!isAuthenticated || !features.forecast) return <Navigate to="/" replace />;

    // Order lines from before pallet ordering hold sheets; convert with today's pallet
    // size, rounded up to whole pallets.
    const toPallets = (l) => (l.unit === 'pallet'
        ? l.quantity
        : Math.ceil(l.quantity / (byCode[l.article_code]?.['Pallet QTY'] ?? ASSUMED_PALLET_QTY)));

    // Every operation bigger than one keystroke goes through here and keeps the grid as it
    // was, so any mis-click is one "Undo" away. `label` is the banner text.
    const apply = (nextGrid, undoLabel) => {
        setUndo({ grid, label: undoLabel });
        setGrid(nextGrid);
        setDirty(true);
        setStatus(null);
    };

    const undoLast = () => {
        if (!undo) return;
        setGrid(undo.grid);
        setUndo(null);
        setDirty(true);
    };

    const addArticle = (code) => {
        if (grid[code]) return;
        setGrid((prev) => ({ ...prev, [code]: {} }));
        setDirty(true);
        setStatus(null);
    };

    // × drops the row from the plan. A row with orders stays (those figures aren't ours
    // to remove), so there it reads as "clear my forecast".
    const removeArticle = (code) => {
        const next = { ...grid };
        delete next[code];
        apply(next, `${ordered[code] ? 'Cleared your forecast for' : 'Removed'} ${code}.`);
    };

    const setCell = (code, ym, value) => {
        setGrid((prev) => {
            const row = { ...(prev[code] || {}) };
            if (value === '') delete row[ym]; // a cleared cell stays blank, not "0"
            else row[ym] = Math.max(0, parseInt(value, 10) || 0);
            return { ...prev, [code]: row };
        });
        setDirty(true);
        setStatus(null);
    };

    // → takes the row's first filled month (of those on screen) and repeats it into every
    // later month on screen — forward only, overwriting (re-baselining stays one click;
    // Undo covers the mis-click).
    const repeatForward = (code) => {
        const row = grid[code] || {};
        const idx = visible.findIndex((m) => row[key(m)] > 0);
        if (idx < 0) {
            setStatus('Enter a quantity in one month first, then press → to repeat it into the months after it.');
            return;
        }
        const value = row[key(visible[idx])];
        const filled = { ...row };
        for (const m of visible.slice(idx + 1)) filled[key(m)] = value;
        apply({ ...grid, [code]: filled }, `Repeated ${value} forward for ${code}.`);
    };

    // The source panel: a past order's lines land in the chosen month, added to whatever
    // is there. The customer then repeats rows forward and adjusts.
    const addOrder = (o) => {
        const next = { ...grid };
        for (const l of o.lines) {
            const row = { ...(next[l.article_code] || {}) };
            row[planMonth] = (row[planMonth] || 0) + toPallets(l);
            next[l.article_code] = row;
        }
        const m = months.find((x) => key(x) === planMonth);
        apply(next, `Added order ${o.our_reference} to ${m ? label(m) : planMonth}.`);
    };

    const save = async () => {
        setError(null);
        setSaving(true);
        const cells = [];
        for (const [code, row] of Object.entries(grid)) {
            for (const [ym, qty] of Object.entries(row)) {
                if (qty > 0) cells.push({ article_code: code, year: Number(ym.slice(0, 4)), month: Number(ym.slice(5)), quantity: qty });
            }
        }
        try {
            const res = await apiClient.post('/api/forecast', { cells });
            setDirty(false);
            setUndo(null);
            setSavedAt(res.data.updated_at);
            setStatus(`Saved — ${cells.length} ${cells.length === 1 ? 'entry' : 'entries'}. Thank you!`);
        } catch (err) {
            setError(err.response?.data?.error || 'Could not save your forecast.');
        } finally {
            setSaving(false);
        }
    };

    const rowTotal = (code) => visible.reduce((sum, m) => sum + (grid[code]?.[key(m)] || 0), 0);

    const segment = (active) => `px-3 py-1 text-sm ${active ? 'bg-[#003F84] text-white' : 'bg-white text-gray-700 hover:bg-gray-100'}`;

    return (
        <div className="p-4 max-w-6xl">
            <div className="flex flex-wrap items-baseline gap-4 mb-1">
                <h1 className="text-2xl font-bold text-[#004EA2]">Forecast</h1>
                <button onClick={() => setHelp(!help)} className="text-sm text-[#004EA2] hover:underline">
                    {help ? 'Hide help' : 'How does this work?'}
                </button>
            </div>
            <p className="text-gray-600 text-sm mb-3">
                Tell us how many pallets you expect to need per month — it helps us plan production and is not an order.
            </p>
            {help && (
                <ul className="text-sm text-gray-700 bg-blue-50 border border-blue-100 rounded-md p-3 mb-4 list-disc pl-7 space-y-1">
                    <li>Start from a recent order: choose the month it should land in and press <strong>+ Add</strong>. Or search for a product to add a row.</li>
                    <li>Type the pallets you expect in each month. <strong>→</strong> repeats a row's first value into the months after it; adjust where needed.</li>
                    <li>Grey figures in brackets are pallets you have already ordered for that month.</li>
                    <li>Nothing reaches us until you press <strong>Save forecast</strong>. A forecast is a planning signal for us — it does not place an order.</li>
                </ul>
            )}

            {loading && <p className="text-gray-600">Loading…</p>}
            {!loading && error && rows.length === 0 && <p className="text-red-600">{error}</p>}

            {!loading && months.length > 0 && (
                <>
                    {orders.length > 0 && (
                        <div className="border border-gray-200 rounded-md p-3 mb-4 bg-gray-50">
                            <div className="flex flex-wrap items-center gap-3">
                                <span className="text-sm font-semibold text-gray-800">Start from a recent order</span>
                                <label className="text-sm text-gray-700">
                                    into{' '}
                                    <select value={planMonth} onChange={(e) => setPlanMonth(e.target.value)} className="border border-gray-300 rounded px-2 py-1">
                                        {visible.map((m) => <option key={key(m)} value={key(m)}>{label(m)}</option>)}
                                    </select>
                                </label>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2">
                                {orders.map((o) => (
                                    <button
                                        key={o.id}
                                        onClick={() => addOrder(o)}
                                        title={o.lines.map((l) => `${l.article_code} × ${toPallets(l)} pallet${toPallets(l) === 1 ? '' : 's'}`).join('\n')}
                                        className="px-3 py-1.5 rounded-md border border-gray-300 bg-white text-sm hover:bg-blue-50 hover:border-[#004EA2]"
                                    >
                                        <span className="font-medium text-gray-900">{o.our_reference}</span>
                                        <span className="text-gray-500"> · {fmtDate(o.created_at)} · {o.lines.length} product{o.lines.length !== 1 ? 's' : ''}</span>
                                        <span className="text-[#004EA2] font-semibold"> + Add</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="flex flex-wrap items-center gap-3 mb-3">
                        <div className="relative">
                            <input
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Add a product — type a code or name…"
                                className="border border-gray-300 rounded px-2 py-1 w-72 text-sm"
                            />
                            {suggestions.length > 0 && (
                                <div className="absolute z-20 mt-1 w-96 max-h-64 overflow-y-auto bg-white border border-gray-200 rounded-md shadow-lg">
                                    {suggestions.map((p) => (
                                        <button
                                            key={p['Item Code']}
                                            onClick={() => { addArticle(p['Item Code']); setSearch(''); }}
                                            className="block w-full text-left px-3 py-1.5 text-sm hover:bg-gray-100"
                                        >
                                            <span className="font-medium text-gray-900">{p['Item Code']}</span>{' '}
                                            <span className="text-gray-500">{p['Item Description']}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="inline-flex rounded-md border border-gray-300 overflow-hidden" role="group" aria-label="Months shown">
                            {SHOW_OPTIONS.map((n) => (
                                <button key={n} onClick={() => setShow(n)} className={segment(show === n)} title={`Show the next ${n} months`}>
                                    {n} months
                                </button>
                            ))}
                        </div>

                        <button
                            onClick={save}
                            disabled={saving}
                            className="px-4 py-1.5 rounded-md bg-[#003F84] text-white text-sm font-semibold hover:bg-[#00457F] disabled:opacity-60"
                        >
                            {saving ? 'Saving…' : 'Save forecast'}
                        </button>
                        {dirty && <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs font-semibold">Unsaved changes</span>}
                        {!dirty && savedAt && <span className="text-xs text-gray-500">Last saved {fmtDateTime(savedAt)}</span>}
                        {status && <span className="text-sm text-green-700">{status}</span>}
                        {error && <span className="text-sm text-red-600">{error}</span>}
                        {undo && (
                            <span className="text-sm text-gray-600">
                                {undo.label}{' '}
                                <button onClick={undoLast} className="text-[#004EA2] underline">Undo</button>
                            </span>
                        )}
                    </div>

                    {rows.length === 0 && (
                        <p className="text-gray-600 text-sm">
                            Nothing planned yet — add a recent order above, or search for a product to start a row.
                        </p>
                    )}

                    {rows.length > 0 && (
                        <div className="overflow-x-auto rounded-lg shadow">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-[#003F84]">
                                    <tr>
                                        <th className="px-2 py-2 text-left text-xs font-medium text-white uppercase">Article</th>
                                        {visible.map((m, i) => (
                                            <th key={key(m)} className="px-1 py-2 text-xs font-medium text-white uppercase text-center">
                                                {MONTHS[m.month - 1]}
                                                {/* the year only where it changes, so a Nov–Oct window reads at a glance */}
                                                {(i === 0 || m.month === 1) && <div className="text-[10px] font-normal normal-case opacity-80">{m.year}</div>}
                                            </th>
                                        ))}
                                        <th className="px-2 py-2 text-xs font-medium text-white uppercase" title={`Pallets over the ${show} months shown`}>Total</th>
                                        <th className="px-1 py-2"></th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {rows.map((code, idx) => (
                                        <tr key={code} className={idx % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                                            <td className="px-2 py-2 text-sm max-w-[12rem]">
                                                <div className="font-medium text-gray-900">{code}</div>
                                                <div className="text-gray-500 text-xs truncate" title={byCode[code]?.['Item Description']}>{byCode[code]?.['Item Description']}</div>
                                            </td>
                                            {visible.map((m) => {
                                                const ym = key(m);
                                                const already = ordered[code]?.[ym];
                                                return (
                                                    <td key={ym} className="px-1 py-2 align-top text-center">
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            value={grid[code]?.[ym] ?? ''}
                                                            onChange={(e) => setCell(code, ym, e.target.value)}
                                                            className="w-12 border border-gray-300 rounded px-1 py-0.5 text-sm text-right appearance-none [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                            aria-label={`${code} ${label(m)} forecast`}
                                                        />
                                                        <div className="text-[11px] text-gray-400 h-4 leading-4" title={already ? `Already ordered for ${label(m)}` : undefined}>
                                                            {already ? `(${already})` : ''}
                                                        </div>
                                                    </td>
                                                );
                                            })}
                                            <td className="px-3 py-2 text-sm font-semibold text-gray-900 text-right">{rowTotal(code)}</td>
                                            <td className="px-1 py-2 whitespace-nowrap">
                                                <button
                                                    onClick={() => repeatForward(code)}
                                                    title="Repeat this row's first value into the months after it"
                                                    className="px-1.5 py-0.5 rounded border border-gray-300 text-gray-700 text-sm hover:bg-gray-100"
                                                >
                                                    →
                                                </button>
                                                {/* Only a planned row has something to remove; an ordered-only row has no plan yet. */}
                                                {grid[code] && (
                                                    <button
                                                        onClick={() => removeArticle(code)}
                                                        title={ordered[code] ? 'Clear your forecast for this product (what you ordered stays visible)' : 'Remove this product from the forecast'}
                                                        className="ml-1 px-1.5 py-0.5 rounded text-red-600 text-sm hover:bg-red-50"
                                                    >
                                                        ×
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

export default ForecastPage;
