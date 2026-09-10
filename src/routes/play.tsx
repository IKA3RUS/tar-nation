import { createFileRoute } from "@tanstack/react-router";

import { PacmanGame } from "#/components/pacman/pacman-game";

export const Route = createFileRoute("/pacman")({
  component: PacmanRoute,
});

function PacmanRoute() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-black p-4">
      <PacmanGame />
    </div>
  );
}
