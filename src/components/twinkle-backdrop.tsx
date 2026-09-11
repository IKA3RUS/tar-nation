/* Sparse field of Marlboro packs, with small skulls twinkling across it.
 *
 * Spacing: `background-repeat: space` only distributes leftover pixels, which
 * at this tile size is ~1px — far too dense. So the packs tile contiguously at
 * their natural 51x80 and a pair of repeating-gradient mask layers keep one
 * pack per CELL, hiding the rest. Changing CELL_W / CELL_H is the spacing dial.
 *
 * Alignment: every layer paints its tiles from its own origin, so each twinkle
 * is a single pack-sized box parked on an exact cell multiple. That puts its
 * tiling in phase with the base layer underneath, and a twinkle therefore
 * brightens the very pack it covers rather than drawing a second, offset one.
 * Because the box is exactly one pack, it needs no grid mask of its own — only
 * the skull.
 *
 * Cost: one static base layer plus a handful of small masked spans animating
 * `opacity` only — a compositor-thread property. No canvas redraw loop, no GL
 * context, no per-frame JS.
 */

const PACK_W = 51;
const PACK_H = 80;
const CELL_W = 153;
const CELL_H = 160;
const SKULL_SIZE = 28;
/* Nudge left off the pack's centre. */
const SKULL_NUDGE_X = 5;

/* 8x8 pixel skull, drawn as runs of solid cells per row. */
const SKULL = `url("data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 8 8'>${[
    "<rect x='2' y='0' width='4' height='1'/>",
    "<rect x='1' y='1' width='6' height='1'/>",
    "<rect x='0' y='2' width='8' height='1'/>",
    "<rect x='0' y='3' width='1' height='1'/>",
    "<rect x='3' y='3' width='2' height='1'/>",
    "<rect x='7' y='3' width='1' height='1'/>",
    "<rect x='0' y='4' width='8' height='1'/>",
    "<rect x='0' y='5' width='3' height='1'/>",
    "<rect x='5' y='5' width='3' height='1'/>",
    "<rect x='1' y='6' width='6' height='1'/>",
    "<rect x='1' y='7' width='1' height='1'/>",
    "<rect x='3' y='7' width='2' height='1'/>",
    "<rect x='6' y='7' width='1' height='1'/>",
  ].join("")}</svg>`,
)}")`;

const PACK_LAYER = {
  backgroundImage: "url(/images/marlboro-pack.png)",
  backgroundSize: `${PACK_W}px ${PACK_H}px`,
} as const;

/* Column/row indices into the pack grid, so each twinkle lands in phase. */
const TWINKLES = [
  { col: 0, row: 0, delay: "0s", duration: "5.4s" },
  { col: 2, row: 1, delay: "1.9s", duration: "4.1s" },
  { col: 4, row: 0, delay: "3.4s", duration: "6.2s" },
  { col: 1, row: 2, delay: "0.8s", duration: "4.8s" },
  { col: 3, row: 3, delay: "2.6s", duration: "5.9s" },
  { col: 5, row: 2, delay: "4.3s", duration: "4.4s" },
  { col: 0, row: 4, delay: "1.2s", duration: "6.6s" },
  { col: 2, row: 5, delay: "3.1s", duration: "5.1s" },
  { col: 6, row: 1, delay: "0.4s", duration: "4.6s" },
  { col: 4, row: 4, delay: "2.2s", duration: "6.0s" },
  { col: 7, row: 3, delay: "4.9s", duration: "4.3s" },
  { col: 1, row: 5, delay: "1.6s", duration: "5.7s" },
  { col: 5, row: 5, delay: "3.8s", duration: "4.9s" },
  { col: 8, row: 0, delay: "0.1s", duration: "6.3s" },
];

export function TwinkleBackdrop() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 overflow-hidden"
    >
      <div
        className="absolute inset-0 opacity-10"
        style={{
          ...PACK_LAYER,
          maskImage: [
            `repeating-linear-gradient(to right, #000 0 ${PACK_W}px, #0000 ${PACK_W}px ${CELL_W}px)`,
            `repeating-linear-gradient(to bottom, #000 0 ${PACK_H}px, #0000 ${PACK_H}px ${CELL_H}px)`,
          ].join(", "),
          maskComposite: "intersect",
        }}
      />
      {TWINKLES.map((t) => (
        <span
          key={`${t.col}-${t.row}`}
          className="absolute animate-twinkle opacity-0"
          style={{
            ...PACK_LAYER,
            left: t.col * CELL_W,
            top: t.row * CELL_H,
            width: PACK_W,
            height: PACK_H,
            maskImage: SKULL,
            maskSize: `${SKULL_SIZE}px ${SKULL_SIZE}px`,
            maskPosition: `calc(50% - ${SKULL_NUDGE_X}px) center`,
            maskRepeat: "no-repeat",
            animationDelay: t.delay,
            animationDuration: t.duration,
          }}
        />
      ))}
    </div>
  );
}
