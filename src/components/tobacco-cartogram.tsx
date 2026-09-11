import { useEffect, useRef, useState } from "react";

import { Link } from "@tanstack/react-router";

import { TwinkleBackdrop } from "#/components/twinkle-backdrop";
import { Button } from "#/components/ui/button";
import { Fieldset, FieldsetLegend } from "#/components/ui/fieldset";
import { ToggleGroup, ToggleGroupItem } from "#/components/ui/toggle-group";
import {
  GRID_H,
  GRID_W,
  LAND_ROWS,
  PEOPLE_ROWS,
  PIXEL_CHARSET,
  PIXEL_VOID,
  RATE_ROWS,
} from "#/data/india-pixels";
import { TOBACCO_BY_STATE, type StateTobacco } from "#/data/tobacco";

/* ---- numbers ------------------------------------------------------------ */

const LAKH = 1e5;
const CRORE = 1e7;

/** Headcounts in the units the reader actually thinks in: lakh and crore. */
function fmtPeople(millions: number) {
  const people = millions * 1e6;
  if (people >= CRORE) {
    const cr = people / CRORE;
    return `${cr.toFixed(cr >= 10 ? 1 : 2)} crore`;
  }
  if (people >= LAKH) return `${(people / LAKH).toFixed(1)} lakh`;
  return Math.round(people).toLocaleString("en-IN");
}

/* ---- the two axes: what is drawn, and what sizes it ---------------------- */

type Shape = "map" | "bubble";
type Metric = "people" | "rate" | "land";

type Sized = StateTobacco & { users: number; area: number };

const SHAPES: Record<Shape, { label: string; word: string }> = {
  map: { label: "map", word: "area" },
  bubble: { label: "bubbles", word: "circle area" },
};

const METRICS: Record<
  Metric,
  {
    label: string;
    /** What the size is proportional to, for the legend line. */
    note: string;
    of: (d: Sized) => number;
    /** Null where the reader is being shown the map it is all bending away from. */
    ranks: ((d: Sized) => number) | null;
    big: (d: Sized) => string;
    say: string;
  }
> = {
  people: {
    label: "total number of tobacco consumers",
    note: "adults who use tobacco",
    of: (d) => d.users,
    ranks: (d) => d.users,
    big: (d) => fmtPeople(d.users),
    say: "adults use tobacco",
  },
  rate: {
    label: "share of tobacco consumers vs state population",
    note: "share of a state's adults who use tobacco",
    of: (d) => d.prevalence,
    ranks: (d) => d.prevalence,
    big: (d) => `${d.prevalence.toFixed(1)}%`,
    say: "of adults use tobacco",
  },
  land: {
    label: "true land area",
    note: "true land area",
    of: (d) => d.area,
    // Land area carries no tobacco figure, and the page has no square
    // kilometres to quote, so the table stays on the headline number.
    ranks: null,
    big: (d) => fmtPeople(d.users),
    say: "adults use tobacco",
  },
};

const ROWS: Record<Metric, string[]> = {
  people: PEOPLE_ROWS,
  rate: RATE_ROWS,
  land: LAND_ROWS,
};

/* ---- geometry ----------------------------------------------------------- */

type Cell = { col: number; row: number };
/** A shape's bounding box in grid units. Every transition is a box-to-box map. */
type Frame = { x: number; y: number; w: number; h: number };
type Art =
  | { kind: "path"; fill: string; edge: string }
  | { kind: "circle"; cx: number; cy: number; r: number };
type Piece = {
  code: string;
  art: Art;
  frame: Frame;
  label: { x: number; y: number } | null;
};

/** Below this an outline would eat the whole state, and area is the data. */
const MIN_CELLS_TO_OUTLINE = 20;
/** Enough clear interior to seat a two-character label. */
const MIN_INSET_TO_LABEL = 4;
/**
 * Share of a state's pixels that must survive its own outline for the outline
 * to be worth drawing.
 */
