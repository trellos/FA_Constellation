# Architecture

## Stack

- **TypeScript** — strict mode, ES2020 target, `noUnusedLocals` /
  `noUnusedParameters` on.
- **Vite** — dev server + build. See [vite.config.ts](vite.config.ts) for
  the full-reload-on-every-change plugin (rationale in
  [DECISIONS.md](DECISIONS.md)).
- **Phaser 3** — the game engine. Single canvas, WebGL renderer, FIT
  scale mode, 1920×1080 internal game-coord space.
- **sharp** (devDependency) — node-side image processing for the asset
  generation scripts. Not used at runtime.
- **Playwright** — end-to-end test runner. Drives real DOM pointer
  events through Phaser's input pipeline.

## File layout

```
FA_Constellation/
├── index.html                  Phaser bootstraps into #game
├── src/
│   ├── main.ts                 Constructs the Phaser.Game; dev shims
│   ├── BootScene.ts            Preloads finger.png, kicks off the manager
│   ├── ConstellationManager.ts Discovers assets + starts display scenes
│   ├── ConstellationDisplay.ts The activity scene (state machine + input)
│   ├── types.ts                ConstellationData, ScreenPoint, etc.
│   ├── effects/
│   │   ├── Background.ts       Vertical gradient + vignette
│   │   └── Starfield.ts        Sparse twinkling stars
│   └── ui/
│       ├── IntroModal.ts       CONNECT STARS modal + Play button
│       ├── EndScreen.ts        Name + OK button
│       └── FingerHint.ts       Animated pointing-hand hint
├── public/assets/
│   ├── constellation_NN.png    Outline image (transparent background)
│   ├── constellation_NN.json   { name, points[] }
│   └── finger.png              Pointing-hand cursor sprite
├── tools/
│   ├── extract-frames.mjs      ffmpeg helper: video → frame PNGs
│   ├── generate-outlines.mjs   frame → transparent outline PNG
│   └── generate-finger.mjs     clean frame → finger.png
└── tests/
    ├── constellation.spec.ts   End-to-end Playwright suite
    └── helpers.ts              gameToClient/drag/tapPlay/readState
```

## Runtime control flow

```
main.ts
  └─> new Phaser.Game({ scene: [BootScene] })
        └─> BootScene.preload      load finger.png
            BootScene.create       new ConstellationManager(game).start()

ConstellationManager.start
  └─> discoverAvailable()                fetch HEAD probes 01, 02, …
      pickRandom()
      loadTexture() + loadJson()
      showRandom()
            └─> game.scene.add('display_N', ConstellationDisplay, true,
                                { data, textureKey, onRestart })

ConstellationDisplay
  init   → store data; reset state to Phase.Intro
  create → Background, Starfield, outline image (alpha 0),
           IntroModal(onPlay: startTracing), input listeners
  update → per-frame snap-polling safety net while dragging

  Phase.Intro
    └─ user taps Play
       └─ IntroModal.dismiss → onPlay → startTracing
           └─ spawnNode(0), showTarget(1), scheduleHint
              phase = Tracing

  Phase.Tracing
    └─ pointerdown / pointermove / pointerup / per-frame update
       check distance to target
       └─ if <= SNAP_DISTANCE: advanceSegment
           └─ if i + 1 === last: beginReveal
               else:             spawnNode + showTarget + scheduleHint

  Phase.Reveal
    └─ camera tween (zoom out) + outline fade in
       └─ delayedCall: new EndScreen(name, onOk = onRestart)
          phase = End

  Phase.End
    └─ user taps OK → EndScreen.dismiss → onRestart
       └─ ConstellationManager.showRandom (back to top)
```

## ConstellationDisplay state machine

```
Intro ─tap Play─▶ Tracing ─last snap─▶ Reveal ─900 ms─▶ End ─tap OK─▶ (manager picks again)
```

Phase is held in a private enum field. Each transition is a one-way edge
within a single scene lifetime — there is no Tracing→Intro back-edge, for
example. When the player presses OK on the End screen, the manager
destroys this scene and spawns a fresh `display_N+1` instance with a
new random constellation.

Per-frame `update()` is the safety net: if a `pointermove` event is ever
dropped, the next frame still tests the live `activePointer.x/y` against
the target and snaps if appropriate, so the line cannot freeze mid-drag.

## Data formats

### Constellation JSON

