import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        ink: {
          800: '#171923',
          900: '#12141d',
          950: '#0a0b10',
        },
      },
    },
  },
  plugins: [],
}

export default config
