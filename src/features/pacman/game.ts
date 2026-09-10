import { OPPOSITE, VEC, distToNextCenter, type Direction } from "./dir";
import { CATCH_DIST, createGhosts, updateGhosts, type Ghost } from "./ghosts";
import {
  MAZE,
  MAZE_COLS,
  MAZE_ROWS,
  PAC_SPAWN,
  pelletKey,
  tileAt,
} from "./maze";

export type { Direction } from "./dir";

export type GameStatus = "ready" | "playing" | "lost" | "timeout";
export type GameMode = "scatter" | "chase";

/** Pac-Man speed in tiles per second. */
const PAC_SPEED = 7.5;

/** Round time limit, in seconds; surviving to it ends the round (§8). */
export const ROUND_SECONDS = 120;

/** Points awarded per item eaten. */
const ITEM_POINTS = 50;

/**
 * Spawn model (§3-5). A run draws one Dirichlet mix; every wave has the same
 * deterministic composition from it; a wave is cleared once
 * `ITEMS_PER_WAVE_CONSUMED` of its `WAVE_SIZE` items are eaten, at which point
 * the leftovers despawn and the next wave spawns.
 */
const DIRICHLET_ALPHA = 2.0;
const WAVE_SIZE = 12;
const CLEAR_THRESHOLD = 0.8;
const ITEMS_PER_WAVE_CONSUMED = Math.ceil(WAVE_SIZE * CLEAR_THRESHOLD);
/** No item spawns within this many tiles of the player (§4.3). */
const SAFE_RADIUS = 4;

/** Length of each scatter / chase phase, in seconds. */
const SCATTER_SECS = 7;
const CHASE_SECS = 20;

/** Health gauge, 0..MAX_HEALTH, shown as 5 lungs (§6). ~45 items to die. */
export const MAX_HEALTH = 45;
/** Total HP an eaten item removes (spec §6: 1/45 of MAX_HEALTH). */
const HP_PER_ITEM = 1;
/** Share of an item's HP that lands the instant it is eaten. */
const HP_INSTANT_FRAC = 0.6;
/** The rest lingers as an aftertaste, bled out over this many seconds. */
const SMOKE_SECS = 2.5;
/** Lingering HP per item (drains to 0 over SMOKE_SECS). */
const RESIDUAL_HP = HP_PER_ITEM * (1 - HP_INSTANT_FRAC);
/** Fraction of max HP a doctor restores on contact (§7). */
const DOCTOR_RESTORE = 0.45;

/** Number of item types (A-D); see `stats.ts` for the product mapping. */
const N_BINS = 4;

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
  /** `ready` until the first key press; `lost` / `timeout` end the round. */
  status: GameStatus;
  score: number;
  /** Health gauge, 0..MAX_HEALTH. */
  health: number;
  /** This run's Dirichlet spawn mix, 4 values summing to 1 (§3). */
  mix: number[];
  /** 1-based wave counter. */
  wave: number;
  /** Items eaten from the current wave (§5). */
  eatenInWave: number;
  /** Tile key (see `pelletKey`) -> item type index (0-3) for live items. */
  powerItems: Map<number, number>;
  /** How many of each item type (A-D) have been eaten this round. */
  collectedCounts: number[];
  /** Remaining HP of each still-smouldering item (§6 DoT). */
  smokePools: number[];
  pac: Pac;
  ghosts: Ghost[];
  /** Seconds since play started. */
  elapsed: number;
  mode: GameMode;
  /** Seconds left in the current scatter / chase phase. */
  modeLeft: number;
  /** How many times a doctor has caught the player (§7). */
  catches: number;
  /** True while overlapping a doctor, so one contact = one catch. */
  inDoctorContact: boolean;
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
    mix: dirichlet(DIRICHLET_ALPHA, N_BINS),
    wave: 0,
    eatenInWave: 0,
    powerItems: new Map(),
    collectedCounts: new Array(N_BINS).fill(0),
    smokePools: [],
    pac: spawnPac(),
    ghosts: createGhosts(),
    elapsed: 0,
    mode: "scatter",
    modeLeft: SCATTER_SECS,
    catches: 0,
    inDoctorContact: false,
    pauseLeft: 0,
  };
  advanceWave(state);
  return state;
}

