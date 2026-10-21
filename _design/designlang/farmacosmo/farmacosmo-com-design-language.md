# Design Language: Farmacosmo | Online Pharmacy, Beauty and Health

> Extracted from `https://www.farmacosmo.com` on October 21, 2026
> 2815 elements analyzed

This document describes the complete design language of the website. It is structured for AI/LLM consumption — use it to faithfully recreate the visual design in any framework.

## Color Palette

### Primary Colors

| Role | Hex | RGB | HSL | Usage Count |
|------|-----|-----|-----|-------------|
| Primary | `#fece00` | rgb(254, 206, 0) | hsl(49, 100%, 50%) | 60 |
| Secondary | `#0d3464` | rgb(13, 52, 100) | hsl(213, 77%, 22%) | 461 |
| Accent | `#0e4650` | rgb(14, 70, 80) | hsl(189, 70%, 18%) | 1 |

### Neutral Colors

| Hex | HSL | Usage Count |
|-----|-----|-------------|
| `#000000` | hsl(0, 0%, 0%) | 2545 |
| `#373a3c` | hsl(204, 4%, 23%) | 1653 |
| `#ffffff` | hsl(0, 0%, 100%) | 284 |
| `#7a7a7a` | hsl(0, 0%, 48%) | 188 |
| `#92989f` | hsl(212, 6%, 60%) | 100 |
| `#f4f4f4` | hsl(0, 0%, 96%) | 53 |
| `#c3c3c3` | hsl(0, 0%, 76%) | 26 |
| `#eaf9ff` | hsl(197, 100%, 96%) | 19 |
| `#d3d3d3` | hsl(0, 0%, 83%) | 18 |
| `#e8e9ea` | hsl(210, 5%, 91%) | 15 |
| `#222222` | hsl(0, 0%, 13%) | 12 |
| `#55595c` | hsl(206, 4%, 35%) | 4 |

### Background Colors

Used on large-area elements: `#ffffff`, `#0d3464`, `#fff7f7`, `#d8e9ff`, `#e4dafd`, `#eaf9ff`, `#283646`, `#f2f2f2`, `#123663`

### Text Colors

Text color palette: `#000000`, `#ffffff`, `#0d3464`, `#55595c`, `#222222`, `#1a73e8`, `#666666`, `#7a7a7a`, `#373a3c`, `#55cdff`

### Gradients

```css
background-image: linear-gradient(rgba(0, 0, 0, 0) 80%, rgb(255, 212, 0) 80%);
```

### Full Color Inventory

| Hex | Contexts | Count |
|-----|----------|-------|
| `#000000` | text, border, background | 2545 |
| `#373a3c` | text, border | 1653 |
| `#0d3464` | background, text, border | 461 |
| `#efb215` | text, border | 286 |
| `#ffffff` | background, text, border | 284 |
| `#7a7a7a` | text, border | 188 |
| `#92989f` | text, border | 100 |
| `#fece00` | background, text, border | 60 |
| `#f4f4f4` | background, border | 53 |
| `#007bff` | background, text, border | 46 |
| `#38812c` | text, border | 30 |
| `#c3c3c3` | border | 26 |
| `#eaf9ff` | background | 19 |
| `#d3d3d3` | border, text | 18 |
| `#c4dce8` | background | 15 |
| `#e8e9ea` | border | 15 |
| `#222222` | text, border | 12 |
| `#f7dede` | border | 12 |
| `#55595c` | text, background | 4 |
| `#707070` | background, text, border | 4 |
| `#283646` | background, text, border | 3 |
| `#1a73e8` | text, border | 2 |
| `#666666` | text, border | 2 |
| `#55cdff` | text, border | 2 |
| `#888888` | text, border | 2 |
| `#e0e0e0` | border | 1 |
| `#d8e9ff` | background | 1 |
| `#e4dafd` | background | 1 |
| `#0e4650` | background | 1 |

## Typography

### Font Families

- **proxima-nova-regular** — used for all (2219 elements)
- **Font Awesome 6 Free** — used for body (145 elements)
- **montserrat-semibold** — used for all (131 elements)
- **proxima-nova-medium** — used for all (106 elements)
- **sans-serif** — used for all (84 elements)
- **montserrat-medium** — used for body (59 elements)
- **montserrat-bold** — used for all (30 elements)
- **proxima-nova-bold** — used for all (24 elements)
- **proxima-nova-extrabold** — used for body (15 elements)
- **proxima-nova-semibold** — used for headings (2 elements)

