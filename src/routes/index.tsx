import { Link, createFileRoute } from "@tanstack/react-router";

import { TwinkleBackdrop } from "#/components/twinkle-backdrop";
import { Button } from "#/components/ui/button";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return (
    <div className="dark min-h-screen overflow-hidden bg-stone-950 font-sans text-stone-50">
      <TwinkleBackdrop />

      <div className="relative grid min-h-screen grid-cols-1 lg:grid-cols-2">
        <div className="flex flex-col px-6 py-10 lg:py-14">
          <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-24 lg:gap-40">
            <header className="flex flex-col gap-4">
              <h1 className="relative z-10 flex items-baseline gap-3 font-serif text-[clamp(3.75rem,11.25vw,13.75rem)] leading-none whitespace-nowrap">
                tar
                <img
                  src="/images/tar-nation-divider.png"
                  alt="."
                  className="size-3 -translate-y-1"
                />
                nation
              </h1>
              <p className="text-xl lg:text-2xl">
                visualise how india consumes tobacco
              </p>
            </header>

            <nav className="flex flex-col gap-6">
              <Button
                render={<Link to="/play" />}
                nativeButton={false}
                className="h-26 rounded-none bg-tar-red text-2xl text-white shadow-[8px_8px_0_#000] transition-all duration-100 ease-[steps(2,jump-end)] hover:translate-x-1 hover:translate-y-1 hover:bg-tar-red-dark hover:shadow-[4px_4px_0_#000] active:translate-x-2 active:translate-y-2 active:shadow-none"
              >
                play
              </Button>
              <Button
                render={<Link to="/map" />}
                nativeButton={false}
                className="h-26 rounded-none bg-stone-900 text-2xl text-tar-red shadow-[8px_8px_0_#000] transition-all duration-100 ease-[steps(2,jump-end)] hover:translate-x-1 hover:translate-y-1 hover:bg-stone-800 hover:shadow-[4px_4px_0_#000] active:translate-x-2 active:translate-y-2 active:shadow-none"
              >
                just show me the map
              </Button>
            </nav>
          </div>

          <footer className="mx-auto flex w-full max-w-sm flex-col gap-1">
            <p className="text-xl text-stone-50 lg:text-2xl">
              an awareness project
            </p>
            <p className="font-serif text-base text-stone-400">
              abhishek rein <span className="text-stone-600">▪</span> rintaro
              fujita <span className="text-stone-600">▪</span> shashwata de
            </p>
          </footer>
        </div>

        <div className="p-4 lg:p-8">
          <div className="relative w-full lg:h-full">
            <img
              src="/images/home.png"
              alt="Pixel-art illustration of a man in a hospital bed, a doctor taking notes beside him and a woman weeping at his side, with cigarette packs and banknotes scattered across the floor."
              className="w-full object-cover lg:h-full"
            />
            <span className="absolute right-4 bottom-3 text-xl text-white lg:text-2xl">
              AI Generated Image
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
