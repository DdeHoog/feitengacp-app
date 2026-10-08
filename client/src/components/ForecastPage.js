import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../authContext';
import useProducts from '../hooks/useProducts';
import apiClient from '../api';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Copy of `grid` with one row replaced, or dropped when `months` is null.
const withRow = (grid, code, months) => {
    const next = { ...grid };
    if (months === null) delete next[code]; else next[code] = months;
    return next;
};

// Customers plan expected volumes per article per month, a calendar year at a time
// (boekjaar = Jan–Dec), in PALLETS — the same unit as ordering since 2026-09-22. Grid
// state is `{ [article_code]: { [month]: pallets } }`; saving sends the whole grid and
// the server replaces that year.
function ForecastPage() {
    const { isAuthReady, isAuthenticated, features } = useAuth();
    const { products } = useProducts();
    const location = useLocation();
    const navigate = useNavigate();

    const [year, setYear] = useState(new Date().getFullYear());
    const [years, setYears] = useState([new Date().getFullYear()]);
    const [grid, setGrid] = useState({});
    const [loading, setLoading] = useState(true);
    const [status, setStatus] = useState(null);
    const [error, setError] = useState(null);
    const [search, setSearch] = useState('');
    const [ordered, setOrdered] = useState({});   // { code: { month: qty } } — what they actually ordered
    const [undo, setUndo] = useState(null);       // last row operation, for one-level undo
    const [dirty, setDirty] = useState(false);    // edits since the last load / save

    // Optional seed handed over from "Use as forecast" on the orders page. Captured
    // once on mount and consumed by the first load: it lives in history state, so
    // reading it on every render would re-seed on refresh and on each year switch.
    const seedRef = useRef(location.state?.seed?.length ? { lines: location.state.seed, from: location.state.from } : null);
    useEffect(() => {
        if (location.state?.seed) navigate(location.pathname, { replace: true, state: null });
    }, [location.pathname, location.state, navigate]);

    useEffect(() => {
        if (!isAuthenticated) return undefined;
        let cancelled = false; // a quick second year switch must not let the older reply win
        setLoading(true);
        setStatus(null);
        setError(null);
        setUndo(null);         // an undo from another year would restore into the wrong grid
        apiClient.get(`/api/forecast?year=${year}`)
            .then((res) => {
                if (cancelled) return;
                const next = {};
                for (const c of res.data.cells) {
                    next[c.article_code] = { ...(next[c.article_code] || {}), [c.month]: c.quantity };
                }
                const ord = {};
                for (const o of res.data.ordered || []) {
                    ord[o.article_code] = { ...(ord[o.article_code] || {}), [o.month]: o.quantity };
                }
                // Seed an order's lines into the current month; the customer then
                // copies them across the months they want and adjusts.
                const seed = seedRef.current;
                seedRef.current = null;
                if (seed) {
                    const m = new Date().getMonth() + 1;
                    for (const l of seed.lines) {
                        next[l.article_code] = { ...(next[l.article_code] || {}), [m]: l.quantity };
                    }
                    setStatus(`Loaded ${seed.lines.length} product(s) from order ${seed.from} into ${MONTHS[m - 1]}. Use → on a row to copy it across the year, adjust, then save.`);
                }
                setOrdered(ord);
                setGrid(next);
                setYears(res.data.years || [year]);
                setDirty(Boolean(seed)); // seeded rows are unsaved edits
            })
            .catch((err) => { if (!cancelled) setError(err.response?.data?.error || 'Could not load your forecast.'); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [isAuthenticated, year]);

    // Refresh / tab close with unsaved edits: the browser asks first. In-app links can't
    // be guarded the same way (useBlocker needs a data router; the app uses <BrowserRouter>).
    useEffect(() => {
        if (!dirty) return undefined;
        const warn = (e) => { e.preventDefault(); e.returnValue = 'You have unsaved forecast changes.'; };
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, [dirty]);

    const descriptions = useMemo(() => {
        const map = {};
        for (const p of products || []) map[p['Item Code']] = p['Item Description'];
        return map;
    }, [products]);

    // Union of planned and ordered articles: anything they've ordered this year shows
    // up even if it isn't in the forecast yet — that's how the pattern becomes visible.
    const rows = useMemo(
        () => [...new Set([...Object.keys(grid), ...Object.keys(ordered)])].sort(),
        [grid, ordered]
    );

    // Type-ahead suggestions — a quick way to add a row, not a second catalogue
    // (the stock page is where you browse). Only shows once you start typing, and
    // only articles that aren't on the grid yet (planned or ordered).
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

    // Switching year refetches and replaces the grid, so unsaved edits need a deliberate
    // "discard" first. The <select> is controlled, so cancelling snaps it back.
    const changeYear = (e) => {
        const next = Number(e.target.value);
        if (next === year) return;
        if (dirty && !window.confirm(`You have unsaved changes for ${year}. Discard them and switch to ${next}?`)) return;
        setYear(next);
    };

    const addArticle = (code) => {
        if (grid[code]) return;
        setGrid((prev) => ({ ...prev, [code]: {} }));
        setDirty(true);
        setStatus(null);
    };

    // Every row-level operation (remove, clear, →, ↓) goes through here and stashes the
    // row as it was, so a mis-click is one click away from being undone — otherwise the
    // customer has to remember the article code and search again, or retype twelve cells.
    // `label` reads as "<label> <code>." in the undo banner.
    const applyRow = (code, months, label) => {
        setUndo({ code, months: grid[code] ?? null, label });
        setGrid((prev) => withRow(prev, code, months));
        setDirty(true);
        setStatus(null);
    };

    const undoLast = () => {
        if (!undo) return;
        setGrid((prev) => withRow(prev, undo.code, undo.months));
        setUndo(null);
        setDirty(true);
    };

    // × drops the row from the plan. A row that also has orders stays visible (the
    // ordered figures are not ours to remove), so there it reads as "clear my forecast".
    const removeArticle = (code) => {
        applyRow(code, null, ordered[code] ? 'Cleared your forecast for' : 'Removed');
    };

    const setCell = (code, month, value) => {
        setGrid((prev) => {
            const row = { ...(prev[code] || {}) };
            if (value === '') delete row[month]; // a cleared cell stays blank, not "0"
            else row[month] = Math.max(0, parseInt(value, 10) || 0);
            return { ...prev, [code]: row };
        });
        setDirty(true);
        setStatus(null);
    };

    // Fill a row's first entered value across the whole year — the baseline-then-adjust
    // flow, one click per product. It overwrites every month on purpose (re-baselining a
    // row stays one click), which is why it's undoable like the other row operations.
    const fillRow = (code) => {
        const months = grid[code] || {};
        const source = MONTHS.map((_, i) => months[i + 1]).find((v) => v > 0);
        if (!source) {
            setStatus('Enter a quantity in one month first, then press → to copy it across the year.');
            return;
        }
        const filled = {};
        for (let m = 1; m <= 12; m += 1) filled[m] = source;
        applyRow(code, filled, `Copied ${source} across the year for`);
    };

    // Copy what they actually ordered into the forecast for that row — the
    // "my pattern repeats" case, which is most of them.
    const copyOrdered = (code) => {
        const src = ordered[code];
        if (!src) return;
        applyRow(code, { ...src }, 'Copied your orders into the forecast for');
    };

    const save = async () => {
        setError(null);
        const cells = [];
        for (const [code, months] of Object.entries(grid)) {
            for (const [m, qty] of Object.entries(months)) {
                if (qty > 0) cells.push({ article_code: code, month: Number(m), quantity: qty });
            }
        }
        try {
            await apiClient.post('/api/forecast', { year, cells });
            setDirty(false);
            setStatus(`Forecast for ${year} saved (${cells.length} entries).`);
        } catch (err) {
            setError(err.response?.data?.error || 'Could not save your forecast.');
        }
    };

    const rowTotal = (code) => Object.values(grid[code] || {}).reduce((a, b) => a + (b || 0), 0);

    return (
        <div className="p-4">
            <h1 className="text-2xl font-bold text-[#004EA2] mb-1">Forecast</h1>
            <p className="text-gray-600 text-sm mb-4">
                Let us know how many pallets you expect to need per month. Fill in one month, press → to copy it across the year, then adjust where needed.
            </p>

            <div className="flex flex-wrap items-center gap-3 mb-4">
                <label className="text-sm text-gray-700">
                    Year:{' '}
                    <select value={year} onChange={changeYear} className="border border-gray-300 rounded px-2 py-1">
                        {years.map((y) => <option key={y} value={y}>{y}</option>)}
                    </select>
                </label>
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
                <button onClick={save} className="px-4 py-1.5 rounded-md bg-[#003F84] text-white text-sm font-semibold hover:bg-[#00457F]">
                    Save forecast
                </button>
                {status && <span className="text-sm text-green-700">{status}</span>}
                {error && <span className="text-sm text-red-600">{error}</span>}
                {undo && (
                    <span className="text-sm text-gray-600">
                        {undo.label} <strong>{undo.code}</strong>.{' '}
                        <button onClick={undoLast} className="text-[#004EA2] underline">Undo</button>
                    </span>
                )}
            </div>

            {loading && <p className="text-gray-600">Loading…</p>}

            {!loading && rows.length === 0 && (
                <p className="text-gray-600">
                    Nothing to plan for {year} yet — you have no forecast and no orders in that year.
                    Search above to add a product, or open <strong>My Orders</strong> and choose{' '}
                    <strong>Use as forecast</strong> to start from an order you already placed.
                </p>
            )}

            {!loading && rows.length > 0 && (
                <>
                    <p className="text-xs text-gray-500 mb-2">
                        Grey figures in brackets are the pallets you already ordered for that month.
                        Use <strong>↓</strong> to copy that pattern into your forecast, or fill one month and press <strong>→</strong> to repeat it across the year. Everything stays editable.
                    </p>

                    <div className="overflow-x-auto rounded-lg shadow">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-[#003F84]">
                                <tr>
                                    <th className="px-2 py-2 text-left text-xs font-medium text-white uppercase">Article</th>
                                    {MONTHS.map((m) => <th key={m} className="px-0.5 py-2 text-xs font-medium text-white uppercase">{m}</th>)}
                                    <th className="px-2 py-2 text-xs font-medium text-white uppercase">Total</th>
                                    <th className="px-1 py-2"></th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {rows.map((code, idx) => (
                                    <tr key={code} className={idx % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                                        <td className="px-2 py-2 text-sm max-w-[11rem]">
                                            <div className="font-medium text-gray-900">{code}</div>
                                            <div className="text-gray-500 text-xs truncate" title={descriptions[code]}>{descriptions[code]}</div>
                                        </td>
                                        {MONTHS.map((m, i) => (
                                            <td key={m} className="px-0.5 py-2 align-top">
                                                <input
                                                    type="number"
                                                    min="0"
                                                    value={grid[code]?.[i + 1] ?? ''}
                                                    onChange={(e) => setCell(code, i + 1, e.target.value)}
                                                    className="w-11 border border-gray-300 rounded px-1 py-0.5 text-sm text-right appearance-none [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                    aria-label={`${code} ${m} forecast`}
                                                />
                                                <div
                                                    className="text-[11px] text-right text-gray-400 h-4 leading-4"
                                                    title={ordered[code]?.[i + 1] ? `Already ordered for ${m}` : undefined}
                                                >
                                                    {ordered[code]?.[i + 1] ? `(${ordered[code][i + 1]})` : ''}
                                                </div>
                                            </td>
                                        ))}
                                        <td className="px-3 py-2 text-sm font-semibold text-gray-900 text-right">{rowTotal(code)}</td>
                                        <td className="px-1 py-2 whitespace-nowrap">
                                            {ordered[code] && (
                                                <button
                                                    onClick={() => copyOrdered(code)}
                                                    title="Copy what you already ordered into your forecast"
                                                    className="mr-1 px-1.5 py-0.5 rounded border border-gray-300 text-gray-700 text-sm hover:bg-gray-100"
                                                >
                                                    ↓
                                                </button>
                                            )}
                                            <button
                                                onClick={() => fillRow(code)}
                                                title="Copy this row's value across the whole year"
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
                </>
            )}
        </div>
    );
}

export default ForecastPage;