### Type Scale

| Size (px) | Size (rem) | Weight | Line Height | Letter Spacing | Used On |
|-----------|------------|--------|-------------|----------------|---------|
| 29px | 1.8125rem | 400 | 43.5px | normal | h1, h2, span |
| 22px | 1.375rem | 400 | 22px | normal | span, div, img, a |
| 20px | 1.25rem | 400 | 30px | normal | h2 |
| 19px | 1.1875rem | 400 | 28.5px | normal | p, b |
| 18.72px | 1.17rem | 400 | 28.08px | normal | h3 |
| 18px | 1.125rem | 400 | 27px | normal | span, h5, h4, div |
| 16px | 1rem | 400 | 18.4px | normal | html, head, meta, title |
| 15.21px | 0.9506rem | 400 | 22.815px | normal | h3, a |
| 15px | 0.9375rem | 600 | 22.5px | normal | span, div, a, del |
| 14px | 0.875rem | 400 | 21px | normal | a, div, i, li |
| 13.8px | 0.8625rem | 400 | 20.7px | normal | div, span, i |
| 13px | 0.8125rem | 400 | 19.5px | normal | div, strong, b, span |
| 12px | 0.75rem | 400 | 18px | normal | li, a, div, p |
| 11.25px | 0.7031rem | 600 | 0px | normal | sup, img |
| 11px | 0.6875rem | 400 | 16.5px | normal | span |

### Heading Scale

```css
h1 { font-size: 29px; font-weight: 400; line-height: 43.5px; }
h2 { font-size: 20px; font-weight: 400; line-height: 30px; }
h3 { font-size: 18.72px; font-weight: 400; line-height: 28.08px; }
h5 { font-size: 18px; font-weight: 400; line-height: 27px; }
h4 { font-size: 16px; font-weight: 400; line-height: 18.4px; }
h3 { font-size: 15.21px; font-weight: 400; line-height: 22.815px; }
```

### Body Text

```css
body { font-size: 12px; font-weight: 400; line-height: 18px; }
```

### Font Weights in Use

`400` (2458x), `900` (145x), `700` (116x), `600` (95x), `100` (1x)

## Spacing

| Token | Value | Rem |
|-------|-------|-----|
| spacing-0 | 0px | 0rem |
| spacing-20 | 20px | 1.25rem |
| spacing-24 | 24px | 1.5rem |
| spacing-30 | 30px | 1.875rem |
| spacing-32 | 32px | 2rem |
| spacing-35 | 35px | 2.1875rem |
| spacing-37 | 37px | 2.3125rem |
| spacing-40 | 40px | 2.5rem |
| spacing-43 | 43px | 2.6875rem |
| spacing-58 | 58px | 3.625rem |
| spacing-95 | 95px | 5.9375rem |
| spacing-135 | 135px | 8.4375rem |
| spacing-155 | 155px | 9.6875rem |
| spacing-361 | 361px | 22.5625rem |

## Border Radii

| Label | Value | Count |
|-------|-------|-------|
| sm | 3px | 6 |
| md | 8px | 1 |
| lg | 12px | 1 |
| xl | 20px | 5 |
| full | 50px | 36 |

## Box Shadows

**lg** — blur: 16px
```css
box-shadow: rgba(0, 0, 0, 0.12) 0px 4px 16px 0px;
```

## CSS Custom Properties

### Colors

```css
--swiper-theme-color: #007aff;
--df-accent-on-tertiary: #fafafa;
--df-accent-secondary: #737678;
--df-accent-primary-hover: #065dea;
--df-accent-tertiary: #323334;
--df-accent-on-primary: #f5f9ff;
--df-accent-tertiary-active: #191a1a;
--df-accent-secondary-hover: #66696b;
--df-accent-secondary-active: #5a5c5e;
--df-accent-on-secondary: #fafafa;
--df-accent-primary-active: #0553d1;
--df-accent-primary: #1069f9;
--df-accent-tertiary-hover: #252627;
```

### Spacing

```css
--swiper-navigation-size: 44px;
--mm-listitem-size: 50px;
--mm-navbar-size: 50px;
--mm-toggle-size: 34px;
--mm-size: 80%;
--mm-min-size: 240px;
--mm-max-size: 440px;
--mm-iconbar-size: 50px;
--mm-iconpanel-size: 50px;
--mm-sectionindexer-size: 20px;
--mm-sidebar-collapsed-size: 50px;
--mm-sidebar-expanded-size: var(--mm-max-size);
```

