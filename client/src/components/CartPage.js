import React, { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../authContext';
import { useCart } from '../cartContext';
import useProducts from '../hooks/useProducts';
import apiClient from '../api';
import { MAX_PALLETS_PER_ORDER, ASSUMED_PALLET_QTY, formatSheets, TBC_HINT } from '../quantities';

// Review + submit the in-progress order. Company/debtor#/email come from Exact
// (read-only identity); the customer confirms/edits name, phone, delivery address
// (prefilled from Exact) + reference + ship date — all required except reference.
// Quantities are pallets (Ad, 2026-09-22): the sheet equivalent is shown per line
// from the live pallet size, and the server re-derives + snapshots it on submit.
// Persists via POST /api/orders (the email to sales@ is Batch 4b).
function CartPage() {
    const { isAuthReady, isAuthenticated } = useAuth();
    const { lines, setQty, removeItem, clear, totalPallets } = useCart();
    const { products, loading: productsLoading } = useProducts();
    const location = useLocation();
    const notice = location.state?.notice; // e.g. "converted from sheets" after a legacy reorder
    const palletQtyByCode = useMemo(
        () => Object.fromEntries((products || []).map((p) => [p['Item Code'], p['Pallet QTY']])),
        [products]
    );
    const overLimit = totalPallets > MAX_PALLETS_PER_ORDER;

    const [profile, setProfile] = useState(null);
    const [ordererName, setOrdererName] = useState('');
    const [phone, setPhone] = useState('');
    const [deliveryAddr, setDeliveryAddr] = useState('');
    const [reference, setReference] = useState('');
    const [shipDate, setShipDate] = useState('');
    const [fieldErrors, setFieldErrors] = useState({});
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);
    const [confirmation, setConfirmation] = useState(null);

    useEffect(() => {
        if (!isAuthenticated) return;
        apiClient.get('/api/profile')
            .then((res) => {
                setProfile(res.data);
                setOrdererName((prev) => prev || res.data.full_name || '');
                setDeliveryAddr((prev) => prev || res.data.delivery_address || '');
            })
            .catch(() => setProfile(null));
    }, [isAuthenticated]);

    if (!isAuthReady) return null;
    if (!isAuthenticated) return <Navigate to="/" replace />;

    const validate = () => {
        const errs = {};
        if (lines.length === 0) errs.lines = 'Your cart is empty.';
        if (overLimit) errs.lines = `An order can contain at most ${MAX_PALLETS_PER_ORDER} pallets in total — please reduce the quantities.`;
        if (!ordererName.trim()) errs.ordererName = 'Please enter your name.';
        if (!phone.trim()) errs.phone = 'Please enter a phone number.';
        if (!deliveryAddr.trim()) errs.deliveryAddr = 'Please enter a delivery address.';
        if (!shipDate) errs.shipDate = 'Please choose a desired shipping date.';
        if (reference && (reference.length > 20 || !/^[a-zA-Z0-9]+$/.test(reference))) {
            errs.reference = 'Alphanumeric, max 20 characters.';
        }
        setFieldErrors(errs);
        return Object.keys(errs).length === 0;
    };

    const submit = async () => {
        setError(null);
        if (!validate()) return;
        setSubmitting(true);
        try {
            const res = await apiClient.post('/api/orders', {
                orderer_name: ordererName.trim(),
                phone: phone.trim(),
                delivery_address: deliveryAddr.trim(),
                customer_reference: reference.trim(),
                desired_ship_date: shipDate,
                lines: lines.map((l) => ({ article_code: l.article_code, description: l.description, quantity: l.quantity })),
            });
            setConfirmation(res.data.our_reference);
            clear();
        } catch (err) {
            setError(err.response?.data?.error || 'Could not submit the order. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    const Req = () => <span className="text-red-600">&nbsp;*</span>;
    const errText = (key) => fieldErrors[key] && <p className="text-red-600 text-xs mt-1">{fieldErrors[key]}</p>;
    const inputCls = (key) => `border rounded px-2 py-1 ${fieldErrors[key] ? 'border-red-500' : 'border-gray-300'}`;

    if (confirmation) {
        return (
            <div className="p-6 max-w-3xl">
                <h1 className="text-2xl font-bold text-[#004EA2] mb-3">Order submitted</h1>
                <p className="text-gray-700 mb-4">
                    Your order reference is <span className="font-semibold">{confirmation}</span>. We've recorded your request.
                </p>
                <div className="flex gap-3">
                    <Link to="/orders" className="px-4 py-2 rounded-md bg-[#003F84] text-white text-sm font-semibold hover:bg-[#00457F]">View my orders</Link>
                    <Link to="/stock" className="px-4 py-2 rounded-md border border-gray-300 text-gray-700 text-sm font-semibold hover:bg-gray-50">Back to stock</Link>
                </div>
            </div>
        );
    }

    if (lines.length === 0) {
        return (
            <div className="p-6 max-w-3xl">
                <h1 className="text-2xl font-bold text-[#004EA2] mb-3">Your order is empty</h1>
                <p className="text-gray-600 mb-4">Add products from the stock list to start an order.</p>
                <Link to="/stock" className="px-4 py-2 rounded-md bg-[#003F84] text-white text-sm font-semibold hover:bg-[#00457F]">Go to stock</Link>
            </div>
        );
    }

    return (
        <div className="p-6 max-w-3xl">
            <h1 className="text-2xl font-bold text-[#004EA2] mb-4">Review your order</h1>
            {notice && <p className="mb-4 px-3 py-2 rounded bg-amber-50 border border-amber-200 text-sm text-amber-800">{notice}</p>}

            {/* Identity from Exact (read-only) */}
            <div className="bg-gray-50 border border-gray-200 rounded-md p-4 mb-5 text-sm text-gray-700">
                <p className="font-semibold">{profile?.company_name || '—'}</p>
                {profile?.debtor_number && <p>Debtor #: {profile.debtor_number}</p>}
                {profile?.email && <p>Ordered by: {profile.email}</p>}
            </div>

            {/* Lines — quantities are pallets; the Sheets column is what the order will say */}
            <table className="min-w-full text-sm mb-2">
                <thead>
                    <tr className="text-left text-gray-500 border-b">
                        <th className="py-2 pr-4">Article</th>
                        <th className="py-2 pr-4">Description</th>
                        <th className="py-2 pr-4 w-24">Pallets</th>
                        <th className="py-2 pr-4">Sheets</th>
                        <th className="py-2"></th>
                    </tr>
                </thead>
                <tbody>
                    {lines.map((l) => {
                        const palletQty = palletQtyByCode[l.article_code] ?? null;
                        return (
                            <tr key={l.article_code} className="border-b">
                                <td className="py-2 pr-4 font-medium text-gray-900">{l.article_code}</td>
                                <td className="py-2 pr-4 text-gray-600">{l.description}</td>
                                <td className="py-2 pr-4">
                                    <input
                                        type="number"
                                        min="1"
                                        max={MAX_PALLETS_PER_ORDER}
                                        value={l.quantity}
                                        onChange={(e) => setQty(l.article_code, Math.min(MAX_PALLETS_PER_ORDER, Math.max(1, parseInt(e.target.value, 10) || 1)))}
                                        className="w-20 border border-gray-300 rounded px-1 py-0.5"
                                        aria-label={`Pallets for ${l.article_code}`}
                                    />
                                </td>
                                <td className="py-2 pr-4 text-gray-600 whitespace-nowrap" title={!productsLoading && palletQty == null ? TBC_HINT : undefined}>
                                    {productsLoading ? '…' : formatSheets(l.quantity, palletQty)}
                                </td>
                                <td className="py-2">
                                    <button onClick={() => removeItem(l.article_code)} className="text-red-600 hover:underline">Remove</button>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
            <p className={`text-sm mb-1 ${overLimit ? 'text-red-600 font-semibold' : 'text-gray-700'}`}>
                Total: {totalPallets} pallet{totalPallets !== 1 ? 's' : ''} (max {MAX_PALLETS_PER_ORDER} per order)
            </p>
            {errText('lines')}
            <p className="text-xs text-gray-500 mb-5">
                Sheets are calculated from the pallet size registered for each article.{' '}
                <strong>t.b.c.</strong> = no pallet size registered; {ASSUMED_PALLET_QTY} sheets per pallet assumed, exact quantity to be confirmed by sales.
            </p>

            {/* Order details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
                <label className="text-sm text-gray-700">
                    <span className="block mb-1">Your name<Req /></span>
                    <input type="text" value={ordererName} onChange={(e) => setOrdererName(e.target.value)} className={`${inputCls('ordererName')} w-full`} />
                    {errText('ordererName')}
                </label>
                <label className="text-sm text-gray-700">
                    <span className="block mb-1">Phone<Req /></span>
                    <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={`${inputCls('phone')} w-full`} placeholder="+31 …" />
                    {errText('phone')}
                </label>
                <label className="text-sm text-gray-700 sm:col-span-2">
                    <span className="block mb-1">Delivery address<Req /> <span className="text-gray-400">(prefilled from Exact — edit if shipping elsewhere)</span></span>
                    <textarea rows={4} value={deliveryAddr} onChange={(e) => setDeliveryAddr(e.target.value)} className={`${inputCls('deliveryAddr')} w-full`} />
                    {errText('deliveryAddr')}
                </label>
                <label className="text-sm text-gray-700">
                    <span className="block mb-1">Your reference <span className="text-gray-400">(optional, max 20)</span></span>
                    <input type="text" maxLength={20} value={reference} onChange={(e) => setReference(e.target.value)} className={`${inputCls('reference')} w-56`} placeholder="e.g. PO12345" />
                    {errText('reference')}
                </label>
                <label className="text-sm text-gray-700">
                    <span className="block mb-1">Desired shipping date<Req /></span>
                    <input type="date" value={shipDate} onChange={(e) => setShipDate(e.target.value)} className={inputCls('shipDate')} />
                    {errText('shipDate')}
                </label>
            </div>

            {error && <p className="text-red-600 mb-3">{error}</p>}

            <div className="flex items-center gap-3">
                <button
                    onClick={submit}
                    disabled={submitting}
                    className="px-5 py-2 rounded-md bg-[#003F84] text-white font-semibold hover:bg-[#00457F] disabled:opacity-60"
                >
                    {submitting ? 'Submitting…' : 'Submit order'}
                </button>
                <button
                    onClick={clear}
                    disabled={submitting}
                    className="px-4 py-2 rounded-md border border-gray-300 text-gray-700 text-sm font-semibold hover:bg-gray-50 disabled:opacity-60"
                >
                    Clear all
                </button>
            </div>
        </div>
    );
}

export default CartPage;
