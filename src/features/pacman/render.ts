import { VEC, type Direction } from "./dir";
import type { GameState, Pac } from "./game";
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

function drawMaze(ctx: CanvasRenderingContext2D, pellets: Set<number>) {
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
        if (!pellets.has(pelletKey(col, row))) continue;
        ctx.fillStyle = tile === "power" ? COLORS.power : COLORS.pellet;
        ctx.beginPath();
        ctx.arc(cx, cy, TILE * (tile === "power" ? 0.3 : 0.1), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

function drawPacman(ctx: CanvasRenderingContext2D, pac: Pac) {
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

  drawGhostBody(ctx, cx, cy, r, g.color);
  drawGhostEyes(ctx, g, cx, cy, r);
}

function drawLifeIcons(ctx: CanvasRenderingContext2D, lives: number) {
  const r = TILE * 0.36;
  const facing = Math.PI;
  const half = Math.PI / 5;
  ctx.fillStyle = COLORS.pacman;
  for (let i = 0; i < Math.max(0, lives); i++) {
    const cx = CANVAS_W - TILE * 0.9 - i * TILE;
    const cy = HEADER / 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, facing + half, facing - half + Math.PI * 2);
    ctx.closePath();
    ctx.fill();
  }
}

function drawHeader(ctx: CanvasRenderingContext2D, game: GameState) {
  const midY = HEADER / 2;

  ctx.fillStyle = COLORS.text;
  ctx.font = `${TILE}px monospace`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillText(`SCORE ${game.score}`, TILE / 2, midY);

  ctx.textAlign = "center";
  ctx.fillStyle = COLORS.hint;
  ctx.fillText(`HI ${game.hiScore}`, CANVAS_W / 2, midY);

  drawLifeIcons(ctx, game.lives);
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

  const won = game.status === "won";
  drawCenteredLines(ctx, [
    {
      text: won ? "CLEARED!" : "GAME OVER",
      size: TILE * 1.7,
      color: won ? COLORS.pacman : COLORS.danger,
      gap: TILE,
    },
    { text: `SCORE ${game.score}`, size: TILE * 0.95, color: COLORS.text },
    ...(game.score >= game.hiScore && game.score > 0
      ? [{ text: "NEW HI-SCORE!", size: TILE * 0.8, color: COLORS.pacman }]
      : []),
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
  drawMaze(ctx, game.pellets);
  drawPacman(ctx, game.pac);
  for (const ghost of game.ghosts) {
    drawGhost(ctx, ghost, frightened, flashing);
  }
  ctx.restore();

  drawOverlay(ctx, game);
}
