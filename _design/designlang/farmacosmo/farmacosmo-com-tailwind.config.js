/** @type {import('tailwindcss').Config} */
export default {
  theme: {
    extend: {
    colors: {
        primary: {
            '50': 'hsl(49, 100%, 97%)',
            '100': 'hsl(49, 100%, 94%)',
            '200': 'hsl(49, 100%, 86%)',
            '300': 'hsl(49, 100%, 76%)',
            '400': 'hsl(49, 100%, 64%)',
            '500': 'hsl(49, 100%, 50%)',
            '600': 'hsl(49, 100%, 40%)',
            '700': 'hsl(49, 100%, 32%)',
            '800': 'hsl(49, 100%, 24%)',
            '900': 'hsl(49, 100%, 16%)',
            '950': 'hsl(49, 100%, 10%)',
            DEFAULT: '#fece00'
        },
        secondary: {
            '50': 'hsl(213, 77%, 97%)',
            '100': 'hsl(213, 77%, 94%)',
            '200': 'hsl(213, 77%, 86%)',
            '300': 'hsl(213, 77%, 76%)',
            '400': 'hsl(213, 77%, 64%)',
            '500': 'hsl(213, 77%, 50%)',
            '600': 'hsl(213, 77%, 40%)',
            '700': 'hsl(213, 77%, 32%)',
            '800': 'hsl(213, 77%, 24%)',
            '900': 'hsl(213, 77%, 16%)',
            '950': 'hsl(213, 77%, 10%)',
            DEFAULT: '#0d3464'
        },
        accent: {
            '50': 'hsl(189, 70%, 97%)',
            '100': 'hsl(189, 70%, 94%)',
            '200': 'hsl(189, 70%, 86%)',
            '300': 'hsl(189, 70%, 76%)',
            '400': 'hsl(189, 70%, 64%)',
            '500': 'hsl(189, 70%, 50%)',
            '600': 'hsl(189, 70%, 40%)',
            '700': 'hsl(189, 70%, 32%)',
            '800': 'hsl(189, 70%, 24%)',
            '900': 'hsl(189, 70%, 16%)',
            '950': 'hsl(189, 70%, 10%)',
            DEFAULT: '#0e4650'
        },
        'neutral-50': '#000000',
        'neutral-100': '#373a3c',
        'neutral-200': '#ffffff',
        'neutral-300': '#7a7a7a',
        'neutral-400': '#92989f',
        'neutral-500': '#f4f4f4',
        'neutral-600': '#c3c3c3',
        'neutral-700': '#eaf9ff',
        'neutral-800': '#d3d3d3',
        'neutral-900': '#e8e9ea',
        background: '#ffffff',
        foreground: '#000000'
    },
    fontFamily: {
        sans: [
            'proxima-nova-regular',
            'sans-serif'
        ],
        body: [
            'proxima-nova-extrabold',
            'sans-serif'
        ],
        font2: [
            'montserrat-semibold',
            'sans-serif'
        ],
        font3: [
            'proxima-nova-medium',
            'sans-serif'
        ],
        font4: [
            'sans-serif',
            'sans-serif'
        ],
        font6: [
            'montserrat-bold',
            'sans-serif'
        ],
        font7: [
            'proxima-nova-bold',
            'sans-serif'
        ],
        heading: [
            'proxima-nova-semibold',
            'sans-serif'
        ]
    },
    fontSize: {
        '11': [
            '11px',
            {
                lineHeight: '16.5px'
            }
        ],
        '12': [
            '12px',
            {
                lineHeight: '18px'
            }
        ],
        '13': [
            '13px',
            {
                lineHeight: '19.5px'
            }
        ],
        '14': [
            '14px',
            {
                lineHeight: '21px'
            }
        ],
        '15': [
            '15px',
            {
                lineHeight: '22.5px'
            }
        ],
        '16': [
            '16px',
            {
                lineHeight: '18.4px'
            }
        ],
        '18': [
            '18px',
            {
                lineHeight: '27px'
            }
        ],
        '19': [
            '19px',
            {
                lineHeight: '28.5px'
            }
        ],
        '20': [
            '20px',
            {
                lineHeight: '30px'
            }
        ],
        '22': [
            '22px',
            {
                lineHeight: '22px'
            }
        ],
        '29': [
            '29px',
            {
                lineHeight: '43.5px'
            }
        ],
        '18.72': [
            '18.72px',
            {
                lineHeight: '28.08px'
            }
        ],
        '15.21': [
            '15.21px',
            {
                lineHeight: '22.815px'
            }
        ],
        '13.8': [
            '13.8px',
            {
                lineHeight: '20.7px'
            }
        ],
        '11.25': [
            '11.25px',
            {
                lineHeight: '0px'
            }
        ]
    },
    spacing: {
        '0': '0px',
        '1': '20px',
        '2': '24px',
        '3': '30px',
        '4': '32px',
        '5': '35px',
        '6': '37px',
        '7': '40px',
        '8': '43px',
        '9': '58px',
        '10': '95px',
        '11': '135px',
        '12': '155px',
        '13': '361px'
    },
    borderRadius: {
        sm: '3px',
        md: '8px',
        lg: '12px',
        xl: '20px',
        full: '50px'
    },
    boxShadow: {
        lg: 'rgba(0, 0, 0, 0.12) 0px 4px 16px 0px'
    },
    screens: {
        md: '821px',
        lg: '1025px',
        '1181px': '1181px',
        xl: '1300px',
        '1920px': '1920px'
    },
    transitionDuration: {
        '100': '0.1s',
        '200': '0.2s',
        '220': '0.22s',
        '300': '0.3s',
        '450': '0.45s',
        '500': '0.5s',
        '600': '0.6s'
    },
    transitionTimingFunction: {
        default: 'ease',
        custom: 'cubic-bezier(0.4, 0, 0.2, 1)'
    },
    container: {
        center: true,
        padding: '0px'
    },
    maxWidth: {
        container: '100%'
    }
},
  },
};
