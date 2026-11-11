import { Link } from "@tanstack/react-router";
import { ChevronRight, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DashboardData } from "@/lib/dashboard-typer";
import { BlokkTittel, Kort, knappKlasse } from "./felles";
import { antall, forrigeManedNavn, mill, millAlltid } from "./format";

// «Gir vi nok tilbud, og får vi jobbene?» Skrevet som vanlige setninger med
// tallene i fet skrift, ikke som prosent av verdi.

export function TilbudSetninger({
  tilbud: t,
  antallGodkjenteEndringer,
  kontraktEndringer,
  idag,
  className,
  indeks,
}: {
  tilbud: DashboardData["tilbud"];
  antallGodkjenteEndringer: number;
  kontraktEndringer: number;
  idag: Date;
  className?: string;
  indeks?: number;
}) {
  const forrige = forrigeManedNavn(idag);
  const taperDeStore = t.snittFatt > 0 && t.snittTapt > 2 * t.snittFatt;

  return (
    <Kort className={className} indeks={indeks} aria-labelledby="db-tilbud-tittel">
      <BlokkTittel ikon={FileText} id="db-tilbud-tittel">
        Tilbud
      </BlokkTittel>
      <div className="mt-3 space-y-3 text-base leading-6 sm:text-[15px] sm:leading-[22px]">
        <p>
          {t.gittDenneManed > 0 ? (
            <>
              I {t.denneManedNavn} har du gitt <b className="font-semibold">{antall(t.gittDenneManed, "tilbud", "tilbud")}</b> for{" "}
              <b className="font-semibold">{mill(t.gittDenneManedSum)}</b>.
            </>
          ) : (
            <>I {t.denneManedNavn} har du ikke gitt noen tilbud ennå.</>
          )}{" "}
          I {forrige} ga du {t.gittForrigeManed}.
        </p>
        {t.avBesvarte > 0 && (
          <p>
            Du fikk jobben på{" "}
            <b className="font-semibold">
              {t.fikkJobben} av {t.avBesvarte}
            </b>{" "}
            tilbud. {t.saNei} sa nei, og {t.svarteAldri} svarte aldri.
          </p>
        )}
        {taperDeStore && (
          <p>
            {/* snittFatt/snittTapt er median («vanlig jobb»), og under 1 mill står de i hele kroner. */}
            Du får de små jobbene, men taper de store: vanlig jobb du fikk{" "}
            <b className="font-semibold">{mill(t.snittFatt)}</b>, vanlig jobb du tapte{" "}
            <b className="font-semibold">{mill(t.snittTapt)}</b>.
          </p>
        )}
        {antallGodkjenteEndringer > 0 && (
          <p>
            <b className="font-semibold">{antall(antallGodkjenteEndringer, "endring", "endringer")}</b> er godkjent, til sammen{" "}
            <b className="font-semibold">
              {kontraktEndringer < 1_000_000 ? millAlltid(kontraktEndringer, 2) : millAlltid(kontraktEndringer)}
            </b>{" "}
            lagt til jobbene.
          </p>
        )}
      </div>
      <div className="pt-5">
        <Button asChild variant="outline" className={knappKlasse}>
          <Link to="/tilbud">
            Se alle tilbud
            <ChevronRight aria-hidden />
          </Link>
        </Button>
      </div>
    </Kort>
  );
}
