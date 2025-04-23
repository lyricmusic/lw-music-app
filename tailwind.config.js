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
        accent: '#B79EFF',
        'brand-color': '#25263E',
        'gray-block': '#ECEDF2',
        'hover-brand': '#E9E2FF',
        'light-brand': '#8B8DB3',
        'secondary-text': '#5C5D7E',
      },
    },
  },
}
