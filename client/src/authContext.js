import React, { createContext, useState, useEffect, useContext, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient, { setupInterceptors } from './api';

const AuthContext = createContext(null);

// Decode a JWT payload without verifying its signature. Safe here because the
// claims are only used to toggle UI affordances (the server re-verifies the
// signature on every protected request). Handles base64url (- _ , no padding).
const decodeJwt = (token) => {
    try {
        const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        const json = decodeURIComponent(
            atob(base64)
                .split('')
                .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
                .join('')
        );
        return JSON.parse(json);
    } catch {
        return null;
    }
};

export const AuthProvider = ({ children }) => {

    const [authToken, setAuthToken] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const navigate = useNavigate();

    // Wrapped in useCallback to ensure its reference is stable for the useEffect dependency array.
    const logout = useCallback((options = {}) => {
        localStorage.removeItem('authToken');
        setAuthToken(null);
        console.log("AuthContext: User logged out, token removed.");
        const navigationState = options.message ? { state: { message: options.message } } : {};
        navigate('/', navigationState);
    }, [navigate]);

    // Effect to check localStorage and set up the interceptor on initial app load
    useEffect(() => {
        console.log("AuthContext: Checking localStorage for token...");
        const token = localStorage.getItem('authToken');
        if (token) {
            // Treat an expired token as logged-out instead of optimistically
            // trusting its presence. JWT `exp` is in seconds; compare to now.
            const claims = decodeJwt(token);
            const isExpired = !claims?.exp || claims.exp * 1000 <= Date.now();
            if (isExpired) {
                localStorage.removeItem('authToken');
                console.log("AuthContext: Stored token expired — cleared.");
            } else {
                setAuthToken(token);
                console.log("AuthContext: Valid token found in localStorage.");
            }
        }
        setIsAuthReady(true);
        setupInterceptors(logout); // Setup interceptors with the logout function
    }, [logout]);


    const login = async (email, password) => {
        try {
            const response = await apiClient.post('/api/login', { email, password });
            
            // With axios, the JSON data is in response.data
            const data = response.data;

            localStorage.setItem('authToken', data.token);
            setAuthToken(data.token);
            console.log("AuthContext: Login successful, token stored.");
            return { success: true, message: data.message };

        } catch (error) {
            console.error("AuthContext: Login failed:", error.response?.data?.message || error.message);
            return { success: false, message: error.response?.data?.message || 'Login failed' };
        }
    };

    const claims = authToken ? decodeJwt(authToken) : null;

    const contextValue = {
        authToken,
        isAuthReady,
        login,
        logout,
        isAuthenticated: !!authToken,
        userEmail: claims?.email || null,
        canExport: !!claims?.canExport,
    };

    return (
        <AuthContext.Provider value={contextValue}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    return useContext(AuthContext);
};