import { Link } from "@tanstack/react-router";
import { Banknote, CalendarDays, CircleCheck, CircleX, Send, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Hendelse } from "@/lib/dashboard-typer";
import { BlokkTittel, Kort, dempet, skilleKlasse, tekstFarge } from "./felles";
import { dagNavn, kr } from "./format";

// «Hva har skjedd siden sist?» Opptil 8 hendelser fra de siste 7 dagene,
// gruppert under «I dag», «I går», «Mandag» … Én linje per hendelse.

const IKON: Record<Hendelse["type"], { ikon: LucideIcon; farge: string }> = {
  tilbud_signert: { ikon: CircleCheck, farge: tekstFarge.fakturert },
  endring_godkjent: { ikon: CircleCheck, farge: tekstFarge.fakturert },
  betaling: { ikon: Banknote, farge: tekstFarge.fakturert },
  tilbud_avslatt: { ikon: CircleX, farge: dempet },
  endring_avslatt: { ikon: CircleX, farge: dempet },
  krav_sendt: { ikon: Send, farge: dempet },
};

export function SisteDager({
  hendelser,
  idag,
  className,
  indeks,
}: {
  hendelser: Hendelse[];
  idag: Date;
  className?: string;
  indeks?: number;
}) {
  // Datalaget sorterer på tid, så like dager ligger etter hverandre.
  const grupper: { dag: string; rader: Hendelse[] }[] = [];
  for (const h of hendelser.slice(0, 8)) {
    const dag = dagNavn(h.dato, idag);
    const siste = grupper[grupper.length - 1];
    if (siste?.dag === dag) siste.rader.push(h);
    else grupper.push({ dag, rader: [h] });
  }

  return (
    <Kort className={className} indeks={indeks} aria-labelledby="db-siste-tittel">
      <BlokkTittel ikon={CalendarDays} id="db-siste-tittel">
        Siste 7 dager
      </BlokkTittel>
      {grupper.length === 0 ? (
        <p className={cn("mt-3 text-[15px]", dempet)}>Ingenting nytt siste 7 dager.</p>
      ) : (
        <div className="mt-3">
          {grupper.map((g) => (
            <section key={g.dag} className="mt-3 first:mt-0">
              <h3 className="text-sm font-semibold leading-5">{g.dag}</h3>
              <ul className={cn("divide-y", skilleKlasse.noytral)}>
                {g.rader.map((h, i) => (
                  <li key={i}>
                    <Rad h={h} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Kort>
  );
}

function Rad({ h }: { h: Hendelse }) {
  const { ikon: Ikon, farge } = IKON[h.type];
  const innhold = (
    <>
      <Ikon className={cn("size-5 shrink-0", farge)} aria-hidden />
      <span className="min-w-0 flex-1 truncate text-base leading-6 sm:text-[15px] sm:leading-[22px]">{h.tekst}</span>
      {h.belop !== null && h.belop !== 0 && (
        <span className="shrink-0 whitespace-nowrap text-base font-semibold leading-6 sm:text-[15px] sm:leading-[22px]">
          {kr(h.belop)}
        </span>
      )}
    </>
  );
  const klasse = "flex min-h-12 items-center gap-3 py-2";
  if (!h.lenke) {
    return (
      <div className={klasse} title={h.tekst}>
        {innhold}
      </div>
    );
  }
  return (
    <Link
      to={h.lenke.to}
      params={{ id: h.lenke.id }}
      title={h.tekst}
      className={cn(klasse, "-mx-2 rounded-md px-2 hover:bg-foreground/[0.04]")}
    >
      {innhold}
    </Link>
  );
}
