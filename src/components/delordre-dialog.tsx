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
  const [nye, setNye] = useState<Record<string, string>>({});
  const [alle, setAlle] = useState("");
  const [sender, setSender] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["delordre", offerId],
    enabled: open,
    // Alltid ferske tall når dialogen åpnes.
    staleTime: 0,
    queryFn: async () => {
      const [o, l, p] = await Promise.all([
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
      ]);
      if (o.error) throw o.error;
      if (l.error) throw l.error;
      if (p.error) throw p.error;
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

  const forrige = useMemo(() => data?.forrige ?? {}, [data]);
  const adminPct = Number(data?.tilbud.admin_cost_pct ?? 0);

  const beregning = useMemo(() => {
    let grunnlag = 0;
    const feil: string[] = [];
    const andeler: Andeler = {};
    for (const p of data?.poster ?? []) {
      if (p.is_heading) continue;
      const fra = forrige[p.id] ?? 0;
      const til = lesProsent(nye[p.id] ?? "");
      if (til === null) continue;
      if (Number.isNaN(til) || til < 0 || til > 100)
        feil.push(`«${p.description}»: mellom 0 og 100 %`);
      else if (til < fra)
        feil.push(`«${p.description}»: kan ikke settes lavere enn ${visProsent(fra)} %`);
      else if (til > fra) {
        andeler[p.id] = til;
        grunnlag += Math.round(lineNet(p) * ((til - fra) / 100) * 100) / 100;
      }
    }
    const admin = Math.round(grunnlag * (adminPct / 100) * 100) / 100;
    return { andeler, grunnlag, admin, sum: grunnlag + admin, feil };
  }, [data, nye, forrige, adminPct]);

  const settAlle = () => {
    const pct = lesProsent(alle);
    if (pct === null || Number.isNaN(pct)) return;
    const ut: Record<string, string> = {};
    for (const p of data?.poster ?? []) {
      // En post som alt er kommet lenger, blir stående.
      if (!p.is_heading && (forrige[p.id] ?? 0) < pct) ut[p.id] = visProsent(pct);
    }
    setNye(ut);
  };

  const lag = async () => {
    if (beregning.feil.length || !Object.keys(beregning.andeler).length) return;
    setSender(true);
    const venter = toast.loading("Lager PDF og ordre i Tripletex…");
    try {
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
      onLaget();
      onOpenChange(false);
    } catch (e) {
      toast.dismiss(venter);
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
            Skriv hvor mange prosent av hver post som er gjort, totalt. Ordren i Tripletex tar bare
            med økningen siden sist. Den blir ikke fakturert eller sendt — det gjør dere i
            Tripletex.
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
                    <th className="w-24 px-3 py-2 text-right">Nå</th>
                    <th className="px-3 py-2 text-right">Denne gang</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.poster ?? []).map((p) => {
                    if (p.is_heading) {
                      return (
                        <tr key={p.id} className="border-b bg-muted/30">
                          <td
                            colSpan={5}
                            className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide"
                          >
                            {p.description}
                          </td>
                        </tr>
                      );
                    }
                    const fra = forrige[p.id] ?? 0;
                    const til = lesProsent(nye[p.id] ?? "");
                    const okning =
                      til !== null && !Number.isNaN(til) && til > fra && til <= 100
                        ? lineNet(p) * ((til - fra) / 100)
                        : 0;
                    const ferdig = fra >= 100;
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
                          {visProsent(fra)} %
                        </td>
                        <td className="px-3 py-2 text-right">
                          {ferdig ? (
                            <span className="text-xs text-green-700 dark:text-green-400">
                              Ferdig
                            </span>
                          ) : (
                            <Input
                              value={nye[p.id] ?? ""}
                              onChange={(e) => setNye((s) => ({ ...s, [p.id]: e.target.value }))}
                              inputMode="decimal"
                              placeholder={visProsent(fra)}
                              className="h-8 w-20 text-right"
                              aria-label={`Andel utført for ${p.description}`}
                            />
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium">
                          {okning ? nok(okning) : "—"}
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
              sender ||
              isLoading ||
              !!beregning.feil.length ||
              !Object.keys(beregning.andeler).length
            }
          >
            {sender ? "Lager ordre…" : "Lag ordre i Tripletex"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
