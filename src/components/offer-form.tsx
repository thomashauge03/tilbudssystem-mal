import { useEffect, useMemo, useState } from "react";
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
import { Plus, Trash2, Save, FileDown, Mail, ArrowLeft, ChevronDown } from "lucide-react";
import { nok, num, fmtDate, toISODate, addDays, UNITS as FALLBACK_UNITS } from "@/lib/format";
import { openOfferPdf } from "@/lib/pdf";
import { Link } from "@tanstack/react-router";
import { useAppSettings } from "@/hooks/use-app-settings";

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
}

function emptyOffer(adminPct: number, validityDays: number, defaultRef: string, defaultText = ""): OfferState {
  const today = new Date();
  return {
    title: "", project_id: null, customer_id: null, customer_name: "", customer_email: "",
    offer_text: defaultText, offer_date: toISODate(today), valid_until: toISODate(addDays(today, validityDays)),
    their_ref: "", our_ref: defaultRef, project_number: "", admin_cost_pct: adminPct, forbehold: [],
  };
}

export function OfferForm({ offerId }: { offerId?: string }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isEdit = !!offerId;
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

  const { data: customers } = useQuery({
    queryKey: ["customers-simple"],
    queryFn: async () => {
      const { data } = await supabase.from("customers").select("id, name, email, phone, address").order("name");
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

  useEffect(() => {
    if (!isEdit && !initialized && adminCost !== undefined && appSettings !== undefined) {
      setOffer(emptyOffer(adminCost, appSettings.offer_validity_days, appSettings.our_refs[0]?.name ?? "", appSettings.default_offer_text));
      setInitialized(true);
    }
    if (isEdit && loaded && !initialized) {
      const lo = loaded.offer as any;
      setOffer({ ...lo, forbehold: Array.isArray(lo.forbehold) ? lo.forbehold : [] });
      setLines(loaded.lines.length ? loaded.lines : []);
      setInitialized(true);
    }
  }, [isEdit, loaded, adminCost, initialized]);

  const lineSum = (l: Line) => {
    const gross = Number(l.quantity || 0) * Number(l.unit_price || 0);
    return gross * (1 - Number(l.discount_pct || 0) / 100);
  };

  const subtotal = useMemo(
    () => lines.filter((l) => l.included).reduce((s, l) => s + lineSum(l), 0),
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
    };

    let id = offerId;
    if (isEdit) {
      const { error } = await supabase.from("offers").update(payload).eq("id", offerId!);
      if (error) { toast.error(error.message); return null; }
      await supabase.from("offer_lines").delete().eq("offer_id", offerId!);
    } else {
      const { data, error } = await supabase.from("offers").insert({ ...payload, status: "Avventes" }).select("id").single();
      if (error) { toast.error(error.message); return null; }
      id = data.id;
    }

    if (lines.length) {
      const linesInsert = lines.map((l, idx) => ({
        offer_id: id!,
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
    if (!offer.customer_email) { toast.error("Kunden mangler e-postadresse"); return; }
    const subject = `Tilbud nr. ${offer.offer_number ?? ""} – ${offer.title}`;
    const senderName = appSettings?.company_name ?? "Tilbudssystem";
    const body = `Hei,\n\nVedlagt finner du tilbud nr. ${offer.offer_number ?? ""} fra ${senderName}.\n\nTilbudet er gyldig t.o.m. ${fmtDate(offer.valid_until)}.\n\nTa gjerne kontakt om du har spørsmål.\n\nMed vennlig hilsen\n${senderName}`;
    window.location.href = `mailto:${encodeURIComponent(offer.customer_email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  if (isEdit && !initialized) return <div className="text-muted-foreground">Laster…</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild><Link to="/tilbud"><ArrowLeft className="mr-1 h-4 w-4" />Tilbake</Link></Button>
          <h1 className="text-2xl font-bold">
            {isEdit ? `Tilbud #${offer.offer_number ?? ""}` : "Nytt tilbud"}
          </h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleEmail}><Mail className="mr-2 h-4 w-4" />Send på e-post</Button>
          <Button variant="outline" onClick={handlePdf}><FileDown className="mr-2 h-4 w-4" />Lagre og last ned PDF</Button>
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
            <Select value={offer.project_id ?? "__none"} onValueChange={pickProject}>
              <SelectTrigger><SelectValue placeholder="Knytt til prosjekt…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">— Ikkje knytt til prosjekt —</SelectItem>
                {(projects ?? []).map((p: any) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}{p.project_number ? ` (#${p.project_number})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Kunde</Label>
            <Select value={offer.customer_id ?? "__none"} onValueChange={pickCustomer}>
              <SelectTrigger><SelectValue placeholder="Velg fra kunderegister…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">— Skriv inn manuelt —</SelectItem>
                {(customers ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
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
            <table className="w-full text-sm">
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

            <div className="mt-4 ml-auto max-w-sm space-y-2 border-t pt-4">
              {admin > 0 && (
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Sum eks. mva</span><span className="font-medium">{nok(subtotal)}</span></div>
              )}
              {admin > 0 && (
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Adm.påslag ({num(offer.admin_cost_pct)} %)</span><span className="font-medium">{nok(admin)}</span></div>
              )}
              <div className="flex justify-between border-t pt-2 text-lg font-bold"><span>Totalt</span><span className="text-primary">{nok(total)}</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

