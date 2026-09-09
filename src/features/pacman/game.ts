import {
  initialPellets,
  MAZE_COLS,
  PAC_SPAWN,
  pelletKey,
  tileAt,
} from "./maze";

export type Direction = "up" | "down" | "left" | "right";

export type GameStatus = "ready" | "playing" | "won";

/** Pac-Man speed in tiles per second. */
const PAC_SPEED = 7.5;

/** Points awarded per item eaten. */
const PELLET_POINTS = 10;
const POWER_POINTS = 50;

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
  /** `ready` until the first key press, `won` once every pellet is eaten. */
  status: GameStatus;
  score: number;
  /** Keys (see `pelletKey`) of pellets not yet eaten. */
  pellets: Set<number>;
  pac: Pac;
};

function spawnPac(): Pac {
  return {
    x: PAC_SPAWN.col,
    y: PAC_SPAWN.row,
    dir: "left",
    want: "left",
    moving: false,
    anim: 0,
  };
}

export function createGame(): GameState {
  return {
    status: "ready",
    score: 0,
    pellets: initialPellets(),
    pac: spawnPac(),
  };
}

/** Reset an existing state in place (keeps references held by the game loop). */
export function resetGame(state: GameState): void {
  state.status = "ready";
  state.score = 0;
  state.pellets = initialPellets();
  state.pac = spawnPac();
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

/** Eat the pellet on the tile Pac-Man just reached, if any. */
function eatPellet(state: GameState, col: number, row: number): void {
  const key = pelletKey(col, row);
  if (!state.pellets.has(key)) return;

  state.pellets.delete(key);
  state.score += tileAt(col, row) === "power" ? POWER_POINTS : PELLET_POINTS;
  if (state.pellets.size === 0) state.status = "won";
}

/** Advance the game by `dt` seconds. */
export function step(state: GameState, dt: number): void {
  if (state.status !== "playing") return;

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

      eatPellet(state, col, row);
      if (state.pellets.size === 0) {
        pac.moving = false;
        break;
      }

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
