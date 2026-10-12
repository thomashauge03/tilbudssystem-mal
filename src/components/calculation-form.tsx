import { useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, ArrowDown, ArrowUp, FileDown, Heading, Plus, Save, Search, Trash2 } from "lucide-react";
import { db } from "@/lib/kalkyle-db";
import { supabase } from "@/integrations/supabase/client";
import {
  beregnKalkyle, linjeFraKode, sammenlignKoder, sokKoder, tomLinje, tomOverskrift,
  type KalkyleLinje, type NsKode,
} from "@/lib/kalkyle";
import { lineNet, nok, UNITS as FALLBACK_UNITS } from "@/lib/format";
import { openCalculationPdf } from "@/lib/pdf";
import { useAppSettings } from "@/hooks/use-app-settings";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface KalkyleHode {
  name: string;
  customer_text: string;
  markup_pct: number;
}

/**
 * Tallfelt som holder teksten lokalt mens det har fokus, slik at «0» og «0,»
 * underveis i innskrivingen ikke blir blanket ut. Utenfor fokus vises verdien
 * (tom streng når den er 0).
 */
function TallFelt({
  verdi, onEndre, ...inputProps
}: { verdi: number; onEndre: (n: number) => void } & Omit<ComponentProps<typeof Input>, "value" | "onChange" | "type">) {
  const [tekst, setTekst] = useState("");
  const [harFokus, setHarFokus] = useState(false);
  const visning = verdi ? String(verdi) : "";
  return (
    <Input
      {...inputProps}
      type="number"
      step="any"
      className="no-spinner text-right"
      value={harFokus ? tekst : visning}
      onFocus={(e) => { setTekst(visning); setHarFokus(true); e.target.select(); }}
      onBlur={() => setHarFokus(false)}
      onChange={(e) => {
        setTekst(e.target.value);
        // Ufullstendig innskriving (f.eks. «-» eller «1e») gir badInput: vent til tallet er gyldig
        if (e.target.validity.badInput) return;
        onEndre(Number(e.target.value) || 0);
      }}
    />
  );
}

