import type { Config } from 'tailwindcss'

const config: Config = {
    darkMode: 'class',
    content: [
        './pages/**/*.{js,ts,jsx,tsx,mdx}',
        './components/**/*.{js,ts,jsx,tsx,mdx}',
        './app/**/*.{js,ts,jsx,tsx,mdx}',
    ],
    theme: {
        extend: {
            fontFamily: {
                sans: ['var(--font-inter)', 'Inter', 'Inter Fallback', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
            },
            fontSize: {
                'display': ['3rem', { lineHeight: '1.2', fontWeight: '700', letterSpacing: '-0.02em' }],
                'h1': ['2.25rem', { lineHeight: '1.3', fontWeight: '700', letterSpacing: '-0.01em' }],
                'h2': ['1.875rem', { lineHeight: '1.35', fontWeight: '600', letterSpacing: '-0.01em' }],
                'h3': ['1.5rem', { lineHeight: '1.4', fontWeight: '600' }],
                'h4': ['1.25rem', { lineHeight: '1.5', fontWeight: '600' }],
                'body': ['1rem', { lineHeight: '1.6', fontWeight: '400' }],
                'small': ['0.875rem', { lineHeight: '1.5', fontWeight: '400' }],
                'xs': ['0.75rem', { lineHeight: '1.5', fontWeight: '400' }],
            },
            colors: {
                'kick-dark': '#0e0e10',
                'kick-surface': '#18181b',
                'kick-surface-hover': '#1f1f23',
                'kick-border': '#26262c',
                'kick-purple': '#7635dc',
                'kick-purple-dark': '#5c2aa8',
                'kick-green': '#53FC18',
                'kick-green-dark': '#3fc012',
                'kick-text': '#efeff1',
                'kick-text-secondary': '#adadb8',
                'kick-text-muted': '#737373',
                'surface-lower': '#0e0e10',
                'surface-tint': '#18181b',
                'shade-lower': '#18181b',
                'neutral': '#FFFFFF',
                'surface-secondary': '#737373',
                'secondary-lighter': '#24272c',
            },
        },
    },
    plugins: [],
}
export default config
