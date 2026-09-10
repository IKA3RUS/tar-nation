# pacman/logic

[`GAME_MECHANICS_SPEC.md`](./GAME_MECHANICS_SPEC.md) is the canonical spec,
kept verbatim. This file maps it to the TypeScript implementation and records
the few places the implementation genuinely departs from it.

## Where each section lives in code

| Spec | Code |
| --- | --- |
| §2 constants | top of [`../game.ts`](../game.ts) |
| §3 Dirichlet mix | `dirichlet` / `randGamma` / `randNormal` in `../game.ts` |
| §4.2 wave composition | `waveComposition` in `../game.ts` |
| §4.3 placement | `buildRegions` / `pickInRegion` / `advanceWave` in `../game.ts` |
| §5 wave advancement | `eatItem` in `../game.ts` |
| §6 health / depletion | `applySmoke` / `eatItem` in `../game.ts`; `drawHealthGauge` in [`../render.ts`](../render.ts) |
| §7 doctor | `../ghosts.ts` (`DOCTOR_COUNT`, `GHOST_SPEED`, `chooseDir`); `resolveCollisions` in `../game.ts` |
| §8 timer / end | `ROUND_SECONDS` + `step` in `../game.ts`; `drawOverlay` in `../render.ts` |
| §9 match | `computeResult` in [`../stats.ts`](../stats.ts); consumed at [`src/routes/map.tsx`](../../../routes/map.tsx) |
| reference data | [`../data/`](../data/) (`state_composition_cost_game.csv`, `result.example.json`) |

## Genuine deviations from the spec

Three, all deliberate.

### §6.1 — depletion is instant + a short aftertaste, not purely instant

Spec: `hp -= 1/45` the instant an item is eaten.
Here: **0.6 lands instantly, 0.4 bleeds over `SMOKE_SECS = 2.5 s`**, and the
pools stack (`applySmoke`). Total per item is still `1/45`, so `HP_ITEMS = 45`
and every other §6 property is preserved. Feel change (requested): "instant is
fine, but the last item you smoked should keep hurting for a moment."
`HP_INSTANT_FRAC` / `SMOKE_SECS` are the knobs; `HP_INSTANT_FRAC = 1` gives the
pure-spec behaviour.

### §4.3 — items scattered within a region, not piled

Spec rule 2: "a type with 7 items occupies one region, not seven scattered
tiles." Here each type still gets **one maze quadrant per wave** (so types stay
spatially separable — the point of §4.3), but the items inside it are spread
`ITEM_SPACING = 3` apart rather than heaped, because a tight pile read badly.
Rule 4 (reachability validation) is skipped: the maze is fully connected and
items only land on corridor tiles, so every item is always reachable.

### §9 — raw L1, no divisor re-weighting

No `state_match.py` / `load_divisors` / `state_units_game.csv` were supplied, so
`computeResult` uses **plain L1** on the normalised percentages; `score` equals
`distance`. Reference `M` is `../data/state_composition_cost_game.csv` (33 rows,
each already a ~100 composition). Consequence: central-simplex states (e.g.
Punjab) win a disproportionate share of near-balanced vectors. Fix is the §12-5
recalibration — feed real runs to `calibrate()` and rebuild the divisors once
`state_match.py` lands.

## Spec-conformant choices (open items filled / prototype cruft removed)

Not deviations — the spec left these open, or our earlier Pac-Man prototype
carried mechanics the spec never had.

- **Four item types.** `N_BINS = 4` (§0, §2 — load-bearing, "fixed by the
  dataset"). An earlier build briefly had five types (A–E); brought back to
  four to match.
- **No win / no lives.** Spec §8 has exactly three ends — death, survival,
  quit — and §6.2 defines winning as dying fastest. The prototype's "clear the
  board" win and its lives/respawn system were Pac-Man leftovers; removed.
  Implemented ends: `lost` (hp ≤ 0, "You are Dead") and `timeout` (survived
  120 s, "YOU SURVIVED").
- **No frightened / edible doctor.** Not a concept in this spec (§7 is pursue +
  restore only). Removed.
- **Doctor count and speed** (§12-3, "pure feel"). `DOCTOR_COUNT = 1`;
  `GHOST_SPEED = 6` with a `MAX_SPEED_MULT = 1.2` ramp — kept under Pac-Man's
  `7.5` even at the end so a straight chase can't catch a fleeing player.
- **One catch per contact event** (§7.1). `DOCTOR_RESTORE = 0.45` is
  spec-exact. The render loop checks collisions every frame, so
  `resolveCollisions` guards with `inDoctorContact`: `doctor_contact` fires once
  when contact begins, not 60×/s while overlapping — the spec pseudocode's
  intent (one catch = one event), with no invulnerability frames. No
  total-restore cap yet (§7.2 permits one).
- **Lung meter** (§6.4). 45 HP as five lungs (9 each), `public/img/pacman/lang.png`,
  emptying right-to-left; player sprite swaps to `mukesh.png` (vs
  `mukesh-nonsmoke.png`) while a residual pool burns. The smokeless-products
  problem in §6.4 (open item #1) is not addressed by the visual.
- **Maze / regions** (§12-4). Maze is `../maze.ts`, split into four quadrants by
  `buildRegions`. Current balance: 55 / 55 / 59 / 59 walkable tiles (ratio
  0.93, left-right symmetric) — meets "4 separable clusters". Spawn (13, 22)
  sits nearer the south quadrants, a small residual bias for §12-5 to absorb.
- **Output delivery.** The spec ends at `top3`. The `PacmanResult` is handed to
  `/map` through **router navigation state** (`<Link state={{ pacmanResult }}>`
  → `useRouterState`), not `localStorage` — nothing shared. Survives an in-tab
  reload (History API), not a fresh visit. `HistoryState` is augmented in
  `../stats.ts`.
- **`BINS` order.** Output uses `[cigarette, bidi, gutka_zarda, leaf_tobacco]`
  (§0). Pellet art maps as `power-pellet-1` = bidi, `-2` = cigarette,
  `-3` = gutka_zarda, `-4` = leaf_tobacco; `collectedCounts` is in that pellet
  order and `stats.ts` `PELLET_PRODUCTS` maps it to `BINS`.
- The brief `n/(n+K)` "sample-size confidence" is **removed** — never in the
  spec.

## Not implemented

`check_unit_bins.py`, the leaderboard (§8), the lifespan calculator (§12-2),
the live-mix HUD (§4.1), and `state_match.py`'s divisor weighting +
recalibration (§9, §12-5).
