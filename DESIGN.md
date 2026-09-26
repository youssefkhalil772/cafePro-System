---
name: Precision CMMS
colors:
  surface: '#f7f9fb'
  surface-dim: '#d8dadc'
  surface-bright: '#f7f9fb'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f4f6'
  surface-container: '#eceef0'
  surface-container-high: '#e6e8ea'
  surface-container-highest: '#e0e3e5'
  on-surface: '#191c1e'
  on-surface-variant: '#45464d'
  inverse-surface: '#2d3133'
  inverse-on-surface: '#eff1f3'
  outline: '#76777d'
  outline-variant: '#c6c6cd'
  surface-tint: '#565e74'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#131b2e'
  on-primary-container: '#7c839b'
  inverse-primary: '#bec6e0'
  secondary: '#515f74'
  on-secondary: '#ffffff'
  secondary-container: '#d5e3fd'
  on-secondary-container: '#57657b'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#002109'
  on-tertiary-container: '#009844'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dae2fd'
  primary-fixed-dim: '#bec6e0'
  on-primary-fixed: '#131b2e'
  on-primary-fixed-variant: '#3f465c'
  secondary-fixed: '#d5e3fd'
  secondary-fixed-dim: '#b9c7e0'
  on-secondary-fixed: '#0d1c2f'
  on-secondary-fixed-variant: '#3a485c'
  tertiary-fixed: '#6bff8f'
  tertiary-fixed-dim: '#4ae176'
  on-tertiary-fixed: '#002109'
  on-tertiary-fixed-variant: '#005321'
  background: '#f7f9fb'
  on-background: '#191c1e'
  surface-variant: '#e0e3e5'
typography:
  headline-lg:
    fontFamily: Inter
    fontSize: 30px
    fontWeight: '700'
    lineHeight: 38px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
  mono-data:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 18px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 4px
  container-margin: 24px
  gutter: 16px
  stack-sm: 8px
  stack-md: 16px
  stack-lg: 32px
---

## Brand & Style

The design system is engineered for industrial reliability and operational efficiency. It serves maintenance managers, technicians, and facility operators who require a high-trust interface to manage complex physical assets and time-sensitive workflows.

The aesthetic follows a **Corporate / Modern** approach with a strong emphasis on functional minimalism. It prioritizes data density without sacrificing legibility. The emotional response should be one of "controlled command"—users should feel that the system is an extension of their own technical precision. Visual elements are kept lean to ensure the focus remains on status indicators, asset health, and task completion.

## Colors

The palette is anchored in a professional range of navies and slates to convey stability and institutional trust. 

- **Primary (#0F172A):** Deep Navy. Used for navigation, high-level headers, and primary actions. It provides the strongest visual anchor.
- **Secondary (#334155):** Slate Blue. Used for secondary UI elements, iconography, and text labels that require lower emphasis than the primary headers.
- **Success (#22C55E):** Maintenance Green. Reserved strictly for "Healthy" asset status, "Completed" work orders, and positive system confirmations.
- **Neutral (#F8FAFC):** Slate White. Used for background surfaces to keep the interface airy and allow the dark typography to pop.
- **Warning/Critical:** Use a bright amber (#F59E0B) for pending alerts and a vivid red (#EF4444) for equipment failures or overdue tasks.

## Typography

This design system utilizes **Inter** exclusively to ensure maximum readability and a systematic feel. 

For data-heavy tables and asset IDs, ensure the `tnum` (tabular numbers) OpenType feature is enabled so that numerical values align vertically, aiding quick comparison of costs, hours, and serial numbers. Body-md is the default size for all form inputs and general content. Use label-md for table headers and small metadata tags.

## Layout & Spacing

The system uses a **Fluid Grid** with fixed-width sidebars for navigation. 

- **Desktop:** 12-column grid with 16px gutters. The primary navigation is a 240px wide sidebar on the left.
- **Tablet:** 8-column grid with 16px gutters. Navigation collapses to an icon-only rail (64px).
- **Mobile:** 4-column grid with 12px gutters. Navigation moves to a bottom bar or hamburger menu.

Spacing follows a strict 4px base unit. Ample whitespace should be used between logical sections (e.g., Asset Details vs. Maintenance History) to prevent the "wall of data" effect common in legacy CMMS software.

## Elevation & Depth

This design system uses **Low-contrast outlines** combined with **Tonal layers** to establish hierarchy. 

Shadows are used sparingly, reserved only for temporary overlays like modals or dropdown menus. To distinguish between the background and content containers, use a 1px border (#E2E8F0). 

- **Surface Level 0:** The main application background (#F8FAFC).
- **Surface Level 1:** White (#FFFFFF) cards or containers for primary content, using a subtle 1px border.
- **Surface Level 2:** Slightly darker tint (#F1F5F9) for embedded sections like table headers or nested metadata panels.

## Shapes

The shape language is **Soft** (0.25rem / 4px). This subtle rounding maintains a professional, rigid industrial feel while appearing modern and accessible.

- **Buttons & Inputs:** 4px radius.
- **Cards & Modals:** 8px (rounded-lg) for larger containers to differentiate structural areas from interactive elements.
- **Status Badges:** Fully rounded (pill) to clearly distinguish them from buttons and input fields.

## Components

### Buttons
- **Primary:** Solid #0F172A with white text. High contrast for main actions like "Create Work Order".
- **Secondary:** Transparent with #334155 border and text. Used for "Cancel" or "Export".
- **Action Icons:** 16px icons within 32px touch targets for density in data tables.

### Input Fields
- Use a 1px border (#CBD5E1). On focus, the border shifts to the primary color with a 2px soft outer glow. Labels are always persistent above the field.

### Status Chips
- Small, pill-shaped indicators. Text is bold and all-caps.
- *Open:* Blue background, dark blue text.
- *In Progress:* Amber background, dark amber text.
- *Completed:* Green background, dark green text.

### Data Tables
- Use Zebra striping on hover only. 
- Row height: 48px for standard density, 40px for high-density views.
- Headers are sticky and use the Surface Level 2 background.

### Cards
- Use for grouping asset information. Every card must have a clear 1px border and a defined header section to separate titles from body content.