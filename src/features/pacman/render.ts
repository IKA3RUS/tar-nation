import { VEC, type Direction } from "./dir";
import { ROUND_SECONDS, type GameState, type Pac } from "./game";
import type { Ghost } from "./ghosts";
import { MAZE, MAZE_COLS, MAZE_ROWS, pelletKey, TILE } from "./maze";

/** Placeholder palette — will be replaced later. */
const COLORS = {
  background: "#000000",
  wall: "#2121de",
  door: "#ffb8ff",
  pellet: "#ffb897",
  power: "#ffb897",
  pacman: "#ffff00",
  text: "#ffffff",
  hint: "#8b8bff",
  danger: "#ff5151",
  frightened: "#2121ff",
  frightenedFlash: "#f0f0f0",
  eyeWhite: "#ffffff",
  pupil: "#0d1b8f",
  gaugeBg: "#333333",
  gaugeBorder: "#ffffff",
};

/** Height of the score strip above the maze, in pixels. */
const HEADER = TILE * 2;
/** Width of the item-count panel to the left of the maze, in pixels. */
const SIDEBAR_W = TILE * 3.7;

export const CANVAS_W = SIDEBAR_W + MAZE_COLS * TILE;
export const CANVAS_H = MAZE_ROWS * TILE + HEADER;

/** Horizontal center of the maze viewport (excludes the sidebar). */
const END_SCREEN_CENTER_X = SIDEBAR_W + (CANVAS_W - SIDEBAR_W) / 2;
/**
 * Pixel offset, from the canvas's top edge, just below "PRESS R TO
 * RESTART" on the end screen — where the HTML restart-adjacent button
 * (e.g. a "View Datavis" link) should be positioned.
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
export const POWER_ITEM_TYPES = ["A", "B", "C", "D", "E"];

function drawPowerPellet(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  type: number,
) {
  const img = loadImage(`/img/pacman/power-pellet-${type + 1}.png`);
  if (imageReady(img)) {
    // Width matches a maze tile so tall/narrow art doesn't spill into walls.
    const w = TILE;
    const h = w * (img.naturalHeight / img.naturalWidth);
    ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
    return;
  }
  ctx.fillStyle = COLORS.power;
  ctx.beginPath();
  ctx.arc(cx, cy, TILE * 0.3, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Ghost sprite: `public/img/pacman/doctor.png`, one static portrait shared
 * by every ghost. Frightened and eaten ghosts keep their drawn look.
 */
const GHOST_SPRITE_SRC = "/img/pacman/doctor.png";
/** On-screen height of a ghost sprite, in tiles; kept near 1 tile so it fits
 * inside single-tile-wide corridors without spilling into the walls. */
