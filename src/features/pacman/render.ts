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

export const CANVAS_W = MAZE_COLS * TILE;
export const CANVAS_H = MAZE_ROWS * TILE + HEADER;

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

const POWER_PELLET_SRC = "/img/pacman/power-pellet.png";

function drawPowerPellet(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
) {
  const img = loadImage(POWER_PELLET_SRC);
  if (imageReady(img)) {
    const w = TILE * 2.4;
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
 * Ghost walk sprite: `public/img/pacman/ghost-<name>.png`, a single horizontal
 * strip of `GHOST_SPRITE_FRAMES` equal-width frames facing right. The frame
 * advances only while the ghost is moving and is flipped for leftward travel.
 * Frightened and eaten ghosts keep their drawn look for now.
 */
const GHOST_SPRITE_FRAMES = 6;
const GHOST_SPRITE_FPS = 10;
/** On-screen height of a ghost sprite, in tiles. */
const GHOST_SPRITE_TILES = 1.9;

function drawGhostSprite(ctx: CanvasRenderingContext2D, g: Ghost): boolean {
  const img = loadImage(`/img/pacman/ghost-${g.name}.png`);
  if (!imageReady(img)) return false;

  const fw = img.naturalWidth / GHOST_SPRITE_FRAMES;
  const fh = img.naturalHeight;
  const moving = g.phase !== "house";
  const frame = moving
    ? Math.floor(g.anim * GHOST_SPRITE_FPS) % GHOST_SPRITE_FRAMES
    : 0;

  const cx = g.x * TILE + TILE / 2;
  const cy = g.y * TILE + TILE / 2;
  const destH = TILE * GHOST_SPRITE_TILES;
  const destW = destH * (fw / fh);

  ctx.save();
  ctx.translate(cx, cy);
  if (g.dir === "left") ctx.scale(-1, 1);
  ctx.drawImage(
    img,
    frame * fw,
    0,
    fw,
    fh,
    -destW / 2,
    -destH / 2,
    destW,
    destH,
  );
  ctx.restore();
  return true;
}

function drawMaze(
  ctx: CanvasRenderingContext2D,
  pellets: Set<number>,
  powerItems: Set<number>,
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
        if (powerItems.has(key)) {
          drawPowerPellet(ctx, cx, cy);
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

function drawHealthGauge(ctx: CanvasRenderingContext2D, health: number) {
  const x = CANVAS_W - TILE * 0.5 - GAUGE_W;
  const y = HEADER / 2 - GAUGE_H / 2;
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

function drawTimer(ctx: CanvasRenderingContext2D, elapsed: number) {
  const remaining = ROUND_SECONDS - elapsed;
  ctx.fillStyle = remaining <= 10 ? COLORS.danger : COLORS.text;
  ctx.font = `${TILE}px monospace`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.fillText(formatTime(remaining), CANVAS_W / 2, HEADER / 2);
}

function drawHeader(ctx: CanvasRenderingContext2D, game: GameState) {
  const midY = HEADER / 2;

  ctx.fillStyle = COLORS.text;
  ctx.font = `${TILE}px monospace`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillText(`SCORE ${game.score}`, TILE / 2, midY);

  drawTimer(ctx, game.elapsed);
  drawHealthGauge(ctx, game.health);
}

function drawCenteredLines(
  ctx: CanvasRenderingContext2D,
  lines: { text: string; size: number; color: string; gap?: number }[],
) {
  const cx = CANVAS_W / 2;
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
  ctx.fillRect(0, HEADER, CANVAS_W, CANVAS_H - HEADER);

  if (game.status === "ready") {
    drawCenteredLines(ctx, [
      { text: "PAC-MAN", size: TILE * 2.2, color: COLORS.pacman, gap: TILE },
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
        : { text: "GAME OVER", color: COLORS.danger };
  drawCenteredLines(ctx, [
    {
      text: headline.text,
      size: TILE * 1.7,
      color: headline.color,
      gap: TILE,
    },
    { text: `SCORE ${game.score}`, size: TILE * 0.95, color: COLORS.text },
    {
      text: "PRESS R TO RESTART",
      size: TILE * 0.8,
      color: COLORS.hint,
      gap: TILE,
    },
  ]);
}

/** Clear the canvas and draw the current game state. */
export function drawFrame(ctx: CanvasRenderingContext2D, game: GameState) {
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  drawHeader(ctx, game);

  const frightened = game.frightenedLeft > 0;
  const flashing =
    frightened &&
    game.frightenedLeft < 2 &&
    Math.floor(game.frightenedLeft * 6) % 2 === 0;

  ctx.save();
  ctx.translate(0, HEADER);
  drawMaze(ctx, game.pellets, game.powerItems);
  drawPacman(ctx, game.pac);
  for (const ghost of game.ghosts) {
    drawGhost(ctx, ghost, frightened, flashing);
  }
  ctx.restore();

  drawOverlay(ctx, game);
}
