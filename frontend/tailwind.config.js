export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: { brand: { 50: '#eef6ff', 100: '#d9eaff', 500: '#1f6feb', 600: '#1558c7', 700: '#10449a', 900: '#0b2a5e' }, ink: '#0f172a' },
      fontFamily: { sans: ['Inter', 'Segoe UI', 'Tahoma', 'system-ui', 'sans-serif'] },
    },
  },
  plugins: [],
};