const MIN_CORE_SHARE = 0.5;
/** Share of the map's pixels the circles are allowed to cover in total. */
const BUBBLE_COVERAGE = 0.34;
/** A circle smaller than this has no room for its two-letter code. */
const MIN_RADIUS_TO_LABEL = 3.6;

function cellsByState(rows: string[]) {
  const found = new Map<string, Cell[]>();
  for (let row = 0; row < GRID_H; row++) {
    for (let col = 0; col < GRID_W; col++) {
      const ch = rows[row][col];
      if (ch === PIXEL_VOID) continue;
      const list = found.get(ch);
      if (list) list.push({ col, row });
      else found.set(ch, [{ col, row }]);
    }
  }
  return TOBACCO_BY_STATE.map((_, i) => found.get(PIXEL_CHARSET[i]) ?? []);
}

const LAND_CELLS = cellsByState(LAND_ROWS);

const STATES: Sized[] = TOBACCO_BY_STATE.map((d, i) => ({
  ...d,
  users: (d.adults * d.prevalence) / 100,
  // No square kilometres in the dataset, so the undistorted map's own pixel
  // count stands in for land area. It is what the land cartogram encodes too.
  area: LAND_CELLS[i].length,
}));

/** Where each state sits on the undistorted map — the seat for its bubble. */
const SEATS = LAND_CELLS.map((cells) => ({
  cx: cells.reduce((sum, c) => sum + c.col + 0.5, 0) / (cells.length || 1),
  cy: cells.reduce((sum, c) => sum + c.row + 0.5, 0) / (cells.length || 1),
}));

function boundsOf(cells: Cell[]): Frame {
  let x0 = GRID_W;
  let y0 = GRID_H;
  let x1 = 0;
  let y1 = 0;
  for (const c of cells) {
    if (c.col < x0) x0 = c.col;
    if (c.row < y0) y0 = c.row;
    if (c.col + 1 > x1) x1 = c.col + 1;
    if (c.row + 1 > y1) y1 = c.row + 1;
  }
  return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
}

/**
 * One rectangle per horizontal run of cells rather than one per cell. The
 * drawing is identical and the path data is several times smaller, which
 * matters when every state ships its outline in the server-rendered HTML.
 */
function toPath(cells: Cell[]) {
  const sorted = [...cells].sort((a, b) => a.row - b.row || a.col - b.col);
  let d = "";
  let i = 0;
  while (i < sorted.length) {
    const { col, row } = sorted[i];
    let len = 1;
    while (
      i + len < sorted.length &&
      sorted[i + len].row === row &&
      sorted[i + len].col === col + len
    ) {
      len++;
    }
    d += `M${col} ${row}h${len}v1h-${len}z`;
    i += len;
  }
  return d;
}

function buildPixels(rows: string[]): Piece[] {
  const at = (col: number, row: number) =>
    col < 0 || row < 0 || col >= GRID_W || row >= GRID_H
      ? PIXEL_VOID
      : rows[row][col];
  const perState = cellsByState(rows);

  return STATES.map((d, i) => {
    const ch = PIXEL_CHARSET[i];
    const cells = perState[i];

    // A darker shade of the same accent on every border cell. It reads as a
    // sprite keyline rather than as a value, so the state's footprint — which
    // IS the number here — is not eaten by the outline.
    // Only the right and bottom sides. Between two neighbours that means one
    // cell of keyline rather than two — each drawing its own facing edge —
    // and on the coast it reads as a sprite's drop shadow.
    const border = cells.filter(
      (c) => at(c.col + 1, c.row) !== ch || at(c.col, c.row + 1) !== ch,
    );
    // A state squeezed to a ribbon is all border and no middle. Outlining it
    // would paint it entirely in the keyline colour, so it would read as a dark
    // line between its neighbours rather than as a state. Those keep their
    // fill and let the neighbours' outlines do the separating.
    const hasCore =
      cells.length >= MIN_CELLS_TO_OUTLINE &&
      cells.length - border.length >= cells.length * MIN_CORE_SHARE;

    let label: Cell | null = null;
    let bestInset = 0;
    for (const c of cells) {
      let inset = 0;
      while (inset < 8) {
        const r = inset + 1;
        let clear = true;
        for (let dy = -r; dy <= r && clear; dy++) {
          for (let dx = -r; dx <= r && clear; dx++) {
            if (at(c.col + dx, c.row + dy) !== ch) clear = false;
          }
        }
        if (!clear) break;
        inset = r;
      }
      if (inset > bestInset) {
        bestInset = inset;
        label = c;
      }
    }

    return {
      code: d.code,
      art: {
        kind: "path",
        fill: toPath(cells),
        edge: hasCore ? toPath(border) : "",
      },
      frame: boundsOf(cells),
      label:
        label && bestInset >= MIN_INSET_TO_LABEL
          ? { x: label.col + 0.5, y: label.row + 0.5 }
          : null,
    };
  });
}

