# Constellation Asset Format

Each constellation is a **pair** of files under `public/assets/`:

```
public/assets/constellation_NN.png   ← outline image (white silhouette)
public/assets/constellation_NN.json  ← name + trace points
```

`NN` is a two-digit, **1-based**, **contiguous** index (`01`, `02`, `03`, …).
Discovery stops at the first missing index, so `01, 02, 04` will silently hide
`04`. `npm run validate-assets` fails the build on this.

## JSON shape

```jsonc
{
  "name": "Bunny",
  "points": [
    [0.165, 0.51],
    [0.207, 0.859],
    // …
    [0.165, 0.51]
  ]
}
```

| field    | type                       | required | notes |
|----------|----------------------------|----------|-------|
| `name`   | non-empty string           | yes      | Shown on the end screen, all-caps. |
| `points` | array of `[u, v]` numbers  | yes      | At least 2 entries. Values must be finite. Values outside `[0, 1]` are allowed but warned. |

### Coordinate space

Trace points are in **PNG-normalized space**:

- `(0, 0)` = lower-left corner of the outline image
- `(1, 1)` = upper-right corner of the outline image
- `u` grows to the right, `v` grows **up** (math/Unity convention — not screen convention)

The display layer flips `v` when rendering (`src/OutlineLayout.ts`).

### Trace order

Connections run `points[i] → points[i+1]`. The user must drag the line from
each point to the next, in order. To draw a closed loop, repeat the first
point as the last entry (Bunny does this).

## PNG conventions

- White silhouette on transparent background works best — the outline reveals
  at the end by tweening alpha 0 → 1 over a starfield.
- Any size is fine. Aspect ratio is preserved; the image is fitted to
  `OUTLINE_FILL` (78%) of the smaller screen dimension.
- 8-bit RGBA PNG. Examples in the repo range from ~700px to 1024px on a side.

## Discovery + validation

- Probed by `ConstellationManager.discoverAvailable()` (`src/ConstellationManager.ts`).
  Probes are HEAD requests and check `Content-Type` to reject Vite's SPA fallback
  for missing files.
- Validated at runtime by `validateConstellationData()` (`src/types.ts`) and
  at build time by `tools/validate-assets.mjs`.

## Converting from a Unity prefab

For prefabs from the MightierApp Constellation system, use:

```bash
node tools/import-unity-constellation.mjs <path-to-Prefab.prefab>
```

This:

1. Parses the prefab YAML and finds the `Stars` container.
2. Reads each star's `m_LocalPosition` + `m_RootOrder` (trace order = `RootOrder`).
3. Reads the `CompleteSprite` SpriteRenderer's `m_Sprite` GUID and `m_Size`
   (Unity world-unit size of the sprite, e.g. `10.24 × 10.24`).
4. Locates the source PNG by scanning `*.png.meta` files in the Unity Assets
   tree for that GUID.
5. Normalizes `(x, y)` → `(u, v)` using `u = (x + size/2) / size`,
   `v = (y + size/2) / size`.
6. Picks the next free `NN`, writes `constellation_NN.json` and copies the PNG
   to `constellation_NN.png`.

Run `npm run validate-assets` afterward to confirm the pair is well-formed.

## Adding by hand

If you have a PNG + a list of pixel coordinates instead of a prefab:

1. Pick the next free `NN`.
2. Copy the PNG to `public/assets/constellation_NN.png`.
3. For each star pixel `(px, py)` measured from the top-left of the PNG:
   `u = px / width`, `v = 1 - py / height`.
4. Write the JSON with the points in the order the player should connect them.
5. `npm run validate-assets`.
