import { Link } from "@tanstack/react-router";
import { ChevronRight, ClipboardCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SjekkPunkt } from "@/lib/dashboard-typer";
import { BlokkTittel, Kort, skilleKlasse } from "./felles";

// «Er noe feil i tallene?» Én rolig setning per punkt, med lenke til saken.
// Blokken vises ikke når det ikke er noe å sjekke.

export function BorSjekkes({ punkter, className, indeks }: { punkter: SjekkPunkt[]; className?: string; indeks?: number }) {
  if (punkter.length === 0) return null;
  return (
    <Kort className={className} indeks={indeks} aria-labelledby="db-sjekk-tittel">
      <BlokkTittel ikon={ClipboardCheck} id="db-sjekk-tittel">
        Bør sjekkes
      </BlokkTittel>
      <ul className={cn("mt-2 divide-y", skilleKlasse.noytral)}>
        {punkter.map((p, i) => {
          const tekst = <span className="min-w-0 flex-1 text-base leading-6 sm:text-[15px] sm:leading-[22px]">{p.tekst}</span>;
          return (
            <li key={i}>
              {p.lenke ? (
                <Link
                  to={p.lenke.to}
                  params={{ id: p.lenke.id }}
                  className="-mx-2 flex min-h-12 items-center gap-3 rounded-md px-2 py-2.5 hover:bg-foreground/[0.04]"
                >
                  {tekst}
                  <span className="flex shrink-0 items-center gap-1 text-[15px] font-semibold text-foreground">
                    Se på det
                    <ChevronRight className="size-4" aria-hidden />
                  </span>
                </Link>
              ) : (
                <p className="flex min-h-12 items-center py-2.5">{tekst}</p>
              )}
            </li>
          );
        })}
      </ul>
    </Kort>
  );
}
