import { useEffect, useMemo, useState } from "react";
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
import { Plus, Trash2, Save, FileDown, Mail, ArrowLeft } from "lucide-react";
import { nok, num, fmtDate, toISODate, UNITS as FALLBACK_UNITS } from "@/lib/format";
import { openPrintPdf, escapeHtml } from "@/lib/pdf";
import { useAppSettings } from "@/hooks/use-app-settings";

interface ALine { id?: string; sort_order: number; description: string; quantity: number; unit: string; unit_price: number; }
interface AState {
  id?: string; amendment_number: string; project_id: string | null; project_ref: string; internal_description: string;
  is_mass_settlement: boolean; is_additional_work: boolean; is_price_increase: boolean;
  notified_date: string; revised_date: string | null; project_manager: string; customer_email: string;
  change_description: string; reason: string; other_notes: string;
}

function empty(): AState {
  return {
    amendment_number: "", project_id: null, project_ref: "", internal_description: "",
    is_mass_settlement: false, is_additional_work: false, is_price_increase: false,
    notified_date: toISODate(new Date()), revised_date: null,
    project_manager: "", customer_email: "",
    change_description: "", reason: "", other_notes: "",
  };
}

export function AmendmentForm({ amendmentId }: { amendmentId?: string }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isEdit = !!amendmentId;
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

  const [a, setA] = useState<AState>(() => empty());
  const [lines, setLines] = useState<ALine[]>([]);
  const [init, setInit] = useState(false);

  useEffect(() => {
    if (!isEdit && !init) { setA(empty()); setInit(true); }
    if (isEdit && loaded && !init) { setA(loaded.amendment as any); setLines(loaded.lines); setInit(true); }
  }, [isEdit, loaded, init]);

  const subtotal = useMemo(() => lines.reduce((s, l) => s + Number(l.quantity || 0) * Number(l.unit_price || 0), 0), [lines]);
  const set = <K extends keyof AState>(k: K, v: AState[K]) => setA((p) => ({ ...p, [k]: v }));

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

  const addLine = () => setLines((p) => [...p, { sort_order: p.length, description: "", quantity: 1, unit: "stk", unit_price: 0 }]);
  const removeLine = (i: number) => setLines((p) => p.filter((_, idx) => idx !== i));
  const updLine = (i: number, patch: Partial<ALine>) => setLines((p) => p.map((l, idx) => idx === i ? { ...l, ...patch } : l));

  // Generate amendment number: [project]-[seq]
  async function nextNumber(project: string): Promise<string> {
    const prefix = (project || "0").trim();
    const { data } = await supabase.from("amendments").select("amendment_number").like("amendment_number", `${prefix}-%`);
    const nums = (data ?? []).map((r) => {
      const m = r.amendment_number.match(/-(\d+)$/);
      return m ? parseInt(m[1]) : 0;
    });
    const next = (nums.length ? Math.max(...nums) : 0) + 1;
    return `${prefix}-${next}`;
  }

  const save = async (): Promise<string | null> => {
    if (!a.project_ref.trim()) { toast.error("Prosjekt er påkrevd"); return null; }
    let number = a.amendment_number;
    if (!isEdit && !number) number = await nextNumber(a.project_ref);

    const payload = {
      amendment_number: number, project_id: a.project_id || null,
      project_ref: a.project_ref, internal_description: a.internal_description,
      is_mass_settlement: a.is_mass_settlement, is_additional_work: a.is_additional_work, is_price_increase: a.is_price_increase,
      notified_date: a.notified_date, revised_date: a.revised_date || null,
      project_manager: a.project_manager || null, customer_email: a.customer_email || null,
      change_description: a.change_description, reason: a.reason, other_notes: a.other_notes,
    };
    let id = amendmentId;
    if (isEdit) {
      const { error } = await supabase.from("amendments").update(payload).eq("id", amendmentId!);
      if (error) { toast.error(error.message); return null; }
      await supabase.from("amendment_lines").delete().eq("amendment_id", amendmentId!);
    } else {
      const { data, error } = await supabase.from("amendments").insert(payload).select("id").single();
      if (error) { toast.error(error.message); return null; }
      id = data.id;
      setA((p) => ({ ...p, amendment_number: number }));
    }
    if (lines.length) {
      const ins = lines.map((l, idx) => ({
        amendment_id: id!, sort_order: idx, description: l.description,
        quantity: Number(l.quantity || 0), unit: l.unit, unit_price: Number(l.unit_price || 0),
      }));
      const { error } = await supabase.from("amendment_lines").insert(ins);
      if (error) { toast.error(error.message); return null; }
    }
    qc.invalidateQueries({ queryKey: ["amendments"] });
    qc.invalidateQueries({ queryKey: ["amendment", id] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    toast.success("Endringsmelding lagret");
    return id!;
  };

  const handleSave = async () => { const id = await save(); if (id && !isEdit) navigate({ to: "/endringsmeldinger/$id", params: { id } }); };
  const handlePdf = async () => { const id = await save(); if (!id) return; generatePdf({ ...a, id }, lines, subtotal); };
  const handleEmail = async () => {
    const id = await save(); if (!id) return;
    if (!a.customer_email) { toast.error("Mangler kunde-e-post"); return; }
    const subject = `Endringsmelding nr. ${a.amendment_number} – Prosjekt ${a.project_ref}`;
    const body = `Hei,\n\nVedlagt finner du endringsmelding nr. ${a.amendment_number} for prosjekt ${a.project_ref}.\n\nMed vennlig hilsen\n${appSettings?.company_name ?? "Tilbudssystem"}`;
    const cc = a.project_manager && a.project_manager.includes("@") ? `&cc=${encodeURIComponent(a.project_manager)}` : "";
    window.location.href = `mailto:${encodeURIComponent(a.customer_email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}${cc}`;
  };

  if (isEdit && !init) return <div className="text-muted-foreground">Laster…</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild><Link to="/endringsmeldinger"><ArrowLeft className="mr-1 h-4 w-4" />Tilbake</Link></Button>
          <h1 className="text-2xl font-bold">{isEdit ? `Endringsmelding ${a.amendment_number}` : "Ny endringsmelding"}</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleEmail}><Mail className="mr-2 h-4 w-4" />Send på e-post</Button>
          <Button variant="outline" onClick={handlePdf}><FileDown className="mr-2 h-4 w-4" />Lagre og last ned PDF</Button>
          <Button onClick={handleSave}><Save className="mr-2 h-4 w-4" />Lagre</Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <div className="space-y-4 rounded-xl border bg-card p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Endringsinfo</h2>
          <div className="space-y-2">
            <Label>Knytt til prosjekt</Label>
            <Select value={a.project_id ?? "__none"} onValueChange={pickProject}>
              <SelectTrigger><SelectValue placeholder="Vel prosjekt…" /></SelectTrigger>
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
            <table className="w-full text-sm">
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
                            placeholder="Skriv eining…"
                            value={l.unit}
                            onChange={(e) => updLine(i, { unit: e.target.value })}
                            autoFocus
                          />
                        )}
                      </td>
                      <td className="px-2 py-2"><Input type="number" step="1" className="text-right no-spinner" value={l.unit_price} onChange={(e) => updLine(i, { unit_price: Number(e.target.value) })} onFocus={(e) => e.target.select()} /></td>
                      <td className="px-2 py-2 text-right font-medium">{nok(Number(l.quantity || 0) * Number(l.unit_price || 0))}</td>
                      <td className="px-1 py-2"><Button size="icon" variant="ghost" onClick={() => removeLine(i)}><Trash2 className="h-4 w-4 text-destructive" /></Button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="mt-4 ml-auto max-w-sm border-t pt-4">
              <div className="flex justify-between text-lg font-bold"><span>Total eks. mva</span><span className="text-primary">{nok(subtotal)}</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function generatePdf(a: AState, lines: ALine[], subtotal: number) {
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
      <div><h1>${escapeHtml(appSettings?.company_name ?? "Tilbudssystem")}</h1><div style="font-size:9.5pt;color:#555;margin-top:4px">Endringsmelding</div></div>
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

    <div class="footer">Prosjektleder: ${escapeHtml(a.project_manager || "—")} · ${escapeHtml(appSettings?.company_name ?? "Tilbudssystem")}</div>
  `;
  openPrintPdf(`Endringsmelding-${a.amendment_number}`, html);
}
