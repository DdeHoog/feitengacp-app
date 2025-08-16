import React, { createContext, useState, useEffect, useContext, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient, { setupInterceptors } from './api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {

    const [authToken, setAuthToken] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const navigate = useNavigate();

    // Wrapped in useCallback to ensure its reference is stable for the useEffect dependency array.
    const logout = useCallback(() => {
        localStorage.removeItem('authToken');
        setAuthToken(null);
        console.log("AuthContext: User logged out, token removed.");
        navigate('/');
    }, [navigate]);

    // Effect to check localStorage and set up the interceptor on initial app load
    useEffect(() => {
        console.log("AuthContext: Checking localStorage for token...");
        const token = localStorage.getItem('authToken');
        if (token) {
            setAuthToken(token);
            console.log("AuthContext: Token found in localStorage.");
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

    const contextValue = {
        authToken,
        isAuthReady,
        login,
        logout,
        isAuthenticated: !!authToken,
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