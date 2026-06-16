import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Check, Pencil } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admkost")({
  component: AdminCostsPage,
});

function AdminCostsPage() {
  const qc = useQueryClient();
  const currentYear = new Date().getFullYear();
  const [newYear, setNewYear] = useState(currentYear + 1);
  const [newPct, setNewPct] = useState(20);
  const [editId, setEditId] = useState<string | null>(null);
  const [editVal, setEditVal] = useState(0);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-costs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("admin_costs").select("*").order("year", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const add = async () => {
    const { error } = await supabase.from("admin_costs").insert({ year: newYear, percentage: newPct });
    if (error) { toast.error(error.message); return; }
    toast.success("Lagt til");
    qc.invalidateQueries({ queryKey: ["admin-costs"] });
    qc.invalidateQueries({ queryKey: ["admin-cost-current"] });
  };

  const saveEdit = async (id: string) => {
    const { error } = await supabase.from("admin_costs").update({ percentage: editVal }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    setEditId(null);
    toast.success("Oppdatert");
    qc.invalidateQueries({ queryKey: ["admin-costs"] });
    qc.invalidateQueries({ queryKey: ["admin-cost-current"] });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Administrasjonskostnader</h1>
        <p className="mt-1 text-sm text-muted-foreground">Prosentpåslag som hentes automatisk inn på nye tilbud</p>
      </div>

      <div className="rounded-xl border bg-card p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Legg til nytt år</h2>
        <div className="flex items-end gap-3">
          <div><label className="text-sm font-medium">År</label><Input type="number" value={newYear} onChange={(e) => setNewYear(Number(e.target.value))} className="w-32" /></div>
          <div><label className="text-sm font-medium">Adm.kostnader (%)</label><Input type="number" step="0.1" value={newPct} onChange={(e) => setNewPct(Number(e.target.value))} className="w-32" /></div>
          <Button onClick={add}><Plus className="mr-2 h-4 w-4" />Legg til</Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <table className="w-full">
          <thead className="border-b bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr><th className="px-4 py-3">År</th><th className="px-4 py-3">Adm.kostnader (%)</th><th className="w-32"></th></tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={3} className="px-4 py-12 text-center text-muted-foreground">Laster…</td></tr>
            ) : (data ?? []).map((r: any, i: number) => {
              const isCurrent = r.year === currentYear;
              return (
                <tr key={r.id} className={`border-b ${isCurrent ? "bg-accent/40" : i % 2 === 1 ? "bg-muted/20" : ""}`}>
                  <td className="px-4 py-3 font-medium">{r.year} {isCurrent && <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">Gjeldende</span>}</td>
                  <td className="px-4 py-3">
                    {editId === r.id ? (
                      <Input type="number" step="0.1" value={editVal} onChange={(e) => setEditVal(Number(e.target.value))} className="w-32" />
                    ) : (
                      <span className="font-mono">{Number(r.percentage)} %</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {editId === r.id ? (
                      <Button size="sm" onClick={() => saveEdit(r.id)}><Check className="mr-1 h-3 w-3" />Lagre</Button>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => { setEditId(r.id); setEditVal(Number(r.percentage)); }}><Pencil className="h-3 w-3" /></Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
