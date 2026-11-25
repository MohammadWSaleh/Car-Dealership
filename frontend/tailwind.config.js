export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: { brand: { 50: '#eef6ff', 100: '#d9eaff', 500: '#1f6feb', 600: '#1558c7', 700: '#10449a', 900: '#0b2a5e' }, ink: '#0f172a', night: { 800: '#111a2e', 900: '#0b1220' }, paper: '#f3f5f9' },
      boxShadow: { panel: '0 1px 2px rgba(15,23,42,.05), 0 8px 24px -12px rgba(30,64,175,.14)', pop: '0 24px 60px -20px rgba(11,18,32,.45)' },
      fontFamily: { sans: ['Inter', 'Segoe UI', 'Tahoma', 'system-ui', 'sans-serif'] },
    },
  },
  plugins: [],
};
