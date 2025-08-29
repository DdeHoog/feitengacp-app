import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../authContext';

// SVG icons for the password toggle button
const EyeIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.432 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
);

const EyeSlashIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.243 4.243L6.228 6.228" />
    </svg>
);

function HomePage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const { authToken, login } = useAuth();
  const location = useLocation();
  const [notification, setNotification] = useState(null);

  // display logout or session expiration messages
  useEffect(() => {
    if (location.state?.message) {
      setNotification(location.state.message);
      navigate(location.pathname, { replace: true });
    }
  }, [location, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setNotification(null); 
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
              {notification && (
                  <div className="mb-4 p-3 rounded-md bg-yellow-100 text-yellow-800 border border-yellow-300 text-center">
                      {notification}
                  </div>
              )}
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
                <div className="mb-6 relative">
                  <label htmlFor="password" className="block text-gray-700 text-sm font-bold mb-2">
                    Password
                  </label>
                  <input
                    // Dynamically set the input type
                    type={showPassword ? 'text' : 'password'}
                    id="password"
                    className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 mb-3 leading-tight focus:outline-none focus:shadow-outline pr-10"
                    placeholder="********"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={isLoading}
                  />
                  {/* The eye button */}
                  <button
                    type="button" // Important: prevents form submission
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 top-4 pr-3 flex items-center text-gray-500 hover:text-gray-700"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeSlashIcon /> : <EyeIcon />}
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <button
                    type="submit"
                    className="bg-blue-700 hover:bg-blue-800 text-white font-bold py-2 px-2 xl:px-4 rounded focus:outline-none focus:shadow-outline"
                    disabled={isLoading}
                  >
                    {isLoading ? 'Signing In...' : 'Sign In'} {/* 4. Change the text when loading */}
                  </button>
                  {/* <a
                    className="inline-block align-baseline font-bold text-sm text-blue-700 hover:text-blue-800"
                    href="#"
                  >
                    Forgot Password?
                  </a> */}
                </div>
              </form>
            </div>
          ) : (
            // If authToken exists, show nothing in this spot
            <div className="bg-white p-2 md:p-4 xl:p-6 rounded-lg shadow-md w-full max-w-sm mt-10 text-center">
              <h2 className="text-xl xl:text-2xl font-semibold text-gray-800 mb-4">You are logged in!</h2>
              <p className="text-gray-700">Login lasts for 1 hour, after which you will be prompted to log in again.</p>
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