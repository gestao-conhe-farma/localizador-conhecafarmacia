# Design Language: PharmEasy – Online Pharmacy & Medical Store with Healthcare Services in India | 50 Lakhs+ Customers

> Extracted from `https://pharmeasy.in` on October 21, 2026
> 3728 elements analyzed

This document describes the complete design language of the website. It is structured for AI/LLM consumption — use it to faithfully recreate the visual design in any framework.

## Color Palette

### Primary Colors

| Role | Hex | RGB | HSL | Usage Count |
|------|-----|-----|-----|-------------|
| Primary | `#fff8e3` | rgb(255, 248, 227) | hsl(45, 100%, 95%) | 2 |
| Secondary | `#10847e` | rgb(16, 132, 126) | hsl(177, 78%, 29%) | 14 |
| Accent | `#229532` | rgb(34, 149, 50) | hsl(128, 63%, 36%) | 2 |

### Neutral Colors

| Hex | HSL | Usage Count |
|-----|-----|-------------|
| `#30363c` | hsl(210, 11%, 21%) | 6045 |
| `#000000` | hsl(0, 0%, 0%) | 610 |
| `#8897a2` | hsl(205, 12%, 58%) | 207 |
| `#ffffff` | hsl(0, 0%, 100%) | 148 |
| `#4f585e` | hsl(204, 9%, 34%) | 34 |
| `#f1f1f2` | hsl(240, 4%, 95%) | 26 |
| `#6e787e` | hsl(203, 7%, 46%) | 10 |
| `#808080` | hsl(0, 0%, 50%) | 2 |

### Background Colors

Used on large-area elements: `#ffffff`, `#ebf2ff`, `#8678de`, `#f1fafe`, `#fff8e3`, `#f5f8fc`, `#def7f8`, `#f2fff8`, `#eef4ff`

### Text Colors

Text color palette: `#000000`, `#30363c`, `#4f585e`, `#10847e`, `#8897a2`, `#ffffff`, `#f47779`, `#3661b0`, `#6e787e`, `#cfc9f2`

### Gradients

```css
background-image: linear-gradient(90deg, rgb(235, 242, 255) 10%, rgba(0, 0, 0, 0) 85%);
```

```css
background-image: radial-gradient(380px 380px at 105% -50%, rgba(227, 128, 183, 0.28) 1%, rgba(188, 104, 150, 0.49) 45%, rgba(0, 0, 0, 0)), radial-gradient(380px 380px at -5% 140%, rgba(227, 128, 183, 0.28) 1%, rgba(188, 104, 150, 0.49) 45%, rgba(0, 0, 0, 0));
```

```css
background-image: linear-gradient(90deg, rgb(245, 179, 38) -1.35%, rgba(0, 0, 0, 0) 97.57%);
```

```css
background-image: linear-gradient(rgb(59, 122, 239), rgb(54, 97, 176));
```

### Full Color Inventory

| Hex | Contexts | Count |
|-----|----------|-------|
| `#30363c` | text, border | 6045 |
| `#000000` | text, border | 610 |
| `#8897a2` | background, text, border | 207 |
| `#ffffff` | background, border, text | 148 |
| `#f47779` | background, text, border | 107 |
| `#dce4f1` | background, border, text | 74 |
| `#4f585e` | text, border | 34 |
| `#f1f1f2` | background | 26 |
| `#10847e` | text, border, background | 14 |
| `#3661b0` | text, border | 10 |
| `#6e787e` | text, border | 10 |
| `#b5cdf7` | border, background | 5 |
| `#cef8ff` | border | 4 |
| `#cfc9f2` | text, border | 2 |
| `#808080` | text, border | 2 |
| `#fff8e3` | background | 2 |
| `#229532` | background | 2 |
| `#bfeddd` | border | 1 |
| `#8678de` | background | 1 |
| `#f5b326` | background | 1 |
| `#ff9341` | background | 1 |
| `#def7f8` | background | 1 |
| `#3b7aef` | background | 1 |

## Typography

### Font Families

- **Inter** — used for all (3630 elements)
- **Times New Roman** — used for body (98 elements)

### Type Scale

| Size (px) | Size (rem) | Weight | Line Height | Letter Spacing | Used On |
|-----------|------------|--------|-------------|----------------|---------|
| 40px | 2.5rem | 600 | 40px | normal | h2 |
| 26px | 1.625rem | 700 | 32px | normal | h2 |
| 22px | 1.375rem | 700 | 27.5px | normal | span, img, p |
| 18px | 1.125rem | 500 | 22.5px | normal | svg, path, p |
| 16px | 1rem | 400 | normal | normal | html, head, meta, link |
| 15px | 0.9375rem | 500 | 20px | normal | p |
| 14px | 0.875rem | 600 | 20px | normal | span, li, a, svg |
| 13px | 0.8125rem | 400 | 16.25px | normal | div, span |
| 12px | 0.75rem | 400 | 16px | normal | span, a, p, div |
| 11px | 0.6875rem | 700 | 13.75px | 0.4px | h4, span |
| 0px | 0rem | 600 | 24px | normal | img |

