import { createFileRoute } from "@tanstack/react-router";

import { BackButton } from "#/components/back-button";
import { PacmanGame } from "#/components/pacman/pacman-game";
import { TwinkleBackdrop } from "#/components/twinkle-backdrop";

export const Route = createFileRoute("/play")({
  component: PacmanRoute,
});

function PacmanRoute() {
  return (
    <div className="dark flex min-h-screen flex-col items-center gap-4 overflow-hidden bg-stone-950 p-4 font-sans text-stone-50 lg:gap-6 lg:p-6">
      <TwinkleBackdrop />

      <header className="relative z-10 flex w-full max-w-5xl items-baseline justify-between gap-4">
        <BackButton />
        <p className="text-lg text-stone-500">
          arrows or wasd to move &middot; r to restart
        </p>
      </header>

      {/* The canvas is a fixed-size sprite; the frame around it is the same
          hard-shadowed block the map's panels use. */}
      <div className="relative z-10 border-2 border-black bg-stone-950 p-4 shadow-[8px_8px_0_#000] lg:p-8">
        <PacmanGame />
      </div>
    </div>
  );
}
