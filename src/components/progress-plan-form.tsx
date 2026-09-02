import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Plus, Trash2, Save, FileDown, ArrowLeft, GripVertical, ArrowUp, ArrowDown, Diamond,
  FileText, LayoutList, Copy, CalendarRange, Paperclip, Printer,
} from "lucide-react";
import { toISODate, fmtDate, OFFER_WON_STATUSES } from "@/lib/format";
import { lagTidsakse, planPeriode, ukeTekst, varighetDager, FARGER, finnFarge, parseDato, tilDato, mandagI, isoUke } from "@/lib/fremdrift";
import { FremdriftRutenett } from "@/components/fremdrift-rutenett";
import { openProgressPlanPdf } from "@/lib/pdf-fremdrift";
import { lagFremdriftsplanPdf, fremdriftsplanFilnavn } from "@/lib/pdf-fremdrift-fil";
import { useAppSettings } from "@/hooks/use-app-settings";
import { useAuth } from "@/hooks/use-auth";

interface Aktivitet {
  id?: string;
  sort_order: number;
  name: string;
  responsible: string;
  category: string;
  color: string;
  start_date: string;
  end_date: string;
  is_milestone: boolean;
  notes: string;
}

/**
 * Utgangspunktet for en ny plan.
 *
 * Et tomt ark er ofte riktig — små jobber har ikke tjue aktiviteter, og da er en
 * ferdig mal bare noe man må slette seg gjennom. Malen er til de store jobbene,
 * og kopieringen til dem som ligner på noe man har gjort før.
 */
const MAL: Array<Partial<Aktivitet>> = [
  { name: "Kontraktsignering", is_milestone: true, color: "rod", category: "Milepæl" },
  { name: "Rigg og drift", responsible: "Egen", category: "Rigg", color: "graa" },
  { name: "Oppmåling og stikking", responsible: "Landmåler", category: "Grunnarbeid", color: "turkis" },
  { name: "Graving", responsible: "Egen", category: "Grunnarbeid", color: "oransje" },
  { name: "Sprengning", responsible: "UE", category: "Grunnarbeid", color: "oransje" },
  { name: "VA-ledning", responsible: "Egen", category: "Rør/VA", color: "bla" },
  { name: "Kummer og sluk", responsible: "Egen", category: "Rør/VA", color: "bla" },
  { name: "Kabelgrøft", responsible: "UE elektro", category: "Elektro", color: "gul" },
  { name: "Gjenfylling og komprimering", responsible: "Egen", category: "Grunnarbeid", color: "oransje" },
  { name: "Bærelag", responsible: "Egen", category: "Vei", color: "lilla" },
  { name: "Asfaltering", responsible: "UE asfalt", category: "Vei", color: "lilla" },
  { name: "Sluttdokumentasjon", responsible: "Egen", category: "Avslutning", color: "gronn" },
  { name: "Overtakelse", is_milestone: true, color: "rod", category: "Milepæl" },
];

interface PlanState {
  id?: string;
  title: string;
  offer_id: string | null;
  project_id: string | null;
  revision: string;
  plan_date: string;
  /** Tidsaksens ytterpunkter. Settes før aktivitetene, så det finnes en
   *  kalender å tegne i — aktivitetene kan ikke definere aksen de skal inn i. */
  start_date: string;
  end_date: string;
  notes: string;
}

const tomPlan = (): PlanState => ({
  title: "", offer_id: null, project_id: null,
  revision: "", plan_date: toISODate(new Date()),
  start_date: "", end_date: "", notes: "",
});

/** Mandagen i uken datoen ligger i — aksen starter alltid på en mandag. */
const mandagISO = (iso: string): string => {
  const d = parseDato(iso);
  if (!d) return iso;
  return tilDato(mandagI(d));
};

/** Søndagen n uker etter start, altså siste dag i perioden. */
const sluttEtterUker = (startISO: string, uker: number): string => {
  const d = parseDato(mandagISO(startISO));
  if (!d) return "";
  return tilDato(new Date(d.getTime() + (Math.max(1, uker) * 7 - 1) * 86400000));
};

const tomAktivitet = (sort: number, over: Partial<Aktivitet> = {}): Aktivitet => ({
  sort_order: sort, name: "", responsible: "", category: "", color: "graa",
  start_date: "", end_date: "", is_milestone: false, notes: "", ...over,
});

/**
 * «Hvor lenge varer jobben?»
 *
 * Varighet i uker framfor en sluttdato: det er slik man tenker om en jobb — «vi
 * har seks uker på oss» — og det fjerner en hel klasse feil der sluttdatoen
 * havner før startdatoen.
 */
