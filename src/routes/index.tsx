import { useEffect, useState } from "react";

import { createFileRoute, Link } from "@tanstack/react-router";

import { RESULT_STORAGE_KEY, type PacmanResult } from "#/features/pacman/stats";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const [result, setResult] = useState<PacmanResult | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(RESULT_STORAGE_KEY);
      if (raw) setResult(JSON.parse(raw) as PacmanResult);
    } catch {
      // ignore
    }
    setLoaded(true);
  }, []);

  if (!loaded) return null;

  if (!result) {
    return (
      <div className="p-8">
        <p className="text-lg">
          No result yet.{" "}
          <Link to="/play" className="underline">
            Play a round
          </Link>{" "}
          and press “View Details”.
        </p>
      </div>
    );
  }

  // Scaffold: the visualisation is built on top of `result` from here.
  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold">
        Nearest state: {result.nearestState}
      </h1>
      <p className="mt-2 text-lg">
        similarity {result.similarity}% · confidence{" "}
        {Math.round(result.confidence * 100)}% · score {result.score}% · n{" "}
        {result.n}
      </p>
      <pre className="mt-6 overflow-x-auto rounded bg-black/90 p-4 text-sm text-green-300">
        {JSON.stringify(result, null, 2)}
      </pre>
      <Link to="/play" className="mt-6 inline-block underline">
        Play again
      </Link>
    </div>
  );
}
