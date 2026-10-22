import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../authContext';
import apiClient from '../api';
import NewsFeed from './NewsFeed';
import HqTiles from './HqTiles';
import { fmtDay } from '../dates';

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
  // Shown when a login takes unusually long — typically the server is in its
  // cold-start warm-up just after a restart and is retrying behind a 429.
  const [slowLogin, setSlowLogin] = useState(false);
  // Landing-page news — shown only once logged in (Damian, 2026-10-09 and again 2026-10-19:
  // before login the page's one job is the login). The endpoint itself is public; this just
  // doesn't ask for it until there is a token. It is decoration: a failed fetch hides the bar.
  const [news, setNews] = useState([]);
  const [newsOpen, setNewsOpen] = useState(false);

  useEffect(() => {
    if (!authToken) { setNews([]); setNewsOpen(false); return undefined; }
    let cancelled = false;
    apiClient.get('/api/news')
      .then((res) => { if (!cancelled) setNews(res.data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [authToken]);

  // News reach (Ad, 2026-10-20): report a card once it has been on screen ~2 s, and every
  // click on its link. Fire-and-forget — a failed report must never bother the customer.
  // `reported` dedupes "seen" per login (the server keeps the first time anyway).
  const reported = useRef(new Set());
  useEffect(() => { reported.current = new Set(); }, [authToken]);
  const newsSeen = useCallback((id) => {
    if (reported.current.has(id)) return;
    reported.current.add(id);
    apiClient.post(`/api/news/${id}/seen`).catch(() => {});
  }, []);
  const newsClicked = useCallback((id) => {
    apiClient.post(`/api/news/${id}/click`).catch(() => {});
  }, []);

  // Escape closes the news panel, like any overlay.
  useEffect(() => {
    if (!newsOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setNewsOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [newsOpen]);

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
    setSlowLogin(false);
    setIsLoading(true);
    // If the request hasn't returned in a few seconds, surface a reassuring
    // notice (the server is likely warming up and retrying behind a 429).
    const slowTimer = setTimeout(() => setSlowLogin(true), 4000);

    try {
        const result = await login(email, password);
        if (!result.success) {
            setError(result.message);
        }
    } catch (err) {
        console.error("Login error (network or unexpected):", err);
        setError('An unexpected error occurred during login.');
      } finally {
          clearTimeout(slowTimer);
          setSlowLogin(false);
          setIsLoading(false);
      }
  };
      

  // Signed in (redesign 2026-10-19, after Ad's request for HQ-style blocks): the warehouse
  // photo fills the page as a background; over it the welcome line, a news bar with the latest
  // headline and the six HQ product tiles. The bar opens the full news list in place of the
  // tiles — one panel, so nothing has to be fitted around a seventh block.
  if (authToken) {
    const latest = news[0];
    return (
      <div
        className="relative h-full min-h-[32rem] lg:mr-brand-bar-lg xl:mr-brand-bar-xl rounded-lg overflow-hidden bg-cover bg-[center_40%]"
        style={{ backgroundImage: 'url(/location2-bg.jpg)' }}
      >
        {/* Light wash from the left so the text and tiles stay readable on the photo */}
        <div className="absolute inset-0 bg-gradient-to-r from-white/85 via-white/55 to-white/10" aria-hidden="true" />

        <div className="relative h-full overflow-y-auto p-6 lg:p-10">
          <div className="max-w-3xl">
            <h1 className="text-xl lg:text-2xl xl:text-3xl font-bold text-gray-800">
              Welcome to Feiteng Composites Europe B.V.
            </h1>
            <p className="mt-1 text-sm text-gray-600">Your login lasts 1 hour, after which you will be asked to log in again.</p>

            {latest && (
              <button
                type="button"
                onClick={() => setNewsOpen((o) => !o)}
                aria-expanded={newsOpen}
                aria-controls="news-panel"
                className="group mt-6 w-full flex items-stretch rounded-lg overflow-hidden shadow-md bg-white/90 text-left hover:bg-[#004EA2] hover:text-white transition-colors"
              >
                <span className="flex items-center px-4 bg-[#004EA2] text-white text-sm font-bold tracking-widest">NEWS</span>
                <span className="flex-1 min-w-0 px-4 py-3">
                  <span className="block text-xs text-gray-500 group-hover:text-blue-100">{fmtDay(latest.published_at)}</span>
                  <span className="block font-semibold truncate">{latest.title}</span>
                </span>
                <span className="flex items-center px-4 text-sm font-semibold text-[#004EA2] group-hover:text-white whitespace-nowrap">
                  {newsOpen ? 'Close ✕' : news.length > 1 ? `All news (${news.length}) ▾` : 'Read ▾'}
                </span>
              </button>
            )}

            <div className="mt-4">
              {newsOpen && latest ? (
                <div
                  id="news-panel"
                  className="max-h-[calc(100vh-22rem)] overflow-y-auto -mr-5 pr-2 [scrollbar-gutter:stable] [scrollbar-width:thin] [scrollbar-color:rgb(0_78_162/0.7)_transparent]"
                >
                  {/* The cards keep the column's width (= news bar = tiles). -mr-5 pr-2 + a reserved
                      gutter put the scrollbar just outside the column, so the cards' rounded right
                      edge never touches it; the track is transparent, the thumb Feiteng blue. */}
                  <NewsFeed items={news} onSeen={newsSeen} onLinkClick={newsClicked} />
                </div>
              ) : (
                <HqTiles />
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Not signed in: the original landing page — title + login form left, photo right.
  return (
    <div className=" w-full h-full ">
      {/* Flex container for the two-column layout: title/form on left, image on right */}
      <div className="min-h-full flex flex-col justify-center items-center lg:flex-row lg:justify-between lg:items-start">

        {/* Left Column: Contains the title and the login form. */}
        <div className="flex flex-col items-center lg:items-start max-w-lg lg:ml-8 xl:ml-12 lg:mt-10 xl:mt-20">

          {/* The heading for the page. */}
          <h1 className="text-xl lg:text-2xl xl:text-3xl font-bold text-gray-800 mb-4">
            Welcome to Feiteng Composites Europe B.V.
          </h1>

            <div className="bg-white p-2 lg:p-4 xl:p-6 rounded-lg shadow-md w-full max-w-sm mt-4 ">
              {notification && (
                  <div className="mb-4 p-3 rounded-md bg-yellow-100 text-yellow-800 border border-yellow-300 text-center">
                      {notification}
                  </div>
              )}
              {error && (
                  <div className="mb-4 p-3 rounded-md bg-red-100 text-red-800 border border-red-300 text-center">
                      {error}
                  </div>
              )}
              {isLoading && slowLogin && (
                  <div className="mb-4 p-3 rounded-md bg-blue-50 text-blue-800 border border-blue-200 text-center">
                      The server may be starting up — your first login can take a few extra seconds. Please wait…
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
        </div>

        {/* Right Column: Contains the company building image. */}
        <div className="hidden lg:block flex-shrink-0 lg:mr-brand-bar-lg xl:mr-brand-bar-xl">
          <img src="/location.png" alt="Company Building" className="lg:h-[300px] xl:h-[350px] 2xl:h-[400px] w-auto rounded-lg shadow-md lg:mt-40 2xl:mt-30 lg:ml-3" />
        </div>
      </div>
    </div>
  );
}

export default HomePage;