### Heading Scale

```css
h2 { font-size: 40px; font-weight: 600; line-height: 40px; }
h2 { font-size: 26px; font-weight: 700; line-height: 32px; }
h1 { font-size: 16px; font-weight: 400; line-height: normal; }
h4 { font-size: 14px; font-weight: 600; line-height: 20px; }
h4 { font-size: 11px; font-weight: 700; line-height: 13.75px; }
```

### Body Text

```css
body { font-size: 14px; font-weight: 600; line-height: 20px; }
```

### Font Weights in Use

`400` (1898x), `600` (1114x), `500` (450x), `700` (266x)

## Spacing

**Base unit:** 2px

| Token | Value | Rem |
|-------|-------|-----|
| spacing-4 | 4px | 0.25rem |
| spacing-32 | 32px | 2rem |
| spacing-40 | 40px | 2.5rem |
| spacing-48 | 48px | 3rem |
| spacing-56 | 56px | 3.5rem |
| spacing-80 | 80px | 5rem |
| spacing-157 | 157px | 9.8125rem |
| spacing-491 | 491px | 30.6875rem |

## Border Radii

| Label | Value | Count |
|-------|-------|-------|
| xs | 2px | 4 |
| md | 8px | 160 |
| lg | 12px | 6 |
| lg | 16px | 36 |
| xl | 24px | 8 |
| full | 50px | 2 |
| full | 100px | 5 |

## Box Shadows

**xs (inset)** — blur: 0px
```css
box-shadow: rgba(0, 0, 0, 0.12) 0px -1px 0px 0px inset;
```

**md** — blur: 8px
```css
box-shadow: rgba(0, 0, 0, 0.06) 0px 4px 8px 0px;
```

**md** — blur: 10px
```css
box-shadow: rgba(0, 0, 0, 0.2) 0px 2px 10px 0px;
```

**md** — blur: 10px
```css
box-shadow: rgba(33, 33, 33, 0.06) 0px 6px 10px 0px, rgba(33, 33, 33, 0.04) 0px 1px 18px 0px, rgba(33, 33, 33, 0.08) 0px 3px 5px 0px;
```

**lg** — blur: 10px
```css
box-shadow: rgba(33, 33, 33, 0.06) 0px 8px 10px 0px, rgba(33, 33, 33, 0.04) 0px 3px 14px 0px, rgba(33, 33, 33, 0.08) 0px 5px 5px 0px;
```

## CSS Custom Properties

### Colors

```css
--app-install-widget-bgcolor: #ebf7f4;
--xl-border-radius: 16px;
--l-border-radius: 8px;
--border-radius: 6px;
--s-border-radius: 4px;
--xs-border-radius: 2px;
--edd-info-disclaimer-color: #6d7278;
--status-card-light-blue: #f5f8fc;
--secondary-diagnostic-b200: #f1f8fe;
--primary-green-g100: #ceeae8;
--primary-green-g200: #83c9c6;
--primary-green-g600: #10847e;
--primary-green-g400: #15aca5;
--primary-green-g800: #0e746e;
--primary-green-g1000: #0a534f;
--primary-yellow: #f4c324;
--primary-black: #000;
--primary-white-n0: #fff;
--primary-diagnostic-b100: #ebf2ff;
--primary-diagnostic-b200: #b5cdf7;
--primary-diagnostic-b400: #7ea7f2;
--primary-diagnostic-b600: #3b7aef;
--primary-diagnostic-b800: #3661b0;
--primary-diagnostic-b1000: #2f446b;
--plus-primary-100: #f1eeff;
--plus-primary-200: #cfc9f2;
--plus-primary-400: #aaa1e8;
--plus-primary-600: #8678de;
--plus-primary-800: #6e53ba;
--plus-primary-1000: #3e2e6b;
--plus-accent-100: #fff8e3;
--plus-accent-200: #f6e4ab;
--plus-accent-400: #efd06c;
--plus-accent-600: #f5b326;
--plus-accent-800: #c88801;
--plus-accent-1000: #776133;
--secondary-primary-200: #ffd7e1;
--secondary-primary-800: #e15f7f;
--secondary-quick-q600: #e25a05;
--secondary-quick-q100: #fef5ee;
--primary-hms-yellow: #f6e14c;
--borderRadiusExtraSmall: 2px;
--borderRadiusSmall: 4px;
--borderRadiusMedium: 8px;
--borderRadiusMediumLarge: 10px;
--borderRadiusLarge: 12px;
--borderRadiusExtraLarge: 16px;
--borderRadiusXXL: 24px;
--borderRadiusXXXl: 32px;
--borderRadiusRound: 100px;
--growthNUScratchcardBg: #fbedde;
```

### Spacing

