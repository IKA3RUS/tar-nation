import { DIRS, distToNextCenter, OPPOSITE, VEC, type Direction } from "./dir";
import {
  GHOST_DOOR_EXIT,
  GHOST_SPAWNS,
  MAZE_COLS,
  MAZE_ROWS,
  tileAt,
} from "./maze";

export type GhostName = "blinky" | "pinky" | "inky" | "clyde";

/**
 * `house`: waiting inside. `exiting`: gliding out the door. `out`:
 * free-roaming. `eaten`: eyes returning to the house after being eaten.
 */
export type GhostPhase = "house" | "exiting" | "out" | "eaten";

export type Ghost = {
  name: GhostName;
  color: string;
  x: number;
  y: number;
  dir: Direction;
  phase: GhostPhase;
  /** Seconds after play starts before it leaves the house. */
  releaseAt: number;
  /** Scatter-mode home corner, in tile coords (usually just off the board). */
  corner: { x: number; y: number };
  /** House slot this ghost spawns in and returns to when eaten. */
  spawn: { x: number; y: number };
  /** Seconds spent moving so far; drives the walk animation. */
  anim: number;
};

/**
 * Normal roaming speed, in tiles per second. Kept below Pac-Man's 7.5 even at
 * the end-of-round ramp, so a straight chase can't catch a fleeing player —
 * doctors have to cut corners to intercept.
 */
const GHOST_SPEED = 6;
/** Eyes rush home quickly. */
const EATEN_SPEED = 14;
const EPS = 1e-6;

/** Roaming speed ramps up to this multiplier over the round. */
const MAX_SPEED_MULT = 1.2;
/** Seconds to reach the full speed-up ramp (matches the round time limit). */
const SPEED_RAMP_SECS = 120;

/** How much faster ghosts are moving at this point in the round. */
function speedMultiplier(elapsed: number): number {
  return 1 + (MAX_SPEED_MULT - 1) * Math.min(elapsed / SPEED_RAMP_SECS, 1);
}

/** How close (in tiles) counts as catching Pac-Man. */
export const CATCH_DIST = 0.5;

type GhostDef = Omit<Ghost, "x" | "y" | "dir" | "phase" | "spawn" | "anim">;

/** How many doctors are on the board. */
const DOCTOR_COUNT = 1;

const ALL_DEFS: readonly GhostDef[] = [
  {
    name: "blinky",
    color: "#ff0000",
    releaseAt: 0,
    corner: { x: MAZE_COLS - 3, y: -2 },
  },
  { name: "pinky", color: "#ffb8ff", releaseAt: 2, corner: { x: 2, y: -2 } },
  {
    name: "inky",
    color: "#00ffff",
    releaseAt: 6,
    corner: { x: MAZE_COLS - 1, y: MAZE_ROWS + 1 },
  },
  {
    name: "clyde",
    color: "#ffb852",
    releaseAt: 9,
    corner: { x: 0, y: MAZE_ROWS + 1 },
  },
];

const DEFS = ALL_DEFS.slice(0, DOCTOR_COUNT);

export function createGhosts(): Ghost[] {
  return DEFS.map((def, i) => ({
    ...def,
    x: GHOST_SPAWNS[i].col,
    y: GHOST_SPAWNS[i].row,
    spawn: { x: GHOST_SPAWNS[i].col, y: GHOST_SPAWNS[i].row },
    dir: "up" as Direction,
    phase:
      def.releaseAt === 0 ? ("exiting" as GhostPhase) : ("house" as GhostPhase),
    anim: 0,
  }));
}

export type GhostCtx = {
  pac: { x: number; y: number; dir: Direction };
  /** Blinky's current position — used for Inky's target. */
  blinky: { x: number; y: number };
  mode: "scatter" | "chase";
  /** True on the frame the scatter/chase phase flips. */
  modeChanged: boolean;
  /** Seconds since play started. */
  elapsed: number;
};

export function updateGhosts(ghosts: Ghost[], ctx: GhostCtx, dt: number): void {
  for (const ghost of ghosts) updateGhost(ghost, ctx, dt);
}

