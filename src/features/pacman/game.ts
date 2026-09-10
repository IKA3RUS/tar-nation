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

export type GameStatus = "ready" | "playing" | "won" | "lost" | "timeout";
export type GameMode = "scatter" | "chase";

/** Pac-Man speed in tiles per second. */
const PAC_SPEED = 7.5;

/** Round time limit, in seconds; running out ends the round. */
export const ROUND_SECONDS = 60;

/** Points awarded per item eaten. */
const PELLET_POINTS = 10;
const POWER_POINTS = 50;

/** Length of each scatter / chase phase, in seconds. */
const SCATTER_SECS = 7;
const CHASE_SECS = 20;

/** How long ghosts stay frightened after a power pellet, in seconds. */
const FRIGHT_SECS = 2;
/** Score for each ghost eaten during one power pellet. */
const GHOST_SCORES = [200, 400, 800, 1600];

/** Health gauge runs 0-100; a ghost catch always heals back to this cap. */
const MAX_HEALTH = 100;
/** Percent of the health gauge a power pellet costs. */
const POWER_HEALTH_COST = 25;

/**
 * How many power items stay active on the board at once. Items spawn on
 * random remaining pellet tiles and are replenished as soon as one is eaten,
 * so the supply never runs out. Planned to go up to 5 later.
 */
const POWER_ITEM_TARGET = 4;
/**
 * Power items must spawn at least this many tiles from Pac-Man, so they
 * can't be scooped up right away and ghosts stay a real threat.
 */
const POWER_ITEM_MIN_DIST = 10;
/** Total number of power item types (A-E), independent of how many are
 * currently active (`POWER_ITEM_TARGET`). */
const POWER_ITEM_TYPE_COUNT = 5;

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
  /** Health gauge, 0-100. */
  health: number;
  /** Keys (see `pelletKey`) of pellets not yet eaten. */
  pellets: Set<number>;
  /** Keys of pellet tiles currently upgraded to a power item, mapped to
   * their type index (0-based; see `POWER_ITEM_TARGET`). */
  powerItems: Map<number, number>;
  /** How many of each power item type (A-E) have been eaten this round. */
  collectedCounts: number[];
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
  const state: GameState = {
    status: "ready",
    score: 0,
    health: MAX_HEALTH,
    pellets: initialPellets(),
    powerItems: new Map(),
    collectedCounts: new Array(POWER_ITEM_TYPE_COUNT).fill(0),
    pac: spawnPac(),
    ghosts: createGhosts(),
    elapsed: 0,
    mode: "scatter",
    modeLeft: SCATTER_SECS,
    frightenedLeft: 0,
    ghostChain: 0,
    pauseLeft: 0,
  };
  spawnPowerItems(state);
  return state;
}

/** Reset an existing state in place (keeps references held by the game loop). */
export function resetGame(state: GameState): void {
  state.status = "ready";
  state.score = 0;
  state.health = MAX_HEALTH;
  state.pellets = initialPellets();
  state.powerItems = new Map();
  state.collectedCounts = new Array(POWER_ITEM_TYPE_COUNT).fill(0);
  state.ghostChain = 0;
  state.pauseLeft = 0;
  resetActors(state);
  spawnPowerItems(state);
}

/**
 * Top the active power items back up to `POWER_ITEM_TARGET` by upgrading
 * random still-uneaten pellet tiles, so the supply never runs dry. Each of
 * the `POWER_ITEM_TARGET` slots keeps the same type index across respawns,
 * so a slot's letter and sprite stay stable while it moves around the maze.
 */
function spawnPowerItems(state: GameState): void {
  const activeTypes = new Set(state.powerItems.values());

  for (let type = 0; type < POWER_ITEM_TARGET; type++) {
    if (activeTypes.has(type)) continue;

    const candidates = [...state.pellets].filter(
      (key) => !state.powerItems.has(key),
    );
    if (candidates.length === 0) break;

    const far = candidates.filter((key) => {
      const col = key % MAZE_COLS;
      const row = Math.floor(key / MAZE_COLS);
      return (
        Math.hypot(col - state.pac.x, row - state.pac.y) >=
        POWER_ITEM_MIN_DIST
      );
    });
    const pool = far.length > 0 ? far : candidates;

    const pick = pool[Math.floor(Math.random() * pool.length)];
    state.powerItems.set(pick, type);
  }
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
  const isPower = state.powerItems.has(key);
  state.score += isPower ? POWER_POINTS : PELLET_POINTS;

  if (isPower) {
    const type = state.powerItems.get(key)!;
    state.collectedCounts[type] += 1;
    state.powerItems.delete(key);
    state.frightenedLeft = FRIGHT_SECS;
    state.ghostChain = 0;
    for (const ghost of state.ghosts) {
      if (ghost.phase === "out") ghost.dir = OPPOSITE[ghost.dir];
    }
    // Frightening the ghosts costs health; running out ends the round.
    state.health -= POWER_HEALTH_COST;
    if (state.health <= 0) state.status = "lost";
    spawnPowerItems(state);
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
      if (state.status !== "playing") {
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

/** Handle a ghost touching Pac-Man: eat it while frightened, otherwise heal. */
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

    // Getting caught fully restores the gauge instead of costing a life;
    // play continues in place, with no respawn reset or freeze.
    state.health = MAX_HEALTH;
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
  if (state.elapsed >= ROUND_SECONDS) {
    state.status = "timeout";
    state.pac.moving = false;
    return;
  }

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