### Typography

```css
--fa-font-regular: normal 400 1em/1 "Font Awesome 6 Free";
--fa-font-brands: normal 400 1em/1 "Font Awesome 6 Brands";
--fa-font-solid: normal 900 1em/1 "Font Awesome 6 Free";
```

### Other

```css
--searchbar-height: 79px;
--navbar-height: 60px;
--larghezzaMenu: 1240px;
--mm-lineheight: 22px;
--mm-blocker-visibility-delay: 0.4s;
--mm-blocker-opacity-delay: 0s;
--main-header-fixed-height: 92px;
--header-height: 92px;
--larghezzaPrimoLivello: 300px;
--larghezzMenu: 1240px;
--larghezzaSottomenu: 600px;
--fa-style-family-classic: "Font Awesome 6 Free";
--df-neutral-disabled: #eff0f0;
--df-neutral-low-contrast: #cbcccd;
--df-neutral-outline: #cbcccd;
--df-neutral-high-contrast: #323334;
--df-neutral-surface: #fff;
--df-neutral-background: #fff;
--df-neutral-surface-variant: #e5e6e6;
--df-layer-animation-duration: 0.5s;
--df-neutral-medium-contrast: #737678;
--fa-style-family-brands: "Font Awesome 6 Brands";
```

### Dependencies

