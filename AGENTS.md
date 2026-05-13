# Agent Instructions

You're working on a small interactive activity built with Phaser 3 +
TypeScript + Vite. Before you change anything, read the docs in this
order — they're short and they will save you time.

## Read first

1. **[README.md](README.md)** — how to run, build, and add a new
   constellation.
2. **[DESIGN.md](DESIGN.md)** — what the activity _is_ from the
   player's point of view. Use this to check whether a proposed
   change matches the activity's intent.
3. **[ARCHITECTURE.md](ARCHITECTURE.md)** — file layout, runtime
   control flow, state machine, data formats, asset pipeline,
   coordinate system, test approach.
4. **[DECISIONS.md](DECISIONS.md)** — choices the project has already
   made and _why_. Read this **before** changing input thresholds,
   the build setup, the asset pipeline, scene structure, or any
   workaround that looks weird. The "why" is often a bug that already
   bit us once.

## Keep these docs alive

As the project matures, the docs need to grow with it. Treat them as
production code:

- **DESIGN.md** — update when the player flow, visual style, or
  feature scope changes. If you add a new phase, a new screen, a
  sound layer, or a different intro, DESIGN.md should reflect it.
- **ARCHITECTURE.md** — update when the file layout changes, a new
  class is introduced, the state machine gains a transition, a data
  format changes, or the asset pipeline gains a new step. Stale
  diagrams are worse than no diagrams.
- **DECISIONS.md** — append a new section whenever you:
  - Pick one library / approach over another after non-trivial
    consideration.
  - Fix a bug whose root cause is a footgun that someone could
    plausibly reintroduce (especially API misuse, race conditions,
    or platform quirks).
  - Choose a magic number after real-world testing or measurement —
    record the rationale so it doesn't get tuned away.
  - Decide _not_ to do something obvious — the rejected alternative
    is often more useful than the chosen one.

  Each entry should say what was picked, what was rejected, and why
  it matters. Keep entries terse — a paragraph or two each.

- **AGENTS.md** — this file. Update if the doc set changes (new doc
  added, doc retired) or if the project's structure shifts enough
  that the "read first" order needs to change.

## When in doubt

If a change you're considering contradicts something in DECISIONS.md,
either:

1. Make a different change that doesn't contradict it, or
2. Update DECISIONS.md _first_ with the new reasoning, then make the
   change. Don't quietly undo a documented decision.

Same goes for ARCHITECTURE.md: if your change makes the documented
architecture inaccurate, update the doc in the same commit. Reviewers
should never have to choose between trusting the code and trusting
the docs.
