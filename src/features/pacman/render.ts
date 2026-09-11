import { VEC, type Direction } from "./dir";
import { MAX_HEALTH, ROUND_SECONDS, type GameState, type Pac } from "./game";
import type { Ghost } from "./ghosts";
import { MAZE, MAZE_COLS, MAZE_ROWS, pelletKey, TILE } from "./maze";

/**
 * The map's palette, so the two pages read as one product: near-black ground,
 * one red, and stone greys for everything that is not the subject. The red is
 * `--color-tar-red` / `--color-tar-red-dark` from `globals.css`; the greys are
 * Tailwind's stone ramp. Kept as literals because canvas cannot read CSS custom
 * properties.
 */
const COLORS = {
  background: "#0c0a09", // stone-950, matching the page behind the canvas
  wall: "#960000", // tar-red-dark — the shade the map gives an unhovered state
  door: "#5e0000", // the map's keyline red
  pellet: "#a8a29e", // stone-400
  power: "#e7e5e4", // stone-200
  powerGlow: "#c80000", // tar-red
  pacman: "#c80000", // tar-red — the accent on scores and gauges
  text: "#fafaf9", // stone-50
  hint: "#78716c", // stone-500
  danger: "#c80000", // tar-red, against white text the rest of the time
  frightened: "#44403c", // stone-700 — ghosts drain of colour when edible
  frightenedFlash: "#fafaf9",
  eyeWhite: "#fafaf9",
  pupil: "#0c0a09",
  gaugeBg: "#292524", // stone-800
  gaugeBorder: "#000000", // every keyline on these pages is black
};

/** The page's pixel face. Canvas draws with it as soon as it has loaded. */
const FONT = '"PP NeueBit", ui-monospace, monospace';

/** Height of the score strip above the maze, in pixels. */
const HEADER = TILE * 2;
/** Width of the item-count panel to the left of the maze, in pixels. */
const SIDEBAR_W = TILE * 3.7;

export const CANVAS_W = SIDEBAR_W + MAZE_COLS * TILE;
export const CANVAS_H = MAZE_ROWS * TILE + HEADER;

/**
 * Horizontal center of the maze viewport (excludes the sidebar). The end-screen
 * text is centered here, so the HTML "View Details" button must be too.
 */
export const END_SCREEN_CENTER_X = SIDEBAR_W + (CANVAS_W - SIDEBAR_W) / 2;
/**
 * Pixel offset, from the canvas's top edge, just below "PRESS R TO RESTART" on
 * the end screen — where the HTML "View Details" button sits.
 */
export const END_SCREEN_BUTTON_TOP =
  HEADER + (CANVAS_H - HEADER) / 2 + TILE * 3.3;

const DIR_ANGLE: Record<Direction, number> = {
  right: 0,
  down: Math.PI / 2,
  left: Math.PI,
  up: -Math.PI / 2,
};

/**
 * Optional art lives in `public/img/pacman/` and is referenced by URL. Images
 * load lazily (never during SSR) and are only drawn once decoded, so every draw
 * path falls back to a shape until (or unless) the file is added.
 */
const imageCache = new Map<string, HTMLImageElement>();

function loadImage(src: string): HTMLImageElement | null {
  if (typeof Image === "undefined") return null;
  let img = imageCache.get(src);
  if (!img) {
    img = new Image();
    img.src = src;
    imageCache.set(src, img);
  }
  return img;
}

function imageReady(img: HTMLImageElement | null): img is HTMLImageElement {
  return img != null && img.complete && img.naturalWidth > 0;
}

/** Item types A-E; each has its own sprite, `power-pellet-<n>.png` (1-based). */
export const POWER_ITEM_TYPES = ["A", "B", "C", "D"];

/**
 * Per-type glow; index = type (`power-pellet-<index+1>.png`). `rings` is how
 * many blocks thick the halo is, `alpha` how solid its innermost ring is.
 * Pellets 1 and 2 glow hard, pellets 3 and 4 barely.
 */
