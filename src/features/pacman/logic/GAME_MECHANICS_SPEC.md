# Game Mechanics Specification

**Reverse Funnel — Act I, the maze game**
Audience: build team, and sufficient for an LLM to implement from directly.
Companion to `PROJECT_BRIEF.md`. Version 1, 10 September 2026.

> Canonical spec, kept verbatim. For how this codebase actually implements it
> and where it deviates, see [`README.md`](./README.md) in this folder.

---

## 0. Scope and the one thing that matters

This document specifies item spawning, health depletion, the doctor, and
the timer. It does **not** cover maze topology, art, controls, or doctor
pathfinding AI — those are open.

The game's output is a single vector: **how many servings of each of four
products the player consumed.** Everything here exists to make that vector
land somewhere interesting.

```
BINS = ["cigarette", "bidi", "gutka_zarda", "leaf_tobacco"]
```

The vector is normalised to 100 and passed to `state_match.py`, which
returns the three closest Indian states. Four bins, in that order, always.

**Load-bearing vs tuning-safe.** Section 2's constants split into two
groups. The spawn-mix generation (§3) is load-bearing: change it and the
ending breaks. Health, doctor and timer values are tuning-safe — simulation
showed ending diversity is flat across their entire plausible range, so
tune them purely on game feel.

---

## 1. Sequence of a run

```
1. Generate the run's spawn mix           (§3)   once, at start
2. Spawn wave 1                           (§4)
3. Loop:
     player eats items, HP drops          (§6)
     doctor may catch player, HP restored (§7)
     when wave is 80% consumed:           (§5)
        despawn leftovers, spawn next wave
4. End on HP <= 0, or 120 s elapsed       (§8)
5. Emit consumption vector, run match     (§9)
```

---

## 2. Constants

### Load-bearing — do not change without re-running `check_unit_bins.py`

| Constant | Value | Notes |
|---|---|---|
| `DIRICHLET_ALPHA` | `2.0` | Valid range 1.5–2.0. See §3. |
| `N_BINS` | `4` | Fixed by the dataset. |

### Tuning-safe — set on game feel

| Constant | Value | Notes |
|---|---|---|
| `WAVE_SIZE` | `12` | Items spawned per wave. §4. |
| `CLEAR_THRESHOLD` | `0.8` | Fraction consumed before next wave. §5. |
| `HP_ITEMS` | `45` | Items required to die from full health. §6. |
| `DOCTOR_RESTORE` | `0.45` | Fraction of max HP restored on catch. §7. |
| `TIME_LIMIT_S` | `120` | Hard cap. §8. |

Derived, do not hardcode separately:

```
ITEMS_PER_WAVE_CONSUMED = ceil(WAVE_SIZE * CLEAR_THRESHOLD)   # 10
DEPLETION_PER_ITEM      = 1.0 / HP_ITEMS                      # 0.0222
```

---

## 3. Spawn mix generation — LOAD-BEARING

**Once per run, at start.** Draw a four-element mix from a symmetric
Dirichlet distribution:

```python
mix = rng.dirichlet([DIRICHLET_ALPHA] * 4)   # sums to 1.0
```

This mix governs every wave in the run. It is never regenerated.

### Why this and not uniform spawning

If every item is equally likely, the player's consumption converges on
25/25/25/25 by the law of large numbers. That point is nearest to Assam,
so **Assam wins 50–65% of long runs and twenty-three states become
unreachable.**

| Spawn model | Items eaten | States reachable | Top-3 |
|---|---|---|---|
| Uniform | 60 | 17 / 33 | 86% |
| Uniform | 120 | 10 / 33 | 95% |
| Per-run Dirichlet | 60 | 33 / 33 | 32% |
| Per-run Dirichlet | 200 | 31 / 33 | 34% |

Drawing the mix per *run* rather than per *item* means variety comes from
between-run variation, not within-run noise. Ending diversity then becomes
insensitive to how many items get eaten — which is what makes the doctor
mechanic safe (§7).

### Why α = 2.0

