import { useState, useEffect } from 'react';
import { useAuth } from '../authContext';
import apiClient from '../api';

function useProducts() {
  const { isAuthReady, isAuthenticated } = useAuth();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // API fetch
  useEffect(() => {
    const fetchProducts = async () => {

      if (!isAuthReady) {
        return; 
      }
      if (!isAuthenticated) { 
        setLoading(false); 
        setError("Authentication required to fetch products.");
        return; 
      }

      setLoading(true);
      setError(null);

      try {
        const response = await apiClient.get('/api/products');
        setProducts(response.data);

        } catch (err) {
          setError(err.response?.data?.error || 'Failed to fetch products.');
          } finally {
            setLoading(false);
          }
    };

        fetchProducts();
    }, [isAuthenticated, isAuthReady]);

    return { products, loading, error };
}

export default useProducts;
