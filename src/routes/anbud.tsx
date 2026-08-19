import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Trophy, TrendingDown, Search, Save, Trash2 } from "lucide-react";
import { nok, toISODate } from "@/lib/format";
import { parseAnbudsprotokoll, finnEgetBud, type ParsedBid } from "@/lib/anbud";
import { useAppSettings } from "@/hooks/use-app-settings";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/anbud")({ component: AnbudPage });

function AnbudPage() {
  const qc = useQueryClient();
  const { tenantId } = useAuth();
  const { data: appSettings } = useAppSettings();

  const [tekst, setTekst] = useState("");
  const [tittel, setTittel] = useState("");
  const [dato, setDato] = useState(() => toISODate(new Date()));
  const [projectId, setProjectId] = useState("__none");
  const [bud, setBud] = useState<ParsedBid[]>([]);
  const [lagrer, setLagrer] = useState(false);
  const [q, setQ] = useState("");

  const { data: projects } = useQuery({
    queryKey: ["projects-simple"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects").select("id, name, project_number, status").eq("status", "aktiv").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: anbud, isLoading, isError, error } = useQuery({
    queryKey: ["anbud"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenders" as never)
        .select("*, tender_bids(company, amount, is_us, sort_order), projects(name, project_number)")
        .order("opened_on", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // Tolkes mens du limer inn, så du ser med én gang om noe ble misforstått
  const tolk = (t: string) => {
    setTekst(t);
    const r = parseAnbudsprotokoll(t);
    if (r.title) setTittel(r.title);
    const eget = finnEgetBud(r.bids, appSettings?.company_name);
    setBud(r.bids.map((b) => ({ ...b, ...(b === eget ? {} : {}) })));
    if (r.ignored.length) {
      toast.warning(`${r.ignored.length} linje(r) ble ikke forstått og er utelatt`);
    }
  };

  const egetBud = useMemo(() => finnEgetBud(bud, appSettings?.company_name), [bud, appSettings]);

  const lagre = async () => {
    if (!tittel.trim()) { toast.error("Anbudet mangler navn"); return; }
    if (bud.length < 2) { toast.error("Lim inn en protokoll med minst to bud"); return; }
    setLagrer(true);
    try {
      const { data, error } = await supabase
        .from("tenders" as never)
        .insert({
          tenant_id: tenantId, title: tittel.trim(), opened_on: dato || null,
          project_id: projectId === "__none" ? null : projectId, source_text: tekst,
        } as never)
        .select("id").single();
      if (error) { toast.error(error.message); return; }

      const tenderId = (data as any).id;
      const rader = bud.map((b, i) => ({
        tenant_id: tenantId, tender_id: tenderId, company: b.company, amount: b.amount,
        is_us: egetBud ? b.company === egetBud.company && b.amount === egetBud.amount : false,
        sort_order: i,
      }));
      const { error: e2 } = await supabase.from("tender_bids" as never).insert(rader as never);
      if (e2) { toast.error(e2.message); return; }

      toast.success("Anbudsprotokoll lagret");
      setTekst(""); setTittel(""); setBud([]); setProjectId("__none");
      qc.invalidateQueries({ queryKey: ["anbud"] });
    } finally {
      setLagrer(false);
    }
  };

  const slett = async (id: string) => {
    if (!window.confirm("Slette denne anbudsprotokollen?")) return;
    const b = await supabase.from("tender_bids" as never).delete().eq("tender_id" as never, id as never);
    if (b.error) { toast.error(b.error.message); return; }
    const { error } = await supabase.from("tenders" as never).delete().eq("id" as never, id as never);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["anbud"] });
  };

  // Statistikk på tvers: hvor ofte vinner vi, og hvor mye skiller
  const stats = useMemo(() => {
    const med = (anbud ?? []).filter((a) => (a.tender_bids ?? []).some((b: any) => b.is_us));
    let vunnet = 0, sumDiff = 0, medDiff = 0;
    for (const a of med) {
      const sortert = [...(a.tender_bids ?? [])].sort((x: any, y: any) => Number(x.amount) - Number(y.amount));
      const vaart = sortert.find((b: any) => b.is_us);
      if (!vaart) continue;
      if (sortert[0] === vaart) vunnet++;
      else { sumDiff += Number(vaart.amount) - Number(sortert[0].amount); medDiff++; }
    }
    return { totalt: med.length, vunnet, snittDiff: medDiff ? sumDiff / medDiff : 0 };
  }, [anbud]);

  const rader = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return anbud ?? [];
    return (anbud ?? []).filter((a) =>
      [a.title, a.projects?.name, ...(a.tender_bids ?? []).map((b: any) => b.company)]
        .some((s) => String(s ?? "").toLowerCase().includes(t)));
  }, [anbud, q]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Anbudsprotokoller</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Hva konkurrentene bød — på jobber vi vant og tapte
        </p>
      </div>

      {stats.totalt > 0 && (
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border bg-card p-5 shadow-sm">
            <p className="text-sm text-muted-foreground">Anbud registrert</p>
            <p className="mt-1 text-2xl font-bold">{stats.totalt}</p>
          </div>
          <div className="rounded-xl border bg-card p-5 shadow-sm">
            <p className="text-sm text-muted-foreground">Vunnet</p>
            <p className="mt-1 text-2xl font-bold text-green-700 dark:text-green-400">
              {stats.vunnet} <span className="text-base font-normal text-muted-foreground">
                av {stats.totalt}</span>
            </p>
          </div>
          <div className="rounded-xl border bg-card p-5 shadow-sm">
            <p className="text-sm text-muted-foreground">Snitt over vinner når vi taper</p>
            <p className="mt-1 text-2xl font-bold">{nok(stats.snittDiff)}</p>
          </div>
        </div>
      )}

      {/* Innliming */}
      <div className="rounded-xl border bg-card p-5 shadow-sm space-y-4">
        <div className="space-y-2">
          <Label>Lim inn SMS-en fra anbudsåpningen</Label>
          <Textarea
            rows={6}
            value={tekst}
            onChange={(e) => tolk(e.target.value)}
            placeholder={"Anbudsprotokoll VVA Byremo :\nVasland Maskin 3.827.254\nHauge Maskin 4.478.662\n…"}
            className="font-mono text-sm"
          />
        </div>

        {bud.length > 0 && (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>Navn på anbudet</Label>
                <Input value={tittel} onChange={(e) => setTittel(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Åpnet</Label>
                <Input type="date" value={dato} onChange={(e) => setDato(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Prosjekt</Label>
                <Select value={projectId} onValueChange={setProjectId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">— Ikke knyttet —</SelectItem>
                    {(projects ?? []).map((p: any) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}{p.project_number ? ` (#${p.project_number})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="rounded-lg border divide-y">
              {bud.map((b, i) => {
                const oss = egetBud && b.company === egetBud.company && b.amount === egetBud.amount;
                const diff = b.amount - bud[0].amount;
                return (
                  <div key={i} className={`flex items-center gap-3 px-3 py-2 text-sm ${oss ? "bg-primary/5" : ""}`}>
                    <span className="w-6 text-muted-foreground tabular-nums">{i + 1}.</span>
                    <Input
                      value={b.company}
                      onChange={(e) => setBud(bud.map((x, ix) => ix === i ? { ...x, company: e.target.value } : x))}
                      className="h-8 flex-1"
                    />
                    <Input
                      type="number"
                      value={b.amount}
                      onChange={(e) => setBud(bud.map((x, ix) => ix === i ? { ...x, amount: Number(e.target.value) } : x))}
                      className="h-8 w-40 text-right no-spinner"
                    />
                    <span className="w-32 text-right text-xs text-muted-foreground tabular-nums">
                      {i === 0 ? "laveste" : `+${nok(diff)}`}
                    </span>
                    {oss && <span className="rounded bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">Oss</span>}
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {egetBud
                  ? egetBud.amount === bud[0].amount
                    ? "Vi hadde laveste pris"
                    : `Vi lå ${nok(egetBud.amount - bud[0].amount)} over ${bud[0].company}`
                  : `Fant ikke «${appSettings?.company_name ?? "vårt firma"}» blant budene — rett navnet over om det er feilskrevet`}
              </p>
              <Button onClick={lagre} disabled={lagrer || !tenantId}>
                <Save className="mr-2 h-4 w-4" />{lagrer ? "Lagrer…" : "Lagre protokoll"}
              </Button>
            </div>
          </>
        )}
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Søk på anbud, prosjekt eller firma…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
      </div>

      {isError && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          Feil: {(error as Error).message}
        </div>
      )}

      <div className="space-y-4">
        {isLoading ? (
          <p className="py-12 text-center text-muted-foreground">Laster…</p>
        ) : rader.length === 0 ? (
          <p className="py-12 text-center text-muted-foreground">Ingen anbudsprotokoller registrert ennå.</p>
        ) : rader.map((a: any) => {
          const sortert = [...(a.tender_bids ?? [])].sort((x, y) => Number(x.amount) - Number(y.amount));
          const vaart = sortert.find((b: any) => b.is_us);
          const vant = vaart && sortert[0] === vaart;
          return (
            <div key={a.id} className="rounded-xl border bg-card shadow-sm">
              <div className="flex items-start justify-between gap-3 border-b px-5 py-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-semibold">{a.title}</h2>
                    {vaart && (vant
                      ? <span className="flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800"><Trophy className="h-3 w-3" />Vunnet</span>
                      : <span className="flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700"><TrendingDown className="h-3 w-3" />Tapt</span>)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {a.opened_on ?? "—"}
                    {a.projects?.name ? ` · ${a.projects.name}` : ""}
                    {vaart && !vant ? ` · ${nok(Number(vaart.amount) - Number(sortert[0].amount))} over vinneren` : ""}
                  </p>
                </div>
                <button onClick={() => void slett(a.id)} className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="divide-y">
                {sortert.map((b: any, i: number) => (
                  <div key={i} className={`flex items-center gap-3 px-5 py-2 text-sm ${b.is_us ? "bg-primary/5 font-medium" : ""}`}>
                    <span className="w-6 text-muted-foreground tabular-nums">{i + 1}.</span>
                    <span className="flex-1">{b.company}</span>
                    <span className="tabular-nums">{nok(Number(b.amount))}</span>
                    {i > 0 && (
                      <span className="w-32 text-right text-xs text-muted-foreground tabular-nums">
                        +{nok(Number(b.amount) - Number(sortert[0].amount))}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
