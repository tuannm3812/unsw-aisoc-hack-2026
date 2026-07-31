---
name: NexusFlow
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
  on-surface-variant: '#464555'
  inverse-surface: '#2d3133'
  inverse-on-surface: '#eff1f3'
  outline: '#777587'
  outline-variant: '#c7c4d8'
  surface-tint: '#4d44e3'
  primary: '#3525cd'
  on-primary: '#ffffff'
  primary-container: '#4f46e5'
  on-primary-container: '#dad7ff'
  inverse-primary: '#c3c0ff'
  secondary: '#006c49'
  on-secondary: '#ffffff'
  secondary-container: '#6cf8bb'
  on-secondary-container: '#00714d'
  tertiary: '#684000'
  on-tertiary: '#ffffff'
  tertiary-container: '#885500'
  on-tertiary-container: '#ffd4a4'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e2dfff'
  primary-fixed-dim: '#c3c0ff'
  on-primary-fixed: '#0f0069'
  on-primary-fixed-variant: '#3323cc'
  secondary-fixed: '#6ffbbe'
  secondary-fixed-dim: '#4edea3'
  on-secondary-fixed: '#002113'
  on-secondary-fixed-variant: '#005236'
  tertiary-fixed: '#ffddb8'
  tertiary-fixed-dim: '#ffb95f'
  on-tertiary-fixed: '#2a1700'
  on-tertiary-fixed-variant: '#653e00'
  background: '#f7f9fb'
  on-background: '#191c1e'
  surface-variant: '#e0e3e5'
typography:
  display:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  headline-md:
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
  label-md:
    fontFamily: Geist
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Geist
    fontSize: 10px
    fontWeight: '600'
    lineHeight: 12px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 48px
  canvas-margin: 32px
  gutter: 16px
---

## Brand & Style
The design system is built for a high-performance collaborative environment where human creativity meets machine intelligence. The brand personality is **precise, intelligent, and unobtrusive**, ensuring that the interface never competes with the user's content.

The design style is **Modern Professional Minimalism**. It prioritizes clarity through generous whitespace, a refined typographic scale, and a functional "Canvas-first" philosophy. To balance the technical nature of AI, the system uses soft transitions and subtle depth to remain approachable and fluid. The visual language draws inspiration from modern engineering tools—reliable and systematic—while maintaining the tactile friendliness of a creative studio.

## Colors
This design system utilizes a structured palette designed for high-focus work sessions.

- **Primary (Deep Indigo):** Reserved for core interactions, primary buttons, and active selection states. It represents the "human" intent and focus.
- **Secondary (Teal):** Dedicated exclusively to AI-generated content, suggestions, and automated success states. This creates a clear visual distinction between user-authored and AI-assisted data.
- **Background (Slate White):** The canvas background (#F8FAFC) is neutral and cool-toned to reduce eye strain during long sessions.
- **Accent (Amber):** Used sparingly for temporal urgency, such as deadlines, alerts, or system notifications requiring immediate attention.

The UI should utilize a subtle dot grid pattern on the background layer, using `#E2E8F0` for the dots at 15% opacity, spaced at 24px intervals.

## Typography
The typography system relies on **Inter** for its exceptional legibility in dense interfaces and **Geist** for technical labels and data-heavy components.

- **Hierarchy:** Use `Display` and `Headline` styles only for top-level navigation or empty-state headers.
- **Nodes:** Content inside canvas nodes should primarily use `Body-MD`. Titles within nodes use `Headline-MD`.
- **Metadata:** Use `Label-MD` (Geist) for technical metadata, AI confidence scores, and keyboard shortcuts to provide a distinct "utility" feel.
- **Canvas Scaling:** When zooming the canvas, font weights should remain consistent while sizes scale linearly. Avoid sub-pixel font rendering by snapping to whole pixel sizes where possible.

## Layout & Spacing
The layout follows a **Fluid Canvas** model with fixed-position interface chrome.

- **The Canvas:** An infinite workspace utilizing a 4px soft grid. All node placements and element sizes must be multiples of 4px to maintain visual alignment.
- **The Sidebar (Toolsets):** Fixed to the left or right, 280px width. Use `md` (16px) internal padding for tool groups.
- **The Bottom Bar (View Switcher):** Floating or docked center-bottom. Uses a pill-shaped container with `sm` padding between navigation items.
- **Breakpoints:** 
  - Mobile (<768px): Sidebar collapses into a bottom drawer; canvas interaction enters a "view-only" or "restricted edit" mode.
  - Desktop (>1280px): Dual-sidebar support (Tools on left, AI/Properties on right).

## Elevation & Depth
This design system uses **Tonal Layers** combined with **Ambient Shadows** to define the hierarchy of the workspace.

1.  **Canvas Level (Base):** Flat, Slate White background with the dot grid.
2.  **Node Level:** White background with a 1px border (#E2E8F0). Shadow: `0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)`.
3.  **Active/Selected Node:** Primary color (#4F46E5) 2px border. Shadow increases to `0 10px 15px -3px rgba(79, 70, 229, 0.1)`.
4.  **Floating UI (Sidebars/Modals):** Glassmorphism effect. Background: `rgba(255, 255, 255, 0.8)` with a 12px backdrop blur. This ensures the canvas is visible beneath the tools, maintaining spatial awareness.

## Shapes
The shape language is **Rounded**, conveying modern accessibility without feeling juvenile.

- **Nodes & Cards:** Use `rounded-md` (0.5rem) for a standard, professional feel.
- **Input Fields & Buttons:** Use `rounded-md` (0.5rem) to match the node architecture.
- **AI Badges & View Switcher:** Use `rounded-xl` (1.5rem) or full pill-shapes to distinguish "System" or "AI" elements from "User" content.
- **Connectors:** Lines between nodes should be 2px thick, using a Bezier curve (0.5 tension) rather than straight or angular paths to emphasize "flow."

## Components

### Node Cards
The core building block. Nodes feature a white background, a light border, and a header area for the task/goal title. Footer area should house "Assignee" avatars and "Priority" tags.

### Connection Lines
Directional arrows using the Primary color for manual links and the Secondary color (Teal) for AI-suggested links. AI links should use a dashed stroke (`stroke-dasharray: 4 4`).

### AI Suggestion Badges
Small, pill-shaped indicators using the Secondary color. They should appear at the top-right of nodes or floating near empty canvas areas. On hover, they expand to show a "Quick Action" menu.

### Sidebar Toolset
A vertical stack of iconic buttons. Active tools are highlighted with a Primary color background and white icon. Groups are separated by a subtle 1px divider.

### Bottom Bar Switcher
A floating segmented control. Transitions between Canvas, Gantt, and List views should be animated with a slide-and-fade effect. The active state uses a white "tombstone" background behind the icon/label.

### Input Fields
Minimalist design with no background—only a bottom border in neutral grey that transitions to a Primary Indigo 2px border on focus. Use Inter Medium for input text.