/** Reset an existing state in place (keeps references held by the game loop). */
export function resetGame(state: GameState): void {
  state.status = "ready";
  state.score = 0;
  state.health = MAX_HEALTH;
  state.mix = dirichlet(DIRICHLET_ALPHA, N_BINS);
  state.wave = 0;
  state.eatenInWave = 0;
  state.powerItems = new Map();
  state.collectedCounts = new Array(N_BINS).fill(0);
  state.smokePools = [];
  state.catches = 0;
  state.pauseLeft = 0;
  resetActors(state);
  advanceWave(state);
}

function tilePos(key: number): { col: number; row: number } {
  return { col: key % MAZE_COLS, row: Math.floor(key / MAZE_COLS) };
}

// --- Spawn mix, wave composition and placement (§3-5) -----------------------

/** Standard normal via Box-Muller. */
function randNormal(): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Gamma(alpha, 1) via Marsaglia-Tsang; alpha >= 1 (ours is 1.5-2.0). */
function randGamma(alpha: number): number {
  const d = alpha - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (let i = 0; i < 1000; i++) {
    const x = randNormal();
    const v = (1 + c * x) ** 3;
    if (v <= 0) continue;
    const u = Math.random();
    if (u < 1 - 0.0331 * x ** 4) return d * v;
    if (Math.log(u) < 0.5 * x ** 2 + d * (1 - v + Math.log(v))) return d * v;
  }
  return d;
}

/** Symmetric Dirichlet draw: `k` values summing to 1 (§3). */
function dirichlet(alpha: number, k: number): number[] {
  const g = Array.from({ length: k }, () => randGamma(alpha));
  const sum = g.reduce((a, b) => a + b, 0);
  return sum > 0 ? g.map((x) => x / sum) : g.map(() => 1 / k);
}

/** Largest-remainder split of `WAVE_SIZE` by `mix`; identical every wave (§4.2). */
function waveComposition(mix: number[]): number[] {
  const raw = mix.map((m) => m * WAVE_SIZE);
  const base = raw.map((x) => Math.floor(x));
  const short = WAVE_SIZE - base.reduce((a, b) => a + b, 0);
  // Largest fractional part first; ties by lower bin index (§10).
  const order = raw
    .map((_, i) => i)
    .sort((a, b) => raw[b] - base[b] - (raw[a] - base[a]) || a - b);
  for (let k = 0; k < short; k++) base[order[k]] += 1;
  return base;
}

