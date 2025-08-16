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
      if (error.response && (error.response.status === 401 || error.response.status === 403)) {
        console.log("Auth interceptor: Unauthorized or expired token. Logging out.");
        logout();
      }
      return Promise.reject(error);
    }
  );
};

export default apiClient;