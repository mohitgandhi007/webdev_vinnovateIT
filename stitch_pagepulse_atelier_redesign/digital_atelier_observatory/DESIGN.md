---
name: Digital Atelier Observatory
colors:
  surface: '#fcf9f2'
  surface-dim: '#dcdad3'
  surface-bright: '#fcf9f2'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f6f3ec'
  surface-container: '#f1eee7'
  surface-container-high: '#ebe8e1'
  surface-container-highest: '#e5e2db'
  on-surface: '#1c1c18'
  on-surface-variant: '#46483d'
  inverse-surface: '#31312c'
  inverse-on-surface: '#f3f0e9'
  outline: '#77786c'
  outline-variant: '#c7c7ba'
  surface-tint: '#5a623a'
  primary: '#576038'
  on-primary: '#ffffff'
  primary-container: '#70794e'
  on-primary-container: '#fcffe3'
  inverse-primary: '#c2cb9a'
  secondary: '#795827'
  on-secondary: '#ffffff'
  secondary-container: '#ffd397'
  on-secondary-container: '#7a5928'
  tertiary: '#625b53'
  on-tertiary: '#ffffff'
  tertiary-container: '#7c736b'
  on-tertiary-container: '#fffbff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dee8b4'
  primary-fixed-dim: '#c2cb9a'
  on-primary-fixed: '#171e01'
  on-primary-fixed-variant: '#424a24'
  secondary-fixed: '#ffddb2'
  secondary-fixed-dim: '#eabf85'
  on-secondary-fixed: '#291800'
  on-secondary-fixed-variant: '#5e4112'
  tertiary-fixed: '#ece0d7'
  tertiary-fixed-dim: '#cfc5bc'
  on-tertiary-fixed: '#201b15'
  on-tertiary-fixed-variant: '#4d463f'
  background: '#fcf9f2'
  on-background: '#1c1c18'
  surface-variant: '#e5e2db'
typography:
  headline-xl:
    fontFamily: Bodoni Moda
    fontSize: 56px
    fontWeight: '400'
    lineHeight: 64px
    letterSpacing: -0.02em
  headline-xl-mobile:
    fontFamily: Bodoni Moda
    fontSize: 36px
    fontWeight: '400'
    lineHeight: 44px
    letterSpacing: -0.01em
  headline-lg:
    fontFamily: Bodoni Moda
    fontSize: 40px
    fontWeight: '400'
    lineHeight: 48px
    letterSpacing: -0.015em
  headline-lg-mobile:
    fontFamily: Bodoni Moda
    fontSize: 28px
    fontWeight: '400'
    lineHeight: 36px
  headline-md:
    fontFamily: Bodoni Moda
    fontSize: 28px
    fontWeight: '500'
    lineHeight: 36px
  headline-sm:
    fontFamily: Bodoni Moda
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: DM Sans
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: DM Sans
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: DM Sans
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 20px
  label-md:
    fontFamily: IBM Plex Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.04em
  label-sm:
    fontFamily: IBM Plex Mono
    fontSize: 11px
    fontWeight: '400'
    lineHeight: 14px
    letterSpacing: 0.06em
  telemetry-data:
    fontFamily: IBM Plex Mono
    fontSize: 13px
    fontWeight: '600'
    lineHeight: 18px
rounded:
  sm: 0.5rem
  DEFAULT: 1rem
  md: 1.5rem
  lg: 2rem
  xl: 3rem
  full: 9999px
spacing:
  gutter: 1.5rem
  gutter-sm: 1rem
  gutter-lg: 2.5rem
  margin: 3rem
  margin-mobile: 1.25rem
  margin-desktop: 4rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 3rem
---

## Brand & Style

The design system embodies the ethos of a master horologist or classical cartographer transposed into software: an editorial, boutique website monitoring observatory. It caters to discerning digital directors, brand custodians, and meticulous product archivists who view web properties not merely as operational endpoints, but as living publications requiring mindful curation.

