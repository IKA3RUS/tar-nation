export type Direction = "up" | "down" | "left" | "right";

/** Tie-break priority when a ghost picks a turn (classic order). */
export const DIRS: readonly Direction[] = ["up", "left", "down", "right"];

export const VEC: Record<Direction, { x: -1 | 0 | 1; y: -1 | 0 | 1 }> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

export const OPPOSITE: Record<Direction, Direction> = {
  up: "down",
  down: "up",
  left: "right",
  right: "left",
};

/**
 * Distance from `pos` to the next tile center when moving along `dir` (a
 * nonzero step).
 */
export function distToNextCenter(pos: number, dir: number): number {
  return dir > 0 ? Math.floor(pos + 1) - pos : pos - Math.ceil(pos - 1);
}
