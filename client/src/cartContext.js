import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

// The in-progress order. Lives only in the browser (localStorage) until the
// customer submits it on the Cart page — no server-side cart. Every ordering
// entry point (stock table, later a quick-order page or "reorder") funnels here.
const CartContext = createContext(null);
const STORAGE_KEY = 'orderCart';

const readStored = () => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return Array.isArray(JSON.parse(raw)) ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
};

export const CartProvider = ({ children }) => {
    const [lines, setLines] = useState(readStored);

    useEffect(() => {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(lines)); } catch { /* private mode etc. */ }
    }, [lines]);

    // Merge by article_code so re-adding a product bumps its quantity.
    const mergeOne = (list, { article_code, description, quantity }) => {
        const i = list.findIndex((l) => l.article_code === article_code);
        if (i === -1) return [...list, { article_code, description: description || '', quantity }];
        const next = [...list];
        next[i] = { ...next[i], quantity: next[i].quantity + quantity };
        return next;
    };

    const addItem = useCallback((item, quantity = 1) => {
        setLines((prev) => mergeOne(prev, { ...item, quantity }));
    }, []);

    // Load many lines at once (used by "reorder" from order history).
    const addMany = useCallback((items) => {
        setLines((prev) => items.reduce((acc, it) => mergeOne(acc, it), prev));
    }, []);

    const setQty = useCallback((article_code, quantity) => {
        setLines((prev) => prev
            .map((l) => (l.article_code === article_code ? { ...l, quantity } : l))
            .filter((l) => l.quantity > 0));
    }, []);

    const removeItem = useCallback((article_code) => {
        setLines((prev) => prev.filter((l) => l.article_code !== article_code));
    }, []);

    // Replace the whole cart (used by "reorder" — the past order becomes the cart).
    const replaceItems = useCallback((items) => {
        setLines(items.map((it) => ({ article_code: it.article_code, description: it.description || '', quantity: it.quantity })));
    }, []);

    const clear = useCallback(() => setLines([]), []);

    const value = { lines, addItem, addMany, replaceItems, setQty, removeItem, clear, count: lines.length };
    return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};

export const useCart = () => useContext(CartContext);
