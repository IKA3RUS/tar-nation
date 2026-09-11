import { Link } from "@tanstack/react-router";

import { Button } from "#/components/ui/button";

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

/** Shared by every page that is not the home page, so the way out never moves. */
export function BackButton() {
  return (
    <Button
      render={<Link to="/" />}
      nativeButton={false}
      className="h-9 gap-2 rounded-none bg-stone-900 px-3 text-lg text-stone-300 shadow-[4px_4px_0_#000] transition-all duration-100 ease-[steps(2,jump-end)] hover:translate-x-1 hover:translate-y-1 hover:bg-tar-red-dark hover:text-white hover:shadow-[2px_2px_0_#000] active:translate-x-1 active:translate-y-1 active:shadow-none"
    >
      <ChevronLeftPixel />
      tar nation
    </Button>
  );
}
