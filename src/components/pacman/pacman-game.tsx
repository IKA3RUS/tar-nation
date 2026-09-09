import { useEffect, useRef } from "react";

import {
  createGame,
  resetGame,
  step,
  type Direction,
} from "#/features/pacman/game";
import { CANVAS_H, CANVAS_W, drawFrame } from "#/features/pacman/render";

const HI_SCORE_KEY = "pacman:hi-score";

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

function loadHiScore(): number {
  try {
    const value = Number(localStorage.getItem(HI_SCORE_KEY));
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

function saveHiScore(value: number): void {
  try {
    localStorage.setItem(HI_SCORE_KEY, String(value));
  } catch {
    // localStorage unavailable — high score just won't persist.
  }
}

export function PacmanGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef(createGame());

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;

    const game = gameRef.current;
    game.hiScore = loadHiScore();
    let savedHi = game.hiScore;

    let raf = 0;
    let last = performance.now();

    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 1 / 30);
      last = now;

      step(game, dt);
      if (game.hiScore > savedHi) {
        savedHi = game.hiScore;
        saveHiScore(savedHi);
      }
      drawFrame(ctx, game);
      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const game = gameRef.current;

      if (game.status === "won" || game.status === "lost") {
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
    <canvas
      ref={canvasRef}
      width={CANVAS_W}
      height={CANVAS_H}
      className="block"
    />
  );
}
