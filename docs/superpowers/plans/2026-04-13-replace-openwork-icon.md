# Replace OpenWork Icon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all OpenWork PNG icons (Tauri desktop + Web favicon) with the custom `icon.png` from the workspace root.

**Architecture:** Copy source icon to Tauri icons directory, use `pnpm tauri icon` to auto-generate all Tauri variants, use macOS `sips` to generate Web favicon PNG files, sync dev icons from generated output.

**Tech Stack:** Tauri CLI (`pnpm tauri icon`), macOS `sips` command, bash

---

## Task 1: Create Git Worktree

**Files:** none (git operation)

- [ ] **Step 1: Create feature branch and worktree**

```bash
cd /Users/umasuo_m3pro/Desktop/startup/xingjing/harnesswork
git worktree add ../worktrees/feature/TASK-replace-icon -b feature/TASK-replace-icon dev
```

Expected: Worktree created at `../worktrees/feature/TASK-replace-icon`

- [ ] **Step 2: Verify worktree**

```bash
git worktree list
```

Expected: List shows the new worktree path with `feature/TASK-replace-icon` branch.

---

## Task 2: Replace Tauri Desktop Icons

**Files:**
- Modify: `apps/desktop/src-tauri/icons/icon.png`
- Auto-generated: `icons/32x32.png`, `icons/128x128.png`, `icons/128x128@2x.png`, `icons/icon.icns`, `icons/icon.ico`

- [ ] **Step 1: Copy source icon to Tauri icons directory**

```bash
cp /Users/umasuo_m3pro/Desktop/startup/xingjing/icon.png \
   /Users/umasuo_m3pro/Desktop/startup/xingjing/worktrees/feature/TASK-replace-icon/apps/desktop/src-tauri/icons/icon.png
```

Expected: `icon.png` replaced in `src-tauri/icons/`

- [ ] **Step 2: Run tauri icon to generate all variants**

```bash
cd /Users/umasuo_m3pro/Desktop/startup/xingjing/worktrees/feature/TASK-replace-icon/apps/desktop
pnpm tauri icon src-tauri/icons/icon.png
```

Expected: Output shows generated files including `icons/32x32.png`, `icons/128x128.png`, `icons/128x128@2x.png`, `icons/icon.icns`, `icons/icon.ico`

- [ ] **Step 3: Verify generated files exist and have non-zero size**

```bash
ls -lh /Users/umasuo_m3pro/Desktop/startup/xingjing/worktrees/feature/TASK-replace-icon/apps/desktop/src-tauri/icons/
```

Expected: All files present with reasonable file sizes (icon.icns > 100KB, icon.ico > 10KB)

---

## Task 3: Update Dev Icons

**Files:**
- Modify: `apps/desktop/src-tauri/icons/dev/icon.png`
- Modify: `apps/desktop/src-tauri/icons/dev/32x32.png`
- Modify: `apps/desktop/src-tauri/icons/dev/128x128.png`
- Modify: `apps/desktop/src-tauri/icons/dev/128x128@2x.png`

- [ ] **Step 1: Sync generated PNG sizes to dev directory**

```bash
ICONS_DIR=/Users/umasuo_m3pro/Desktop/startup/xingjing/worktrees/feature/TASK-replace-icon/apps/desktop/src-tauri/icons
cp "$ICONS_DIR/icon.png"        "$ICONS_DIR/dev/icon.png"
cp "$ICONS_DIR/32x32.png"       "$ICONS_DIR/dev/32x32.png"
cp "$ICONS_DIR/128x128.png"     "$ICONS_DIR/dev/128x128.png"
cp "$ICONS_DIR/128x128@2x.png"  "$ICONS_DIR/dev/128x128@2x.png"
```

Expected: 4 files copied to `icons/dev/`

- [ ] **Step 2: Verify dev icons**

```bash
ls -lh /Users/umasuo_m3pro/Desktop/startup/xingjing/worktrees/feature/TASK-replace-icon/apps/desktop/src-tauri/icons/dev/
```

Expected: 4 files with updated timestamps

---

## Task 4: Replace Web Favicon Files

**Files:**
- Modify: `apps/app/public/favicon-16x16.png`
- Modify: `apps/app/public/favicon-32x32.png`
- Modify: `apps/app/public/apple-touch-icon.png`

- [ ] **Step 1: Generate 16x16 favicon**

```bash
sips -z 16 16 /Users/umasuo_m3pro/Desktop/startup/xingjing/icon.png \
  --out /Users/umasuo_m3pro/Desktop/startup/xingjing/worktrees/feature/TASK-replace-icon/apps/app/public/favicon-16x16.png
```

Expected: `favicon-16x16.png` written, 16x16 pixels

- [ ] **Step 2: Generate 32x32 favicon**

```bash
sips -z 32 32 /Users/umasuo_m3pro/Desktop/startup/xingjing/icon.png \
  --out /Users/umasuo_m3pro/Desktop/startup/xingjing/worktrees/feature/TASK-replace-icon/apps/app/public/favicon-32x32.png
```

Expected: `favicon-32x32.png` written, 32x32 pixels

- [ ] **Step 3: Generate apple-touch-icon (180x180)**

```bash
sips -z 180 180 /Users/umasuo_m3pro/Desktop/startup/xingjing/icon.png \
  --out /Users/umasuo_m3pro/Desktop/startup/xingjing/worktrees/feature/TASK-replace-icon/apps/app/public/apple-touch-icon.png
```

Expected: `apple-touch-icon.png` written, 180x180 pixels

- [ ] **Step 4: Verify favicon dimensions**

```bash
sips -g pixelWidth -g pixelHeight \
  /Users/umasuo_m3pro/Desktop/startup/xingjing/worktrees/feature/TASK-replace-icon/apps/app/public/favicon-16x16.png \
  /Users/umasuo_m3pro/Desktop/startup/xingjing/worktrees/feature/TASK-replace-icon/apps/app/public/favicon-32x32.png \
  /Users/umasuo_m3pro/Desktop/startup/xingjing/worktrees/feature/TASK-replace-icon/apps/app/public/apple-touch-icon.png
```

Expected: Dimensions match 16x16, 32x32, 180x180 respectively

---

## Task 5: Commit and Merge

- [ ] **Step 1: Stage all changed icon files**

```bash
cd /Users/umasuo_m3pro/Desktop/startup/xingjing/worktrees/feature/TASK-replace-icon
git add apps/desktop/src-tauri/icons/ apps/app/public/favicon-16x16.png apps/app/public/favicon-32x32.png apps/app/public/apple-touch-icon.png
```

- [ ] **Step 2: Commit**

```bash
git commit -m "chore: replace OpenWork icons with custom brand icon"
```

- [ ] **Step 3: Merge to dev**

```bash
cd /Users/umasuo_m3pro/Desktop/startup/xingjing/harnesswork
git merge feature/TASK-replace-icon --no-ff -m "merge: replace OpenWork icons with custom brand icon"
```

- [ ] **Step 4: Remove worktree**

```bash
git worktree remove /Users/umasuo_m3pro/Desktop/startup/xingjing/worktrees/feature/TASK-replace-icon
```
