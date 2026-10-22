import React from 'react';
import './App.css'; // Import for tailwind styles
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './authContext';
import { CartProvider } from './cartContext';

// imports for the components/pages
import Layout from './components/Layout';
import HomePage from './components/HomePage';
import ProductList from './components/ProductList';
import DownloadPage from './components/DownloadPage';
import AdminPage from './components/AdminPage';
import CartPage from './components/CartPage';
import MyOrdersPage from './components/MyOrdersPage';
import ForecastPage from './components/ForecastPage';
import PrivacyPage from './components/PrivacyPage';

function App() {
  return (
    // Apply global styles here for the entire app - preferably use local styling with tailwind classes
    <div className="min-h-screen bg-white-100">
      <BrowserRouter>
        <AuthProvider>
          <CartProvider>
            <Routes>
              {/*
                The Layout component will be the parent route for all other routes.
                The <Outlet/> inside Layout will then render the child route element.
              */}
              <Route path="/" element={<Layout />}>
                {/* The index route is the default child route for the parent '/' so we land on homepage */}
                <Route index element={<HomePage />} />
                <Route path="stock" element={<ProductList />} />
                <Route path="downloads" element={<DownloadPage />} />
                {/* Old address of the downloads page — kept so existing links and bookmarks still work */}
                <Route path="contact" element={<Navigate to="/downloads" replace />} />
                <Route path="admin" element={<AdminPage />} />
                <Route path="cart" element={<CartPage />} />
                <Route path="orders" element={<MyOrdersPage />} />
                <Route path="forecast" element={<ForecastPage />} />
                {/* Public; draft until Ad approves it — then linked from the footer. */}
                <Route path="privacy" element={<PrivacyPage />} />
              </Route>
            </Routes>
          </CartProvider>
        </AuthProvider>
      </BrowserRouter>
    </div>
  );
}

export default App;