```css
--h1-font-size: 42px;
--xl-font-size: 36px;
--l-font-size: 30px;
--h2-font-size: 26px;
--huge-font-size: 24px;
--heading-large-font-size: 22px;
--h3-font-size: 20px;
--large-font-size: 18px;
--heading-font-size: 18px;
--default-font-size: 16px;
--medium-font-size: 14px;
--small-font-size: 12px;
--xs-font-size: 10px;
--xxs-font-size: 8px;
--lhs-rhs-spacing: 80px;
--lhs-rhs-mobile-spacing: 0;
--xs-spacing: 5px;
--s-spacing: 10px;
--m-spacing: 15px;
--l-spacing: 20px;
--xl-spacing: 25px;
--xxl-spacing: 30px;
--xxxl-spacing: 35px;
--xxxxl-spacing: 40px;
--xxxxxl-spacing: 45px;
--xxxxxxl-spacing: 50px;
--xl-space: 24px;
--fontSize0: 10px;
--fontSize1: 11px;
--fontSize2: 12px;
--fontSize3: 13px;
--fontSize4: 14px;
--fontSize5: 15px;
--fontSize6: 16px;
--fontSize7: 18px;
--fontSize8: 22px;
--fontSize9: 26px;
--fontSize10: 32px;
--fontSize11: 40px;
--fontSize12: 48px;
--fontSize13: 56px;
--fontSize14: 64px;
```

### Typography

```css
--font-family: "Open Sans",sans-serif;
--xxl-line-height: 1.8;
--xl-line-height: 1.5;
--l-line-height: 1.25;
--m-line-height: 1;
--line-height-14: 14px;
--line-height-16: 16px;
--line-height-18: 18px;
--line-height-20: 20px;
--line-height-22: 22px;
--line-height-24: 24px;
```

### Shadows

```css
--shadow-light: 0 2px 5px var(--gray);
--shadow: 0 3px 20px 0 rgba(0,0,0,.23);
```

### Other

