import { useState, useEffect } from 'react';
import { useAuth } from '../authContext';

//Need to map dutch headers to english headers
const headerMapping = {
  'Artikelcode': 'Item Code',
  'Artikelomschrijving': 'Item Description',
  'Vrije voorraad': 'Free Stock',
  'Planning inkomend': 'Planned In',
  'Verwachte voorraad': 'Expected Stock',
}

function useProducts() {
  const { authToken, isAuthReady, isAuthenticated } = useAuth();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // API fetch
  useEffect(() => {
    const fetchProducts = async () => {

      // Only attempt to fetch products if the authentication context is ready
      // and the user is authenticated (i.e., authToken exists).
      if (!isAuthReady) {
        console.log("useProducts: Auth context not yet ready, skipping fetch.");
        return; // Exit early if auth context hasn't finished its initial check
      }
      if (!isAuthenticated) {
        console.log("useProducts: User not authenticated, cannot fetch products.");
        setLoading(false); // Stop loading state if not authenticated
        setError("Authentication required to fetch products.");
        return; // Exit if user is not authenticated
      }

      setLoading(true);
      setError(null);

      try {      
        const baseURL = process.env.REACT_APP_API_BASE_URL; // Fetches base url basd on prod or dev setup - render for dev.
        const response = await fetch(`${baseURL}/api/products`, {
          methods: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`, // Attach JWT token for authentication
          },
        });

        // Check if the network response was successful (status code 200-299)
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.statusText}`);
        }

        // Parse the JSON data from the response
        const data = await response.json();

        // Update the products state with the fetched data
        setProducts(data);
        console.log("useProducts: Products fetched successfully.");
      } catch (e) {
        console.error("Failed to fetch products:", e);
        setError(e.message || "An unknown error occurred while fetching products.");
      } finally {
        setLoading(false);
      }
    };

    // Call the fetch function when the component mounts
    fetchProducts();


  }, [authToken, isAuthReady, isAuthenticated]); // Dependency array includes authToken, isAuthReady, and isAuthenticated - rerun when token or auth state changes

  return { products, loading, error }; 

}

export default useProducts;
