/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}", // Include all JS/TS files in src
    "./public/index.html", // Ensure the public index.html is included
    "./src/components/**/*.{js,jsx,ts,tsx}", // Configures Tailwind to scan component files.
  ],
  theme: {
    extend: {
      spacing: {
        '13': '3.25rem', // 52px
        '14': '3.5rem',  // 56px
        '15': '3.75rem', // 60px
        '16': '4rem',   // 64px
        '21': '5.25rem', // 84px
        '30': '7.5rem', // 120px
        'custom-bar-width-left': '60px', // Example for a specific pixel value
        'custom-bar-width-right': '60px',
        'company-name-bar-width': '420px',
      }
    },
  },
  plugins: [],
}

