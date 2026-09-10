import statesCsv from "./data/state_composition_cost_game.csv?raw";

/**
 * Canonical product order (spec §0). The consumption vector always uses this
 * order; it matches the columns of the reference CSV.
 */
export const BINS = [
  "cigarette",
  "bidi",
  "gutka_zarda",
  "leaf_tobacco",
] as const;

/**
 * Product for each power-item type, in `collectedCounts` order: index 0 =
 * `power-pellet-1.png` = bidi, 1 = cigarette, 2 = gutka_zarda, 3 =
 * leaf_tobacco.
 */
const PELLET_PRODUCTS = [
  "bidi",
  "cigarette",
  "gutka_zarda",
  "leaf_tobacco",
] as const;

export type Product = (typeof BINS)[number];
export type ProductMap = Record<Product, number>;

/**
 * Top two states within this L1 gap (pp) are called statistically
 * indistinguishable — the match reads "between X and Y" (spec §9). Haryana and
 * Himachal Pradesh sit 2.9 pp apart and no configuration separates them.
 */
const CONFIDENT_PP = 3;

type StateRow = { name: string } & ProductMap;

export type StateMatch = {
  name: string;
  /** L1 gap to the state's mix, in percentage points (0-200) — spec §9. */
  distance: number;
  /**
   * Ranking key, lower = closer. Equals `distance` until `match_divisors.csv`
   * is supplied (spec §9 `load_divisors` / open item #5).
   */
  score: number;
};

export type PacmanResult = {
  /** Servings of each product this run, in BINS order (spec §9). */
  counts: ProductMap;
  /** Total servings; also the sample size. */
  n: number;
  /** Times a doctor caught the player (spec §7). */
  catches: number;
  /** `counts` normalised to sum 100 (spec §9). */
  proportions: ProductMap;
  /** The three closest states, nearest first (spec §9). */
  top3: StateMatch[];
  /** L1 gap to every state, keyed by name — for the map view. */
  distances: Record<string, number>;
  /**
   * `false` when the top two are within `CONFIDENT_PP`; the caller must then
   * say "your mix sits between X and Y", not "you are X" (spec §9).
   */
  confident: boolean;
  timestamp: string;
};

const round1 = (x: number) => Math.round(x * 10) / 10;

/** Parse the reference CSV (plain, unquoted fields) into state rows. */
function parseStates(raw: string): StateRow[] {
  const lines = raw
    .trim()
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);
  const header = lines[0].split(",").map((h) => h.trim());
  const nameCol = header.indexOf("state");
  const productCols = BINS.map((p) => header.indexOf(p));

  return lines.slice(1).map((line) => {
    const cells = line.split(",");
    const row = { name: cells[nameCol]?.trim() ?? "" } as StateRow;
    BINS.forEach((p, i) => {
      row[p] = Number(cells[productCols[i]]) || 0;
    });
    return row;
  });
}

/** Reference table `M` — 33 states (spec §9). */
const STATES: readonly StateRow[] = parseStates(statesCsv);

/** Normalise any non-negative row to percentages summing to 100 (spec §9). */
function toProportions(row: ProductMap): ProductMap {
  const total = BINS.reduce((sum, p) => sum + Math.max(0, row[p] || 0), 0);
  const out = {} as ProductMap;
  for (const p of BINS) {
    out[p] = total > 0 ? (Math.max(0, row[p] || 0) / total) * 100 : 0;
  }
  return out;
}

function l1Distance(a: ProductMap, b: ProductMap): number {
  return BINS.reduce((sum, p) => sum + Math.abs(a[p] - b[p]), 0);
}

function mapValues(m: ProductMap, f: (x: number) => number): ProductMap {
  const out = {} as ProductMap;
  for (const p of BINS) out[p] = f(m[p]);
  return out;
}

/**
 * `match()` (spec §9): normalise the consumption vector to 100, take the L1 gap
 * to every state, return the `k` closest. Returns `null` on an all-zero vector
 * (spec §10 — caller shows the survival screen with no match).
 *
 * The `match_divisors.csv` re-weighting from spec §9 is not applied yet (open
 * item #5); `score` therefore equals `distance`.
 */
export function computeResult(
  collectedCounts: readonly number[],
  catches = 0,
): PacmanResult | null {
  const counts = {} as ProductMap;
  for (const p of BINS) counts[p] = 0;
  PELLET_PRODUCTS.forEach((p, i) => {
    counts[p] = Math.max(0, Math.trunc(collectedCounts[i] ?? 0));
  });

  const n = BINS.reduce((sum, p) => sum + counts[p], 0);
  if (n === 0) return null;

  const proportions = toProportions(counts);

  const distances: Record<string, number> = {};
  const ranked: StateMatch[] = [];
  for (const state of STATES) {
    const distance = round1(l1Distance(proportions, toProportions(state)));
    distances[state.name] = distance;
    ranked.push({ name: state.name, distance, score: distance });
  }
  ranked.sort((a, b) => a.score - b.score);
  const top3 = ranked.slice(0, 3);

  const confident =
    top3.length < 2 || top3[1].distance - top3[0].distance >= CONFIDENT_PP;

  return {
    counts,
    n,
    catches,
    proportions: mapValues(proportions, round1),
    distances,
    top3,
    confident,
    timestamp: new Date().toISOString(),
  };
}

/** The result is handed to `/map` through router navigation state. */
declare module "@tanstack/react-router" {
  interface HistoryState {
    pacmanResult?: PacmanResult;
  }
}
