import React, { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../authContext';
import apiClient from '../api';

// Admin overview. Batch 6 slice pulled forward: submitted orders per customer +
// a CSV export, so Ad can process orders from here until the email (4b) lands.
// (Login-status + forecasts join this page later.)
function AdminPage() {
    const { isAuthReady, isAuthenticated, isAdmin } = useAuth();
    const [orders, setOrders] = useState(null);
    const [error, setError] = useState(null);
    const [customer, setCustomer] = useState('all');
    const [openId, setOpenId] = useState(null);

    useEffect(() => {
        if (!isAdmin) return;
        apiClient.get('/api/admin/orders')
            .then((res) => setOrders(res.data))
            .catch((err) => setError(err.response?.data?.error || 'Failed to load orders.'));
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

    const fmt = (ms) => new Date(ms).toLocaleString();

    // Export the given orders to CSV, one row per order line. Used for both the
    // filtered "all" export and a single order.
    const exportOrders = (list, filename) => {
        // RFC 4180: quote only when needed, double embedded quotes. No formula guard —
        // clean output in every tool (matches the stock-table export).
        const esc = (v) => {
            const s = v == null ? '' : String(v);
            return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        };
        const cols = ['Company', 'Debtor #', 'Order Ref', 'Customer Ref', 'Order Date', 'Orderer Name', 'Orderer Email', 'Phone', 'Desired Ship Date', 'Delivery Address', 'Article Code', 'Description', 'Quantity'];
        const rows = [cols.join(',')];
        for (const o of list) {
            for (const l of o.lines) {
                rows.push([
                    o.company_name, o.debtor_number, o.our_reference, o.customer_reference, fmt(o.created_at),
                    o.orderer_name, o.orderer_email, o.phone, o.desired_ship_date, o.delivery_address,
                    l.article_code, l.description, l.quantity,
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

    return (
        <div className="p-6 max-w-4xl">
            <h1 className="text-2xl font-bold text-[#004EA2] mb-4">Admin — orders</h1>

            {error && <p className="text-red-600">{error}</p>}
            {!error && orders === null && <p className="text-gray-600">Loading…</p>}

            {!error && orders !== null && (
                <>
                    <div className="flex flex-wrap items-center gap-3 mb-4">
                        <label className="text-sm text-gray-700">
                            Customer:{' '}
                            <select value={customer} onChange={(e) => setCustomer(e.target.value)} className="border border-gray-300 rounded px-2 py-1">
                                <option value="all">All customers</option>
                                {companies.map((c) => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </label>
                        <span className="text-sm text-gray-500">{filtered.length} order{filtered.length !== 1 ? 's' : ''}</span>
                        <button
                            onClick={() => exportOrders(filtered, `feitengacp-orders-${dateStamp()}.csv`)}
                            disabled={filtered.length === 0}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-[#003F84] text-white text-sm font-semibold shadow hover:bg-[#00457F] disabled:opacity-60"
                        >
                            <span className="text-base leading-none">&#x2B07;</span> Export all shown (CSV)
                        </button>
                    </div>

                    {filtered.length === 0 && <p className="text-gray-600">No orders yet.</p>}

                    <div className="space-y-3">
                        {filtered.map((o) => (
                            <div key={o.id} className="border border-gray-200 rounded-md">
                                <div className="flex items-center justify-between px-4 py-3">
                                    <div className="text-sm">
                                        <span className="font-semibold text-gray-900">{o.our_reference}</span>
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
                                            <p>Desired ship date: {o.desired_ship_date}</p>
                                        </div>
                                        <p className="mt-2 whitespace-pre-line">Deliver to:{'\n'}{o.delivery_address}</p>
                                        <table className="min-w-full text-sm mt-3">
                                            <thead>
                                                <tr className="text-left text-gray-500 border-b">
                                                    <th className="py-1 pr-4">Article</th>
                                                    <th className="py-1 pr-4">Description</th>
                                                    <th className="py-1">Qty</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {o.lines.map((l, i) => (
                                                    <tr key={i} className="border-b border-gray-100">
                                                        <td className="py-1 pr-4 font-medium text-gray-900">{l.article_code}</td>
                                                        <td className="py-1 pr-4 text-gray-600">{l.description}</td>
                                                        <td className="py-1">{l.quantity}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}

export default AdminPage;
