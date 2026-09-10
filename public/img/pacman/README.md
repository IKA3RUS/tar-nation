# Pac-Man image assets

Files here are served as-is at `/img/pacman/<name>` (Vite `public/` folder).
The renderer references them by URL and falls back to drawn shapes when a file
is missing or still loading, so art can be dropped in or swapped any time.

## Expected files

| File | Used for | Format |
| --- | --- | --- |
| `power-pellet-1.png` … `power-pellet-5.png` | power item types A-E | single image per type, transparent background; drawn centered on the tile, aspect ratio kept |
| `ghost-blinky.png` | Blinky's walk cycle | horizontal sprite strip — see below |
| `ghost-pinky.png` | Pinky's walk cycle | " |
| `ghost-inky.png` | Inky's walk cycle | " |
| `ghost-clyde.png` | Clyde's walk cycle | " |

## Power item types

- `power-pellet-<n>.png` (1-5) maps to item type A-E (type index `n - 1`),
  set in [`src/features/pacman/render.ts`](../../../src/features/pacman/render.ts)
  (`POWER_ITEM_TYPES`).
- How many types are actually in play at once is
  [`src/features/pacman/game.ts`](../../../src/features/pacman/game.ts)'s
  `POWER_ITEM_TARGET` (currently 4, planned to reach 5 — type E stays
  uncollectable, but its badge still shows, until then).
- Each type keeps its slot across respawns: eating a type-C item, say,
  immediately places a new type-C item elsewhere, so its letter and sprite
  stay consistent for the whole round.
- All five files are currently duplicates of the original
  `power-pellet.png` as placeholders — swap in distinct art per type
  whenever it's ready.

## Ghost walk strip

- One PNG per ghost, transparent background.
- A **single horizontal row** of equal-width frames, character **facing right**.
- Frame count and speed are set in
  [`src/features/pacman/render.ts`](../../../src/features/pacman/render.ts)
  (`GHOST_SPRITE_FRAMES`, default 6; `GHOST_SPRITE_FPS`, default 10).
- The frame index advances only while the ghost is moving; it is mirrored
  automatically when the ghost walks left. Up / down reuse the side view.
- On-screen size is `GHOST_SPRITE_TILES` tall (default 1.9 tiles), width scaled
  to the frame's aspect ratio, centered on the ghost's tile.
- Frightened and eaten ghosts still use the drawn look — add
  `ghost-frightened.png` / `ghost-eyes.png` handling in `render.ts` later if
  wanted.
