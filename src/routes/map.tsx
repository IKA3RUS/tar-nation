import { createFileRoute } from "@tanstack/react-router";

import { TobaccoCartogram } from "#/components/tobacco-cartogram";

export const Route = createFileRoute("/map")({ component: MapPage });

function MapPage() {
  return <TobaccoCartogram />;
}
