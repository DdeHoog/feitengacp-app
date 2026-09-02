import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../authContext';
import apiClient from '../api';

// Gated admin shell. Batch 3 = the gate + a who-am-I check that proves the
// /api/admin/* auth works end-to-end. Batch 6 fills this with login status,
// submitted orders, and forecasts per customer.
function AdminPage() {
    const { isAuthReady, isAuthenticated, isAdmin } = useAuth();
    const [whoami, setWhoami] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!isAdmin) return;
        apiClient.get('/api/admin/whoami')
            .then((res) => setWhoami(res.data))
            .catch((err) => setError(err.response?.data?.error || 'Failed to reach admin API'));
    }, [isAdmin]);

    // Wait for auth to resolve, then redirect anyone who isn't an admin. The
    // server also gates /api/admin/* — this is just so the page isn't reachable.
    if (!isAuthReady) return null;
    if (!isAuthenticated || !isAdmin) return <Navigate to="/" replace />;

    return (
        <div className="p-6 max-w-4xl">
            <h1 className="text-2xl font-bold text-[#004EA2] mb-2">Admin</h1>
            <p className="text-gray-600 mb-6">
                Internal admin area. Coming soon: user login status, submitted orders, and forecasts per customer.
            </p>
            {error && <p className="text-red-600">Admin API error: {error}</p>}
            {whoami && (
                <p className="text-sm text-gray-700">
                    Signed in as <span className="font-semibold">{whoami.name}</span> ({whoami.email}) — admin access confirmed.
                </p>
            )}
        </div>
    );
}

export default AdminPage;
