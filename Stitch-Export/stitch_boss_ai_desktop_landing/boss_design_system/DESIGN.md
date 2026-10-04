---
name: BOSS Design System
colors:
  surface: '#101419'
  surface-dim: '#101419'
  surface-bright: '#363940'
  surface-container-lowest: '#0b0e14'
  surface-container-low: '#181c22'
  surface-container: '#1c2026'
  surface-container-high: '#262a31'
  surface-container-highest: '#31353c'
  on-surface: '#e0e2eb'
  on-surface-variant: '#bbc9ce'
  inverse-surface: '#e0e2eb'
  inverse-on-surface: '#2d3137'
  outline: '#859398'
  outline-variant: '#3c494d'
  surface-tint: '#00d9ff'
  primary: '#afecff'
  on-primary: '#003641'
  primary-container: '#00d9ff'
  on-primary-container: '#005b6c'
  inverse-primary: '#00687b'
  secondary: '#cfbdff'
  on-secondary: '#3a0093'
  secondary-container: '#5614c8'
  on-secondary-container: '#c2acff'
  tertiary: '#6bfe8f'
  on-tertiary: '#003915'
  tertiary-container: '#4ae176'
  on-tertiary-container: '#006028'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#aeecff'
  primary-fixed-dim: '#00d9ff'
  on-primary-fixed: '#001f26'
  on-primary-fixed-variant: '#004e5d'
  secondary-fixed: '#e9ddff'
  secondary-fixed-dim: '#cfbdff'
  on-secondary-fixed: '#22005d'
  on-secondary-fixed-variant: '#530dc6'
  tertiary-fixed: '#6bff8f'
  tertiary-fixed-dim: '#4ae176'
  on-tertiary-fixed: '#002109'
  on-tertiary-fixed-variant: '#005321'
  background: '#101419'
  on-background: '#e0e2eb'
  surface-variant: '#31353c'
typography:
  display-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 40px
    fontWeight: '700'
    lineHeight: 48px
    letterSpacing: -0.03em
  display-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 30px
    fontWeight: '700'
    lineHeight: 38px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 30px
    letterSpacing: -0.015em
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 26px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: -0.005em
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: 0em
  body-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 18px
    letterSpacing: 0.01em
  label-code-md:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 18px
    letterSpacing: -0.01em
  label-code-sm:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-caps:
    fontFamily: JetBrains Mono
    fontSize: 10px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.08em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-desktop: 1.5rem
  margin: 1rem
  margin-desktop: 2rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1.25rem
  space-xl: 2rem
  space-2xl: 3rem
---

## Brand & Style

This design system delivers a calm, developer-first architecture rooted in local-first principles and deep obsidian aesthetics. It rejects superficial "gamer RGB" excesses in favor of precise optical balance, razor-sharp hairline framing, and smoked glass elevations. Designed for power users, systems engineers, and technical creators, the interface acts as an ergonomic, non-fatiguing cockpit for prolonged deep work sessions.

### Design Movement: Obsidian Smoked Glass & Structural Minimalism
The visual language synthesizes two core approaches:
- **Obsidian Smoked Glass:** Layered translucent surfaces hovering over deep space, utilizing subtle optical blur, hairline specular edges, and muted surface light dissipation.
- **Structural Minimalism:** Monolithic typography, rigorous alignment, strict information density hierarchies, and purposeful micro-doses of luminescent cyan and electric violet strictly reserved for state changes and high-signal data.

## Colors

The chromatic palette centers on pure obsidian foundations paired with restrained, laser-focused luminescent accents.

### Core Canvas & Surfaces
- **Obsidian Black (`#020408`):** The foundational substrate. Absorbs light and frames floating utility surfaces.
- **Deep Glass (`#070C12`):** Primary canvas surface layer for persistent sidebars, terminal shells, and master containers (with 80%–92% alpha tinting in frosted contexts).
- **Elevated Glass (`#0B111A`):** Floating modals, contextual menus, tooltips, and elevated card structures.
- **Hairline Border (`#16202E` / `rgba(242, 246, 250, 0.08)`): Delimiting vector lines separating structural planes without creating visual visual clutter.

