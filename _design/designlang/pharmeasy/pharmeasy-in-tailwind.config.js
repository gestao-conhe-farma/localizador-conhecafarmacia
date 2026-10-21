/** @type {import('tailwindcss').Config} */
export default {
  theme: {
    extend: {
    colors: {
        primary: {
            '50': 'hsl(45, 100%, 97%)',
            '100': 'hsl(45, 100%, 94%)',
            '200': 'hsl(45, 100%, 86%)',
            '300': 'hsl(45, 100%, 76%)',
            '400': 'hsl(45, 100%, 64%)',
            '500': 'hsl(45, 100%, 50%)',
            '600': 'hsl(45, 100%, 40%)',
            '700': 'hsl(45, 100%, 32%)',
            '800': 'hsl(45, 100%, 24%)',
            '900': 'hsl(45, 100%, 16%)',
            '950': 'hsl(45, 100%, 10%)',
            DEFAULT: '#fff8e3'
        },
        secondary: {
            '50': 'hsl(177, 78%, 97%)',
            '100': 'hsl(177, 78%, 94%)',
            '200': 'hsl(177, 78%, 86%)',
            '300': 'hsl(177, 78%, 76%)',
            '400': 'hsl(177, 78%, 64%)',
            '500': 'hsl(177, 78%, 50%)',
            '600': 'hsl(177, 78%, 40%)',
            '700': 'hsl(177, 78%, 32%)',
            '800': 'hsl(177, 78%, 24%)',
            '900': 'hsl(177, 78%, 16%)',
            '950': 'hsl(177, 78%, 10%)',
            DEFAULT: '#10847e'
        },
        accent: {
            '50': 'hsl(128, 63%, 97%)',
            '100': 'hsl(128, 63%, 94%)',
            '200': 'hsl(128, 63%, 86%)',
            '300': 'hsl(128, 63%, 76%)',
            '400': 'hsl(128, 63%, 64%)',
            '500': 'hsl(128, 63%, 50%)',
            '600': 'hsl(128, 63%, 40%)',
            '700': 'hsl(128, 63%, 32%)',
            '800': 'hsl(128, 63%, 24%)',
            '900': 'hsl(128, 63%, 16%)',
            '950': 'hsl(128, 63%, 10%)',
            DEFAULT: '#229532'
        },
        'neutral-50': '#30363c',
        'neutral-100': '#000000',
        'neutral-200': '#8897a2',
        'neutral-300': '#ffffff',
        'neutral-400': '#4f585e',
        'neutral-500': '#f1f1f2',
        'neutral-600': '#6e787e',
        'neutral-700': '#808080',
        background: '#ffffff',
        foreground: '#000000'
    },
    fontFamily: {
        sans: [
            'Inter',
            'sans-serif'
        ],
        body: [
            'Times New Roman',
            'sans-serif'
        ]
    },
    fontSize: {
        '0': [
            '0px',
            {
                lineHeight: '24px'
            }
        ],
        '11': [
            '11px',
            {
                lineHeight: '13.75px',
                letterSpacing: '0.4px'
            }
        ],
        '12': [
            '12px',
            {
                lineHeight: '16px'
            }
        ],
        '13': [
            '13px',
            {
                lineHeight: '16.25px'
            }
        ],
        '14': [
            '14px',
            {
                lineHeight: '20px'
            }
        ],
        '15': [
            '15px',
            {
                lineHeight: '20px'
            }
        ],
        '16': [
            '16px',
            {
                lineHeight: 'normal'
            }
        ],
        '18': [
            '18px',
            {
                lineHeight: '22.5px'
            }
        ],
        '22': [
            '22px',
            {
                lineHeight: '27.5px'
            }
        ],
        '26': [
            '26px',
            {
                lineHeight: '32px'
            }
        ],
        '40': [
            '40px',
            {
                lineHeight: '40px'
            }
        ]
    },
    spacing: {
        '2': '4px',
        '16': '32px',
        '20': '40px',
        '24': '48px',
        '28': '56px',
        '40': '80px',
        '157px': '157px',
        '491px': '491px'
    },
    borderRadius: {
        xs: '2px',
        md: '8px',
        lg: '16px',
        xl: '24px',
        full: '100px'
    },
    boxShadow: {
        xs: 'rgba(0, 0, 0, 0.12) 0px -1px 0px 0px inset',
        md: 'rgba(33, 33, 33, 0.06) 0px 6px 10px 0px, rgba(33, 33, 33, 0.04) 0px 1px 18px 0px, rgba(33, 33, 33, 0.08) 0px 3px 5px 0px',
        lg: 'rgba(33, 33, 33, 0.06) 0px 8px 10px 0px, rgba(33, 33, 33, 0.04) 0px 3px 14px 0px, rgba(33, 33, 33, 0.08) 0px 5px 5px 0px'
    },
    screens: {
        sm: '541px',
        md: '768px',
        lg: '1024px',
        xl: '1280px'
    },
    transitionDuration: {
        '100': '0.1s',
        '150': '0.15s',
        '200': '0.2s',
        '300': '0.3s',
        '500': '0.5s'
    },
    transitionTimingFunction: {
        default: 'ease'
    },
    container: {
        center: true,
        padding: '0px'
    },
    maxWidth: {
        container: '860px'
    }
},
  },
};