```css
--wrapper-width-hdpi: 1366px;
--wrapper-width-mdpi: 1024px;
--wrapper-width-mobile: 100%;
--header-mobile-height: 55px;
--light-green: #3bb896;
--hover-green: #e6fcf6;
--green: #10847e;
--dark-green: #0d4f44;
--highlight-green: #befdda;
--lighter-green: #effffb;
--lightest-green: #f2fff8;
--pure-black-light: #333;
--pure-black: #000;
--dark-black: #3e415b;
--black: #4f585e;
--dark-gray: #4b4b4b;
--dark100-grey: #4a4a4a;
--light-black: #8897a2;
--white: #fff;
--dirty-white: #f2f5f5;
--lightest-gray: #f3f6fa;
--lighter-gray: #f2f2f2;
--light-gray: #f4f7fb;
--shimmer: #f1f1f2;
--gray: #dfe3e6;
--lightest-red: #fff9fa;
--lighter-red: #ffefef;
--light-red: #f76b6d;
--red: #e60d1f;
--marigold: #f3cab1;
--dark-red: #f05965;
--error-red: #ff7d7b;
--orange: #fc8019;
--medium-orange: #fef8f3;
--highlight-orange: #fff7e4;
--light-orange: #fff8da;
--blue: #00b9e1;
--ice-blue: #e9f9ff;
--bright-blue: #32c5ff;
--navy-blue: #5099c1;
--dark-blue: #013446;
--light-blue: #d6faff;
--sky-blue: #aee2ff;
--deep-blue: #6ba1f7;
--deeper-blue: #5986e6;
--shine-blue: #4781ec;
--powder-blue: #beeddd;
--light-cyan: #def7f8;
--cyan-blue: #dce4f1;
--silver-blue: #f1fafe;
--pink: #d90687;
--light-pink: #fff2f2;
--error-background: hsla(4,72%,69%,.2);
--purple: #8573e1;
--light-purple: #a291fa;
--lightest-purple: rgba(162,145,250,.1);
--royal-purple: #6e53ba;
--yellow: #f7b500;
--dark-yellow: #dc8a05;
--highlight-yellow: #fef7ce;
--warning-yellow: #fad961;
--extra-highlight-yellow: #ffe19e;
--light-yellow: #fffeda;
--lightest-yellow: #fffae3;
--lighter-yellow: #fdf2d2;
--highlighter-yellow: #fff8e6;
--off-white: #fffbe9;
--manilla: #feea8e;
--pale-blue: #d6f0ff;
--salmon: #ff7c78;
--brown: #a05d26;
--wood-brown: #634646;
--sea-green: #dbfff5;
--light-sea-green: #f1fff7;
--lighter-sea-green: #e8f7f3;
--aqua-marine: #3ccea5;
--light-aqua-marine: #def7f0;
--dark100-aqua-marine: #16876e;
--dark-aqua-marine: #0e6b67;
--pale-gray: #ebf0f5;
--royal-blue: #3148dd;
--rose-pink: #fde8e8;
--pale-yellow: #fef1cd;
--purple-lite-background: #f5f3ff;
--purple-background: #e2dcff;
--light-green-backgound: #dbfff5;
--light-blue-background: #c7efff;
--lighter-blue: #d4e2fa;
--quote-green: #2c9477;
--dot-yellow: #ffebb5;
--extra-light-gray: #f8f8fe;
--gray-marker: #9d9ab0;
--bluish-gray: #bdccd7;
--silver: #cfd2d4;
--success-green: #3ec29e;
--light-bluish-gray: #e3eaf0;
--lighter-bluish-gray: #eef4ff;
--separator: #c8cfd4;
--mint-cream: #f6fffa;
--off-red: #f98c8e;
--gradient-red: #f2afb0;
--clear-red: #f7ad31;
--off-blue: #eaf1ff;
--medium-red: #f98b8d;
--light-brown: #51585e;
--dark-grey: #656d72;
--very-light-gray: #dfdfdf;
--red-pink: #e15f7f;
--deep-purple: #8678de;
--lime-green: #62bf9f;
--gray-variant-1: #dde4f1;
--grey-white: #dcdcdc;
--black-light: #30363c;
--red-one: #cc4c4e;
--white-one: #fff5f5;
--white-two: #ebf2ff;
--white-three: #e4edfe;
--davys-grey: #51585d;
--regular-weight: 400;
--medium-weight: 500;
--semi-bold: 600;
--bold: 700;
--lhs-width: 592px;
--lhs-mobile-width: 100%;
--rhs-width: 352px;
--rhs-mobile-width: 100%;
--header-height: 145px;
--new-header-height: 103px;
--collapsed-header-height: 80px;
--mobile-header-height: 60px;
--expanded-mobile-header-height: 115px;
--location-strip-height: 56px;
--slim-header-height: 96px;
--form-element-height: 45px;
--typeahead-height: 50px;
--typeahead-height-mobile: 45px;
--backdrop-z-index: -1;
--sticky-z-index: 10;
--banner-z-index: 150;
--header-z-index: 200;
--header-with-search-z-index: 201;
--loading-bar-z-index: 250;
--typeahead-z-index: 400;
--modal-z-index: 2050;
--tooltip-z-index: 2051;
--drawer-z-index: 1030;
--diagnostics-view-cart-strip-z-index: 150;
--ripple-z-index: -1;
--ripple-container-z-index: 1;
--toast-z-index: 2052;
--quarter-right: 45deg;
--quarter-left: -45deg;
--button-extra-small-width: 80px;
--button-small-width: 140px;
--button-medium-width: 200px;
--button-large-width: 352px;
--bmc-blue: #004a91;
--bmc-orange: #f87e73;
--bmc-grey: #cdcdcd;
--bmc-black: #414141;
--bmc-dark-grey: #797979;
--bmc-white: #fff;
--bmc-header-height: 172px;
--bmc-wrapper-width: 420px;
--bmc-footer-height: 40px;
--edd-tooltip-background: #e1e1e1;
--darkish-black: #212121;
--green-g200: #83c9c6;
--green-g800: #0e746e;
--twopointfive: 20px;
--header-mobile-height-v2: 52px;
--neutral-Dark-n800: #30363c;
--neutral-Dark-n600: #4f585e;
--neutral-Dark-n400: #6e787e;
--neutral-Dark-n200: #8897a2;
--neutral-Dark-n100: #d7dfe5;
--neutral-Light-n40: #e6ebf4;
--neutral-Light-n80: #b4c0d3;
--neutral-Light-n70: #d4dbe7;
--neutral-Light-n60: #dce4f1;
--neutral-Light-n20: #edf2f9;
--neutral-Light-n10: #f5f8fc;
--diagnostic-illustration-100: #cef8ff;
--diagnostic-illustration-200: #a6effc;
--diagnostic-illustration-400: #70dff3;
--diagnostic-illustration-600: #3dcde6;
--diagnostic-illustration-800: #1fa4bb;
--diagnostic-illustration-1000: #187484;
--feedback-assist-c600: #3e415b;
--feedback-error-100: #fff5f5;
--feedback-error-200: #fcc0c2;
--feedback-error-400: #fe9395;
--feedback-error-600: #f47779;
--feedback-error-800: #cc4c4e;
--feedback-error-1000: #583536;
--feedback-warning-100: #fff2e8;
--feedback-warning-200: #ffc9a0;
--feedback-warning-400: #ffae71;
--feedback-warning-600: #ff9341;
--feedback-warning-800: #cf7530;
--feedback-warning-1000: #784c2a;
--feedback-success-100: #f2fff8;
--feedback-success-200: #bfeddd;
--feedback-success-400: #81dcba;
--feedback-success-600: #62bf9f;
--feedback-success-800: #45a081;
--feedback-success-1000: #38544a;
--illustration-skeleton-200: #f1fafe;
--illustration-skeleton-400: #e2eff7;
--illustration-skeleton-600: #c2deee;
--illustration-skeleton-800: #aacfe3;
--half: 4px;
--baseline: 8px;
--onepointfive: 12px;
--two: 16px;
--three: 24px;
--four: 32px;
--five: 40px;
--six: 48px;
--seven: 56px;
--eight: 64px;
--nine: 72px;
--ten: 80px;
--twelve: 96px;
--fifteen: 120px;
--lineHeight0: 16px;
--lineHeight0Point5: 18px;
--lineHeight1: 20px;
--lineHeight1Point5: 22px;
--lineHeight2: 24px;
--lineHeight3: 28px;
--lineHeight4: 32px;
--lineHeight5: 40px;
--lineHeight6: 48px;
--lineHeight7: 56px;
--lineHeight8: 64px;
--lineHeight9: 72px;
--ls1: 0.4px;
--white-four: #e6ebf4;
```