function shuffle<T>(arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Walkable item tiles split into four maze quadrants (§4.3 regions). */
function buildRegions(): number[][] {
  const regions: number[][] = [[], [], [], []];
  for (let row = 0; row < MAZE_ROWS; row++) {
    for (let col = 0; col < MAZE_COLS; col++) {
      const tile = MAZE[row][col];
      if (tile !== "pellet" && tile !== "power") continue;
      const q = (row < MAZE_ROWS / 2 ? 0 : 2) + (col < MAZE_COLS / 2 ? 0 : 1);
      regions[q].push(pelletKey(col, row));
    }
  }
  return regions;
}

const REGIONS = buildRegions();

/** Keep same-type items at least this many tiles apart. */
const ITEM_SPACING = 3;

/**
 * `count` tiles for one type, spread across its region (not piled): each region
 * holds one product type so types stay spatially separable (§4.3), but the
 * items themselves are scattered, kept `ITEM_SPACING` apart where possible and
 * clear of Pac-Man's `SAFE_RADIUS`.
 */
function pickInRegion(
  tiles: readonly number[],
  count: number,
  pacCol: number,
  pacRow: number,
): number[] {
  const safe = tiles.filter((key) => {
    const p = tilePos(key);
    return Math.hypot(p.col - pacCol, p.row - pacRow) >= SAFE_RADIUS;
  });
  const pool = shuffle(safe.length >= count ? safe : tiles);

  const picked: number[] = [];
  for (const key of pool) {
    if (picked.length >= count) break;
    const p = tilePos(key);
    const spaced = picked.every((k) => {
      const q = tilePos(k);
      return Math.hypot(p.col - q.col, p.row - q.row) >= ITEM_SPACING;
    });
    if (spaced) picked.push(key);
  }
  // Top up with the nearest-anyway tiles if spacing was too tight to fill.
  for (const key of pool) {
    if (picked.length >= count) break;
    if (!picked.includes(key)) picked.push(key);
  }
  return picked;
}

/** Despawn the current wave's leftovers and lay out the next one (§4-5). */
function advanceWave(state: GameState): void {
  state.powerItems.clear();
  state.eatenInWave = 0;
  state.wave += 1;

  const comp = waveComposition(state.mix);
  const regionForType = shuffle([0, 1, 2, 3]);

  for (let type = 0; type < N_BINS; type++) {
    if (comp[type] === 0) continue;
    const tiles = pickInRegion(
      REGIONS[regionForType[type]],
      comp[type],
      state.pac.x,
      state.pac.y,
    );
    for (const key of tiles) state.powerItems.set(key, type);
  }
}

/** Send Pac-Man and the ghosts back to their start positions. */
function resetActors(state: GameState): void {
  state.pac = spawnPac();
  state.ghosts = createGhosts();
  state.elapsed = 0;
  state.mode = "scatter";
  state.modeLeft = SCATTER_SECS;
  state.inDoctorContact = false;
}

/** Whether a tile can be walked onto (walls and the ghost door cannot). */
function canEnter(col: number, row: number): boolean {
  const tile = tileAt(col, row);
  return tile !== "wall" && tile !== "door";
}

/** Eat the item on the tile Pac-Man just reached, if any. */
function eatItem(state: GameState, col: number, row: number): void {
  const key = pelletKey(col, row);
  const type = state.powerItems.get(key);
  if (type === undefined) return;

  state.powerItems.delete(key);
  state.collectedCounts[type] += 1;
  state.score += ITEM_POINTS;

  // Most of the hit lands now; the rest lingers as an aftertaste (§6).
  state.health -= HP_PER_ITEM * HP_INSTANT_FRAC;
  if (state.health <= 0) {
    state.health = 0;
    state.status = "lost";
    return;
  }
  state.smokePools.push(RESIDUAL_HP);

  state.eatenInWave += 1;
  if (state.eatenInWave >= ITEMS_PER_WAVE_CONSUMED) advanceWave(state);
}

/** Bleed the lingering HP from every still-smouldering item this frame. */
function applySmoke(state: GameState, dt: number): void {
  if (state.smokePools.length === 0) return;

  const perPool = (RESIDUAL_HP / SMOKE_SECS) * dt;
  let drained = 0;
  for (let i = 0; i < state.smokePools.length; i++) {
    const take = Math.min(state.smokePools[i], perPool);
    state.smokePools[i] -= take;
    drained += take;
  }
  state.smokePools = state.smokePools.filter((p) => p > EPS);

  state.health -= drained;
  if (state.health <= 0) {
    state.health = 0;
    state.status = "lost";
  }
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

      eatItem(state, col, row);
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

/**
 * A doctor touching Pac-Man heals him, so the round runs longer (§7). Fires
 * once per contact event — staying overlapped does nothing; separating and
 * touching again is a new catch. No invulnerability frames (§7.2).
 */
function resolveCollisions(state: GameState): void {
  const pac = state.pac;
  const touching = state.ghosts.some(
    (g) =>
      g.phase === "out" && Math.hypot(g.x - pac.x, g.y - pac.y) < CATCH_DIST,
  );

  if (touching && !state.inDoctorContact) {
    state.health = Math.min(
      MAX_HEALTH,
      state.health + DOCTOR_RESTORE * MAX_HEALTH,
    );
    state.catches += 1;
  }
  state.inDoctorContact = touching;
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

  applySmoke(state, dt);
  if (state.status !== "playing") {
    state.pac.moving = false;
    return;
  }

  // Scatter / chase phase timer.
  let modeChanged = false;
  state.modeLeft -= dt;
  if (state.modeLeft <= 0) {
    state.mode = state.mode === "scatter" ? "chase" : "scatter";
    state.modeLeft += state.mode === "scatter" ? SCATTER_SECS : CHASE_SECS;
    modeChanged = true;
  }

  // Turning back the way you came is always allowed, even mid-tile.
  const pac = state.pac;
  if (pac.want === OPPOSITE[pac.dir]) pac.dir = pac.want;

  movePac(state, PAC_SPEED * dt);
  if (state.status !== "playing") return;

  updateGhosts(
    state.ghosts,
    {
      pac: { x: pac.x, y: pac.y, dir: pac.dir },
      blinky: { x: state.ghosts[0].x, y: state.ghosts[0].y },
      mode: state.mode,
      modeChanged,
      elapsed: state.elapsed,
    },
    dt,
  );

  resolveCollisions(state);
}