```css
--mm-sidebar-expanded-size: --mm-max-size;
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
| 36px | 36px | max-width |
| xs | 359px | max-width |
| xs | 360px | max-width |
| xs | 380px | max-width |
| 400px | 400px | max-width |
| sm | 480px | max-width |
| sm | 576px | max-width |
| sm | 600px | max-width |
| sm | 650px | max-width |
| md | 767px | max-width |
| md | 768px | min-width |
| md | 800px | max-width |
| md | 820px | max-width |
| md | 821px | min-width |
| 900px | 900px | max-width |
| lg | 991px | max-width |
| lg | 992px | max-width |
| lg | 1000px | min-width |
| lg | 1020px | max-width |
| lg | 1024px | max-width |
| lg | 1025px | min-width |
| 1179px | 1179px | max-width |
| 1180px | 1180px | max-width |
| 1181px | 1181px | min-width |
| 1199px | 1199px | max-width |
| 1200px | 1200px | max-width |
| 1210px | 1210px | max-width |
| xl | 1240px | max-width |
| xl | 1260px | max-width |
| xl | 1280px | max-width |
| xl | 1300px | min-width |
| 1440px | 1440px | max-width |
| 1920px | 1920px | min-width |

## Transitions & Animations

**Easing functions:** `[object Object]`, `[object Object]`

**Durations:** `0.3s`, `0.22s`, `0.45s`, `0.5s`, `0.2s`, `0.1s`, `0.6s`

### Common Transitions

```css
transition: all;
transition: 0.3s ease-in;
transition: opacity 0.22s, transform 0.22s;
transition: background-color 0.3s ease-in;
transition: transform 0.45s cubic-bezier(0.4, 0, 0.2, 1);
transition: 0.5s;
transition: opacity 0.3s;
transition: 0.2s ease-in;
transition: transform;
transition: transform 0.1s ease-in;
```

### Keyframe Animations

**swiper-preloader-spin**
```css
@keyframes swiper-preloader-spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
```

**spin**
```css
@keyframes spin {
  100% { transform: rotate(360deg); }
}
```

**spin**
```css
@keyframes spin {
  100% { transform: rotate(360deg); }
}
```

**rotate**
```css
@keyframes rotate {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(180deg); }
}
```

**rotate**
```css
@keyframes rotate {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(180deg); }
}
```

**pulsate**
```css
@keyframes pulsate {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
```

**zoom**
```css
@keyframes zoom {
  0% { transform: scale(1); }
  100% { transform: scale(1.1); }
}
```

**moveArrow**
```css
@keyframes moveArrow {
  0%, 100% { transform: translateX(0px); }
  50% { transform: translateX(6px); }
}
```

**headShake**
```css
@keyframes headShake {
  0%, 50% { transform: translateX(0px); }
  6.5% { transform: translateX(-6px) rotateY(-9deg); }
  18.5% { transform: translateX(5px) rotateY(7deg); }
  31.5% { transform: translateX(-3px) rotateY(-5deg); }
  43.5% { transform: translateX(2px) rotateY(3deg); }
}
```

**fadeInDown**
```css
@keyframes fadeInDown {
  0% { opacity: 0; transform: translateY(-100%); }
  100% { opacity: 1; transform: translateY(0px); }
}
```

## Component Patterns

Detected UI component patterns and their most common styles:

### Buttons (53 instances)

```css
.button {
  background-color: rgb(255, 212, 0);
  color: rgb(0, 0, 0);
  font-size: 16px;
  font-weight: 400;
  padding-top: 1px;
  padding-right: 6px;
  border-radius: 5px;
}
```

### Cards (42 instances)

```css
.card {
  background-color: rgb(255, 255, 255);
  border-radius: 0px;
  box-shadow: rgba(0, 0, 0, 0.12) 0px 4px 16px 0px;
  padding-top: 0px;
  padding-right: 0px;
}
```

### Inputs (121 instances)

```css
.input {
  background-color: rgb(255, 255, 255);
  color: rgb(0, 0, 0);
  border-color: rgb(0, 0, 0);
  border-radius: 0px;
  font-size: 16px;
  padding-top: 0px;
  padding-right: 0px;
}
```

### Links (377 instances)

```css
.link {
  color: rgb(64, 64, 64);
  font-size: 12px;
  font-weight: 400;
}
```

### Navigation (12 instances)

```css
.navigatio {
  background-color: rgb(255, 255, 255);
  color: rgb(255, 255, 255);
  padding-top: 0px;
  padding-bottom: 0px;
  padding-left: 0px;
  padding-right: 0px;
  position: relative;
}
```

### Footer (32 instances)

```css
.foote {
  background-color: rgb(40, 54, 70);
  color: rgb(146, 152, 159);
  padding-top: 0px;
  padding-bottom: 0px;
  font-size: 18px;
}
```

### Modals (16 instances)

```css
.modal {
  background-color: rgba(0, 0, 0, 0.5);
  border-radius: 0px;
  padding-top: 0px;
  padding-right: 0px;
}
```

### Dropdowns (294 instances)

```css
.dropdown {
  background-color: rgb(255, 255, 255);
  border-radius: 0px;
  border-color: rgb(64, 64, 64);
  padding-top: 0px;
}
```

### Tables (1 instances)

```css
.table {
  border-color: rgb(0, 0, 0);
  cell-style: [object Object];
}
```

### Badges (7 instances)

```css
.badge {
  color: rgb(255, 212, 0);
  font-size: 13.8px;
  font-weight: 400;
  padding-top: 0px;
  padding-right: 0px;
  border-radius: 50%;
}
```

### Tabs (7 instances)

```css
.tab {
  background-color: rgb(13, 52, 100);
  color: rgb(255, 255, 255);
  font-size: 13.8px;
  font-weight: 400;
  padding-top: 2px;
  padding-right: 5px;
  border-color: rgb(13, 52, 100);
  border-radius: 10px;
}
```

### Accordions (4 instances)

```css
.accordion {
  color: rgb(0, 0, 0);
  font-size: 16px;
  padding-top: 0px;
  padding-right: 0px;
  border-color: rgb(0, 0, 0);
}
```

### Tooltips (4 instances)

```css
.tooltip {
  background-color: rgb(255, 255, 255);
  color: rgb(0, 0, 0);
  font-size: 16px;
  border-radius: 0px;
  padding-top: 0px;
  padding-right: 0px;
  box-shadow: rgba(0, 0, 0, 0.12) 0px 4px 16px 0px;
}
```

### Switches (2 instances)

```css
.switche {
  border-radius: 0px;
  border-color: rgb(0, 0, 0);
}
```

## Component Clusters

Reusable component instances grouped by DOM structure and style similarity:

### Input — 2 instances, 1 variant

**Variant 1** (2 instances)

```css
  background: rgb(255, 255, 255);
  color: rgb(85, 89, 92);
  padding: 8px 12px 8px 12px;
  border-radius: 12px;
  border: 1px solid rgba(0, 0, 0, 0.25);
  font-size: 16px;
  font-weight: 400;
```

### Button — 1 instance, 1 variant

**Variant 1** (1 instance)

```css
  background: rgba(0, 0, 0, 0);
  color: rgb(0, 0, 0);
  padding: 1px 6px 1px 0px;
  border-radius: 0px;
  border: 0px none rgb(0, 0, 0);
  font-size: 16px;
  font-weight: 400;
```

### Card — 24 instances, 1 variant

**Variant 1** (24 instances)

```css
  background: rgba(0, 0, 0, 0);
  color: rgb(0, 0, 0);
  padding: 0px 0px 0px 0px;
  border-radius: 0px;
  border: 0px none rgb(0, 0, 0);
  font-size: 16px;
  font-weight: 400;
```

### Button — 25 instances, 2 variants

**Variant 1** (24 instances)

```css
  background: rgb(255, 212, 0);
  color: rgb(0, 0, 0);
  padding: 1px 6px 1px 6px;
  border-radius: 5px;
  border: 0px none rgb(0, 0, 0);
  font-size: 16px;
  font-weight: 400;
```

**Variant 2** (1 instance)

```css
  background: rgb(14, 70, 80);
  color: rgb(255, 255, 255);
  padding: 0px 0px 0px 0px;
  border-radius: 0px;
  border: 0px none rgb(255, 255, 255);
  font-size: 16px;
  font-weight: 400;
```

### Button — 2 instances, 1 variant

**Variant 1** (2 instances)

```css
  background: rgba(0, 0, 0, 0);
  color: rgb(0, 0, 0);
  padding: 0px 0px 0px 0px;
  border-radius: 0px;
  border: 0px none rgb(0, 0, 0);
  font-size: 16px;
  font-weight: 400;
```

### Button — 6 instances, 5 variants

**Variant 1** (2 instances)

```css
  background: rgb(255, 212, 0);
  color: rgb(0, 0, 0);
  padding: 10px 20px 10px 20px;
  border-radius: 3px;
  border: 0px none rgb(0, 0, 0);
  font-size: 16px;
  font-weight: 400;
```

**Variant 2** (1 instance)

```css
  background: rgb(13, 52, 100);
  color: rgb(255, 255, 255);
  padding: 1px 6px 1px 6px;
  border-radius: 0px;
  border: 0px none rgb(255, 255, 255);
  font-size: 15px;
  font-weight: 400;
```

**Variant 3** (1 instance)

```css
  background: rgba(0, 0, 0, 0);
  color: rgb(255, 255, 255);
  padding: 1px 6px 1px 6px;
  border-radius: 0px;
  border: 1px solid rgb(255, 255, 255);
  font-size: 14px;
  font-weight: 700;
```

**Variant 4** (1 instance)

```css
  background: rgb(253, 251, 255);
  color: rgb(0, 0, 0);
  padding: 10px 20px 10px 20px;
  border-radius: 3px;
  border: 0px none rgb(0, 0, 0);
  font-size: 14px;
  font-weight: 100;
```

**Variant 5** (1 instance)

```css
  background: rgb(253, 251, 255);
  color: rgb(0, 0, 0);
  padding: 0px 0px 0px 0px;
  border-radius: 3px;
  border: 0px none rgb(0, 0, 0);
  font-size: 14px;
  font-weight: 700;
```

### Button — 1 instance, 1 variant

**Variant 1** (1 instance)

```css
  background: rgb(255, 255, 255);
  color: rgb(13, 52, 100);
  padding: 0px 0px 0px 0px;
  border-radius: 5px;
  border: 2px solid rgb(13, 52, 100);
  font-size: 16px;
  font-weight: 400;
```

### Button — 1 instance, 1 variant

**Variant 1** (1 instance)

```css
  background: rgba(0, 0, 0, 0);
  color: rgb(255, 255, 255);
  padding: 0px 0px 0px 0px;
  border-radius: 0px;
  border: 0px none rgb(255, 255, 255);
  font-size: 16px;
  font-weight: 400;
```

## Layout System

**6 grid containers** and **396 flex containers** detected.

### Container Widths

| Max Width | Padding |
|-----------|---------|
| 100% | 0px |
| 1124px | 0px |
| 970px | 20px |
| 1200px | 0px |

### Grid Column Patterns

| Columns | Usage Count |
|---------|-------------|
| 2-column | 2x |
| 4-column | 2x |
| 12-column | 1x |
| 5-column | 1x |

### Grid Templates

```css
grid-template-columns: 266px 266px 266px 266px;
gap: 20px;
grid-template-columns: 266px 266px 266px 266px;
gap: 20px;
grid-template-columns: 610px 610px;
gap: 20px;
grid-template-columns: 232px 232px 232px 232px 232px;
gap: 20px;
grid-template-columns: 246px 49.4688px 49.4688px 49.4688px 49.4688px 49.4688px 49.4688px 49.4688px 49.4688px 49.4688px 49.4688px 279.297px;
gap: 20px;
```

### Flex Patterns

| Direction/Wrap | Count |
|----------------|-------|
| row/nowrap | 294x |
| row/wrap | 8x |
| column/nowrap | 94x |

**Gap values:** `10px`, `12px`, `15px`, `20px`, `3px`, `5px`, `7px`, `8px`, `normal 13px`

## Accessibility (WCAG 2.1)

**Overall Score: 41%** — 24 passing, 34 failing color pairs

### Failing Color Pairs

| Foreground | Background | Ratio | Level | Used On |
|------------|------------|-------|-------|---------|
| `#ffffff` | `#007bff` | 3.98:1 | FAIL | li (34x) |

### Passing Color Pairs

| Foreground | Background | Ratio | Level |
|------------|------------|-------|-------|
| `#000000` | `#f0f0f0` | 18.43:1 | AAA |
| `#000000` | `#ffd400` | 14.67:1 | AAA |
| `#000000` | `#fdfbff` | 20.42:1 | AAA |
| `#0d3464` | `#fece00` | 8.3:1 | AAA |
| `#808080` | `#ffffff` | 3.95:1 | AA |
| `#283646` | `#ffffff` | 12.31:1 | AAA |
| `#ffffff` | `#0d3464` | 12.41:1 | AAA |

## Design System Score

**Overall: 67/100 (Grade: D)**

| Category | Score |
|----------|-------|
| Color Discipline | 80/100 |
| Typography Consistency | 50/100 |
| Spacing System | 70/100 |
| Shadow Consistency | 100/100 |
| Border Radius Consistency | 90/100 |
| Accessibility | 41/100 |
| CSS Tokenization | 100/100 |

**Strengths:** Clean elevation system, Consistent border radii, Good CSS variable tokenization

**Issues:**
- 10 font families — consider limiting to 2 (heading + body)
- 34 WCAG contrast failures
- 203 !important rules — prefer specificity over overrides
- 94% of CSS is unused — consider purging
- 5957 duplicate CSS declarations

## Gradients

**1 unique gradients** detected.

| Type | Direction | Stops | Classification |
|------|-----------|-------|----------------|
| linear | — | 2 | brand |

```css
background: linear-gradient(rgba(0, 0, 0, 0) 80%, rgb(255, 212, 0) 80%);
```

## Z-Index Map

**14 unique z-index values** across 4 layers.

| Layer | Range | Elements |
|-------|-------|----------|
| modal | 1030,2000 | div.c.o.n.t.a.i.n.e.r. .h.e.a.d.e.r.-.n.e.w, nav.m.e.n.u.-.c.a.t.e.g.o.r.i.e.s.-.b.a.r, div.d.f.d.-.r.o.o.t. .d.f.d.-.c.l.o.s.a.b.l.e |
| dropdown | 100,999 | div.c.u.s.t.o.m.e.r.-.c.a.r.e.-.t.o.o.l.t.i.p, div.o.v.e.r.l.a.y.-.m.e.n.u, div.h.e.a.d.e.r.-.m.e.n.u. .c.o.n.t.a.i.n.e.r.-.f.l.u.i.d |
| sticky | 10,30 | ul.p.r.o.d.u.c.t.-.f.l.a.g.s. .j.s.-.p.r.o.d.u.c.t.-.f.l.a.g.s, ul.p.r.o.d.u.c.t.-.f.l.a.g.s. .j.s.-.p.r.o.d.u.c.t.-.f.l.a.g.s, ul.p.r.o.d.u.c.t.-.f.l.a.g.s. .j.s.-.p.r.o.d.u.c.t.-.f.l.a.g.s |
| base | -1000,3 | span.s.w.i.p.e.r.-.n.o.t.i.f.i.c.a.t.i.o.n, div.s.w.i.p.e.r. .c.o.s.m.o.-.s.i.n.g.l.e.-.c.o.n.t.a.i.n.e.r, div.c.u.-.s.l.i.d.e.r. .c.u.-.s.l.i.d.e.r.-.t.w.o. .s.w.i.p.e.r.-.w.r.a.p.p.e.r |

## SVG Icons

**2 unique SVG icons** detected. Dominant style: **filled**.

| Size Class | Count |
|------------|-------|
| lg | 2 |

**Icon colors:** `rgb(0, 0, 0)`

## Font Files

| Family | Source | Weights | Styles |
|--------|--------|---------|--------|
| proxima-nova-black | self-hosted | 900 | normal |
| proxima-nova-bold | self-hosted | 700 | normal |
| proxima-nova-extrabold | self-hosted | 800 | normal |
| proxima-nova-thin | self-hosted | 100 | normal |
| proxima-nova-semibold | self-hosted | 600 | normal |
| proxima-nova-regular | self-hosted | 400 | normal |
| proxima-nova-light | self-hosted | 300 | normal |
| proxima-nova-medium | self-hosted | 500 | normal |
| montserrat-regular | self-hosted | 400 | normal |
| montserrat-thin | self-hosted | 100 | normal |
| montserrat-extra-light | self-hosted | 200 | normal |
| montserrat-light | self-hosted | 300 | normal |
| montserrat-medium | self-hosted | 500 | normal |
| montserrat-semibold | self-hosted | 600 | normal |
| montserrat-bold | self-hosted | 700 | normal |
| montserrat-extrabold | self-hosted | 800 | normal |
| montserrat-black | self-hosted | 900 | normal |
| poppins-bold | self-hosted | 700 | normal |
| swiper-icons | self-hosted | 400 | normal |
| Font Awesome 6 Brands | self-hosted | 400 | normal |
| Font Awesome 6 Free | self-hosted | 400, 900 | normal |
| Font Awesome 5 Brands | self-hosted | 400 | normal |
| Font Awesome 5 Free | self-hosted | 400, 900 | normal |
| FontAwesome | self-hosted | 400, normal | normal |
| Material Icons | self-hosted | 400 | normal |

## Image Style Patterns

| Pattern | Count | Key Styles |
|---------|-------|------------|
| thumbnail | 78 | objectFit: fill, borderRadius: 0px, shape: square |
| general | 16 | objectFit: fill, borderRadius: 0px, shape: square |
| hero | 2 | objectFit: cover, borderRadius: 10px, shape: rounded |

**Aspect ratios:** 1:1 (87x), 4:3 (2x), 2:1 (2x), 9.46:1 (1x), 9:16 (1x), 2.06:1 (1x), 2.14:1 (1x), 19.5:1 (1x)

## Motion Language

**Feel:** smooth · **Scroll-linked:** yes

### Duration Tokens

| name | value | ms |
|---|---|---|
| `xs` | `100ms` | 100 |
| `sm` | `200ms` | 200 |
| `md` | `300ms` | 300 |
| `lg` | `450ms` | 450 |

### Easing Families

- **ease-in-out** (77 uses) — `ease`
- **custom** (1 uses) — `cubic-bezier(0.4, 0, 0.2, 1)`

## Component Anatomy

### button — 36 instances

**Slots:** label, icon
**Variants:** tertiary · primary · secondary
**Sizes:** sm

| variant | count | sample label |
|---|---|---|
| tertiary | 24 |  |
| default | 8 | Categories |
| primary | 3 | Show more Products |
| secondary | 1 | Manage Consent Preferences |

### card — 24 instances

**Slots:** description, media, footer

### input — 2 instances


## Brand Voice

**Tone:** friendly · **Pronoun:** you-only · **Headings:** Sentence case (balanced)

### Top CTA Verbs

- **show** (4)
- **x** (2)
- **manage** (2)
- **categories** (1)
- **allow** (1)

### Button Copy Patterns

- "show more products" (4×)
- "x" (2×)
- "categories" (1×)
- "manage consent preferences allow all" (1×)
- "manage consent preferences" (1×)
- "allow all" (1×)

### Sample Headings

> 
              
                                  100mg/100ml - decongestant nasal spray 15 ml
                              
            
> 
              
                                  Yovis caps - probiotic supplement 20 capsules
                              
            
> 
              
                                  Moisturising cream for dry to very dry skin 454 g
                              
            
> 
              
                                  Hyalu b5 - moisturizing face cream in a 50 ml jar
                              
            
> 
              
                                  Aminexil clinical r.e.g.e.n. booster - hair renewal serum 90 ml
                              
            
> 
              
                                  100mg/100ml - decongestant nasal spray 15 ml
                              
            
> 
              
                                  Yovis caps - probiotic supplement 20 capsules
                              
            
> 
              
                                  Moisturising cream for dry to very dry skin 454 g
                              
            
> 
              
                                  Hyalu b5 - moisturizing face cream in a 50 ml jar
                              
            
> 
              
                                  Aminexil clinical r.e.g.e.n. booster - hair renewal serum 90 ml
                              
            

## Page Intent

**Type:** `landing` (confidence 0.31)
**Description:** Shop Health & Beauty exclusive products at Farmacosmo! Discover great prices in healthcare, beauty, skincare and make up. Discover our best deals today.

Alternates: blog-post (0.35)

## Section Roles

Reading order (top→bottom): pricing-table → nav → sidebar → nav → nav → pricing-table → sidebar → pricing-table → pricing-table → gallery → content → content → pricing-table → pricing-table → content → pricing-table → pricing-table → pricing-table → pricing-table → faq → testimonials → steps → footer → footer

| # | Role | Heading | Confidence |
|---|------|---------|------------|
| 0 | pricing-table | 
              
                                  100mg/100ml - decongestant nas | 0.9 |
| 1 | nav | 
              
                                  100mg/100ml - decongestant nas | 0.4 |
| 2 | sidebar | 
              
                                  100mg/100ml - decongestant nas | 0.4 |
| 3 | nav | 
              
                                  100mg/100ml - decongestant nas | 0.9 |
| 4 | nav | — | 0.9 |
| 5 | pricing-table | Farmacosmo: Your Online Parapharmacy | 0.9 |
| 6 | sidebar | — | 0.4 |
| 7 | pricing-table | Farmacosmo: Your Online Parapharmacy | 0.9 |
| 8 | pricing-table | Farmacosmo: Your Online Parapharmacy | 0.9 |
| 9 | gallery | — | 0.7 |
| 10 | content | Farmacosmo: Your Online Parapharmacy | 0.3 |
| 11 | content | Featured categories | 0.3 |
| 12 | pricing-table | Must-haves for your well-being | 0.9 |
| 13 | pricing-table | Must-haves for your well-being | 0.9 |
| 14 | content | Categories to discover | 0.3 |
| 15 | pricing-table | The products most chosen by customers | 0.9 |
| 16 | pricing-table | The products most chosen by customers | 0.9 |
| 17 | pricing-table | Bestseller for your daily routine | 0.9 |
| 18 | pricing-table | Bestseller for your daily routine | 0.9 |
| 19 | faq | Frequently asked questions | 0.85 |

## Material Language

**Label:** `flat` (confidence 0)

| Metric | Value |
|--------|-------|
| Avg saturation | 0.28 |
| Shadow profile | soft |
| Avg shadow blur | 0px |
| Max radius | 50px |
| backdrop-filter in use | no |
| Gradients | 1 |

## Imagery Style

**Label:** `photography` (confidence 0.094)
**Counts:** total 96, svg 68, icon 83, screenshot-like 0, photo-like 18
**Dominant aspect:** square-ish
**Radius profile on images:** square

## Component Library

**Detected:** `bootstrap` (confidence 0.6)

Evidence:
- bootstrap utility hits: 3

## Component Screenshots

15 retina crops written to `screenshots/`. Index: `*-screenshots.json`.

| Cluster | Variant | Size (px) | File |
|---------|---------|-----------|------|
| input--default | 0 | 675 × 52 | `screenshots/input-default-0.png` |
| input--default | 1 | 220 × 34 | `screenshots/input-default-1.png` |
| button--default | 0 | 131 × 38 | `screenshots/button-default-0.png` |
| button--default | 1 | 1124 × 44 | `screenshots/button-default-1.png` |
| button--default | 2 | 22 × 64 | `screenshots/button-default-2.png` |
| card--default | 0 | 224 × 366 | `screenshots/card-default-0.png` |
| card--default | 1 | 224 × 366 | `screenshots/card-default-1.png` |
| card--default | 2 | 224 × 366 | `screenshots/card-default-2.png` |
| button--tertiary | 0 | 40 × 40 | `screenshots/button-tertiary-0.png` |
| button--tertiary | 1 | 40 × 40 | `screenshots/button-tertiary-1.png` |
| button--tertiary | 2 | 40 × 40 | `screenshots/button-tertiary-2.png` |
| button--primary | 0 | 186 × 44 | `screenshots/button-primary-0.png` |
| button--primary | 1 | 186 × 44 | `screenshots/button-primary-1.png` |
| button--secondary--sm | 0 | 300 × 40 | `screenshots/button-secondary-sm-0.png` |
| button--primary--sm | 0 | 300 × 40 | `screenshots/button-primary-sm-0.png` |

Full-page: `screenshots/full-page.png`

## Quick Start

To recreate this design in a new project:

1. **Install fonts:** Add `proxima-nova-regular` from Google Fonts or your font provider
2. **Import CSS variables:** Copy `variables.css` into your project
3. **Tailwind users:** Use the generated `tailwind.config.js` to extend your theme
4. **Design tokens:** Import `design-tokens.json` for tooling integration
