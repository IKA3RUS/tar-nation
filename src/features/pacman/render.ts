import type { Direction, GameState, Pac } from "./game";
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

function drawHeader(ctx: CanvasRenderingContext2D, game: GameState) {
  ctx.fillStyle = COLORS.text;
  ctx.font = `${TILE}px monospace`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillText(`SCORE ${game.score}`, TILE / 2, HEADER / 2);

  ctx.textAlign = "center";
  if (game.status === "ready") {
    ctx.fillStyle = COLORS.hint;
    ctx.fillText("ARROW KEYS / WASD TO MOVE", CANVAS_W / 2, HEADER / 2);
  } else if (game.status === "won") {
    ctx.fillText("YOU WIN!  PRESS R", CANVAS_W / 2, HEADER / 2);
  }
}

/** Clear the canvas and draw the current game state. */
export function drawFrame(ctx: CanvasRenderingContext2D, game: GameState) {
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  drawHeader(ctx, game);

  ctx.save();
  ctx.translate(0, HEADER);
  drawMaze(ctx, game.pellets);
  drawPacman(ctx, game.pac);
  ctx.restore();
}