export function CalculationForm({ calculationId }: { calculationId?: string }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { tenantId } = useAuth();
  const { data: appSettings } = useAppSettings();
  const units = appSettings?.units ?? FALLBACK_UNITS;
  const vatPct = appSettings?.vat_pct ?? 25;

  const [hode, setHode] = useState<KalkyleHode>({ name: "", customer_text: "", markup_pct: 0 });
  const [linjer, setLinjer] = useState<KalkyleLinje[]>([]);
  const [klar, setKlar] = useState(false);
  const [lagrer, setLagrer] = useState(false);
  const lagrerRef = useRef(false);
  // Id til en ny kalkyle som er opprettet, men der lagringen av postene feilet
  const opprettetIdRef = useRef<string | null>(null);
  const [sok, setSok] = useState("");
  const [fokus, setFokus] = useState<number | null>(null);

  // Samme standard som tilbudene: adm.kost for året
  const { data: adminCost } = useQuery({
    queryKey: ["admin-cost-current"],
    queryFn: async () => {
      const year = new Date().getFullYear();
      const { data } = await supabase.from("admin_costs").select("pct").eq("year", year).maybeSingle();
      return Number(data?.pct ?? 0);
    },
  });

  const { data: koder } = useQuery({
    queryKey: ["ns-codes"],
    queryFn: async () => {
      const { data, error } = await db.from("ns_codes").select("*");
      if (error) throw error;
      return ((data ?? []) as NsKode[]).sort(sammenlignKoder);
    },
  });

  const { data: lastet, error: lastFeil } = useQuery({
    queryKey: ["calculation", calculationId],
    enabled: !!calculationId,
    queryFn: async () => {
      const [k, l] = await Promise.all([
        db.from("calculations").select("*").eq("id", calculationId!).single(),
        db.from("calculation_lines").select("*").eq("calculation_id", calculationId!).order("sort_order"),
      ]);
      if (k.error) throw k.error;
      if (l.error) throw l.error;
      return { kalkyle: k.data, linjer: (l.data ?? []) as KalkyleLinje[] };
    },
  });

  useEffect(() => {
    if (klar) return;
    if (!calculationId && adminCost !== undefined) {
      setHode((h) => ({ ...h, markup_pct: adminCost }));
      setKlar(true);
    }
    if (calculationId && lastet) {
      const k = lastet.kalkyle;
      setHode({ name: k.name ?? "", customer_text: k.customer_text ?? "", markup_pct: Number(k.markup_pct ?? 0) });
      setLinjer(lastet.linjer.map((l) => ({ ...l, quantity: Number(l.quantity), unit_price: Number(l.unit_price) })));
      setKlar(true);
    }
  }, [calculationId, adminCost, lastet, klar]);

  // Etter at en kode er lagt til, står markøren i mengdefeltet
  useEffect(() => {
    if (fokus === null) return;
    document.querySelector<HTMLInputElement>(`[data-mengde="${fokus}"]`)?.focus();
    setFokus(null);
  }, [fokus]);

  const treff = useMemo(() => sokKoder(koder ?? [], sok), [koder, sok]);
  const summer = useMemo(() => beregnKalkyle(linjer, hode.markup_pct, vatPct), [linjer, hode.markup_pct, vatPct]);

  const leggTilKode = (k: NsKode) => {
    const i = linjer.length;
    setLinjer((p) => [...p, linjeFraKode(k)]);
    setFokus(i);
    setSok("");
  };
  const oppdater = (i: number, patch: Partial<KalkyleLinje>) =>
    setLinjer((p) => p.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const fjern = (i: number) => setLinjer((p) => p.filter((_, idx) => idx !== i));
  const flytt = (fra: number, til: number) =>
    setLinjer((p) => {
      if (til < 0 || til >= p.length) return p;
      const neste = [...p];
      const [l] = neste.splice(fra, 1);
      neste.splice(til, 0, l);
      return neste;
    });

  /** Samme vakt som bekreftNullinjer i offer-form.tsx. */
  const bekreftNullinjer = () => {
    const mistenkelige = linjer.filter((l) => !l.is_heading && l.description.trim() && lineNet(l) === 0);
    if (!mistenkelige.length) return true;
    const liste = mistenkelige.map((l) => `• ${l.ns_code ?? ""} ${l.description} — ${l.quantity} × ${l.unit_price}`).join("\n");
    return window.confirm(`${mistenkelige.length} linje(r) summerer til 0 kr:\n\n${liste}\n\nLagre likevel?`);
  };

  const lagre = async (): Promise<string | null> => {
    if (lagrerRef.current) return null;
    if (!hode.name.trim()) { toast.error("Kalkylen må ha et navn"); return null; }
    if (!bekreftNullinjer()) return null;
    lagrerRef.current = true;
    setLagrer(true);
    try {
      const payload = {
        name: hode.name.trim(),
        customer_text: hode.customer_text.trim() || null,
        markup_pct: Number(hode.markup_pct || 0),
        updated_at: new Date().toISOString(),
      };
      let id = calculationId ?? opprettetIdRef.current ?? undefined;
      if (id) {
        const { error } = await db.from("calculations").update(payload).eq("id", id);
        if (error) { toast.error(error.message); return null; }
        // Slett-og-sett-inn, som tilbudslinjene. Feiler slettingen, stopper vi
        // før innsettingen, ellers ville linjene blitt dobbelt.
        const { error: slettFeil } = await db.from("calculation_lines").delete().eq("calculation_id", id);
        if (slettFeil) { toast.error(slettFeil.message); return null; }
      } else {
        const { data, error } = await db.from("calculations").insert({ ...payload, tenant_id: tenantId }).select("id").single();
        if (error) { toast.error(error.message); return null; }
        id = data.id as string;
        opprettetIdRef.current = id;
      }
      if (linjer.length) {
        const { error } = await db.from("calculation_lines").insert(linjer.map((l, idx) => ({
          tenant_id: tenantId,
          calculation_id: id,
          sort_order: idx,
          ns_code: l.is_heading ? null : (l.ns_code?.trim() || null),
          description: l.description,
          unit: l.is_heading ? "" : l.unit,
          quantity: l.is_heading ? 0 : Number(l.quantity || 0),
          unit_price: l.is_heading ? 0 : Number(l.unit_price || 0),
          is_heading: !!l.is_heading,
        })));
        if (error) {
          toast.error(calculationId ? error.message : `Kalkylen er opprettet uten poster (${error.message}). Trykk Lagre for å prøve igjen.`);
          return null;
        }
      }
      qc.invalidateQueries({ queryKey: ["calculations"] });
      qc.invalidateQueries({ queryKey: ["calculation", id] });
      toast.success("Kalkylen er lagret");
      if (!calculationId) navigate({ to: "/kalkyle/$id", params: { id: id! }, replace: true });
      return id!;
    } catch (e) {
      toast.error((e as Error).message);
      return null;
    } finally {
      lagrerRef.current = false;
      setLagrer(false);
    }
  };

  if (lastFeil && !klar) return <p className="text-destructive">Kunne ikke hente kalkylen: {(lastFeil as Error).message}</p>;
  if (!klar) return <div className="text-muted-foreground">Laster…</div>;

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild><Link to="/kalkyle"><ArrowLeft className="mr-1 h-4 w-4" />Kalkyler</Link></Button>
        <h1 className="text-2xl font-semibold">{calculationId ? hode.name || "Kalkyle" : "Ny kalkyle"}</h1>
      </div>

      <div className="grid gap-3 md:grid-cols-[2fr_2fr_1fr]">
        <div className="space-y-1.5"><Label>Navn</Label><Input value={hode.name} onChange={(e) => setHode({ ...hode, name: e.target.value })} placeholder="F.eks. VA Storgata" /></div>
        <div className="space-y-1.5"><Label>Kunde / prosjekt</Label><Input value={hode.customer_text} onChange={(e) => setHode({ ...hode, customer_text: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>Påslag %</Label><Input type="number" step="0.1" className="no-spinner text-right" value={hode.markup_pct} onChange={(e) => setHode({ ...hode, markup_pct: Number(e.target.value) })} onFocus={(e) => e.target.select()} /></div>
      </div>

      <div className="relative max-w-xl">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-8"
          placeholder={koder?.length ? "Søk NS-kode eller tekst, Enter legger til første treff" : "Kodebanken er tom – legg inn startpakken under Kodebank"}
          value={sok}
          onChange={(e) => setSok(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && treff[0]) { e.preventDefault(); leggTilKode(treff[0]); } if (e.key === "Escape") setSok(""); }}
        />
        {treff.length > 0 && (
          <div className="absolute z-20 mt-1 max-h-80 w-full overflow-y-auto rounded-md border bg-popover shadow-lg">
            {treff.map((k) => (
              <button key={k.id} type="button" className="flex w-full items-baseline gap-3 px-3 py-1.5 text-left text-sm hover:bg-accent" onClick={() => leggTilKode(k)}>
                <span className="w-20 shrink-0 font-mono">{k.code}</span>
                <span className="flex-1">{k.title}</span>
                <span className="text-muted-foreground">{k.unit}</span>
                <span className="w-24 text-right tabular-nums text-muted-foreground">{k.unit_price != null ? nok(Number(k.unit_price)) : "–"}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <datalist id="kalkyle-enheter">{units.map((u) => <option key={u} value={u} />)}</datalist>

      <div className="space-y-2">
        <div className="hidden grid-cols-[7rem_1fr_6rem_5rem_8rem_8rem_6rem] gap-2 px-2 text-xs uppercase tracking-wider text-muted-foreground md:grid">
          <span>Kode</span><span>Beskrivelse</span><span className="text-right">Mengde</span><span>Enhet</span><span className="text-right">Enhetspris</span><span className="text-right">Sum</span><span />
        </div>
        {linjer.length === 0 && <p className="py-6 text-center text-muted-foreground">Ingen poster. Søk opp en NS-kode over, eller legg til en fritekstlinje.</p>}
        {linjer.map((l, i) => {
          const pil = (
            <div className="flex items-center justify-end gap-0.5">
              <Button size="icon" variant="ghost" className="h-7 w-7" disabled={i === 0} onClick={() => flytt(i, i - 1)} title="Flytt opp"><ArrowUp className="h-3.5 w-3.5" /></Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" disabled={i === linjer.length - 1} onClick={() => flytt(i, i + 1)} title="Flytt ned"><ArrowDown className="h-3.5 w-3.5" /></Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => fjern(i)} title="Slett"><Trash2 className="h-4 w-4 text-destructive" /></Button>
            </div>
          );
          if (l.is_heading) {
            return (
              <div key={i} className="grid grid-cols-[1fr_6rem] items-center gap-2 rounded border bg-muted/40 px-2 py-1.5">
                <Input value={l.description} onChange={(e) => oppdater(i, { description: e.target.value })} placeholder="Overskrift, f.eks. GRUNNARBEID" className="font-semibold uppercase tracking-wide" />
                {pil}
              </div>
            );
          }
          const null0 = l.description.trim() && lineNet(l) === 0;
          return (
            <div key={i} className={`grid grid-cols-2 items-center gap-2 rounded border px-2 py-1.5 md:grid-cols-[7rem_1fr_6rem_5rem_8rem_8rem_6rem] ${null0 ? "border-amber-400" : ""}`}>
              <Input className="font-mono" value={l.ns_code ?? ""} onChange={(e) => oppdater(i, { ns_code: e.target.value })} placeholder="Kode" />
              <Input className="col-span-2 md:col-span-1" value={l.description} onChange={(e) => oppdater(i, { description: e.target.value })} placeholder="Beskrivelse" />
              <TallFelt data-mengde={i} verdi={l.quantity} onEndre={(n) => oppdater(i, { quantity: n })} placeholder="Mengde" />
              <Input list="kalkyle-enheter" value={l.unit} onChange={(e) => oppdater(i, { unit: e.target.value })} placeholder="Enhet" />
              <TallFelt verdi={l.unit_price} onEndre={(n) => oppdater(i, { unit_price: n })} placeholder="Enhetspris" />
              <span className="text-right font-medium tabular-nums">{nok(lineNet(l))}</span>
              {pil}
            </div>
          );
        })}
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setLinjer((p) => [...p, tomOverskrift()])}><Heading className="mr-1 h-4 w-4" />Ny overskrift</Button>
          <Button size="sm" variant="outline" onClick={() => setLinjer((p) => [...p, tomLinje(units[0] ?? "")])}><Plus className="mr-1 h-4 w-4" />Fritekstlinje</Button>
        </div>
      </div>

      <div className="ml-auto max-w-sm space-y-1 rounded-lg border p-3 text-sm tabular-nums">
        <div className="flex justify-between"><span>Sum poster</span><span>{nok(summer.sum)}</span></div>
        <div className="flex justify-between"><span>Påslag ({hode.markup_pct} %)</span><span>{nok(summer.paaslag)}</span></div>
        <div className="flex justify-between font-medium"><span>Sum eks. mva</span><span>{nok(summer.eksMva)}</span></div>
        <div className="flex justify-between text-muted-foreground"><span>Mva ({vatPct} %)</span><span>{nok(summer.mva)}</span></div>
        <div className="flex justify-between border-t pt-1 text-base font-semibold"><span>Total inkl. mva</span><span>{nok(summer.total)}</span></div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-10 border-t bg-background/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => {
              // Vinduet åpnes i selve klikket. Ellers blokkerer nettleseren det.
              const win = window.open("", "_blank", "width=900,height=1100");
              if (!win) { toast.error("Nettleseren blokkerte PDF-vinduet. Tillat popup-vinduer for denne siden og prøv igjen."); return; }
              openCalculationPdf(
                { name: hode.name || "Kalkyle", customer_text: hode.customer_text, markup_pct: hode.markup_pct, lines: linjer },
                { company_name: appSettings?.company_name ?? "", company_org_nr: appSettings?.company_org_nr ?? "", logo_url: appSettings?.logo_url ?? "", vat_pct: vatPct },
                win,
              );
            }}
          >
            <FileDown className="mr-1 h-4 w-4" />PDF
          </Button>
          {/* TILBUD-KNAPP */}
          <Button onClick={() => lagre()} disabled={lagrer || !tenantId}><Save className="mr-1 h-4 w-4" />Lagre</Button>
        </div>
      </div>
    </div>
  );
}
