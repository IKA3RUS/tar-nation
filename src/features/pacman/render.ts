import { MAZE, MAZE_COLS, MAZE_ROWS, TILE } from "./maze";

export type Direction = "up" | "down" | "left" | "right";

/** Placeholder palette — will be replaced later. */
const COLORS = {
  background: "#000000",
  wall: "#2121de",
  door: "#ffb8ff",
  pellet: "#ffb897",
  power: "#ffb897",
  pacman: "#ffff00",
};

const DIR_ANGLE: Record<Direction, number> = {
  right: 0,
  down: Math.PI / 2,
  left: Math.PI,
  up: -Math.PI / 2,
};

export type PacState = {
  /** Position in tile units (fractional while moving between tiles). */
  x: number;
  y: number;
  dir: Direction;
  /** Mouth openness, 0 (shut) to 1 (fully open). */
  mouth: number;
};

function drawMaze(ctx: CanvasRenderingContext2D) {
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
      } else if (tile === "pellet") {
        ctx.fillStyle = COLORS.pellet;
        ctx.beginPath();
        ctx.arc(cx, cy, TILE * 0.1, 0, Math.PI * 2);
        ctx.fill();
      } else if (tile === "power") {
        ctx.fillStyle = COLORS.power;
        ctx.beginPath();
        ctx.arc(cx, cy, TILE * 0.3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

function drawPacman(ctx: CanvasRenderingContext2D, pac: PacState) {
  const cx = pac.x * TILE + TILE / 2;
  const cy = pac.y * TILE + TILE / 2;
  const radius = TILE * 0.45;
  const half = (pac.mouth * Math.PI) / 4;
  const facing = DIR_ANGLE[pac.dir];

  ctx.fillStyle = COLORS.pacman;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.arc(cx, cy, radius, facing + half, facing - half + Math.PI * 2);
  ctx.closePath();
  ctx.fill();
}

/** Clear the canvas and draw the current game state. */
export function drawFrame(
  ctx: CanvasRenderingContext2D,
  state: { pac: PacState },
) {
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, MAZE_COLS * TILE, MAZE_ROWS * TILE);
  drawMaze(ctx);
  drawPacman(ctx, state.pac);
}
