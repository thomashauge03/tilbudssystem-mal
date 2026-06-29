import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Plus, Trash2, Save, FileDown, Mail, ArrowLeft, ChevronDown, FileSignature, Link2, RotateCcw, Paperclip, X, ExternalLink, ChevronsUpDown, Check } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { nok, num, fmtDate, toISODate, addDays, UNITS as FALLBACK_UNITS } from "@/lib/format";
import { openOfferPdf, openContractPdf } from "@/lib/pdf";
import { Link } from "@tanstack/react-router";
import { useAppSettings } from "@/hooks/use-app-settings";
import { useAuth } from "@/hooks/use-auth";

interface Line {
  id?: string;
  sort_order: number;
  included: boolean;
  description: string;
  comment: string;
  quantity: number;
  unit: string;
  unit_price: number;
  discount_pct: number;
}

interface OfferState {
  id?: string;
  offer_number?: number;
  title: string;
  project_id: string | null;
  customer_id: string | null;
  customer_name: string;
  customer_email: string;
  offer_text: string;
  offer_date: string;
  valid_until: string;
  their_ref: string;
  our_ref: string;
  project_number: string;
  admin_cost_pct: number;
  forbehold: string[];
  status?: string;
  attachment_urls: Array<{ name: string; url: string }>;
}

function emptyOffer(adminPct: number, validityDays: number, defaultRef: string, defaultText = ""): OfferState {
  const today = new Date();
  return {
    title: "", project_id: null, customer_id: null, customer_name: "", customer_email: "",
    offer_text: defaultText, offer_date: toISODate(today), valid_until: toISODate(addDays(today, validityDays)),
    their_ref: "", our_ref: defaultRef, project_number: "", admin_cost_pct: adminPct, forbehold: [], attachment_urls: [],
  };
}

