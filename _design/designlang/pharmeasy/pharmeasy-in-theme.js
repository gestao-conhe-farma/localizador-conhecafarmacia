// React Theme — extracted from https://pharmeasy.in
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
 *   };
 *   fonts: {
    body: string;
 *   };
 *   fontSizes: {
    '0': string;
    '11': string;
    '12': string;
    '13': string;
    '14': string;
    '15': string;
    '16': string;
    '18': string;
    '22': string;
    '26': string;
    '40': string;
 *   };
 *   space: {
    '4': string;
    '32': string;
    '40': string;
    '48': string;
    '56': string;
    '80': string;
    '157': string;
    '491': string;
 *   };
 *   radii: {
    xs: string;
    md: string;
    lg: string;
    xl: string;
    full: string;
 *   };
 *   shadows: {
    xs: string;
    md: string;
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
    "primary": "#fff8e3",
    "secondary": "#10847e",
    "accent": "#229532",
    "background": "#ffffff",
    "foreground": "#000000",
    "neutral50": "#30363c",
    "neutral100": "#000000",
    "neutral200": "#8897a2",
    "neutral300": "#ffffff",
    "neutral400": "#4f585e",
    "neutral500": "#f1f1f2",
    "neutral600": "#6e787e",
    "neutral700": "#808080"
  },
  "fonts": {
    "body": "'Times New Roman', sans-serif"
  },
  "fontSizes": {
    "0": "0px",
    "11": "11px",
    "12": "12px",
    "13": "13px",
    "14": "14px",
    "15": "15px",
    "16": "16px",
    "18": "18px",
    "22": "22px",
    "26": "26px",
    "40": "40px"
  },
  "space": {
    "4": "4px",
    "32": "32px",
    "40": "40px",
    "48": "48px",
    "56": "56px",
    "80": "80px",
    "157": "157px",
    "491": "491px"
  },
  "radii": {
    "xs": "2px",
    "md": "8px",
    "lg": "16px",
    "xl": "24px",
    "full": "100px"
  },
  "shadows": {
    "xs": "rgba(0, 0, 0, 0.12) 0px -1px 0px 0px inset",
    "md": "rgba(33, 33, 33, 0.06) 0px 6px 10px 0px, rgba(33, 33, 33, 0.04) 0px 1px 18px 0px, rgba(33, 33, 33, 0.08) 0px 3px 5px 0px",
    "lg": "rgba(33, 33, 33, 0.06) 0px 8px 10px 0px, rgba(33, 33, 33, 0.04) 0px 3px 14px 0px, rgba(33, 33, 33, 0.08) 0px 5px 5px 0px"
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
      "main": "#fff8e3",
      "light": "hsl(45, 100%, 95%)",
      "dark": "hsl(45, 100%, 80%)"
    },
    "secondary": {
      "main": "#10847e",
      "light": "hsl(177, 78%, 44%)",
      "dark": "hsl(177, 78%, 14%)"
    },
    "background": {
      "default": "#ffffff",
      "paper": "#ebf2ff"
    },
    "text": {
      "primary": "#000000",
      "secondary": "#30363c"
    }
  },
  "typography": {
    "fontFamily": "'Times New Roman', sans-serif",
    "h1": {
      "fontSize": "40px",
      "fontWeight": "600",
      "lineHeight": "40px"
    },
    "h2": {
      "fontSize": "26px",
      "fontWeight": "700",
      "lineHeight": "32px"
    },
    "h3": {
      "fontSize": "22px",
      "fontWeight": "700",
      "lineHeight": "27.5px"
    },
    "body1": {
      "fontSize": "16px",
      "fontWeight": "400",
      "lineHeight": "normal"
    },
    "body2": {
      "fontSize": "15px",
      "fontWeight": "500",
      "lineHeight": "20px"
    }
  },
  "shape": {
    "borderRadius": 8
  },
  "shadows": [
    "rgba(0, 0, 0, 0.12) 0px -1px 0px 0px inset",
    "rgba(0, 0, 0, 0.06) 0px 4px 8px 0px",
    "rgba(0, 0, 0, 0.2) 0px 2px 10px 0px",
    "rgba(33, 33, 33, 0.06) 0px 6px 10px 0px, rgba(33, 33, 33, 0.04) 0px 1px 18px 0px, rgba(33, 33, 33, 0.08) 0px 3px 5px 0px",
    "rgba(33, 33, 33, 0.06) 0px 8px 10px 0px, rgba(33, 33, 33, 0.04) 0px 3px 14px 0px, rgba(33, 33, 33, 0.08) 0px 5px 5px 0px"
  ]
};

export default theme;
