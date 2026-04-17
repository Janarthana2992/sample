/** @type {import('tailwindcss').Config} */
export default {
    content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                primary: {
                    50: '#f0f4ff',
                    100: '#dbe4ff',
                    200: '#bac8ff',
                    300: '#91a7ff',
                    400: '#748ffc',
                    500: '#5c7cfa',
                    600: '#4c6ef5',
                    700: '#4263eb',
                    800: '#3b5bdb',
                    900: '#364fc7',
                },
                surface: {
                    50: '#fafafa',
                    100: '#f4f4f5',
                    200: '#e4e4e7',
                    300: '#d4d4d8',
                    800: '#18181b',
                    900: '#09090b',
                    950: '#030305',
                },
            },
            fontFamily: {
                sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
                display: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
            },
            borderRadius: {
                '2xl': '1rem',
                '3xl': '1.5rem',
            },
            boxShadow: {
                'glass': '0 8px 32px rgba(0, 0, 0, 0.08)',
                'glass-lg': '0 16px 48px rgba(0, 0, 0, 0.12)',
                'inner-light': 'inset 0 1px 0 rgba(255, 255, 255, 0.1)',
                'glow': '0 0 20px rgba(76, 110, 245, 0.15)',
                'card': '0 1px 3px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.06)',
                'card-hover': '0 10px 40px rgba(0, 0, 0, 0.08)',
                'elevated': '0 4px 24px rgba(0, 0, 0, 0.06)',
            },
            backdropBlur: {
                xs: '2px',
            },
            animation: {
                'fade-in': 'fadeIn 0.5s ease-out',
                'slide-up': 'slideUp 0.4s ease-out',
                'slide-down': 'slideDown 0.3s ease-out',
                'scale-in': 'scaleIn 0.2s ease-out',
                'shimmer': 'shimmer 2s linear infinite',
            },
            keyframes: {
                fadeIn: {
                    '0%': { opacity: '0' },
                    '100%': { opacity: '1' },
                },
                slideUp: {
                    '0%': { opacity: '0', transform: 'translateY(10px)' },
                    '100%': { opacity: '1', transform: 'translateY(0)' },
                },
                slideDown: {
                    '0%': { opacity: '0', transform: 'translateY(-10px)' },
                    '100%': { opacity: '1', transform: 'translateY(0)' },
                },
                scaleIn: {
                    '0%': { opacity: '0', transform: 'scale(0.95)' },
                    '100%': { opacity: '1', transform: 'scale(1)' },
                },
                shimmer: {
                    '0%': { backgroundPosition: '-200% 0' },
                    '100%': { backgroundPosition: '200% 0' },
                },
            },
        },
    },
    plugins: [],
}
