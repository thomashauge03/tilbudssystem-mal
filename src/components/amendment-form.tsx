import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Plus, Trash2, Save, FileDown, Mail, ArrowLeft, Link2, RotateCcw, CheckCircle2 } from "lucide-react";
import { nok, num, fmtDate, toISODate, OFFER_WON_STATUSES, UNITS as FALLBACK_UNITS } from "@/lib/format";
import { openPrintPdf, escapeHtml } from "@/lib/pdf";
import { useAppSettings } from "@/hooks/use-app-settings";
import { useAuth } from "@/hooks/use-auth";

interface ALine { id?: string; sort_order: number; description: string; quantity: number; unit: string; unit_price: number; }
interface AState {
  id?: string; amendment_number: string; offer_id: string | null; project_id: string | null; project_ref: string; internal_description: string;
  is_mass_settlement: boolean; is_additional_work: boolean; is_price_increase: boolean;
  notified_date: string; revised_date: string | null; project_manager: string; customer_email: string;
  change_description: string; reason: string; other_notes: string;
  // Livssyklus: 'krav' ved oppretting, 'endringsmelding' når kunden har signert.
  // Begge feltene ligger her slik at de overlever lagring og lasting av skjemaet.
  status?: string;
  customer_signed_at?: string | null;
}

function empty(): AState {
  return {
    amendment_number: "", offer_id: null, project_id: null, project_ref: "", internal_description: "",
    is_mass_settlement: false, is_additional_work: false, is_price_increase: false,
    notified_date: toISODate(new Date()), revised_date: null,
    project_manager: "", customer_email: "",
    change_description: "", reason: "", other_notes: "",
    status: "krav", customer_signed_at: null,
  };
}

