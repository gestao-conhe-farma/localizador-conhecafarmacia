/** @type {import('tailwindcss').Config} */
export default {
  theme: {
    extend: {
    colors: {
        primary: {
            '50': 'hsl(240, 100%, 97%)',
            '100': 'hsl(240, 100%, 94%)',
            '200': 'hsl(240, 100%, 86%)',
            '300': 'hsl(240, 100%, 76%)',
            '400': 'hsl(240, 100%, 64%)',
            '500': 'hsl(240, 100%, 50%)',
            '600': 'hsl(240, 100%, 40%)',
            '700': 'hsl(240, 100%, 32%)',
            '800': 'hsl(240, 100%, 24%)',
            '900': 'hsl(240, 100%, 16%)',
            '950': 'hsl(240, 100%, 10%)',
            DEFAULT: '#0000ee'
        },
        'neutral-50': '#313131',
        'neutral-100': '#000000',
        'neutral-200': '#d9d9d9',
        foreground: '#313131'
    },
    fontFamily: {
        sans: [
            'system-ui',
            'sans-serif'
        ],
        heading: [
            'Arial',
            'sans-serif'
        ],
        body: [
            'monospace',
            'sans-serif'
        ]
    },
    fontSize: {
        '12': [
            '12px',
            {
                lineHeight: '18px'
            }
        ],
        '16': [
            '16px',
            {
                lineHeight: '18.4px'
            }
        ],
        '24': [
            '24px',
            {
                lineHeight: '30px'
            }
        ],
        '40': [
            '40px',
            {
                lineHeight: '50px'
            }
        ],
        '13.3333': [
            '13.3333px',
            {
                lineHeight: 'normal'
            }
        ]
    },
    spacing: {
        '4': '8px',
        '64': '128px',
        '80': '160px'
    },
    borderRadius: {
        full: '50px'
    },
    container: {
        center: true,
        padding: '32px'
    },
    maxWidth: {
        container: '960px'
    }
},
  },
};