The visual style merges classical magazine editorialism with precision telemetry instrumentation:
- **Atmospheric Warmth**: Built upon textured physical papers—ivory, pale oatmeal, and soft cream—evoking an archive reading room rather than a sterile control room.
- **Typographic Authority**: High-contrast modern serifs paired with understated geometric sans and rigid monospaced data ribbons create intentional friction between timeless prose and real-time computation.
- **Architectural Discipline**: Strict avoidance of standard SaaS dashboard conventions (such as left-hand navigation drawers). Interfaces are anchored by horizontal ledgers, floating command docks, and delicate rules resembling hot-metal print layouts.

## Colors

The palette operates under an 85–90% ambient wash of warm, tactile surfaces, punctuated by ink tones and vegetal mineral pigments.

### Surface Tiers
- **Canvas Base (`#F6F3EC` Warm Ivory)**: The grounding layer of the entire viewport, providing warmth and reducing eye strain.
- **Navigation Deck (`#EDE7DB` Pale Oatmeal)**: Distinct, tactile surface reserved for primary headers, sticky status rails, and master controls.
- **Document Plinth (`#FFFEFA` Soft Cream)**: Used sparingly for high-focus viewports, diff comparisons, and expanded inspector sheets.
- **Recessed Surface (`#E8E0D2` Warm Beige)**: Applied to inactive tool trays, code blocks, and contextual metadata wells.

### Ink & Structure
- **Espresso (`#302A24`)**: Primary ink for headlines, body text, and active icon strokes. Never use pure `#000000`.
- **Warm Grey (`#797267`)**: Subdued secondary text for metadata labels, captions, and secondary actions.
- **Sandstone (`#DED6C9`)**: Structural hairpins and 1px grid dividers. All structural hierarchy relies primarily on this shade.

### Mineral Accents
- **Muted Olive (`#747D52`)**: Primary interactive states, active monitoring indicators, and positive diff insertions.
- **Antique Brass (`#B18B55`)**: Premium intelligence callouts, saved snapshots, and high-value alerts.
- **Functional States**: Success (`#477452` Forest Green), Alert (`#A66A2C` Burnt Ochre), and Critical Disruption (`#B65F4A` Muted Terracotta).

## Typography

The typographic hierarchy establishes clear divisions between editorial storytelling, functional interface navigation, and cold telemetry data.

### Typographic Roles
- **Bodoni Moda (Headlines & Editorial Focus)**: High contrast, vertical stress, and expressive italics. Used for page titles, site audit summaries, and high-level change reports.
- **DM Sans (Interface Body & Forms)**: Low contrast, balanced proportions, and open counters. Delivers effortless legibility across dense audit logs, form groups, and descriptions.
- **IBM Plex Mono (Telemetry & Structural Metadata)**: Strict monospace alignment used exclusively for URIs, HTTP response codes, latency timings, diff percentages, and timestamps.
- **Calligraphic Flourishes (Italianno / Ballet)**: Strictly capped at 5% visual real estate. Permitted only for isolated decorative watermarks, section markers (e.g., *"Observed at dawn"*), or quiet archival flourishes. Never use for actionable UI labels.

## Layout & Spacing

Layouts reject standard enterprise dashboard grids in favor of asymmetrical editorial spreads and ledger-like data alignment.

### Grid & Composition
- **Desktop (12 Columns, Fluid)**: Outer canvas margins of `4rem` with asymmetrical balancing (e.g., 4 columns for page narrative, 8 columns for visual telemetry inspector).
- **Tablet (8 Columns, Fluid)**: Outer margins collapse to `2rem`, gutters to `1.5rem`.
- **Mobile (4 Columns, Fluid)**: Single unified vertical ledger with `1.25rem` outer margins.

### Navigation Architecture
- **Prohibited**: Permanent left vertical sidebars. 
- **Top Ledger**: A horizontal utility ribbon conforming to `Pale Oatmeal` containing brand identity, workspace selector, global search, and system health status.
- **Floating Command Dock**: Centered horizontally at the viewport bottom, containing primary page actions (e.g., *Snapshot Now*, *Compare Revisions*, *Filter Noise*) anchored inside a sand-bordered pill.

