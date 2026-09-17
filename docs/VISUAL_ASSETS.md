# 🎨 CS2Coach - Visual Assets

## Logo Variations

### Primary Logo
- **File**: `apps/web/public/logo.svg`
- **Size**: 200x200px
- **Usage**: App icon, splash screen, documentation
- **Colors**: Orange gradient (#FF7A00 → #FF9D32)

### Formats Available
- SVG (vector, recommended for web)
- PNG (export at 512x512 for app stores)

## Screenshots

> 📸 **Coming Soon**: Interactive screenshots will be added after deployment

### Planned Screenshots:
1. **Splash Screen** - First impression with animated radar
2. **Home Dashboard** - Player stats and live match button
3. **Match Detection** - Live match card with score
4. **Tactical HUD** - AI coaching interface with recommendations
5. **Match History** - Past games with performance metrics
6. **Settings** - Theme toggle and language switcher

## Architecture Diagram

**File**: `docs/architecture.svg`

Shows the complete system architecture:
- Telegram Mini App layer
- Fastify API Server
- Game State Pipeline
- AI Decision Engine (Groq + Fallback)
- Database and Bot connections

## Color Palette

### Primary Colors
```css
Orange: #FF7A00
Orange Light: #FF9D32
Orange Soft: #FFF1E0 (light mode)
```

### Semantic Colors
```css
Success/Live: #38E68B (dark) / #16A35F (light)
Error: #FF6068 (dark) / #E6484F (light)
Info/CT: #57D8FF
```

### Neutrals
```css
Background: #070A0E (dark) / #F3F5F8 (light)
Panel: #12181F (dark) / #FFFFFF (light)
Text: #F3F6F8 (dark) / #10151B (light)
Muted: #8B98A3 (dark) / #76838D (light)
```

## Badges

Available badges for README:
- TypeScript
- React
- Node.js
- Telegram
- License (MIT)

## Social Media Assets

### Twitter/X Card
- **Size**: 1200x630px
- **Format**: PNG
- **Content**: Logo + tagline + screenshot

### Open Graph
- **Size**: 1200x630px
- **Format**: PNG or JPG
- **Content**: Same as Twitter card

## App Store Assets (Future)

### iOS App Store
- Icon: 1024x1024px
- Screenshots: 1284x2778px (iPhone 14 Pro)

### Google Play Store
- Feature Graphic: 1024x500px
- Icon: 512x512px
- Screenshots: Various sizes

## Telegram Specific

### Bot Avatar
- Size: 512x512px
- Current: Using primary logo
- Format: JPEG or PNG

### Mini App Preview
- Aspect Ratio: 16:9
- Recommended: 1200x675px
- Shows app in action

## Animation Assets

### Lottie Files (Future Enhancement)
- Loading spinner
- Success checkmark
- Live pulse indicator
- Radar scan animation

## Brand Guidelines

### Logo Usage
✅ **Do:**
- Use with sufficient padding
- Maintain aspect ratio
- Use on dark backgrounds primarily
- Keep readable (min 24px)

❌ **Don't:**
- Rotate or distort
- Change colors arbitrarily
- Add effects (shadows, 3D)
- Place on busy backgrounds

### Typography
- **Primary**: Inter (system font stack)
- **Weights**: 400 (regular), 600 (semibold), 700 (bold), 900 (black)
- **Scale**: 8, 10, 11, 12, 13, 16, 18, 20, 24, 32, 39, 43px

### Spacing
- **Base Unit**: 4px
- **Scale**: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64px

## Export Commands

```bash
# Convert SVG to PNG (requires Inkscape or ImageMagick)
inkscape logo.svg --export-filename=logo-512.png --export-width=512

# Optimize PNG
pngquant logo-512.png --output logo-512-optimized.png

# Convert to WebP
cwebp logo-512.png -o logo-512.webp -q 90
```

## Design Tools

### Recommended
- **Figma** - UI design and prototyping
- **Inkscape** - SVG editing
- **GIMP** - Raster image editing
- **ImageMagick** - Batch processing

### Online Tools
- **SVG Optimizer**: svgomg.net
- **Favicon Generator**: realfavicongenerator.net
- **Color Contrast Checker**: coolors.co/contrast-checker

## Future Assets Roadmap

- [ ] Animated logo (Lottie)
- [ ] App store screenshots
- [ ] Social media templates
- [ ] Presentation deck template
- [ ] Email signature graphics
- [ ] Stickers pack for Telegram
- [ ] Video demo (30-60s)

---

**Last Updated**: 2026-09-17
**Maintained By**: CS2Coach Team
