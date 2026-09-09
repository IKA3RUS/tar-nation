import { OPPOSITE, VEC, distToNextCenter, type Direction } from "./dir";
import { CATCH_DIST, createGhosts, updateGhosts, type Ghost } from "./ghosts";
import {
  initialPellets,
  MAZE_COLS,
  PAC_SPAWN,
  pelletKey,
  tileAt,
} from "./maze";

export type { Direction } from "./dir";

export type GameStatus = "ready" | "playing" | "won" | "lost";
export type GameMode = "scatter" | "chase";

/** Pac-Man speed in tiles per second. */
const PAC_SPEED = 7.5;

/** Points awarded per item eaten. */
const PELLET_POINTS = 10;
const POWER_POINTS = 50;

/** Length of each scatter / chase phase, in seconds. */
const SCATTER_SECS = 7;
const CHASE_SECS = 20;

/** How long ghosts stay frightened after a power pellet, in seconds. */
const FRIGHT_SECS = 6;
/** Score for each ghost eaten during one power pellet. */
const GHOST_SCORES = [200, 400, 800, 1600];

/** Lives the player starts with. */
const START_LIVES = 3;
/** Freeze after losing a life, in seconds. */
const RESPAWN_PAUSE = 1;

/** Positions closer than this (in tiles) count as tile-aligned. */
const EPS = 1e-6;

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
  /** `ready` until the first key press; `won` / `lost` end the round. */
  status: GameStatus;
  score: number;
  lives: number;
  /** Keys (see `pelletKey`) of pellets not yet eaten. */
  pellets: Set<number>;
  pac: Pac;
  ghosts: Ghost[];
  /** Seconds since play started. */
  elapsed: number;
  mode: GameMode;
  /** Seconds left in the current scatter / chase phase. */
  modeLeft: number;
  /** Seconds left of frightened ghosts; 0 when inactive. */
  frightenedLeft: number;
  /** How many ghosts eaten so far in the current power pellet. */
  ghostChain: number;
  /** Seconds left of the post-death freeze. */
  pauseLeft: number;
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
    lives: START_LIVES,
    pellets: initialPellets(),
    pac: spawnPac(),
    ghosts: createGhosts(),
    elapsed: 0,
    mode: "scatter",
    modeLeft: SCATTER_SECS,
    frightenedLeft: 0,
    ghostChain: 0,
    pauseLeft: 0,
  };
}

/** Reset an existing state in place (keeps references held by the game loop). */
export function resetGame(state: GameState): void {
  state.status = "ready";
  state.score = 0;
  state.lives = START_LIVES;
  state.pellets = initialPellets();
  state.ghostChain = 0;
  state.pauseLeft = 0;
  resetActors(state);
}

/** Send Pac-Man and the ghosts back to their start positions. */
function resetActors(state: GameState): void {
  state.pac = spawnPac();
  state.ghosts = createGhosts();
  state.elapsed = 0;
  state.mode = "scatter";
  state.modeLeft = SCATTER_SECS;
  state.frightenedLeft = 0;
}

/** Whether a tile can be walked onto (walls and the ghost door cannot). */
function canEnter(col: number, row: number): boolean {
  const tile = tileAt(col, row);
  return tile !== "wall" && tile !== "door";
}

/** Eat the pellet on the tile Pac-Man just reached, if any. */
function eatPellet(state: GameState, col: number, row: number): void {
  const key = pelletKey(col, row);
  if (!state.pellets.has(key)) return;

  state.pellets.delete(key);
  const isPower = tileAt(col, row) === "power";
  state.score += isPower ? POWER_POINTS : PELLET_POINTS;

  if (isPower) {
    state.frightenedLeft = FRIGHT_SECS;
    state.ghostChain = 0;
    for (const ghost of state.ghosts) {
      if (ghost.phase === "out") ghost.dir = OPPOSITE[ghost.dir];
    }
  }

  if (state.pellets.size === 0) state.status = "won";
}

/** Advance Pac-Man by up to `budget` tiles along his current heading. */
function movePac(state: GameState, budget: number): void {
  const pac = state.pac;
  let left = budget;
  let moved = false;
  let guard = 0;

  while (left > EPS && guard++ < 64) {
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
    const move = Math.min(d, left);

    pac.x += v.x * move;
    pac.y += v.y * move;
    left -= move;
    moved ||= move > EPS;

    // Wrap through the side tunnel.
    if (pac.x < -0.5) pac.x += MAZE_COLS;
    else if (pac.x >= MAZE_COLS - 0.5) pac.x -= MAZE_COLS;
  }

  if (moved) pac.anim += budget / PAC_SPEED;
}

/** Handle a ghost touching Pac-Man: eat it while frightened, otherwise die. */
function resolveCollisions(state: GameState): void {
  const pac = state.pac;
  for (const ghost of state.ghosts) {
    if (ghost.phase !== "out") continue;
    if (Math.hypot(ghost.x - pac.x, ghost.y - pac.y) >= CATCH_DIST) continue;

    if (state.frightenedLeft > 0) {
      state.score += GHOST_SCORES[state.ghostChain];
      state.ghostChain = Math.min(
        state.ghostChain + 1,
        GHOST_SCORES.length - 1,
      );
      ghost.phase = "eaten";
      continue;
    }

    state.lives -= 1;
    if (state.lives <= 0) {
      state.status = "lost";
      pac.moving = false;
    } else {
      resetActors(state);
      state.pauseLeft = RESPAWN_PAUSE;
    }
    return;
  }
}

/** Advance the game by `dt` seconds. */
export function step(state: GameState, dt: number): void {
  if (state.status !== "playing") return;

  if (state.pauseLeft > 0) {
    state.pauseLeft = Math.max(0, state.pauseLeft - dt);
    return;
  }

  state.elapsed += dt;
  if (state.frightenedLeft > 0) {
    state.frightenedLeft = Math.max(0, state.frightenedLeft - dt);
  }

  // Scatter / chase phase timer (paused while ghosts are frightened).
  let modeChanged = false;
  if (state.frightenedLeft === 0) {
    state.modeLeft -= dt;
    if (state.modeLeft <= 0) {
      state.mode = state.mode === "scatter" ? "chase" : "scatter";
      state.modeLeft += state.mode === "scatter" ? SCATTER_SECS : CHASE_SECS;
      modeChanged = true;
    }
  }

  // Turning back the way you came is always allowed, even mid-tile.
  const pac = state.pac;
  if (pac.want === OPPOSITE[pac.dir]) pac.dir = pac.want;

  movePac(state, PAC_SPEED * dt);
  if (state.pellets.size === 0) return;

  updateGhosts(
    state.ghosts,
    {
      pac: { x: pac.x, y: pac.y, dir: pac.dir },
      blinky: { x: state.ghosts[0].x, y: state.ghosts[0].y },
      mode: state.mode,
      modeChanged,
      frightened: state.frightenedLeft > 0,
      elapsed: state.elapsed,
    },
    dt,
  );

  resolveCollisions(state);
}
