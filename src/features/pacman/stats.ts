import statesCsv from "./data/state_composition_cost_game.csv?raw";

/**
 * Power-item product ids in `collectedCounts` order: index 0 =
 * `power-pellet-1.png` = bidi, 1 = cigarette, 2 = gutka_zarda, 3 =
 * leaf_tobacco. Names match the columns of
 * `data/state_composition_cost_game.csv`.
 */
export const PRODUCTS = [
  "bidi",
  "cigarette",
  "gutka_zarda",
  "leaf_tobacco",
] as const;

export type Product = (typeof PRODUCTS)[number];
export type ProductMap = Record<Product, number>;

/** Confidence grows with the sample size `n` as `n / (n + K)`. */
const CONFIDENCE_K = 20;

type StateRow = { name: string } & ProductMap;

export type PacmanResult = {
  /** Raw pickup counts this round. */
  counts: ProductMap;
  /** Total pickups, `sum(counts)` — the sample size. */
  n: number;
  /** Pickup mix as percentages, summing to 100. */
  proportions: ProductMap;
  /** L1 distance (0-200) from `proportions` to every state, keyed by name. */
  distances: Record<string, number>;
  /** State with the smallest L1 distance. */
  nearestState: string;
  /** `100 - L1/2` for the nearest state (0-100). */
  similarity: number;
  /** Sample-size confidence, `n / (n + K)` (0-1). */
  confidence: number;
  /**
   * `similarity * confidence` (0-100) — low with few pickups, approaches the
   * true similarity (and 100 when the mix matches a state) as pickups grow.
   */
  score: number;
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
  const productCols = PRODUCTS.map((p) => header.indexOf(p));

  return lines.slice(1).map((line) => {
    const cells = line.split(",");
    const row = { name: cells[nameCol]?.trim() ?? "" } as StateRow;
    PRODUCTS.forEach((p, i) => {
      row[p] = Number(cells[productCols[i]]) || 0;
    });
    return row;
  });
}

const STATES: readonly StateRow[] = parseStates(statesCsv);

/** Scale any non-negative row to percentages summing to 100. */
function toProportions(row: ProductMap): ProductMap {
  const total = PRODUCTS.reduce((sum, p) => sum + Math.max(0, row[p] || 0), 0);
  const out = {} as ProductMap;
  for (const p of PRODUCTS) {
    out[p] = total > 0 ? (Math.max(0, row[p] || 0) / total) * 100 : 0;
  }
  return out;
}

function l1Distance(a: ProductMap, b: ProductMap): number {
  return PRODUCTS.reduce((sum, p) => sum + Math.abs(a[p] - b[p]), 0);
}

function mapValues(m: ProductMap, f: (x: number) => number): ProductMap {
  const out = {} as ProductMap;
  for (const p of PRODUCTS) out[p] = f(m[p]);
  return out;
}

/**
 * Compare the player's pickup mix against every state and return the match, or
 * `null` when nothing was collected.
 */
export function computeResult(
  collectedCounts: readonly number[],
): PacmanResult | null {
  const counts = {} as ProductMap;
  PRODUCTS.forEach((p, i) => {
    counts[p] = Math.max(0, Math.trunc(collectedCounts[i] ?? 0));
  });

  const n = PRODUCTS.reduce((sum, p) => sum + counts[p], 0);
  if (n === 0) return null;

  const proportions = toProportions(counts);

  const distances: Record<string, number> = {};
  let nearestState = "";
  let bestDistance = Infinity;

  for (const state of STATES) {
    const distance = l1Distance(proportions, toProportions(state));
    distances[state.name] = round1(distance);
    if (distance < bestDistance) {
      bestDistance = distance;
      nearestState = state.name;
    }
  }

  const similarity = Math.max(0, 100 - bestDistance / 2);
  const confidence = n / (n + CONFIDENCE_K);
  const score = similarity * confidence;

  return {
    counts,
    n,
    proportions: mapValues(proportions, round1),
    distances,
    nearestState,
    similarity: round1(similarity),
    confidence: Math.round(confidence * 1000) / 1000,
    score: round1(score),
    timestamp: new Date().toISOString(),
  };
}

/** Where the result is stashed for the visualisation page to pick up. */
export const RESULT_STORAGE_KEY = "tar-nation:result";
