# Pac-Man image assets

Drop sprite images here (e.g. `pellet.png`, `power-pellet.png`, `pacman.png`,
`ghost-blinky.png`, ...). Vite bundles them when imported.

## Wiring an image into the renderer

All drawing lives in [`src/features/pacman/render.ts`](../../../features/pacman/render.ts).
Shapes and the placeholder `COLORS` palette there are meant to be swapped out.

```ts
import pelletUrl from "#/assets/img/pacman/pellet.png";

const pelletImg = new Image();
pelletImg.src = pelletUrl;

// inside drawMaze(), instead of ctx.arc(...):
ctx.drawImage(pelletImg, x, y, TILE, TILE);
```

Load every image once at module scope (as above) so the game loop only draws.
`ctx.drawImage` is a no-op until the image has decoded, so the first frame or two
may render blank — that is fine for a background load.