### Accents & Semantic Hierarchy
- **BOSS Cyan (`#00D9FF`):** The focal primary accent. Applied sparingly for active focus rings, execution indicators, primary CTA outlines, and live telemetry ticks.
- **Electric Violet (`#8B5CFF`):** Secondary structural accent. Used for secondary operations, AI synthesis states, branch identifiers, and compilation badges.
- **Success (`#22C55E`):** Node online, tests passing, zero exit codes.
- **Warning (`#F59E0B`):** Local cache dirty, synchronization delay, impending rate limits.
- **Error (`#EF4444`):** Fatal exceptions, broken pipelines, disconnect states.

### Contrast & Legibility Rules
- **Primary Text (`#F2F6FA`):** Near white with a 2% blue tint to mitigate harsh eye fatigue on pitch-black screens.
- **Secondary Text (`#8A96A6`):** Muted cool gray for timestamps, secondary headers, metadata keys, and inactive icon states.
- Never use full `#00D9FF` or `#8B5CFF` as flood fill backgrounds for large rectangular surfaces. Use them as sharp 1px accents, glowing indicators, or transparent badge fills (`rgba(0, 217, 255, 0.08)`).

## Typography

Typography balances geometric ergonomic clarity with absolute monospaced technical precision.

- **Plus Jakarta Sans:** Drives all human communication, navigation, headers, and UI prose. With geometric proportions and wide aperatures, it stays comfortable during extended viewing.
- **JetBrains Mono:** Governs machine-readable entities: code snippets, execution metrics, hex addresses, local database file paths, keybindings, and status chips.

### Hierarchy & Style Principles
1. **Numbers and Data:** Never render timestamps, memory footprints, or latency figures in Plus Jakarta Sans. Always assign `label-code-sm` or `label-code-md` to avoid shifting column widths.
2. **Uppercase Labels:** The `label-caps` token is reserved strictly for column section markers, panel breadcrumbs, and subsystem indicators, always paired with a muted tone (`#8A96A6`).

## Layout & Spacing

This design system employs an adaptable developer workbench layout. The grid balances split-screen technical utilities with responsive horizontal spans.

### Layout Model
- **Workbench Multi-Pane Shell:** An ultra-compact layout model featuring an expandable 56px–240px primary activity bar, fluid multi-column split panes for editor/terminal views, and an optional 320px telemetry inspector pane.
- **Grid Strategy:** When rendering operational dashboards or repository feeds, a 12-column responsive fluid grid applies, constrained to a maximum content width of 1600px with centered docking.
- **Gutters & Padding:** Rigid 8pt rhythm. Component interiors favor condensed padding (`space-xs` to `space-md`) to ensure high information density without visual crowding.

### Screen Adaptations
- **Mobile (< 768px):** Panes collapse into a unified stack with bottom-sheet modals. Activity bar switches to a compact 48px horizontal bottom dock. Outer margin contracts to `margin` (1rem).
- **Tablet (768px - 1024px):** Two-pane layout with collapsable inspector pane. Fluid gutters set to `gutter` (1rem).
- **Desktop (> 1024px):** Full persistent multi-pane workspace with live resize handles, `gutter-desktop` (1.5rem) and `margin-desktop` (2rem).

## Elevation & Depth

Visual hierarchy does not use diffuse, warm drop shadows. Instead, it relies on tinted smoked glass surfaces, backdrop filters, and subtle hairline borders.

### Surface Elevation Tiers
1. **Base Zero (Ground Plane - `#020408`):** Underlying workspace canvas, viewport gutters, and terminal host shells.
2. **Level 1 (Deep Smoked Glass):** `#070C12` with 88% opacity, coupled with `backdrop-filter: blur(12px)` and a 1px solid border of `rgba(242, 246, 250, 0.06)`. Used for sidebars, bottom consoles, and secondary toolbars.
3. **Level 2 (Elevated Smoked Glass):** `#0B111A` with 92% opacity, `backdrop-filter: blur(20px)`, and a 1px border of `rgba(242, 246, 250, 0.12)`. Used for cards, detached toolbars, and tab groups.
4. **Level 3 (Floating Overlays):** `#0F1724` with 96% opacity, supported by a specialized specular rim highlight: `box-shadow: inset 0 1px 0 0 rgba(255, 255, 255, 0.1), 0 16px 36px -8px rgba(0, 0, 0, 0.8)`. Used for command palettes, drop menus, and contextual modals.

