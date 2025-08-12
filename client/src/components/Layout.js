import React from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { useAuth } from '../authContext';

function Layout() {
  const { authToken } = useAuth();

  const navLinkStyles = ({ isActive }) => ({
    fontWeight: isActive ? 'bold' : 'normal',
    color: isActive ? '#4338ca' : '#374151',
  });

  // Custom widths for the left and right bars - light blue bars
  const leftPadding = 'pl-15';
  const rightPadding = 'pr-20';

  return (
    <div className="relative min-h-screen bg-white">
      
      {/* 1. BACKGROUND BARS: These are positioned absolutely to the container. */}
      <div className="absolute inset-y-0 left-0 w-custom-bar-width-left bg-blue-300 z-10"></div> {/* Left Bar */}
      
      <div className="absolute inset-y-0 right-0 flex z-10"> {/* Right Bars Container */}
        <div className="w-company-name-bar-width bg-blue-700 flex items-center justify-center">
          <span className="transform rotate-90 text-transparent -translate-y-16 [-webkit-text-stroke:2px_white] text-8xl font-extrabold tracking-widest whitespace-nowrap">
            FEITENG
          </span>
        </div>
        <div className="w-custom-bar-width-right bg-blue-300"></div>
      </div>

      <div className={`absolute bottom-[44px] right-15 z-20 bg-gray-300 py-2 px-4 flex justify-end items-center w-company-name-bar-width`}> 
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
      <div className="relative min-h-screen flex flex-col z-20">
        
        {/* Header */}
        <header className={`bg-white shadow-md p-4 flex justify-between items-center ${leftPadding} ${rightPadding}`}>
          <div className="text-2xl font-bold text-indigo-700">
            <img src="/logoBlue.png" alt="Company Logo" className="h-9 inline-block mr-2" /> {/*Logo */}
          </div>
          { authToken && (
            <nav>
              <ul className="flex space-x-8 text-lg">
                <li><NavLink to="/" style={navLinkStyles}>Home</NavLink></li>
                <li><NavLink to="/stock" style={navLinkStyles}>Stock</NavLink></li>
                <li><NavLink to="/contact" style={navLinkStyles}>Download</NavLink></li>
              </ul>
            </nav>
          )}
        </header>

        {/* Main Content */}
        <main className={`flex-grow p-2 overflow-y-auto ${leftPadding} ${rightPadding}`}>
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