import { Link } from "@tanstack/react-router";
import { ChevronRight, Clock, Mail, Phone, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TilbudSomVenter as Tilbud } from "@/lib/dashboard-typer";
import { BlokkTittel, Kort, Merke, StortBelop, dempet, knappKlasse, seAlleKlasse, skilleKlasse, tekstFarge } from "./felles";
import { antall, fristTekst, kr, mill } from "./format";

// «Hvem må jeg ringe om tilbud?» Alle tilbud som er sendt og ikke besvart.
// Først de der fristen er ute (størst beløp først), så de med frist foran seg.
// Hver rad har én knapp: Ring, ellers E-post, ellers Åpne. Høyst 10 rader.

const MAKS_RADER = 10;

export function TilbudSomVenter({
  tilbud,
  sum,
  className,
  indeks,
}: {
  tilbud: Tilbud[];
  sum: number;
  className?: string;
  indeks?: number;
}) {
  const passert = tilbud.filter((t) => t.dagerTilFrist !== null && t.dagerTilFrist < 0).length;
  const tone = passert > 0 ? "haster" : "noytral";
  const rader = tilbud.slice(0, MAKS_RADER);

  return (
    <Kort tone={tone} className={className} indeks={indeks} aria-labelledby="db-tilbud-venter-tittel">
      <BlokkTittel ikon={passert > 0 ? TriangleAlert : Clock} tone={tone} id="db-tilbud-venter-tittel">
        Tilbud som venter på svar
      </BlokkTittel>

      {tilbud.length === 0 ? (
        <p className={cn("mt-3 text-[15px]", dempet)}>Ingen tilbud venter på svar fra kunden.</p>
      ) : (
        <>
          <p className={cn("mt-3 text-[26px] leading-8 sm:text-[28px]", passert > 0 && tekstFarge.haster)}>
            <StortBelop tekst={mill(sum)} />
          </p>
          <p className="text-[15px] leading-[22px]">
            <span className={dempet}>{antall(tilbud.length, "tilbud", "tilbud")}</span>
            {passert > 0 && (
              <>
                <span className={dempet}> · </span>
                <span className={cn("font-medium", tekstFarge.haster)}>
                  {passert === 1 ? "1 har" : `${passert} har`} passert fristen
                </span>
              </>
            )}
          </p>

          <ul className={cn("mt-3 divide-y", skilleKlasse[tone])}>
            {rader.map((t) => (
              <TilbudRad key={t.id} t={t} />
            ))}
          </ul>
        </>
      )}

      <div className="mt-auto">
        <Button asChild variant="outline" className={seAlleKlasse}>
          <Link to="/tilbud">
            {tilbud.length > MAKS_RADER ? `Se alle ${tilbud.length}` : "Gå til tilbudene"}
            <ChevronRight aria-hidden />
          </Link>
        </Button>
      </div>
    </Kort>
  );
}

function TilbudRad({ t }: { t: Tilbud }) {
  const passert = t.dagerTilFrist !== null && t.dagerTilFrist < 0;
  const navn = t.kunde ?? t.tittel;
  return (
    <li className="flex min-h-16 items-center gap-3 py-2.5">
      <Link
        to="/tilbud/$id"
        params={{ id: t.id }}
        className="-my-1 flex min-w-0 flex-1 flex-col gap-0.5 rounded-md py-1 sm:flex-row sm:items-start sm:gap-4"
      >
        <span className="min-w-0 sm:flex-1">
          <span className="block truncate text-base font-semibold leading-6 sm:text-[15px] sm:leading-[22px]">{navn}</span>
          <span className={cn("block truncate text-sm leading-5", dempet)}>
            #{t.nummer}
            {t.kunde ? ` ${t.tittel}` : ""}
          </span>
        </span>
        {/* Beløpet står alltid over tiden, så alle rader har samme form. */}
        <span className="flex flex-col items-start gap-0.5 sm:items-end sm:text-right">
          <span className="whitespace-nowrap text-base font-semibold leading-6 sm:text-[15px] sm:leading-[22px]">
            {kr(t.belop)}
          </span>
          <span className={cn("text-sm leading-5", passert ? tekstFarge.haster : dempet)}>
            {fristTekst(t.dagerTilFrist)}
            {t.borLukkes && (
              <span className="ml-2 inline-block">
                <Merke>Bør lukkes</Merke>
              </span>
            )}
          </span>
        </span>
      </Link>
      <Handling t={t} navn={navn} />
    </li>
  );
}

function Handling({ t, navn }: { t: Tilbud; navn: string }) {
  if (t.telefon) {
    return (
      <Button asChild variant="outline" className={cn(knappKlasse, "shrink-0")}>
        <a href={`tel:${t.telefon.replace(/[^\d+]/g, "")}`} aria-label={`Ring ${navn}`}>
          <Phone aria-hidden />
          Ring
        </a>
      </Button>
    );
  }
  if (t.epost) {
    return (
      <Button asChild variant="outline" className={cn(knappKlasse, "shrink-0")}>
        <a href={`mailto:${t.epost}`} aria-label={`Send e-post til ${navn}`}>
          <Mail aria-hidden />
          E-post
        </a>
      </Button>
    );
  }
  return (
    <Button asChild variant="outline" className={cn(knappKlasse, "shrink-0")}>
      <Link to="/tilbud/$id" params={{ id: t.id }} aria-label={`Åpne tilbud ${t.nummer}`}>
        Åpne
        <ChevronRight aria-hidden />
      </Link>
    </Button>
  );
}
