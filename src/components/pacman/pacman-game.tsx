import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import {
  createGame,
  resetGame,
  step,
  type Direction,
} from "#/features/pacman/game";
import {
  CANVAS_H,
  CANVAS_W,
  drawFrame,
  END_SCREEN_BUTTON_TOP,
} from "#/features/pacman/render";

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
  const [ended, setEnded] = useState(false);

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
      setEnded(
        game.status === "won" ||
          game.status === "lost" ||
          game.status === "timeout",
      );
      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const game = gameRef.current;

      if (
        game.status === "won" ||
        game.status === "lost" ||
        game.status === "timeout"
      ) {
        if (e.key === "r" || e.key === "R") {
          e.preventDefault();
          resetGame(game);
        }
        return;
      }

      const dir = KEY_TO_DIR[e.key];
      if (!dir) return;
      e.preventDefault();
      game.pac.want = dir;
      if (game.status === "ready") game.status = "playing";
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="relative" style={{ width: CANVAS_W, height: CANVAS_H }}>
      <canvas
        ref={canvasRef}
        width={CANVAS_W}
        height={CANVAS_H}
        className="block"
      />
      {ended && (
        <Link
          to="/"
          className="absolute left-1/2 -translate-x-1/2 rounded border border-white/40 bg-black/60 px-3 py-1 text-sm text-white hover:bg-white/10"
          style={{ top: END_SCREEN_BUTTON_TOP }}
        >
          View Datavis
        </Link>
      )}
    </div>
  );
}
