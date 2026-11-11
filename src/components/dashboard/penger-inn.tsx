import { Link } from "@tanstack/react-router";
import { ArrowRight, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Pengene } from "@/lib/dashboard-typer";
import { BlokkTittel, Fargeprove, Fremhev, Kort, StortBelop, dempet, knappKlasse, tekstFarge } from "./felles";
import { antall, kr, mill } from "./format";

// «Hvor mye har jeg igjen å fakturere, og hvor mye er betalt?»
// Ett stort tall (igjen), én linje som viser betalt | skylder | igjen, og
// de små tallene under. Status-siden har detaljene.

export function PengerInn({ pengene: p, className, indeks }: { pengene: Pengene; className?: string; indeks?: number }) {
  const total = Math.max(p.kontraktssum, 1);
  const andel = (n: number) => Math.min(100, Math.max(0, (n / total) * 100));
  const fakturertAndel = andel(p.fakturert);
  // Inne i det fakturerte: hvor mye er betalt, og hvor mye skylder kunden.
  const betaltIFakturert = p.fakturert > 0 ? Math.min(100, (p.betalt / p.fakturert) * 100) : 0;
  const prosent = Math.round(p.prosentFakturert);

  const linjeTekst =
    `Fakturert ${prosent} % av avtalte jobber. Betalt ${kr(p.betalt)}` +
    (p.kundenSkylder > 0 ? `, kunden skylder ${kr(p.kundenSkylder)}` : "") +
    `, igjen ${kr(p.igjen)}.`;

  return (
    <Kort className={className} indeks={indeks} aria-labelledby="db-penger-tittel">
      <BlokkTittel ikon={Wallet} id="db-penger-tittel">
        Penger inn
      </BlokkTittel>

      <p className={cn("mt-4 text-[15px] leading-[22px]", dempet)}>Igjen å fakturere</p>
      <p className="text-[34px] leading-10 tracking-tight sm:text-[40px] sm:leading-[44px]">
        <Fremhev verdi={p.igjen}>
          <StortBelop tekst={kr(p.igjen)} />
        </Fremhev>
      </p>
      <p className={cn("mt-1 text-[15px] leading-[22px]", dempet)}>
        av {kr(p.kontraktssum)} i avtalte jobber (tilbud og {antall(p.antallGodkjenteEndringer, "godkjent endring", "godkjente endringer")})
      </p>

      {/* Fremdriftslinjen: betalt (grønn) | fakturert, ikke betalt (gul) | igjen (stein) */}
      <div className="mt-5">
        <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 text-sm font-semibold sm:text-[15px]">
          <span className={tekstFarge.fakturert}>
            Fakturert {mill(p.fakturert)} · {prosent} %
          </span>
          <span className={tekstFarge.igjen}>Igjen {mill(p.igjen)}</span>
        </div>
        <div
          role="img"
          aria-label={linjeTekst}
          className="h-4 w-full overflow-hidden rounded-full bg-stone-300 dark:bg-stone-600"
        >
          <div className="db-linje flex h-full" style={{ width: `${fakturertAndel}%` }}>
            <div className="h-full bg-green-600" style={{ width: `${betaltIFakturert}%` }} />
            <div className="h-full flex-1 bg-amber-500" />
          </div>
        </div>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 sm:flex sm:flex-wrap sm:gap-x-8">
        {/* To like tall ved siden av hverandre får ham til å lete etter forskjellen. */}
        {Math.round(p.fakturert) === Math.round(p.betalt) ? (
          <Tall etikett="Fakturert og betalt" verdi={p.fakturert} prove="bg-green-600" />
        ) : (
          <>
            <Tall etikett="Fakturert" verdi={p.fakturert} />
            <Tall etikett="Betalt" verdi={p.betalt} prove="bg-green-600" />
          </>
        )}
        {p.kundenSkylder > 0 ? (
          <Tall
            etikett="Kunden skylder"
            verdi={p.kundenSkylder}
            prove="bg-amber-500"
            hint={antall(p.antallUbetalteFakturaer, "faktura", "fakturaer")}
          />
        ) : (
          <div>
            <dt className={cn("text-sm", dempet)}>Kunden skylder</dt>
            <dd className={cn("text-base font-semibold leading-6", tekstFarge.fakturert)}>Alt er betalt</dd>
          </div>
        )}
        {p.klarTilFakturering > 0 && (
          <Tall etikett="Klar til fakturering" verdi={p.klarTilFakturering} hint="ordre i Tripletex" />
        )}
        {p.forfalt > 0 && (
          <Tall
            etikett="Forfalt"
            verdi={p.forfalt}
            farge={tekstFarge.haster}
            hint={antall(p.antallForfalte, "faktura", "fakturaer")}
          />
        )}
      </dl>

      {p.hvorPengeneLigger && <p className="mt-4 text-base leading-6 sm:text-[15px] sm:leading-[22px]">{p.hvorPengeneLigger}</p>}

      <div className="pt-5">
        <Button asChild variant="outline" className={knappKlasse}>
          <Link to="/status">
            Se fakturering per jobb
            <ArrowRight aria-hidden />
          </Link>
        </Button>
      </div>
    </Kort>
  );
}

function Tall({
  etikett,
  verdi,
  hint,
  prove,
  farge,
}: {
  etikett: string;
  verdi: number;
  hint?: string;
  prove?: string;
  farge?: string;
}) {
  return (
    <div className="min-w-0">
      <dt className={cn("flex items-center gap-1.5 text-sm", farge ?? dempet)}>
        {prove && <Fargeprove className={prove} />}
        {etikett}
      </dt>
      <dd className={cn("text-base font-semibold leading-6", farge)}>
        <Fremhev verdi={verdi}>
          <span className="whitespace-nowrap">{kr(verdi)}</span>
        </Fremhev>
        {hint && <span className={cn("block text-sm font-normal", dempet)}>{hint}</span>}
      </dd>
    </div>
  );
}
