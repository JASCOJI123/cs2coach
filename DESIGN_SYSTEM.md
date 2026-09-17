# CS2Coach Design System

## Brand Identity

### Logo
- **Primary Mark**: Shield with tactical lines (represents protection and guidance)
- **Color**: Orange gradient (#FF7A00 → #FF9D32)
- **Usage**: App icon, splash screen, loading states

### Typography
- **Primary Font**: Inter (system fallback: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto)
- **Display**: Bold, tight letter-spacing (-0.06em)
- **Body**: Regular, 12-14px
- **Labels**: 8-10px, uppercase, wide letter-spacing (0.1em)

## Color Palette

### Core Colors
```css
/* Light Mode */
--primary-orange: #FF7A00
--primary-orange-light: #FF9D32
--primary-orange-soft: #FFF1E0

/* Dark Mode */
--primary-orange: #FF7A00
--primary-orange-light: #FFAB5E
--primary-orange-soft: rgba(255, 122, 0, 0.16)
```

### Semantic Colors
```css
/* Success / Live */
--success: #2ECB82 (dark) / #16A35F (light)

/* Error / Danger */
--error: #FF6068 (dark) / #E6484F (light)

/* Info / CT Side */
--info: #57D8FF

/* Neutral Grays */
--text-primary: #F3F6F8 (dark) / #10151B (light)
--text-muted: #8B98A3 (dark) / #76838D (light)
```

### Background System
```css
/* Dark Mode Surfaces */
--bg-base: #070A0E
--bg-panel: #12181F
--bg-panel-2: #161D24
--bg-panel-3: #1B232B
--border: #232C35

/* Light Mode Surfaces */
--bg-base: #F3F5F8
--bg-panel: #FFFFFF
--bg-panel-2: #F5F7F9
--bg-panel-3: #EDF1F4
--border: #E1E6EB
```

## Component Patterns

### Cards
- **Border Radius**: 16-20px (larger for hero elements)
- **Elevation**: 0 18px 44px rgba(0,0,0,.40) (dark) / 0 10px 32px rgba(16,25,35,.08) (light)
- **Border**: 1px solid var(--border)
- **Padding**: 16-20px

### Buttons
**Primary (CTA)**
- Background: Linear gradient (orange → orange-light)
- Text: Dark brown (#1A0F03)
- Border Radius: 14px
- Shadow: 0 10px 26px rgba(255,122,0,.22)
- Padding: 13px 15px

**Secondary**
- Background: var(--bg-panel)
- Text: var(--text-primary)
- Border: 1px solid var(--border)
- Border Radius: 14px

### Status Indicators
- **Live**: Green dot with glow effect
- **Offline**: Gray dot, no glow
- **Demo Mode**: Orange stripe banner

## Layout System

### Grid
- **Max Width**: 480px (centered)
- **Padding**: 20px horizontal, 110px bottom (for nav)
- **Gap**: 8-12px between elements

### Spacing Scale
- **xs**: 4px
- **sm**: 8px
- **md**: 12px
- **lg**: 16px
- **xl**: 20px
- **2xl**: 24px
- **3xl**: 32px

## Interactive States

### Hover
- Subtle scale: transform: scale(1.02)
- Opacity: 0.9 for secondary elements

### Active
- Scale: transform: scale(0.98)
- Slight brightness increase

### Disabled
- Opacity: 0.45
- Cursor: not-allowed

## Animations

### Timing Functions
- **Default**: cubic-bezier(0.4, 0, 0.2, 1)
- **Entrance**: cubic-bezier(0, 0, 0.2, 1)
- **Exit**: cubic-bezier(0.4, 0, 1, 1)

### Durations
- **Fast**: 150ms (micro-interactions)
- **Normal**: 200ms (most UI)
- **Slow**: 300ms (page transitions)

## Iconography

### Style
- **Stroke Width**: 2-2.5px
- **Corner Radius**: Rounded caps
- **Size**: 18-24px (UI), 32-48px (hero)

### Sources
- Custom tactical icons
- System emojis for quick actions
- Lucide/Feather for standard UI

## Accessibility

### Contrast Ratios
- **Text**: 4.5:1 minimum
- **Large Text**: 3:1 minimum
- **Interactive Elements**: 3:1 minimum

### Focus States
- Visible outline: 2px solid var(--primary-orange)
- Offset: 2px

### Touch Targets
- Minimum: 44x44px
- Recommended: 48x48px

## Responsive Breakpoints

```css
/* Mobile First */
@media (max-width: 380px) {
  /* Compact spacing */
}

@media (min-width: 481px) {
  /* Tablet/Desktop enhancements */
}
```

## Dark/Light Mode

### Toggle Behavior
- Smooth transition: 200ms
- Persist preference: localStorage
- System preference detection

### Implementation
```css
html.dark {
  /* Dark mode tokens */
}

html:not(.dark) {
  /* Light mode tokens */
}
```