const POWER_GLOW: { rings: number; alpha: number }[] = [
  { rings: 3, alpha: 0.6 },
  { rings: 3, alpha: 0.6 },
  { rings: 1, alpha: 0.45 },
  { rings: 1, alpha: 0.45 },
];
const POWER_GLOW_DEFAULT = { rings: 2, alpha: 0.5 };
/** The eight directions a ring is stamped in to dilate the silhouette. */
const RING_STEPS = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
] as const;

/**
 * A halo built the way the rest of this screen is: whole blocks, no blur. The
 * silhouette is stamped once per direction per ring, each ring a block further
 * out and a step fainter, which gives hard-edged bands instead of a gradient.
 */
function drawBlockGlow(
  ctx: CanvasRenderingContext2D,
  sil: CanvasImageSource,
  dx: number,
  dy: number,
  w: number,
  h: number,
  rings: number,
  alpha: number,
) {
  // One block is one step. Rounded so every ring lands on whole pixels.
  const step = Math.max(2, Math.round(TILE * 0.13));
  ctx.save();
  for (let r = rings; r >= 1; r--) {
    ctx.globalAlpha = Math.max(0.08, alpha * (1 - (r - 1) / (rings + 0.5)));
    for (const [ox, oy] of RING_STEPS) {
      ctx.drawImage(sil, dx + ox * r * step, dy + oy * r * step, w, h);
    }
  }
  ctx.restore();
}

function drawPowerPellet(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  type: number,
) {
  const src = `/img/pacman/power-pellet-${type + 1}.png`;
  const img = loadImage(src);
  // Two frames, not a sine: the halo steps between two sizes the way a sprite
  // animation would.
  const pulse = Math.floor(performance.now() / 380) % 2;
  const glow = POWER_GLOW[type] ?? POWER_GLOW_DEFAULT;
  const rings = glow.rings + pulse;

  if (imageReady(img)) {
    // Width matches a maze tile so tall/narrow art doesn't spill into walls.
    const w = TILE;
    const h = w * (img.naturalHeight / img.naturalWidth);
    const dx = cx - w / 2;
    const dy = cy - h / 2;

    // Glow hugs the sprite's outline: cast the shadow from a flat silhouette
    // (uniformly opaque for every item) rather than the art itself, so the
    // halo follows the shape; per-type strength comes only from POWER_GLOW.
    const sil = getSilhouette(src, img, COLORS.powerGlow);
    if (sil) drawBlockGlow(ctx, sil, dx, dy, w, h, rings, glow.alpha);

    ctx.drawImage(img, dx, dy, w, h);
    return;
  }

  // No art yet: a square block and a square halo, same idea.
  const size = TILE * 0.6;
  const step = Math.max(2, Math.round(TILE * 0.13));
  ctx.save();
  ctx.fillStyle = COLORS.powerGlow;
  for (let r = rings; r >= 1; r--) {
    ctx.globalAlpha = Math.max(
      0.08,
      glow.alpha * (1 - (r - 1) / (rings + 0.5)),
    );
    const grow = r * step;
    ctx.fillRect(
      cx - size / 2 - grow,
      cy - size / 2 - grow,
      size + grow * 2,
      size + grow * 2,
    );
  }
  ctx.restore();
  ctx.fillStyle = COLORS.power;
  ctx.fillRect(cx - size / 2, cy - size / 2, size, size);
}

/**
 * Ghost sprite: `public/img/pacman/doctor.png`, one static portrait shared by
 * every ghost. Eaten ghosts keep their drawn eyes.
 */
const GHOST_SPRITE_SRC = "/img/pacman/doctor.png";
/**
 * On-screen height of a ghost sprite, in tiles. At TILE = 28 this is ~39px —
 * deliberately wider than a corridor, so a doctor reads as a threat rather
 * than as another pellet. The overspill onto the walls is the point.
 */
const GHOST_SPRITE_TILES = 1.4;

function drawGhostSprite(ctx: CanvasRenderingContext2D, g: Ghost): boolean {
  const img = loadImage(GHOST_SPRITE_SRC);
  if (!imageReady(img)) return false;

  const cx = g.x * TILE + TILE / 2;
  const cy = g.y * TILE + TILE / 2;
  const destH = TILE * GHOST_SPRITE_TILES;
  const destW = destH * (img.naturalWidth / img.naturalHeight);

  ctx.drawImage(img, cx - destW / 2, cy - destH / 2, destW, destH);
  return true;
}