export function OfferForm({ offerId }: { offerId?: string }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isEdit = !!offerId;
  const { tenantId } = useAuth();
  const { data: appSettings } = useAppSettings();
  const units = appSettings?.units ?? FALLBACK_UNITS;

  const { data: adminCost } = useQuery({
    queryKey: ["admin-cost-current"],
    queryFn: async () => {
      const year = new Date().getFullYear();
      const { data } = await supabase.from("admin_costs").select("pct").eq("year", year).maybeSingle();
      return Number(data?.pct ?? 0);
    },
  });

  // M5: destructure isLoading/error so UI can show loading/error states
  const { data: customers, isLoading: customersLoading, error: customersError } = useQuery({
    queryKey: ["customers-simple"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("id, name, email, phone, address").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: projects } = useQuery({
    queryKey: ["projects-simple"],
    queryFn: async () => {
      const { data } = await supabase
        .from("projects")
        .select("id, name, customer_id, status")
        .eq("status", "aktiv")
        .order("name");
      return data ?? [];
    },
  });

  const { data: loaded } = useQuery({
    queryKey: ["offer", offerId],
    enabled: isEdit,
    queryFn: async () => {
      const [o, l] = await Promise.all([
        supabase.from("offers").select("*").eq("id", offerId!).single(),
        supabase.from("offer_lines").select("*").eq("offer_id", offerId!).order("sort_order"),
      ]);
      if (o.error) throw o.error;
      return { offer: o.data, lines: (l.data ?? []) as Line[] };
    },
  });

  const [offer, setOffer] = useState<OfferState>(() => emptyOffer(0, 30, ""));
  const [lines, setLines] = useState<Line[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [forbeholdOpen, setForbeholdOpen] = useState(false);
  const [projectOpen, setProjectOpen] = useState(false);
  const [customerOpen, setCustomerOpen] = useState(false);
  const currentOfferIdRef = useRef<string | undefined>(offerId);
  const DRAFT_KEY = `offer-draft-${offerId ?? "new"}`;

  useEffect(() => {
    if (!isEdit && !initialized && adminCost !== undefined && appSettings !== undefined) {
      // Gjenopprett utkast frå localStorage om det finst
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) {
        try {
          const { offer: o, lines: l } = JSON.parse(saved);
          setOffer(o);
          setLines(l ?? []);
          setInitialized(true);
          return;
        } catch { localStorage.removeItem(DRAFT_KEY); }
      }
      setOffer(emptyOffer(adminCost, appSettings.offer_validity_days, appSettings.our_refs[0]?.name ?? "", appSettings.default_offer_text));
      setInitialized(true);
    }
    if (isEdit && loaded && !initialized) {
      const lo = loaded.offer as any;
      setOffer({ ...lo, forbehold: Array.isArray(lo.forbehold) ? lo.forbehold : [], attachment_urls: Array.isArray(lo.attachment_urls) ? lo.attachment_urls : [] });
      setLines(loaded.lines.length ? loaded.lines : []);
      setInitialized(true);
    }
  // L3: appSettings added to deps — it's read for offer_validity_days, our_refs, and default_offer_text
  }, [isEdit, loaded, adminCost, initialized, appSettings]);

  // Lagre skjematilstand i localStorage ved kvar endring (berre for nye tilbod)
  useEffect(() => {
    if (!initialized || isEdit) return;
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ offer, lines }));
  }, [offer, lines, initialized, isEdit]);

  const lineSum = (l: Line) => {
    const gross = Number(l.quantity || 0) * Number(l.unit_price || 0);
    return gross * (1 - Number(l.discount_pct || 0) / 100);
  };

  const subtotal = useMemo(
    () => lines.filter((l) => l.included).reduce((s, l) => s + lineSum(l), 0),
    [lines]
  );
  const totalDiscount = useMemo(
    () => lines.filter((l) => l.included && Number(l.discount_pct) > 0).reduce((s, l) => {
      const gross = Number(l.quantity || 0) * Number(l.unit_price || 0);
      return s + gross * (Number(l.discount_pct) / 100);
    }, 0),
    [lines]
  );
  const admin = subtotal * (Number(offer.admin_cost_pct || 0) / 100);
  const total = subtotal + admin;

  const set = <K extends keyof OfferState>(k: K, v: OfferState[K]) => setOffer((p) => ({ ...p, [k]: v }));

  const addLine = () => setLines((p) => [...p, { sort_order: p.length, included: true, description: "", comment: "", quantity: 1, unit: "stk", unit_price: 0, discount_pct: 0 }]);
  const removeLine = (i: number) => setLines((p) => p.filter((_, idx) => idx !== i));
  const updLine = (i: number, patch: Partial<Line>) => setLines((p) => p.map((l, idx) => idx === i ? { ...l, ...patch } : l));

  const pickCustomer = (id: string) => {
    if (id === "__none") { set("customer_id", null); return; }
    const c = (customers ?? []).find((x) => x.id === id);
    if (c) { set("customer_id", c.id); set("customer_name", c.name); set("customer_email", c.email ?? ""); }
  };

  const pickProject = (id: string) => {
    if (id === "__none") {
      setOffer((p) => ({ ...p, project_id: null, project_number: "" }));
      return;
    }
    const proj = (projects ?? []).find((x: any) => x.id === id);
    if (!proj) return;
    setOffer((p) => {
      const next = { ...p, project_id: proj.id, project_number: proj.project_number ?? "" };
      if (!p.customer_id && proj.customer_id) {
        const c = (customers ?? []).find((x) => x.id === proj.customer_id);
        next.customer_id = proj.customer_id;
        next.customer_name = c?.name ?? proj.customer_name ?? "";
        next.customer_email = c?.email ?? "";
      }
      return next;
    });
  };

  const save = async (): Promise<string | null> => {
    if (!offer.title.trim()) { toast.error("Overskrift er påkrevd"); return null; }
    if (!offer.customer_name.trim()) { toast.error("Kundenavn er påkrevd"); return null; }

    const payload = {
      title: offer.title,
      project_id: offer.project_id || null,
      customer_id: offer.customer_id,
      customer_name: offer.customer_name || null,
      customer_email: offer.customer_email || null,
      offer_text: offer.offer_text || null,
      offer_date: offer.offer_date,
      valid_until: offer.valid_until,
      their_ref: offer.their_ref || null,
      our_ref: offer.our_ref || null,
      project_number: offer.project_number || null,
      admin_cost_pct: Number(offer.admin_cost_pct || 0),
      forbehold: offer.forbehold ?? [],
      attachment_urls: offer.attachment_urls ?? [],
      ...(isEdit && offer.status ? { status: offer.status } : {}),
    };

    let id = currentOfferIdRef.current ?? offerId;
    const editing = isEdit || !!currentOfferIdRef.current;
    if (editing && id) {
      const { error } = await supabase.from("offers").update(payload).eq("id", id);
      if (error) { toast.error(error.message); return null; }
      await supabase.from("offer_lines").delete().eq("offer_id", id);
    } else {
      const { data, error } = await supabase.from("offers").insert({ ...payload, status: "utkast", tenant_id: tenantId }).select("id").single();
      if (error) { toast.error(error.message); return null; }
      id = data.id;
      currentOfferIdRef.current = id;
    }

    if (lines.length) {
      const linesInsert = lines.map((l, idx) => ({
        offer_id: id!,
        tenant_id: tenantId,
        sort_order: idx,
        included: l.included,
        description: l.description,
        comment: l.comment || null,
        quantity: Number(l.quantity || 0),
        unit: l.unit,
        unit_price: Number(l.unit_price || 0),
        discount_pct: Number(l.discount_pct || 0),
      }));
      const { error } = await supabase.from("offer_lines").insert(linesInsert);
      if (error) { toast.error(error.message); return null; }
    }

    qc.invalidateQueries({ queryKey: ["offers"] });
    qc.invalidateQueries({ queryKey: ["offer", id] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    toast.success("Tilbud lagret");
    localStorage.removeItem(DRAFT_KEY);
    return id!;
  };

  const handleSave = async () => {
    const id = await save();
    if (id && !isEdit) navigate({ to: "/tilbud/$id", params: { id } });
  };

  const handlePdf = async () => {
    const id = await save();
    if (!id) return;
    const refObj = (appSettings?.our_refs ?? []).find((r) => r.name === offer.our_ref);
    const customerObj = (customers ?? []).find((c: any) => c.id === offer.customer_id);
    openOfferPdf(
      {
        ...offer,
        offer_number: offer.offer_number,
        customer_phone: customerObj?.phone ?? "",
        customer_address: customerObj?.address ?? "",
      },
      lines,
      { subtotal, admin, total },
      {
        company_name: appSettings?.company_name ?? "Tilbudssystem",
        company_tagline: appSettings?.company_tagline ?? "",
        logo_url: appSettings?.logo_url ?? "",
        payment_terms: appSettings?.payment_terms ?? "30 dager netto",
        vat_pct: appSettings?.vat_pct ?? 25,
        ref_phone: refObj?.phone ?? "",
        ref_email: refObj?.email ?? "",
        ref_position: refObj?.position ?? "",
        ref_signature: refObj?.signature ?? "",
        closing_page_offset_mm: appSettings?.closing_page_offset_mm ?? 90,
        forbehold: (offer.forbehold ?? []).map((f: any) => typeof f === "string" ? { title: f, description: "" } : f),
      }
    );
  };

  const handleEmail = async () => {
    const id = await save();
    if (!id) return;
    if (!offer.customer_email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(offer.customer_email)) { toast.error("Kunden mangler gyldig e-postadresse"); return; }

    // Opprett signeringslenke og inkluder i e-posten
    let signingLink = "";
    if (tenantId) {
      const { data: tokenData } = await supabase
        .from("offer_signing_tokens" as never)
        .insert({ offer_id: id, tenant_id: tenantId } as never)
        .select("token")
        .single();
      if (tokenData) {
        signingLink = `\n\nSigner tilbudet digitalt her:\n${window.location.origin}/signer/${(tokenData as any).token}`;
      }
    }

    const subject = `Tilbud nr. ${offer.offer_number ?? ""} – ${offer.title}`;
    const senderName = appSettings?.company_name ?? "Tilbudssystem";
    const body = `Hei,\n\nVi sender herved tilbud nr. ${offer.offer_number ?? ""} fra ${senderName}.\n\nTilbudet er gyldig t.o.m. ${fmtDate(offer.valid_until)}.${signingLink}\n\nVia signeringslenken kan du lese gjennom tilbudet og kontrakten før du signerer digitalt.\n\nTa gjerne kontakt om du har spørsmål.\n\nMed vennlig hilsen\n${senderName}`;
    window.location.href = `mailto:${encodeURIComponent(offer.customer_email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  const handleSigningLink = async () => {
    const id = await save();
    if (!id) return;
    if (!tenantId) { toast.error("Ingen tenant"); return; }
    const { data: tokenData, error } = await supabase
      .from("offer_signing_tokens" as never)
      .insert({ offer_id: id, tenant_id: tenantId } as never)
      .select("token")
      .single();
    if (error || !tokenData) { toast.error("Kunne ikke opprette signeringslenke"); return; }
    const link = `${window.location.origin}/signer/${(tokenData as any).token}`;
    await navigator.clipboard.writeText(link);
    toast.success("Signeringslenke kopiert til utklippstavlen!");
  };

  const handleResetSignature = async () => {
    if (!offerId) return;
    if (!window.confirm("Er du sikker på at du vil nullstille kundesignaturen? Alle signeringslenker for dette tilbudet vil slutte å fungere.")) return;
    await supabase.from("offer_signing_tokens" as never).delete().eq("offer_id" as never, offerId as never);
    await supabase.from("offers").update({ customer_signed_at: null } as any).eq("id", offerId);
    qc.invalidateQueries({ queryKey: ["offer", offerId] });
    toast.success("Signatur nullstilt. Du kan nå sende ut en ny signeringslenke.");
  };

  const handleContract = async () => {
    const id = await save();
    if (!id) return;
    const customerObj = (customers ?? []).find((c: any) => c.id === offer.customer_id);
    const refObj = (appSettings?.our_refs ?? []).find((r) => r.name === offer.our_ref);
    const vatPct = appSettings?.vat_pct ?? 25;
    const totalInclVat = total * (1 + vatPct / 100);

    // Hent kundesignatur frå signing tokens
    let customerSignedName: string | undefined;
    let customerSignature: string | undefined;
    const { data: tokenRows } = await supabase
      .from("offer_signing_tokens" as never)
      .select("signer_name, signer_signature, used_at")
      .eq("offer_id" as never, id as never)
      .not("used_at" as never, "is" as never, null as never)
      .order("used_at" as never, { ascending: false })
      .limit(1);
    let customerSignedAt: string | undefined;
    if (tokenRows && (tokenRows as any[]).length > 0) {
      const row = (tokenRows as any[])[0];
      customerSignedName = row.signer_name ?? undefined;
      customerSignature = row.signer_signature ?? undefined;
      customerSignedAt = row.used_at ?? undefined;
    }

    openContractPdf({
      offer_number: offer.offer_number ?? 0,
      title: offer.title,
      offer_date: offer.offer_date,
      customer_name: offer.customer_name,
      customer_address: customerObj?.address ?? "",
      customer_phone: customerObj?.phone ?? "",
      project_number: offer.project_number,
      offer_text: offer.offer_text,
      total_incl_vat: totalInclVat,
      company_name: appSettings?.company_name ?? "Tilbudssystem",
      logo_url: appSettings?.logo_url ?? "",
      company_org_nr: appSettings?.company_org_nr ?? "",
      ref_name: refObj?.name ?? offer.our_ref,
      ref_position: refObj?.position ?? "",
      ref_phone: refObj?.phone ?? "",
      ref_signature: refObj?.signature ?? "",
      customer_signed_name: customerSignedName,
      customer_signed_at: customerSignedAt,
      customer_signature: customerSignature,
      forbehold: (offer.forbehold ?? []).map((f: any) =>
        typeof f === "string" ? { title: f, description: "" } : f
      ),
    });
  };

  if (isEdit && !initialized) return <div className="text-muted-foreground">Laster…</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild><Link to="/tilbud"><ArrowLeft className="mr-1 h-4 w-4" />Tilbake</Link></Button>
          <h1 className="text-2xl font-bold">
            {isEdit ? `Tilbud #${offer.offer_number ?? ""}` : "Nytt tilbud"}
          </h1>
        </div>
        <div className="flex gap-2 flex-wrap lg:justify-end">
          {isEdit && (
            <Button variant="outline" onClick={handleContract}>
              <FileSignature className="mr-2 h-4 w-4" />Kontrakt PDF
            </Button>
          )}
          <Button variant="outline" onClick={handleSigningLink} title="Generer signeringslenke og kopier til utklippstavle">
            <Link2 className="mr-2 h-4 w-4" />Signeringslenke
          </Button>
          {isEdit && (loaded?.offer as any)?.customer_signed_at && (
            <Button variant="outline" onClick={handleResetSignature} className="text-destructive border-destructive/50 hover:bg-destructive/10" title="Nullstill kundesignatur">
              <RotateCcw className="mr-2 h-4 w-4" />Nullstill signatur
            </Button>
          )}
          <Button variant="outline" onClick={handleEmail}><Mail className="mr-2 h-4 w-4" />Send på e-post</Button>
          <Button variant="outline" onClick={handlePdf}><FileDown className="mr-2 h-4 w-4" />Last ned PDF</Button>
          <Button onClick={handleSave}><Save className="mr-2 h-4 w-4" />Lagre tilbud</Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        {/* Left: meta */}
        <div className="space-y-4 rounded-xl border bg-card p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Tilbudsinfo</h2>
          <div className="space-y-2">
            <Label>Overskrift / beskrivelse *</Label>
            <Input value={offer.title} onChange={(e) => set("title", e.target.value)} placeholder="Kort beskrivelse" />
          </div>
          <div className="space-y-2">
            <Label>Prosjekt</Label>
            <Popover open={projectOpen} onOpenChange={setProjectOpen}>
              <PopoverTrigger asChild>
                <button type="button" className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm hover:bg-accent/30 transition-colors">
                  {(() => {
                    const p = offer.project_id ? (projects ?? []).find((x: any) => x.id === offer.project_id) : null;
                    return p ? (
                      <span className="flex flex-1 items-center justify-between mr-2 min-w-0">
                        <span className="truncate">{p.name}</span>
                        {p.project_number && <span className="ml-3 flex-shrink-0 text-xs text-muted-foreground tabular-nums">#{p.project_number}</span>}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">— Ikkje knytt til prosjekt —</span>
                    );
                  })()}
                  <ChevronsUpDown className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-[320px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Søk prosjekt…" />
                  <CommandList>
                    <CommandEmpty>Ingen prosjekt funne.</CommandEmpty>
                    <CommandGroup>
                      <CommandItem value="__none" onSelect={() => { pickProject("__none"); setProjectOpen(false); }}>
                        <span className="text-muted-foreground">— Ikkje knytt til prosjekt —</span>
                      </CommandItem>
                      {(projects ?? []).map((p: any) => (
                        <CommandItem key={p.id} value={`${p.name} ${p.project_number ?? ""}`} onSelect={() => { pickProject(p.id); setProjectOpen(false); }}>
                          <Check className={`mr-2 h-4 w-4 ${offer.project_id === p.id ? "opacity-100" : "opacity-0"}`} />
                          <span className="flex-1">{p.name}</span>
                          {p.project_number && <span className="ml-3 text-xs text-muted-foreground tabular-nums">#{p.project_number}</span>}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
          <div className="space-y-2">
            <Label>Kunde</Label>
            {customersError ? (
              <p className="text-xs text-destructive">Kunne ikke laste kunder</p>
            ) : (
              <Popover open={customerOpen} onOpenChange={setCustomerOpen}>
                <PopoverTrigger asChild>
                  <button type="button" disabled={customersLoading} className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm hover:bg-accent/30 transition-colors disabled:opacity-50">
                    <span className={offer.customer_id ? "" : "text-muted-foreground"}>
                      {customersLoading ? "Laster kunder…" : offer.customer_id
                        ? (customers ?? []).find((c) => c.id === offer.customer_id)?.name ?? "Velg fra kunderegister…"
                        : "— Skriv inn manuelt —"}
                    </span>
                    <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-[320px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Søk kunde…" />
                    <CommandList>
                      <CommandEmpty>Ingen kunder funne.</CommandEmpty>
                      <CommandGroup>
                        <CommandItem value="__none" onSelect={() => { pickCustomer("__none"); setCustomerOpen(false); }}>
                          <span className="text-muted-foreground">— Skriv inn manuelt —</span>
                        </CommandItem>
                        {(customers ?? []).map((c) => (
                          <CommandItem key={c.id} value={`${c.name} ${c.email ?? ""}`} onSelect={() => { pickCustomer(c.id); setCustomerOpen(false); }}>
                            <Check className={`mr-2 h-4 w-4 ${offer.customer_id === c.id ? "opacity-100" : "opacity-0"}`} />
                            <span className="flex-1">{c.name}</span>
                            {c.email && <span className="ml-2 text-xs text-muted-foreground truncate max-w-[120px]">{c.email}</span>}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            )}
          </div>
          <div className="space-y-2">
            <Label>Kundenavn *</Label>
            <Input value={offer.customer_name} onChange={(e) => set("customer_name", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>E-post kunde</Label>
            <Input type="email" value={offer.customer_email} onChange={(e) => set("customer_email", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Tilbudsdato</Label>
              <Input type="date" value={offer.offer_date} onChange={(e) => set("offer_date", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Gyldig t.o.m.</Label>
              <Input type="date" value={offer.valid_until} onChange={(e) => set("valid_until", e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Deres referanse</Label>
            <Input value={offer.their_ref} onChange={(e) => set("their_ref", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Vår referanse</Label>
            <Select value={offer.our_ref} onValueChange={(v) => set("our_ref", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(appSettings?.our_refs ?? []).filter(r => r.name?.trim()).map((r) => (
                  <SelectItem key={r.name} value={r.name}>{r.name}</SelectItem>
                ))}
                {!(appSettings?.our_refs ?? []).some(r => r.name?.trim()) && (
                  <SelectItem value="__ingen">Ingen referanser satt opp</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Prosjektnr.</Label>
            <Input value={offer.project_number} onChange={(e) => set("project_number", e.target.value)} placeholder="Valgfritt" />
          </div>
          {isEdit && (
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={offer.status ?? "utkast"} onValueChange={(v) => set("status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="utkast">Utkast</SelectItem>
                  <SelectItem value="sendt">Sendt</SelectItem>
                  <SelectItem value="godkjent">Godkjent</SelectItem>
                  <SelectItem value="avslått">Avslått</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          {(appSettings?.forbehold ?? []).length > 0 && (
            <div className="rounded-md border overflow-hidden">
              <button
                type="button"
                onClick={() => setForbeholdOpen((o) => !o)}
                className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium hover:bg-muted/40 transition-colors"
              >
                <span>
                  Forbehold
                  {(offer.forbehold ?? []).length > 0 && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      ({(offer.forbehold ?? []).length} valgt)
                    </span>
                  )}
                </span>
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${forbeholdOpen ? "rotate-180" : ""}`} />
              </button>
              {forbeholdOpen && (
                <div className="divide-y border-t">
                  {(appSettings?.forbehold ?? []).map((f) => {
                    const key = f.title;
                    const checked = (offer.forbehold ?? []).some((x: any) => (typeof x === "string" ? x : x.title) === key);
                    return (
                      <label key={key} className="flex items-start gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/40 transition-colors">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            set("forbehold", checked
                              ? (offer.forbehold ?? []).filter((x: any) => (typeof x === "string" ? x : x.title) !== key)
                              : [...(offer.forbehold ?? []), f])
                          }
                          className="mt-0.5 h-4 w-4 accent-primary flex-shrink-0"
                        />
                        <span className="text-sm leading-snug">
                          <span className="font-semibold">{f.title}</span>
                          {f.description && <span className="text-muted-foreground"> — {f.description}</span>}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          <div className="space-y-2">
            <Label>Adm.påslag (%)</Label>
            <Input type="number" step="0.1" value={offer.admin_cost_pct} onChange={(e) => set("admin_cost_pct", Number(e.target.value))} />
          </div>

          {/* Vedlegg */}
          <div className="space-y-2">
            <Label>Vedlegg (PDF)</Label>
            <div className="space-y-2">
              {(offer.attachment_urls ?? []).map((att, i) => (
                <div key={i} className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
                  <Paperclip className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate">{att.name}</span>
                  <a href={att.url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary">
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                  <button
                    type="button"
                    onClick={async () => {
                      const path = att.url.split("/offer-attachments/")[1]?.split("?")[0];
                      if (path) await supabase.storage.from("offer-attachments").remove([path]);
                      set("attachment_urls", (offer.attachment_urls ?? []).filter((_, idx) => idx !== i));
                    }}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept="application/pdf"
                  multiple
                  className="hidden"
                  onChange={async (e) => {
                    const files = Array.from(e.target.files ?? []);
                    e.target.value = "";
                    for (const file of files) {
                      if (file.size > 20 * 1024 * 1024) { toast.error(`${file.name} er for stor (maks 20 MB)`); continue; }
                      const path = `${tenantId}/${offerId ?? "ny"}/${Date.now()}_${file.name}`;
                      const { error } = await supabase.storage.from("offer-attachments").upload(path, file, { upsert: true });
                      if (error) { toast.error(error.message); continue; }
                      const { data } = supabase.storage.from("offer-attachments").getPublicUrl(path);
                      set("attachment_urls", [...(offer.attachment_urls ?? []), { name: file.name, url: data.publicUrl }]);
                    }
                  }}
                />
                <Button type="button" variant="outline" size="sm" asChild>
                  <span><Paperclip className="mr-1.5 h-3.5 w-3.5" />Last opp PDF</span>
                </Button>
              </label>
            </div>
          </div>
        </div>

        {/* Right: text + lines */}
        <div className="space-y-4">
          <div className="space-y-2 rounded-xl border bg-card p-5 shadow-sm">
            <Label className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Tilbudstekst</Label>
            <Textarea rows={5} value={offer.offer_text} onChange={(e) => set("offer_text", e.target.value)} placeholder="Innledende tekst som vises over linjene i PDF…" />
          </div>

          <div className="rounded-xl border bg-card p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Tilbudslinjer</h2>
              <Button size="sm" variant="outline" onClick={addLine}><Plus className="mr-1 h-4 w-4" />Ny linje</Button>
            </div>
            <table className="hidden w-full text-sm md:table">
              <thead className="border-b text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="w-8 px-1 py-2"></th>
                  <th className="px-2 py-2 text-left">Beskrivelse</th>
                  <th className="w-20 px-2 py-2 text-right">Antall</th>
                  <th className="w-24 px-2 py-2">Enhet</th>
                  <th className="w-32 px-2 py-2 text-right">Pris/enhet</th>
                  <th className="w-20 px-2 py-2 text-right">Rabatt %</th>
                  <th className="w-32 px-2 py-2 text-right">Sum eks. mva</th>
                  <th className="w-8 px-1 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 ? (
                  <tr><td colSpan={8} className="px-2 py-6 text-center text-muted-foreground">Ingen linjer. Klikk "Ny linje" for å starte.</td></tr>
                ) : lines.map((l, i) => {
                  const isCustomUnit = !!l.unit && !units.includes(l.unit);
                  return (
                    <tr key={i} className="border-b align-top">
                      <td className="px-1 pt-3"><Checkbox checked={l.included} onCheckedChange={(v) => updLine(i, { included: !!v })} /></td>
                      <td className="px-2 py-2">
                        <Input value={l.description} onChange={(e) => updLine(i, { description: e.target.value })} placeholder="Beskrivelse" />
                        <Input
                          className="mt-1 h-8 text-xs text-muted-foreground"
                          value={l.comment}
                          onChange={(e) => updLine(i, { comment: e.target.value })}
                          placeholder="Kommentar (valgfritt)…"
                        />
                      </td>
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
                            placeholder="Skriv eining…"
                            value={l.unit}
                            onChange={(e) => updLine(i, { unit: e.target.value })}
                            autoFocus
                          />
                        )}
                      </td>
                      <td className="px-2 py-2"><Input type="number" step="1" className="text-right no-spinner" value={l.unit_price} onChange={(e) => updLine(i, { unit_price: Number(e.target.value) })} onFocus={(e) => e.target.select()} /></td>
                      <td className="px-2 py-2"><Input type="number" step="0.1" min="0" max="100" className="text-right no-spinner" value={l.discount_pct || ""} placeholder="0" onChange={(e) => updLine(i, { discount_pct: Number(e.target.value) })} onFocus={(e) => e.target.select()} /></td>
                      <td className="px-2 py-2 text-right font-medium">
                        {nok(lineSum(l))}
                        {Number(l.discount_pct) > 0 && (
                          <div className="text-xs text-muted-foreground line-through">{nok(Number(l.quantity || 0) * Number(l.unit_price || 0))}</div>
                        )}
                      </td>
                      <td className="px-1 py-2"><Button size="icon" variant="ghost" onClick={() => removeLine(i)}><Trash2 className="h-4 w-4 text-destructive" /></Button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Mobil: kvar linje som eit kort med stabla felt */}
            <div className="space-y-3 md:hidden">
              {lines.length === 0 ? (
                <p className="px-2 py-6 text-center text-muted-foreground">Ingen linjer. Klikk "Ny linje" for å starte.</p>
              ) : lines.map((l, i) => {
                const isCustomUnit = !!l.unit && !units.includes(l.unit);
                return (
                  <div key={i} className="space-y-3 rounded-lg border p-3">
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 text-sm font-medium">
                        <Checkbox checked={l.included} onCheckedChange={(v) => updLine(i, { included: !!v })} />
                        Inkluder i tilbud
                      </label>
                      <Button size="icon" variant="ghost" onClick={() => removeLine(i)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Beskrivelse</Label>
                      <Input value={l.description} onChange={(e) => updLine(i, { description: e.target.value })} placeholder="Beskrivelse" />
                      <Input className="h-8 text-xs text-muted-foreground" value={l.comment} onChange={(e) => updLine(i, { comment: e.target.value })} placeholder="Kommentar (valgfritt)…" />
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
                          <Input className="mt-1 h-8 text-sm" placeholder="Skriv eining…" value={l.unit} onChange={(e) => updLine(i, { unit: e.target.value })} autoFocus />
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Pris/enhet</Label>
                        <Input type="number" step="1" className="no-spinner" value={l.unit_price} onChange={(e) => updLine(i, { unit_price: Number(e.target.value) })} onFocus={(e) => e.target.select()} />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Rabatt %</Label>
                        <Input type="number" step="0.1" min="0" max="100" className="no-spinner" value={l.discount_pct || ""} placeholder="0" onChange={(e) => updLine(i, { discount_pct: Number(e.target.value) })} onFocus={(e) => e.target.select()} />
                      </div>
                    </div>
                    <div className="flex justify-between border-t pt-2 text-sm">
                      <span className="text-muted-foreground">Sum eks. mva</span>
                      <span className="font-semibold">{nok(lineSum(l))}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 ml-auto max-w-sm space-y-2 border-t pt-4">
              {admin > 0 && (
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Sum eks. mva</span><span className="font-medium">{nok(subtotal)}</span></div>
              )}
              {admin > 0 && (
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Adm.påslag ({num(offer.admin_cost_pct)} %)</span><span className="font-medium">{nok(admin)}</span></div>
              )}
              {totalDiscount > 0 && (
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Rabatt gitt</span><span className="font-medium text-green-600">− {nok(totalDiscount)}</span></div>
              )}
              <div className="flex justify-between border-t pt-2 text-lg font-bold"><span>Totalt</span><span className="text-primary">{nok(total)}</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

