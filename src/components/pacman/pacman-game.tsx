import { useEffect, useRef } from "react";

import { createGame, step, type Direction } from "#/features/pacman/game";
import { MAZE_COLS, MAZE_ROWS, TILE } from "#/features/pacman/maze";
import { drawFrame } from "#/features/pacman/render";

const KEY_TO_DIR: Record<string, Direction> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  w: "up",
  a: "left",
  s: "down",
  d: "right",
  W: "up",
  A: "left",
  S: "down",
  D: "right",
};

export function PacmanGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef(createGame());

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;

    const game = gameRef.current;
    let raf = 0;
    let last = performance.now();

    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 1 / 30);
      last = now;
      step(game, dt);
      drawFrame(ctx, game);
      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const dir = KEY_TO_DIR[e.key];
      if (!dir) return;
      e.preventDefault();
      const game = gameRef.current;
      game.pac.want = dir;
      game.started = true;
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
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
