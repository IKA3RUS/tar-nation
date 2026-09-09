/**
 * Basic Pac-Man maze layout.
 *
 * Legend:
 *
 * - `#` wall.
 * - `.` pellet.
 * - `o` power pellet.
 * - `-` ghost-house door.
 * - ` ` empty path (no pellet).
 *
 * The layout, tile size and everything drawn from it are placeholders and will
 * be replaced later.
 */

/** Size of one maze tile in pixels. */
export const TILE = 20;

const RAW_MAZE = [
  "############################",
  "#............##............#",
  "#.####.#####.##.#####.####.#",
  "#o####.#####.##.#####.####o#",
  "#.####.#####.##.#####.####.#",
  "#..........................#",
  "#.####.##.########.##.####.#",
  "#.####.##.########.##.####.#",
  "#......##....##....##......#",
  "######.##### ## #####.######",
  "######.##### ## #####.######",
  "######.##          ##.######",
  "######.## ###--### ##.######",
  "######.## #      # ##.######",
  "      .   #      #   .      ",
  "######.## #      # ##.######",
  "######.## ######## ##.######",
  "######.##          ##.######",
  "######.## ######## ##.######",
  "######.##### ## #####.######",
  "#............##............#",
  "#.####.#####.##.#####.####.#",
  "#o..##.......  .......##..o#",
  "###.##.##.########.##.##.###",
  "#......##....##....##......#",
  "#.##########.##.##########.#",
  "#..........................#",
  "############################",
] as const;

export const MAZE_COLS = RAW_MAZE[0].length;
export const MAZE_ROWS = RAW_MAZE.length;

export type Tile = "wall" | "pellet" | "power" | "door" | "empty";

const CHAR_TO_TILE: Record<string, Tile> = {
  "#": "wall",
  ".": "pellet",
  o: "power",
  "-": "door",
  " ": "empty",
};

/** Parsed maze grid, indexed as `grid[row][col]`. */
export const MAZE: Tile[][] = RAW_MAZE.map((row) =>
  [...row].map((char) => CHAR_TO_TILE[char] ?? "empty"),
);

export type TilePos = { col: number; row: number };

/** Tile Pac-Man starts on. */
export const PAC_SPAWN: TilePos = { col: 13, row: 22 };

/** Tiles the four ghosts start on, inside the ghost house. */
export const GHOST_SPAWNS: readonly TilePos[] = [
  { col: 11, row: 14 },
  { col: 12, row: 13 },
  { col: 14, row: 14 },
  { col: 15, row: 13 },
];

/** Tile just outside the ghost-house door that ghosts aim for when leaving. */
export const GHOST_DOOR_EXIT: TilePos = { col: 13, row: 11 };

export function tileAt(col: number, row: number): Tile {
  if (row < 0 || row >= MAZE_ROWS || col < 0 || col >= MAZE_COLS)
    return "empty";
  return MAZE[row][col];
}

export function isWall(col: number, row: number): boolean {
  return tileAt(col, row) === "wall";
}