function drawMaze(
  ctx: CanvasRenderingContext2D,
  powerItems: Map<number, number>,
) {
  for (let row = 0; row < MAZE_ROWS; row++) {
    for (let col = 0; col < MAZE_COLS; col++) {
      const tile = MAZE[row][col];
      const x = col * TILE;
      const y = row * TILE;
      const cx = x + TILE / 2;
      const cy = y + TILE / 2;

      if (tile === "wall") {
        // Extend 1px into wall neighbours to the right / below so fractional
        // scaling (browser zoom, HiDPI) can't leave seams between tiles.
        const right = MAZE[row]?.[col + 1] === "wall" ? 1 : 0;
        const down = MAZE[row + 1]?.[col] === "wall" ? 1 : 0;
        ctx.fillStyle = COLORS.wall;
        ctx.fillRect(x, y, TILE + right, TILE + down);
      } else if (tile === "door") {
        ctx.fillStyle = COLORS.door;
        ctx.fillRect(x, cy - 1, TILE, 2);
      } else {
        // Only live power items are drawn; plain pellets are invisible.
        const type = powerItems.get(pelletKey(col, row));
        if (type !== undefined) drawPowerPellet(ctx, cx, cy, type);
      }
    }
  }
}

/**
 * A solid-colour silhouette of a decoded sprite, built once on an offscreen
 * canvas and cached by `src|colour`. Used to stamp a crisp outline.
 */
const silhouetteCache = new Map<string, HTMLCanvasElement>();

function getSilhouette(
  src: string,
  img: HTMLImageElement,
  color: string,
): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const key = `${src}|${color}`;
  const cached = silhouetteCache.get(key);
  if (cached) return cached;

  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const g = c.getContext("2d");
  if (!g) return null;
  g.drawImage(img, 0, 0);
  g.globalCompositeOperation = "source-in";
  g.fillStyle = color;
  g.fillRect(0, 0, c.width, c.height);

  silhouetteCache.set(key, c);
  return c;
}

/**
 * Player sprite. Rotated to the current direction, with an outline-hugging glow
 * (power-pellet-3 strength) so it reads against the maze; falls back to the
 * drawn animated mouth when the file is missing. While an eaten item is still
 * burning down (§6 residual DoT) the "smoking" art shows; otherwise the clean
 * one.
 */
const PACMAN_SRC_SMOKING = "/img/pacman/mukesh.png";
const PACMAN_SRC_CLEAN = "/img/pacman/mukesh-nonsmoke.png";
const PACMAN_GLOW_COLOR = "#ffffff";
/** Glow blur multiplier — matches `POWER_GLOW[2]` (power pellet 3). */
const PACMAN_GLOW_BLUR = 0.6;

function drawPacmanSprite(
  ctx: CanvasRenderingContext2D,
  pac: Pac,
  smoking: boolean,
): boolean {
  const src = smoking ? PACMAN_SRC_SMOKING : PACMAN_SRC_CLEAN;
  const img = loadImage(src);
  if (!imageReady(img)) return false;

  const cx = pac.x * TILE + TILE / 2;
  const cy = pac.y * TILE + TILE / 2;
  const w = TILE * 1.3;
  const h = w * (img.naturalHeight / img.naturalWidth);
  const dx = -w / 2;
  const dy = -h / 2;

  const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 350);
  const blur = TILE * (0.4 + pulse * 0.7) * PACMAN_GLOW_BLUR;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(DIR_ANGLE[pac.dir]);

  // Glow cast from the sprite's silhouette so it hugs the outline.
  const sil = getSilhouette(src, img, PACMAN_GLOW_COLOR);
  if (sil) {
    ctx.save();
    ctx.shadowColor = PACMAN_GLOW_COLOR;
    ctx.shadowBlur = blur;
    ctx.drawImage(sil, dx, dy, w, h);
    ctx.restore();
  }

  ctx.drawImage(img, dx, dy, w, h);
  ctx.restore();
  return true;
}

