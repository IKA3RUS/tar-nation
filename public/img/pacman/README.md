# Pac-Man image assets

Files here are served as-is at `/img/pacman/<name>` (Vite `public/` folder).
The renderer references them by that URL and falls back to drawn shapes when a
file is missing or still loading, so art can be dropped in or swapped any time.

## Expected files

| File | Used for | Notes |
| --- | --- | --- |
| `power-pellet.png` | power pellets (4 maze corners) | wide sprite ok; drawn centered on the tile, aspect ratio preserved |

Add more entries (`pellet.png`, `pacman.png`, `ghost-*.png`, ...) as they get
wired up in [`src/features/pacman/render.ts`](../../../src/features/pacman/render.ts).
