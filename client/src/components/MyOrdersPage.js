import React, { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../authContext';
import { useCart } from '../cartContext';
import apiClient from '../api';

// The customer's own submitted orders. Read-only history; "Reorder" loads an
// order's lines back into the cart (editable there — covers order-again AND
// copy-and-edit). Ad's all-customer view is the separate admin page (Batch 6).
function MyOrdersPage() {
    const { isAuthReady, isAuthenticated } = useAuth();
    const { replaceItems, count } = useCart();
    const navigate = useNavigate();

    const [orders, setOrders] = useState(null);
    const [error, setError] = useState(null);
    const [openId, setOpenId] = useState(null);

    useEffect(() => {
        if (!isAuthenticated) return;
        apiClient.get('/api/orders')
            .then((res) => setOrders(res.data))
            .catch((err) => setError(err.response?.data?.error || 'Could not load your orders.'));
    }, [isAuthenticated]);

    if (!isAuthReady) return null;
    if (!isAuthenticated) return <Navigate to="/" replace />;

    const reorder = (order) => {
        // Replace the cart with this order (fixing a wrong click = just reorder the
        // right one). Confirm only if there's an in-progress cart to avoid a silent wipe.
        if (count > 0 && !window.confirm('This will replace your current cart with this order. Continue?')) return;
        replaceItems(order.lines.map((l) => ({ article_code: l.article_code, description: l.description, quantity: l.quantity })));
        navigate('/cart');
    };

    const fmtDate = (ms) => new Date(ms).toLocaleDateString();

    return (
        <div className="p-6 max-w-4xl">
            <h1 className="text-2xl font-bold text-[#004EA2] mb-4">My orders</h1>

            {error && <p className="text-red-600">{error}</p>}
            {!error && orders === null && <p className="text-gray-600">Loading…</p>}
            {!error && orders !== null && orders.length === 0 && (
                <p className="text-gray-600">
                    No orders yet. <Link to="/stock" className="text-[#004EA2] underline">Browse stock</Link> to place your first order.
                </p>
            )}

            <div className="space-y-3">
                {(orders || []).map((o) => (
                    <div key={o.id} className="border border-gray-200 rounded-md">
                        <div className="flex items-center justify-between px-4 py-3">
                            <div className="text-sm">
                                <span className="font-semibold text-gray-900">{o.our_reference}</span>
                                <span className="text-gray-500"> · {fmtDate(o.created_at)} · {o.lines.length} item{o.lines.length !== 1 ? 's' : ''}</span>
                                {o.customer_reference && <span className="text-gray-500"> · ref {o.customer_reference}</span>}
                                {o.desired_ship_date && <span className="text-gray-500"> · ship {o.desired_ship_date}</span>}
                            </div>
                            <div className="flex gap-3 text-sm">
                                <button onClick={() => setOpenId(openId === o.id ? null : o.id)} className="text-[#004EA2] hover:underline">
                                    {openId === o.id ? 'Hide' : 'Details'}
                                </button>
                                <button onClick={() => reorder(o)} className="text-[#004EA2] hover:underline">Reorder</button>
                            </div>
                        </div>
                        {openId === o.id && (
                            <div className="px-4 pb-3 border-t border-gray-100">
                                {o.delivery_address && (
                                    <p className="text-xs text-gray-500 mt-2 whitespace-pre-line">Delivered to:{'\n'}{o.delivery_address}</p>
                                )}
                                <table className="min-w-full text-sm mt-2">
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
        </div>
    );
}

export default MyOrdersPage;
