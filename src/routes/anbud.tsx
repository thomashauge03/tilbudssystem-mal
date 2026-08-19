import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
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
import { lagDuell, konkurrentliste } from "@/lib/anbud-duell";
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
  // Linjer tolkeren ikke fikk noe ut av. De vises under budene, ellers har
  // brukeren ingen måte å se hvilke linjer som mangler.
  const [ignorerte, setIgnorerte] = useState<string[]>([]);
  const [q, setQ] = useState("");
  /** Hvilken konkurrent én-mot-én-grafen viser. Tomt = den mest møtte. */
  const [valgtKonkurrent, setValgtKonkurrent] = useState("");

  const { data: projects } = useQuery({
    queryKey: ["projects-simple", tenantId],
    enabled: !!tenantId,
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

  // Tenanten er med i nøkkelen slik at ingenting fra forrige innlogging blir
  // stående igjen i cachen når noen andre logger på samme maskin.
  const { data: anbud, isLoading, isError, error } = useQuery({
    queryKey: ["anbud", tenantId],
    enabled: !!tenantId,
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
    queryKey: ["sms-innboks", tenantId, visAlle],
    enabled: !!tenantId,
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

  // Radene er endret for hånd etter at teksten ble tolket. Da kan de ikke
  // bygges på nytt uten å spørre først.
  const [budRettet, setBudRettet] = useState(false);
  const sistTolket = useRef("");

  // Tolkes mens du limer inn, så du ser med én gang om noe ble misforstått
  const tolk = (t: string) => {
    setTekst(t);
    sistTolket.current = t;
    const r = parseAnbudsprotokoll(t);
    if (r.title) setTittel(r.title);
    setBud(r.bids);
    setUtenPris(r.disqualified);
    setIgnorerte(r.ignored);
    setManueltOss(null);
    setBudRettet(false);
    if (r.ignored.length) {
      toast.warning(`${r.ignored.length} linje(r) ble ikke forstått og er utelatt`);
    }
  };

  // Teksten tolkes på nytt ved innliming og når du forlater feltet, ikke på
  // hvert tastetrykk: ellers ble en manuell retting i radene bygget bort mens
  // du skrev, og varselet om uforståtte linjer kom én gang per tegn.
  const tolkPaNytt = (t: string) => {
    if (t === sistTolket.current) { setTekst(t); return; }
    if (budRettet && !window.confirm(
      "Budene under er rettet for hånd. Tolkes teksten på nytt, går rettelsene tapt. Fortsette?",
    )) {
      setTekst(t);
      sistTolket.current = t;
      return;
    }
    tolk(t);
  };

  const egetBud = useMemo(
    () => (manueltOss !== null ? bud[manueltOss] : finnEgetBud(bud, appSettings?.company_name)),
    [bud, appSettings, manueltOss],
  );

  // Et bud på 0 kr er alltid en glipp — feltet ble tømt, og Number("") er 0.
  // Lagres det, sorteres nullbudet først og blir «vinneren»: anbudet regnes som
  // tapt, avstanden til vinneren blir 0 %, og statistikken på toppen blir feil.
  const ufullstendige = (rader: Array<{ company: string; amount: number }>) =>
    rader.filter((b) => !b.company.trim() || !(b.amount > 0));

  const lagre = async () => {
    if (!tittel.trim()) { toast.error("Anbudet mangler navn"); return; }
    if (bud.length < 2) { toast.error("Lim inn en protokoll med minst to bud"); return; }
    const mangler = ufullstendige(bud);
    if (mangler.length) {
      toast.error(`${mangler.length} bud mangler firmanavn eller beløp — fyll dem inn før du lagrer`);
      return;
    }
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
      setUtenPris([]); setIgnorerte([]); setBudRettet(false); sistTolket.current = "";
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
    Array<{
      tekst: string; tittel: string; dato: string; bids: ParsedBid[]; egetIdx: number; valgt: boolean;
      ignorerte: string[]; utenPris: Array<{ company: string; note: string }>;
    }>
  >([]);
  // Hvilken rad som er slått ut for å vise hva tolkeren ikke fikk med seg
  const [masseDetalj, setMasseDetalj] = useState<number | null>(null);
  const [masseRettet, setMasseRettet] = useState(false);
  const sistTolketMasse = useRef("");

  const tolkMasse = (t: string) => {
    setMassetekst(t);
    sistTolketMasse.current = t;
    const deler = splittProtokoller(t);
    setMasse(deler.map((tekst) => {
      const r = parseAnbudsprotokoll(tekst);
      const eget = finnEgetBud(r.bids, appSettings?.company_name);
      return {
        tekst, tittel: r.title, dato: "", bids: r.bids,
        egetIdx: eget ? r.bids.indexOf(eget) : -1,
        valgt: true, ignorerte: r.ignored, utenPris: r.disqualified,
      };
    }));
    setMasseDetalj(null);
    setMasseRettet(false);
  };

  // Samme grunn som for enkeltinnlimingen, og verre her: datoen kan ikke leses
  // ut av teksten, så den er alltid satt for hånd og ville forsvunnet på det
  // første tastetrykket i tekstfeltet over.
  const tolkMassePaNytt = (t: string) => {
    if (t === sistTolketMasse.current) { setMassetekst(t); return; }
    if (masseRettet && !window.confirm(
      "Radene under er rettet for hånd. Tolkes teksten på nytt, går titler og datoer tapt. Fortsette?",
    )) {
      setMassetekst(t);
      sistTolketMasse.current = t;
      return;
    }
    tolkMasse(t);
  };

  const rettMasse = (i: number, endring: Partial<(typeof masse)[number]>) => {
    setMasse(masse.map((x, ix) => (ix === i ? { ...x, ...endring } : x)));
    setMasseRettet(true);
  };

  // Titler som allerede er lagret. Den samme tråden limes ofte inn på nytt
  // etter en delvis import, og et duplikat teller som et eget møte i
  // konkurransetabellen — altså feil tall, ikke bare en dobbel rad.
  const lagredeTitler = useMemo(
    () => new Set((anbud ?? []).map((a: any) => String(a.title ?? "").trim().toLowerCase())),
    [anbud],
  );
  const finnesFraFor = (t: string) => !!t.trim() && lagredeTitler.has(t.trim().toLowerCase());

  const importerAlle = async () => {
    const valgte = masse.filter((m) => m.valgt && m.tittel.trim() && m.bids.length >= 2);
    if (!valgte.length) return;

    const duplikater = valgte.filter((m) => finnesFraFor(m.tittel));
    if (duplikater.length && !window.confirm(
      `${duplikater.length} av protokollene finnes fra før:\n\n${duplikater.map((m) => `• ${m.tittel}`).join("\n")}\n\n` +
      `Importerer du dem nå, blir de liggende dobbelt og teller dobbelt i statistikken. Fortsette likevel?`,
    )) return;

    setLagrer(true);
    let ok = 0;
    const feilet = new Set<(typeof masse)[number]>();
    try {
      for (const m of valgte) {
        const { data, error } = await supabase
          .from("tenders" as never)
          .insert({
            tenant_id: tenantId, title: m.tittel.trim(),
            opened_on: m.dato || null, source_text: m.tekst,
          } as never)
          .select("id").single();
        if (error) { toast.error(`${m.tittel}: ${error.message}`); feilet.add(m); continue; }

        const rader = m.bids.map((b, i) => ({
          tenant_id: tenantId, tender_id: (data as any).id,
          company: b.company, amount: b.amount,
          is_us: i === m.egetIdx, sort_order: i,
        }));
        const ins = await supabase.from("tender_bids" as never).insert(rader as never);
        if (ins.error) {
          toast.error(`${m.tittel}: ${ins.error.message}`);
          // Anbudsraden er alt skrevet. Uten bud er den et tomt skall som verken
          // viser noe eller teller i statistikken, så den ryddes bort igjen —
          // ellers ligger den i veien når raden importeres på nytt.
          await supabase.from("tenders" as never).delete().eq("id" as never, (data as any).id as never);
          feilet.add(m);
          continue;
        }
        ok++;
      }
      toast.success(`${ok} av ${valgte.length} anbud importert`);
      // Bare de som gikk gjennom fjernes fra lista. Ble noe liggende igjen,
      // beholdes råteksten også — ellers måtte hele tråden limes inn på nytt,
      // og de som alt er importert ville kommet inn en gang til.
      const igjen = masse.filter((m) => !valgte.includes(m) || feilet.has(m));
      setMasse(igjen);
      setMasseDetalj(null);
      if (!igjen.length) { setMassetekst(""); sistTolketMasse.current = ""; }
      if (ok) qc.invalidateQueries({ queryKey: ["anbud"] });
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
    // En rad som verken har navn eller beløp er «Legg til bud» som aldri ble
    // fylt ut. Er bare det ene feltet utfylt, er rettingen halvferdig — og et
    // bud uten beløp eller uten navn ødelegger regnestykket for hele anbudet.
    const utfylte = redBud.filter((b) => b.company.trim() || b.amount > 0);
    const mangler = ufullstendige(utfylte);
    if (mangler.length) {
      toast.error(`${mangler.length} bud mangler firmanavn eller beløp — fyll dem inn før du lagrer`);
      return;
    }
    if (!utfylte.length) { toast.error("Anbudet må ha minst ett bud"); return; }
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
      // som er endret, og antallet er lite. Rekkefølgen er viktig: de nye
      // radene settes inn FØR de gamle slettes. Feiler innsettingen — nettbrudd,
      // RLS, et beløp som sprenger numeric(14,2) — står de gamle budene igjen.
      // Motsatt vei ville anbudet stått igjen uten et eneste bud, uten noen vei
      // tilbake: det finnes ingen historikk for tender_bids.
      const gamle = await supabase
        .from("tender_bids" as never)
        .select("id")
        .eq("tender_id" as never, redigerer as never);
      if (gamle.error) { toast.error(gamle.error.message); return; }

      const rader = utfylte
        .slice()
        .sort((x, y) => x.amount - y.amount)
        .map((b, i) => ({
          tenant_id: tenantId, tender_id: redigerer,
          company: b.company.trim(), amount: b.amount, is_us: b.is_us, sort_order: i,
        }));
      const ins = await supabase.from("tender_bids" as never).insert(rader as never);
      if (ins.error) { toast.error(ins.error.message); return; }

      const gamleIder = ((gamle.data ?? []) as any[]).map((r) => r.id);
      const d = gamleIder.length
        ? await supabase.from("tender_bids" as never).delete().in("id" as never, gamleIder as never)
        : { error: null };
      // Blir de gamle radene stående, ligger budene dobbelt. Det er synlig og
      // kan ryddes opp for hånd, til forskjell fra bud som er slettet for godt.
      if (d.error) toast.error(`Budene ble lagret, men de gamle ble stående: ${d.error.message}`);
      else toast.success("Anbudet er oppdatert");

      setRedigerer(null);
      qc.invalidateQueries({ queryKey: ["anbud"] });
    } finally {
      setLagrer(false);
    }
  };

  const slett = async (id: string) => {
    if (!window.confirm("Slette denne anbudsprotokollen?")) return;
    // Budene følger med av seg selv: tender_bids.tender_id har on delete
    // cascade. Å slette dem først ville bare skapt et vindu der anbudet blir
    // stående igjen tomt om slettingen under feiler.
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

  // Én konkurrent om gangen. Snittet i tabellen under skjuler om forspranget
  // svinger fra jobb til jobb, og det er nettopp svingningen som er nyttig.
  const forAnalyse = useMemo(
    () => (anbud ?? []).map((a: any) => ({
      title: a.title,
      opened_on: a.opened_on,
      bids: (a.tender_bids ?? []).map((b: any) => ({
        company: b.company, amount: Number(b.amount), is_us: !!b.is_us,
      })),
    })),
    [anbud],
  );

  const konkurrentValg = useMemo(() => konkurrentliste(forAnalyse), [forAnalyse]);

  const duell = useMemo(() => {
    const navn = valgtKonkurrent || konkurrentValg[0]?.navn;
    return navn ? lagDuell(forAnalyse, navn) : null;
  }, [forAnalyse, valgtKonkurrent, konkurrentValg]);

  const duellGraf = useMemo(
    () => (duell?.punkter ?? []).map((p) => ({
      navn: p.anbud.length > 16 ? p.anbud.slice(0, 16) + "…" : p.anbud,
      full: p.anbud,
      pst: Number(p.diffPst.toFixed(1)),
      diffKr: p.diffKr,
      vaart: p.vaart,
      deres: p.deres,
    })),
    [duell],
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

          {/* Én mot én. Grafen leses som en tidslinje: står stolpene over null
              hele veien, ligger vi jevnt under dem — svinger de fram og
              tilbake, er det jobbtypen og ikke prisnivået som avgjør. */}
          {konkurrentValg.length > 0 && (
            <div className="rounded-xl border bg-card p-5 shadow-sm">
              <div className="mb-1 flex flex-wrap items-center gap-3">
                <h3 className="text-sm font-semibold">Hvordan vi har priset oss mot</h3>
                <Select
                  value={valgtKonkurrent || konkurrentValg[0].navn}
                  onValueChange={setValgtKonkurrent}
                >
                  <SelectTrigger className="h-8 w-full max-w-xs sm:w-64">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {konkurrentValg.map((k) => (
                      <SelectItem key={k.navn} value={k.navn}>
                        {k.navn} ({k.moter} møte{k.moter === 1 ? "" : "r"})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {!duell || duell.moter === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  Vi har ikke levert pris på noen av de samme jobbene som dem ennå.
                </p>
              ) : (
                <>
                  <p className="mb-3 text-xs text-muted-foreground">
                    Hver stolpe er ett anbud, eldst til venstre. Over null betyr at de lå over oss.
                  </p>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={duellGraf} margin={{ top: 5, right: 10, bottom: 5, left: -10 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="navn" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={60} />
                      <YAxis tick={{ fontSize: 11 }} unit=" %" />
                      <Tooltip
                        formatter={(v: any, _n, p: any) => [
                          `${v} % — ${nok(Math.abs(p.payload.diffKr))} ${p.payload.diffKr >= 0 ? "over" : "under"} oss`,
                          "",
                        ]}
                        labelFormatter={(_l, p: any) => p?.[0]?.payload?.full ?? ""}
                      />
                      <Bar dataKey="pst">
                        {duellGraf.map((d, i) => (
                          <Cell key={i} fill={d.pst < 0 ? "#dc2626" : "#16a34a"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>

                  <div className="mt-4 grid gap-3 border-t pt-4 text-sm sm:grid-cols-4">
                    <div>
                      <p className="text-xs text-muted-foreground">Møtt</p>
                      <p className="font-semibold tabular-nums">
                        {duell.moter} gang{duell.moter === 1 ? "" : "er"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Vi lå lavest</p>
                      <p className="font-semibold tabular-nums">
                        {duell.viLavest} av {duell.moter}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Median mot oss</p>
                      <p className={`font-semibold tabular-nums ${duell.medianPst < 0 ? "text-red-700 dark:text-red-400" : "text-green-700 dark:text-green-400"}`}>
                        {duell.medianPst >= 0 ? "+" : ""}{duell.medianPst.toFixed(1).replace(".", ",")} %
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Spenn</p>
                      <p className="font-semibold tabular-nums">
                        {duell.minPst.toFixed(0)} % … {duell.maksPst >= 0 ? "+" : ""}{duell.maksPst.toFixed(0)} %
                      </p>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    Medianen brukes ved siden av snittet fordi ett skjevt anbud ellers drar
                    tallet langt av gårde. Er spennet stort, priser de ulikt fra jobb til jobb —
                    da er det verdt å se på hvilke typer jobber de går lavt på.
                  </p>
                </>
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

      {/* Videresendt fra mobilen — venter på at noen ser over tolkingen.
          Boksen vises også når lista er tom: vekslebryteren er eneste vei inn
          til de behandlede meldingene, og forsvinner den, er arkivet stengt til
          det tilfeldigvis kommer en ny SMS. */}
      <div className={(innboks ?? []).length > 0
        ? "rounded-xl border border-primary/40 bg-primary/5 p-5 shadow-sm"
        : "rounded-xl border bg-card p-5 shadow-sm"}>
        <h2 className="flex items-center gap-2 text-sm font-semibold">
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
        {(innboks ?? []).length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">
            {visAlle
              ? "Ingen meldinger er videresendt hit ennå."
              : "Ingen nye. Behandlede meldinger ligger fortsatt lagret — hent dem fram med lenken over."}
          </p>
        ) : (
          <div className="mt-3 space-y-2">
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
        )}
      </div>

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
              // Samme som over: innliming tolkes med én gang, skriving venter
              // til du forlater feltet.
              onChange={(e) => {
                const ny = e.target.value;
                if (Math.abs(ny.length - massetekst.length) > 1) tolkMassePaNytt(ny);
                else setMassetekst(ny);
              }}
              onBlur={(e) => tolkMassePaNytt(e.target.value)}
              placeholder={"tirsdag 17. feb. • 16:56\nAnbudsprotokoll Eksempelveien\nEntreprenør A AS 1.250.000,-\nEntreprenør B AS 1.480.000,-\n…"}
              className="font-mono text-xs"
            />

            {masse.length > 0 && (
              <>
                <div className="rounded-lg border divide-y">
                  {masse.map((m, i) => {
                    const uklart = m.ignorerte.length + m.utenPris.length;
                    const finnes = finnesFraFor(m.tittel);
                    return (
                      <div key={i} className="px-3 py-2 text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            type="checkbox"
                            checked={m.valgt}
                            onChange={() => setMasse(masse.map((x, ix) => ix === i ? { ...x, valgt: !x.valgt } : x))}
                            className="h-4 w-4 shrink-0 accent-primary"
                          />
                          <Input
                            value={m.tittel}
                            onChange={(e) => rettMasse(i, { tittel: e.target.value })}
                            className="h-8 min-w-0 flex-1 basis-40"
                          />
                          <div className="flex min-w-0 flex-1 basis-56 items-center gap-2">
                            <Input
                              type="date"
                              value={m.dato}
                              onChange={(e) => rettMasse(i, { dato: e.target.value })}
                              className="h-8 min-w-0 flex-1 sm:w-40 sm:flex-none"
                            />
                            <span className="shrink-0 text-right text-xs text-muted-foreground">
                              {m.bids.length} bud
                              {m.egetIdx >= 0 ? ` · plass ${m.egetIdx + 1}` : " · ukjent"}
                            </span>
                          </div>
                        </div>
                        {(uklart > 0 || finnes) && (
                          <div className="mt-1 flex flex-wrap items-center gap-3 pl-6 text-xs">
                            {uklart > 0 && (
                              <button
                                type="button"
                                onClick={() => setMasseDetalj(masseDetalj === i ? null : i)}
                                className="flex items-center gap-1 text-amber-700 underline dark:text-amber-400"
                              >
                                <AlertTriangle className="h-3 w-3" />
                                {uklart} linje(r) kom ikke med
                              </button>
                            )}
                            {finnes && (
                              <span className="text-amber-700 dark:text-amber-400">
                                Et anbud med samme navn finnes fra før
                              </span>
                            )}
                          </div>
                        )}
                        {masseDetalj === i && uklart > 0 && (
                          <div className="mt-2 space-y-1 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 pl-3 text-xs">
                            {m.utenPris.map((u, ix) => (
                              <p key={`u${ix}`}>
                                <span className="font-medium">{u.company}</span> — {u.note} (uten pris, lagres ikke)
                              </p>
                            ))}
                            {m.ignorerte.map((l, ix) => (
                              <p key={`i${ix}`} className="break-words font-mono">{l}</p>
                            ))}
                            <p className="text-muted-foreground">
                              Rett linjene i teksten over om de skulle vært med som bud.
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">
                    {masse.filter((m) => m.valgt).length} av {masse.length} valgt.
                    {masse.some((m) => m.egetIdx < 0) &&
                      " Noen mangler vårt eget bud — de kan rettes etterpå med blyantikonet."}
                  </p>
                  <Button onClick={importerAlle} disabled={lagrer || !tenantId || !masse.some((m) => m.valgt)}>
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
            // Ett tegn om gangen er skriving; hopper teksten flere tegn, er den
            // limt inn — og da tolkes den med én gang, som før. Skriving venter
            // til du forlater feltet, slik at en retting i budradene ikke
            // bygges bort på det neste tastetrykket.
            onChange={(e) => {
              const ny = e.target.value;
              if (Math.abs(ny.length - tekst.length) > 1) tolkPaNytt(ny);
              else setTekst(ny);
            }}
            onBlur={(e) => tolkPaNytt(e.target.value)}
            placeholder={"Anbudsprotokoll Eksempelveien :\nEntreprenør A AS 1.250.000\nEntreprenør B AS 1.480.000\nEntreprenør C AS 1.610.000"}
            className="font-mono text-sm"
          />
        </div>

        {/* Det tolkeren ikke fikk noe ut av. Uten dette er eneste spor en toast
            som forsvinner — og en avvist tilbyder ser ut som om firmaet aldri
            var med i konkurransen. */}
        {(utenPris.length > 0 || ignorerte.length > 0) && (
          <div className="space-y-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            {utenPris.length > 0 && (
              <div>
                <p className="flex items-center gap-1.5 font-medium">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Med i konkurransen, men uten pris
                </p>
                <ul className="mt-1 space-y-0.5 text-xs">
                  {utenPris.map((u, i) => (
                    <li key={i}><span className="font-medium">{u.company}</span> — {u.note}</li>
                  ))}
                </ul>
                <p className="mt-1 text-xs text-muted-foreground">
                  De lagres ikke sammen med budene og teller ikke i statistikken — et bud
                  uten beløp kan ikke rangeres.
                </p>
              </div>
            )}
            {ignorerte.length > 0 && (
              <div>
                <p className="flex items-center gap-1.5 font-medium">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {ignorerte.length} linje(r) ble ikke forstått
                </p>
                <ul className="mt-1 space-y-0.5 break-words font-mono text-xs">
                  {ignorerte.map((l, i) => <li key={i}>{l}</li>)}
                </ul>
                <p className="mt-1 font-sans text-xs text-muted-foreground">
                  Rett dem i teksten over om de skulle vært med som bud.
                </p>
              </div>
            )}
          </div>
        )}

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
                  <div key={i} className={`flex flex-wrap items-center gap-2 px-3 py-2 text-sm sm:gap-3 ${oss ? "bg-primary/5" : ""}`}>
                    <span className="w-6 shrink-0 text-muted-foreground tabular-nums">{i + 1}.</span>
                    <Input
                      value={b.company}
                      onChange={(e) => { setBudRettet(true); setBud(bud.map((x, ix) => ix === i ? { ...x, company: e.target.value } : x)); }}
                      className="h-8 min-w-0 flex-1 basis-40"
                    />
                    {/* Feltene brekker ned på egen linje på telefon. Uten
                        min-w-0 kan de ikke krympe, og beløp og «Oss» havner
                        utenfor skjermkanten — der de ikke er til å nå, siden
                        siden ikke kan scrolles sidelengs. */}
                    <div className="flex min-w-0 flex-1 basis-56 items-center gap-2 sm:gap-3">
                      <Input
                        type="number"
                        value={b.amount || ""}
                        placeholder="0"
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => { setBudRettet(true); setBud(bud.map((x, ix) => ix === i ? { ...x, amount: Number(e.target.value) } : x)); }}
                        className="h-8 min-w-0 flex-1 text-right no-spinner sm:w-40 sm:flex-none"
                      />
                      <span className="w-24 shrink-0 text-right text-xs text-muted-foreground tabular-nums sm:w-32">
                        {i === 0 ? "laveste" : `+${nok(diff)}`}
                      </span>
                      <button
                        type="button"
                        onClick={() => { setBudRettet(true); setManueltOss(oss ? null : i); }}
                        title={oss ? "Fjern markeringen" : "Marker som vårt bud"}
                        className={oss
                          ? "shrink-0 rounded bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary"
                          : "shrink-0 rounded px-2 py-0.5 text-xs font-semibold text-muted-foreground/40 transition-colors hover:text-foreground"}
                      >
                        Oss
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
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
                      <div key={i} className="flex flex-wrap items-center gap-2 px-3 py-1.5">
                        <Input
                          value={b.company}
                          onChange={(e) => setRedBud(redBud.map((x, ix) => ix === i ? { ...x, company: e.target.value } : x))}
                          className="h-8 min-w-0 flex-1 basis-40"
                        />
                        <div className="flex min-w-0 flex-1 basis-52 items-center gap-2">
                          <Input
                            type="number"
                            value={b.amount || ""}
                            placeholder="0"
                            onFocus={(e) => e.target.select()}
                            onChange={(e) => setRedBud(redBud.map((x, ix) => ix === i ? { ...x, amount: Number(e.target.value) } : x))}
                            className="h-8 min-w-0 flex-1 text-right no-spinner sm:w-36 sm:flex-none"
                          />
                          <button
                            type="button"
                            onClick={() => setRedBud(redBud.map((x, ix) => ({ ...x, is_us: ix === i ? !x.is_us : false })))}
                            title="Marker som vårt bud"
                            className={b.is_us
                              ? "shrink-0 rounded bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary"
                              : "shrink-0 rounded px-2 py-0.5 text-xs font-semibold text-muted-foreground/40 hover:text-foreground"}
                          >
                            Oss
                          </button>
                          <button
                            type="button"
                            onClick={() => setRedBud(redBud.filter((_, ix) => ix !== i))}
                            title="Fjern budet"
                            className="shrink-0 p-1 text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => setRedBud([...redBud, { company: "", amount: 0, is_us: false }])}>
                      Legg til bud
                    </Button>
                    <div className="flex-1" />
                    <Button size="sm" variant="ghost" onClick={() => setRedigerer(null)}>Avbryt</Button>
                    {/* Uten tenantId feiler innsettingen på not-null/RLS — samme
                        vakt som på Lagre protokoll over. */}
                    <Button size="sm" onClick={lagreRediger} disabled={lagrer || !tenantId}>
                      <Save className="mr-1.5 h-3.5 w-3.5" />{lagrer ? "Lagrer…" : "Lagre"}
                    </Button>
                  </div>
                </div>
              )}
              <div className="divide-y">
                {sortert.map((b: any, i: number) => (
                  <div key={i} className={`flex flex-wrap items-center gap-x-3 gap-y-0.5 px-5 py-2 text-sm ${b.is_us ? "bg-primary/5 font-medium" : ""}`}>
                    <span className="w-6 shrink-0 text-muted-foreground tabular-nums">{i + 1}.</span>
                    <span className="min-w-0 flex-1">{b.company}</span>
                    <span className="shrink-0 tabular-nums">{nok(Number(b.amount))}</span>
                    {i > 0 && (
                      <span className="ml-auto w-24 shrink-0 text-right text-xs text-muted-foreground tabular-nums sm:w-32">
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
