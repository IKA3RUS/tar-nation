import { createFileRoute, useRouterState } from "@tanstack/react-router";

import { TobaccoCartogram } from "#/components/tobacco-cartogram";

export const Route = createFileRoute("/map")({ component: MapPage });

/**
 * The visualisation page. This route owns the game's result contract — see
 * `src/features/pacman/data/README.md` — and hands the cartogram plain props,
 * so the visualisation itself stays free of the game's types.
 */
function MapPage() {
  // Handed in by the "View Details" link's navigation state — no shared storage.
  const result = useRouterState({
    select: (s) => s.location.state.pacmanResult ?? null,
  });

  // Null on a direct visit or a new tab: the map is worth reading on its own,
  // so it renders exactly as it would from the home page.
  if (!result) return <TobaccoCartogram />;

  const [first, second] = result.top3;
  // `confident` false means the top two are within 3pp — naming one of them
  // would be a claim the data does not support.
  const headline = result.confident
    ? `your mix looks most like ${first.name}`
    : `your mix sits between ${first.name} and ${second.name}`;

  return <TobaccoCartogram headline={headline} focusState={first.name} />;
}