/**
 * One circle per state, seated on the state's own centre of mass in the
 * undistorted map. Area — not radius — carries the value, so a circle and a
 * cartogram state holding the same number cover the same count of pixels.
 */
function buildBubbles(metric: Metric): Piece[] {
  const land = LAND_CELLS.reduce((sum, cells) => sum + cells.length, 0);
  const value = METRICS[metric].of;
  const totalValue = STATES.reduce((sum, d) => sum + value(d), 0);
  const perUnit = (land * BUBBLE_COVERAGE) / totalValue;

  return STATES.map((d, i) => {
    const { cx, cy } = SEATS[i];
    const r = Math.sqrt((value(d) * perUnit) / Math.PI);
    return {
      code: d.code,
      art: { kind: "circle", cx, cy, r },
      frame: {
        x: cx - r,
        y: cy - r,
        w: Math.max(1, r * 2),
        h: Math.max(1, r * 2),
      },
      label: r >= MIN_RADIUS_TO_LABEL ? { x: cx, y: cy } : null,
    };
  });
}

/**
 * Drawn pixels in a grid. The people cartogram spends its own pixel budget, so
 * "one square = N people" has to divide by that grid's count, not the map's.
 */
const PEOPLE_CELLS = cellsByState(PEOPLE_ROWS).reduce(
  (sum, cells) => sum + cells.length,
  0,
);

const PIECES = new Map<string, Piece[]>();
function piecesFor(shape: Shape, metric: Metric): Piece[] {
  const key = `${shape}:${metric}`;
  const built = PIECES.get(key);
  if (built) return built;
  const made =
    shape === "bubble" ? buildBubbles(metric) : buildPixels(ROWS[metric]);
  PIECES.set(key, made);
  return made;
}

/* ---- the morph ---------------------------------------------------------- */

const MORPH_MS = 220;
/** Straight out of the gate, settling at the end. */
const ease = (t: number) => 1 - (1 - t) ** 3;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** The affine that lays `from`'s bounding box exactly over `onto`'s. */
function mapFrame(from: Frame, onto: Frame) {
  const sx = onto.w / from.w;
  const sy = onto.h / from.h;
  return { sx, sy, tx: onto.x - from.x * sx, ty: onto.y - from.y * sy };
}

function tweenFrame(a: Frame, b: Frame, t: number): Frame {
  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    w: lerp(a.w, b.w, t),
    h: lerp(a.h, b.h, t),
  };
}

/* ---- chrome ------------------------------------------------------------- */

const PANEL = "border-2 border-black bg-stone-900 shadow-[6px_6px_0_#000]";
const FILL = "#c80000";
/** The button component's hover red. Everything the cursor is not on wears it. */
const FILL_MUTED = "#960000";
const EDGE = "#5e0000";
const TOGGLE =
  "rounded-none bg-stone-900 text-stone-300 shadow-[6px_6px_0_#000] transition-all duration-100 ease-[steps(2,jump-end)] hover:translate-x-1 hover:translate-y-1 hover:bg-stone-800 hover:text-stone-50 hover:shadow-[3px_3px_0_#000] aria-pressed:bg-tar-red aria-pressed:text-white";