## Elevation & Depth

Spatial relationships are communicated through physical paper layering and delicate 1px line work rather than blurred shadows.

### The Low-Contrast Structural Paradigm
- **Drop Shadows Prohibited**: Avoid heavy, multi-stop fuzzy black or grey drop shadows. Surfaces do not float high above one another; they rest like heavy parchment sheets on a drafting table.
- **Sandstone Hairlines**: Layers are segregated by `1px solid #DED6C9`. Sub-panels and inspector trays use border separation directly adjacent to one another.
- **Paper Stacking Depth**:
  - *Tier 0 (Base Canvas)*: `#F6F3EC` Warm Ivory.
  - *Tier 1 (Surface Trays & Panels)*: `#FFFEFA` Soft Cream bordered with 1px Sandstone.
  - *Tier 2 (Floating Command Dock)*: `#EDE7DB` Pale Oatmeal accompanied by an ultra-subtle, ambient contact shadow: `box-shadow: 0 4px 20px -2px rgba(48, 42, 36, 0.08)`.

## Shapes

The design system maintains generous, pill-shaped curves while preserving clean architectural definition. Elements feel exceptionally smooth, tactile, and bookbound with softened silhouettes.

- **Base Radius (`1rem` / `16px`)**: Buttons, input fields, notification chips, and telemetry data blocks feature pill-inspired soft corners that provide a modern yet tactile profile.
- **Cards & Data Wells (`rounded-lg` / `2rem` / `32px`)**: Container plinths and change audit panels.
- **Command Pill Exception**: Floating dock containers and solitary status badge pills use full-height rounded profiles to stand out as physical instruments resting on the page.

## Components

### Buttons
- **Primary Action**: Solid `#302A24` (Espresso) background, `#F6F3EC` text, pill-shaped roundedness. Hover shifts to `#747D52` (Muted Olive) with smooth 150ms transitions.
- **Secondary Action**: Background transparent, border `1px solid #DED6C9`, text `#302A24`. Hover brings a `#EDE7DB` paper tint.
- **Observatory Icon Action**: 36x36px square with 1px Sandstone border, no background, containing 16px geometric glyphs.

### Chips & Telemetry Badges
- Rendered exclusively using `IBM Plex Mono` (`label-sm`).
- High-density, low-height pads (`2px 8px`).
- Inactive / Normal: Background `#E8E0D2`, Text `#797267`.
- Live Delta Add: Background `#477452` at 10% opacity, Text `#477452`, with a leading `+` glyph.
- Critical Anomaly: Background `#B65F4A` at 10% opacity, Text `#B65F4A`.

### Lists & Ledger Rows
- Replaces traditional rounded card grids with continuous ledger tables.
- Rows separated by `1px solid #DED6C9`.
- Row height: generous `56px` minimum padding to support spacious typography.
- Alternating subtle background transitions (`#FFFEFA` to `#F6F3EC`) on hover to indicate inspection focus.

### Input Fields
- Understated architectural slots: Background `#FFFEFA`, border `1px solid #DED6C9`, text `#302A24`.
- Typography: `body-md` for user query; placeholder styled in `Warm Grey` italic serif.
- Focus State: Border color transitions directly to `#747D52` (Muted Olive) with an inset `1px` outline; no glowing blue halos.

### Checkboxes & Radios
- Small, precise `14px` squares or circles.
- Border: `1.5px solid #797267`. Checked state fills with `#302A24` and displays a crisp parchment-colored check or dot.

### Change Diff Inspector Card
- The hallmark component for page visual regressions.
- Split screen or overlay framed in a 1px Sandstone border on `#FFFEFA` Soft Cream plinth.
- Top bar displays timestamp, DOM change count, and HTTP status via `IBM Plex Mono` on a `#EDE7DB` background strip.