function drawPacman(ctx: CanvasRenderingContext2D, pac: Pac, smoking: boolean) {
  if (drawPacmanSprite(ctx, pac, smoking)) return;

  const cx = pac.x * TILE + TILE / 2;
  const cy = pac.y * TILE + TILE / 2;
  const radius = TILE * 0.45;

  // Mouth chomps while moving, rests half-open when stopped.
  const openness = pac.moving ? 0.5 - 0.5 * Math.cos(pac.anim * 16) : 0.4;
  const half = (0.06 + 0.74 * openness) * (Math.PI / 4);
  const facing = DIR_ANGLE[pac.dir];

  ctx.fillStyle = COLORS.pacman;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.arc(cx, cy, radius, facing + half, facing - half + Math.PI * 2);
  ctx.closePath();
  ctx.fill();
}

function drawGhostEyes(
  ctx: CanvasRenderingContext2D,
  g: Ghost,
  cx: number,
  cy: number,
  r: number,
) {
  const eyeDx = TILE * 0.16;
  const eyeDy = -r * 0.1;
  const look = VEC[g.dir];
  for (const side of [-1, 1]) {
    ctx.fillStyle = COLORS.eyeWhite;
    ctx.beginPath();
    ctx.ellipse(
      cx + side * eyeDx,
      cy + eyeDy,
      r * 0.26,
      r * 0.32,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.fillStyle = COLORS.pupil;
    ctx.beginPath();
    ctx.arc(
      cx + side * eyeDx + look.x * r * 0.12,
      cy + eyeDy + look.y * r * 0.14,
      r * 0.14,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
}

function drawGhostBody(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  color: string,
) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy - r * 0.15, r, Math.PI, 0);
  ctx.lineTo(cx + r, cy + r * 0.6);
  const feet = 3;
  for (let i = 0; i < feet; i++) {
    const xMid = cx + r - (2 * r * (i + 0.5)) / feet;
    const xEnd = cx + r - (2 * r * (i + 1)) / feet;
    ctx.quadraticCurveTo(xMid, cy + r * 1.05, xEnd, cy + r * 0.6);
  }
  ctx.closePath();
  ctx.fill();
}

function drawGhost(ctx: CanvasRenderingContext2D, g: Ghost) {
  const cx = g.x * TILE + TILE / 2;
  const cy = g.y * TILE + TILE / 2;
  const r = TILE * 0.45;

  // Eaten ghosts are just a pair of eyes floating home.
  if (g.phase === "eaten") {
    drawGhostEyes(ctx, g, cx, cy, r);
    return;
  }

  // Prefer the doctor sprite; fall back to the classic blob when it is missing.
  if (drawGhostSprite(ctx, g)) return;

  drawGhostBody(ctx, cx, cy, r, g.color);
  drawGhostEyes(ctx, g, cx, cy, r);
}

/** Health is shown as LUNGS lungs, each worth MAX_HEALTH / LUNGS HP. */
const LUNGS = 5;
const LUNG_SRC = "/img/pacman/lang.png";

function paintLung(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | null,
  x: number,
  y: number,
  size: number,
) {
  if (img != null && imageReady(img)) {
    ctx.drawImage(img, x, y, size, size);
  } else {
    ctx.fillStyle = COLORS.pacman;
    ctx.fillRect(x, y, size, size);
  }
}

/**
 * The 5 lungs form one meter that empties right to left: the healthy fraction
 * of HP shows solid, the rest is hidden down to a faint outline. The boundary
 * lung is sliced vertically, so even a fraction of a lung reads.
 */
function drawHealthGauge(
  ctx: CanvasRenderingContext2D,
  health: number,
  midY: number,
) {
  const img = loadImage(LUNG_SRC);
  const size = HEADER * 0.82;
  const gap = TILE * 0.16;
  const totalW = LUNGS * size + (LUNGS - 1) * gap;
  const x0 = CANVAS_W - TILE * 0.5 - totalW;
  const y = midY - size / 2;
  const shownW = totalW * Math.max(0, Math.min(1, health / MAX_HEALTH));

  // Faint outline of every slot.
  ctx.save();
  ctx.globalAlpha = 0.14;
  for (let i = 0; i < LUNGS; i++) {
    paintLung(ctx, img, x0 + i * (size + gap), y, size);
  }
  ctx.restore();

  // Solid lungs, revealed from the left up to the healthy fraction.
  if (shownW > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, y - 1, shownW, size + 2);
    ctx.clip();
    for (let i = 0; i < LUNGS; i++) {
      paintLung(ctx, img, x0 + i * (size + gap), y, size);
    }
    ctx.restore();
  }
}

