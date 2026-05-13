/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        felt: {
          50: '#f0f4e8',
          100: '#d9e6c8',
          200: '#b5cd9b',
          300: '#8db46d',
          400: '#6b9b4a',
          500: '#528232',
          600: '#3f6627',
          700: '#334e21',
          800: '#2a3f1e',
          900: '#23341b',
        },
        chip: {
          red: '#c0392b',
          blue: '#2980b9',
          green: '#27ae60',
          black: '#1a1a1a',
          white: '#ecf0f1',
        },
        poker: {
          red: '#e74c3c',
          black: '#1a1a1a',
          gold: '#f1c40f',
          silver: '#bdc3c7',
        },
      },
      fontFamily: {
        display: ['"Fredoka One"', 'cursive'],
        body: ['Inter', 'sans-serif'],
      },
      boxShadow: {
        card: '0 4px 12px rgba(0,0,0,0.25)',
        'card-hover': '0 8px 24px rgba(0,0,0,0.35)',
        chip: '0 2px 6px rgba(0,0,0,0.3)',
        table: 'inset 0 0 60px rgba(0,0,0,0.4)',
      },
    },
  },
  plugins: [],
};
