import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-black p-8 text-white">
      <h1 className="font-mono text-4xl font-bold tracking-widest text-[#ffff00]">
        TAR&nbsp;&middot;&nbsp;NATION
      </h1>
      <Link
        to="/play"
        className="border-2 border-[#ffff00] bg-black px-5 py-2 font-mono text-sm font-bold tracking-widest text-[#ffff00] uppercase hover:bg-[#ffff00] hover:text-black"
      >
        Play
      </Link>
    </div>
  );
}