| α | Reachable | Top-3 | Behaviour |
|---|---|---|---|
| 1.0 | 33 / 33 | 38% | mixes too lumpy; extreme-corner states dominate |
| **1.5–2.0** | **33 / 33** | **33%** | **optimal** |
| 3.0 | 31 / 33 | 37% | mixes too even |
| 5.0 | 28 / 33 | 47% | approaching uniform; Assam reasserts |

---

## 4. Wave generation

### 4.1 How many

`WAVE_SIZE = 12`.

Ending diversity is identical for any wave size from 4 to 30 — this is a
readability decision, not a data one. Twelve is chosen because:

- **A four-way mix needs ~10 items to represent at all.** At `WAVE_SIZE=4`,
  a single wave misrepresents the run's mix by 65 percentage points; a
  60%-bidi run frequently spawns a wave with zero bidis. At 12 the error
  falls to 37 pp, and §4.2 removes it entirely.
- **The HUD shows the running mix live.** Small waves make that readout
  lurch after every clear, which reads as a bug.
- Above ~16 the board is cluttered and clearing becomes a slog.

### 4.2 What composition

**Deterministic, by largest remainder.** Do *not* draw a multinomial
sample per wave.

```python
def wave_composition(mix, wave_size):
    raw   = [m * wave_size for m in mix]
    base  = [floor(x) for x in raw]
    short = wave_size - sum(base)
    # hand the shortfall to the largest fractional parts
    order = sorted(range(4), key=lambda i: raw[i] - base[i], reverse=True)
    for i in order[:short]:
        base[i] += 1
    return base          # e.g. mix 60/20/10/10 at K=12 -> [7, 2, 1, 1]
```

Every wave in a run has identical composition. Variety comes from
placement (§4.3), not contents. This drops per-wave mix error to zero, so
the HUD reads steadily and the maze always looks like the run it belongs
to.

### 4.3 Where to place

**Cluster items of the same product type.** This is not cosmetic — it is
what makes the 80% threshold meaningful. If the player is to choose what
to abandon, the products must be spatially separable.

Rules, in priority order:

1. **No spawn within `SAFE_RADIUS` of the player's current position.**
   Prevents free items on wave transition.
2. **One cluster per product type present in the wave.** Assign each type
   a distinct maze region; a type with 7 items occupies one region, not
   seven scattered tiles.
3. **Randomise which region gets which type, every wave.** Keeps runs from
   feeling identical and stops players learning a fixed optimal loop.
4. **Every item must be reachable** from the player's position without
   passing through a wall. Validate before committing the wave.
5. **Spread clusters across the maze**, not adjacent — the player should
   have to commit to a direction.

Placement is the main lever on difficulty and on how much agency the
threshold actually delivers. Tune freely.

---

## 5. Wave advancement

The next wave spawns when **80%** of the current wave has been consumed —
10 of 12 items.

On advancement, **remaining items despawn immediately.** They do not
persist or accumulate.

### Why not full clearance

If the player must eat everything, their total consumption *equals* the
spawn mix exactly and they have no influence on the outcome at all. The
threshold lets them abandon what they cannot reach or choose not to chase.

Measured effect, with a player who consistently abandons one product type:

| Rule | Reachable | Top-3 | Max | Mix SD |
|---|---|---|---|---|
| Full clearance | 32 / 33 | 35% | 14% | 14.7 |
| **80% threshold** | **33 / 33** | **33%** | **12%** | **17.8** |

Better on every measure. The higher standard deviation is genuine player
agency entering the vector.

---

## 6. Health and depletion

### 6.1 Flat rate

**Every item depletes exactly the same amount**, regardless of product:

```
DEPLETION_PER_ITEM = 1.0 / HP_ITEMS = 1/45 ≈ 2.22% of max HP
```

### 6.2 Why flat

The win condition is to die fastest. If products depleted at different
rates, optimal play would be to eat only the fastest one — every skilled
player would converge on the same product, the same mix and the same
state. **The better the player, the more degenerate the ending.**

Flat rates remove the incentive entirely. The player eats whatever the
maze puts in reach, which is what the spawn model assumes.

