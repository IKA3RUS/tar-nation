# `pacman/data`

## Files

| File                  | What it is                                                                                                                 |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `result.example.json` | A sample of the JSON that `/map` receives. Use it as a fixture while building the visualisation (no need to play a round). |

Reference table `M` now lives at [`src/data/state-composition.json`](../../../data/state-composition.json)
— 33 Indian states, each `{ state, cigarette, bidi, gutka_zarda, leaf_tobacco }`
(a % composition, ~100) — because `/map` shows the same breakdown on hover. It
is a plain JSON import, so it works in dev and in production with no parsing
step. Rows are normalised to 100 before any
distance is taken, so a row that sums to less (Haryana is 88.4) still compares
correctly. To add / correct states, edit that JSON — nothing else.

## How the game result reaches `/map`

`stats.ts` `computeResult(collectedCounts, catches)` builds a `PacmanResult`
(shape = `result.example.json`). On game over the `PacmanGame` component keeps
it in state and hands it to the visualisation page **through router navigation
state** — there is no `localStorage` or shared store.

Contract for whoever owns `/map`:

- Route file: `src/routes/map.tsx`, `export const Route = createFileRoute("/map")(...)`.
- Read the result:
  ```ts
  const result = useRouterState({
    select: (s) => s.location.state.pacmanResult ?? null,
  });
  ```
- The `pacmanResult` field on router state is typed via a `HistoryState`
  module augmentation in `stats.ts` — keep that import path resolvable.
- `result` is `null` on a direct visit / new tab (state only rides the
  in-app navigation). Fall back to `result.example.json` for local dev.
- Survives an in-tab reload (History API persists per entry); not shareable
  via URL.

## `PacmanResult` shape (see `result.example.json`)

- `counts` / `proportions` — servings per product, and the same normalised to
  sum 100. Order: `cigarette, bidi, gutka_zarda, leaf_tobacco`.
- `n` — total servings. `catches` — doctor catches.
- `top3` — three closest states, each `{ name, distance, score }` (`distance` =
  L1 gap in pp; `score` = ranking key, currently == `distance`).
- `distances` — L1 gap to every state, keyed by name (for the map view).
- `confident` — `false` when the top two are within 3 pp; say "your mix sits
  between X and Y", not "you are X".
