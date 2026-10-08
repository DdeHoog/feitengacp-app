import React, { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../authContext';
import apiClient from '../api';
import { sheetsFor, sheetsOfLine } from '../quantities';
import { fmtDateTime, fmtDay } from '../dates';

// One line on the order-mail credential (certificate or client secret). Entra makes it
// expire and gives no warning of its own, so this is where an admin sees it coming.
function MailStatus({ mail }) {
    if (!mail.enabled) return <p className="mb-4 text-sm text-gray-500">Order e-mail is not configured on this server.</p>;
    const d = mail.daysLeft;
    const tone = d == null ? 'text-gray-600' : d < 14 ? 'text-red-700 font-semibold' : d < 60 ? 'text-amber-700' : 'text-gray-500';
    const when = mail.expiresAt == null
        ? 'expiry date unknown — set GRAPH_SECRET_EXPIRES on the server'
        : d < 0
            ? `EXPIRED on ${mail.expiresAt} — order e-mails are failing`
            : `valid until ${mail.expiresAt} (${d} day${d === 1 ? '' : 's'})`;
    return (
        <div className="mb-4 text-sm">
            <p className={tone}>Order e-mail credential: {mail.method} · {when}</p>
            {mail.lastError && (
                <p className="text-red-700">Last mail error ({new Date(mail.lastError.at).toLocaleString()}): {mail.lastError.message}</p>
            )}
        </div>
    );
}

const RECENT = 10; // what "all customers" shows: the newest handful — pick a customer for the rest
const PAGE = 25;   // rows added per "Show more"

// "3 days ago" for a timestamp — precision falls off with age on purpose; the exact
// time sits in the cell's tooltip.
const ago = (ms) => {
    if (!ms) return '—';
    const mins = Math.floor((Date.now() - ms) / 60000);
    if (mins < 60) return mins <= 1 ? 'just now' : `${mins} min ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return days === 1 ? 'yesterday' : `${days} days ago`;
    const months = Math.floor(days / 30);
    return months === 1 ? 'a month ago' : `${months} months ago`;
};

// Who has logged in and how recently: one row per customer (a profile row is written at
// login), newest login first. Ad wants the LAST login per customer, not a history, so that
// is all we store. The list only ever grows, so it opens with the most recent handful and
// the rest is reached by typing (company / contact / e-mail / debtor #) rather than by
// scrolling; "Show all" exists for the occasional full scan (inactive customers sit at
// the bottom). A row with orders filters the orders tab to that company.
function CustomersTable({ customers, onPick }) {
    const [search, setSearch] = useState('');
    const [showAll, setShowAll] = useState(false);
    const exact = (ms) => (ms ? new Date(ms).toLocaleString() : undefined);
    const term = search.trim().toLowerCase();
    const matches = term
        ? customers.filter((c) => [c.company_name, c.full_name, c.email, c.debtor_number]
            .some((v) => String(v || '').toLowerCase().includes(term)))
        : customers;
    const rows = term || showAll ? matches : matches.slice(0, RECENT);
    return (
        <div className="mb-6">
            <div className="flex flex-wrap items-center gap-3 mb-2">
                <h2 className="text-lg font-semibold text-gray-800">
                    Logins <span className="text-sm font-normal text-gray-500">({customers.length} customer{customers.length !== 1 ? 's have' : ' has'} logged in)</span>
                </h2>
                {customers.length > RECENT && (
                    <input
                        type="search"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Find a customer…"
                        className="border border-gray-300 rounded px-2 py-1 text-sm w-56"
                        aria-label="Find a customer"
                    />
                )}
            </div>
            {customers.length === 0 && <p className="text-sm text-gray-600">No customer has logged in yet.</p>}
            {customers.length > 0 && rows.length === 0 && <p className="text-sm text-gray-600">No customer matches “{search.trim()}”.</p>}
            {rows.length > 0 && (
                <div className="overflow-x-auto rounded-md border border-gray-200">
                    <table className="min-w-full text-sm">
                        <thead>
                            <tr className="text-left text-gray-500 border-b bg-gray-50">
                                <th className="py-2 px-3">Company</th>
                                <th className="py-2 px-3">Contact</th>
                                <th className="py-2 px-3">E-mail</th>
                                <th className="py-2 px-3">Last login</th>
                                <th className="py-2 px-3 text-right">Orders</th>
                                <th className="py-2 px-3">Last order</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((c) => (
                                <tr
                                    key={c.exact_contact_id}
                                    className={`border-b border-gray-100 ${c.orders > 0 ? 'cursor-pointer hover:bg-gray-50' : ''}`}
                                    onClick={() => c.orders > 0 && onPick(c.company_name)}
                                    title={c.orders > 0 ? "Show this customer's orders" : undefined}
                                >
                                    <td className="py-2 px-3 font-medium text-gray-900">
                                        {c.company_name || '—'}
                                        {c.debtor_number && <span className="font-normal text-gray-400"> · {c.debtor_number}</span>}
                                    </td>
                                    <td className="py-2 px-3 text-gray-700">{c.full_name || '—'}</td>
                                    <td className="py-2 px-3 text-gray-700">{c.email || '—'}</td>
                                    <td className="py-2 px-3 text-gray-700 whitespace-nowrap" title={exact(c.last_login)}>{ago(c.last_login)}</td>
                                    <td className="py-2 px-3 text-right">{c.orders}</td>
                                    <td className="py-2 px-3 text-gray-700 whitespace-nowrap" title={exact(c.last_order_at)}>{ago(c.last_order_at)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            {!term && !showAll && customers.length > RECENT && (
                <p className="mt-3 text-sm text-gray-600">
                    Showing the {RECENT} most recent logins — type above to find a customer, or{' '}
                    <button onClick={() => setShowAll(true)} className="text-[#004EA2] underline">show all {customers.length}</button>.
                </p>
            )}
        </div>
    );
}

// Admin overview (Batch 6): mail-credential health, customers + last login, and the
// submitted orders per customer with CSV export. Forecasts per customer join once the
// forecast itself is switched on.
function AdminPage() {
    const { isAuthReady, isAuthenticated, isAdmin } = useAuth();
    const [orders, setOrders] = useState(null);
    const [error, setError] = useState(null);
    const [customer, setCustomer] = useState('all');
    const [openId, setOpenId] = useState(null);
    const [mail, setMail] = useState(null);           // order-mail credential health
    const [customers, setCustomers] = useState(null); // everyone who has logged in
    const [tab, setTab] = useState('orders');         // Ad's daily view first; customers on demand
    const [shown, setShown] = useState(RECENT);       // orders rendered so far (newest first)

    useEffect(() => {
        if (!isAdmin) return;
        apiClient.get('/api/admin/orders')
            .then((res) => setOrders(res.data))
            .catch((err) => setError(err.response?.data?.error || 'Failed to load orders.'));
        apiClient.get('/api/admin/mail-status')
            .then((res) => setMail(res.data))
            .catch(() => setMail(null));
        apiClient.get('/api/admin/customers')
            .then((res) => setCustomers(res.data))
            .catch(() => setCustomers(null));
    }, [isAdmin]);

    const companies = useMemo(
        () => [...new Set((orders || []).map((o) => o.company_name).filter(Boolean))].sort(),
        [orders]
    );
    const filtered = useMemo(
        () => (orders || []).filter((o) => customer === 'all' || o.company_name === customer),
        [orders, customer]
    );

    if (!isAuthReady) return null;
    if (!isAuthenticated || !isAdmin) return <Navigate to="/" replace />;

    const fmt = fmtDateTime; // dd/mm/yyyy, hh:mm — Ad's preference, same as the mails

    // Export the given orders to CSV, one row per order line. Used for both the
    // filtered "all" export and a single order.
    const exportOrders = (list, filename) => {
        // RFC 4180: quote only when needed, double embedded quotes. No formula guard —
        // clean output in every tool (matches the stock-table export).
        const esc = (v) => {
            const s = v == null ? '' : String(v);
            return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        };
        // Pallets / Sheets per pallet / Sheets: orders from before pallet ordering have
        // no pallet figures (they were entered in sheets); "tbc" = pallet size unknown,
        // sheets derived with the assumed size.
        const cols = ['Company', 'Debtor #', 'Order Ref', 'Customer Ref', 'Order Date', 'Orderer Name', 'Orderer Email', 'Phone', 'Desired Ship Date', 'Delivery Address', 'Article Code', 'Description', 'Pallets', 'Sheets per pallet', 'Sheets'];
        const rows = [cols.join(',')];
        for (const o of list) {
            for (const l of o.lines) {
                const pallet = l.unit === 'pallet';
                rows.push([
                    o.company_name, o.debtor_number, o.our_reference, o.customer_reference, fmt(o.created_at),
                    o.orderer_name, o.orderer_email, o.phone, fmtDay(o.desired_ship_date), o.delivery_address,
                    l.article_code, l.description,
                    pallet ? l.quantity : '',
                    pallet ? (l.pallet_qty ?? 'tbc') : '',
                    pallet ? sheetsFor(l.quantity, l.pallet_qty).sheets : l.quantity,
                ].map(esc).join(','));
            }
        }
        const csv = '﻿' + rows.join('\r\n'); // BOM so Excel reads UTF-8
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const dateStamp = () => new Date().toISOString().slice(0, 10);

    // A customer row → that company's orders, from the top.
    const pickCustomer = (company) => { setCustomer(company); setShown(PAGE); setTab('orders'); };

    return (
        <div className="p-6 max-w-4xl">
            <h1 className="text-2xl font-bold text-[#004EA2] mb-4">Admin</h1>
            {mail && <MailStatus mail={mail} />}

            {/* Tabs keep the page one screen tall as orders and customers accumulate. */}
            <div className="flex gap-2 mb-4 border-b border-gray-200">
                {[
                    ['orders', `Orders${orders ? ` (${orders.length})` : ''}`],
                    ['customers', `Logins${customers ? ` (${customers.length})` : ''}`],
                ].map(([id, label]) => (
                    <button
                        key={id}
                        onClick={() => setTab(id)}
                        className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px ${tab === id ? 'border-[#003F84] text-[#003F84]' : 'border-transparent text-gray-500 hover:text-gray-800'}`}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {tab === 'customers' && (
                customers ? <CustomersTable customers={customers} onPick={pickCustomer} /> : <p className="text-gray-600">Loading…</p>
            )}

            {tab === 'orders' && error && <p className="text-red-600">{error}</p>}
            {tab === 'orders' && !error && orders === null && <p className="text-gray-600">Loading…</p>}

            {tab === 'orders' && !error && orders !== null && (
                <>
                    <div className="flex flex-wrap items-center gap-3 mb-4">
                        <label className="text-sm text-gray-700">
                            Customer:{' '}
                            <select value={customer} onChange={(e) => { setCustomer(e.target.value); setShown(e.target.value === 'all' ? RECENT : PAGE); }} className="border border-gray-300 rounded px-2 py-1">
                                <option value="all">All customers</option>
                                {companies.map((c) => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </label>
                        <span className="text-sm text-gray-500">{filtered.length} order{filtered.length !== 1 ? 's' : ''}</span>
                        <button
                            onClick={() => exportOrders(filtered, `feitengacp-orders-${dateStamp()}.csv`)}
                            disabled={filtered.length === 0}
                            title="Every order in the current filter — not only the ones displayed below"
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-[#003F84] text-white text-sm font-semibold shadow hover:bg-[#00457F] disabled:opacity-60"
                        >
                            <span className="text-base leading-none">&#x2B07;</span> Export {filtered.length} order{filtered.length !== 1 ? 's' : ''} (CSV)
                        </button>
                    </div>

                    {filtered.length === 0 && <p className="text-gray-600">No orders yet.</p>}

                    <div className="space-y-3">
                        {filtered.slice(0, shown).map((o) => (
                            <div key={o.id} className="border border-gray-200 rounded-md">
                                <div className="flex items-center justify-between px-4 py-3">
                                    <div className="text-sm">
                                        <span className="font-semibold text-gray-900">{o.our_reference}</span>
                                        <span className={`ml-2 px-1.5 py-0.5 rounded text-xs ${o.email_status === 'sent' ? 'bg-green-100 text-green-700' : o.email_status === 'failed' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>
                                            email: {o.email_status}
                                        </span>
                                        <span className="text-gray-500"> · {o.company_name}</span>
                                        <span className="text-gray-500"> · {fmt(o.created_at)} · {o.lines.length} item{o.lines.length !== 1 ? 's' : ''}</span>
                                    </div>
                                    <div className="flex gap-4 text-sm">
                                        <button onClick={() => setOpenId(openId === o.id ? null : o.id)} className="text-[#004EA2] hover:underline">
                                            {openId === o.id ? 'Hide' : 'Details'}
                                        </button>
                                        <button onClick={() => exportOrders([o], `feitengacp-order-${o.our_reference}.csv`)} className="text-[#004EA2] hover:underline">
                                            Export
                                        </button>
                                    </div>
                                </div>
                                {openId === o.id && (
                                    <div className="px-4 pb-3 border-t border-gray-100 text-sm text-gray-700">
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 mt-2">
                                            <p>Debtor #: {o.debtor_number || '—'}</p>
                                            <p>Customer ref: {o.customer_reference || '—'}</p>
                                            <p>Orderer: {o.orderer_name} ({o.orderer_email})</p>
                                            <p>Phone: {o.phone}</p>
                                            <p>Desired ship date: {fmtDay(o.desired_ship_date)}</p>
                                        </div>
                                        <p className="mt-2 whitespace-pre-line">Deliver to:{'\n'}{o.delivery_address}</p>
                                        <table className="min-w-full text-sm mt-3">
                                            <thead>
                                                <tr className="text-left text-gray-500 border-b">
                                                    <th className="py-1 pr-4">Article</th>
                                                    <th className="py-1 pr-4">Description</th>
                                                    <th className="py-1 pr-4">Pallets</th>
                                                    <th className="py-1">Sheets</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {o.lines.map((l, i) => (
                                                    <tr key={i} className="border-b border-gray-100">
                                                        <td className="py-1 pr-4 font-medium text-gray-900">{l.article_code}</td>
                                                        <td className="py-1 pr-4 text-gray-600">{l.description}</td>
                                                        <td className="py-1 pr-4">{l.unit === 'pallet' ? l.quantity : '—'}</td>
                                                        <td className="py-1 whitespace-nowrap">{sheetsOfLine(l)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                    {filtered.length > shown && (
                        <div className="mt-4 flex items-center gap-3 text-sm text-gray-600">
                            <span>
                                Showing the newest {shown} of {filtered.length}
                                {customer === 'all' && ' — pick a customer above to see their full history'}
                            </span>
                            <button onClick={() => setShown(shown + PAGE)} className="px-3 py-1.5 rounded-md border border-gray-300 text-gray-700 font-semibold hover:bg-gray-50">
                                Show {Math.min(PAGE, filtered.length - shown)} more
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

export default AdminPage;
