import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Search, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/kunder")({
  component: CustomersPage,
});

interface Customer {
  id?: string; name: string; email: string | null; phone: string | null;
  address: string | null; contact_person: string | null; notes: string | null;
}

function CustomersPage() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Customer | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["customers-full"],
    queryFn: async () => {
      const [c, o] = await Promise.all([
        supabase.from("customers").select("*").order("name"),
        supabase.from("offers").select("customer_id"),
      ]);
      const counts = new Map<string, number>();
      (o.data ?? []).forEach((r: any) => {
        if (r.customer_id) counts.set(r.customer_id, (counts.get(r.customer_id) ?? 0) + 1);
      });
      return (c.data ?? []).map((x: any) => ({ ...x, offer_count: counts.get(x.id) ?? 0 }));
    },
  });

  const rows = (data ?? []).filter((c: any) =>
    !q || [c.name, c.email, c.contact_person].some((s) => (s ?? "").toLowerCase().includes(q.toLowerCase()))
  );

  const deleteCustomer = async (id: string) => {
    const { error } = await supabase.from("customers").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Kunde slettet");
    setDeleteTarget(null);
    qc.invalidateQueries({ queryKey: ["customers-full"] });
    qc.invalidateQueries({ queryKey: ["customers-simple"] });
  };

  const save = async (c: Customer) => {
    if (!c.name.trim()) { toast.error("Navn er påkrevd"); return; }
    const payload = {
      name: c.name, email: c.email || null, phone: c.phone || null,
      address: c.address || null, contact_person: c.contact_person || null,
      notes: c.notes || null,
    };
    const { error } = c.id
      ? await supabase.from("customers").update(payload).eq("id", c.id)
      : await supabase.from("customers").insert({ ...payload, tenant_id: tenantId });
    if (error) { toast.error(error.message); return; }
    toast.success("Kunde lagret");
    setOpen(false); setEdit(null);
    qc.invalidateQueries({ queryKey: ["customers-full"] });
    qc.invalidateQueries({ queryKey: ["customers-simple"] });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Kunder</h1>
          <p className="mt-1 text-sm text-muted-foreground">{rows.length} kunder</p>
        </div>
        <Button onClick={() => { setEdit({ name: "", email: "", phone: "", address: "", contact_person: "", notes: "" }); setOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" />Ny kunde
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Søk…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
      </div>

      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <table className="w-full">
          <thead className="border-b bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Navn</th>
              <th className="px-4 py-3">E-post</th>
              <th className="px-4 py-3">Telefon</th>
              <th className="px-4 py-3">Adresse</th>
              <th className="px-4 py-3 text-right">Tilbud</th>
              <th className="w-12"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">Laster…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">Ingen kunder.</td></tr>
            ) : rows.map((c: any, i: number) => (
              <tr key={c.id} className={`border-b transition-colors hover:bg-accent/40 ${i % 2 === 1 ? "bg-muted/20" : ""}`}>
                <td className="px-4 py-3 font-medium">{c.name}</td>
                <td className="px-4 py-3 text-sm text-muted-foreground">{c.email ?? "—"}</td>
                <td className="px-4 py-3 text-sm text-muted-foreground">{c.phone ?? "—"}</td>
                <td className="px-4 py-3 text-sm text-muted-foreground">{c.address ?? "—"}</td>
                <td className="px-4 py-3 text-right text-sm">{c.offer_count}</td>
                <td className="px-2 flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => { setEdit(c); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => setDeleteTarget({ id: c.id, name: c.name })} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{edit?.id ? "Rediger kunde" : "Ny kunde"}</DialogTitle></DialogHeader>
          {edit && (
            <div className="space-y-4">
              <div><Label>Navn *</Label><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></div>
              <div><Label>E-post</Label><Input type="email" value={edit.email ?? ""} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></div>
              <div><Label>Telefon</Label><Input value={edit.phone ?? ""} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></div>
              <div><Label>Adresse</Label><Input value={edit.address ?? ""} onChange={(e) => setEdit({ ...edit, address: e.target.value })} /></div>
              <div><Label>Kontaktperson</Label><Input value={edit.contact_person ?? ""} onChange={(e) => setEdit({ ...edit, contact_person: e.target.value })} /></div>
              <div><Label>Merknader</Label><Textarea rows={3} value={edit.notes ?? ""} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} /></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Avbryt</Button>
            <Button onClick={() => edit && save(edit)}>Lagre</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Slett kunde</AlertDialogTitle>
            <AlertDialogDescription>
              Er du sikker på at du vil slette <strong>{deleteTarget?.name}</strong>? Dette kan ikke angres.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteCustomer(deleteTarget.id)}
            >
              Slett
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
