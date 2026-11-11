import { Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Kunde } from "@/lib/dashboard-typer";
import { BlokkTittel, Kort, dempet, skilleKlasse, tekstFarge } from "./felles";
import { millAlltid } from "./format";

// Største kunder: fem rader med navn, avtalt beløp og hvor mye som er fakturert.
// Alle beløp i «mill» med én desimal, så de kan sammenlignes nedover.

export function Kunder({ kunder, className, indeks }: { kunder: Kunde[]; className?: string; indeks?: number }) {
  const rader = kunder.slice(0, 5);
  return (
    <Kort className={className} indeks={indeks} aria-labelledby="db-kunder-tittel">
      <BlokkTittel ikon={Users} id="db-kunder-tittel">
        Største kunder
      </BlokkTittel>
      {rader.length === 0 ? (
        <p className={cn("mt-3 text-[15px]", dempet)}>Ingen avtalte jobber ennå.</p>
      ) : (
        <ul className={cn("mt-3 divide-y", skilleKlasse.noytral)}>
          {rader.map((k) => {
            const prosent = Math.round(k.prosentFakturert);
            return (
              <li key={k.navn} className="flex min-h-12 items-center gap-3 py-2">
                <span className="min-w-0 flex-1 truncate text-base leading-6 sm:text-[15px] sm:leading-[22px]">{k.navn}</span>
                <span className="shrink-0 text-right">
                  <span className="block whitespace-nowrap text-base font-semibold leading-6 sm:text-[15px] sm:leading-[22px]">
                    {millAlltid(k.kontrakt)}
                  </span>
                  {/* «ikke startet» er det viktigste i blokken, så den står i full tekstfarge. */}
                  <span
                    className={cn(
                      "block text-sm leading-5",
                      k.fakturert > 0 ? tekstFarge.fakturert : "font-medium text-foreground",
                    )}
                  >
                    {k.fakturert > 0 ? `${prosent} % fakturert` : "ikke startet"}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Kort>
  );
}
