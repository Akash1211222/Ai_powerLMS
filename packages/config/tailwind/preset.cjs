/**
 * FutureCorp Academy design-system preset — matched to futurecorpacademy.in.
 *
 * Brand language taken from the live marketing site: deep navy ink (#0f1e3d),
 * electric blue brand (#2563eb / #1552c9), orange CTAs (#f97316) with warm
 * glows, white cards (24px radius, #e7eefb hairlines, soft navy shadows),
 * Space Grotesk display type over Manrope body text.
 *
 * Surface/ink/hair tokens stay wired to CSS variables (web globals.css) so
 * light/dark theming keeps working.
 */
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-body)', 'Manrope', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: [
          'var(--font-display)',
          '"Space Grotesk"',
          'ui-sans-serif',
          'system-ui',
          'sans-serif',
        ],
      },
      colors: {
        // Brand — electric blue ramp (site's platform color)
        brand: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#2563eb',
          600: '#1d4ed8',
          700: '#1552c9',
          800: '#1e3a8a',
          900: '#0f1e3d',
        },
        // Accent — the site's orange CTA color
        accent: {
          50: '#fff7ed',
          100: '#ffedd5',
          300: '#fdba74',
          400: '#fb923c',
          500: '#f97316',
          600: '#ea580c',
          700: '#c2410c',
        },
        // Secondary cool accent — sky blue
        aqua: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
        },
        // Semantic
        success: { DEFAULT: '#10b981', soft: '#34d399' },
        warning: { DEFAULT: '#f59e0b', soft: '#fbbf24' },
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
      backgroundImage: {
        // Signature gradients (values match the marketing site's CTAs/panels)
        'grad-brand': 'linear-gradient(180deg, #fb923c 0%, #f97316 100%)', // orange CTA
        'grad-holo': 'linear-gradient(120deg, #0f1e3d 0%, #1552c9 60%, #2563eb 100%)', // navy hero
        'grad-aqua': 'linear-gradient(135deg, #1552c9 0%, #2563eb 100%)', // brand blue
        'grad-sunset': 'linear-gradient(135deg, #f59e0b 0%, #f97316 100%)', // amber-orange
        'grad-mint': 'linear-gradient(135deg, #10b981 0%, #0ea5e9 100%)', // emerald-sky
      },
      borderRadius: {
        card: '24px',
        panel: '12px',
      },
      boxShadow: {
        card: '0 18px 40px 0 rgba(15, 30, 61, 0.09)',
        'card-hover': '0 24px 52px -8px rgba(15, 30, 61, 0.16), 0 4px 16px -4px rgba(37, 99, 235, 0.12)',
        glow: '0 14px 34px 0 rgba(249, 115, 22, 0.5), inset 0 1px 0 0 rgba(255, 255, 255, 0.4)',
        'glow-pink': '0 8px 20px 0 rgba(249, 115, 22, 0.4)',
        'glow-aqua': '0 8px 24px -6px rgba(37, 99, 235, 0.45)',
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
        popIn: {
          from: { opacity: '0', transform: 'scale(0.94) translateY(10px)' },
          to: { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
        aurora: {
          '0%,100%': { transform: 'translate(0, 0) scale(1)' },
          '33%': { transform: 'translate(4%, -6%) scale(1.08)' },
          '66%': { transform: 'translate(-5%, 4%) scale(0.95)' },
        },
        shimmer: {
          from: { backgroundPosition: '200% 0' },
          to: { backgroundPosition: '-200% 0' },
        },
      },
      animation: {
        floaty: 'floaty 4s ease-in-out infinite',
        fadeUp: 'fadeUp .4s ease-out both',
        popIn: 'popIn .35s cubic-bezier(0.16, 1, 0.3, 1) both',
        'aurora-slow': 'aurora 18s ease-in-out infinite',
        'aurora-slower': 'aurora 26s ease-in-out infinite reverse',
        shimmer: 'shimmer 2.5s linear infinite',
      },
    },
  },
  plugins: [],
};