function PeriodeSteg({
  start, uker, kanAvbryte, onAvbryt, onSett,
}: {
  start: string;
  uker: number;
  kanAvbryte: boolean;
  onAvbryt: () => void;
  onSett: (start: string, uker: number) => void;
}) {
  const [dato, setDato] = useState(start || toISODate(new Date()));
  const [antall, setAntall] = useState(uker || 12);
  const slutt = sluttEtterUker(dato, antall);

  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <h2 className="text-sm font-semibold">Hvor lenge varer jobben?</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Dette blir kalenderen du plasserer aktivitetene i. Du kan endre den etterpå.
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="per-start">Oppstart</Label>
          <Input
            id="per-start"
            type="date"
            className="w-44"
            value={dato}
            onChange={(e) => setDato(e.target.value)}
          />
          {/* Aksen starter alltid på en mandag, så det sies her framfor å flytte
              datoen bak ryggen på brukeren. */}
          <p className="text-xs text-muted-foreground">
            {parseDato(dato) ? `Starter ${ukeTekst(dato)}, fra mandag` : "Velg en dato"}
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="per-uker">Varighet</Label>
          <div className="flex items-center gap-2">
            <Input
              id="per-uker"
              type="number"
              min={1}
              max={260}
              className="w-24"
              value={antall || ""}
              onChange={(e) => setAntall(Math.max(1, Math.min(260, Number(e.target.value) || 1)))}
            />
            <span className="text-sm text-muted-foreground">uker</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {[4, 8, 12, 16, 26, 52].map((u) => (
            <Button
              key={u}
              size="sm"
              variant={antall === u ? "default" : "outline"}
              onClick={() => setAntall(u)}
            >
              {u} uker
            </Button>
          ))}
        </div>
      </div>

      {slutt && (
        <p className="mt-4 text-sm">
          <span className="text-muted-foreground">Perioden blir </span>
          <span className="font-medium tabular-nums">
            {ukeTekst(dato)} – {ukeTekst(slutt)}
          </span>
          <span className="text-muted-foreground"> · siste dag {fmtDate(slutt)}</span>
        </p>
      )}

      <div className="mt-4 flex gap-2">
        <Button onClick={() => onSett(dato, antall)} disabled={!parseDato(dato)}>
          <CalendarRange className="mr-2 h-4 w-4" />
          {kanAvbryte ? "Oppdater perioden" : "Lag kalenderen"}
        </Button>
        {kanAvbryte && <Button variant="outline" onClick={onAvbryt}>Avbryt</Button>}
      </div>
    </div>
  );
}

