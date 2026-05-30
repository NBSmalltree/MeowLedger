/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        cat: {
          50: '#fef7ee',
          100: '#fdecd7',
          200: '#fbd5ae',
          300: '#f8b77a',
          400: '#f49044',
          500: '#f17420',
          600: '#e25a16',
          700: '#bb4214',
          800: '#953518',
          900: '#782e17',
        },
      },
    },
  },
  plugins: [],
}
