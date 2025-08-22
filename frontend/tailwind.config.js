/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./pages/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}"
  ],
  safelist: [
    'truncate-2'   // ensures your custom clamp class is included
  ],
  theme: {
    extend: {},
  },
  plugins: [],

  darkMode: 'class', // enable dark mode support
  
}