### Dependencies

```css
--shadow-light: --gray;
```

### Semantic

```css
success: [object Object];
warning: [object Object];
error: [object Object];
info: [object Object];
```

## Breakpoints

| Name | Value | Type |
|------|-------|------|
| sm | 541px | min-width |
| md | 719px | max-width |
| md | 720px | min-width |
| md | 767px | max-width |
| md | 768px | min-width |
| lg | 1023px | max-width |
| lg | 1024px | min-width |
| xl | 1280px | min-width |
| 1365px | 1365px | max-width |

## Transitions & Animations

**Easing functions:** `[object Object]`

**Durations:** `0.3s`, `0.2s`, `0.1s`, `0.15s`, `0.5s`

### Common Transitions

```css
transition: all;
transition: 0.3s ease-in;
transition: opacity 0.3s ease-in;
transition: font-weight 0.2s;
transition: font-weight 0.2s, background-color 0.2s;
transition: color 0.2s;
transition: opacity 0.3s, transform 0.3s;
transition: background-color 0.1s ease-in;
transition: transform 0.3s;
transition: background-color 0.2s, transform 0.15s;
```

### Keyframe Animations

**Shimmer_placeholderShimmer__Gy8gQ**
```css
@keyframes Shimmer_placeholderShimmer__Gy8gQ {
  0% { background-position: -468px 0px; }
  100% { background-position: 468px 0px; }
}
```

**Shimmer_shimmerExtraWide__V9rYG**
```css
@keyframes Shimmer_shimmerExtraWide__V9rYG {
  0% { background-position: -900px 0px; }
  100% { background-position: 900px 0px; }
}
```

**AlertToast_fade-in__VYKOK**
```css
@keyframes AlertToast_fade-in__VYKOK {
  0% { opacity: 0; }
}
```

**AlertToast_fade-out__OYLaC**
```css
@keyframes AlertToast_fade-out__OYLaC {
  100% { opacity: 0; }
}
```

**AlertToast_slide-in___6OEO**
```css
@keyframes AlertToast_slide-in___6OEO {
  0% { transform: translateY(50px); }
}
```

**CircularLoader-module_spin__FTDpk**
```css
@keyframes CircularLoader-module_spin__FTDpk {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(1turn); }
}
```

**OTPInput-module_blinker__dxCnj**
```css
@keyframes OTPInput-module_blinker__dxCnj {
  50% { opacity: 0; }
}
```

**CircularLoader-module_spin__FTDpk**
```css
@keyframes CircularLoader-module_spin__FTDpk {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(1turn); }
}
```

**typeahead-lib-SearchShimmer-module_shimmer__CnwDN**
```css
@keyframes typeahead-lib-SearchShimmer-module_shimmer__CnwDN {
  0% { background-position: 200% 0px; }
  100% { background-position: -200% 0px; }
}
```

**header-lib-Navigation-module_slideDown__IcpRr**
```css
@keyframes header-lib-Navigation-module_slideDown__IcpRr {
  0% { opacity: 0; transform: translateY(-6px); }
  100% { opacity: 1; transform: translateY(0px); }
}
```

## Component Patterns

Detected UI component patterns and their most common styles:

### Buttons (10 instances)

```css
.button {
  background-color: rgb(16, 132, 126);
  color: rgb(48, 54, 60);
  font-size: 14px;
  font-weight: 700;
  padding-top: 0px;
  padding-right: 0px;
  border-radius: 0px;
}
```

### Cards (144 instances)

```css
.card {
  background-color: rgb(245, 248, 252);
  border-radius: 0px;
  box-shadow: rgba(33, 33, 33, 0.06) 0px 6px 10px 0px, rgba(33, 33, 33, 0.04) 0px 1px 18px 0px, rgba(33, 33, 33, 0.08) 0px 3px 5px 0px;
  padding-top: 0px;
  padding-right: 0px;
}
```

### Links (670 instances)

```css
.link {
  color: rgb(48, 54, 60);
  font-size: 12px;
  font-weight: 500;
}
```

### Navigation (724 instances)

```css
.navigatio {
  background-color: rgb(255, 255, 255);
  color: rgb(48, 54, 60);
  padding-top: 8px;
  padding-bottom: 8px;
  padding-left: 24px;
  padding-right: 16px;
  position: static;
  box-shadow: rgba(33, 33, 33, 0.06) 0px 6px 10px 0px, rgba(33, 33, 33, 0.04) 0px 1px 18px 0px, rgba(33, 33, 33, 0.08) 0px 3px 5px 0px;
}
```

