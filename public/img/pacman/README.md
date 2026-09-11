# Pac-Man image assets

Files here are served as-is at `/img/pacman/<name>` (Vite `public/` folder).
The renderer references them by URL and falls back to drawn shapes when a file
is missing or still loading, so art can be dropped in or swapped any time.

## Expected files

| File                                        | Used for             | Format                                                                                            |
| ------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------- |
| `power-pellet-1.png` … `power-pellet-5.png` | power item types A-E | single image per type, transparent background; drawn centered on the tile, aspect ratio kept      |
| `doctor.png`                                | all four ghosts      | single static image, shared by every ghost; drawn centered on the ghost's tile, aspect ratio kept |

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

## Ghost sprite

- `doctor.png`, one shared static image for all four ghosts (no per-ghost
  art, no walk animation, no direction flip).
- On-screen size is `GHOST_SPRITE_TILES` tall (default 1.9 tiles), width
  scaled to the image's aspect ratio, centered on the ghost's tile — set in
  [`src/features/pacman/render.ts`](../../../src/features/pacman/render.ts).
- Frightened and eaten ghosts still use the drawn look — add
  `ghost-frightened.png` / `ghost-eyes.png` handling in `render.ts` later if
  wanted.