export function AmendmentForm({ amendmentId, initialOfferId }: { amendmentId?: string; initialOfferId?: string }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isEdit = !!amendmentId;
  const { tenantId } = useAuth();
  const { data: appSettings } = useAppSettings();
  const units = appSettings?.units ?? FALLBACK_UNITS;

  const { data: loaded } = useQuery({
    queryKey: ["amendment", amendmentId],
    enabled: isEdit,
    queryFn: async () => {
      const [a, l] = await Promise.all([
        supabase.from("amendments").select("*").eq("id", amendmentId!).single(),
        supabase.from("amendment_lines").select("*").eq("amendment_id", amendmentId!).order("sort_order"),
      ]);
      if (a.error) throw a.error;
      return { amendment: a.data, lines: (l.data ?? []) as ALine[] };
    },
  });

  const { data: projects } = useQuery({
    queryKey: ["projects-simple"],
    queryFn: async () => {
      const { data } = await supabase
        .from("projects")
        .select("id, name, project_number, status")
        .eq("status", "aktiv")
        .order("name");
      return data ?? [];
    },
  });

  const { data: offers } = useQuery({
    queryKey: ["offers-for-amendment", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase
        .from("offers")
        .select("id, offer_number, title, customer_name, project_number, status")
        .eq("tenant_id", tenantId!)
        .in("status", OFFER_WON_STATUSES)
        .order("offer_number", { ascending: false })
        .limit(200);
      return data ?? [];
    },
  });

  const [a, setA] = useState<AState>(() => empty());
  const [lines, setLines] = useState<ALine[]>([]);
  const [init, setInit] = useState(false);
  // Knappene lagrer før de gjør noe annet. Uten denne referansen ville en ny
  // melding blitt lagt inn på nytt for hver knapp man trykket på, og
  // signeringslenken ville pekt på den første av kopiene.
  const currentAmendmentIdRef = useRef<string | undefined>(amendmentId);
  const DRAFT_KEY = `amendment-draft-${amendmentId ?? "new"}`;

  // Når kravet opprettes fra inne i et tilbud, hentes tilbudet slik at både
  // tilbudskoblingen og prosjektet kan fylles inn på forhånd.
  const { data: initialOffer } = useQuery({
    queryKey: ["offer-for-new-amendment", initialOfferId],
    enabled: !!initialOfferId && !amendmentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("offers")
        .select("id, offer_number, title, our_ref, project_id, project_number, customer_email, projects(project_number, name)")
        .eq("id", initialOfferId!)
        .single();
      if (error) throw error;
      return data as any;
    },
  });

  useEffect(() => {
    // Vent på tilbudet før skjemaet initialiseres, ellers ville det blitt tomt
    if (!isEdit && initialOfferId && !initialOffer) return;

    if (!isEdit && !init && initialOfferId && initialOffer) {
      const proj = initialOffer.projects;
      setA({
        ...empty(),
        offer_id: initialOffer.id,
        project_id: initialOffer.project_id ?? null,
        project_ref: initialOffer.project_number || proj?.project_number || proj?.name || "",
        internal_description: initialOffer.title ?? "",
        customer_email: initialOffer.customer_email ?? "",
        // Tilbudets "Vår referanse" er den samme personen som står som
        // prosjektleder på endringen. Mangler den, brukes firmaets første
        // referanse fra innstillingene.
        project_manager: initialOffer.our_ref || appSettings?.our_refs?.[0]?.name || "",
      });
      setInit(true);
      return;
    }

    if (!isEdit && !init) {
      // Gjenopprett utkast fra sessionStorage om det finnes (bare samme fane/økt)
      const saved = sessionStorage.getItem(DRAFT_KEY);
      if (saved) {
        try {
          const { a: sa, lines: sl } = JSON.parse(saved);
          setA(sa);
          setLines(sl ?? []);
          setInit(true);
          return;
        } catch { sessionStorage.removeItem(DRAFT_KEY); }
      }
      setA(empty()); setInit(true);
    }
    if (isEdit && loaded && !init) { setA(loaded.amendment as any); setLines(loaded.lines); setInit(true); }
  }, [isEdit, loaded, init, initialOfferId, initialOffer, appSettings]);

  // Lagre skjematilstand i sessionStorage ved hver endring (bare for nye endringsmeldinger)
  useEffect(() => {
    if (!init || isEdit) return;
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ a, lines }));
  }, [a, lines, init, isEdit]);

  const subtotal = useMemo(() => lines.reduce((s, l) => s + Number(l.quantity || 0) * Number(l.unit_price || 0), 0), [lines]);
  const set = <K extends keyof AState>(k: K, v: AState[K]) => setA((p) => ({ ...p, [k]: v }));

  // Et krav om endring blir en endringsmelding først når kunden har signert.
  // Statusen settes av en trigger i databasen, men vi leser begge feltene her
  // slik at visningen stemmer også rett etter en nullstilling.
  const isSigned = !!a.customer_signed_at || a.status === "endringsmelding";
  const docLabel = isSigned ? "Endringsmelding" : "Krav om endring";

  const pickProject = (id: string) => {
    if (id === "__none") { setA((p) => ({ ...p, project_id: null, project_ref: "" })); return; }
    const proj = (projects ?? []).find((x: any) => x.id === id);
    if (!proj) return;
    setA((p) => ({
      ...p,
      project_id: proj.id,
      project_ref: proj.project_number ?? proj.name ?? "",
      customer_email: p.customer_email || "",
    }));
  };

  const pickOffer = (id: string) => {
    if (id === "__none") { setA((p) => ({ ...p, offer_id: null })); return; }
    const o = (offers ?? []).find((x: any) => x.id === id);
    if (!o) return;
    setA((p) => ({
      ...p,
      offer_id: o.id,
      project_ref: p.project_ref || o.project_number || String(o.offer_number),
      internal_description: p.internal_description || o.title || "",
    }));
  };

  const addLine = () => setLines((p) => [...p, { sort_order: p.length, description: "", quantity: 1, unit: "stk", unit_price: 0 }]);
  const removeLine = (i: number) => setLines((p) => p.filter((_, idx) => idx !== i));
  const updLine = (i: number, patch: Partial<ALine>) => setLines((p) => p.map((l, idx) => idx === i ? { ...l, ...patch } : l));

  // Generer endringsmeldingsnummer: [prosjekt]-[løpenummer]
  async function nextNumber(project: string): Promise<string> {
    const prefix = (project || "0").trim();
    const { data, error } = await supabase.from("amendments").select("amendment_number").like("amendment_number", `${prefix}-%`);
    // Uten dette ville en feil her stilltiende gi nummer 1 på nytt, og to
    // endringsmeldinger på samme prosjekt kunne få samme nummer.
    if (error) throw error;
    const nums = (data ?? []).map((r) => {
      const m = String(r.amendment_number ?? "").match(/-(\d+)$/);
      return m ? parseInt(m[1]) : 0;
    });
    const next = (nums.length ? Math.max(...nums) : 0) + 1;
    return `${prefix}-${next}`;
  }

  const save = async (): Promise<string | null> => {
    // Feltene kan komme tilbake som null fra databasen, så .trim() må skjermes
    const projectRef = (a.project_ref ?? "").trim();
    const internalDesc = (a.internal_description ?? "").trim();
    if (!projectRef) { toast.error("Prosjekt er påkrevd"); return null; }
    let number = a.amendment_number;
    if (!isEdit && !number) {
      try {
        number = await nextNumber(projectRef);
      } catch (e: any) {
        toast.error(`Kunne ikke generere nummer: ${e?.message ?? e}`);
        return null;
      }
    }

    // Status er bevisst utelatt fra payload: den styres av signeringen (triggeren
    // i databasen setter 'endringsmelding'). Ville vi sendt a.status med her,
    // kunne en lagring av en signert melding skrevet 'krav' tilbake over den.
    const payload = {
      // amendments.title er NOT NULL uten default. Appen viser den ingen steder
      // — den bruker internal_description og project_ref — men uten en verdi her
      // feilet hver eneste innsetting på not-null-constraint.
      title: internalDesc || `${docLabel} ${number}`,
      amendment_number: number, offer_id: a.offer_id || null, project_id: a.project_id || null,
      project_ref: projectRef, internal_description: a.internal_description,
      is_mass_settlement: a.is_mass_settlement, is_additional_work: a.is_additional_work, is_price_increase: a.is_price_increase,
      notified_date: a.notified_date, revised_date: a.revised_date || null,
      project_manager: a.project_manager || null, customer_email: a.customer_email || null,
      change_description: a.change_description, reason: a.reason, other_notes: a.other_notes,
    };
    let id = currentAmendmentIdRef.current ?? amendmentId;
    const editing = isEdit || !!currentAmendmentIdRef.current;
    if (editing && id) {
      const { error } = await supabase.from("amendments").update(payload).eq("id", id);
      if (error) { toast.error(error.message); return null; }
      await supabase.from("amendment_lines").delete().eq("amendment_id", id);
    } else {
      const { data, error } = await supabase.from("amendments").insert({ ...payload, status: "krav", tenant_id: tenantId }).select("id").single();
      if (error) { toast.error(error.message); return null; }
      id = data.id;
      currentAmendmentIdRef.current = id;
      setA((p) => ({ ...p, amendment_number: number, status: "krav" }));
    }
    if (lines.length) {
      const ins = lines.map((l, idx) => ({
        amendment_id: id!,
        tenant_id: tenantId,
        sort_order: idx,
        description: l.description,
        quantity: Number(l.quantity || 0),
        unit: l.unit,
        unit_price: Number(l.unit_price || 0),
      }));
      const { error } = await supabase.from("amendment_lines").insert(ins);
      if (error) { toast.error(error.message); return null; }
    }
    qc.invalidateQueries({ queryKey: ["amendments"] });
    qc.invalidateQueries({ queryKey: ["amendment", id] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    toast.success(`${docLabel} lagret`);
    sessionStorage.removeItem(DRAFT_KEY);
    return id!;
  };

  const handleSave = async () => { const id = await save(); if (id && !isEdit) navigate({ to: "/endringsmeldinger/$id", params: { id } }); };
  // Uten firmainnstillingene får dokumentet feil (eller manglende) firmanavn
  const requireSettings = () => {
    if (!appSettings) { toast.error("Firmainnstillingene er ikke lastet enda – prøv igjen om et øyeblikk"); return false; }
    return true;
  };

  const handlePdf = async () => {
    if (!requireSettings()) return;
    const id = await save();
    if (!id) return;
    generatePdf({ ...a, id }, lines, subtotal, appSettings?.company_name ?? "");
  };
  const handleEmail = async () => {
    if (!requireSettings()) return;
    const id = await save(); if (!id) return;
    if (!a.customer_email) { toast.error("Mangler kunde-e-post"); return; }

    // Er kravet ikke signert, legger vi ved en signeringslenke slik tilbudene gjør
    let signingLink = "";
    if (!isSigned && tenantId) {
      const { data: tokenData } = await supabase
        .from("amendment_signing_tokens" as never)
        .insert({ amendment_id: id, tenant_id: tenantId } as never)
        .select("token")
        .single();
      if (tokenData) {
        signingLink = `\n\nSigner kravet digitalt her:\n${window.location.origin}/signer-endring/${(tokenData as any).token}`;
      }
    }

    const senderName = appSettings?.company_name ?? "Tilbudssystem";
    const subject = isSigned
      ? `Endringsmelding nr. ${a.amendment_number} – Prosjekt ${a.project_ref}`
      : `Krav om endring nr. ${a.amendment_number} – Prosjekt ${a.project_ref}`;
    const body = isSigned
      ? `Hei,\n\nVedlagt finner du endringsmelding nr. ${a.amendment_number} for prosjekt ${a.project_ref}.\n\nMed vennlig hilsen\n${senderName}`
      : `Hei,\n\nVi sender herved krav om endring nr. ${a.amendment_number} for prosjekt ${a.project_ref}.${signingLink}\n\nVia signeringslenken kan du lese gjennom kravet før du signerer digitalt. Når kravet er signert, blir det en endringsmelding.\n\nTa gjerne kontakt om du har spørsmål.\n\nMed vennlig hilsen\n${senderName}`;
    const cc = a.project_manager && a.project_manager.includes("@") ? `&cc=${encodeURIComponent(a.project_manager)}` : "";
    window.location.href = `mailto:${encodeURIComponent(a.customer_email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}${cc}`;
  };

  const handleSigningLink = async () => {
    const id = await save();
    if (!id) return;
    if (!tenantId) { toast.error("Ingen tenant"); return; }
    const { data: tokenData, error } = await supabase
      .from("amendment_signing_tokens" as never)
      .insert({ amendment_id: id, tenant_id: tenantId } as never)
      .select("token")
      .single();
    if (error || !tokenData) { toast.error("Kunne ikke opprette signeringslenke"); return; }
    const link = `${window.location.origin}/signer-endring/${(tokenData as any).token}`;
    await navigator.clipboard.writeText(link);
    toast.success("Signeringslenke kopiert til utklippstavlen!");
  };

  const handleResetSignature = async () => {
    if (!amendmentId) return;
    if (!window.confirm("Er du sikker på at du vil nullstille kundesignaturen? Meldingen blir da et krav om endring igjen, og alle signeringslenker slutter å fungere.")) return;
    await supabase.from("amendment_signing_tokens" as never).delete().eq("amendment_id" as never, amendmentId as never);
    // Triggeren i databasen setter bare status ved signering, ikke ved
    // nullstilling — derfor må status settes eksplisitt tilbake til 'krav' her.
    const { error } = await supabase
      .from("amendments")
      .update({ customer_signed_at: null, status: "krav" } as any)
      .eq("id", amendmentId);
    if (error) { toast.error(error.message); return; }
    setA((p) => ({ ...p, customer_signed_at: null, status: "krav" }));
    qc.invalidateQueries({ queryKey: ["amendment", amendmentId] });
    qc.invalidateQueries({ queryKey: ["amendments"] });
    toast.success("Signatur nullstilt. Du kan nå sende ut en ny signeringslenke.");
  };

  if (isEdit && !init) return <div className="text-muted-foreground">Laster…</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild><Link to="/endringsmeldinger"><ArrowLeft className="mr-1 h-4 w-4" />Tilbake</Link></Button>
          <h1 className="text-2xl font-bold">
            {isEdit ? `${docLabel} #${a.amendment_number}` : "Nytt krav om endring"}
          </h1>
        </div>
        <div className="flex gap-2 flex-wrap lg:justify-end">
          {/* Er den alt signert, skal det ikke gå an å be om en ny signatur —
              da ville customer_signed_at blitt overskrevet. Nullstill først. */}
          {!isSigned && (
            <Button variant="outline" onClick={handleSigningLink} title="Generer signeringslenke og kopier til utklippstavlen">
              <Link2 className="mr-2 h-4 w-4" />Signeringslenke
            </Button>
          )}
          {isEdit && isSigned && (
            <Button variant="outline" onClick={handleResetSignature} className="text-destructive border-destructive/50 hover:bg-destructive/10" title="Nullstill kundesignatur">
              <RotateCcw className="mr-2 h-4 w-4" />Nullstill signatur
            </Button>
          )}
          <Button variant="outline" onClick={handleEmail}><Mail className="mr-2 h-4 w-4" />Send på e-post</Button>
          <Button variant="outline" onClick={handlePdf}><FileDown className="mr-2 h-4 w-4" />Lagre og last ned PDF</Button>
          <Button onClick={handleSave}><Save className="mr-2 h-4 w-4" />Lagre</Button>
        </div>
      </div>

      {isSigned && (
        <div className="flex items-start gap-3 rounded-xl border border-green-600/40 bg-green-600/10 p-4">
          <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-green-600" />
          <div className="text-sm">
            <div className="font-semibold text-green-700 dark:text-green-500">
              Signert av kunden{a.customer_signed_at ? ` ${fmtDate(a.customer_signed_at)}` : ""}
            </div>
            <div className="text-muted-foreground">
              Kravet om endring er nå en endringsmelding.
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <div className="space-y-4 rounded-xl border bg-card p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Endringsinfo</h2>
          <div className="space-y-2">
            <Label>Knytt til tilbud</Label>
            <Select value={a.offer_id ?? "__none"} onValueChange={pickOffer}>
              <SelectTrigger><SelectValue placeholder="Velg tilbud…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">— Ikke knyttet til tilbud —</SelectItem>
                {(offers ?? []).map((o: any) => (
                  <SelectItem key={o.id} value={o.id}>
                    #{o.offer_number} – {o.title}{o.customer_name ? ` (${o.customer_name})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Knytt til prosjekt</Label>
            <Select value={a.project_id ?? "__none"} onValueChange={pickProject}>
              <SelectTrigger><SelectValue placeholder="Velg prosjekt…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">— Ikke knyttet til prosjekt —</SelectItem>
                {(projects ?? []).map((p: any) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}{p.project_number ? ` (#${p.project_number})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Prosjektreferanse *</Label>
            <Input value={a.project_ref} onChange={(e) => set("project_ref", e.target.value)} placeholder="f.eks. 2011600" />
          </div>
          <div className="space-y-2">
            <Label>Intern beskrivelse</Label>
            <Input value={a.internal_description} onChange={(e) => set("internal_description", e.target.value)} />
          </div>
          <div className="space-y-3 rounded-md border bg-muted/30 p-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Type</div>
            {[
              { k: "is_mass_settlement", l: "Masseavregning" },
              { k: "is_additional_work", l: "Tilleggsarbeid" },
              { k: "is_price_increase", l: "Prisstigning" },
            ].map((x) => (
              <label key={x.k} className="flex items-center gap-2 text-sm">
                <Checkbox checked={(a as any)[x.k]} onCheckedChange={(v) => set(x.k as any, !!v)} />
                {x.l}
              </label>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label>Dato varslet</Label><Input type="date" value={a.notified_date} onChange={(e) => set("notified_date", e.target.value)} /></div>
            <div className="space-y-2"><Label>Dato revidert</Label><Input type="date" value={a.revised_date ?? ""} onChange={(e) => set("revised_date", e.target.value || null)} /></div>
          </div>
          <div className="space-y-2"><Label>Prosjektleder</Label><Input value={a.project_manager} onChange={(e) => set("project_manager", e.target.value)} /></div>
          <div className="space-y-2"><Label>E-post kunde</Label><Input type="email" value={a.customer_email} onChange={(e) => set("customer_email", e.target.value)} /></div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border bg-card p-5 shadow-sm space-y-3">
            <div><Label>Beskrivelse av endring</Label><Textarea rows={4} value={a.change_description} onChange={(e) => set("change_description", e.target.value)} /></div>
            <div><Label>Årsak</Label><Textarea rows={3} value={a.reason} onChange={(e) => set("reason", e.target.value)} /></div>
            <div><Label>Andre konsekvenser / merknader</Label><Textarea rows={3} value={a.other_notes} onChange={(e) => set("other_notes", e.target.value)} /></div>
          </div>

          <div className="rounded-xl border bg-card p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Prisoverslag</h2>
              <Button size="sm" variant="outline" onClick={addLine}><Plus className="mr-1 h-4 w-4" />Ny linje</Button>
            </div>
            <table className="hidden w-full text-sm md:table">
              <thead className="border-b text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-2 py-2 text-left">Beskrivelse</th>
                  <th className="w-20 px-2 py-2 text-right">Antall</th>
                  <th className="w-24 px-2 py-2">Enhet</th>
                  <th className="w-32 px-2 py-2 text-right">Pris/enhet</th>
                  <th className="w-32 px-2 py-2 text-right">Sum</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 ? (
                  <tr><td colSpan={6} className="px-2 py-6 text-center text-muted-foreground">Ingen linjer ennå.</td></tr>
                ) : lines.map((l, i) => {
                  const isCustomUnit = !!l.unit && !units.includes(l.unit);
                  return (
                    <tr key={i} className="border-b align-top">
                      <td className="px-2 py-2"><Input value={l.description} onChange={(e) => updLine(i, { description: e.target.value })} /></td>
                      <td className="px-2 py-2"><Input type="number" step="1" className="text-right no-spinner" value={l.quantity} onChange={(e) => updLine(i, { quantity: Number(e.target.value) })} onFocus={(e) => e.target.select()} /></td>
                      <td className="px-2 py-2">
                        <Select
                          value={isCustomUnit ? "__annet__" : l.unit}
                          onValueChange={(v) => updLine(i, { unit: v === "__annet__" ? "" : v })}
                        >
                          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {units.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                            <SelectItem value="__annet__">Annet…</SelectItem>
                          </SelectContent>
                        </Select>
                        {isCustomUnit && (
                          <Input
                            className="mt-1 h-8 text-sm"
                            placeholder="Skriv enhet…"
                            value={l.unit}
                            onChange={(e) => updLine(i, { unit: e.target.value })}
                            autoFocus
                          />
                        )}
                      </td>
                      <td className="px-2 py-2"><Input type="number" step="1" className="text-right no-spinner" value={l.unit_price || ""} placeholder="0" onChange={(e) => updLine(i, { unit_price: Number(e.target.value) })} onFocus={(e) => e.target.select()} /></td>
                      <td className="px-2 py-2 text-right font-medium">{nok(Number(l.quantity || 0) * Number(l.unit_price || 0))}</td>
                      <td className="px-1 py-2"><Button size="icon" variant="ghost" onClick={() => removeLine(i)}><Trash2 className="h-4 w-4 text-destructive" /></Button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Mobil: hver linje som et kort med stablede felt */}
            <div className="space-y-3 md:hidden">
              {lines.length === 0 ? (
                <p className="px-2 py-6 text-center text-muted-foreground">Ingen linjer ennå.</p>
              ) : lines.map((l, i) => {
                const isCustomUnit = !!l.unit && !units.includes(l.unit);
                return (
                  <div key={i} className="space-y-3 rounded-lg border p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Linje {i + 1}</span>
                      <Button size="icon" variant="ghost" onClick={() => removeLine(i)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Beskrivelse</Label>
                      <Input value={l.description} onChange={(e) => updLine(i, { description: e.target.value })} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Antall</Label>
                        <Input type="number" step="1" className="no-spinner" value={l.quantity} onChange={(e) => updLine(i, { quantity: Number(e.target.value) })} onFocus={(e) => e.target.select()} />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Enhet</Label>
                        <Select value={isCustomUnit ? "__annet__" : l.unit} onValueChange={(v) => updLine(i, { unit: v === "__annet__" ? "" : v })}>
                          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {units.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                            <SelectItem value="__annet__">Annet…</SelectItem>
                          </SelectContent>
                        </Select>
                        {isCustomUnit && (
                          <Input className="mt-1 h-8 text-sm" placeholder="Skriv enhet…" value={l.unit} onChange={(e) => updLine(i, { unit: e.target.value })} autoFocus />
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Pris/enhet</Label>
                        <Input type="number" step="1" className="no-spinner" value={l.unit_price || ""} placeholder="0" onChange={(e) => updLine(i, { unit_price: Number(e.target.value) })} onFocus={(e) => e.target.select()} />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Sum</Label>
                        <div className="flex h-9 items-center justify-end px-1 font-medium">{nok(Number(l.quantity || 0) * Number(l.unit_price || 0))}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 ml-auto max-w-sm border-t pt-4">
              <div className="flex justify-between text-lg font-bold"><span>Total eks. mva</span><span className="text-primary">{nok(subtotal)}</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// companyName må sendes inn: denne funksjonen ligger utenfor komponenten og har
// ikke tilgang til appSettings (den refererte den før, og krasjet med ReferenceError)
function generatePdf(a: AState, lines: ALine[], subtotal: number, companyName: string) {
  // Dokumentet heter "Krav om endring" til kunden har signert
  const docLabel = a.customer_signed_at || a.status === "endringsmelding" ? "Endringsmelding" : "Krav om endring";
  const chip = (on: boolean, label: string) => `<span class="chip ${on ? "on" : ""}">${label}</span>`;
  const linesHtml = lines.map((l) => `
    <tr>
      <td>${escapeHtml(l.description)}</td>
      <td class="num">${num(l.quantity)}</td>
      <td>${escapeHtml(l.unit)}</td>
      <td class="num">${nok(l.unit_price)}</td>
      <td class="num">${nok(l.quantity * l.unit_price)}</td>
    </tr>`).join("");

  const html = `
    <div class="header">
      <div><h1>${escapeHtml(companyName)}</h1><div style="font-size:9.5pt;color:#555;margin-top:4px">${docLabel}</div></div>
      <div class="meta">
        <div>Nr.: <strong>${escapeHtml(a.amendment_number)}</strong></div>
        <div>Prosjekt: ${escapeHtml(a.project_ref)}</div>
        <div>Varslet: ${fmtDate(a.notified_date)}</div>
        ${a.revised_date ? `<div>Revidert: ${fmtDate(a.revised_date)}</div>` : ""}
      </div>
    </div>

    <div class="box">
      ${chip(a.is_mass_settlement, "Masseavregning")}
      ${chip(a.is_additional_work, "Tilleggsarbeid")}
      ${chip(a.is_price_increase, "Prisstigning")}
    </div>

    <h2>Beskrivelse av endring</h2>
    <div class="text">${escapeHtml(a.change_description)}</div>
    ${a.reason ? `<h2>Årsak</h2><div class="text">${escapeHtml(a.reason)}</div>` : ""}
    ${a.other_notes ? `<h2>Andre konsekvenser</h2><div class="text">${escapeHtml(a.other_notes)}</div>` : ""}

    <h2>Prisoverslag</h2>
    <table>
      <thead><tr><th>Beskrivelse</th><th class="num">Antall</th><th>Enhet</th><th class="num">Pris/enhet</th><th class="num">Sum</th></tr></thead>
      <tbody>${linesHtml || `<tr><td colspan="5" style="text-align:center;color:#888;padding:10px">Ingen linjer</td></tr>`}</tbody>
      <tfoot><tr class="total-row"><td colspan="4" class="num">Total eks. mva</td><td class="num">${nok(subtotal)}</td></tr></tfoot>
    </table>

    <div class="footer">Prosjektleder: ${escapeHtml(a.project_manager || "—")} · ${escapeHtml(companyName)}</div>
  `;
  openPrintPdf(`${docLabel.replace(/ /g, "-")}-${a.amendment_number}`, html);
}
