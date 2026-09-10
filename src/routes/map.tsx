import { createFileRoute, Link, useRouterState } from "@tanstack/react-router";

export const Route = createFileRoute("/map")({ component: MapPage });

/**
 * Scaffold for the visualisation page. Keep the route path and the
 * `useRouterState` read below; replace the body with the real view. See
 * `src/features/pacman/data/README.md` for the result contract.
 */
function MapPage() {
  // Handed in by the "View Details" link's navigation state — no shared storage.
  const result = useRouterState({
    select: (s) => s.location.state.pacmanResult ?? null,
  });

  if (!result) {
    return (
      <div className="p-8">
        <p className="text-lg">
          No result passed in.{" "}
          <Link to="/play" className="underline">
            Play a round
          </Link>{" "}
          and press “View Details”.
        </p>
      </div>
    );
  }

  const [first, second] = result.top3;
  const headline = result.confident
    ? `Your mix looks most like ${first.name}`
    : `Your mix sits between ${first.name} and ${second.name}`;

  // Scaffold: the visualisation is built on top of the raw `result` JSON below.
  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold">{headline}</h1>
      <pre className="mt-6 overflow-x-auto rounded bg-black/90 p-4 text-sm text-green-300">
        {JSON.stringify(result, null, 2)}
      </pre>
    </div>
  );
}
