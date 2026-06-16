import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { nok, fmtDate } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

export const Route = createFileRoute("/ordre")({
  component: OrdrePage,
});

type OrdreStatus = "Ikke startet" | "Delvis utført" | "Utført";

function getOrdreStatus(invoiced: number, total: number): OrdreStatus {
  if (total <= 0 || invoiced <= 0) return "Ikke startet";
  if (invoiced >= total) return "Utført";
  return "Delvis utført";
}

const STATUS_STYLE: Record<OrdreStatus, string> = {
  "Ikke startet": "bg-slate-100 text-slate-700 border-slate-300",
  "Delvis utført": "bg-yellow-100 text-yellow-800 border-yellow-300",
  "Utført":        "bg-green-100 text-green-800 border-green-300",
};

function ProgressBar({ pct }: { pct: number }) {
  const color = pct >= 100 ? "bg-green-500" : pct > 0 ? "bg-amber-400" : "bg-muted-foreground/30";
  return (
    <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  );
}

function OrdrePage() {
  const [q, setQ] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["offers-godkjent"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("offers")
        .select("id, offer_number, title, customer_name, offer_date, valid_until, our_ref, project_number, offer_lines(quantity, unit_price, included), admin_cost_pct, invoiced_amount")
        .eq("status", "godkjent")
        .order("offer_number", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const sumOf = (o: any) => {
    const base = (o.offer_lines ?? [])
      .filter((l: any) => l.included !== false)
      .reduce((s: number, l: any) => s + Number(l.quantity ?? 0) * Number(l.unit_price ?? 0), 0);
    const pct = Number(o.admin_cost_pct ?? 0);
    return base + base * (pct / 100);
  };

  const rows = (data ?? []).filter((o: any) => {
    if (!q) return true;
    const t = q.toLowerCase();
    return [o.title, o.customer_name, String(o.offer_number)].some((s) => (s ?? "").toLowerCase().includes(t));
  });

  const today = new Date().toISOString().slice(0, 10);

  const totals = rows.reduce(
    (acc: any, o: any) => {
      const total = sumOf(o);
      const inv = Number(o.invoiced_amount ?? 0);
      acc.total += total;
      acc.invoiced += inv;
      return acc;
    },
    { total: 0, invoiced: 0 }
  );

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Ordre</h1>
          <p className="mt-1 text-sm text-muted-foreground">{rows.length} godkjente tilbud</p>
        </div>
      </div>

      {/* Sammendrag */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total ordreverdi", value: nok(totals.total) },
          { label: "Fakturert", value: nok(totals.invoiced) },
          { label: "Gjenstår", value: nok(Math.max(0, totals.total - totals.invoiced)) },
        ].map((c) => (
          <div key={c.label} className="rounded-xl border bg-card p-5 shadow-sm">
            <p className="text-sm text-muted-foreground">{c.label}</p>
            <p className="mt-1 text-2xl font-bold tracking-tight">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Søk på kunde, beskrivelse eller nr…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
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
              <th className="px-4 py-3">Vår ref.</th>
              <th className="px-4 py-3 text-right">Totalt</th>
              <th className="px-4 py-3 text-right">Fakturert</th>
              <th className="px-4 py-3">Fremdrift</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">Laster…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">Ingen godkjente tilbud.</td></tr>
            ) : rows.map((o: any, i: number) => {
              const total = sumOf(o);
              const invoiced = Number(o.invoiced_amount ?? 0);
              const pct = total > 0 ? (invoiced / total) * 100 : 0;
              const ordreStatus = getOrdreStatus(invoiced, total);
              return (
                <tr
                  key={o.id}
                  className={`cursor-pointer border-b transition-colors hover:bg-accent/40 ${i % 2 === 1 ? "bg-muted/20" : ""}`}
                  onClick={() => (window.location.href = `/tilbud/${o.id}`)}
                >
                  <td className="px-4 py-3 font-mono text-sm text-primary">#{o.offer_number}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[ordreStatus]}`}>
                      {ordreStatus}
                    </span>
                  </td>
                  <td className="px-4 py-3">{o.customer_name ?? "—"}</td>
                  <td className="px-4 py-3">{o.title}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{fmtDate(o.offer_date)}</td>
                  <td className="px-4 py-3 text-sm">{o.our_ref ?? "—"}</td>
                  <td className="px-4 py-3 text-right font-medium">{nok(total)}</td>
                  <td className="px-4 py-3 text-right text-sm text-muted-foreground">{invoiced > 0 ? nok(invoiced) : "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      <ProgressBar pct={pct} />
                      <span className="text-xs text-muted-foreground">{Math.round(pct)}%</span>
                    </div>
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
