# Replace OpenWork Icon Design

**Date:** 2026-04-13  
**Status:** Approved

## Summary

Replace all OpenWork PNG icons (Tauri desktop app + Web favicon) using the custom `icon.png` from the workspace root. SVG brand logo files are out of scope.

## Source

- Source image: `/Users/umasuo_m3pro/Desktop/startup/xingjing/icon.png`

## Targets

### Tauri Desktop Icons (`apps/desktop/src-tauri/icons/`)
- `icon.png` — source reference
- `icon.icns` — macOS Dock / Finder icon
- `icon.ico` — Windows taskbar icon
- `32x32.png`
- `128x128.png`
- `128x128@2x.png`

### Dev Icons (`apps/desktop/src-tauri/icons/dev/`)
- `icon.png`, `32x32.png`, `128x128.png`, `128x128@2x.png`

### Web Favicon (`apps/app/public/`)
- `favicon-16x16.png`
- `favicon-32x32.png`
- `apple-touch-icon.png`

## Out of Scope

- SVG brand files: `openwork-mark.svg`, `openwork-logo.svg`, `openwork-logo-square.svg`

## Approach

1. Copy source `icon.png` to `src-tauri/icons/icon.png`
2. Run `pnpm tauri icon` in `apps/desktop/` to auto-generate all Tauri icon variants
3. Use macOS `sips` to resize source to web favicon dimensions
4. Copy generated PNG sizes to `icons/dev/`
