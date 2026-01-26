# 260123_CityView

260123_CityView is a curated collection of city blockout meshes organized by district, plus a three.js viewer for quick visual inspection, color-coded grouping, and per-mesh visibility control.

## Features
- District-based organization for fast scene assembly and OBJ asset reuse.
- Three.js viewer with collapsible, draggable menus and per-mesh toggles (including per-district Hide All).
- Z-up orientation with orbit controls for DCC-aligned navigation.
- Double-sided shading with tuned transparency: 25% for most meshes, 40% for Plot, 50% for Land, 5% for Overpass.
- District color themes with brightness/saturation adjustments, darker Land meshes, and brighter Overpass meshes.
- Loading progress overlay so large OBJ batches provide immediate feedback.
- Scanner mode that drops timed alert markers on streets with a live activity feed and camera jump-to.

## Getting Started
1) `npm install`
2) `npm run dev` to start Vite on the local dev URL
3) `npm run build` to create a production bundle
4) `npm run preview` to verify the production build locally

## Controls
- **Orbit:** left mouse drag
- **Pan:** right mouse drag (or two-finger drag)
- **Zoom:** mouse wheel / trackpad pinch
- **Menus:** click section headers to expand/collapse, drag the panel to reposition
- **Visibility:** per-mesh toggles plus per-district Hide All switches
- **Scanner:** toggle Listen to spawn timed alert points; click a feed item to focus the camera

## Deployment
- **Local production preview:** `npm install`, then `npm run build` followed by `npm run preview` to inspect the compiled bundle.
- **Publish to GitHub Pages:** From a clean `main`, run `npm run build -- --base=./`. Checkout (or create) the `gh-pages` branch in a separate worktree, copy everything inside `dist/` plus a `.nojekyll` marker to its root, commit with a descriptive message, `git push origin gh-pages`, then switch back to `main`.
- **Live demo:** https://ekimroyrp.github.io/260123_CityView/
