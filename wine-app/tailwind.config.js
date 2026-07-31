/** @type {import('tailwindcss').Config} */

/**
 * Every colour resolves to a skin token (src/styles/skins.css) rather
 * than a literal, so the skin switcher repaints the whole app. The
 * rgb(... / <alpha-value>) form is what preserves opacity modifiers:
 * Tailwind rewrites `bg-surface/20` into a color-mix over this value.
 */
const token = name => `rgb(var(--${name}) / <alpha-value>)`

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    colors: {
      // Surfaces, dimmest to brightest
      "background": token('bg'),
      "surface": token('bg'),
      "surface-dim": token('bg'),
      "surface-container-lowest": token('surface-alt'),
      "surface-container-low": token('surface'),
      "surface-container": token('surface-2'),
      "surface-container-high": token('surface-2'),
      "surface-container-highest": token('surface-3'),
      "surface-variant": token('surface-3'),
      "surface-bright": token('surface-3'),
      "inverse-surface": token('text-primary'),

      // Text
      "on-background": token('text-primary'),
      "on-surface": token('text-primary'),
      "on-surface-variant": token('text-secondary'),
      "secondary": token('text-secondary'),
      "outline": token('text-tertiary'),
      "inverse-on-surface": token('bg'),

      // Lines
      "outline-variant": token('border'),

      // Accent (nav, active states, accent text) and the fill it sits on
      "primary": token('accent-hover'),
      "primary-container": token('accent'),
      "primary-fixed": token('accent-hover'),
      "primary-fixed-dim": token('accent'),
      "surface-tint": token('accent'),
      "on-primary": token('accent-on'),
      "on-primary-container": token('accent-on'),
      "on-primary-fixed": token('accent-on'),
      "on-primary-fixed-variant": token('accent-on'),
      "inverse-primary": token('accent-on'),

      // Readiness and the primary call to action — the same as the
      // accent in every skin but Charcoal & Verdant
      "highlight": token('highlight'),
      "on-highlight": token('highlight-on'),

      // Wine types, shared across skins
      "wine-red": token('wine-red'),
      "wine-white": token('wine-white'),
      "wine-rose": token('wine-rose'),
      "wine-sparkling": token('wine-sparkling'),
      "wine-fortified": token('wine-fortified'),

      // Status. Skin-independent: a warning must read as a warning
      // whatever the accent is.
      "warn": token('warn'),
      "danger": token('danger'),
      "error": token('error'),
      "success": token('success'),
      "warning": token('caution'),
      "red-300": token('red-300'),
      "red-400": token('red-400'),
      "red-500": token('red-500'),
      "on-error": token('bg'),
      "error-container": token('danger'),
      "on-error-container": token('text-primary'),

      "transparent": "transparent",
      "white": "#ffffff",
      "black": "#000000",
    },
    fontFamily: {
      "headline": ["Noto Serif", "serif"],
      "body": ["Inter Variable", "Inter", "sans-serif"],
      "label": ["Inter Variable", "Inter", "sans-serif"],
      "sans": ["Inter Variable", "Inter", "system-ui", "sans-serif"],
      "serif": ["Noto Serif", "serif"],
      "mono": ["monospace"],
    },
    borderRadius: {
      "none": "0",
      "DEFAULT": "0.125rem",
      "sm": "0.0625rem",
      "lg": "0.25rem",
      "xl": "0.5rem",
      "2xl": "0.875rem",
      "full": "0.75rem",
    },
  },
  plugins: [],
}
