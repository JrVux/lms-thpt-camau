/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        page: '#FAFAFA',
        card: '#FFFFFF',
        brand: {
          DEFAULT: '#E8544A',
          light: '#FDEDEC',
          heading: '#18181B',
          body: '#52525B',
          muted: '#A1A1AA',
          border: '#ECECEE',
        },
        badge: {
          red: { bg: '#FDEDEC', text: '#E8544A' },
          green: { bg: '#E7F6EC', text: '#22A55A' },
          purple: { bg: '#F0EDFB', text: '#7C5CFC' },
          orange: { bg: '#FFF3E0', text: '#F5A623' },
          blue: { bg: '#E8F0FE', text: '#3B82F6' },
        },
      },
      boxShadow: {
        card: '0 1px 3px rgba(16, 24, 40, 0.05), 0 1px 2px rgba(16, 24, 40, 0.03)',
        'card-hover': '0 8px 24px rgba(16, 24, 40, 0.08), 0 2px 6px rgba(16, 24, 40, 0.04)',
      },
      fontFamily: {
        sans: ['Inter', 'SF Pro Display', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fadeIn 0.15s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};