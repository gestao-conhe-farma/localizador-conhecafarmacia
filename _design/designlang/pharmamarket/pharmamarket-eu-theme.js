// React Theme — extracted from https://www.pharmamarket.eu
// Compatible with: Chakra UI, Stitches, Vanilla Extract, or any CSS-in-JS

/**
 * TypeScript type definition for this theme:
 *
 * interface Theme {
 *   colors: {
    primary: string;
    foreground: string;
    neutral50: string;
    neutral100: string;
    neutral200: string;
 *   };
 *   fonts: {
    body: string;
    mono: string;
 *   };
 *   fontSizes: {
    '12': string;
    '16': string;
    '24': string;
    '40': string;
    '13.3333': string;
 *   };
 *   space: {
    '8': string;
    '128': string;
    '160': string;
 *   };
 *   radii: {
    full: string;
 *   };
 *   shadows: {

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
    "primary": "#0000ee",
    "foreground": "#313131",
    "neutral50": "#313131",
    "neutral100": "#000000",
    "neutral200": "#d9d9d9"
  },
  "fonts": {
    "body": "'Arial', sans-serif",
    "mono": "'monospace', monospace"
  },
  "fontSizes": {
    "12": "12px",
    "16": "16px",
    "24": "24px",
    "40": "40px",
    "13.3333": "13.3333px"
  },
  "space": {
    "8": "8px",
    "128": "128px",
    "160": "160px"
  },
  "radii": {
    "full": "50px"
  },
  "shadows": {},
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
      "main": "#0000ee",
      "light": "hsl(240, 100%, 62%)",
      "dark": "hsl(240, 100%, 32%)"
    },
    "background": {},
    "text": {
      "primary": "#313131",
      "secondary": "#000000"
    }
  },
  "typography": {
    "fontFamily": "'monospace', sans-serif",
    "h1": {
      "fontSize": "40px",
      "fontWeight": "600",
      "lineHeight": "50px"
    },
    "h2": {
      "fontSize": "24px",
      "fontWeight": "600",
      "lineHeight": "30px"
    },
    "body1": {
      "fontSize": "16px",
      "fontWeight": "400",
      "lineHeight": "18.4px"
    },
    "body2": {
      "fontSize": "12px",
      "fontWeight": "400",
      "lineHeight": "18px"
    }
  },
  "shape": {
    "borderRadius": 50
  },
  "shadows": []
};

export default theme;