function formatTime(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function drawTimer(
  ctx: CanvasRenderingContext2D,
  elapsed: number,
  midY: number,
) {
  const remaining = ROUND_SECONDS - elapsed;
  ctx.fillStyle = remaining <= 10 ? COLORS.danger : COLORS.text;
  ctx.font = `${TILE * 1.7}px ${FONT}`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.fillText(formatTime(remaining), CANVAS_W / 2, midY);
}

/** Draws a type's icon (image if loaded, else its letter) into a box. */
function drawItemIcon(
  ctx: CanvasRenderingContext2D,
  type: number,
  letter: string,
  x: number,
  y: number,
  size: number,
  dim: boolean,
) {
  const img = loadImage(`/img/pacman/power-pellet-${type + 1}.png`);
  if (imageReady(img)) {
    const w = Math.min(size, size * (img.naturalWidth / img.naturalHeight));
    ctx.drawImage(img, x + (size - w) / 2, y, w, size);
    return;
  }
  ctx.fillStyle = dim ? COLORS.hint : COLORS.background;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(letter, x + size / 2, y + size / 2 + 1);
}

/**
 * Item-count panel to the left of the maze: one badge per type, stacked
 * vertically, showing that type's icon and how many have been eaten.
 */
function drawSidebar(ctx: CanvasRenderingContext2D, collectedCounts: number[]) {
  const badgeW = SIDEBAR_W - TILE * 0.8;
  const badgeH = TILE * 1.6;
  const gap = TILE * 0.4;
  const x = TILE * 0.4;
  let y = HEADER + TILE * 0.6;

  ctx.font = `${TILE * 0.5}px ${FONT}`;

  for (const [type, letter] of POWER_ITEM_TYPES.entries()) {
    const count = collectedCounts[type];
    const got = count > 0;

    ctx.fillStyle = got ? COLORS.pacman : COLORS.gaugeBg;
    ctx.fillRect(x, y, badgeW, badgeH);
    ctx.strokeStyle = COLORS.gaugeBorder;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, badgeW, badgeH);

    const iconSize = badgeH - TILE * 0.3;
    drawItemIcon(
      ctx,
      type,
      letter,
      x + TILE * 0.15,
      y + TILE * 0.15,
      iconSize,
      !got,
    );

    ctx.fillStyle = got ? COLORS.background : COLORS.hint;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(`×${count}`, x + badgeW - 4, y + badgeH / 2 + 1);

    y += badgeH + gap;
  }
}

function drawHeader(ctx: CanvasRenderingContext2D, game: GameState) {
  const midY = HEADER / 2;

  drawTimer(ctx, game.elapsed, midY);
  drawHealthGauge(ctx, game.health, midY);
}

function drawCenteredLines(
  ctx: CanvasRenderingContext2D,
  lines: { text: string; size: number; color: string; gap?: number }[],
) {
  const cx = END_SCREEN_CENTER_X;
  let y = HEADER + (CANVAS_H - HEADER) / 2;
  const total = lines.reduce(
    (sum, l) => sum + l.size + (l.gap ?? l.size * 0.6),
    0,
  );
  y -= total / 2;

  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (const line of lines) {
    ctx.fillStyle = line.color;
    ctx.font = `${line.size}px ${FONT}`;
    ctx.fillText(line.text, cx, y);
    y += line.size + (line.gap ?? line.size * 0.6);
  }
}