### Footer (93 instances)

```css
.foote {
  background-color: rgb(238, 244, 255);
  color: rgb(48, 54, 60);
  padding-top: 0px;
  padding-bottom: 0px;
  font-size: 16px;
}
```

### Modals (3 instances)

```css
.modal {
  background-color: rgb(255, 255, 255);
  border-radius: 0px;
  padding-top: 0px;
  padding-right: 0px;
  max-width: 440px;
}
```

### Dropdowns (644 instances)

```css
.dropdown {
  background-color: rgb(245, 248, 252);
  border-radius: 0px;
  box-shadow: rgba(33, 33, 33, 0.06) 0px 6px 10px 0px, rgba(33, 33, 33, 0.04) 0px 1px 18px 0px, rgba(33, 33, 33, 0.08) 0px 3px 5px 0px;
  border-color: rgb(48, 54, 60);
  padding-top: 8px;
}
```

### Badges (50 instances)

```css
.badge {
  background-color: rgb(244, 119, 121);
  color: rgb(244, 119, 121);
  font-size: 14px;
  font-weight: 700;
  padding-top: 0px;
  padding-right: 4px;
  border-radius: 0px;
}
```

### Accordions (1 instances)

```css
.accordion {
  color: rgb(79, 88, 94);
  font-size: 15px;
  padding-top: 0px;
  padding-right: 0px;
  border-color: rgb(79, 88, 94);
}
```

## Component Clusters

Reusable component instances grouped by DOM structure and style similarity:

### Button — 1 instance, 1 variant

**Variant 1** (1 instance)

```css
  background: rgba(0, 0, 0, 0);
  color: rgb(48, 54, 60);
  padding: 0px 0px 0px 0px;
  border-radius: 0px;
  border: 0px none rgb(48, 54, 60);
  font-size: 16px;
  font-weight: 400;
```

### Button — 1 instance, 1 variant

**Variant 1** (1 instance)

```css
  background: rgba(0, 0, 0, 0);
  color: rgb(136, 151, 162);
  padding: 0px 12px 0px 0px;
  border-radius: 0px;
  border: 0px none rgb(136, 151, 162);
  font-size: 16px;
  font-weight: 400;
```

### Button — 1 instance, 1 variant

**Variant 1** (1 instance)

```css
  background: rgb(16, 132, 126);
  color: rgb(255, 255, 255);
  padding: 0px 0px 0px 0px;
  border-radius: 100px;
  border: 0px none rgb(255, 255, 255);
  font-size: 14px;
  font-weight: 600;
```

### Link — 7 instances, 1 variant

**Variant 1** (7 instances)

```css
  background: rgba(0, 0, 0, 0);
  color: rgb(48, 54, 60);
  padding: 0px 0px 0px 0px;
  border-radius: 8px;
  border: 0px none rgb(48, 54, 60);
  font-size: 16px;
  font-weight: 400;
```

### Link — 8 instances, 1 variant

**Variant 1** (8 instances)

```css
  background: rgba(0, 0, 0, 0);
  color: rgb(48, 54, 60);
  padding: 0px 0px 0px 0px;
  border-radius: 8px;
  border: 0px none rgb(48, 54, 60);
  font-size: 16px;
  font-weight: 400;
```

### Link — 10 instances, 1 variant

**Variant 1** (10 instances)

```css
  background: rgba(0, 0, 0, 0);
  color: rgb(48, 54, 60);
  padding: 0px 0px 0px 0px;
  border-radius: 0px;
  border: 0px none rgb(48, 54, 60);
  font-size: 16px;
  font-weight: 400;
```

### Card — 1 instance, 1 variant

**Variant 1** (1 instance)

```css
  background: rgba(0, 0, 0, 0);
  color: rgb(48, 54, 60);
  padding: 0px 0px 0px 0px;
  border-radius: 8px;
  border: 1px solid rgb(230, 235, 244);
  font-size: 16px;
  font-weight: 400;
```

### Link — 4 instances, 1 variant

**Variant 1** (4 instances)

```css
  background: rgb(241, 250, 254);
  color: rgb(48, 54, 60);
  padding: 16px 0px 0px 16px;
  border-radius: 8px;
  border: 0px none rgb(48, 54, 60);
  font-size: 16px;
  font-weight: 400;
```

### Card — 4 instances, 1 variant

**Variant 1** (4 instances)

```css
  background: rgba(0, 0, 0, 0);
  color: rgb(48, 54, 60);
  padding: 0px 0px 0px 0px;
  border-radius: 0px;
  border: 0px none rgb(48, 54, 60);
  font-size: 16px;
  font-weight: 400;
```

## Layout System

**3 grid containers** and **646 flex containers** detected.

### Container Widths

| Max Width | Padding |
|-----------|---------|
| 860px | 0px |
| 1440px | 40px |
| 440px | 0px |

### Grid Column Patterns

