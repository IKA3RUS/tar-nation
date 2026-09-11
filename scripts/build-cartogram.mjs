/**
 * Builds the pixel cartograms in `src/data/india-pixels.ts`.
 *
 * A cartogram distorts every state until its AREA is proportional to a data
 * value, so the map's shape carries the number. Colour is then free to mean
 * nothing, and the reader measures with their eyes instead of a legend.
 *
 * The distortion is the Dougenik-Chrisman-Niemeyer rubber sheet: each state
 * radiates a force field that pushes vertices outward while it is too small and
 * pulls them in while it is too big, iterated until the areas converge.
 *
 * The state outlines it warps are traced off a high-resolution raster rather
 * than unioned from district polygons. That is deliberate: grid-traced borders
 * meet at exact integer corners, so a vertex on the border between two states
 * is literally the same point for both, and the sheet cannot tear.
 *
 * Node --experimental-strip-types scripts/build-cartogram.mjs [geojson]
 *
 * Source: https://github.com/udit-001/india-maps-data (district boundaries
 * carrying an `st_nm` state name).
 */
import { writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";

import { geoContains, geoMercator } from "d3";

import { TOBACCO_BY_STATE } from "../src/data/tobacco.ts";

const SRC =
  "https://raw.githubusercontent.com/udit-001/india-maps-data/main/geojson/india.geojson";

/** Output grid — the pixels the page actually draws. */
const GRID_W = 176;
const GRID_H = 192;
/** Tracing grid. Finer than the output so warped coastlines stay believable. */
const SRC_W = 352;
const SRC_H = 384;
/** Dougenik iterations; the size error plateaus well before this. */
const ITERATIONS = 120;
/** Ceiling on any one region's contribution to the damping term. */
const ERROR_CLAMP = 3;

const SKIP = new Set(["Andaman and Nicobar Islands", "Lakshadweep"]);
const ALIASES = {
  "Jammu and Kashmir": "Jammu & Kashmir",
  // Ladakh was still part of J&K when GATS-2 was fielded in 2016-17.
  Ladakh: "Jammu & Kashmir",
};

const CHARSET =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const VOID = ".";

const file = process.argv[2];
const geo = file
  ? JSON.parse(await readFile(file, "utf8"))
  : await fetch(SRC).then((r) => r.json());

const districts = geo.features.filter((f) => !SKIP.has(f.properties.st_nm));
const nameOf = (f) => ALIASES[f.properties.st_nm] ?? f.properties.st_nm;
const dataIndex = new Map(TOBACCO_BY_STATE.map((d, i) => [d.name, i]));

// ------------------------------------------------------- trace-grid raster

const projection = geoMercator().fitExtent(
  [
    [0, 0],
    [SRC_W, SRC_H],
  ],
  { type: "FeatureCollection", features: districts },
);

const boxed = districts.map((f) => {
  let w = Infinity,
    s = Infinity,
    e = -Infinity,
    n = -Infinity;
  eachPosition(f.geometry, ([lon, lat]) => {
    if (lon < w) w = lon;
    if (lon > e) e = lon;
    if (lat < s) s = lat;
    if (lat > n) n = lat;
  });
  return { f, w, s, e, n, index: dataIndex.get(nameOf(f)) };
});

function eachPosition(geometry, fn) {
  const depth = { Polygon: 2, MultiPolygon: 3, LineString: 1, Point: 0 };
  const walk = (c, d) => {
    if (d === 0) return fn(c);
    for (const part of c) walk(part, d - 1);
  };
  walk(geometry.coordinates, depth[geometry.type] ?? 2);
}

const source = Array.from({ length: SRC_W * SRC_H }, () => -1);
for (let row = 0; row < SRC_H; row++) {
  for (let col = 0; col < SRC_W; col++) {
    const ll = projection.invert([col + 0.5, row + 0.5]);
    if (!ll) continue;
    const [lon, lat] = ll;
    for (const b of boxed) {
      if (lon < b.w || lon > b.e || lat < b.s || lat > b.n) continue;
      if (b.index === undefined) continue;
      if (!geoContains(b.f, ll)) continue;
      source[row * SRC_W + col] = b.index;
      break;
    }
  }
}

// Nothing surveyed may be missing before we even start distorting.
for (const [name, index] of dataIndex) {
  if (source.includes(index)) continue;
  const d = TOBACCO_BY_STATE[index];
  const [x, y] = projection([d.lon, d.lat]);
  const col = Math.min(SRC_W - 1, Math.max(0, Math.floor(x)));
  const row = Math.min(SRC_H - 1, Math.max(0, Math.floor(y)));
  source[row * SRC_W + col] = index;
  console.log(`seeded ${name} at one trace cell`);
}

// ------------------------------------------------------------ boundary trace
//
// Every cell contributes the edges it does not share with its own state, wound
// so the state stays on one side. Endpoints are integer grid corners, so the
// border between two states is the same set of points for both of them.

const cellAt = (col, row) =>
  col < 0 || row < 0 || col >= SRC_W || row >= SRC_H
    ? -1
    : source[row * SRC_W + col];

function traceRings(index) {
  const segments = new Map(); // "x,y" of start -> [end]
  const add = (ax, ay, bx, by) => {
    const key = `${ax},${ay}`;
    const list = segments.get(key);
    if (list) list.push([bx, by]);
    else segments.set(key, [[bx, by]]);
  };

  for (let row = 0; row < SRC_H; row++) {
    for (let col = 0; col < SRC_W; col++) {
      if (cellAt(col, row) !== index) continue;
      if (cellAt(col, row - 1) !== index) add(col, row, col + 1, row);
      if (cellAt(col + 1, row) !== index) add(col + 1, row, col + 1, row + 1);
      if (cellAt(col, row + 1) !== index) add(col + 1, row + 1, col, row + 1);
      if (cellAt(col - 1, row) !== index) add(col, row + 1, col, row);
    }
  }

  const rings = [];
  while (segments.size > 0) {
    const startKey = segments.keys().next().value;
    const [sx, sy] = startKey.split(",").map(Number);
    const ring = [[sx, sy]];
    let [cx, cy] = [sx, sy];
    while (true) {
      const list = segments.get(`${cx},${cy}`);
      if (!list || list.length === 0) break;
      const [nx, ny] = list.pop();
      if (list.length === 0) segments.delete(`${cx},${cy}`);
      if (nx === sx && ny === sy) break;
      ring.push([nx, ny]);
      cx = nx;
      cy = ny;
    }
    if (ring.length >= 4) rings.push(ring);
  }
  return rings;
}

function ringArea(ring) {
  let a = 0;
  for (let i = 0, n = ring.length, j = n - 1; i < n; j = i++) {
    a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  }
  return a / 2;
}

/**
 * Drops fragments far smaller than a state's main body.
 *
 * The warp models each state as one disc at its centroid, which quietly falls
 * apart for a state scattered across the map: Puducherry's exclaves sit
 * hundreds of kilometres apart on opposite coasts, so its centroid lands in
 * open sea and the force field inflates nothing. These specks cannot be drawn
 * legibly at this resolution anyway, so the main body stands for the state.
 */
function dropSpecks(rings) {
  const areas = rings.map((r) => Math.abs(ringArea(r)));
  const largest = Math.max(...areas);
  const kept = rings.filter((_, i) => areas[i] >= largest * 0.06);
  return kept.length > 0 ? kept : rings;
}

const regions = TOBACCO_BY_STATE.map((d, i) => ({
  char: CHARSET[i],
  name: d.name,
  users: (d.adults * d.prevalence) / 100,
  prevalence: d.prevalence,
  rings: dropSpecks(traceRings(i)),
}));

for (const r of regions) {
  if (r.rings.length === 0) throw new Error(`traced no outline for ${r.name}`);
}

// ------------------------------------------------------------------ geometry

/** Signed areas cancel, so holes subtract themselves. */
const areaOf = (rings) => Math.abs(rings.reduce((s, r) => s + ringArea(r), 0));

function centroidOf(rings) {
  let cx = 0,
    cy = 0,
    area = 0;
  for (const ring of rings) {
    for (let i = 0, n = ring.length, j = n - 1; i < n; j = i++) {
      const f = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
      cx += (ring[j][0] + ring[i][0]) * f;
      cy += (ring[j][1] + ring[i][1]) * f;
      area += f;
    }
  }
  area /= 2;
  return area === 0 ? rings[0][0] : [cx / (6 * area), cy / (6 * area)];
}

// ------------------------------------------------------------------ the warp

function cartogram(values) {
  // One shared vertex table. Rings hold indexes into it, so a point on a state
  // border is stored once and therefore moves exactly once.
  const points = [];
  const index = new Map();
  const shapes = regions.map((r) =>
    r.rings.map((ring) =>
      ring.map(([x, y]) => {
        const key = `${x},${y}`;
        let id = index.get(key);
        if (id === undefined) {
          id = points.length;
          points.push([x, y]);
          index.set(key, id);
        }
        return id;
      }),
    ),
  );

  const ringsOf = (si) =>
    shapes[si].map((ring) => ring.map((id) => points[id]));
  const totalValue = values.reduce((s, v) => s + v, 0);
  let sizeError = Infinity;

  for (let iter = 0; iter < ITERATIONS; iter++) {
    const areas = shapes.map((_, si) => areaOf(ringsOf(si)));
    const totalArea = areas.reduce((s, a) => s + a, 0);

    const meta = shapes.map((_, si) => {
      const wanted = (totalArea * values[si]) / totalValue;
      const radius = Math.sqrt(areas[si] / Math.PI);
      return {
        centre: centroidOf(ringsOf(si)),
        radius,
        mass: Math.sqrt(wanted / Math.PI) - radius,
        error: Math.max(areas[si], wanted) / Math.min(areas[si], wanted),
      };
    });

    sizeError = meta.reduce((s, m) => s + m.error, 0) / meta.length;
    // Dougenik damps by the mean size error, which lets a single pathological
    // region freeze the whole sheet: a sub-pixel union territory asking to grow
    // 350-fold drags the mean up, the damping down, and nothing moves at all.
    // Clamping each region's contribution keeps the damping responsive to how
    // wrong the map broadly is, without one outlier holding it hostage.
    const damped =
      meta.reduce((s, m) => s + Math.min(m.error, ERROR_CLAMP), 0) /
      meta.length;
    // Dougenik's damping: the further the map is from correct, the more
    // cautiously any single vertex is allowed to move.
    const damping = 1 / (1 + damped);

    const moved = points.map(([px, py]) => {
      let dx = 0;
      let dy = 0;
      for (const m of meta) {
        const vx = px - m.centre[0];
        const vy = py - m.centre[1];
        const dist = Math.hypot(vx, vy);
        if (dist < 1e-9 || m.radius < 1e-9) continue;
        const force =
          dist > m.radius
            ? (m.mass * m.radius) / dist
            : m.mass *
              ((dist * dist) / (m.radius * m.radius)) *
              (4 - (3 * dist) / m.radius);
        dx += (force * vx) / dist;
        dy += (force * vy) / dist;
      }
      return [px + dx * damping, py + dy * damping];
    });

    for (let i = 0; i < points.length; i++) points[i] = moved[i];
  }

  return { shapes: shapes.map((_, si) => ringsOf(si)), sizeError };
}

// ------------------------------------------------------------- rasterisation

/**
 * Sub-rows scanned per cell row. Coverage is measured, not sampled, across the
 * row, so this only needs to resolve detail in y.
 */
const SUB = 4;

/**
 * Adds each ring's area coverage, in cells, into `cov`.
 *
 * Scanline rather than per-point hit testing: for every sub-row, find where the
 * outline crosses it, sort the crossings, and fill between alternate pairs.
 * That costs one pass over the edges per row instead of one per sample, and it
 * yields true fractional coverage, so a cell that a state half fills is known
 * to be half filled rather than guessed at from probes.
 */
function accumulate(rings, cov) {
  for (let row = 0; row < GRID_H; row++) {
    for (let sub = 0; sub < SUB; sub++) {
      const y = row + (sub + 0.5) / SUB;
      const crossings = [];
      for (const ring of rings) {
        for (let i = 0, n = ring.length, j = n - 1; i < n; j = i++) {
          const [xi, yi] = ring[i];
          const [xj, yj] = ring[j];
          if (yi > y !== yj > y) {
            crossings.push(xi + ((y - yi) * (xj - xi)) / (yj - yi));
          }
        }
      }
      if (crossings.length < 2) continue;
      crossings.sort((a, b) => a - b);
      for (let k = 0; k + 1 < crossings.length; k += 2) {
        const x0 = Math.max(0, crossings[k]);
        const x1 = Math.min(GRID_W, crossings[k + 1]);
        if (x1 <= x0) continue;
        const first = Math.floor(x0);
        const last = Math.min(GRID_W - 1, Math.ceil(x1) - 1);
        for (let col = first; col <= last; col++) {
          const span = Math.min(x1, col + 1) - Math.max(x0, col);
          if (span > 0) cov[row * GRID_W + col] += span / SUB;
        }
      }
    }
  }
}

function rasterise(shapes) {
  // Refit whatever the warp produced, so each cartogram fills the same frame
  // however far it stretched.
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const rings of shapes) {
    for (const ring of rings) {
      for (const [x, y] of ring) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  const scale = Math.min(GRID_W / (maxX - minX), GRID_H / (maxY - minY));
  const offX = (GRID_W - (maxX - minX) * scale) / 2;
  const offY = (GRID_H - (maxY - minY) * scale) / 2;

  const placed = shapes.map((rings) =>
    rings.map((ring) =>
      ring.map(([x, y]) => [
        (x - minX) * scale + offX,
        (y - minY) * scale + offY,
      ]),
    ),
  );

  // Whichever state covers most of a cell takes it; a cell that is mostly sea
  // stays empty.
  const bestCov = new Float32Array(GRID_W * GRID_H);
  const bestState = new Int16Array(GRID_W * GRID_H).fill(-1);
  const cov = new Float32Array(GRID_W * GRID_H);

  for (let si = 0; si < placed.length; si++) {
    cov.fill(0);
    accumulate(placed[si], cov);
    for (let i = 0; i < cov.length; i++) {
      if (cov[i] > bestCov[i]) {
        bestCov[i] = cov[i];
        bestState[i] = si;
      }
    }
  }

  const grid = Array.from({ length: GRID_W * GRID_H }, (_, i) =>
    bestState[i] >= 0 && bestCov[i] >= 0.5 ? regions[bestState[i]].char : VOID,
  );

  const missing = [];
  for (let si = 0; si < placed.length; si++) {
    if (grid.includes(regions[si].char)) continue;
    const [cx, cy] = centroidOf(placed[si]);
    const col = Math.min(GRID_W - 1, Math.max(0, Math.floor(cx)));
    const row = Math.min(GRID_H - 1, Math.max(0, Math.floor(cy)));
    grid[row * GRID_W + col] = regions[si].char;
    missing.push(regions[si].name);
  }

  const rows = [];
  for (let r = 0; r < GRID_H; r++) {
    rows.push(grid.slice(r * GRID_W, (r + 1) * GRID_W).join(""));
  }

  const land = grid.filter((c) => c !== VOID).length;
  return { rows, missing, land, audit: (values) => audit(grid, land, values) };
}

/**
 * How close the finished pixels came to the values they are supposed to encode.
 * This is the number that matters — the warp's own size error is measured on
 * polygons that then get rounded onto a grid, and it is a mean, so one
 * sub-pixel territory can dominate it and hide that everything else is right.
 */
function audit(grid, land, values) {
  const counts = new Map();
  for (const ch of grid)
    if (ch !== VOID) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  const total = values.reduce((s, v) => s + v, 0);
  const off = regions
    .map((r, i) => {
      const got = counts.get(r.char) ?? 0;
      const want = (land * values[i]) / total;
      return {
        name: r.name,
        got,
        want,
        ratio: Math.max(got, want) / Math.max(Math.min(got, want), 1e-9),
      };
    })
    .sort((a, b) => b.ratio - a.ratio);
  return {
    within10: off.filter((o) => o.ratio <= 1.1).length,
    worst: off.slice(0, 2),
  };
}

// ------------------------------------------------------------------- outputs

const VIEWS = [
  { key: "people", value: (r) => r.users, label: "people who use tobacco" },
  {
    key: "rate",
    value: (r) => r.prevalence,
    label: "share of adults who use tobacco",
  },
  { key: "land", value: null, label: "true land area" },
];

const built = {};
for (const view of VIEWS) {
  const values = view.value ? regions.map(view.value) : null;
  const shapes = values
    ? cartogram(values).shapes
    : regions.map((r) => r.rings);
  const out = rasterise(shapes);
  const report = values ? out.audit(values) : null;
  built[view.key] = { ...out, report };
  console.log(
    `${view.key.padEnd(6)} land=${String(out.land).padStart(5)}` +
      (report
        ? `  ${report.within10}/${regions.length} states within 10%  ` +
          `worst: ${report.worst
            .map((w) => `${w.name} ${w.got}px vs ${w.want.toFixed(1)}`)
            .join(", ")}`
        : "") +
      (out.missing.length
        ? `  drawn at one cell: ${out.missing.join(", ")}`
        : ""),
  );
}

const block = (key) =>
  `export const ${key.toUpperCase()}_ROWS: string[] = [\n${built[key].rows
    .map((r) => `  ${JSON.stringify(r)},`)
    .join("\n")}\n];`;

writeFileSync(
  new URL("../src/data/india-pixels.ts", import.meta.url),
  `// GENERATED by scripts/build-cartogram.mjs — do not edit by hand.
//
// Three ${GRID_W}x${GRID_H} pixel grids of India. Each character is one cell:
// "${VOID}" is empty, anything else indexes TOBACCO_BY_STATE through PIXEL_CHARSET.
//
// PEOPLE_ROWS and RATE_ROWS are contiguous area cartograms: every state has
// been stretched or squeezed until its area is proportional to its value, so
// the shapes are deliberately wrong and the AREA is the data. LAND_ROWS is the
// undistorted map, kept only as the reference to read the other two against.
//
// Source: ${SRC}
${VIEWS.map((v) => {
  const b = built[v.key];
  const acc = b.report
    ? ` — ${b.report.within10}/${regions.length} states land within 10% of target`
    : "";
  const miss = b.missing.length
    ? `; below one pixel, drawn at one: ${b.missing.join(", ")}`
    : "";
  return `// ${v.key}: area proportional to ${v.label}${acc}${miss}`;
}).join("\n")}

export const GRID_W = ${GRID_W};
export const GRID_H = ${GRID_H};
export const PIXEL_VOID = "${VOID}";
export const PIXEL_CHARSET = ${JSON.stringify(CHARSET.slice(0, TOBACCO_BY_STATE.length))};

${block("people")}

${block("rate")}

${block("land")}
`,
);
console.log("wrote src/data/india-pixels.ts");
