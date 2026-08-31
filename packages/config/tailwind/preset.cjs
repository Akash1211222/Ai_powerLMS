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
/** A colour scale wired to CSS variables, one `--fca-<name>-<stop>` each. */
const c = (name, stop) => `rgb(var(--fca-${name}-${stop}))`;

const ramp = (name, stops) =>
  Object.fromEntries(stops.map((stop) => [stop, `rgb(var(--fca-${name}-${stop}) / <alpha-value>)`]));

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
        /*
         * Brand, accent and aqua are variables rather than hex, so a college
         * can be given its own palette without touching the 90-odd files that
         * use these classes. Defaults live in web globals.css and are exactly
         * the values that used to be written here.
         *
         * The channel-triplet form is what makes `bg-brand-400/15` keep
         * working: Tailwind substitutes the opacity into <alpha-value>, which
         * a plain `var(--x)` holding "#60a5fa" could not accept.
         */
        brand: ramp('brand', [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]),
        accent: ramp('accent', [50, 100, 300, 400, 500, 600, 700]),
        aqua: ramp('aqua', [50, 100, 300, 400, 500, 600, 700]),
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
        // Signature gradients. Built from the ramps above rather than repeating
        // hex, so a college's colour reaches them too — these are the largest
        // areas of colour on the page and leaving them behind is exactly what
        // made per-college branding look like a tint on somebody else's app.
        'grad-brand': `linear-gradient(180deg, ${c('accent', 400)} 0%, ${c('accent', 500)} 100%)`,
        'grad-holo': `linear-gradient(120deg, ${c('brand', 900)} 0%, ${c('brand', 700)} 60%, ${c('brand', 500)} 100%)`,
        'grad-aqua': `linear-gradient(135deg, ${c('brand', 700)} 0%, ${c('brand', 500)} 100%)`,
        'grad-sunset': `linear-gradient(135deg, ${c('accent', 300)} 0%, ${c('accent', 500)} 100%)`,
        // Deliberately left alone: mint is not the brand, it is one of the
        // hues that tell stat tiles apart. Recolouring it would flatten a
        // distinction the design uses to carry meaning.
        'grad-mint': 'linear-gradient(135deg, #10b981 0%, #0ea5e9 100%)',
      },
      borderRadius: {
        card: '24px',
        panel: '12px',
      },
      boxShadow: {
        card: 'var(--fca-shadow-card)',
        'card-hover': 'var(--fca-shadow-card-hover)',
        glow: `0 14px 34px 0 rgb(var(--fca-accent-500) / 0.5), inset 0 1px 0 0 rgba(255, 255, 255, 0.4)`,
        'glow-pink': `0 8px 20px 0 rgb(var(--fca-accent-500) / 0.4)`,
        'glow-aqua': `0 8px 24px -6px rgb(var(--fca-brand-500) / 0.45)`,
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
