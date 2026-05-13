# Technical Decisions

These are choices the project has settled on after iteration. The
rationale is kept here so future changes don't quietly revert them.
Each decision is short — what was picked, what was rejected, and why
it matters.

## Build & runtime

### Vite + TypeScript + Phaser 3

- Phaser 3 is the de-facto choice for canvas/WebGL 2D games with rich
  input + tween + scene support. We don't need a full 3D engine.
- Vite gives a fast dev server and a clean production bundle.
- Plain TypeScript (no React/Vue) — the entire UI lives inside the
  Phaser canvas, so a DOM framework would add weight for nothing.

### Phaser internal resolution is fixed at 1920×1080, FIT scale mode

- All gameplay coordinates are in this game-pixel space. Layout,
  snap distances, line widths, etc. are absolute numbers.
- `Phaser.Scale.FIT` + `CENTER_BOTH` letterbox to whatever window
  size the player has. This lets us tune the game once and have it
  look the same everywhere.
- **Do not** switch to `RESIZE` mode and chase the viewport — it
  invalidates every magic number in the codebase.

### Force a full page reload on every source change

`vite.config.ts` ships a `full-reload-always` plugin that intercepts
HMR updates and tells the client to reload instead. Default Vite HMR
swaps the module's _exports_, but Phaser scene classes are bound
through the prototype at instantiation — the running scene keeps its
**old** method definitions after an edit. The result is silently
stale code that doesn't match the source.

- **Trade-off**: ~300 ms slower per save.
- **Why we accept it**: we burned hours debugging "the snap doesn't
  work" only to discover the live scene was running pre-fix code.
- **Do not** revert to default HMR without first verifying that scene
  method edits actually take effect on save.

### Dev-only headless visibility shims

In `main.ts`:

```ts
const isHeadlessHidden = import.meta.env.DEV && document.hidden;
if (isHeadlessHidden) {
  Object.defineProperty(document, 'hidden', { get: () => false });
  // ...
}
new Phaser.Game({ fps: { forceSetTimeOut: isHeadlessHidden }, ... });
```

Headless preview browsers (MCP Preview tools) report
`document.hidden === true` even when the page is being rendered. That
makes Phaser auto-pause its main loop **and** the browser throttle
`requestAnimationFrame` to 1 Hz. The detection is "if hidden at boot,
we're in a headless tool" — real browsers see `hidden=false` at boot
and get no shims (no setTimeout fallback, no `preserveDrawingBuffer`,
both of which are slower than default).

- **Do not** enable these shims unconditionally — real-browser
  performance regresses.

## Scene & state architecture

### ConstellationDisplay does not depend on ConstellationManager

The display scene receives `{ data, textureKey, onRestart }` via
scene `init` and treats `onRestart` as an opaque callback. There is
**no import** from `ConstellationDisplay.ts` to
`ConstellationManager.ts`.

- This keeps the activity scene reusable in any embedding context.
- It also forces the manager to be the only place that knows about
  asset discovery, random selection, and scene lifecycle — those
  concerns don't leak into the activity logic.

### Each round is a fresh Phaser scene instance

`ConstellationManager.showRandom` does
`game.scene.add('display_N', ConstellationDisplay, true, ...)` instead
of restarting the existing scene. Each round increments `N`. The old
scene is shut down and its resources freed before the new one starts.

- Avoids stale tweens, lingering pointer listeners, accidentally
  shared state between rounds.
- The scene's `SHUTDOWN` listener does the explicit cleanup
  (input.off, scale.off, fingerHint.destroy, timer.remove).

### Per-frame `update()` is a safety net, not the primary input path

`pointerdown` / `pointermove` / `pointerup` are the primary handlers.
`update()` _additionally_ re-checks the snap condition every frame
while dragging, redrawing the active line from the live
`activePointer.x/y`. If a single `pointermove` event is dropped, the
next frame still catches it.

- **Do not** move all input handling into `update()` (it would lose
  precise event timing and complicate touch handling).
- **Do not** remove `update()` either — it papers over rare but real
  browser/Phaser input drops.

## Input

### Snap thresholds: 80 game-px move, 110 game-px release

```ts
const SNAP_DISTANCE = 80;
const RELEASE_SNAP_DISTANCE = 110;
```

- 80 game-px ≈ 3× the visible pink ring radius (`TARGET_RADIUS = 26`),
  matching the dim outer halo. The visible glow IS the snap zone.