| Columns | Usage Count |
|---------|-------------|
| 4-column | 2x |
| 2-column | 1x |

### Grid Templates

```css
grid-template-columns: 360px 360px 360px 368px;
gap: 24px 56px;
grid-template-columns: 278px 278px 278px 278px;
gap: 24px;
grid-template-columns: 267px 267.016px;
gap: 12px;
```

### Flex Patterns

| Direction/Wrap | Count |
|----------------|-------|
| row/nowrap | 348x |
| row/wrap | 7x |
| column/nowrap | 289x |
| row-reverse/nowrap | 1x |
| column/wrap | 1x |

**Gap values:** `0px normal`, `12px`, `16px`, `24px`, `24px 56px`, `32px`, `32px 16px`, `40px`, `48px`, `4px`, `8px`, `8px 4px`

## Accessibility (WCAG 2.1)

**Overall Score: 62%** — 8 passing, 5 failing color pairs

### Failing Color Pairs

| Foreground | Background | Ratio | Level | Used On |
|------------|------------|-------|-------|---------|
| `#ffffff` | `#f47779` | 2.71:1 | FAIL | span (4x) |
| `#ffffff` | `#f5b326` | 1.85:1 | FAIL | span (1x) |

### Passing Color Pairs

| Foreground | Background | Ratio | Level |
|------------|------------|-------|-------|
| `#3661b0` | `#ebf2ff` | 5.35:1 | AA |
| `#ffffff` | `#10847e` | 4.54:1 | AA |
| `#30363c` | `#dce4f1` | 9.55:1 | AAA |
| `#000000` | `#ebf2ff` | 18.68:1 | AAA |

## Design System Score

**Overall: 85/100 (Grade: B)**

| Category | Score |
|----------|-------|
| Color Discipline | 92/100 |
| Typography Consistency | 90/100 |
| Spacing System | 85/100 |
| Shadow Consistency | 100/100 |
| Border Radius Consistency | 90/100 |
| Accessibility | 62/100 |
| CSS Tokenization | 100/100 |

**Strengths:** Tight, disciplined color palette, Consistent typography system, Well-defined spacing scale, Clean elevation system, Consistent border radii, Good CSS variable tokenization

**Issues:**
- 5 WCAG contrast failures
- 67% of CSS is unused — consider purging
- 3936 duplicate CSS declarations

## Gradients

**5 unique gradients** detected.

| Type | Direction | Stops | Classification |
|------|-----------|-------|----------------|
| linear | 90deg | 2 | brand |
| radial | — | 4 | bold |
| radial | — | 4 | bold |
| linear | 90deg | 2 | brand |
| linear | — | 2 | brand |

```css
background: linear-gradient(90deg, rgb(235, 242, 255) 10%, rgba(0, 0, 0, 0) 85%);
background: radial-gradient(380px 380px at 105% -50%, rgba(227, 128, 183, 0.28) 1%, rgba(188, 104, 150, 0.49) 45%, rgba(0, 0, 0, 0));
background: radial-gradient(380px 380px at -5% 140%, rgba(227, 128, 183, 0.28) 1%, rgba(188, 104, 150, 0.49) 45%, rgba(0, 0, 0, 0));
background: linear-gradient(90deg, rgb(245, 179, 38) -1.35%, rgba(0, 0, 0, 0) 97.57%);
background: linear-gradient(rgb(59, 122, 239), rgb(54, 97, 176));
```

## Z-Index Map

**8 unique z-index values** across 3 layers.

| Layer | Range | Elements |
|-------|-------|----------|
| modal | 1000,1000 | header.h.e.a.d.e.r.-.l.i.b.-.H.e.a.d.e.r.-.m.o.d.u.l.e._.h.e.a.d.e.r._._.u.L.l.c.o |
| dropdown | 100,110 | div.s.t.y.l.e._.s.t.r.i.p.C.o.n.t.a.i.n.e.r._._.I.h.t.G.7. .s.t.y.l.e._.s.t.r.i.p.V.i.s.i.b.l.e._._.t.V.D.Z.e, a.s.t.y.l.e._.c.o.n.t.a.i.n.e.r._._.o.a.W.9.H, a.s.t.y.l.e._.c.o.n.t.a.i.n.e.r._._.o.a.W.9.H |
| base | -1,3 | div.s.t.y.l.e._.b.a.c.k.g.r.o.u.n.d.I.m.a.g.e._._.S.k.b.S.C, div.D.r.a.w.e.r.-.m.o.d.u.l.e._.i.n.n.e.r.W.r.a.p.p.e.r._._.0.t.B.H.q. .D.r.a.w.e.r.-.m.o.d.u.l.e._.r.i.g.h.t._._.i.7.a.7.w, div.D.r.a.w.e.r.-.m.o.d.u.l.e._.i.n.n.e.r.W.r.a.p.p.e.r._._.0.t.B.H.q. .D.r.a.w.e.r.-.m.o.d.u.l.e._.f.u.l.l.H.e.i.g.h.t._._.H.9.N.e.3. .D.r.a.w.e.r.-.m.o.d.u.l.e._.r.i.g.h.t._._.i.7.a.7.w |

