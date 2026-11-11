// «Ny delordre»: hvor stor andel av hver post som er gjort, og en ordre i
// Tripletex på økningen siden sist.
//
// Tallene her er bare til å se på. Edge functionen leser andelene på nytt og
// regner ordren selv, så en fane som har stått åpen lenge, eller en kollega
// som lagde en delordre i mellomtiden, ikke kan få noe med to ganger.

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { nok, lineNet } from "@/lib/format";
import { toast } from "sonner";
import { useAppSettings } from "@/hooks/use-app-settings";
import { useAuth } from "@/hooks/use-auth";
import { Checkbox } from "@/components/ui/checkbox";
import { lagPdfFil } from "@/lib/pdf-fil";
import { hentTilbudForPdf, skrivTilbudsPdf } from "@/lib/tilbud-pdf";
import { gjeldendeAndeler, lagDelordre, delordreTekst, type Andeler } from "@/lib/tripletex";

interface Post {
  id: string;
  sort_order: number;
  description: string;
  unit: string | null;
  quantity: number;
  unit_price: number;
  discount_pct: number | null;
  included: boolean;
  is_heading: boolean | null;
  ns_code: string | null;
}

/** «60», «60,5» og «60 %» er alle 60-noe. Tomt felt er null: posten står stille. */
function lesProsent(s: string): number | null {
  const t = s.replace("%", "").replace(",", ".").trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

const visProsent = (n: number) => (Number.isInteger(n) ? String(n) : String(n).replace(".", ","));

/** Med to desimaler på det meste: 29,9 og ikke 29,900000000000002. */
const visTall = (n: number) => visProsent(Math.round(n * 100) / 100);

/**
 * En post med mengde (130 m³) føres i mengde utført — det er det man måler
 * ute. En post på 1 stk / 1 RS har ingen mengde å dele, og føres i prosent.
 * Under panseret er alt prosent, slik serveren regner.
 */
const iMengde = (p: Post) => Number(p.quantity) > 0 && Number(p.quantity) !== 1;

/** Det som er skrevet i feltet, som prosent av posten. */
const somProsent = (p: Post, verdi: number) =>
  iMengde(p) ? (verdi / Number(p.quantity)) * 100 : verdi;

/** En andel slik feltet for posten viser den: «39 m³» eller «40 %». */
const visAndel = (p: Post, pct: number) =>
  iMengde(p)
    ? `${visTall((Number(p.quantity) * pct) / 100)} ${p.unit ?? ""}`.trim()
    : `${visProsent(Math.round(pct * 10) / 10)} %`;

/** Feltets verdi for en andel: mengde for mengdeposter, prosent ellers. */
const feltverdi = (p: Post, pct: number) =>
  iMengde(p) ? visTall((Number(p.quantity) * pct) / 100) : visProsent(pct);

/** Avrunding i mengde → prosent skal ikke gi «mer enn 100 %». */
const EPS = 1e-6;

export function DelordreDialog({
  offerId,
  open,
  onOpenChange,
  onLaget,
}: {
  offerId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onLaget: () => void;
}) {
  const { data: innst } = useAppSettings();
  const { tenantId } = useAuth();
  const [nye, setNye] = useState<Record<string, string>>({});
  const [alle, setAlle] = useState("");
  const [sender, setSender] = useState(false);
  // Hvilke poster som skal stå som fullført etter lagring. Starter likt med
  // basen; forskjellen er det som lagres.
  const [fullfortValg, setFullfortValg] = useState<Record<string, boolean>>({});

  const { data, isLoading, error } = useQuery({
    queryKey: ["delordre", offerId],
    enabled: open,
    // Alltid ferske tall når dialogen åpnes.
    staleTime: 0,
    queryFn: async () => {
      const [o, l, p, f] = await Promise.all([
        supabase
          .from("offers")
          .select("offer_number, title, admin_cost_pct")
          .eq("id", offerId)
          .single(),
        supabase
          .from("offer_lines")
          .select(
            "id, sort_order, description, unit, quantity, unit_price, discount_pct, included, is_heading, ns_code",
          )
          .eq("offer_id", offerId)
          .order("sort_order"),
        supabase
          .from("payments")
          .select("amount, andeler, tripletex_status, tripletex_ordre_id")
          .eq("offer_id", offerId),
        supabase
          .from("delpost_fullfort" as never)
          .select("offer_line_id, andel")
          .eq("offer_id" as never, offerId as never),
      ]);
      if (o.error) throw o.error;
      if (l.error) throw l.error;
      if (p.error) throw p.error;
      if (f.error) throw f.error;
      const rader = (p.data ?? []) as Array<{
        amount: number;
        andeler: unknown;
        tripletex_status: string | null;
        tripletex_ordre_id: number | null;
      }>;
      return {
        tilbud: o.data as {
          offer_number: number;
          title: string | null;
          admin_cost_pct: number | null;
        },
        poster: ((l.data ?? []) as unknown as Post[]).filter((x) => x.included !== false),
        forrige: gjeldendeAndeler(rader),
        // {offer_line_id: andelen den ble merket fullført på}
        fullfort: Object.fromEntries(
          ((f.data ?? []) as Array<{ offer_line_id: string; andel: number }>).map((x) => [
            x.offer_line_id,
            Number(x.andel),
          ]),
        ) as Record<string, number>,
        // Ført for hånd før koblingen fantes. Vises, så ingen sender det samme på nytt.
        forHand: rader
          .filter((r) => !r.tripletex_ordre_id)
          .reduce((s, r) => s + Number(r.amount), 0),
      };
    },
  });

  useEffect(() => {
    if (open) {
      setNye({});
      setAlle("");
    }
  }, [open]);

  useEffect(() => {
    if (data)
      setFullfortValg(Object.fromEntries(Object.keys(data.fullfort).map((id) => [id, true])));
  }, [data]);

  const forrige = useMemo(() => data?.forrige ?? {}, [data]);
  const lagretFullfort = useMemo(() => data?.fullfort ?? {}, [data]);
  const adminPct = Number(data?.tilbud.admin_cost_pct ?? 0);

  // En post som er lagret som fullført og ikke åpnes igjen nå, står stille.
  const laast = (id: string) => id in lagretFullfort && fullfortValg[id] !== false;

  const endringer = useMemo(() => {
    const apnes = Object.keys(lagretFullfort).filter((id) => fullfortValg[id] === false);
    const lukkes = Object.keys(fullfortValg).filter(
      (id) => fullfortValg[id] && !(id in lagretFullfort),
    );
    return { apnes, lukkes };
  }, [fullfortValg, lagretFullfort]);

  const beregning = useMemo(() => {
    let grunnlag = 0;
    const feil: string[] = [];
    const andeler: Andeler = {};
    for (const p of data?.poster ?? []) {
      if (p.is_heading || laast(p.id)) continue;
      const fra = forrige[p.id] ?? 0;
      const lest = lesProsent(nye[p.id] ?? "");
      if (lest === null) continue;
      let til = Number.isNaN(lest) ? NaN : somProsent(p, lest);
      if (Math.abs(til - 100) < EPS) til = 100;
      if (Number.isNaN(til) || til < 0 || til > 100)
        feil.push(
          `«${p.description}»: ${iMengde(p) ? `mellom 0 og ${visAndel(p, 100)}` : "mellom 0 og 100 %"}`,
        );
      else if (til < fra - EPS)
        feil.push(`«${p.description}»: kan ikke settes lavere enn ${visAndel(p, fra)}`);
      else if (til > fra + EPS) {
        andeler[p.id] = til;
        grunnlag += Math.round(lineNet(p) * ((til - fra) / 100) * 100) / 100;
      }
    }
    const admin = Math.round(grunnlag * (adminPct / 100) * 100) / 100;
    return { andeler, grunnlag, admin, sum: grunnlag + admin, feil };
    // laast leser fullfortValg og lagretFullfort, som står i listen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, nye, forrige, adminPct, fullfortValg, lagretFullfort]);

  const harOrdre = Object.keys(beregning.andeler).length > 0;
  const harFullfortEndring = endringer.apnes.length + endringer.lukkes.length > 0;

  const settAlle = () => {
    const pct = lesProsent(alle);
    if (pct === null || Number.isNaN(pct)) return;
    const ut: Record<string, string> = {};
    for (const p of data?.poster ?? []) {
      // En post som alt er kommet lenger, eller er fullført, blir stående.
      if (!p.is_heading && !laast(p.id) && !fullfortValg[p.id] && (forrige[p.id] ?? 0) < pct) {
        ut[p.id] = feltverdi(p, pct);
      }
    }
    setNye(ut);
  };

  /**
   * Rekkefølgen betyr noe: en post som åpnes igjen, må være åpen før ordren
   * lages, ellers nekter serveren økningen. En post som lukkes, lukkes etter
   * ordren, så den siste andelen rekker å bli med.
   */
  const lag = async () => {
    if (beregning.feil.length || (!harOrdre && !harFullfortEndring)) return;
    setSender(true);
    const venter = harOrdre ? toast.loading("Lager PDF og ordre i Tripletex…") : undefined;
    try {
      if (endringer.apnes.length) {
        const { error: e } = await supabase
          .from("delpost_fullfort" as never)
          .delete()
          .in("offer_line_id" as never, endringer.apnes as never);
        if (e) throw e;
      }

      if (harOrdre) {
        let pdf: Blob | null = null;
        try {
          const t = await hentTilbudForPdf(offerId);
          pdf = await lagPdfFil((w) => skrivTilbudsPdf(w, t.tilbud, t.linjer, t.kunde, innst));
        } catch (e) {
          // Ordren er verdt mer enn vedlegget: den lages uansett, og det sies fra.
          console.error(e);
        }
        const r = await lagDelordre(offerId, beregning.andeler, pdf);
        toast.dismiss(venter);
        const melding = delordreTekst(r, !!pdf);
        if (melding.ok) toast.success(melding.tekst);
        else toast.warning(melding.tekst);
      }

      if (endringer.lukkes.length) {
        const { error: e } = await supabase.from("delpost_fullfort" as never).upsert(
          endringer.lukkes.map((id) => ({
            offer_line_id: id,
            offer_id: offerId,
            tenant_id: tenantId,
            andel: beregning.andeler[id] ?? forrige[id] ?? 0,
          })) as never,
        );
        if (e) throw e;
      }
      if (harFullfortEndring) {
        const n = endringer.lukkes.length;
        const m = endringer.apnes.length;
        toast.success(
          [n && `${n} ${n === 1 ? "post" : "poster"} merket fullført`, m && `${m} åpnet igjen`]
            .filter(Boolean)
            .join(", "),
        );
      }
      onLaget();
      onOpenChange(false);
    } catch (e) {
      if (venter) toast.dismiss(venter);
      toast.error((e as Error).message);
    } finally {
      setSender(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !sender && onOpenChange(v)}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Ny delordre{data ? ` – tilbud #${data.tilbud.offer_number}` : ""}
          </DialogTitle>
          <DialogDescription>
            Skriv hvor mye av hver post som er utført totalt — mengden der posten har mengde (m³, m,
            tonn), prosent der den er 1 stk. Ordren i Tripletex tar bare med økningen siden sist.
            Den blir ikke fakturert eller sendt — det gjør dere i Tripletex. Huk av «Fullført» når
            en post er ferdig, selv om ikke alt er fakturert: da vises den som 100 %, og resten
            faktureres ikke.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Laster…</p>
        ) : error ? (
          <p className="text-sm text-destructive">{(error as Error).message}</p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">Sett alle poster til</span>
              <Input
                value={alle}
                onChange={(e) => setAlle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && settAlle()}
                inputMode="decimal"
                className="h-8 w-20 text-right"
                placeholder="%"
              />
              <span className="text-muted-foreground">%</span>
              <Button size="sm" variant="outline" className="h-8" onClick={settAlle}>
                Fyll inn
              </Button>
            </div>

            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Post</th>
                    <th className="px-3 py-2 text-right">Beløp</th>
                    <th className="px-3 py-2 text-right">Før</th>
                    <th className="w-32 px-3 py-2 text-right">Utført nå</th>
                    <th className="px-3 py-2 text-right">Denne gang</th>
                    <th
                      className="px-3 py-2 text-center"
                      title="Posten er ferdig, selv om ikke alt er fakturert — for eksempel fordi mengden ble mindre"
                    >
                      Fullført
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.poster ?? []).map((p) => {
                    if (p.is_heading) {
                      return (
                        <tr key={p.id} className="border-b bg-muted/30">
                          <td
                            colSpan={6}
                            className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide"
                          >
                            {p.description}
                          </td>
                        </tr>
                      );
                    }
                    const fra = forrige[p.id] ?? 0;
                    const lest = lesProsent(nye[p.id] ?? "");
                    const til = lest === null || Number.isNaN(lest) ? null : somProsent(p, lest);
                    const okning =
                      til !== null && til > fra + EPS && til <= 100 + EPS
                        ? lineNet(p) * ((Math.min(til, 100) - fra) / 100)
                        : 0;
                    const ferdig = fra >= 100;
                    // Fullført på mindre enn 100 % vises som 100 %: posten er
                    // ferdig, og resten skal ikke faktureres.
                    const lukket = laast(p.id);
                    const merket = !!fullfortValg[p.id];
                    return (
                      <tr key={p.id} className="border-b last:border-0">
                        <td className="px-3 py-2">
                          <div className="font-medium">
                            {[p.ns_code, p.description].filter(Boolean).join(" ")}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {visProsent(Number(p.quantity))} {p.unit ?? ""} à{" "}
                            {nok(Number(p.unit_price))}
                            {Number(p.discount_pct)
                              ? ` · ${visProsent(Number(p.discount_pct))} % rabatt`
                              : ""}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{nok(lineNet(p))}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                          {visAndel(p, fra)}
                          {iMengde(p) && fra > 0 && (
                            <span className="block text-[11px]">
                              {visProsent(Math.round(fra))} %
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {ferdig || lukket ? (
                            <span className="text-xs text-green-700 dark:text-green-400">
                              {ferdig ? "Ferdig" : "100 %"}
                              {lukket && !ferdig && (
                                <span className="block text-[11px] text-muted-foreground">
                                  fullført på {visAndel(p, lagretFullfort[p.id] ?? fra)}
                                </span>
                              )}
                            </span>
                          ) : (
                            <div className="flex items-center justify-end gap-1.5">
                              <Input
                                value={nye[p.id] ?? ""}
                                onChange={(e) => setNye((s) => ({ ...s, [p.id]: e.target.value }))}
                                inputMode="decimal"
                                placeholder={feltverdi(p, fra)}
                                className="h-8 w-20 text-right"
                                aria-label={
                                  iMengde(p)
                                    ? `Mengde utført for ${p.description}, i ${p.unit ?? "enheter"}`
                                    : `Prosent utført for ${p.description}`
                                }
                              />
                              <span className="w-8 text-left text-xs text-muted-foreground">
                                {iMengde(p) ? (p.unit ?? "") : "%"}
                              </span>
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium">
                          {okning && !lukket ? nok(okning) : "—"}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {ferdig ? (
                            <Checkbox checked disabled aria-label={`${p.description} er ferdig`} />
                          ) : (
                            <Checkbox
                              checked={merket}
                              onCheckedChange={(v) =>
                                setFullfortValg((s) => ({ ...s, [p.id]: v === true }))
                              }
                              aria-label={`Merk ${p.description} som fullført`}
                            />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {data && data.forHand > 0 && (
              <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                {nok(data.forHand)} er ført for hånd på dette tilbudet, uten kobling til postene. Ta
                hensyn til det når du setter andelene, så det ikke faktureres to ganger.
              </p>
            )}

            {beregning.feil.length > 0 && (
              <ul className="space-y-0.5 text-xs text-destructive">
                {beregning.feil.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            )}

            <div className="ml-auto max-w-xs space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Poster</span>
                <span className="tabular-nums">{nok(beregning.grunnlag)}</span>
              </div>
              {adminPct > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Adm.påslag {visProsent(adminPct)} %</span>
                  <span className="tabular-nums">{nok(beregning.admin)}</span>
                </div>
              )}
              <div className="flex justify-between border-t pt-1 font-semibold">
                <span>Ordren, eks. mva</span>
                <span className="tabular-nums">{nok(beregning.sum)}</span>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sender}>
            Avbryt
          </Button>
          <Button
            onClick={lag}
            disabled={
              sender || isLoading || !!beregning.feil.length || (!harOrdre && !harFullfortEndring)
            }
          >
            {sender
              ? harOrdre
                ? "Lager ordre…"
                : "Lagrer…"
              : harOrdre
                ? "Lag ordre i Tripletex"
                : "Lagre fullført"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
