import type { Config } from 'tailwindcss';

/** Every theme colour is a CSS variable (RGB triplet) defined for light and dark in globals.css. */
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        page: v('page'),          // page background
        surface: v('surface'),    // cards, inputs, tables
        sunken: v('sunken'),      // subtle fills: table headers, disabled fields, image placeholders
        sunken2: v('sunken2'),
        track: v('track'),        // progress-bar track
        soft: v('soft'),          // pills, secondary buttons
        'soft-hover': v('soft-hover'),
        tint: v('tint'),          // notices, selected cards
        ink: v('ink'),            // body text
        muted: v('muted'),
        faint: v('faint'),        // placeholders, image captions
        line: v('line'),          // dividers & card borders
        field: v('field'),        // input borders
        primary: v('primary'),    // main buttons
        'primary-hover': v('primary-hover'),
        onprimary: v('onprimary'),
        onaccent: '#1a1a1a',      // text on orange surfaces (stays dark in both themes)
        chrome: v('chrome'),      // header / console bar (always dark)
        hero: v('hero'),          // hero card
        footer: v('footer'),
        accent: { DEFAULT: v('accent'), text: v('accent-text'), light: v('accent-light') },
        danger: { DEFAULT: v('danger'), text: v('danger-text') },
        'notice-ink': v('notice-ink'),
        'err-bg': v('err-bg'),
        'err-ink': v('err-ink'),
      },
      fontFamily: {
        serif: ['Georgia', 'Cambria', 'Times New Roman', 'serif'],
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Arial', 'sans-serif'],
      },
      borderRadius: { card: '18px' },
      boxShadow: { card: '0 3px 12px rgb(0 0 0 / .05)' },
    },
  },
  plugins: [],
} satisfies Config;
