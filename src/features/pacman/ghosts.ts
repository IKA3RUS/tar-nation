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
 * free-roaming.
 */
export type GhostPhase = "house" | "exiting" | "out";

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
};

/** Ghosts move a touch slower than Pac-Man. */
const GHOST_SPEED = 6.75;
const EPS = 1e-6;

/** How close (in tiles) counts as catching Pac-Man. */
export const CATCH_DIST = 0.5;

type GhostDef = Omit<Ghost, "x" | "y" | "dir" | "phase">;

const DEFS: readonly GhostDef[] = [
  {
    name: "blinky",
    color: "#ff0000",
    releaseAt: 0,
    corner: { x: MAZE_COLS - 3, y: -2 },
  },
  { name: "pinky", color: "#ffb8ff", releaseAt: 3, corner: { x: 2, y: -2 } },
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

export function createGhosts(): Ghost[] {
  return DEFS.map((def, i) => ({
    ...def,
    x: GHOST_SPAWNS[i].col,
    y: GHOST_SPAWNS[i].row,
    dir: "up" as Direction,
    phase:
      def.releaseAt === 0 ? ("exiting" as GhostPhase) : ("house" as GhostPhase),
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
  if (g.phase === "house") {
    if (ctx.elapsed < g.releaseAt) return;
    g.phase = "exiting";
  }

  if (g.phase === "exiting") {
    glideOut(g, GHOST_SPEED * dt);
    return;
  }

  // phase === "out"
  if (ctx.modeChanged) g.dir = OPPOSITE[g.dir];

  let budget = GHOST_SPEED * dt;
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

    if (g.x < -0.5) g.x += MAZE_COLS;
    else if (g.x >= MAZE_COLS - 0.5) g.x -= MAZE_COLS;
  }
}

/** Move a ghost from its house slot to the tile just outside the door. */
function glideOut(g: Ghost, dist: number): void {
  const tx = GHOST_DOOR_EXIT.col;
  const ty = GHOST_DOOR_EXIT.row;

  if (Math.abs(g.x - tx) > EPS) {
    g.dir = g.x < tx ? "right" : "left";
    const s = Math.min(dist, Math.abs(g.x - tx));
    g.x += g.x < tx ? s : -s;
    return;
  }

  g.x = tx;
  if (Math.abs(g.y - ty) > EPS) {
    g.dir = "up";
    g.y -= Math.min(dist, Math.abs(g.y - ty));
    return;
  }

  g.y = ty;
  g.phase = "out";
  g.dir = "left";
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

/** Pick the non-reversing exit that gets closest to the ghost's target. */
function chooseDir(g: Ghost, ctx: GhostCtx): Direction {
  const col = Math.round(g.x);
  const row = Math.round(g.y);
  const target = targetTile(g, ctx);
  const back = OPPOSITE[g.dir];

  let best = g.dir;
  let bestDist = Infinity;
  let found = false;

  for (const d of DIRS) {
    if (d === back) continue;
    const v = VEC[d];
    if (!ghostCanEnter(col + v.x, row + v.y)) continue;

    const dx = col + v.x - target.x;
    const dy = row + v.y - target.y;
    const dist = dx * dx + dy * dy;
    if (dist < bestDist) {
      bestDist = dist;
      best = d;
      found = true;
    }
  }

  if (found) return best;

  // Dead end — turning back is the only way out.
  const bv = VEC[back];
  return ghostCanEnter(col + bv.x, row + bv.y) ? back : g.dir;
}
