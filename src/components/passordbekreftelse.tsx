// Ber brukeren skrive passordet sitt før noe som ikke skal kunne skje ved et uhell.
//
// Innlogging alene er ikke nok her. En innlogget maskin står ofte åpen på en
// brakkerigg eller et kontor, og det som ligger bak denne dialogen — å godkjenne
// et tilbud uten at kunden har signert, eller å endre tall kunden alt har skrevet
// under på — skal være noe man gjør bevisst, ikke noe man kommer borti.
//
// Passordet kontrolleres mot Supabase Auth ved en ny innlogging med samme
// e-post. Feil passord rører ikke økten man alt har; riktig passord gir en ny
// økt for den samme brukeren, som er uten betydning for arbeidet videre.

import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { ShieldAlert } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tittel: string;
  /** Hva som faktisk skjer. Skriv det rett ut — dette er siste stopp. */
  forklaring: string;
  /** Teksten på bekreftelsesknappen, f.eks. «Lås opp for endring» */
  knapp: string;
  /** Be om en begrunnelse som blir stående på dokumentet */
  krevGrunn?: boolean;
  grunnEtikett?: string;
  grunnHjelp?: string;
  /** Valgfritt nedtrekk, f.eks. hvordan kunden godkjente */
  valg?: { etikett: string; alternativer: Array<{ verdi: string; tekst: string }> };
  /** Kalles først når passordet er bekreftet */
  onBekreftet: (grunn: string, valgt: string) => Promise<void>;
}

export function Passordbekreftelse({
  open, onOpenChange, tittel, forklaring, knapp,
  krevGrunn, grunnEtikett, grunnHjelp, valg, onBekreftet,
}: Props) {
  const { user } = useAuth();
  const [passord, setPassord] = useState("");
  const [grunn, setGrunn] = useState("");
  const [valgt, setValgt] = useState(valg?.alternativer[0]?.verdi ?? "");
  const [jobber, setJobber] = useState(false);
  const [feil, setFeil] = useState("");

  const lukk = () => {
    setPassord("");
    setGrunn("");
    setValgt(valg?.alternativer[0]?.verdi ?? "");
    setFeil("");
    onOpenChange(false);
  };

  const bekreft = async () => {
    setFeil("");
    if (!passord) { setFeil("Skriv inn passordet ditt"); return; }
    if (krevGrunn && !grunn.trim()) { setFeil("Skriv en kort begrunnelse"); return; }
    if (!user?.email) { setFeil("Fant ikke e-posten din — logg inn på nytt"); return; }

    setJobber(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: passord,
      });
      // Meldingen fra Supabase er på engelsk og nevner e-post, som er
      // forvirrende her: e-posten er jo ikke noe brukeren har skrevet inn.
      if (error) { setFeil("Feil passord"); return; }

      await onBekreftet(grunn.trim(), valgt);
      lukk();
    } catch (e: any) {
      setFeil(e?.message ?? "Noe gikk galt");
    } finally {
      setJobber(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : lukk())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-amber-600" />
            {tittel}
          </DialogTitle>
          <DialogDescription>{forklaring}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {valg && (
            <div className="space-y-1.5">
              <Label htmlFor="pb-valg">{valg.etikett}</Label>
              <Select value={valgt} onValueChange={setValgt}>
                <SelectTrigger id="pb-valg"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {valg.alternativer.map((v) => (
                    <SelectItem key={v.verdi} value={v.verdi}>{v.tekst}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {krevGrunn && (
            <div className="space-y-1.5">
              <Label htmlFor="pb-grunn">{grunnEtikett ?? "Begrunnelse"}</Label>
              <Textarea
                id="pb-grunn"
                value={grunn}
                onChange={(e) => setGrunn(e.target.value)}
                rows={2}
                placeholder="Kunden signerte på papir 19.08, kopi lagt ved"
              />
              {grunnHjelp && <p className="text-xs text-muted-foreground">{grunnHjelp}</p>}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="pb-passord">Passordet ditt</Label>
            <Input
              id="pb-passord"
              type="password"
              autoComplete="current-password"
              value={passord}
              onChange={(e) => setPassord(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !jobber) bekreft(); }}
            />
            <p className="text-xs text-muted-foreground">
              Registreres på {user?.email ?? "brukeren din"}.
            </p>
          </div>

          {feil && <p className="text-sm font-medium text-destructive">{feil}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={lukk} disabled={jobber}>Avbryt</Button>
          <Button onClick={bekreft} disabled={jobber}>{jobber ? "Kontrollerer…" : knapp}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
