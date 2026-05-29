import axios from 'axios';

const apiClient = axios.create({
  baseURL: process.env.REACT_APP_API_BASE_URL
});

export const setupInterceptors = (logout) => {
  
  // This interceptor runs before every request is sent
  apiClient.interceptors.request.use(
    (config) => {
      const token = localStorage.getItem('authToken');
      if (token) {
        config.headers['Authorization'] = `Bearer ${token}`;
      }
      return config;
    },
    (error) => {
      return Promise.reject(error);
    }
  );

  // This interceptor runs on every response we get back from the server
  apiClient.interceptors.response.use(
    (response) => response,
    
    (error) => {
      // The login request's own 401 (wrong credentials) must NOT be treated as
      // an expired session — otherwise a bad password shows "session expired"
      // instead of "Invalid credentials." Let HomePage surface that error.
      const isLoginRequest = error.config?.url?.includes('/api/login');
      if (!isLoginRequest && error.response && (error.response.status === 401 || error.response.status === 403)) {
        console.log("Auth interceptor: Unauthorized or expired token. Logging out.");

        logout({ message: "Your session has expired. Please log in again." });
      }
      return Promise.reject(error);
    }
  );
};

export default apiClient;