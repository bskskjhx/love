/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  future: {
    hoverOnlyWhenSupported: true,
  },
  theme: {
    extend: {
      fontFamily: {
        // Both Inter names are listed on purpose: Fontsource's variable packages
        // declare 'Inter Variable' while the static package declares 'Inter', and
        // a misspelt family name fails silently by falling back to the system
        // font rather than erroring.
        sans: [
          'Inter Variable',
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'PingFang SC',
          'Hiragino Sans GB',
          'Microsoft YaHei',
          'Noto Sans CJK SC',
          'sans-serif',
        ],
      },
      fontSize: {
        'ios-caption2': ['11px', { lineHeight: '13px' }],
        'ios-caption1': ['12px', { lineHeight: '16px' }],
        'ios-footnote': ['13px', { lineHeight: '18px' }],
        'ios-subhead': ['15px', { lineHeight: '20px' }],
        'ios-callout': ['16px', { lineHeight: '21px' }],
        'ios-body': ['17px', { lineHeight: '22px' }],
        'ios-headline': ['17px', { lineHeight: '22px', fontWeight: '600' }],
        'ios-title3': ['20px', { lineHeight: '25px' }],
        'ios-title2': ['22px', { lineHeight: '28px' }],
        'ios-title1': ['28px', { lineHeight: '34px' }],
        'ios-large-title': ['34px', { lineHeight: '41px', fontWeight: '700' }],
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        'ios-field': '0.625rem',
        'ios-segment': '0.5625rem',
        'ios-card': '0.75rem',
        'ios-alert': '0.875rem',
        'ios-sheet': '1rem',
        'ios-bubble': '1.125rem',
        'ios-tile': '0.375rem',
      },
      boxShadow: {
        'ios-card': '0 1px 2px rgba(0, 0, 0, 0.04), 0 4px 12px rgba(0, 0, 0, 0.04)',
        'ios-segment': '0 3px 8px rgba(0, 0, 0, 0.12), 0 1px 1px rgba(0, 0, 0, 0.04)',
        'ios-sheet': '0 -1px 0 var(--separator), 0 -8px 32px rgba(0, 0, 0, 0.12)',
      },
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        grouped: 'hsl(var(--grouped))',
        separator: 'var(--separator)',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        bubble: {
          out: 'hsl(var(--bubble-out))',
          'out-foreground': 'hsl(var(--bubble-out-foreground))',
          in: 'hsl(var(--bubble-in))',
          'in-foreground': 'hsl(var(--bubble-in-foreground))',
        },
        system: {
          yellow: 'hsl(var(--system-yellow))',
          green: 'hsl(var(--system-green))',
          orange: 'hsl(var(--system-orange))',
        },
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
