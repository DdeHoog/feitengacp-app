import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../authContext';

function HomePage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { authToken, login } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
        const result = await login(email, password);
        if (!result.success) {
            setError(result.message);
        }
    } catch (err) {
        console.error("Login error (network or unexpected):", err);
        setError('An unexpected error occurred during login.');
      } finally {
          setIsLoading(false);
      }
  };
      

  return (
    <div className=" w-full h-full ">
      {/* Flex container for the two-column layout: title/form on left, image on right */}
      <div className="min-h-full flex flex-col justify-center items-center lg:flex-row lg:justify-between lg:items-start">

        {/* Left Column: Contains the title and the new login form. */}
        <div className="flex flex-col items-center lg:items-start max-w-lg lg:ml-8 xl:ml-12 lg:mt-10 xl:mt-20">

          {/* The heading for the page. */}
          <h1 className="text-xl lg:text-2xl xl:text-3xl font-bold text-gray-800 mb-4">
            Welcome to Feiteng Composites Europe B.V.
          </h1>
          
          {/* Basic Login Form. */}
          {!authToken ? (
            <div className="bg-white p-2 lg:p-4 xl:p-6 rounded-lg shadow-md w-full max-w-sm mt-4 ">
              <h2 className="text-xl xl:text-2xl font-semibold text-gray-800 mb-4">Login</h2>
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
                    disabled={isLoading}
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
                    disabled={isLoading}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <button
                    type="submit"
                    className="bg-blue-700 hover:bg-blue-800 text-white font-bold py-2 px-2 xl:px-4 rounded focus:outline-none focus:shadow-outline"
                    disabled={isLoading}
                  >
                    {isLoading ? 'Signing In...' : 'Sign In'} {/* 4. Change the text when loading */}
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
            // If authToken exists, show nothing in this spot
            <div className="bg-white p-2 md:p-4 xl:p-6 rounded-lg shadow-md w-full max-w-sm mt-10 text-center">
              <h2 className="text-xl xl:text-2xl font-semibold text-gray-800 mb-4">You are logged in!</h2>
              <p className="text-gray-700">Explore the site using the navigation above.</p>
            </div>
          )}
          </div>
        

        {/* Right Column: Contains the company building image. */}
        <div className="hidden lg:block flex-shrink-0 lg:mr-300width xl:mr-company-name-bar-width">
          {/* The image itself. 'h-[400px]' sets its height, 'w-auto' maintains aspect ratio. */}
          <img src="/location.png" alt="Company Building" className="lg:h-[300px] xl:h-[350px] 2xl:h-[400px] w-auto rounded-lg shadow-md lg:mt-40 2xl:mt-30 lg:ml-3" />
        </div>
      </div>
    </div>
  );
}

export default HomePage;