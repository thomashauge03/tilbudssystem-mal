import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Search, Pencil, FolderOpen } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { fmtDate, nok } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/prosjekter")({
  component: ProsjekterPage,
});

type Status = "aktiv" | "fullført" | "pause";

interface Project {
  id?: string;
  name: string;
  project_number: string;
  customer_id: string | null;
  customer_name: string;
  status: Status;
  description: string;
  start_date: string;
}

const STATUS_LABELS: Record<Status, string> = {
  aktiv: "Aktiv",
  fullført: "Fullført",
  pause: "På vent",
};

const STATUS_COLORS: Record<Status, string> = {
  aktiv: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  fullført: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  pause: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
};

function emptyProject(): Project {
  return {
    name: "", project_number: "", customer_id: null, customer_name: "",
    status: "aktiv", description: "", start_date: "",
  };
}

function ProsjekterPage() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | Status>("all");
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Project | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const [p, c, o, am] = await Promise.all([
        supabase.from("projects").select("*").order("created_at", { ascending: false }),
        supabase.from("customers").select("id, name"),
        supabase.from("offers").select("project_id, invoiced_amount").not("project_id", "is", null),
        supabase.from("amendments").select("project_id, invoiced_amount").not("project_id", "is", null),
      ]);
      const customerMap = new Map((c.data ?? []).map((x: any) => [x.id, x.name]));

      const statsByProject = new Map<string, { offers: number; amendments: number; invoiced: number }>();
      for (const offer of o.data ?? []) {
        if (!offer.project_id) continue;
        const e = statsByProject.get(offer.project_id) ?? { offers: 0, amendments: 0, invoiced: 0 };
        statsByProject.set(offer.project_id, { ...e, offers: e.offers + 1, invoiced: e.invoiced + Number(offer.invoiced_amount ?? 0) });
      }
      for (const amd of am.data ?? []) {
        if (!amd.project_id) continue;
        const e = statsByProject.get(amd.project_id) ?? { offers: 0, amendments: 0, invoiced: 0 };
        statsByProject.set(amd.project_id, { ...e, amendments: e.amendments + 1, invoiced: e.invoiced + Number(amd.invoiced_amount ?? 0) });
      }

      return (p.data ?? []).map((x: any) => ({
        ...x,
        customer_display: customerMap.get(x.customer_id) ?? x.customer_name ?? "—",
        stats: statsByProject.get(x.id) ?? { offers: 0, amendments: 0, invoiced: 0 },
      }));
    },
  });

  const { data: customers } = useQuery({
    queryKey: ["customers-simple"],
    queryFn: async () => {
      const { data } = await supabase.from("customers").select("id, name, email").order("name");
      return data ?? [];
    },
  });

  const rows = (data ?? []).filter((p: any) => {
    const matchQ = !q || [p.name, p.project_number, p.customer_display].some(
      (s) => (s ?? "").toLowerCase().includes(q.toLowerCase())
    );
    const matchStatus = filterStatus === "all" || p.status === filterStatus;
    return matchQ && matchStatus;
  });

  const save = async (p: Project) => {
    if (!p.name.trim()) { toast.error("Prosjektnamn er påkrevd"); return; }
    const payload = {
      name: p.name,
      project_number: p.project_number || null,
      customer_id: p.customer_id || null,
      customer_name: p.customer_name || null,
      status: p.status,
      description: p.description || null,
      start_date: p.start_date || null,
    };
    const { error } = p.id
      ? await supabase.from("projects").update(payload).eq("id", p.id)
      : await supabase.from("projects").insert({ ...payload, tenant_id: tenantId });
    if (error) { toast.error(error.message); return; }
    toast.success(p.id ? "Prosjekt oppdatert" : "Prosjekt oppretta");
    setOpen(false);
    setEdit(null);
    qc.invalidateQueries({ queryKey: ["projects"] });
  };

  const openNew = () => { setEdit(emptyProject()); setOpen(true); };
  const openEdit = (p: any) => {
    setEdit({
      id: p.id, name: p.name, project_number: p.project_number ?? "",
      customer_id: p.customer_id, customer_name: p.customer_name ?? "",
      status: p.status, description: p.description ?? "", start_date: p.start_date ?? "",
    });
    setOpen(true);
  };

  const pickCustomer = (id: string) => {
    if (!edit) return;
    if (id === "__none") { setEdit({ ...edit, customer_id: null, customer_name: "" }); return; }
    const c = (customers ?? []).find((x: any) => x.id === id);
    setEdit({ ...edit, customer_id: id, customer_name: c?.name ?? "" });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Prosjekt</h1>
          <p className="mt-1 text-sm text-muted-foreground">{rows.length} prosjekt</p>
        </div>
        <Button onClick={openNew}>
          <Plus className="mr-2 h-4 w-4" />Nytt prosjekt
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Søk på namn, nummer, kunde…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
        </div>
        <div className="flex gap-1 rounded-lg border bg-muted/40 p-1">
          {(["all", "aktiv", "fullført", "pause"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`rounded px-3 py-1 text-sm font-medium transition-colors ${
                filterStatus === s
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {s === "all" ? "Alle" : STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
        <table className="w-full">
          <thead className="border-b bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Prosjekt</th>
              <th className="px-4 py-3">Kunde</th>
              <th className="px-4 py-3">Startdato</th>
              <th className="px-4 py-3 text-center">Tilbud</th>
              <th className="px-4 py-3 text-center">Endr.</th>
              <th className="px-4 py-3 text-right">Fakturert</th>
              <th className="px-4 py-3">Status</th>
              <th className="w-12"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">Laster…</td></tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-16 text-center">
                  <FolderOpen className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
                  <p className="text-muted-foreground">Ingen prosjekt funne</p>
                </td>
              </tr>
            ) : rows.map((p: any, i: number) => (
              <tr key={p.id} className={`border-b transition-colors hover:bg-accent/40 ${i % 2 === 1 ? "bg-muted/20" : ""}`}>
                <td className="px-4 py-3">
                  <div className="font-medium">{p.name}</div>
                  {p.project_number && (
                    <div className="text-xs text-muted-foreground font-mono mt-0.5">#{p.project_number}</div>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground">{p.customer_display}</td>
                <td className="px-4 py-3 text-sm text-muted-foreground">{p.start_date ? fmtDate(p.start_date) : "—"}</td>
                <td className="px-4 py-3 text-center text-sm">{p.stats.offers || "—"}</td>
                <td className="px-4 py-3 text-center text-sm">{p.stats.amendments || "—"}</td>
                <td className="px-4 py-3 text-right text-sm font-medium">
                  {p.stats.invoiced > 0 ? nok(p.stats.invoiced) : "—"}
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[p.status as Status]}`}>
                    {STATUS_LABELS[p.status as Status] ?? p.status}
                  </span>
                </td>
                <td className="px-2">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(p)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{edit?.id ? "Rediger prosjekt" : "Nytt prosjekt"}</DialogTitle>
          </DialogHeader>
          {edit && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-1">
                  <Label>Prosjektnamn *</Label>
                  <Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="T.d. Vegarbeid Fv44" />
                </div>
                <div className="space-y-1">
                  <Label>Prosjektnummer</Label>
                  <Input value={edit.project_number} onChange={(e) => setEdit({ ...edit, project_number: e.target.value })} placeholder="T.d. 2026-001" />
                </div>
                <div className="space-y-1">
                  <Label>Startdato</Label>
                  <Input type="date" value={edit.start_date} onChange={(e) => setEdit({ ...edit, start_date: e.target.value })} />
                </div>
              </div>

              <div className="space-y-1">
                <Label>Kunde</Label>
                <Select value={edit.customer_id ?? "__none"} onValueChange={pickCustomer}>
                  <SelectTrigger><SelectValue placeholder="Vel kunde…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">— Ingen / manuell —</SelectItem>
                    {(customers ?? []).map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {!edit.customer_id && (
                <div className="space-y-1">
                  <Label>Kundenamn (manuelt)</Label>
                  <Input value={edit.customer_name} onChange={(e) => setEdit({ ...edit, customer_name: e.target.value })} placeholder="Namn på kunde…" />
                </div>
              )}

              <div className="space-y-1">
                <Label>Status</Label>
                <Select value={edit.status} onValueChange={(v) => setEdit({ ...edit, status: v as Status })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="aktiv">Aktiv</SelectItem>
                    <SelectItem value="pause">På vent</SelectItem>
                    <SelectItem value="fullført">Fullført</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>Beskriving</Label>
                <Textarea rows={3} value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} placeholder="Kort beskriving av prosjektet…" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Avbryt</Button>
            <Button onClick={() => edit && save(edit)}>Lagre</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