const GHOST_SPRITE_TILES = 1.1;

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
  pellets: Set<number>,
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
        ctx.fillStyle = COLORS.wall;
        ctx.fillRect(x, y, TILE, TILE);
      } else if (tile === "door") {
        ctx.fillStyle = COLORS.door;
        ctx.fillRect(x, cy - 1, TILE, 2);
      } else if (tile === "pellet" || tile === "power") {
        const key = pelletKey(col, row);
        if (!pellets.has(key)) continue;
        const type = powerItems.get(key);
        if (type !== undefined) {
          drawPowerPellet(ctx, cx, cy, type);
        } else {
          ctx.fillStyle = COLORS.pellet;
          ctx.beginPath();
          ctx.arc(cx, cy, TILE * 0.1, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }
}

/**
 * Player sprite: `public/img/pacman/mukesh.png`, a single static image
 * facing right. Rotated to match the current direction; falls back to the
 * drawn, animated mouth when the file is missing or still loading.
 */
const PACMAN_SRC = "/img/pacman/mukesh.png";

function drawPacmanSprite(ctx: CanvasRenderingContext2D, pac: Pac): boolean {
  const img = loadImage(PACMAN_SRC);
  if (!imageReady(img)) return false;

  const cx = pac.x * TILE + TILE / 2;
  const cy = pac.y * TILE + TILE / 2;
  const w = TILE * 1.1;
  const h = w * (img.naturalHeight / img.naturalWidth);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(DIR_ANGLE[pac.dir]);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();
  return true;
}

function drawPacman(ctx: CanvasRenderingContext2D, pac: Pac) {
  if (drawPacmanSprite(ctx, pac)) return;

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

function drawGhost(
  ctx: CanvasRenderingContext2D,
  g: Ghost,
  frightened: boolean,
  flashing: boolean,
) {
  const cx = g.x * TILE + TILE / 2;
  const cy = g.y * TILE + TILE / 2;
  const r = TILE * 0.45;

  // Eaten ghosts are just a pair of eyes floating home.
  if (g.phase === "eaten") {
    drawGhostEyes(ctx, g, cx, cy, r);
    return;
  }

  if (frightened && g.phase === "out") {
    const body = flashing ? COLORS.frightenedFlash : COLORS.frightened;
    drawGhostBody(ctx, cx, cy, r, body);
    ctx.fillStyle = flashing ? "#d00000" : COLORS.eyeWhite;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(cx + side * TILE * 0.16, cy - r * 0.1, r * 0.13, 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }

  // Prefer the walk sprite; fall back to the classic blob when it is missing.
  if (drawGhostSprite(ctx, g)) return;

  drawGhostBody(ctx, cx, cy, r, g.color);
  drawGhostEyes(ctx, g, cx, cy, r);
}

const GAUGE_W = TILE * 5;
const GAUGE_H = TILE * 0.8;

function drawHealthGauge(
  ctx: CanvasRenderingContext2D,
  health: number,
  midY: number,
) {
  const x = CANVAS_W - TILE * 0.5 - GAUGE_W;
  const y = midY - GAUGE_H / 2;
  const pct = Math.max(0, Math.min(100, health)) / 100;

  ctx.fillStyle = COLORS.gaugeBg;
  ctx.fillRect(x, y, GAUGE_W, GAUGE_H);

  ctx.fillStyle = pct <= 0.25 ? COLORS.danger : COLORS.pacman;
  ctx.fillRect(x, y, GAUGE_W * pct, GAUGE_H);

  ctx.strokeStyle = COLORS.gaugeBorder;
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, GAUGE_W, GAUGE_H);
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
  ctx.font = `${TILE}px monospace`;
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
function drawSidebar(
  ctx: CanvasRenderingContext2D,
  collectedCounts: number[],
) {
  const badgeW = SIDEBAR_W - TILE * 0.8;
  const badgeH = TILE * 1.6;
  const gap = TILE * 0.4;
  const x = TILE * 0.4;
  let y = HEADER + TILE * 0.6;

  ctx.font = `${TILE * 0.5}px monospace`;

  for (const [type, letter] of POWER_ITEM_TYPES.entries()) {
    const count = collectedCounts[type];
    const got = count > 0;

    ctx.fillStyle = got ? COLORS.pacman : COLORS.gaugeBg;
    ctx.fillRect(x, y, badgeW, badgeH);
    ctx.strokeStyle = COLORS.gaugeBorder;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, badgeW, badgeH);

    const iconSize = badgeH - TILE * 0.3;
    drawItemIcon(ctx, type, letter, x + TILE * 0.15, y + TILE * 0.15, iconSize, !got);

    ctx.fillStyle = got ? COLORS.background : COLORS.hint;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(`×${count}`, x + badgeW - 4, y + badgeH / 2 + 1);

    y += badgeH + gap;
  }
}

function drawHeader(ctx: CanvasRenderingContext2D, game: GameState) {
  const midY = HEADER / 2;

  ctx.fillStyle = COLORS.text;
  ctx.font = `${TILE}px monospace`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillText(`SCORE ${game.score}`, TILE / 2, midY);

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
    ctx.font = `${line.size}px monospace`;
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
      { text: "Tar・Nation", size: TILE * 2.2, color: COLORS.pacman, gap: TILE },
      { text: "PRESS AN ARROW KEY", size: TILE * 0.85, color: COLORS.text },
      { text: "ARROWS / WASD TO MOVE", size: TILE * 0.7, color: COLORS.hint },
    ]);
    return;
  }

  const headline =
    game.status === "won"
      ? { text: "CLEARED!", color: COLORS.pacman }
      : game.status === "timeout"
        ? { text: "TIME UP!", color: COLORS.hint }
        : { text: "You are Dead", color: COLORS.danger };

  const cx = END_SCREEN_CENTER_X;
  const cy = HEADER + (CANVAS_H - HEADER) / 2;

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = headline.color;
  ctx.font = `${TILE * 1.7}px monospace`;
  ctx.fillText(headline.text, cx, cy - TILE * 3.4);

  drawItemBreakdown(ctx, game.collectedCounts, cx, cy - TILE * 0.7);

  ctx.fillStyle = COLORS.hint;
  ctx.font = `${TILE * 0.8}px monospace`;
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

  ctx.font = `${TILE * 0.55}px monospace`;

  for (const [type, letter] of POWER_ITEM_TYPES.entries()) {
    drawItemIcon(ctx, type, letter, x, cy, iconSize, false);

    ctx.fillStyle = COLORS.text;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(`×${collectedCounts[type]}`, x + iconSize / 2, cy + iconSize + 4);

    x += iconSize + gap;
  }
}

/** Clear the canvas and draw the current game state. */
export function drawFrame(ctx: CanvasRenderingContext2D, game: GameState) {
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  drawHeader(ctx, game);
  drawSidebar(ctx, game.collectedCounts);

  const frightened = game.frightenedLeft > 0;
  const flashing =
    frightened &&
    game.frightenedLeft < 2 &&
    Math.floor(game.frightenedLeft * 6) % 2 === 0;

  ctx.save();
  ctx.translate(SIDEBAR_W, HEADER);
  drawMaze(ctx, game.pellets, game.powerItems);
  drawPacman(ctx, game.pac);
  for (const ghost of game.ghosts) {
    drawGhost(ctx, ghost, frightened, flashing);
  }
  ctx.restore();

  drawOverlay(ctx, game);
}
