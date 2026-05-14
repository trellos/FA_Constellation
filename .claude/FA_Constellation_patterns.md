---
name: fa-constellation-patterns
description: Coding patterns extracted from FA_Constellation interactive constellation game
version: 1.0.0
source: local-git-analysis
analyzed_commits: 3
project_type: TypeScript/Vite/Phaser3
---

# FA Constellation Patterns

## Project Overview

Interactive "connect-the-stars" mini-activity built with TypeScript, Vite, and Phaser 3. The architecture is data-driven, scene-based, and designed for extensibility. Player traces constellation nodes; once complete, the camera zooms to reveal a stylized outline.

## Commit Conventions

This project uses **descriptive, natural language commits**:
- Focus on *what changed and why*
- Examples from history:
  - "Add project documentation"
  - "Fix freeze on snap; tune snap zone; widen constellation traces"
  - "Initial commit: interactive constellation drawing activity"

**Pattern:** Commits are detailed enough to explain the feature/fix without requiring issue references.

## Code Architecture

```
src/
├── main.ts                       # Phaser game bootstrap with dev-mode overrides
├── BootScene.ts                  # Minimal kickoff scene; loads assets and hands off
├── ConstellationManager.ts       # Discovers constellation pairs, manages scene swaps
├── ConstellationDisplay.ts       # Main scene with state machine (Intro → Tracing → Reveal → End)
├── types.ts                      # Shared type definitions
├── effects/
│   ├── Background.ts             # Background visuals
│   └── Starfield.ts              # Starfield animation
└── ui/
    ├── IntroModal.ts             # Intro UI modal
    ├── EndScreen.ts              # End-game screen
    └── FingerHint.ts             # Finger hint visual

tests/
├── constellation.spec.ts         # E2E tests with Playwright
└── helpers.ts                    # Shared test utilities

tools/
├── extract-frames.mjs            # Video → PNG frames (ffmpeg)
├── generate-outlines.mjs         # Threshold white pixels → constellation outlines
├── generate-finger.mjs           # SVG path → finger.png
└── validate-assets.mjs           # Asset validation (pre-build)

public/assets/
├── constellation_NN.png          # Constellation outline image (white on transparent)
├── constellation_NN.json         # Constellation metadata (name + normalized points)
└── finger.png                    # Finger hint visual
```

### Key Design Patterns

1. **Manager Pattern** (`ConstellationManager`)
   - Discovers available constellations via HEAD probes
   - Avoids Vite's HTML fallback by checking content-type
   - Picks constellation at random and swaps scenes

2. **Scene-Based Architecture** (Phaser 3)
   - `BootScene` — minimal initialization, loads assets
   - `ConstellationDisplay` — self-contained with internal state machine
   - Scenes don't import the manager; receive `onRestart` callback instead

3. **Data-Driven Design**
   - Constellations are JSON + PNG pairs in `public/assets/`
   - App probes `constellation_01`, `constellation_02`, … and stops at first missing
   - Easy to add new constellations without code changes

4. **Normalized Coordinate System**
   - PNG coordinates: `(0, 0)` = lower-left, `(1, 1)` = upper-right
   - Points stored as `[[u, v], ...]` — normalized to image bounds
   - Drawable outside image bounds (negative values, > 1)

## File Co-Change Patterns

Files that typically change together:
- `constellation_NN.png` ↔ `constellation_NN.json` (asset pairs)
- `ConstellationDisplay.ts` ↔ `ui/*` files (scene + UI updates)
- `vite.config.ts` ↔ build-related files (bundler tuning)

**Implication:** When adding a constellation, create both PNG and JSON simultaneously.

## Workflows

### Adding a New Constellation

1. **Create asset files:**
   - Add `public/assets/constellation_NN.png` (white outline, transparent bg, anti-aliased OK)
   - Add `public/assets/constellation_NN.json`:
     ```json
     {
       "name": "Display Name",
       "points": [[0.30, 0.20], [0.50, 0.65], ...]
     }
     ```

2. **Verify & reload:**
   - App auto-discovers new constellation (probes for sequentially indexed pairs)
   - No code changes required

### Regenerating Assets from Source Videos

```bash
npm run gen-frames      # ffmpeg: video → TEMP\constellation_frames\v*_NNN.png
npm run gen-outlines    # threshold → public/assets/constellation_NN.png
npm run gen-finger      # SVG path → public/assets/finger.png
```

- `gen-outlines` is data-driven by `CONSTELLATIONS` array in `tools/generate-outlines.mjs`
- Supports per-frame masks for unwanted overlay pixels

### Phaser Scene Lifecycle

1. `BootScene` initializes and preloads assets
2. `ConstellationDisplay` takes over with state machine:
   - **Intro** — show intro modal
   - **Tracing** — player draws constellation
   - **Reveal** — camera zoom out
   - **End** — show end screen
3. On restart, `ConstellationManager` swaps in a fresh `ConstellationDisplay`

## Testing Patterns

- **E2E Testing:** Playwright (`tests/constellation.spec.ts`)
- **Test Utilities:** Shared helpers in `tests/helpers.ts`
- **Pre-Build Validation:**
  - `npm run typecheck` — TypeScript type checking
  - `npm run validate-assets` — asset integrity check
  - Full test suite: `npm test` (typecheck + lint + validate + E2E)

### Dev Mode Overrides

In `src/main.ts`:
- `document.hidden = false` — game runs in headless preview
- `forceSetTimeOut = true` — game doesn't pause when tab is hidden

## Build & Dev Commands

```bash
npm run dev             # Start dev server (http://localhost:5173)
npm run typecheck       # TypeScript strict mode
npm run lint            # ESLint checks
npm run lint:fix        # Auto-fix lint issues
npm run format          # Prettier formatting
npm run validate-assets # Pre-build asset validation
npm run build           # Production build (with prebuild checks)
npm run preview         # Serve production build
npm test                # Full test suite
npm run test:e2e        # Playwright E2E only
npm run test:e2e:headed # E2E with browser UI
```

## Constellation JSON Format

```json
{
  "name": "Orion",
  "points": [
    [0.30, 0.20],
    [0.50, 0.65],
    [0.70, 0.40]
  ]
}
```

- `name` — display name for the constellation
- `points` — array of `[u, v]` pairs, normalized to image bounds
  - `(0, 0)` = lower-left corner
  - `(1, 1)` = upper-right corner
  - Values outside `[0, 1]` are drawable

## Dependencies

- **Runtime:** Phaser 3 (game framework)
- **Build:** Vite 5, TypeScript 5, ESLint, Prettier
- **Testing:** Playwright 1 (E2E), Sharp (image processing)
- **Asset Tools:** ffmpeg (via extract-frames)

## Notes for Future Development

1. **Scene Communication:** Scenes use callbacks (`onRestart`) rather than direct imports—maintain this decoupling
2. **Asset Discovery:** Manager uses HEAD probes with content-type checks to avoid Vite's HTML fallback
3. **Coordinate System:** Always normalize constellation points to `(0, 1)` in both axes
4. **E2E Testing:** Focus on interactive flows (tracing, reveal, restart) rather than unit tests
5. **Build Optimization:** Asset validation (`validate-assets`) runs before build—critical for catching missing files
