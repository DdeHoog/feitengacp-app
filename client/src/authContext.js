import React, { createContext, useState, useEffect, useContext } from 'react';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {

    const [authToken, setAuthToken] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);

    // Effect to check localStorage for a token when the app first loads
    useEffect(() => {
        console.log("AuthContext: Checking localStorage for token...");
        const token = localStorage.getItem('authToken');
        if (token) {
            setAuthToken(token);
            console.log("AuthContext: Token found in localStorage.");
        } else {
            console.log("AuthContext: No token found in localStorage.");
        }
        setIsAuthReady(true); // Mark auth as ready after checking localStorage
    }, []);

    const login = async (email, password) => {
        try {
            const response = await fetch('https://feitengacp-local-server.onrender.com/api/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email, password }),
            });

            const data = await response.json();

            if (response.ok) {
                // If login is successful, store the token
                localStorage.setItem('authToken', data.token);
                setAuthToken(data.token);
                console.log("AuthContext: Login successful, token stored.");
                return { success: true, message: data.message };
            } else {
                // Handle login errors
                console.error("AuthContext: Login failed:", data.message);
                return { success: false, message: data.message || 'Login failed' };
            }
        } catch (error) {
            console.error("AuthContext: Error during login:", error);
            return { success: false, message: 'Network error or server unavailable.' };
        }
    };

    // Function to handle user logout
    const logout = () => {
        localStorage.removeItem('authToken'); // Remove token from localStorage
        setAuthToken(null); // Clear token from state
        console.log("AuthContext: User logged out, token removed.");
    };

    // Provide the auth state and functions to children components
    const contextValue = {
        authToken,
        isAuthReady,
        login,
        logout,
        isAuthenticated: !!authToken, // Convenience boolean for checking authentication status
    };

    return (
        <AuthContext.Provider value={contextValue}>
            {children}
        </AuthContext.Provider>
    );
};

// Custom hook to use the AuthContext
export const useAuth = () => {
    return useContext(AuthContext);
};
