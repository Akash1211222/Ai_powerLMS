/**
 * FutureCorp Academy design-system preset.
 *
 * Encodes the APPROVED design tokens reverse-engineered from the design
 * mockups in `_design_src/` (§2 of the master spec): Plus Jakarta Sans,
 * violet→indigo primary ramp, semantic colors, and light/dark surface tokens.
 *
 * Surface/ink/hair tokens are wired to CSS variables (see web globals.css)
 * so the existing light/dark theme toggle behavior is preserved.
 */
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'var(--font-jakarta)',
          '"Plus Jakarta Sans"',
          'ui-sans-serif',
          'system-ui',
          'sans-serif',
        ],
      },
      colors: {
        // Brand — violet/indigo ramp (from mockups)
        brand: {
          50: '#f4f2fb',
          100: '#efecf8',
          200: '#c4b5fd',
          300: '#a78bfa',
          400: '#8b5cf6',
          500: '#7c3aed',
          600: '#6d28d9',
          700: '#6366f1',
          800: '#4f46e5',
          900: '#1b1630',
        },
        // Semantic
        success: { DEFAULT: '#16a34a', soft: '#22c55e' },
        warning: { DEFAULT: '#f59e0b', soft: '#f97316' },
        danger: { DEFAULT: '#ef4444' },
        info: { DEFAULT: '#0ea5e9' },
        // Theme surface tokens -> CSS variables (light/dark)
        bg: 'var(--fca-bg)',
        panel: 'var(--fca-panel)',
        card: 'var(--fca-card)',
        chip: 'var(--fca-chip)',
        soft: 'var(--fca-soft)',
        ink: 'var(--fca-ink)',
        faint: 'var(--fca-faint)',
        hair: 'var(--fca-hair)',
        track: 'var(--fca-track)',
      },
      borderRadius: {
        card: '18px',
        panel: '12px',
      },
      boxShadow: {
        card: '0 8px 30px -12px rgba(124,58,237,.18)',
        glow: '0 8px 20px -6px rgba(124,58,237,.6)',
      },
      keyframes: {
        floaty: {
          '0%,100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        fadeUp: {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        floaty: 'floaty 4s ease-in-out infinite',
        fadeUp: 'fadeUp .4s ease-out both',
      },
    },
  },
  plugins: [],
};
