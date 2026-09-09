import { useEffect, useRef } from "react";

import { MAZE_COLS, MAZE_ROWS, PAC_SPAWN, TILE } from "#/features/pacman/maze";
import { drawFrame } from "#/features/pacman/render";

export function PacmanGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;

    drawFrame(ctx, {
      pac: {
        x: PAC_SPAWN.col,
        y: PAC_SPAWN.row,
        dir: "left",
        mouth: 0.6,
      },
    });
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={MAZE_COLS * TILE}
      height={MAZE_ROWS * TILE}
      className="block"
    />
  );
}