### Accent Aura System
Interactive focus or selected active states emit a faint, targeted specular glow rather than a blurry halo:
- **Cyan Focus:** `box-shadow: 0 0 0 1px #00D9FF, 0 0 14px rgba(0, 217, 255, 0.25)`
- **Violet Focus:** `box-shadow: 0 0 0 1px #8B5CFF, 0 0 14px rgba(139, 92, 255, 0.25)`

## Shapes

Roundedness token level **2** provides clean geometry balanced by soft container corners, giving the interface a precise, modern feel.

### Geometric Scale
- **Micro Radii (`rounded-sm` / 4px):** Form inputs, code blocks, small action pills, telemetry badges, and inline status chips.
- **Base Radii (`rounded-md` / 8px):** Standard buttons, list rows, context menus, and tooltips.
- **Container Radii (`rounded-lg` / 16px):** Workspace cards, code inspection panels, modal windows, and flyout drawer headers.
- **Structural Framing:** Borders must consistently measure 1px. Avoid 2px or thicker strokes except for focus rings.

## Components

### Buttons
- **Primary Action:** Solid BOSS Cyan (`#00D9FF`) text on an obsidian surface framed with a 1px `#00D9FF` border and subtle background fill `rgba(0, 217, 255, 0.08)`. On hover: surface transitions to `rgba(0, 217, 255, 0.16)` with focus rim glow. Active press scales down slightly (`scale(0.98)`).
- **Secondary Action:** Translucent Deep Glass (`rgba(7, 12, 18, 0.8)`) with `rgba(242, 246, 250, 0.1)` border and `#F2F6FA` text. Hover shifts border to `rgba(242, 246, 250, 0.25)`.
- **Ghost / Utility:** Transparent background, muted text (`#8A96A6`), shifting to `#F2F6FA` on hover with a faint `#0B111A` background plate.

### Cards & Panels
- **Structure:** Level 2 Elevated Glass (`#0B111A`) with 16px radius (`rounded-lg`), 1px hairline border in `rgba(242, 246, 250, 0.08)`.
- **Interactive State:** Hover elevates border brightness to `rgba(0, 217, 255, 0.3)` while keeping the background stable, reinforcing responsive feedback without screen flashing.

### Input Fields & Search Bars
- **Style:** Smoked Deep Glass fill (`#070C12`) with 8px radius (`rounded-md`), `label-code-md` typography, and a 1px border of `rgba(242, 246, 250, 0.1)`.
- **Focus:** Instant transition to a 1px `#00D9FF` border with a subtle 6px cyan ambient bleed (`rgba(0, 217, 255, 0.2)`). Caret is locked to `#00D9FF`.

### Chips & Telemetry Tags
- **Structure:** 4px radius (`rounded-sm`), 4px horizontal padding, 2px vertical padding. Typography set to `label-code-sm`.
- **Variants:**
  - *Engine Live:* `rgba(34, 197, 94, 0.1)` background, `#22C55E` border, `#22C55E` text.
  - *Branch / Version:* `rgba(139, 92, 255, 0.1)` background, `#8B5CFF` border, `#8B5CFF` text.
  - *Metric Readout:* `rgba(242, 246, 250, 0.05)` background, `#16202E` border, `#8A96A6` text.

### Selection Controls (Checkboxes & Radios)
- **Checkboxes:** 16x16px square with 4px border radius. Unselected: 1px border `#8A96A6`. Selected: `#00D9FF` border with `#00D9FF` fill and pure `#020408` check vector.
- **Radio Buttons:** 16x16px circle with identical stroke logic; inner dot is a 6px centered `#00D9FF` solid circle.

### Local-First Data Tables & Tree Lists
- **Rows:** Minimum height 36px for dense list views; alternating rows maintain uniform `#020408` canvas to avoid striped contrast clutter.
- **Hover/Selection:** Hover uses `rgba(242, 246, 250, 0.03)` surface highlight; selected rows trigger a 2px left border accent in `#00D9FF` alongside a background of `rgba(0, 217, 255, 0.04)`.

### Command Palette (Spotlight Interface)
- Floating Level 3 modal centered at the top third of the viewport. Width 640px, backdrop blur 24px, 16px radius. Includes integrated search input with `JetBrains Mono` shortcuts (`⌘K`, `ESC`) rendered in muted hairline keycap boxes.