/** A chevron drawn the way everything else here is: on an 8x8 pixel grid. */
function ChevronLeftPixel() {
  return (
    <svg
      viewBox="0 0 8 8"
      fill="currentColor"
      shapeRendering="crispEdges"
      className="size-3"
    >
      {[5, 4, 3, 2, 2, 3, 4, 5].map((x, y) => (
        <rect key={y} x={x} y={y} width="2" height="1" />
      ))}
    </svg>
  );
}

export function TobaccoCartogram() {
  const [shape, setShape] = useState<Shape>("map");
  const [metric, setMetric] = useState<Metric>("people");
  const [active, setActive] = useState<string | null>(null);
  const [morph, setMorph] = useState<{ from: Piece[]; t: number } | null>(null);
  const drawn = useRef<Piece[] | null>(null);
  const plot = useRef<HTMLDivElement>(null);
  // The SVG letterboxes inside its box, so the tooltip needs the actual
  // grid-to-pixel mapping rather than a percentage of the container.
  const [fit, setFit] = useState({ s: 0, ox: 0, oy: 0, w: 0 });

  const spec = METRICS[metric];
  const target = piecesFor(shape, metric);

  useEffect(() => {
    const from = drawn.current;
    drawn.current = target;
    if (!from || from === target) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    let raf = 0;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / MORPH_MS);
      setMorph(t < 1 ? { from, t } : null);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);

  useEffect(() => {
    const el = plot.current;
    if (!el) return;
    const measure = () => {
      const { width, height } = el.getBoundingClientRect();
      const s = Math.min(width / GRID_W, height / GRID_H);
      setFit({
        s,
        ox: (width - GRID_W * s) / 2,
        oy: (height - GRID_H * s) / 2,
        w: width,
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const source = morph?.from ?? null;
  const t = morph ? ease(morph.t) : 1;

  const total = STATES.reduce((sum, d) => sum + d.users, 0);
  const rank = spec.ranks ?? METRICS.people.ranks!;
  const ranked = [...STATES].sort((a, b) => rank(b) - rank(a));
  const board = spec.ranks ? spec : METRICS.people;
  const hovered = active ? STATES.find((d) => d.code === active) : null;
  const tip = hovered ? target[STATES.indexOf(hovered)] : null;

  const place = (piece: Piece, i: number, incoming: boolean) => {
    const other = incoming ? source?.[i].frame : target[i].frame;
    const frame = other
      ? tweenFrame(
          incoming ? other : piece.frame,
          incoming ? piece.frame : other,
          t,
        )
      : piece.frame;
    const m = mapFrame(piece.frame, frame);
    return {
      transform: `translate(${m.tx} ${m.ty}) scale(${m.sx} ${m.sy})`,
      label: piece.label && {
        x: m.tx + piece.label.x * m.sx,
        y: m.ty + piece.label.y * m.sy,
      },
    };
  };

  /**
   * Circles overlap, so the biggest are painted first and the smallest land on
   * top. The index rides along: it is what pairs a piece with its counterpart
   * in the view being morphed away from.
   */
  const paintOrder = (pieces: Piece[]): [Piece, number][] => {
    const withIndex = pieces.map((p, i): [Piece, number] => [p, i]);
    if (pieces[0]?.art.kind !== "circle") return withIndex;
    return withIndex.sort((a, b) => b[0].frame.w - a[0].frame.w);
  };

  const layer = (pieces: Piece[], incoming: boolean) => (
    <g
      // The incoming layer rises faster than the outgoing one falls, so the
      // map does not dip towards the background halfway through the morph.
      opacity={incoming ? Math.sqrt(t) : 1 - t}
      pointerEvents={incoming ? undefined : "none"}
    >
      {paintOrder(pieces).map(([piece, i]) => {
        const d = STATES[i];
        const { transform } = place(piece, i, incoming);
        const fill =
          active !== null && active !== piece.code ? FILL_MUTED : FILL;
        return (
          <g
            key={piece.code}
            transform={transform}
            className="cursor-pointer outline-none"
            tabIndex={incoming ? 0 : -1}
            onMouseEnter={() => setActive(piece.code)}
            onMouseLeave={() => setActive(null)}
            onFocus={() => setActive(piece.code)}
            onBlur={() => setActive(null)}
          >
            <title>
              {`${d.name}: ${d.prevalence}% of adults, ${fmtPeople(d.users)} people`}
            </title>
            {piece.art.kind === "path" ? (
              <>
                <path d={piece.art.fill} fill={fill} />
                {piece.art.edge && <path d={piece.art.edge} fill={EDGE} />}
              </>
            ) : (
              <circle
                cx={piece.art.cx}
                cy={piece.art.cy}
                r={piece.art.r}
                fill={fill}
                stroke={EDGE}
                strokeWidth={1}
              />
            )}
          </g>
        );
      })}
    </g>
  );

  const labels = (pieces: Piece[], incoming: boolean) => (
    <g
      aria-hidden="true"
      className="pointer-events-none"
      opacity={incoming ? t * t : (1 - t) * (1 - t)}
      fill="#180000"
      fontSize={5}
    >
      {paintOrder(pieces).map(([piece, i]) => {
        const { label } = place(piece, i, incoming);
        return label ? (
          <text
            key={piece.code}
            x={label.x}
            y={label.y}
            textAnchor="middle"
            dominantBaseline="central"
          >
            {piece.code}
          </text>
        ) : null;
      })}
    </g>
  );

  return (
    <div className="dark flex h-screen flex-col-reverse overflow-hidden bg-stone-950 font-sans text-stone-50 lg:flex-row">
      <TwinkleBackdrop />

      <aside className="relative z-10 flex shrink-0 flex-col gap-3 px-5 pt-2 pb-4 lg:h-screen lg:w-[25rem] lg:px-8 lg:py-6">
        <div className="flex">
          <Button
            render={<Link to="/" />}
            nativeButton={false}
            className="h-9 gap-2 rounded-none bg-stone-900 px-3 text-lg text-stone-300 shadow-[4px_4px_0_#000] transition-all duration-100 ease-[steps(2,jump-end)] hover:translate-x-1 hover:translate-y-1 hover:bg-tar-red-dark hover:text-white hover:shadow-[2px_2px_0_#000] active:translate-x-1 active:translate-y-1 active:shadow-none"
          >
            <ChevronLeftPixel />
            tar nation
          </Button>
        </div>

        <p className="flex flex-wrap items-baseline gap-x-3">
          <span className="text-6xl text-tar-red [text-shadow:4px_4px_0_#000] lg:text-7xl">
            {(total / 10).toFixed(0)} crore
          </span>
          <span className="text-2xl text-stone-300 lg:text-3xl">
            adults use tobacco
          </span>
        </p>

        <Fieldset className="gap-1.5">
          <FieldsetLegend className="text-lg text-stone-500">
            shape
          </FieldsetLegend>
          <ToggleGroup
            value={[shape]}
            onValueChange={(next) => {
              const [picked] = next;
              if (picked) setShape(picked as Shape);
            }}
            className="grid grid-cols-2 gap-3"
          >
            {(Object.keys(SHAPES) as Shape[]).map((key) => (
              <ToggleGroupItem
                key={key}
                value={key}
                className={`h-10 justify-center px-2 text-lg ${TOGGLE}`}
              >
                {SHAPES[key].label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Fieldset>

        <Fieldset className="gap-1.5">
          <FieldsetLegend className="text-lg text-stone-500">
            {SHAPES[shape].word} shows
          </FieldsetLegend>
          <ToggleGroup
            value={[metric]}
            onValueChange={(next) => {
              const [picked] = next;
              if (picked) setMetric(picked as Metric);
            }}
            className="flex-col items-stretch gap-3"
          >
            {(Object.keys(METRICS) as Metric[]).map((key) => (
              <ToggleGroupItem
                key={key}
                value={key}
                className={`h-auto justify-start px-3 py-1.5 text-left text-lg leading-tight whitespace-normal ${TOGGLE}`}
              >
                {METRICS[key].label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Fieldset>

        <div className="flex min-h-0 flex-1 flex-col gap-1.5">
          <span className="text-lg text-stone-500">
            top 5 &middot; {board.label}
          </span>
          <ol className="min-h-0 flex-1 overflow-y-auto">
            {ranked.slice(0, 5).map((d, i) => (
              <li key={d.code}>
                <button
                  type="button"
                  className={
                    i === 0
                      ? `flex w-full flex-wrap items-baseline gap-x-2 px-2 py-1.5 text-left outline-none ${PANEL} ${
                          active === d.code ? "bg-stone-800" : ""
                        }`
                      : `grid w-full grid-cols-[auto_1fr_auto] items-center gap-2 border-b-2 border-stone-800 py-1.5 text-left text-lg outline-none ${
                          active === d.code ? "bg-stone-900 text-stone-50" : ""
                        }`
                  }
                  onMouseEnter={() => setActive(d.code)}
                  onMouseLeave={() => setActive(null)}
                  onFocus={() => setActive(d.code)}
                  onBlur={() => setActive(null)}
                >
                  {i === 0 ? (
                    <>
                      <span className="text-xl text-stone-50">{d.name}</span>
                      <span className="text-2xl text-tar-red">
                        {board.big(d)}
                      </span>
                      <span className="w-full text-base text-stone-500">
                        {board.say}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="text-stone-600">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="truncate text-stone-300">{d.name}</span>
                      <span className="text-tar-red">{board.big(d)}</span>
                    </>
                  )}
                </button>
              </li>
            ))}
          </ol>
        </div>

        <div className="flex flex-col gap-0.5 text-stone-500">
          <p className="flex items-center gap-2 text-lg">
            <span
              aria-hidden
              className="size-3 shrink-0 bg-tar-red ring-2 ring-[#5e0000]"
            />
            {SHAPES[shape].word} = {spec.note}
          </p>
          {shape === "map" && metric === "people" && (
            <p className="text-base text-stone-600">
              one square ={" "}
              {Math.round((total * 1e6) / PEOPLE_CELLS / 1000).toLocaleString(
                "en-IN",
              )}
              ,000 people
            </p>
          )}
          <p className="font-serif text-base text-stone-600">
            gats-2 &middot; india 2016-17
          </p>
        </div>
      </aside>

      <main className="relative z-10 min-h-0 flex-1 px-4 pb-2 lg:p-8 lg:pl-0">
        <div ref={plot} className="relative h-full w-full">
          <svg
            viewBox={`0 0 ${GRID_W} ${GRID_H}`}
            preserveAspectRatio="xMidYMid meet"
            className="h-full w-full"
            shapeRendering="crispEdges"
            role="img"
            aria-label={`pixel cartogram of india. ${SHAPES[shape].word} = ${spec.note}`}
          >
            {source && layer(source, false)}
            {layer(target, true)}
            {source && labels(source, false)}
            {labels(target, true)}
          </svg>

          {hovered && tip && fit.s > 0 && (
            <div
              className={`pointer-events-none absolute z-10 flex w-44 -translate-x-1/2 -translate-y-full flex-col gap-0.5 p-2 ${PANEL}`}
              style={{
                left: Math.min(
                  Math.max(
                    fit.ox + (tip.frame.x + tip.frame.w / 2) * fit.s,
                    88,
                  ),
                  fit.w - 88,
                ),
                top: fit.oy + tip.frame.y * fit.s - 10,
              }}
            >
              <span className="text-lg text-stone-50">{hovered.name}</span>
              <span className="text-2xl text-tar-red">{spec.big(hovered)}</span>
              <span className="text-base text-stone-400">{spec.say}</span>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