Flat rates also make the **leaderboard fair**: time-to-die depends only on
pathing and doctor evasion, never on which mix the run happened to draw.

### 6.3 Why 45

- At roughly 1.5–2 s per item while navigating, 45 items is 60–90 seconds
  of competent play — comfortably inside the 120 s cap.
- At 10 consumed per wave, that is 4.5 waves: enough for the wave rhythm
  to be legible.
- **45 is deliberately not a multiple of 10.** If HP were 40 or 50, a
  clean run would die exactly as a wave completed, with no partial wave —
  and the partial wave is where player choice enters. Preserve this
  property if you retune.

### 6.4 Display

Health is shown as depleting lungs. **Open issue:** two of four products
(gutka, khaini) are smokeless and cause oral and oesophageal disease, not
lung disease — and they carry the highest odds ratios in the literature.
A lungs-only meter has no visual home for them. See `PROJECT_BRIEF.md` §8,
decision 1. This is the largest unresolved design question and it blocks
HP art.

---

## 7. The doctor

### 7.1 Behaviour

Doctors replace Pac-Man's ghosts. They pursue the player. On contact, HP
is **restored** by `DOCTOR_RESTORE` of maximum, so the player must eat
more and takes longer to die.

```python
def on_doctor_contact(state):
    state.hp = min(1.0, state.hp + DOCTOR_RESTORE)
    state.catches += 1
    # no HP-related penalty; the penalty is the time cost
```

### 7.2 Tune freely

Restore fraction and doctor count have **no effect on ending diversity**:

| Restore | Catches | Items eaten | Reachable | Top-3 |
|---|---|---|---|---|
| 100% | 0 | 30 | 32 / 33 | 32% |
| 100% | 3 | 120 | 33 / 33 | 34% |
| 35% | 6 | 93 | 32 / 33 | 34% |

This is a direct consequence of §3: because the spawn mix is per-run,
eating more items does not pull the player toward any particular state.
Under uniform spawning the same mechanic would be fatal — a player caught
three times would land on Assam with near-certainty.

**Do not** grant invulnerability frames after a catch, or a player can
farm the doctor. If repeat catches need limiting, cap total restores
rather than adding immunity.

### 7.3 Narrative note

Because depletion is flat, the player has no product preference — so the
only reason to take one route over another is doctor evasion. **The doctor
therefore determines what the player consumes, and so which state they
are matched to.** The thing trying to save you decides what kills you.
This falls out of the mechanics; do not undercut it by adding
product-preference incentives.

---

## 8. Timer and end conditions

`TIME_LIMIT_S = 120`, hard cap.

Three terminal states:

| Condition | Score | Ending |
|---|---|---|
| `hp <= 0` | time elapsed, lower is better | death screen + state match |
| `t >= 120` and `hp > 0` | not ranked | survival screen + state match |
| player quits | none | none |

**Survival is reachable** — a strong evader with generous doctor restores
may never die. It needs its own ending: *"You survived. Here is what you
consumed anyway."* The match still runs; only the leaderboard entry
differs.

The leaderboard ranks **time to die, ascending**. Recommend showing the
matched state as a second column — it gives a reason to replay beyond
shaving seconds, and puts the data on the board rather than only the
stopwatch. Without it, top players all converge on one optimal route and
therefore one state.

---

## 9. Output

Maintain a running count throughout:

```python
consumed = {"cigarette": 0, "bidi": 0, "gutka_zarda": 0, "leaf_tobacco": 0}
```

On termination, pass it to the match. It normalises internally:

```python
from state_match import load_reference, load_divisors, match

M       = load_reference()          # state_units_game.csv, 33 states
divisor = load_divisors(M)          # match_divisors.csv
top3    = match(consumed, M, divisor, k=3)
```

`top3` carries `distance` (L1 gap in percentage points), `score` (the
ranking key) and `confident`.

**Display rules.**

- Show all three states with distances. Never show only the winner.
- If `confident` is `False`, the first two are statistically
  indistinguishable — use *"your mix sits between X and Y"*, not *"you are
  X"*. Haryana and Himachal Pradesh are 2.9 pp apart and no configuration
  separates them.
