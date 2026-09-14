/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        canvas: '#F8F9FA',
        brand: {
          dark: '#023047',
          cyan: '#219EBC',
          amber: '#FFB703',
          orange: '#FB8500',
        },
      },
      fontFamily: {
        sans: ['"Public Sans"', 'sans-serif'],
        mono: ['Inter', 'monospace'],
        inter: ['Inter', 'sans-serif'],
      },
      boxShadow: {
        glass: '0 8px 32px rgba(2, 48, 71, 0.08)',
        'glass-hover': '0 12px 40px rgba(2, 48, 71, 0.14)',
        'glass-dark': '0 8px 32px rgba(0, 0, 0, 0.25)',
      },
    },
  },
  plugins: [],
};
