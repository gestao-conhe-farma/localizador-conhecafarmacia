// React Theme — extracted from https://www.farmacosmo.com
// Compatible with: Chakra UI, Stitches, Vanilla Extract, or any CSS-in-JS

/**
 * TypeScript type definition for this theme:
 *
 * interface Theme {
 *   colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    foreground: string;
    neutral50: string;
    neutral100: string;
    neutral200: string;
    neutral300: string;
    neutral400: string;
    neutral500: string;
    neutral600: string;
    neutral700: string;
    neutral800: string;
    neutral900: string;
 *   };
 *   fonts: {
    body: string;
    heading: string;
 *   };
 *   fontSizes: {
    '13': string;
    '14': string;
    '15': string;
    '16': string;
    '18': string;
    '19': string;
    '20': string;
    '22': string;
    '29': string;
    '18.72': string;
    '15.21': string;
    '13.8': string;
 *   };
 *   space: {
    '0': string;
    '20': string;
    '24': string;
    '30': string;
    '32': string;
    '35': string;
    '37': string;
    '40': string;
    '43': string;
    '58': string;
    '95': string;
    '135': string;
    '155': string;
    '361': string;
 *   };
 *   radii: {
    sm: string;
    md: string;
    lg: string;
    xl: string;
    full: string;
 *   };
 *   shadows: {
    lg: string;
 *   };
 *   states: {
 *     hover: { opacity: number };
 *     focus: { opacity: number };
 *     active: { opacity: number };
 *     disabled: { opacity: number };
 *   };
 * }
 */

export const theme = {
  "colors": {
    "primary": "#fece00",
    "secondary": "#0d3464",
    "accent": "#0e4650",
    "background": "#ffffff",
    "foreground": "#000000",
    "neutral50": "#000000",
    "neutral100": "#373a3c",
    "neutral200": "#ffffff",
    "neutral300": "#7a7a7a",
    "neutral400": "#92989f",
    "neutral500": "#f4f4f4",
    "neutral600": "#c3c3c3",
    "neutral700": "#eaf9ff",
    "neutral800": "#d3d3d3",
    "neutral900": "#e8e9ea"
  },
  "fonts": {
    "body": "'proxima-nova-extrabold', sans-serif",
    "heading": "'proxima-nova-semibold', sans-serif"
  },
  "fontSizes": {
    "13": "13px",
    "14": "14px",
    "15": "15px",
    "16": "16px",
    "18": "18px",
    "19": "19px",
    "20": "20px",
    "22": "22px",
    "29": "29px",
    "18.72": "18.72px",
    "15.21": "15.21px",
    "13.8": "13.8px"
  },
  "space": {
    "0": "0px",
    "20": "20px",
    "24": "24px",
    "30": "30px",
    "32": "32px",
    "35": "35px",
    "37": "37px",
    "40": "40px",
    "43": "43px",
    "58": "58px",
    "95": "95px",
    "135": "135px",
    "155": "155px",
    "361": "361px"
  },
  "radii": {
    "sm": "3px",
    "md": "8px",
    "lg": "12px",
    "xl": "20px",
    "full": "50px"
  },
  "shadows": {
    "lg": "rgba(0, 0, 0, 0.12) 0px 4px 16px 0px"
  },
  "states": {
    "hover": {
      "opacity": 0.08
    },
    "focus": {
      "opacity": 0.12
    },
    "active": {
      "opacity": 0.16
    },
    "disabled": {
      "opacity": 0.38
    }
  }
};

// MUI v5 theme
export const muiTheme = {
  "palette": {
    "primary": {
      "main": "#fece00",
      "light": "hsl(49, 100%, 65%)",
      "dark": "hsl(49, 100%, 35%)"
    },
    "secondary": {
      "main": "#0d3464",
      "light": "hsl(213, 77%, 37%)",
      "dark": "hsl(213, 77%, 10%)"
    },
    "background": {
      "default": "#ffffff",
      "paper": "#0d3464"
    },
    "text": {
      "primary": "#000000",
      "secondary": "#ffffff"
    }
  },
  "typography": {
    "fontFamily": "'Font Awesome 6 Free', sans-serif",
    "h2": {
      "fontSize": "29px",
      "fontWeight": "400",
      "lineHeight": "43.5px",
      "fontFamily": "'proxima-nova-semibold', sans-serif"
    },
    "h3": {
      "fontSize": "20px",
      "fontWeight": "400",
      "lineHeight": "30px",
      "fontFamily": "'proxima-nova-semibold', sans-serif"
    },
    "body1": {
      "fontSize": "18px",
      "fontWeight": "400",
      "lineHeight": "27px"
    }
  },
  "shape": {
    "borderRadius": 8
  },
  "shadows": [
    "rgba(0, 0, 0, 0.12) 0px 4px 16px 0px"
  ]
};

export default theme;
