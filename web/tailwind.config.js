/** @type {import('tailwindcss').Config}
 * CAP brand token mapping (docs/design/V2-DESIGN-PLAN.md section 3).
 * Components use these semantic names; raw Tailwind hue classes
 * (bg-blue-500, text-red-600, ...) are banned by scripts/check-brand.sh.
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: 'var(--paper)',
        ink: 'var(--ink)',
        ink2: 'var(--ink-2)',
        hairline: 'var(--hairline)',
        muted: 'var(--muted)',
        symbol: {
          DEFAULT: 'var(--cap-symbol-blue)',
          20: 'var(--cap-symbol-blue-20)',
        },
        scarlet: {
          DEFAULT: 'var(--cap-scarlet)',
          20: 'var(--cap-scarlet-20)',
        },
        afyellow: {
          DEFAULT: 'var(--cap-af-yellow)',
          20: 'var(--cap-af-yellow-20)',
        },
        gray20: 'var(--cap-silver-gray-20)',
      },
      fontFamily: {
        sans: ['Ubuntu', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['Rajdhani', 'Ubuntu', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
