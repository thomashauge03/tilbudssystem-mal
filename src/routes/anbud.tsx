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
import { Trophy, TrendingDown, Search, Save, Trash2, Inbox, Pencil, AlertTriangle, Lightbulb, Layers } from "lucide-react";
import { LineChart, Line, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { nok, toISODate } from "@/lib/format";
import { parseAnbudsprotokoll, finnEgetBud, splittProtokoller, type ParsedBid } from "@/lib/anbud";
import { lagInnsikt } from "@/lib/anbud-innsikt";
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
  const [offerId, setOfferId] = useState("__none");
  const [bud, setBud] = useState<ParsedBid[]>([]);
  const [lagrer, setLagrer] = useState(false);
  // Skrivemåten varierer mellom avsendere, så gjenkjenningen kan bomme.
  // Da peker du selv ut hvilket bud som er deres.
  const [manueltOss, setManueltOss] = useState<number | null>(null);
  const [utenPris, setUtenPris] = useState<Array<{ company: string; note: string }>>([]);
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

  const { data: tilbud } = useQuery({
    queryKey: ["offers-for-tender", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("offers")
        .select("id, offer_number, title, customer_name")
        .eq("tenant_id", tenantId!)
        .order("offer_number", { ascending: false })
        .limit(300);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: anbud, isLoading, isError, error } = useQuery({
    queryKey: ["anbud"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenders" as never)
        .select("*, tender_bids(company, amount, is_us, sort_order), projects(name, project_number), offers(id, offer_number, title)")
        .order("opened_on", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // Meldinger videresendt fra mobilen. Som standard vises bare de ubehandlede,
  // men de andre kan hentes fram for å ryddes bort.
  const [visAlle, setVisAlle] = useState(false);

  const { data: innboks } = useQuery({
    queryKey: ["sms-innboks", visAlle],
    queryFn: async () => {
      let sp = supabase
        .from("sms_inbox" as never)
        .select("id, received_at, sender, body, status");
      if (!visAlle) sp = sp.eq("status" as never, "ny" as never);
      const { data, error } = await sp.order("received_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const [innboksId, setInnboksId] = useState<string | null>(null);

  const slettMelding = async (id: string) => {
    if (!window.confirm("Slette denne meldingen? Originalteksten går tapt.")) return;
    const { error } = await supabase.from("sms_inbox" as never).delete().eq("id" as never, id as never);
    if (error) { toast.error(error.message); return; }
    if (innboksId === id) setInnboksId(null);
    qc.invalidateQueries({ queryKey: ["sms-innboks"] });
  };

  const merkHandtert = async (id: string, tenderId: string | null) => {
    await supabase
      .from("sms_inbox" as never)
      .update({ status: tenderId ? "handtert" : "ignorert", tender_id: tenderId } as never)
      .eq("id" as never, id as never);
    qc.invalidateQueries({ queryKey: ["sms-innboks"] });
  };

  // Tolkes mens du limer inn, så du ser med én gang om noe ble misforstått
  const tolk = (t: string) => {
    setTekst(t);
    const r = parseAnbudsprotokoll(t);
    if (r.title) setTittel(r.title);
    setBud(r.bids);
    setUtenPris(r.disqualified);
    setManueltOss(null);
    if (r.ignored.length) {
      toast.warning(`${r.ignored.length} linje(r) ble ikke forstått og er utelatt`);
    }
  };

  const egetBud = useMemo(
    () => (manueltOss !== null ? bud[manueltOss] : finnEgetBud(bud, appSettings?.company_name)),
    [bud, appSettings, manueltOss],
  );

  const lagre = async () => {
    if (!tittel.trim()) { toast.error("Anbudet mangler navn"); return; }
    if (bud.length < 2) { toast.error("Lim inn en protokoll med minst to bud"); return; }
    setLagrer(true);
    try {
      const { data, error } = await supabase
        .from("tenders" as never)
        .insert({
          tenant_id: tenantId, title: tittel.trim(), opened_on: dato || null,
          project_id: projectId === "__none" ? null : projectId,
          offer_id: offerId === "__none" ? null : offerId, source_text: tekst,
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
      // Kom teksten fra innboksen, er den nå behandlet
      if (innboksId) { await merkHandtert(innboksId, tenderId); setInnboksId(null); }
      setTekst(""); setTittel(""); setBud([]); setProjectId("__none"); setOfferId("__none");
      qc.invalidateQueries({ queryKey: ["anbud"] });
    } finally {
      setLagrer(false);
    }
  };

  // ─── Masseimport ────────────────────────────────────────────────────────
  // Hele SMS-tråden limes inn på én gang og deles opp automatisk. Datoen kan
  // ikke leses ut av teksten, så den settes per rad — eller står tom.
  const [masseApen, setMasseApen] = useState(false);
  const [massetekst, setMassetekst] = useState("");
  const [masse, setMasse] = useState<
    Array<{ tekst: string; tittel: string; dato: string; bids: ParsedBid[]; egetIdx: number; valgt: boolean }>
  >([]);

  const tolkMasse = (t: string) => {
    setMassetekst(t);
    const deler = splittProtokoller(t);
    setMasse(deler.map((tekst) => {
      const r = parseAnbudsprotokoll(tekst);
      const eget = finnEgetBud(r.bids, appSettings?.company_name);
      return {
        tekst, tittel: r.title, dato: "", bids: r.bids,
        egetIdx: eget ? r.bids.indexOf(eget) : -1,
        valgt: true,
      };
    }));
  };

  const importerAlle = async () => {
    const valgte = masse.filter((m) => m.valgt && m.tittel.trim() && m.bids.length >= 2);
    if (!valgte.length) return;
    setLagrer(true);
    let ok = 0;
    try {
      for (const m of valgte) {
        const { data, error } = await supabase
          .from("tenders" as never)
          .insert({
            tenant_id: tenantId, title: m.tittel.trim(),
            opened_on: m.dato || null, source_text: m.tekst,
          } as never)
          .select("id").single();
        if (error) { toast.error(`${m.tittel}: ${error.message}`); continue; }

        const rader = m.bids.map((b, i) => ({
          tenant_id: tenantId, tender_id: (data as any).id,
          company: b.company, amount: b.amount,
          is_us: i === m.egetIdx, sort_order: i,
        }));
        const ins = await supabase.from("tender_bids" as never).insert(rader as never);
        if (ins.error) { toast.error(`${m.tittel}: ${ins.error.message}`); continue; }
        ok++;
      }
      toast.success(`${ok} av ${valgte.length} anbud importert`);
      if (ok) { setMassetekst(""); setMasse([]); qc.invalidateQueries({ queryKey: ["anbud"] }); }
    } finally {
      setLagrer(false);
    }
  };

  // Redigering av et lagret anbud. Prosjektkoblingen er den som oftest må
  // endres i ettertid — prosjektet finnes gjerne ikke ennå når protokollen kommer.
  const [redigerer, setRedigerer] = useState<string | null>(null);
  const [redTittel, setRedTittel] = useState("");
  const [redDato, setRedDato] = useState("");
  const [redProsjekt, setRedProsjekt] = useState("__none");
  const [redTilbud, setRedTilbud] = useState("__none");
  const [redBud, setRedBud] = useState<Array<{ company: string; amount: number; is_us: boolean }>>([]);

  const startRediger = (a: any) => {
    setRedigerer(a.id);
    setRedTittel(a.title ?? "");
    setRedDato(a.opened_on ?? "");
    setRedProsjekt(a.project_id ?? "__none");
    setRedTilbud(a.offer_id ?? "__none");
    setRedBud(
      [...(a.tender_bids ?? [])]
        .sort((x: any, y: any) => Number(x.amount) - Number(y.amount))
        .map((b: any) => ({ company: b.company, amount: Number(b.amount), is_us: !!b.is_us })),
    );
  };

  const lagreRediger = async () => {
    if (!redigerer) return;
    if (!redTittel.trim()) { toast.error("Anbudet mangler navn"); return; }
    setLagrer(true);
    try {
      const { error } = await supabase
        .from("tenders" as never)
        .update({
          title: redTittel.trim(),
          opened_on: redDato || null,
          project_id: redProsjekt === "__none" ? null : redProsjekt,
          offer_id: redTilbud === "__none" ? null : redTilbud,
        } as never)
        .eq("id" as never, redigerer as never);
      if (error) { toast.error(error.message); return; }

      // Budene byttes ut samlet. Enklere og tryggere enn å spore hvilke rader
      // som er endret, og antallet er lite.
      const d = await supabase.from("tender_bids" as never).delete().eq("tender_id" as never, redigerer as never);
      if (d.error) { toast.error(d.error.message); return; }

      const rader = redBud
        .filter((b) => b.company.trim())
        .sort((x, y) => x.amount - y.amount)
        .map((b, i) => ({
          tenant_id: tenantId, tender_id: redigerer,
          company: b.company.trim(), amount: b.amount, is_us: b.is_us, sort_order: i,
        }));
      const ins = await supabase.from("tender_bids" as never).insert(rader as never);
      if (ins.error) { toast.error(ins.error.message); return; }

      toast.success("Anbudet er oppdatert");
      setRedigerer(null);
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

  // Analyse på tvers av alle anbud der vårt eget bud er kjent.
  //
  // Prosent er viktigere enn kroner her: 200 000 over på en jobb til 20
  // millioner er en helt annen bom enn 200 000 over på en til 500 000.
  const stats = useMemo(() => {
    const med = (anbud ?? [])
      .filter((a) => (a.tender_bids ?? []).some((b: any) => b.is_us))
      .map((a) => {
        const sortert = [...(a.tender_bids ?? [])].sort((x: any, y: any) => Number(x.amount) - Number(y.amount));
        const vaart = Number(sortert.find((b: any) => b.is_us)!.amount);
        const vinner = Number(sortert[0].amount);
        const hoyeste = Number(sortert[sortert.length - 1].amount);
        const plass = sortert.findIndex((b: any) => b.is_us) + 1;
        const vant = plass === 1;
        // Når vi vinner: hvor mye kunne vi tatt uten å tape jobben?
        const nestBest = sortert.length > 1 ? Number(sortert[1].amount) : null;
        return {
          a, sortert, vaart, vinner, hoyeste, plass, vant, antall: sortert.length,
          overVinnerPst: vinner > 0 ? ((vaart - vinner) / vinner) * 100 : 0,
          pengerPaBordetPst: vant && nestBest ? ((nestBest - vaart) / vaart) * 100 : null,
          pengerPaBordetKr: vant && nestBest ? nestBest - vaart : null,
          spreadPst: vinner > 0 ? ((hoyeste - vinner) / vinner) * 100 : 0,
          dato: a.opened_on ?? null,
        };
      });

    const tap = med.filter((m) => !m.vant);
    const seier = med.filter((m) => m.vant);
    const snitt = (t: number[]) => (t.length ? t.reduce((s, x) => s + x, 0) / t.length : 0);

    // Per konkurrent: hvem møter vi, og hvem slår oss
    const motstandere = new Map<string, { moter: number; slattOss: number; sumPstMotOss: number }>();
    for (const m of med) {
      for (const b of m.sortert) {
        if (b.is_us) continue;
        const navn = String(b.company).trim();
        const rad = motstandere.get(navn) ?? { moter: 0, slattOss: 0, sumPstMotOss: 0 };
        rad.moter++;
        if (Number(b.amount) < m.vaart) rad.slattOss++;
        // Positiv verdi = de lå over oss
        rad.sumPstMotOss += m.vaart > 0 ? ((Number(b.amount) - m.vaart) / m.vaart) * 100 : 0;
        motstandere.set(navn, rad);
      }
    }
    const konkurrenter = [...motstandere.entries()]
      .map(([navn, r]) => ({ navn, ...r, snittPst: r.sumPstMotOss / r.moter }))
      .sort((x, y) => y.moter - x.moter);

    return {
      med,
      totalt: med.length,
      vunnet: seier.length,
      treffrate: med.length ? (seier.length / med.length) * 100 : 0,
      snittOverVinnerPst: snitt(tap.map((m) => m.overVinnerPst)),
      snittOverVinnerKr: snitt(tap.map((m) => m.vaart - m.vinner)),
      snittPaBordetPst: snitt(seier.filter((m) => m.pengerPaBordetPst !== null).map((m) => m.pengerPaBordetPst!)),
      snittPaBordetKr: snitt(seier.filter((m) => m.pengerPaBordetKr !== null).map((m) => m.pengerPaBordetKr!)),
      snittPlass: snitt(med.map((m) => m.plass)),
      snittAntall: snitt(med.map((m) => m.antall)),
      snittSpread: snitt(med.map((m) => m.spreadPst)),
      konkurrenter,
      // Nesten-tap: under 3 % bak vinneren er jobber som kunne vært vunnet
      naerTap: tap.filter((m) => m.overVinnerPst <= 3).length,
    };
  }, [anbud]);

  const pst = (n: number) => `${n.toFixed(1).replace(".", ",")} %`;

  const innsikt = useMemo(
    () => lagInnsikt((anbud ?? []).map((a: any) => ({
      title: a.title,
      opened_on: a.opened_on,
      bids: (a.tender_bids ?? []).map((b: any) => ({
        company: b.company, amount: Number(b.amount), is_us: !!b.is_us,
      })),
    }))),
    [anbud],
  );

  // Utvikling over tid: ligger vi nærmere vinneren nå enn før?
  const utvikling = useMemo(
    () => [...stats.med]
      .filter((m) => m.dato)
      .sort((x, y) => String(x.dato).localeCompare(String(y.dato)))
      .map((m) => ({
        navn: m.a.title.length > 18 ? m.a.title.slice(0, 18) + "…" : m.a.title,
        dato: m.dato,
        overVinner: Number(m.overVinnerPst.toFixed(1)),
      })),
    [stats],
  );

  // Hvordan de andre priser seg, målt mot vårt bud på samme jobb
  const konkurrentGraf = useMemo(
    () => stats.konkurrenter
      .filter((k) => k.moter >= 2)
      .slice(0, 10)
      .map((k) => ({ navn: k.navn.length > 16 ? k.navn.slice(0, 16) + "…" : k.navn, pst: Number(k.snittPst.toFixed(1)) })),
    [stats],
  );

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
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border bg-card p-5 shadow-sm">
              <p className="text-sm text-muted-foreground">Treffrate</p>
              <p className="mt-1 text-2xl font-bold">{pst(stats.treffrate)}</p>
              <p className="mt-1 text-xs text-muted-foreground">{stats.vunnet} av {stats.totalt} anbud</p>
            </div>
            <div className="rounded-xl border bg-card p-5 shadow-sm">
              <p className="text-sm text-muted-foreground">Over vinner når vi taper</p>
              <p className="mt-1 text-2xl font-bold text-red-700 dark:text-red-400">{pst(stats.snittOverVinnerPst)}</p>
              <p className="mt-1 text-xs text-muted-foreground">i snitt {nok(stats.snittOverVinnerKr)}</p>
            </div>
            <div className="rounded-xl border bg-card p-5 shadow-sm">
              <p className="text-sm text-muted-foreground">Igjen på bordet når vi vinner</p>
              <p className="mt-1 text-2xl font-bold text-amber-700 dark:text-amber-400">{pst(stats.snittPaBordetPst)}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                kunne tatt {nok(stats.snittPaBordetKr)} mer og fortsatt vunnet
              </p>
            </div>
            <div className="rounded-xl border bg-card p-5 shadow-sm">
              <p className="text-sm text-muted-foreground">Snittplassering</p>
              <p className="mt-1 text-2xl font-bold">
                {stats.snittPlass.toFixed(1).replace(".", ",")}
                <span className="text-base font-normal text-muted-foreground">
                  {" "}av {stats.snittAntall.toFixed(1).replace(".", ",")}
                </span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                spredning i anbudene: {pst(stats.snittSpread)}
              </p>
            </div>
          </div>

          {stats.naerTap > 0 && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-5 py-3 text-sm">
              <strong>{stats.naerTap}</strong> av de tapte anbudene lå under 3 % bak vinneren.
              Det er jobber som kunne vært vunnet på små justeringer.
            </div>
          )}

          {innsikt.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Hva tallene forteller
              </h2>
              {innsikt.map((i, ix) => {
                const stil = i.alvor === "advarsel"
                  ? "border-amber-500/40 bg-amber-500/10"
                  : i.alvor === "bra"
                    ? "border-green-600/40 bg-green-600/10"
                    : "border-border bg-card";
                const Ikon = i.alvor === "advarsel" ? AlertTriangle : i.alvor === "bra" ? Trophy : Lightbulb;
                return (
                  <div key={ix} className={`flex gap-3 rounded-xl border p-4 ${stil}`}>
                    <Ikon className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-semibold">
                        {i.tittel}
                        {i.anbud && <span className="ml-2 text-xs font-normal text-muted-foreground">{i.anbud}</span>}
                      </p>
                      <p className="mt-0.5 text-sm text-muted-foreground">{i.tekst}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {(utvikling.length >= 2 || konkurrentGraf.length > 0) && (
            <div className="grid gap-4 lg:grid-cols-2">
              {utvikling.length >= 2 && (
                <div className="rounded-xl border bg-card p-5 shadow-sm">
                  <h3 className="mb-1 text-sm font-semibold">Avstand til vinneren over tid</h3>
                  <p className="mb-3 text-xs text-muted-foreground">
                    0 % betyr at vi vant. Faller kurven, nærmer vi oss.
                  </p>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={utvikling} margin={{ top: 5, right: 10, bottom: 5, left: -10 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="navn" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={50} />
                      <YAxis tick={{ fontSize: 11 }} unit=" %" />
                      <Tooltip formatter={(v: any) => [`${v} % over vinner`, ""]} />
                      <Line type="monotone" dataKey="overVinner" stroke="#dc2626" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}

              {konkurrentGraf.length > 0 && (
                <div className="rounded-xl border bg-card p-5 shadow-sm">
                  <h3 className="mb-1 text-sm font-semibold">Hvordan de andre priser seg</h3>
                  <p className="mb-3 text-xs text-muted-foreground">
                    Snitt i prosent mot vårt bud på samme jobb. Negativt = billigere enn oss.
                  </p>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={konkurrentGraf} margin={{ top: 5, right: 10, bottom: 5, left: -10 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="navn" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={50} />
                      <YAxis tick={{ fontSize: 11 }} unit=" %" />
                      <Tooltip formatter={(v: any) => [`${v} % mot oss`, ""]} />
                      <Bar dataKey="pst">
                        {konkurrentGraf.map((k, i) => (
                          <Cell key={i} fill={k.pst < 0 ? "#dc2626" : "#16a34a"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}

          {stats.konkurrenter.length > 0 && (
            <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Konkurrent</th>
                    <th className="px-4 py-3 text-right">Møter</th>
                    <th className="px-4 py-3 text-right">Slo oss</th>
                    <th className="px-4 py-3 text-right">Snitt mot oss</th>
                    <th className="px-4 py-3">Hvor de ligger</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.konkurrenter.map((k) => {
                    const billigere = k.snittPst < 0;
                    return (
                      <tr key={k.navn} className="border-b last:border-0">
                        <td className="px-4 py-2.5 font-medium">{k.navn}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{k.moter}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          {k.slattOss}
                          <span className="ml-1 text-xs text-muted-foreground">
                            ({Math.round((k.slattOss / k.moter) * 100)} %)
                          </span>
                        </td>
                        <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${billigere ? "text-red-700 dark:text-red-400" : "text-green-700 dark:text-green-400"}`}>
                          {billigere ? "" : "+"}{k.snittPst.toFixed(1).replace(".", ",")} %
                        </td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">
                          {billigere ? "ligger under oss" : "ligger over oss"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="border-t px-4 py-2 text-xs text-muted-foreground">
                «Snitt mot oss» er hvor mye konkurrenten i snitt ligger over eller under vårt eget
                bud. Negative tall betyr at de jevnt over er billigere enn oss.
              </p>
            </div>
          )}
        </>
      )}

      {/* Videresendt fra mobilen — venter på at noen ser over tolkingen */}
      {((innboks ?? []).length > 0 || visAlle) && (
        <div className="rounded-xl border border-primary/40 bg-primary/5 p-5 shadow-sm">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Inbox className="h-4 w-4" />
            {visAlle
              ? `${(innboks ?? []).length} melding${((innboks ?? []).length) === 1 ? "" : "er"} fra mobilen`
              : `${(innboks ?? []).length} ny${(innboks ?? []).length === 1 ? "" : "e"} melding${(innboks ?? []).length === 1 ? "" : "er"} fra mobilen`}
            <button
              onClick={() => setVisAlle(!visAlle)}
              className="ml-auto text-xs font-normal text-muted-foreground underline hover:text-foreground"
            >
              {visAlle ? "Vis bare nye" : "Vis også behandlede"}
            </button>
          </h2>
          <div className="space-y-2">
            {(innboks ?? []).map((m: any) => (
              <div key={m.id} className="flex items-start gap-3 rounded-lg border bg-card px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{m.body.split("\n")[0]}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(m.received_at).toLocaleString("nb-NO")}
                    {m.sender ? ` · ${m.sender}` : ""} · {m.body.split("\n").length} linjer
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => { setInnboksId(m.id); tolk(m.body); }}>
                  Se over
                </Button>
                {m.status === "ny" && (
                  <Button size="sm" variant="ghost" onClick={() => void merkHandtert(m.id, null)} title="Ikke en anbudsprotokoll — skjul den">
                    Skjul
                  </Button>
                )}
                <button
                  onClick={() => void slettMelding(m.id)}
                  title="Slett meldingen permanent"
                  className="p-1 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Masseimport: lim inn hele SMS-tråden på én gang */}
      <div className="rounded-xl border bg-card p-5 shadow-sm">
        <button
          onClick={() => setMasseApen(!masseApen)}
          className="flex w-full items-center gap-2 text-sm font-semibold"
        >
          <Layers className="h-4 w-4" />
          Importer mange på én gang
          <span className="ml-auto text-xs font-normal text-muted-foreground">
            {masseApen ? "Skjul" : "Lim inn hele meldingstråden"}
          </span>
        </button>

        {masseApen && (
          <div className="mt-4 space-y-3">
            <p className="text-xs text-muted-foreground">
              Marker alle meldingene i telefonen, kopier, og lim inn her. Systemet deler dem
              opp selv — datolinjer og annet fra meldingsappen blir ignorert.
            </p>
            <Textarea
              rows={6}
              value={massetekst}
              onChange={(e) => tolkMasse(e.target.value)}
              placeholder={"tirsdag 17. feb. • 16:56\nAnbudsprotokoll Eksempelveien\nEntreprenør A AS 1.250.000,-\nEntreprenør B AS 1.480.000,-\n…"}
              className="font-mono text-xs"
            />

            {masse.length > 0 && (
              <>
                <div className="rounded-lg border divide-y">
                  {masse.map((m, i) => (
                    <div key={i} className="flex items-center gap-3 px-3 py-2 text-sm">
                      <input
                        type="checkbox"
                        checked={m.valgt}
                        onChange={() => setMasse(masse.map((x, ix) => ix === i ? { ...x, valgt: !x.valgt } : x))}
                        className="h-4 w-4 accent-primary"
                      />
                      <Input
                        value={m.tittel}
                        onChange={(e) => setMasse(masse.map((x, ix) => ix === i ? { ...x, tittel: e.target.value } : x))}
                        className="h-8 flex-1"
                      />
                      <Input
                        type="date"
                        value={m.dato}
                        onChange={(e) => setMasse(masse.map((x, ix) => ix === i ? { ...x, dato: e.target.value } : x))}
                        className="h-8 w-40"
                      />
                      <span className="w-28 text-right text-xs text-muted-foreground">
                        {m.bids.length} bud
                        {m.egetIdx >= 0 ? ` · plass ${m.egetIdx + 1}` : " · ukjent"}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    {masse.filter((m) => m.valgt).length} av {masse.length} valgt.
                    {masse.some((m) => m.egetIdx < 0) &&
                      " Noen mangler vårt eget bud — de kan rettes etterpå med blyantikonet."}
                  </p>
                  <Button onClick={importerAlle} disabled={lagrer || !masse.some((m) => m.valgt)}>
                    <Save className="mr-2 h-4 w-4" />
                    {lagrer ? "Importerer…" : `Importer ${masse.filter((m) => m.valgt).length}`}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Innliming */}
      <div className="rounded-xl border bg-card p-5 shadow-sm space-y-4">
        <div className="space-y-2">
          <Label>Lim inn SMS-en fra anbudsåpningen</Label>
          <Textarea
            rows={6}
            value={tekst}
            onChange={(e) => tolk(e.target.value)}
            placeholder={"Anbudsprotokoll Eksempelveien :\nEntreprenør A AS 1.250.000\nEntreprenør B AS 1.480.000\nEntreprenør C AS 1.610.000"}
            className="font-mono text-sm"
          />
        </div>

        {bud.length > 0 && (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-2">
                <Label>Navn på anbudet</Label>
                <Input value={tittel} onChange={(e) => setTittel(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Åpnet</Label>
                <Input type="date" value={dato} onChange={(e) => setDato(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Tilbud</Label>
                <Select value={offerId} onValueChange={setOfferId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">— Ikke knyttet —</SelectItem>
                    {(tilbud ?? []).map((o: any) => (
                      <SelectItem key={o.id} value={o.id}>
                        #{o.offer_number} {o.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                    <button
                      type="button"
                      onClick={() => setManueltOss(oss ? null : i)}
                      title={oss ? "Fjern markeringen" : "Marker som vårt bud"}
                      className={oss
                        ? "rounded bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary"
                        : "rounded px-2 py-0.5 text-xs font-semibold text-muted-foreground/40 transition-colors hover:text-foreground"}
                    >
                      Oss
                    </button>
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
                    {a.offers ? ` · tilbud #${a.offers.offer_number}` : ""}
                    {a.projects?.name ? ` · ${a.projects.name}` : ""}
                    {vaart && !vant ? ` · ${nok(Number(vaart.amount) - Number(sortert[0].amount))} over vinneren` : ""}
                  </p>
                </div>
                <div className="flex flex-shrink-0 items-center gap-1">
                  <button
                    onClick={() => (redigerer === a.id ? setRedigerer(null) : startRediger(a))}
                    title="Rediger anbudet"
                    className="p-1 text-muted-foreground hover:text-primary"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button onClick={() => void slett(a.id)} title="Slett anbudet" className="p-1 text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {redigerer === a.id && (
                <div className="space-y-3 border-b bg-muted/30 px-5 py-4">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Navn</Label>
                      <Input value={redTittel} onChange={(e) => setRedTittel(e.target.value)} className="h-9" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Åpnet</Label>
                      <Input type="date" value={redDato} onChange={(e) => setRedDato(e.target.value)} className="h-9" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Tilbud</Label>
                      <Select value={redTilbud} onValueChange={setRedTilbud}>
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none">— Ikke knyttet —</SelectItem>
                          {(tilbud ?? []).map((o: any) => (
                            <SelectItem key={o.id} value={o.id}>#{o.offer_number} {o.title}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Prosjekt</Label>
                      <Select value={redProsjekt} onValueChange={setRedProsjekt}>
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
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

                  <div className="rounded-lg border divide-y bg-card">
                    {redBud.map((b, i) => (
                      <div key={i} className="flex items-center gap-2 px-3 py-1.5">
                        <Input
                          value={b.company}
                          onChange={(e) => setRedBud(redBud.map((x, ix) => ix === i ? { ...x, company: e.target.value } : x))}
                          className="h-8 flex-1"
                        />
                        <Input
                          type="number"
                          value={b.amount}
                          onChange={(e) => setRedBud(redBud.map((x, ix) => ix === i ? { ...x, amount: Number(e.target.value) } : x))}
                          className="h-8 w-36 text-right no-spinner"
                        />
                        <button
                          type="button"
                          onClick={() => setRedBud(redBud.map((x, ix) => ({ ...x, is_us: ix === i ? !x.is_us : false })))}
                          title="Marker som vårt bud"
                          className={b.is_us
                            ? "rounded bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary"
                            : "rounded px-2 py-0.5 text-xs font-semibold text-muted-foreground/40 hover:text-foreground"}
                        >
                          Oss
                        </button>
                        <button
                          type="button"
                          onClick={() => setRedBud(redBud.filter((_, ix) => ix !== i))}
                          title="Fjern budet"
                          className="p-1 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => setRedBud([...redBud, { company: "", amount: 0, is_us: false }])}>
                      Legg til bud
                    </Button>
                    <div className="flex-1" />
                    <Button size="sm" variant="ghost" onClick={() => setRedigerer(null)}>Avbryt</Button>
                    <Button size="sm" onClick={lagreRediger} disabled={lagrer}>
                      <Save className="mr-1.5 h-3.5 w-3.5" />{lagrer ? "Lagrer…" : "Lagre"}
                    </Button>
                  </div>
                </div>
              )}
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