function updateGhost(g: Ghost, ctx: GhostCtx, dt: number): void {
  if (g.phase === "eaten") {
    g.anim += dt;
    if (glideTowards(g, g.spawn.x, g.spawn.y, EATEN_SPEED * dt)) {
      g.phase = "exiting";
    }
    return;
  }

  if (g.phase === "house") {
    if (ctx.elapsed < g.releaseAt) return;
    g.phase = "exiting";
  }

  if (g.phase === "exiting") {
    g.anim += dt;
    if (
      glideTowards(
        g,
        GHOST_DOOR_EXIT.col,
        GHOST_DOOR_EXIT.row,
        GHOST_SPEED * dt,
      )
    ) {
      g.phase = "out";
      g.dir = "left";
    }
    return;
  }

  // phase === "out"
  if (ctx.modeChanged) g.dir = OPPOSITE[g.dir];

  const speed = GHOST_SPEED * speedMultiplier(ctx.elapsed);
  let budget = speed * dt;
  let moved = false;
  let guard = 0;

  while (budget > EPS && guard++ < 64) {
    const onCenter =
      Math.abs(g.x - Math.round(g.x)) < EPS &&
      Math.abs(g.y - Math.round(g.y)) < EPS;

    if (onCenter) {
      g.x = Math.round(g.x);
      g.y = Math.round(g.y);
      g.dir = chooseDir(g, ctx);
    }

    const v = VEC[g.dir];
    const d =
      v.x !== 0 ? distToNextCenter(g.x, v.x) : distToNextCenter(g.y, v.y);
    const move = Math.min(d, budget);

    g.x += v.x * move;
    g.y += v.y * move;
    budget -= move;
    moved ||= move > EPS;

    if (g.x < -0.5) g.x += MAZE_COLS;
    else if (g.x >= MAZE_COLS - 0.5) g.x -= MAZE_COLS;
  }

  if (moved) g.anim += dt;
}

/**
 * Slide straight toward `(tx, ty)` ignoring walls (used for the house door and
 * for eyes going home). Returns true once it arrives.
 */
function glideTowards(g: Ghost, tx: number, ty: number, dist: number): boolean {
  if (Math.abs(g.x - tx) > EPS) {
    g.dir = g.x < tx ? "right" : "left";
    const s = Math.min(dist, Math.abs(g.x - tx));
    g.x += g.x < tx ? s : -s;
    return false;
  }

  g.x = tx;
  if (Math.abs(g.y - ty) > EPS) {
    g.dir = g.y < ty ? "down" : "up";
    const s = Math.min(dist, Math.abs(g.y - ty));
    g.y += g.y < ty ? s : -s;
    return false;
  }

  g.y = ty;
  return true;
}

/** Walls and the (closed) house door block a roaming ghost. */
function ghostCanEnter(col: number, row: number): boolean {
  const tile = tileAt(col, row);
  return tile !== "wall" && tile !== "door";
}

function targetTile(g: Ghost, ctx: GhostCtx): { x: number; y: number } {
  if (ctx.mode === "scatter") return g.corner;

  const p = ctx.pac;
  const pv = VEC[p.dir];

  switch (g.name) {
    case "blinky":
      return { x: p.x, y: p.y };
    case "pinky":
      return { x: p.x + pv.x * 4, y: p.y + pv.y * 4 };
    case "inky": {
      const ax = p.x + pv.x * 2;
      const ay = p.y + pv.y * 2;
      return { x: 2 * ax - ctx.blinky.x, y: 2 * ay - ctx.blinky.y };
    }
    case "clyde":
      return Math.hypot(p.x - g.x, p.y - g.y) > 8
        ? { x: p.x, y: p.y }
        : g.corner;
  }
}

/** Non-reversing exits available from the ghost's current tile. */
function exits(g: Ghost): Direction[] {
  const col = Math.round(g.x);
  const row = Math.round(g.y);
  const back = OPPOSITE[g.dir];
  const open = DIRS.filter((d) => {
    if (d === back) return false;
    const v = VEC[d];
    return ghostCanEnter(col + v.x, row + v.y);
  });
  if (open.length > 0) return open;
  return ghostCanEnter(col + VEC[back].x, row + VEC[back].y) ? [back] : [g.dir];
}

/** Pick the exit that gets closest to the ghost's target. */
function chooseDir(g: Ghost, ctx: GhostCtx): Direction {
  const col = Math.round(g.x);
  const row = Math.round(g.y);
  const target = targetTile(g, ctx);

  let best = g.dir;
  let bestDist = Infinity;
  for (const d of exits(g)) {
    const v = VEC[d];
    const dx = col + v.x - target.x;
    const dy = row + v.y - target.y;
    const dist = dx * dx + dy * dy;
    if (dist < bestDist) {
      bestDist = dist;
      best = d;
    }
  }
  return best;
}