- Earlier values of 110 / 180 / 220 caused complaints that the line
  "snaps too early" (pointer was visibly nowhere near the ring but
  the snap fired). 80 / 110 is the value the player actually expects.
- 110 on release covers small overshoots from a lift and a direct
  tap-to-target gesture.
- **Do not** make these match the _snap distance the player asks
  for after a single miss_ — a miss at 200 px doesn't mean snap
  should fire at 200 px; it means the player needs to drag closer.
  The visible halo is the contract; honor it.

### Swept-segment snap (point-to-segment distance, not point-to-point)

`onPointerMove` computes the distance from the target to the _segment
between the previous and current pointer position_. A fast drag that
jumps straight over the snap zone between two frames still snaps,
because the segment between the two endpoints passes within range.

- **Do not** simplify back to a point-to-point check.

### Discrete tap vs. continuous drag

`onPointerDown`'s immediate-snap path sets `dragging = false`. A
tap-on-target is a one-shot — no chaining onto the next target on
release. `onPointerMove`'s snap also sets `dragging = false` so a
single drag completes one segment at a time (matches the reference
videos). If we later want continuous multi-segment drag, add a
"cooldown" so a single tap can't chain.

## Assets

### Pixel-extracted PNGs, not SVG approximations

`tools/generate-outlines.mjs` and `tools/generate-finger.mjs` extract
pixels from reference video frames using `sharp` with per-channel
threshold filters. Earlier attempts at SVG approximations of the
hand-drawn shapes looked obviously off (the volcano outline isn't
made of perfect curves).

- **Trade-off**: each new constellation needs a source frame.
- **Why we accept it**: faithfulness to the source art > authoring
  speed. The pipeline is data-driven so re-extracting is one command.
- **Do not** replace the outline PNGs with SVG paths.

### Constellation coords are normalized to the PNG, not the canvas

A `[u, v]` of `[0.5, 0.5]` means the _center of the outline image_,
not the center of the canvas. The layout code centers and scales the
PNG inside the canvas, then maps trace points relative to that.

- Same constellation looks the same regardless of window aspect ratio.
- A point at `[1.5, 0.5]` is allowed and draws to the right of the
  PNG (useful for off-silhouette features).

## Bugs we fixed; don't reintroduce

### `FingerHint.stop()` uses `tweens.killTweensOf(sprite)`, NOT `tween.remove()`

Phaser 3's `TweenChain.remove()` on a `loop: -1` chain throws
`Cannot read 'setRemovedState' of undefined` when the chain's
internal parent ref has been cleared between iterations. The throw
aborted `onPointerDown` before `dragging` was set, leaving the
activity unresponsive — this manifested as "the drag freezes".

`killTweensOf(target)` walks the tween manager and kills anything
affecting the sprite without dereferencing a stale handle.

- **Do not** revert to `this.tween.remove()`.

### Asset discovery checks the response content-type, not just status

Vite's dev server falls back to serving `index.html` for any path
that doesn't match a static file, returning 200 OK with
`Content-Type: text/html`. A naïve "does `constellation_04.json`
return 200?" probe would always say yes. We check the response
content-type to filter out the HTML fallback.

- **Do not** simplify the discovery probe to a bare HEAD-200 check.

### Don't include `test-results/` or `node_modules/` in git

Both are in `.gitignore`. Playwright drops per-run trace.zip + video
into `test-results/` on every run; committing those bloats history.

## Testing

### Playwright drives real DOM mouse events, not synthetic Phaser events

`tests/helpers.ts` uses `page.mouse.down/move/up` against client-px
coordinates computed from the canvas rect. This goes through Phaser's
full input pipeline — same code path the player exercises.

- **Do not** "simplify" tests by emitting `pointerdown` directly on a
  Phaser GameObject. That short-circuits the bug class that matters
  (Phaser input plugin, coord translation, event routing).

### The "completing every segment" test uses direct method calls

The longest test in the suite drives one play-through to the End
phase by calling `display.advanceSegment()` in a loop via
`page.evaluate`, not by stacking 7+ real drags. Input fidelity is
already covered by the dedicated drag test; this test is asserting
the **state machine** reaches End given completed segments.

- **Trade-off**: this one test doesn't exercise the input pipeline.
- **Why we accept it**: with `retries: 1`, a single dropped pointer
  event in headless Chromium across 7 sequential drags has a high
  enough probability of compounding to flake the suite. Splitting
  responsibilities keeps the headless run reliable without losing
  input coverage.
