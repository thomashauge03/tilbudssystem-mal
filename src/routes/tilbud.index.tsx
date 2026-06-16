import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { nok, fmtDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, Search, Trash2 } from "lucide-react";

const STATUSES = ["Avventes", "Godkjent"] as const;
type OfferStatus = typeof STATUSES[number];

const STATUS_STYLE: Record<OfferStatus, string> = {
  Avventes: "bg-yellow-100 text-yellow-800 border-yellow-300",
  Godkjent: "bg-green-100 text-green-800 border-green-300",
};

function StatusBadge({ status, offerId, onUpdate }: { status: OfferStatus; offerId: string; onUpdate: () => void }) {
  const update = async (next: OfferStatus) => {
    await supabase.from("offers").update({ status: next }).eq("id", offerId);
    onUpdate();
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          onClick={(e) => e.stopPropagation()}
          className={`rounded-full border px-2 py-0.5 text-xs font-semibold cursor-pointer transition-colors ${STATUS_STYLE[status] ?? "bg-muted text-muted-foreground"}`}
        >
          {status ?? "Avventes"}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" onClick={(e) => e.stopPropagation()}>
        {STATUSES.map((s) => (
          <DropdownMenuItem key={s} onClick={() => update(s)} className="cursor-pointer">
            <span className={`mr-2 inline-block h-2 w-2 rounded-full ${s === "Avventes" ? "bg-yellow-400" : "bg-green-500"}`} />
            {s}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export const Route = createFileRoute("/tilbud/")({
  component: OffersList,
});

function OffersList() {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "expired">("all");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("offers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["offers"] });
      setDeleteTarget(null);
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["offers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("offers")
        .select("id, offer_number, title, customer_name, offer_date, valid_until, updated_at, our_ref, project_number, offer_lines(quantity, unit_price, included), admin_cost_pct, status")
        .order("offer_number", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const today = new Date().toISOString().slice(0, 10);
  const rows = (data ?? [])
    .filter((o: any) => {
      if (filter === "active" && o.valid_until < today) return false;
      if (filter === "expired" && o.valid_until >= today) return false;
      if (!q) return true;
      const t = q.toLowerCase();
      return [o.title, o.customer_name, String(o.offer_number)].some((s) => (s ?? "").toLowerCase().includes(t));
    });

  const sumOf = (o: any) => {
    const base = (o.offer_lines ?? [])
      .filter((l: any) => l.included !== false)
      .reduce((s: number, l: any) => s + Number(l.quantity ?? 0) * Number(l.unit_price ?? 0), 0);
    const pct = Number(o.admin_cost_pct ?? 0);
    return base + base * (pct / 100);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Tilbud</h1>
          <p className="mt-1 text-sm text-muted-foreground">{rows.length} tilbud</p>
        </div>
        <Button asChild>
          <Link to="/tilbud/ny"><Plus className="mr-2 h-4 w-4" />Nytt tilbud</Link>
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Søk på kunde, beskrivelse eller nr…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
        </div>
        <div className="flex rounded-md border bg-card p-1">
          {(["all", "active", "expired"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded px-3 py-1 text-sm font-medium transition-colors ${filter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {f === "all" ? "Alle" : f === "active" ? "Aktive" : "Utløpte"}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <table className="w-full">
          <thead className="border-b bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Nr.</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Kunde</th>
              <th className="px-4 py-3">Beskrivelse</th>
              <th className="px-4 py-3">Dato</th>
              <th className="px-4 py-3">Gyldig t.o.m.</th>
              <th className="px-4 py-3">Vår ref.</th>
              <th className="px-4 py-3">Prosjektnr.</th>
              <th className="px-4 py-3 text-right">Sum eks. mva</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={10} className="px-4 py-12 text-center text-muted-foreground">Laster…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={10} className="px-4 py-12 text-center text-muted-foreground">Ingen tilbud funnet.</td></tr>
            ) : (
              rows.map((o: any, i: number) => (
                <tr
                  key={o.id}
                  className={`cursor-pointer border-b transition-colors hover:bg-accent/40 ${i % 2 === 1 ? "bg-muted/20" : ""}`}
                  onClick={() => (window.location.href = `/tilbud/${o.id}`)}
                >
                  <td className="px-4 py-3 font-mono text-sm text-primary">#{o.offer_number}</td>
                  <td className="px-4 py-3">
                    <StatusBadge
                      status={(o.status ?? "Avventes") as OfferStatus}
                      offerId={o.id}
                      onUpdate={() => queryClient.invalidateQueries({ queryKey: ["offers"] })}
                    />
                  </td>
                  <td className="px-4 py-3">{o.customer_name ?? "—"}</td>
                  <td className="px-4 py-3">{o.title}</td>
                  <td className="px-4 py-3 text-sm">{fmtDate(o.offer_date)}</td>
                  <td className={`px-4 py-3 text-sm ${o.valid_until < today ? "text-destructive" : "text-muted-foreground"}`}>{fmtDate(o.valid_until)}</td>
                  <td className="px-4 py-3 text-sm">{o.our_ref ?? "—"}</td>
                  <td className="px-4 py-3 text-sm">{o.project_number ?? "—"}</td>
                  <td className="px-4 py-3 text-right font-medium">{nok(sumOf(o))}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeleteTarget({ id: o.id, title: o.title }); }}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                      title="Slett tilbud"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Slett tilbud</AlertDialogTitle>
            <AlertDialogDescription>
              Er du sikker på at du vil slette <strong>{deleteTarget?.title}</strong>? Dette kan ikke angres.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              Slett
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