## SVG Icons

**11 unique SVG icons** detected. Dominant style: **filled**.

| Size Class | Count |
|------------|-------|
| sm | 2 |
| md | 9 |

**Icon colors:** `#30363C`, `currentColor`, `rgb(48, 54, 60)`, `rgb(16, 132, 126)`, `#8897A2`, `rgba(0, 0, 0, 0)`, `rgb(255, 255, 255)`, `rgb(191, 237, 221)`

## Font Files

| Family | Source | Weights | Styles |
|--------|--------|---------|--------|
| Inter | self-hosted | 400 700 | normal |

## Image Style Patterns

| Pattern | Count | Key Styles |
|---------|-------|------------|
| thumbnail | 137 | objectFit: fill, borderRadius: 0px, shape: square |
| general | 22 | objectFit: cover, borderRadius: 0px, shape: square |
| gallery | 1 | objectFit: fill, borderRadius: 0px, shape: square |

**Aspect ratios:** 1:1 (104x), 4:3 (16x), 21:9 (13x), 16:9 (12x), 1.94:1 (8x), 3.38:1 (2x), 3.68:1 (1x), 3.33:1 (1x)

## Motion Language

**Feel:** smooth · **Scroll-linked:** yes

### Duration Tokens

| name | value | ms |
|---|---|---|
| `xs` | `100ms` | 100 |
| `sm` | `200ms` | 200 |
| `md` | `300ms` | 300 |
| `lg` | `500ms` | 500 |

### Easing Families

- **ease-in-out** (86 uses) — `ease`

### Keyframes In Use

| name | kind | properties | uses |
|---|---|---|---|
| `header-lib-Navigation-module_slideDown__IcpRr` | slide-y | opacity, transform | 1 |
| `header-lib-Navigation-module_slideDown__IcpRr` | slide-y | opacity, transform | 1 |
| `header-lib-Navigation-module_slideDown__IcpRr` | slide-y | opacity, transform | 1 |

## Component Anatomy

### link — 29 instances


### card — 5 instances

**Slots:** media

### button — 3 instances

**Slots:** label, icon

## Brand Voice

**Tone:** formal · **Pronoun:** third-person · **Headings:** unknown (tight)

### Top CTA Verbs

- **off** (4)
- **hello** (1)
- **search** (1)
- **medicine** (1)
- **lab** (1)
- **doctor** (1)
- **branded** (1)
- **healthcare** (1)

### Button Copy Patterns

- "hello, log in" (1×)
- "search" (1×)
- "medicine

save 27%" (1×)
- "lab tests

upto 70% off" (1×)
- "doctor consult

from ₹199" (1×)
- "branded substitute

upto 50% off" (1×)
- "healthcare

upto 60% off" (1×)
- "health blogs" (1×)
- "plus

save 5% extra" (1×)
- "offers" (1×)

## Page Intent

**Type:** `landing` (confidence 0.31)
**Description:** PharmEasy, one of India's most trusted online pharmacy & medical stores, offers online medicine delivery, lab tests, online doctor consultation, home vaccination service and healthcare essentials acro

Alternates: auth (0.35)

## Section Roles

Reading order (top→bottom): nav → nav

| # | Role | Heading | Confidence |
|---|------|---------|------------|
| 0 | nav | — | 0.4 |
| 1 | nav | — | 0.9 |

## Material Language

**Label:** `flat` (confidence 0)

| Metric | Value |
|--------|-------|
| Avg saturation | 0.323 |
| Shadow profile | soft |
| Avg shadow blur | 0px |
| Max radius | 100px |
| backdrop-filter in use | no |
| Gradients | 5 |

## Imagery Style

**Label:** `photography` (confidence 0.078)
**Counts:** total 160, svg 17, icon 5, screenshot-like 0, photo-like 25
**Dominant aspect:** square-ish
**Radius profile on images:** square

## Component Screenshots

6 retina crops written to `screenshots/`. Index: `*-screenshots.json`.

| Cluster | Variant | Size (px) | File |
|---------|---------|-----------|------|
| button--default | 0 | 154 × 24 | `screenshots/button-default-0.png` |
| button--default | 1 | 37 × 38 | `screenshots/button-default-1.png` |
| button--default | 2 | 88 × 40 | `screenshots/button-default-2.png` |
| card--default | 0 | 132 × 176 | `screenshots/card-default-0.png` |
| card--default | 1 | 132 × 176 | `screenshots/card-default-1.png` |
| card--default | 2 | 132 × 176 | `screenshots/card-default-2.png` |

Full-page: `screenshots/full-page.png`

## Quick Start

To recreate this design in a new project:

1. **Install fonts:** Add `Inter` from Google Fonts or your font provider
2. **Import CSS variables:** Copy `variables.css` into your project
3. **Tailwind users:** Use the generated `tailwind.config.js` to extend your theme
4. **Design tokens:** Import `design-tokens.json` for tooling integration
