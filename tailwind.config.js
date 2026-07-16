/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  corePlugins: {
    preflight: false,
  },
  plugins: [],
  theme: {
    extend: {
      colors: {
        accent: 'var(--color-accent)',
        'auth-card': 'var(--color-auth-card)',
        'auth-muted': 'var(--color-auth-muted)',
        'brand-color': 'var(--color-brand)',
        'gray-block': 'var(--color-gray-block)',
        'hover-brand': 'var(--color-hover-brand)',
        'light-brand': 'var(--color-light-brand)',
        'secondary-text': 'var(--color-secondary-text)',
      },
    },
  },
}
