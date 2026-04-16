import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        base: {
          blue: '#0052FF',
          deep: '#001a4d',
          ice: '#3d5a80',
          cyan: '#00b4d8',
          sand: '#a8dadc',
          brick: '#1d3557',
          bg: '#0a0e27',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 0 24px rgba(0, 82, 255, 0.45)',
      },
    },
  },
  plugins: [],
};

export default config;
