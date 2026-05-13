# Design

## What this is

A short, self-contained mini-activity where the player traces a constellation
in the night sky. When the trace is complete, the camera pulls back and the
constellation is revealed as the outline of a creature.

The goal of the activity is low-stakes — there's no "fail" state, no timer,
no score. The point is the small reward of watching the constellation appear
as something recognizable.

## Player flow

1. **Intro modal.** A dark dashed-border panel appears centered on the
   starry background with the title `CONNECT STARS`, a small icon hint,
   and a `Play` button.

2. **Tracing.** The modal fades. A glowing white circle (the _current
   node_) appears at the first point of a randomly-picked constellation.
   A pink ring (the _target_) fades in at the next point, gently pulsing.
   After a brief pause, a pointing-finger sprite animates from the
   current node toward the target, showing what to do.

   The player drags from the current node toward the target. A white
   line follows their cursor. When the cursor reaches the target, the
   line _snaps_ — the line becomes solid between the two nodes, the
   target turns into a new white circle (which is now the current
   node), and a new pink ring appears at the next point. Repeat until
   every point is connected.

3. **Reveal.** When the last segment connects, the camera zooms out
   slightly and a white outline of a creature fades in behind the
   constellation pattern. The constellation lines are the skeleton of
   the creature's silhouette.

4. **End screen.** The constellation's name appears in large all-caps
   white text near the top of the screen. An `OK` button at the bottom
   returns the player to a fresh intro with a randomly-picked
   constellation.

## Visual style

- **Background**: vertical gradient from deep blue at the top to a
  darker purple at the bottom, with a subtle vignette.
- **Stars**: ~50 sparse, slightly-twinkling lavender dots scattered
  across the background.
- **Current node**: filled white circle with a soft glow.
- **Target ring**: hollow magenta ring with a two-layer pink halo —
  bright inner core, dimmer outer falloff. The halo's outer extent is
  sized to match the snap distance, so _what is visibly glowing is what
  the line will snap to._
- **Drag line**: clean white stroke from the current node to the
  cursor.
- **Finger hint**: blue-and-white pointing hand cursor, extracted
  pixel-for-pixel from the reference video frames.
- **Modal panels and buttons**: rounded dashed-border container with
  a blue rounded-button accent.

## Data-driven content

The activity does not hard-code its constellations. At boot it probes
`/assets/constellation_01.{png,json}`, `_02.{png,json}`, … until a
missing index is found. Each pair is a single constellation:

- The **PNG** is the creature's white outline drawing on a transparent
  background. It is what fades in during the reveal.
- The **JSON** is the constellation's name and the ordered list of
  trace points, in coordinates normalized to the PNG: `(0, 0)` is the
  lower-left of the image, `(1, 1)` is the upper-right.

Adding a new constellation is a no-code change: drop in
`constellation_04.png` and `constellation_04.json` and reload. See
[ARCHITECTURE.md](ARCHITECTURE.md) for the schema details.

## Out of scope

- No sound design yet.
- No accessibility affordances beyond standard pointer/touch input
  (no keyboard navigation, no screen-reader labels).
- No persistence — the activity always starts fresh and picks a random
  constellation each time.
- Mobile orientation lock is not implemented; the canvas FITs the
  parent regardless of aspect ratio, with letterboxing.