```jsonc
{
  "name": "Volcano",
  "points": [
    [0.18, 0.12],   // [u, v] in PNG-normalized coordinates
    [0.28, 0.32],
    ...
  ]
}
```

- `name`: a display name. The end screen up-cases this for display
  (`Volcano` → `VOLCANO`); store it in normal capitalization in the
  source.
- `points`: a `[u, v]` pair per trace node, in PNG-normalized
  coordinates. `(0, 0)` is the **lower-left** corner of the outline
  PNG; `(1, 1)` is the upper-right. Negative values and values > 1
  draw outside the PNG. Phaser's screen Y axis grows downward, so
  the layout code converts each `v` to `1 - v` before placing the
  node.

The trace order is the array order. Segments connect `points[i]` →
`points[i+1]`. Total segments = `points.length − 1`.

### Outline PNG

The outline PNG is the creature's silhouette as a thick white stroke
on a transparent background. Anti-aliasing is fine. The file is the
_single source of truth_ for where the constellation sits on screen:
the JSON points are normalized to **the PNG's intrinsic dimensions**,
and the layout code centers the PNG inside the canvas and scales it to
`OUTLINE_FILL` (0.78) of the smaller canvas dim. The trace points are
then mapped from PNG-normalized into screen space.

### Asset generation

The PNGs in `public/assets/` are committed, but they can be
regenerated from the reference videos with the scripts in `tools/`:

- `tools/extract-frames.mjs` (`npm run gen-frames`) — uses ffmpeg to
  extract one frame per second from each source video into
  `%TEMP%/constellation_frames/`.
- `tools/generate-outlines.mjs` (`npm run gen-outlines`) — for each
  constellation, picks a reveal-phase frame, applies a near-white
  threshold (`min(R,G,B) > 150` & low saturation), auto-crops to the
  alpha bbox, and writes a transparent outline PNG.
- `tools/generate-finger.mjs` (`npm run gen-finger`) — pixel-extracts
  the pointing-hand cursor from a clean hint-phase frame using a
  green-channel threshold to isolate the blue body + white outline
  against the deep-blue background.
- `npm run gen-assets` runs the finger and outline generators together.

## Game coordinate system

The Phaser game is configured at a fixed 1920×1080 internal resolution
with `Phaser.Scale.FIT`. The canvas DOM element is scaled by Phaser to
match the parent's size while preserving aspect ratio (letterboxing
if needed). All in-code coordinates — `points[i].x/y`, `pointer.x/y`,
`SNAP_DISTANCE`, etc. — are in **game-pixel space**.

When the test suite needs to dispatch a real DOM mouse event at a
specific game position, `tests/helpers.ts` reads the canvas's
`getBoundingClientRect()` and converts game-px → client-px:

```ts
const r = canvas.getBoundingClientRect();
const clientX = r.left + (gameX / 1920) * r.width;
const clientY = r.top + (gameY / 1080) * r.height;
```

## Input pipeline

Phaser's input plugin is the single source of pointer events. Three
scene-level handlers and one per-frame safety net:

```
input.on('pointerdown',       onPointerDown)   start drag, immediate snap if on target
input.on('pointermove',       onPointerMove)   draw line, swept-segment snap test
input.on('pointerup',         onPointerUp)     release-snap with larger tolerance
input.on('pointerupoutside',  onPointerUp)     same, but for pointer-up off-canvas
update()                                       per-frame safety net while dragging
```

The swept-segment snap uses point-to-segment distance from
`prev_pointer` to `current_pointer`, not just the current point — this
catches fast drags that would otherwise jump straight over the snap
zone in a single frame.

## Testing

`tests/constellation.spec.ts` runs six end-to-end tests via Playwright
Chromium. Each test:

1. Calls `page.goto('/')`.
2. Waits for the dev hook `window.__game` and the live
   `ConstellationDisplay` scene's `Intro` phase + `Play` text to exist
   in the display tree.
3. Drives the activity using `page.mouse.down/move/up` against
   client-space coordinates computed from the canvas rect.
4. Reads `display.phase`, `currentIndex`, `points`, etc. via
   `page.evaluate` to assert state transitions.

The helpers in `tests/helpers.ts` wrap the common patterns: `tapPlay`
clicks the Play button, `drag` sweeps mouse events from one game-coord
to another, `dragUntilAdvanced` retries up to 3 times if a single
dragged segment didn't advance (defensive against a single dropped
event in headless Chromium).
