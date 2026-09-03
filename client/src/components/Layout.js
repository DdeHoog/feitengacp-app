import React from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { useAuth } from '../authContext';
import { useCart } from '../cartContext';

function Layout() {
  const { authToken, logout, isAdmin } = useAuth();
  const { count } = useCart();

  const navLinkStyles = ({ isActive }) => ({
    fontWeight: isActive ? 'bold' : 'normal',
    color: isActive ? '#004EA2' : '#374151',
  });

  // Custom widths for the left and right bars - light blue bars
  const leftPadding = 'pl-15';
  const rightPadding = 'pr-20';

  return (
    <div className="relative min-h-screen bg-white">
      
      {/* 1. BACKGROUND BARS: These are positioned absolutely to the container. */}
      <div className="w-4 absolute inset-y-0 left-0 lg:w-custom-bar-width-left bg-blue-300 z-10"></div> {/* Left Bar */}
      
      <div className=" absolute inset-y-0 right-0 flex z-10"> {/* Right Bars Container */}
        <div className="hidden md:flex md:w-16 lg:w-300width xl:w-company-name-bar-width bg-[#004EA2] flex items-center justify-center">
          <span className="hidden md:flex transform rotate-90 text-transparent -translate-y-16 [-webkit-text-stroke:2px_white] md:text-6xl xl:text-8xl font-extrabold tracking-widest whitespace-nowrap">
            FEITENG
          </span>
        </div>
        <div className="w-4 lg:w-custom-bar-width-right bg-blue-300"></div>
      </div>

      <div className={`hidden lg:flex absolute bottom-[44px] right-15 z-20 bg-gray-300 py-2 px-4 flex justify-end items-center lg:w-300width xl:w-company-name-bar-width`}> 
        <div className="text-left text-black text-sm space-y-1 ">
          <p className="font-bold">Feiteng Composites (Europe) B.V.</p>
          <p>Industriestraat 4</p>
          <p>5804 CK Venray</p>
          <p>The Netherlands</p>
          <p>Phone: +31 (0)85 016 1962</p>
          <p>Email: sales@feitengacp.eu</p>
        </div>
      </div>

      {/* 2. MAIN CONTENT AREA: This is the primary content layer. */}
      <div className="relative h-screen flex flex-col z-20">
        
        {/* Header */}
        <header className={`bg-white shadow-md p-4 flex justify-between items-center ${leftPadding} ${rightPadding}`}>
          <div className="text-2xl font-bold text-indigo-700">
            <NavLink to="/" aria-label="Home">
              <img src="/logoBlue.png" alt="Feiteng — Home" className="h-9 inline-block mr-2" /> {/* Logo doubles as Home */}
            </NavLink>
          </div>
          { authToken && (
            <nav>
              <ul className="flex items-center space-x-8 text-lg">
                <li>
                  <NavLink to="/cart" style={navLinkStyles} className="relative inline-flex items-center top-[3px]" aria-label={`Cart${count > 0 ? `, ${count} item${count !== 1 ? 's' : ''}` : ''}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-1.35 2.7A1 1 0 007.5 17H17M17 17a2 2 0 100 4 2 2 0 000-4zm-9 2a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                    {count > 0 && (
                      <span className="absolute -top-2 -right-2 bg-red-600 text-white text-xs font-semibold rounded-full min-w-[1.15rem] h-[1.15rem] px-1 flex items-center justify-center">
                        {count}
                      </span>
                    )}
                  </NavLink>
                </li>
                <li><NavLink to="/stock" style={navLinkStyles}>Stock</NavLink></li>
                <li><NavLink to="/orders" style={navLinkStyles}>My Orders</NavLink></li>
                <li><NavLink to="/contact" style={navLinkStyles}>Download</NavLink></li>
                {isAdmin && (
                  <li><NavLink to="/admin" style={navLinkStyles}>Admin</NavLink></li>
                )}
                <li>
                  <button
                    onClick={logout}
                    className="inline-flex items-center gap-1 font-normal text-gray-700 hover:text-red-600 focus:outline-none transition-colors duration-200"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7M13 16v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    Logout
                  </button>
                </li>
              </ul>
            </nav>
          )}
        </header>

        {/* Main Content - adjust this for smaller screen to shrink content area*/}
        <main className={`flex-grow p-0 lg:p-2 overflow-y-auto pl-0 lg:pl-15 lg:pr-20`}>
          <Outlet />
        </main>
        
        {/* Footer */}
        <footer className={`flex flex-col`}>
          {/* Black Bar */}
          <div className="bg-gray-900 text-white py-2 px-3 flex justify-center items-center">
            {/* Inner div to control max-width and layout of logo/copyright */}
            <div className="flex gap-2 items-center w-full max-w-screen-xl"> 
              <div className="text-xl font-bold">
                <img src="/logoBlack.png" alt="Company Logo" className="h-6 inline-block mr-2" />
              </div> 
              <span className="text-sm">
                &copy; {new Date().getFullYear()} Feiteng Composites (Europe) B.V. ALL RIGHTS RESERVED.
              </span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

export default Layout;