export function ProgressPlanForm({ planId, initialOfferId }: { planId?: string; initialOfferId?: string }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isEdit = !!planId;
  const { tenantId } = useAuth();
  const { data: appSettings } = useAppSettings();

  const [plan, setPlan] = useState<PlanState>(() => tomPlan());
  const [akt, setAkt] = useState<Aktivitet[]>([]);
  const [init, setInit] = useState(false);
  const [lagrer, setLagrer] = useState(false);
  const lagrerRef = useRef(false);
  const currentIdRef = useRef<string | undefined>(planId);
  // Utkastet skal bare skrives når brukeren faktisk har endret noe — ellers
  // ruller et gammelt øyeblikksbilde tilbake det som ble lagret i mellomtiden.
  const brukerHarEndretRef = useRef(false);
  const DRAFT_KEY = `plan-draft-${planId ?? "new"}${initialOfferId ? `-${initialOfferId}` : ""}`;
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [kopierApen, setKopierApen] = useState(false);

  // Tidligere planer, til «Kopier tidligere». Aktivitetene hentes med, slik at
  // kopieringen ikke krever et nytt kall når valget er tatt.
  const { data: tidligere } = useQuery({
    queryKey: ["progress-plans-mal", tenantId],
    enabled: !!tenantId && !isEdit,
    queryFn: async () => {
      const { data } = await supabase
        .from("progress_plans")
        .select("id, title, progress_plan_activities(name, responsible, category, color, is_milestone, sort_order)")
        .order("created_at", { ascending: false })
        .limit(25);
      return data ?? [];
    },
  });

  const kopierFra = (planId: string) => {
    const kilde = (tidligere ?? []).find((p: any) => p.id === planId);
    if (!kilde) return;
    const rader = [...((kilde as any).progress_plan_activities ?? [])]
      .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    if (!rader.length) { toast.error("Den planen har ingen aktiviteter"); return; }
    brukerHarEndretRef.current = true;
    // Datoene blir med vilje ikke kopiert. De gjaldt et annet prosjekt, og en
    // plan med gamle datoer som ser ferdig ut er farligere enn en som er tom.
    setAkt(rader.map((r: any, i: number) => tomAktivitet(i, {
      name: r.name ?? "",
      responsible: r.responsible ?? "",
      category: r.category ?? "",
      color: r.color ?? "graa",
      is_milestone: !!r.is_milestone,
    })));
    setKopierApen(false);
    toast.success(`${rader.length} aktiviteter kopiert — fyll inn datoene`);
  };

  const { data: lastet } = useQuery({
    queryKey: ["progress-plan", planId],
    enabled: isEdit,
    queryFn: async () => {
      const [p, a] = await Promise.all([
        supabase.from("progress_plans").select("*").eq("id", planId!).single(),
        supabase.from("progress_plan_activities").select("*").eq("plan_id", planId!).order("sort_order"),
      ]);
      if (p.error) throw p.error;
      return { plan: p.data as any, akt: (a.data ?? []) as any[] };
    },
  });

  const { data: offers } = useQuery({
    queryKey: ["offers-for-plan", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase
        .from("offers")
        .select("id, offer_number, title, customer_name, project_number, project_id, status")
        .eq("tenant_id", tenantId!)
        .order("offer_number", { ascending: false })
        .limit(300);
      return data ?? [];
    },
  });

  useEffect(() => {
    if (init) return;

    if (!isEdit) {
      const lagret = sessionStorage.getItem(DRAFT_KEY);
      if (lagret) {
        try {
          const { plan: p, akt: a } = JSON.parse(lagret);
          setPlan(p); setAkt(a ?? []); setInit(true);
          return;
        } catch { sessionStorage.removeItem(DRAFT_KEY); }
      }
      const fra = (offers ?? []).find((o: any) => o.id === initialOfferId);
      setPlan({
        ...tomPlan(),
        offer_id: initialOfferId ?? null,
        project_id: fra?.project_id ?? null,
        title: fra?.title ?? "",
      });
      // Ingen rader ennå — brukeren velger selv utgangspunkt først.
      setAkt([]);
      setInit(true);
      return;
    }

    if (lastet) {
      const p = lastet.plan;
      const lagret = sessionStorage.getItem(DRAFT_KEY);
      if (lagret) {
        try {
          const { plan: sp, akt: sa } = JSON.parse(lagret);
          setPlan(sp); setAkt(sa ?? []); setInit(true);
          return;
        } catch { sessionStorage.removeItem(DRAFT_KEY); }
      }
      setPlan({
        id: p.id,
        title: p.title ?? "",
        offer_id: p.offer_id ?? null,
        project_id: p.project_id ?? null,
        revision: p.revision ?? "",
        start_date: p.start_date ?? "",
        end_date: p.end_date ?? "",
        plan_date: p.plan_date ?? toISODate(new Date()),
        notes: p.notes ?? "",
      });
      setAkt(lastet.akt.map((a: any, i: number) => ({
        id: a.id,
        sort_order: a.sort_order ?? i,
        name: a.name ?? "",
        responsible: a.responsible ?? "",
        category: a.category ?? "",
        color: a.color ?? "graa",
        start_date: a.start_date ?? "",
        end_date: a.end_date ?? "",
        is_milestone: !!a.is_milestone,
        notes: a.notes ?? "",
      })));
      setInit(true);
    }
  }, [isEdit, lastet, init, initialOfferId, offers, DRAFT_KEY]);

  useEffect(() => {
    if (!init || !brukerHarEndretRef.current) return;
    if (!isEdit && currentIdRef.current) return;
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ plan, akt }));
  }, [plan, akt, init, isEdit, DRAFT_KEY]);

  const settPlan = <K extends keyof PlanState>(k: K, v: PlanState[K]) => {
    brukerHarEndretRef.current = true;
    setPlan((p) => ({ ...p, [k]: v }));
  };
  const settAkt = (i: number, patch: Partial<Aktivitet>) => {
    brukerHarEndretRef.current = true;
    setAkt((p) => p.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));
  };
  const nyRad = () => {
    brukerHarEndretRef.current = true;
    setAkt((p) => [...p, tomAktivitet(p.length)]);
  };
  const slettRad = (i: number) => {
    brukerHarEndretRef.current = true;
    setAkt((p) => p.filter((_, idx) => idx !== i).map((a, idx) => ({ ...a, sort_order: idx })));
  };
  const flyttRad = (fra: number, til: number) => {
    if (til < 0 || til >= akt.length || fra === til) return;
    brukerHarEndretRef.current = true;
    setAkt((p) => {
      const kopi = [...p];
      const [ut] = kopi.splice(fra, 1);
      kopi.splice(til, 0, ut);
      return kopi.map((a, idx) => ({ ...a, sort_order: idx }));
    });
  };

  const valgtTilbud = (offers ?? []).find((o: any) => o.id === plan.offer_id);

  // Forhåndsvisning: samme regnestykke som PDF-en bruker
  const gyldige = akt.filter((a) => a.start_date && a.name.trim());

  // Aksen kommer fra planens egen periode. Uten den ville det ikke finnes noen
  // kalender før første aktivitet var lagt inn — og det er nettopp kalenderen
  // man legger aktivitetene inn i. Eldre planer uten periode faller tilbake på
  // aktivitetene sine, så de fortsatt kan åpnes.
  const harPeriode = !!(plan.start_date && plan.end_date);
  const periode = useMemo(
    () => (harPeriode
      ? { start: plan.start_date, slutt: plan.end_date }
      : planPeriode(gyldige)),
    [harPeriode, plan.start_date, plan.end_date, akt],
  );
  const akse = useMemo(
    () => (periode ? lagTidsakse(periode.start, periode.slutt) : null),
    [periode],
  );
  const [aktivRad, setAktivRad] = useState<number | null>(null);
  const [periodeApen, setPeriodeApen] = useState(false);

  const settPeriode = (startISO: string, uker: number) => {
    brukerHarEndretRef.current = true;
    const start = mandagISO(startISO);
    setPlan((p) => ({ ...p, start_date: start, end_date: sluttEtterUker(start, uker) }));
    setPeriodeApen(false);
  };

  const ukerIPerioden = harPeriode && akse ? akse.kolonner.length : 12;

  const velgTilbud = (id: string) => {
    if (id === "__none") { settPlan("offer_id", null); return; }
    const o = (offers ?? []).find((x: any) => x.id === id);
    brukerHarEndretRef.current = true;
    setPlan((p) => ({
      ...p,
      offer_id: id,
      project_id: o?.project_id ?? p.project_id,
      title: p.title.trim() ? p.title : (o?.title ?? ""),
    }));
  };

  const lagre = async (): Promise<string | null> => {
    if (lagrerRef.current) return null;
    if (!plan.title.trim()) { toast.error("Planen må ha en tittel"); return null; }
    if (!tenantId) { toast.error("Ingen tilknyttet firma"); return null; }

    // En aktivitet uten navn er en tom rad man har glemt å fjerne; en uten
    // startdato kan ikke tegnes. Begge slippes forbi, men ikke i stillhet.
    const utenDato = akt.filter((a) => a.name.trim() && !a.start_date);
    if (utenDato.length) {
      const liste = utenDato.map((a) => `• ${a.name}`).join("\n");
      if (!window.confirm(
        `${utenDato.length} aktivitet(er) mangler startdato og blir ikke tegnet inn:\n\n${liste}\n\nLagre likevel?`,
      )) return null;
    }

    lagrerRef.current = true;
    setLagrer(true);
    try {
      const felt = {
        tenant_id: tenantId,
        title: plan.title.trim(),
        offer_id: plan.offer_id,
        project_id: plan.project_id,
        revision: plan.revision.trim(),
        start_date: plan.start_date || null,
        end_date: plan.end_date || null,
        plan_date: plan.plan_date || null,
        notes: plan.notes,
      };

      let id = currentIdRef.current ?? plan.id;
      if (id) {
        const { error } = await supabase.from("progress_plans").update(felt).eq("id", id);
        if (error) { toast.error(error.message); return null; }
      } else {
        const { data, error } = await supabase.from("progress_plans").insert(felt).select("id").single();
        if (error) { toast.error(error.message); return null; }
        id = (data as any).id;
        currentIdRef.current = id;
        setPlan((p) => ({ ...p, id }));
      }

      const { error: slettFeil } = await supabase
        .from("progress_plan_activities").delete().eq("plan_id", id!);
      // Uten denne sjekken ville radene blitt lagt inn på nytt oppå de gamle,
      // og planen fått hver aktivitet to ganger.
      if (slettFeil) { toast.error(slettFeil.message); return null; }

      const rader = akt
        .filter((a) => a.name.trim() || a.start_date)
        .map((a, i) => ({
          tenant_id: tenantId,
          plan_id: id,
          sort_order: i,
          name: a.name,
          responsible: a.responsible,
          category: a.category,
          color: a.color,
          start_date: a.start_date || null,
          end_date: a.end_date || a.start_date || null,
          is_milestone: a.is_milestone,
          notes: a.notes,
        }));
      if (rader.length) {
        const { error } = await supabase.from("progress_plan_activities").insert(rader);
        if (error) { toast.error(error.message); return null; }
      }

      sessionStorage.removeItem(DRAFT_KEY);
      brukerHarEndretRef.current = false;
      qc.invalidateQueries({ queryKey: ["progress-plans"] });
      qc.invalidateQueries({ queryKey: ["progress-plan", id] });
      return id!;
    } finally {
      lagrerRef.current = false;
      setLagrer(false);
    }
  };

  const lagreOgTilbake = async () => {
    const id = await lagre();
    if (!id) return;
    toast.success("Fremdriftsplan lagret");
    if (!isEdit) navigate({ to: "/fremdriftsplan/$id", params: { id } });
  };

  /** Feltene PDF-en trenger, samlet ett sted så fil og utskrift ikke kan sprike. */
  const pdfData = () => {
    const ref = (appSettings?.our_refs ?? [])[0];
    return {
      dok: {
        title: plan.title,
        revision: plan.revision,
        plan_date: plan.plan_date,
        notes: plan.notes,
        offer_number: valgtTilbud?.offer_number ?? null,
        offer_title: valgtTilbud?.title ?? null,
        project_ref: valgtTilbud?.project_number ?? null,
        customer_name: valgtTilbud?.customer_name ?? null,
      },
      rader: akt.filter((a) => a.name.trim() || a.start_date),
      innst: {
        company_name: appSettings?.company_name ?? "",
        company_tagline: (appSettings as any)?.company_tagline ?? "",
        company_org_nr: (appSettings as any)?.company_org_nr ?? "",
        logo_url: appSettings?.logo_url ?? "",
        ref_name: ref?.name ?? "",
        ref_phone: ref?.phone ?? "",
        ref_email: ref?.email ?? "",
      },
    };
  };

  /** Ekte PDF-fil, ikke utskriftsdialog — den kan lagres, sendes og legges ved. */
  const lastNedFil = async () => {
    if (!appSettings) { toast.error("Firmainnstillingene er ikke lastet ennå"); return; }
    const id = await lagre();
    if (!id) return;
    const { dok, rader, innst } = pdfData();
    const bytes = await lagFremdriftsplanPdf(dok, rader, innst);
    const blob = new Blob([bytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fremdriftsplanFilnavn(dok);
    a.click();
    // Uten dette holder nettleseren på filen i minnet så lenge fanen er åpen
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  /**
   * Legger planen som vedlegg på tilbudet, slik at den følger med når tilbudet
   * sendes. Skriver til samme bøtte og samme felt som vedleggsfeltet på
   * tilbudssiden, så den dukker opp der uten videre.
   */
  const leggVedPaaTilbud = async () => {
    if (!appSettings) { toast.error("Firmainnstillingene er ikke lastet ennå"); return; }
    if (!plan.offer_id) { toast.error("Knytt planen til et tilbud først"); return; }
    const id = await lagre();
    if (!id) return;

    setLagrer(true);
    try {
      const { dok, rader, innst } = pdfData();
      const bytes = await lagFremdriftsplanPdf(dok, rader, innst);
      const filnavn = fremdriftsplanFilnavn(dok);
      const sti = `${plan.offer_id}/${Date.now()}_${filnavn}`;

      const { error: oppFeil } = await supabase.storage
        .from("offer-attachments")
        .upload(sti, new Blob([bytes], { type: "application/pdf" }), {
          upsert: true, contentType: "application/pdf",
        });
      if (oppFeil) { toast.error(oppFeil.message); return; }

      const { data: url } = supabase.storage.from("offer-attachments").getPublicUrl(sti);

      // Kolonnen kan være jsonb eller text avhengig av hvor basen kommer fra.
      // Vi leser den, og skriver tilbake i samme form som vi fikk den — ellers
      // ville et tilbud med tekstkolonne fått en array den ikke kan lese.
      const { data: rad, error: lesFeil } = await supabase
        .from("offers").select("attachment_urls").eq("id", plan.offer_id).single();
      if (lesFeil) { toast.error(lesFeil.message); return; }

      const raa = (rad as any)?.attachment_urls;
      const varTekst = typeof raa === "string";
      let liste: Array<{ name: string; url: string }> = [];
      if (Array.isArray(raa)) liste = raa;
      else if (varTekst && raa.trim()) {
        try { const p = JSON.parse(raa); if (Array.isArray(p)) liste = p; } catch { liste = []; }
      }
      // Er planen lagt ved før, byttes den ut i stedet for å legges ved en gang
      // til — ellers samler det seg opp en utgave per revisjon.
      liste = liste.filter((v) => v.name !== filnavn);
      liste.push({ name: filnavn, url: url.publicUrl });

      const { error: skrivFeil } = await supabase
        .from("offers")
        .update({ attachment_urls: varTekst ? JSON.stringify(liste) : liste } as any)
        .eq("id", plan.offer_id);
      if (skrivFeil) { toast.error(skrivFeil.message); return; }

      qc.invalidateQueries({ queryKey: ["offer", plan.offer_id] });
      toast.success(`Lagt ved på tilbud #${valgtTilbud?.offer_number ?? ""}`);
    } finally {
      setLagrer(false);
    }
  };

  const lastNedPdf = async () => {
    if (!appSettings) { toast.error("Firmainnstillingene er ikke lastet ennå"); return; }
    // Vinduet må åpnes i selve klikket, ellers regner nettleseren det som en
    // popup og blokkerer det.
    const vindu = window.open("", "_blank", "width=1400,height=1000");
    if (!vindu) { toast.error("Nettleseren blokkerte PDF-vinduet. Tillat popup-vinduer og prøv igjen."); return; }
    const id = await lagre();
    if (!id) { vindu.close(); return; }
    const ref = (appSettings.our_refs ?? [])[0];
    openProgressPlanPdf(
      {
        title: plan.title,
        revision: plan.revision,
        plan_date: plan.plan_date,
        notes: plan.notes,
        offer_number: valgtTilbud?.offer_number ?? null,
        offer_title: valgtTilbud?.title ?? null,
        project_ref: valgtTilbud?.project_number ?? null,
        customer_name: valgtTilbud?.customer_name ?? null,
      },
      akt.filter((a) => a.name.trim() || a.start_date),
      {
        company_name: appSettings.company_name ?? "",
        company_tagline: (appSettings as any).company_tagline ?? "",
        company_org_nr: (appSettings as any).company_org_nr ?? "",
        logo_url: appSettings.logo_url ?? "",
        ref_name: ref?.name ?? "",
        ref_phone: ref?.phone ?? "",
        ref_email: ref?.email ?? "",
      },
      vindu,
    );
  };

  if (isEdit && !init) return <div className="text-muted-foreground">Laster…</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/fremdriftsplan"><ArrowLeft className="mr-1 h-4 w-4" />Tilbake</Link>
          </Button>
          <h1 className="text-2xl font-bold">
            {isEdit ? plan.title || "Fremdriftsplan" : "Ny fremdriftsplan"}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          {plan.offer_id && (
            <Button variant="outline" onClick={leggVedPaaTilbud} disabled={lagrer}>
              <Paperclip className="mr-2 h-4 w-4" />Legg ved på tilbudet
            </Button>
          )}
          <Button variant="outline" onClick={lastNedFil} disabled={lagrer}>
            <FileDown className="mr-2 h-4 w-4" />Last ned PDF
          </Button>
          <Button variant="outline" onClick={lastNedPdf} disabled={lagrer} title="Åpner utskriftsvindu">
            <Printer className="mr-2 h-4 w-4" />Skriv ut
          </Button>
          <Button onClick={lagreOgTilbake} disabled={lagrer}>
            <Save className="mr-2 h-4 w-4" />{lagrer ? "Lagrer…" : "Lagre"}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <div className="space-y-4 rounded-xl border bg-card p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Planinfo</h2>

          <div className="space-y-2">
            <Label>Tittel *</Label>
            <Input
              value={plan.title}
              onChange={(e) => settPlan("title", e.target.value)}
              placeholder="F.eks. «Fremdriftsplan VA Skardhei»"
            />
          </div>

          <div className="space-y-2">
            <Label>Knytt til tilbud</Label>
            <Select value={plan.offer_id ?? "__none"} onValueChange={velgTilbud}>
              <SelectTrigger><SelectValue placeholder="Velg tilbud…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">— Ikke knyttet —</SelectItem>
                {(offers ?? []).map((o: any) => (
                  <SelectItem key={o.id} value={o.id}>
                    #{o.offer_number} – {o.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {valgtTilbud && (
              <p className="text-xs text-muted-foreground">
                {valgtTilbud.customer_name || "Uten kunde"}
                {valgtTilbud.project_number ? ` · prosjekt ${valgtTilbud.project_number}` : ""}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Revisjon</Label>
              {/* Fremdriftsplaner sendes inn på nytt gjennom prosjektet, og
                  byggherren må se hvilken utgave han sitter med. */}
              <Input
                value={plan.revision}
                onChange={(e) => settPlan("revision", e.target.value)}
                placeholder="A"
              />
            </div>
            <div className="space-y-2">
              <Label>Plandato</Label>
              <Input type="date" value={plan.plan_date} onChange={(e) => settPlan("plan_date", e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Merknader</Label>
            <Textarea
              rows={4}
              value={plan.notes}
              onChange={(e) => settPlan("notes", e.target.value)}
              placeholder="Forutsetninger, vinterstans, avhengigheter…"
            />
          </div>

          {periode && (
            <div className="rounded-lg border bg-muted/40 p-3 text-sm">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Planen dekker</p>
              <p className="mt-1 font-medium tabular-nums">
                {ukeTekst(periode.start)} – {ukeTekst(periode.slutt)}
              </p>
              <p className="text-xs text-muted-foreground">
                {varighetDager(periode.start, periode.slutt)} dager · {gyldige.length} aktiviteter
                {akse?.type === "maaned" && " · vises som måneder i PDF-en"}
              </p>
            </div>
          )}
        </div>

        <div className="space-y-4">
          {/* Perioden først. Kalenderen kan ikke tegnes før den er satt, og en
              aktivitet uten kalender å ligge i er bare to datofelt igjen. */}
          {(!harPeriode || periodeApen) && (
            <PeriodeSteg
              start={plan.start_date}
              uker={ukerIPerioden}
              kanAvbryte={harPeriode}
              onAvbryt={() => setPeriodeApen(false)}
              onSett={settPeriode}
            />
          )}

          {harPeriode && !periodeApen && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border bg-muted/40 px-4 py-3 text-sm">
              <CalendarRange className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="font-medium tabular-nums">
                {ukeTekst(plan.start_date)} – {ukeTekst(plan.end_date)}
              </span>
              <span className="text-muted-foreground">
                {akse?.kolonner.length} {akse?.type === "uke" ? "uker" : "måneder"}
              </span>
              <Button size="sm" variant="outline" className="ml-auto" onClick={() => setPeriodeApen(true)}>
                Endre periode
              </Button>
            </div>
          )}

          {/* Utgangspunktet velges bare når planen er tom. Har man først lagt
              inn noe, ville en malknapp vært en felle: den ville lagt tretten
              rader oppå det man holdt på med. */}
          {harPeriode && !periodeApen && !akt.length && (
            <div className="rounded-xl border bg-card p-5 shadow-sm">
              <h2 className="text-sm font-semibold">Hvordan vil du begynne?</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Alt kan endres etterpå — malen er bare et utgangspunkt.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <button
                  type="button"
                  onClick={() => { brukerHarEndretRef.current = true; setAkt([tomAktivitet(0)]); }}
                  className="rounded-lg border p-4 text-left transition-colors hover:border-primary hover:bg-accent/40"
                >
                  <FileText className="mb-2 h-5 w-5 text-muted-foreground" />
                  <p className="font-medium">Blankt ark</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Én tom rad. Du fyller inn alt selv.
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    brukerHarEndretRef.current = true;
                    setAkt(MAL.map((m, i) => tomAktivitet(i, m)));
                  }}
                  className="rounded-lg border p-4 text-left transition-colors hover:border-primary hover:bg-accent/40"
                >
                  <LayoutList className="mb-2 h-5 w-5 text-muted-foreground" />
                  <p className="font-medium">Standard mal</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {MAL.length} vanlige aktiviteter med fag og farge. Uten datoer.
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setKopierApen(true)}
                  disabled={!(tidligere ?? []).length}
                  className="rounded-lg border p-4 text-left transition-colors hover:border-primary hover:bg-accent/40 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Copy className="mb-2 h-5 w-5 text-muted-foreground" />
                  <p className="font-medium">Kopier tidligere</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {(tidligere ?? []).length
                      ? "Hent aktivitetene fra en plan du har laget før."
                      : "Ingen tidligere planer ennå."}
                  </p>
                </button>
              </div>

              {kopierApen && (
                <div className="mt-4 space-y-2 border-t pt-4">
                  <Label>Hvilken plan?</Label>
                  <Select value="" onValueChange={kopierFra}>
                    <SelectTrigger><SelectValue placeholder="Velg plan…" /></SelectTrigger>
                    <SelectContent>
                      {(tidligere ?? []).map((p: any) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.title || "Uten tittel"} ({(p.progress_plan_activities ?? []).length} aktiviteter)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Navn, fag og farger kopieres. Datoene blir tomme — de gjelder det gamle prosjektet.
                  </p>
                </div>
              )}
            </div>
          )}

          <div className={akt.length ? "rounded-xl border bg-card p-5 shadow-sm" : "hidden"}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Aktiviteter</h2>
              <Button size="sm" variant="outline" onClick={nyRad}>
                <Plus className="mr-1 h-4 w-4" />Ny aktivitet
              </Button>
            </div>

            <div className="space-y-2">
              {akt.map((a, i) => (
                <div
                  key={i}
                  draggable
                  onDragStart={() => setDragIndex(i)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => { if (dragIndex !== null) flyttRad(dragIndex, i); setDragIndex(null); }}
                  className="rounded-lg border bg-background p-2"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground active:cursor-grabbing" />
                    <Input
                      className="min-w-0 flex-1 basis-52"
                      value={a.name}
                      placeholder="Aktivitet"
                      onChange={(e) => settAkt(i, { name: e.target.value })}
                    />
                    <Input
                      className="min-w-0 flex-1 basis-32"
                      value={a.responsible}
                      placeholder="Ansvarlig"
                      onChange={(e) => settAkt(i, { responsible: e.target.value })}
                    />
                    <Input
                      className="min-w-0 flex-1 basis-32"
                      value={a.category}
                      placeholder="Fag / fase"
                      onChange={(e) => settAkt(i, { category: e.target.value })}
                      list="plan-fag"
                    />
                    {/* Fargevelger. Faste farger framfor fritt valg, så samme fag
                        har samme farge på tvers av reviderte utgaver. */}
                    <div className="flex shrink-0 items-center gap-1">
                      {FARGER.map((f) => (
                        <button
                          key={f.key}
                          type="button"
                          title={f.navn}
                          aria-label={f.navn}
                          aria-pressed={a.color === f.key}
                          onClick={() => settAkt(i, { color: f.key })}
                          className={`h-5 w-5 rounded-md border transition-transform ${
                            a.color === f.key ? "scale-110 ring-2 ring-offset-1 ring-foreground/60" : "hover:scale-110"
                          }`}
                          style={{ background: f.fyll, borderColor: f.kant }}
                        />
                      ))}
                    </div>
                    {/* Datoene settes i kalenderen under, ikke her. To datofelt
                        per rad gjorde raden så trang at ingenting fikk plass. */}
                    <span className="shrink-0 whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                      {a.start_date
                        ? (a.is_milestone
                            ? ukeTekst(a.start_date)
                            : `${ukeTekst(a.start_date)}–${ukeTekst(a.end_date || a.start_date)}`)
                        : "ikke plassert"}
                    </span>
                    <label className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground">
                      <Checkbox
                        checked={a.is_milestone}
                        onCheckedChange={(v) => settAkt(i, { is_milestone: !!v, end_date: v ? "" : a.end_date })}
                      />
                      <Diamond className="h-3 w-3" />Milepæl
                    </label>
                    <div className="ml-auto flex shrink-0 items-center gap-0.5">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => flyttRad(i, i - 1)} disabled={i === 0}>
                        <ArrowUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => flyttRad(i, i + 1)} disabled={i === akt.length - 1}>
                        <ArrowDown className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => slettRad(i)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  </div>
                  {a.start_date && !a.is_milestone && (
                    <p className="mt-1 pl-6 text-xs text-muted-foreground tabular-nums">
                      {varighetDager(a.start_date, a.end_date || a.start_date)} dager
                    </p>
                  )}
                </div>
              ))}
              {!akt.length && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Ingen aktiviteter ennå.
                </p>
              )}
            </div>

            {/* Forslagene gjør at samme fag skrives likt hver gang — ellers blir
                «Rør/VA» og «Rør VA» to farger i tegnforklaringen. */}
            <datalist id="plan-fag">
              {[...new Set([...MAL.map((m) => m.category), ...akt.map((a) => a.category)])]
                .filter((c): c is string => !!c && !!c.trim())
                .map((c) => <option key={c} value={c} />)}
            </datalist>

            <div className="mt-3">
              <Button variant="outline" onClick={nyRad}><Plus className="mr-2 h-4 w-4" />Ny aktivitet</Button>
            </div>
          </div>

          {/* Kalenderen. Her plasseres aktivitetene ved å dra dem inn, i
              stedet for å taste to datoer per rad. Samme tidsakse som PDF-en. */}
          {akse && akt.length > 0 && (
            <div className="overflow-x-auto rounded-xl border bg-card p-5 shadow-sm">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Kalender
                </h2>
                <p className="text-xs text-muted-foreground">
                  Dra i rutenettet for å legge inn · dra boksen for å flytte · dra i endene for å endre lengde
                </p>
              </div>
              <div className="min-w-[680px]">
                <FremdriftRutenett
                  akse={akse}
                  aktiviteter={akt}
                  aktivRad={aktivRad}
                  onVelgRad={setAktivRad}
                  onEndre={(i, patch) => settAkt(i, patch)}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
