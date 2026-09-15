// Kunden skal kunne si nei — og det skal koste ett ekstra tastetrykk.
//
// Signeringslenken hadde bare én vei ut. Sa byggherren nei, skjedde det på
// telefon, og hos oss ble dokumentet liggende som om det fortsatt var i spill.
// Nå ligger avslaget i samme lenke som signaturen, med navn, tidspunkt og
// kundens egen begrunnelse.
//
// Knappen deles av begge signeringssidene med vilje: to avslagsdialoger som
// skled fra hverandre, ville gitt kunden to ulike forståelser av hva de sier
// nei til.

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { XCircle } from "lucide-react";

export function AvslagKnapp({
  dokument,
  knappetekst,
  forhandsNavn,
  grunnPaakrevd = false,
  onAvslaa,
}: {
  /** Det kunden faktisk sier nei til: «tilbud #1042» eller «krav om endring 2026118-3». */
  dokument: string;
  knappetekst: string;
  /** Navnet som alt står i signeringsskjemaet, så det ikke må skrives to ganger. */
  forhandsNavn?: string;
  /**
   * Krever begrunnelse før avslaget kan sendes.
   *
   * På et krav om endring er begrunnelsen ikke en høflighet: den er svaret
   * entreprenøren må forholde seg til, og den eneste opplysningen som sier om
   * uenigheten gjelder prisen, omfanget eller selve behovet for endringen.
   * Uten den står det bare «avslått» i systemet, og da må noen ta en telefon
   * for å finne ut av det som like gjerne kunne stått her.
   */
  grunnPaakrevd?: boolean;
  onAvslaa: (navn: string, grunn: string) => Promise<void>;
}) {
  const [apen, setApen] = useState(false);
  const [navn, setNavn] = useState("");
  const [grunn, setGrunn] = useState("");
  const [sender, setSender] = useState(false);
  const [feil, setFeil] = useState("");

  const aapne = () => {
    // Navnet hentes idet dialogen åpnes, ikke ved hver tast: har kunden alt
    // skrevet det over, skal det stå her — men retter de det her, skal ikke
    // skjemaet bak overstyre rettelsen igjen.
    setNavn((n) => n || (forhandsNavn ?? "").trim());
    setFeil("");
    setApen(true);
  };

  const bekreft = async () => {
    if (!navn.trim()) { setFeil("Skriv inn navnet ditt — et avslag uten avsender kan ikke etterprøves."); return; }
    if (grunnPaakrevd && !grunn.trim()) {
      setFeil("Skriv en kort begrunnelse — entreprenøren trenger å vite hva dere er uenige i.");
      return;
    }
    setSender(true);
    setFeil("");
    try {
      await onAvslaa(navn.trim(), grunn.trim());
      setApen(false);
    } catch (e: any) {
      setFeil(e?.message ?? "Noe gikk galt. Prøv igjen.");
    } finally {
      setSender(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="w-full border-red-300 text-red-700 hover:bg-red-50 hover:text-red-800"
        onClick={aapne}
      >
        <XCircle className="mr-2 h-4 w-4" />{knappetekst}
      </Button>

      <AlertDialog open={apen} onOpenChange={(o) => { if (!sender) setApen(o); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Er du sikker på at du vil avslå?</AlertDialogTitle>
            <AlertDialogDescription>
              Du er i ferd med å avslå {dokument}. Avslaget blir registrert hos entreprenøren med
              navnet ditt og tidspunktet, og lenken kan ikke brukes til å signere etterpå.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="avslag-navn">Fullt navn *</Label>
              <Input
                id="avslag-navn"
                value={navn}
                onChange={(e) => setNavn(e.target.value)}
                placeholder="Skriv inn ditt fulle navn"
                autoComplete="name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="avslag-grunn">{grunnPaakrevd ? "Begrunnelse *" : "Begrunnelse (frivillig)"}</Label>
              <Textarea
                id="avslag-grunn"
                value={grunn}
                onChange={(e) => setGrunn(e.target.value)}
                placeholder="F.eks. «for høy pris» eller «arbeidet utgår»"
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                {grunnPaakrevd
                  ? "Begrunnelsen blir stående sammen med avslaget hos entreprenøren, og er det de svarer på."
                  : "Begrunnelsen går til entreprenøren og hjelper dem å forstå hva som skal til neste gang."}
              </p>
            </div>
            {feil && <p className="text-sm font-medium text-destructive">{feil}</p>}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={sender}>Nei, gå tilbake</AlertDialogCancel>
            {/* Ikke AlertDialogAction: den lukker dialogen av seg selv, og da
                ville en feilet innsending sett ut som et vellykket avslag. */}
            <Button
              type="button"
              onClick={bekreft}
              disabled={sender}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {sender ? "Sender…" : "Ja, avslå"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
