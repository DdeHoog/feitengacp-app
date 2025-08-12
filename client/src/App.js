import React from 'react';
import './App.css'; // Import for tailwind styles
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './authContext'; 

// imports for the components/pages
import Layout from './components/Layout';
import HomePage from './components/HomePage';
import ProductPage from './components/ProductPage';
import DownloadPage from './components/DownloadPage';

function App() {
  return (
    // Apply global styles here for the entire app - preferably use local styling with tailwind classes
    <div className="min-h-screen bg-white-100">
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            {/* 
              The Layout component will be the parent route for all other routes.
              The <Outlet/> inside Layout will then render the child route element.
            */}
            <Route path="/" element={<Layout />}>
              {/* The index route is the default child route for the parent '/' so we land on homepage */}
              <Route index element={<HomePage />} />
              <Route path="stock" element={<ProductPage />} />
              <Route path="contact" element={<DownloadPage />} />
            </Route>
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </div>
  );
}

export default App;