/** Start screen, win / game-over screens, and the mid-round READY! flash. */
function drawOverlay(ctx: CanvasRenderingContext2D, game: GameState) {
  if (game.status === "playing") {
    if (game.pauseLeft > 0) {
      drawCenteredLines(ctx, [
        { text: "READY!", size: TILE * 1.3, color: COLORS.pacman },
      ]);
    }
    return;
  }

  ctx.fillStyle = "rgba(0, 0, 0, 0.72)";
  ctx.fillRect(SIDEBAR_W, HEADER, CANVAS_W - SIDEBAR_W, CANVAS_H - HEADER);

  if (game.status === "ready") {
    drawCenteredLines(ctx, [
      { text: "PRESS AN ARROW KEY", size: TILE * 0.85, color: COLORS.text },
      { text: "ARROWS / WASD TO MOVE", size: TILE * 0.7, color: COLORS.hint },
    ]);
    return;
  }

  const headline =
    game.status === "timeout"
      ? { text: "YOU SURVIVED", color: COLORS.hint }
      : { text: "You are Dead", color: COLORS.danger };

  const cx = END_SCREEN_CENTER_X;
  const cy = HEADER + (CANVAS_H - HEADER) / 2;

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = headline.color;
  ctx.font = `${TILE * 1.7}px ${FONT}`;
  ctx.fillText(headline.text, cx, cy - TILE * 3.4);

  drawItemBreakdown(ctx, game.collectedCounts, cx, cy - TILE * 0.7);

  ctx.fillStyle = COLORS.hint;
  ctx.font = `${TILE * 0.8}px ${FONT}`;
  ctx.fillText("PRESS R TO RESTART", cx, cy + TILE * 2.3);
}

/** Row of item icons + how many of each were collected, shown on the end screen. */
function drawItemBreakdown(
  ctx: CanvasRenderingContext2D,
  collectedCounts: number[],
  cx: number,
  cy: number,
) {
  const iconSize = TILE * 1.4;
  const gap = TILE * 0.7;
  const count = POWER_ITEM_TYPES.length;
  const totalW = count * iconSize + (count - 1) * gap;
  let x = cx - totalW / 2;

  ctx.font = `${TILE * 0.55}px ${FONT}`;

  for (const [type, letter] of POWER_ITEM_TYPES.entries()) {
    drawItemIcon(ctx, type, letter, x, cy, iconSize, false);

    ctx.fillStyle = COLORS.text;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(
      `×${collectedCounts[type]}`,
      x + iconSize / 2,
      cy + iconSize + 4,
    );

    x += iconSize + gap;
  }
}

/** Clear the canvas and draw the current game state. */
/** Seconds left when the screen starts flashing. */
const PANIC_SECONDS = 10;
/** How far the frame lurches, in pixels. Whole numbers — nothing here is smooth. */
const PANIC_SHAKE = 3;
/** Full on/off cycles per second of the red flash. */
const PANIC_BLINK_HZ = 3;

export function drawFrame(ctx: CanvasRenderingContext2D, game: GameState) {
  const remaining = ROUND_SECONDS - game.elapsed;
  // Only while the round is actually running — a paused end screen should not
  // strobe behind the result.
  const panic =
    remaining <= PANIC_SECONDS && remaining > 0 && game.status === "playing";
  const now = performance.now();
  // Steps between whole-pixel offsets rather than easing between them, so the
  // shake reads as a sprite jitter and never blurs the maze.
  const tick = Math.floor(now / 60);
  const shakeX = panic ? ((tick % 3) - 1) * PANIC_SHAKE : 0;
  const shakeY = panic ? (((tick >> 1) % 3) - 1) * PANIC_SHAKE : 0;

  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  ctx.save();
  ctx.translate(shakeX, shakeY);

  drawHeader(ctx, game);
  drawSidebar(ctx, game.collectedCounts);

  ctx.save();
  ctx.translate(SIDEBAR_W, HEADER);
  drawMaze(ctx, game.powerItems);
  drawPacman(ctx, game.pac, game.smokePools.length > 0);
  for (const ghost of game.ghosts) {
    drawGhost(ctx, ghost);
  }
  ctx.restore();

  ctx.restore();

  // On/off, not a fade: the whole screen washes red every other beat, and the
  // wash gets stronger as the clock runs out.
  if (panic && Math.floor((now / 1000) * PANIC_BLINK_HZ) % 2 === 0) {
    const urgency = 1 - remaining / PANIC_SECONDS;
    ctx.save();
    ctx.globalAlpha = 0.12 + urgency * 0.22;
    ctx.fillStyle = COLORS.danger;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.restore();
  }

  drawOverlay(ctx, game);
}
