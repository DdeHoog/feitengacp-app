import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../authContext';

function HomePage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { authToken, login } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    try {
      // Call the login function from AuthContext. It handles the API call, token storage, and state updates.
      const result = await login(email, password); 

      if (result.success) {
        // login succesful
      } else {
        // If login failed (e.g., invalid credentials), set the error message
        setError(result.message);
      } 
    } catch (err) {
      // This catch block will primarily handle network errors not caught by AuthContext's login
      console.error("Login error (network or unexpected):", err);
      setError('An unexpected error occurred during login.');
    }
  };
      

  return (
    <div className=" w-full h-full">
      {/* Flex container for the two-column layout: title/form on left, image on right */}
      <div className="flex justify-between items-start mb-8 mt-30">

        {/* Left Column: Contains the title and the new login form. */}
        <div className="flex flex-col items-start max-w-lg ml-12">

          {/* The heading for the page. */}
          <h1 className="text-3xl font-bold text-gray-800 mb-4">
            Welcome to Feiteng Composites Europe B.V.
          </h1>
          
          {/* Basic Login Form. */}
          {!authToken ? (
            <div className="bg-white p-6 rounded-lg shadow-md w-full max-w-sm mt-4">
              <h2 className="text-2xl font-semibold text-gray-800 mb-4">Login</h2>
              <form onSubmit={handleSubmit}>
                <div className="mb-4">
                  <label htmlFor="email" className="block text-gray-700 text-sm font-bold mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    id="email"
                    className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="mb-6">
                  <label htmlFor="password" className="block text-gray-700 text-sm font-bold mb-2">
                    Password
                  </label>
                  <input
                    type="password"
                    id="password"
                    className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 mb-3 leading-tight focus:outline-none focus:shadow-outline"
                    placeholder="********"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
                <div className="flex items-center justify-between">
                  <button
                    type="submit"
                    className="bg-blue-700 hover:bg-blue-800 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
                  >
                    Sign In
                  </button>
                  <a
                    className="inline-block align-baseline font-bold text-sm text-blue-700 hover:text-blue-800"
                    href="#"
                  >
                    Forgot Password?
                  </a>
                </div>
              </form>
            </div>
          ) : (
            // If authToken exists, show nothing in this spot, as per your requirement.
            // You could also put a "Welcome Back!" message here if desired.
            <div className="bg-white p-6 rounded-lg shadow-md w-full max-w-sm mt-4 text-center">
              <h2 className="text-2xl font-semibold text-gray-800 mb-4">You are logged in!</h2>
              <p className="text-gray-700">Explore the site using the navigation above.</p>
            </div>
          )}
          </div>
        

        {/* Right Column: Contains the company building image. */}
        <div className="flex-shrink-0 mr-company-name-bar-width mt-7">
          {/* The image itself. 'h-[400px]' sets its height, 'w-auto' maintains aspect ratio. */}
          <img src="/location.png" alt="Company Building" className="h-[400px] w-auto rounded-lg shadow-md " />-
        </div>
      </div>
    </div>
  );
}

export default HomePage;