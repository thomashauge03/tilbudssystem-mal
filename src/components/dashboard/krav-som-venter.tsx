import { Link } from "@tanstack/react-router";
import { BellRing, ChevronRight, Clock, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { KravSomVenter as Krav } from "@/lib/dashboard-typer";
import { BlokkTittel, Kort, Merke, StortBelop, dempet, knappKlasse, seAlleKlasse, skilleKlasse, tekstFarge } from "./felles";
import { antall, kr, mill, sendtTekst } from "./format";

// «Hvilke tillegg venter jeg på penger for?» Endringer kunden ikke har godkjent.
// Rekkefølgen kommer fra datalaget: ikke sendt, så med beløp, så mangler beløp.
// Én knapp per rad etter hva han må gjøre: «Åpne» for krav som ikke er sendt,
// «Legg inn beløp» for krav uten beløp (man kan ikke purre på dem), ellers «Purr».

const MAKS_RADER = 10;

export function KravSomVenter({
  krav,
  sum,
  antallOver30Dager,
  className,
  indeks,
}: {
  krav: Krav[];
  sum: number;
  /** Antall, ikke beløp: «1,3 mill · 1,3 mill har ventet» så ut som samme tall to ganger. */
  antallOver30Dager: number;
  className?: string;
  indeks?: number;
}) {
  const tone = krav.length > 0 ? "venter" : "noytral";
  const ikkeSendt = krav.filter((k) => k.ikkeSendt).length;

  return (
    <Kort tone={tone} className={className} indeks={indeks} aria-labelledby="db-krav-tittel">
      <BlokkTittel ikon={Clock} tone={tone} id="db-krav-tittel">
        Endringer kunden ikke har godkjent
      </BlokkTittel>

      {krav.length === 0 ? (
        <p className={cn("mt-3 text-[15px]", dempet)}>Alle endringer er godkjent eller avslått.</p>
      ) : (
        <>
          <p className={cn("mt-3 text-[26px] leading-8 sm:text-[28px]", tekstFarge.venter)}>
            <StortBelop tekst={mill(sum)} />
          </p>
          <p className="text-[15px] leading-[22px]">
            <span className={dempet}>{antall(krav.length, "krav", "krav")}</span>
            {antallOver30Dager > 0 && (
              <>
                <span className={dempet}> · </span>
                <span className={cn("font-medium", tekstFarge.venter)}>
                  {antallOver30Dager} har ventet over 30 dager
                </span>
              </>
            )}
            {ikkeSendt > 0 && (
              <>
                <span className={dempet}> · </span>
                <span className={cn("font-medium", tekstFarge.haster)}>
                  {ikkeSendt === 1 ? "1 er ikke sendt" : `${ikkeSendt} er ikke sendt`}
                </span>
              </>
            )}
          </p>

          <ul className={cn("mt-3 divide-y", skilleKlasse[tone])}>
            {krav.slice(0, MAKS_RADER).map((k) => (
              <KravRad key={k.id} k={k} />
            ))}
          </ul>
        </>
      )}

      <div className="mt-auto">
        <Button asChild variant="outline" className={seAlleKlasse}>
          <Link to="/endringsmeldinger">
            {krav.length > MAKS_RADER ? `Se alle ${krav.length}` : "Gå til endringene"}
            <ChevronRight aria-hidden />
          </Link>
        </Button>
      </div>
    </Kort>
  );
}

function KravRad({ k }: { k: Krav }) {
  const navn = k.kunde ?? k.tittel;
  const lenge = k.dagerSidenSendt !== null && k.dagerSidenSendt > 30;
  return (
    <li className="flex min-h-16 items-center gap-3 py-2.5">
      <Link
        to="/endringsmeldinger/$id"
        params={{ id: k.id }}
        className="-my-1 flex min-w-0 flex-1 flex-col gap-0.5 rounded-md py-1 sm:flex-row sm:items-start sm:gap-4"
      >
        <span className="min-w-0 sm:flex-1">
          <span className="block truncate text-base font-semibold leading-6 sm:text-[15px] sm:leading-[22px]">{navn}</span>
          <span className={cn("block truncate text-sm leading-5", dempet)}>
            {k.nummer}
            {k.kunde ? ` ${k.tittel}` : ""}
          </span>
        </span>
        {/* Beløpet står alltid over tiden, så alle rader har samme form. */}
        <span className="flex flex-col items-start gap-0.5 sm:items-end sm:text-right">
          {k.manglerBelop ? (
            <span className={cn("whitespace-nowrap text-base leading-6 sm:text-[15px] sm:leading-[22px]", dempet)}>
              Mangler beløp
            </span>
          ) : (
            <span className="whitespace-nowrap text-base font-semibold leading-6 sm:text-[15px] sm:leading-[22px]">
              {kr(k.belop)}
            </span>
          )}
          {k.ikkeSendt ? (
            <Merke tone="haster">Ikke sendt</Merke>
          ) : (
            <span className={cn("text-sm leading-5", lenge ? cn("font-medium", tekstFarge.venter) : dempet)}>
              {sendtTekst(k.dagerSidenSendt)}
            </span>
          )}
        </span>
      </Link>
      <Handling k={k} navn={navn} />
    </li>
  );
}

function Handling({ k, navn }: { k: Krav; navn: string }) {
  const [etikett, ikon, beskrivelse] = k.ikkeSendt
    ? ["Åpne", null, `Åpne endring ${k.nummer}`]
    : k.manglerBelop
      ? ["Legg inn beløp", <PenLine key="i" aria-hidden />, `Legg inn beløp på endring ${k.nummer}`]
      : ["Purr", <BellRing key="i" aria-hidden />, `Purr ${navn} om endring ${k.nummer}`];
  return (
    <Button asChild variant="outline" className={cn(knappKlasse, "shrink-0")}>
      <Link to="/endringsmeldinger/$id" params={{ id: k.id }} aria-label={beskrivelse}>
        {ikon}
        {etikett}
        {!ikon && <ChevronRight aria-hidden />}
      </Link>
    </Button>
  );
}
