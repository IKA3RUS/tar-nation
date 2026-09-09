import { MAZE_COLS, PAC_SPAWN, tileAt } from "./maze";

export type Direction = "up" | "down" | "left" | "right";

/** Pac-Man speed in tiles per second. */
const PAC_SPEED = 7.5;

/** Positions closer than this (in tiles) count as tile-aligned. */
const EPS = 1e-6;

const VEC: Record<Direction, { x: -1 | 0 | 1; y: -1 | 0 | 1 }> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const OPPOSITE: Record<Direction, Direction> = {
  up: "down",
  down: "up",
  left: "right",
  right: "left",
};

export type Pac = {
  /** Position in tile units; an integer value means centered on that tile. */
  x: number;
  y: number;
  /** Direction currently moving / facing. */
  dir: Direction;
  /** Direction the player wants to take at the next opportunity. */
  want: Direction;
  /** False when a wall is directly ahead. */
  moving: boolean;
  /** Seconds of movement so far, drives the mouth animation. */
  anim: number;
};

export type GameState = {
  /** Movement is frozen until the first key press. */
  started: boolean;
  pac: Pac;
};

export function createGame(): GameState {
  return {
    started: false,
    pac: {
      x: PAC_SPAWN.col,
      y: PAC_SPAWN.row,
      dir: "left",
      want: "left",
      moving: false,
      anim: 0,
    },
  };
}

/** Whether a tile can be walked onto (walls and the ghost door cannot). */
function canEnter(col: number, row: number): boolean {
  const tile = tileAt(col, row);
  return tile !== "wall" && tile !== "door";
}

/**
 * Distance from `pos` to the next tile center when moving along `dir` (a
 * nonzero step).
 */
function distToNextCenter(pos: number, dir: number): number {
  return dir > 0 ? Math.floor(pos + 1) - pos : pos - Math.ceil(pos - 1);
}

/** Advance the game by `dt` seconds. */
export function step(state: GameState, dt: number): void {
  if (!state.started) return;

  const pac = state.pac;
  let budget = PAC_SPEED * dt;

  // Turning back the way you came is always allowed, even mid-tile.
  if (pac.want === OPPOSITE[pac.dir]) pac.dir = pac.want;

  let moved = false;
  let guard = 0;

  while (budget > EPS && guard++ < 64) {
    const onCenter =
      Math.abs(pac.x - Math.round(pac.x)) < EPS &&
      Math.abs(pac.y - Math.round(pac.y)) < EPS;

    if (onCenter) {
      pac.x = Math.round(pac.x);
      pac.y = Math.round(pac.y);
      const col = pac.x;
      const row = pac.y;

      // Take the queued turn if the way is clear.
      if (pac.want !== pac.dir) {
        const w = VEC[pac.want];
        if (canEnter(col + w.x, row + w.y)) pac.dir = pac.want;
      }

      // Stop when a wall is straight ahead.
      const f = VEC[pac.dir];
      if (!canEnter(col + f.x, row + f.y)) {
        pac.moving = false;
        break;
      }
      pac.moving = true;
    }

    const v = VEC[pac.dir];
    const d =
      v.x !== 0 ? distToNextCenter(pac.x, v.x) : distToNextCenter(pac.y, v.y);
    const move = Math.min(d, budget);

    pac.x += v.x * move;
    pac.y += v.y * move;
    budget -= move;
    moved ||= move > EPS;

    // Wrap through the side tunnel.
    if (pac.x < -0.5) pac.x += MAZE_COLS;
    else if (pac.x >= MAZE_COLS - 0.5) pac.x -= MAZE_COLS;
  }

  if (moved) pac.anim += dt;
}
