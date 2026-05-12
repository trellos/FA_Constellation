# Constellation

Interactive "connect-the-stars" mini-activity built with TypeScript, Vite, and Phaser 3.
The player traces a constellation node-by-node; once complete, the camera zooms out to
reveal the constellation as a stylized white outline. Data-driven: drops in new
`constellation_NN.png` + `constellation_NN.json` files and the app picks them up.

## Run

```
npm install
npm run dev          # http://localhost:5173
```

A fresh clone will run out of the box — the asset PNGs and JSON files are committed.

## Build for production

```
npm run build
npm run preview      # serve dist/
```

## Adding a new constellation

1. Add `public/assets/constellation_NN.png` — the outline image (thick white outline,
   transparent background — anti-aliasing OK).
2. Add `public/assets/constellation_NN.json`:
   ```json
   {
     "name": "Display Name",
     "points": [[0.30, 0.20], [0.50, 0.65], ...]
   }
   ```
   Points are normalized to the PNG: `(0, 0)` is lower-left, `(1, 1)` is upper-right.
   Negative values and values > 1 draw outside the image.
3. Reload — the app probes `01`, `02`, … and stops at the first missing index.

## Regenerating assets from the source videos

The outline PNGs were extracted from frames of the three reference videos via:

```
npm run gen-frames     # ffmpeg: video -> %TEMP%\constellation_frames\v*_NNN.png
npm run gen-outlines   # threshold near-white pixels -> public/assets/constellation_NN.png
npm run gen-finger     # SVG path -> public/assets/finger.png
```

`gen-outlines` is data-driven by the `CONSTELLATIONS` array at the top of
`tools/generate-outlines.mjs` — point it at different source frames, add per-frame
masks for unwanted overlay pixels, etc.

## Architecture

- `src/main.ts` — Phaser game bootstrap. Dev-mode-only overrides:
  document.hidden = false and forceSetTimeOut = true so the game runs in
  headless preview browsers.
- `src/BootScene.ts` — minimal kickoff scene; loads `finger.png` and hands off to
  the manager.
- `src/ConstellationManager.ts` — discovers available constellation pairs via
  HEAD probes (content-type checked to avoid Vite's HTML fallback), picks one
  at random, swaps in a fresh `ConstellationDisplay` scene each round.
- `src/ConstellationDisplay.ts` — self-contained Phaser scene with a small
  state machine (Intro → Tracing → Reveal → End). Does not import the manager;
  it only receives a `onRestart` callback.
- `src/ui/{IntroModal,EndScreen,FingerHint}.ts` — UI pieces.
- `src/effects/{Background,Starfield}.ts` — visuals.

## Layout in (normalized) PNG coords

```
y=1  ┌──────────┐
     │          │
     │ outline  │      points: [[u, v], ...] in this rect
     │          │      drawn at:  (left + u·w,  top + (1-v)·h)
y=0  └──────────┘
     x=0       x=1
```