- **Wording constraint:** a state's share describes a population's
  consumption mix. It does not describe a person. *"Your mix looks most
  like X"* is permitted; *"you are an average person from X"* is not.

---

## 10. Edge cases

| Case | Handling |
|---|---|
| Player eats nothing before dying | Impossible — death requires 45 items. But `match()` raises on an all-zero vector; catch it and show the survival screen. |
| Timer expires mid-wave | Score the run on whatever was consumed. No partial-item credit. |
| Doctor catch pushes HP above max | Clamp to 1.0. |
| Wave has a zero-count product | Normal. A mix of 90/5/3/2 at K=12 yields `[11,1,0,0]`. Spawn no cluster for absent types. |
| Mix rounds to all items in one type | Possible at low α. Valid — that run matches an extreme state. Do not correct it. |
| Player clears 80% before the wave finishes spawning | Gate advancement on spawn completion. |
| Two products tie in largest-remainder rounding | Break by fixed bin order for determinism. |

---

## 11. Reference implementation

```python
import math

BINS  = ["cigarette", "bidi", "gutka_zarda", "leaf_tobacco"]
ALPHA = 2.0
WAVE_SIZE, CLEAR_THRESHOLD = 12, 0.8
HP_ITEMS, DOCTOR_RESTORE, TIME_LIMIT_S = 45, 0.45, 120


class Run:
    def __init__(self, rng):
        self.rng      = rng
        self.mix      = rng.dirichlet([ALPHA] * 4)     # LOAD-BEARING, §3
        self.hp       = 1.0
        self.consumed = {b: 0 for b in BINS}
        self.wave     = None
        self.eaten_in_wave = 0
        self.catches  = 0
        self.t        = 0.0

    def wave_composition(self):
        """Deterministic, largest remainder. Identical every wave. §4.2"""
        raw   = [m * WAVE_SIZE for m in self.mix]
        base  = [math.floor(x) for x in raw]
        order = sorted(range(4), key=lambda i: (raw[i] - base[i], -i),
                       reverse=True)
        for i in order[:WAVE_SIZE - sum(base)]:
            base[i] += 1
        return base

    def spawn_wave(self):
        comp = self.wave_composition()
        self.wave = place_clustered(comp)   # §4.3 — maze-dependent
        self.eaten_in_wave = 0

    def eat(self, product):
        self.consumed[product] += 1
        self.hp -= 1.0 / HP_ITEMS           # flat, §6.1
        self.eaten_in_wave += 1
        if self.eaten_in_wave >= math.ceil(WAVE_SIZE * CLEAR_THRESHOLD):
            despawn_remaining()             # §5
            self.spawn_wave()

    def doctor_contact(self):
        self.hp = min(1.0, self.hp + DOCTOR_RESTORE)   # §7.1
        self.catches += 1

    def finished(self):
        return self.hp <= 0 or self.t >= TIME_LIMIT_S

    def result(self):
        return {"died": self.hp <= 0,
                "time": self.t,
                "consumed": self.consumed,
                "catches": self.catches}
```

`place_clustered()` and `despawn_remaining()` depend on maze topology and
are left to the implementer. Follow §4.3.

---

## 12. Open items

1. **Health meter representation** — blocks HP art. `PROJECT_BRIEF.md` §8.
2. **Lifespan calculator.** Flat depletion means the harm literature (Jha
   2008 mortality ratios; Tata Memorial odds ratios) no longer drives HP.
   Either the lifespan readout carries that differential — two players die
   at the same speed but lose different numbers of years, which is a point
   the piece could make — or it is dropped and the sourcing goes unused.
   Not yet decided.
3. **Doctor count and speed** — no data constraint, pure feel.
4. **Maze topology** — must support 4 separable clusters (§4.3).
5. **Recalibration.** Once this spec is implemented, sample several
   thousand runs from the real game and pass them to
   `calibrate(player_dist=...)` in `state_match.py`. Every diversity figure
   in this document assumes players drawn uniformly over the simplex; the
   real distribution will differ and the divisors should be rebuilt
   against it.
