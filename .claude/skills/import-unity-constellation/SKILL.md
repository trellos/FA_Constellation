---
name: import-unity-constellation
description: Convert a Unity Constellation prefab (+ its referenced sprite) into a public/assets/constellation_NN.{json,png} pair so it shows up in the FA_Constellation game. Use whenever the user asks to add a constellation from a `.prefab` file from MightierApp.
---

# Import Unity Constellation

Adds a new constellation to FA_Constellation by converting a Unity prefab from
`C:/dev/MightierApp/Assets/Hub/InteractiveSkills/Skills/Constellation/Prefabs/Constellations/`
into the project's [constellation asset format](../../../docs/CONSTELLATIONS.md).

## Inputs

- **Required:** absolute path to a `.prefab` file.
- **Optional:** display name (defaults to the prefab filename without extension, e.g. `Bunny`).
- **Optional:** explicit `NN` slot (defaults to the next free index).

## Steps

1. Confirm the prefab exists. If the user pasted a Windows path with backslashes,
   keep them — Node handles both.

2. Run the converter:

   ```bash
   node tools/import-unity-constellation.mjs <prefab-path> [--name "Display Name"] [--id NN]
   ```

   The tool will:
   - Parse the prefab YAML, find the `SpriteRenderer` (its `m_Sprite` GUID + `m_Size`).
   - Walk up to the Unity `Assets/` root from the prefab path and scan
     `*.png.meta` files to locate the source PNG by GUID.
   - Read every star `PrefabInstance` whose parent transform is `Stars`,
     pulling `m_LocalPosition.{x,y}` and `m_RootOrder`.
   - Normalize world coords to `(u, v)` using `u = (x + size.x/2) / size.x`,
     `v = (y + size.y/2) / size.y`.
   - Sort by `m_RootOrder` (this becomes the trace order).
   - Pick the next free `NN` and write
     `public/assets/constellation_NN.{json,png}`.

3. Validate:

   ```bash
   npm run validate-assets
   ```

4. (Recommended) Visually confirm by running the playthrough-screenshots e2e
   test, which renders an end-to-end run:

   ```bash
   npx playwright test --project=chromium tests/playthrough-screenshots.spec.ts
   ```

   The end-screen screenshot at
   `test-results/playthrough/99-end-screen.png` should show the outline
   sitting under the connected stars. If stars float off the silhouette, the
   prefab's sprite renderer `m_Size` likely doesn't match the artwork — check
   the prefab in the Unity editor or pass `--assets-root` to point at a
   different Unity project.

## Gotchas

- **`Stars` container required:** the prefab must contain a GameObject named
  `Stars` whose Transform parents each `Star` PrefabInstance. All current
  MightierApp constellation prefabs follow this pattern.
- **Trace order is `m_RootOrder`**, not array order in the YAML. A closed-loop
  constellation includes the same point twice (first index and last index).
- **The script never overwrites by default** because it picks the next free
  `NN`. To replace an existing slot, pass `--id NN` explicitly.
- **`bunny` is currently pinned in `ConstellationManager.start()`** (see the
  `// TEMP:` marker). Once we re-enable random selection, remove that branch.

## Examples

```bash
# Add a constellation, pick name/slot automatically:
node tools/import-unity-constellation.mjs \
  "C:/dev/MightierApp/Assets/Hub/InteractiveSkills/Skills/Constellation/Prefabs/Constellations/Bear.prefab"

# Replace slot 02 with a custom display name:
node tools/import-unity-constellation.mjs \
  "C:/dev/MightierApp/Assets/.../Whale.prefab" \
  --name "Star Whale" \
  --id 2
```
