import { useEffect, useRef, useState } from "react";

import { Link } from "@tanstack/react-router";

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
  END_SCREEN_CENTER_X,
} from "#/features/pacman/render";
import { computeResult, type PacmanResult } from "#/features/pacman/stats";

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
  const [result, setResult] = useState<PacmanResult | null>(null);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;

    // Canvas never triggers a font fetch on its own, so ask for the pixel face
    // up front rather than drawing the opening frames in the fallback.
    void document.fonts?.load('16px "PP NeueBit"');

    const game = gameRef.current;
    let raf = 0;
    let last = performance.now();

    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 1 / 30);
      last = now;
      step(game, dt);
      drawFrame(ctx, game);
      setEnded(game.status === "lost" || game.status === "timeout");
      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Compute the comparison once the round ends; it is handed to `/map` through
  // the "View Details" link's navigation state (no shared storage).
  useEffect(() => {
    if (!ended) {
      setResult(null);
      return;
    }
    const game = gameRef.current;
    setResult(computeResult(game.collectedCounts, game.catches));
  }, [ended]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const game = gameRef.current;

      if (game.status === "lost" || game.status === "timeout") {
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
      {ended &&
        result && (
          // The wrapper owns the centring so the link is free to use the press
          // animation every other button here has.
          <div
            className="absolute -translate-x-1/2"
            style={{ top: END_SCREEN_BUTTON_TOP, left: END_SCREEN_CENTER_X }}
          >
            <Link
              to="/map"
              state={{ pacmanResult: result }}
              className="inline-block rounded-none bg-tar-red px-4 py-2 text-xl text-white shadow-[6px_6px_0_#000] transition-all duration-100 ease-[steps(2,jump-end)] hover:translate-x-1 hover:translate-y-1 hover:bg-tar-red-dark hover:shadow-[3px_3px_0_#000] active:translate-x-1.5 active:translate-y-1.5 active:shadow-none"
            >
              see your map
            </Link>
          </div>
        )}
    </div>
  );
}
