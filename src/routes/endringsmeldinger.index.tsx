import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { nok, fmtDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, Check } from "lucide-react";

export const Route = createFileRoute("/endringsmeldinger/")({
  component: AmendmentsList,
});

function AmendmentsList() {
  const [q, setQ] = useState("");
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ["amendments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("amendments")
        .select("*, amendment_lines(quantity, unit_price), offers(id, offer_number, title, customer_name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return data ?? [];
    // Søket dekker også det koblede tilbudet, så du finner en endringsmelding
    // igjen ut fra tilbudsnummer, tittel eller kundenavn
    return (data ?? []).filter((a: any) =>
      [
        a.amendment_number, a.project_ref, a.internal_description,
        a.change_description, a.reason, a.other_notes,
        a.project_manager, a.customer_email,
        a.offers?.title, a.offers?.customer_name,
        a.offers?.offer_number != null ? `#${a.offers.offer_number}` : null,
      ].some((s) => String(s ?? "").toLowerCase().includes(t))
    );
  }, [data, q]);

  const sumOf = (a: any) => (a.amendment_lines ?? []).reduce((s: number, l: any) => s + Number(l.quantity ?? 0) * Number(l.unit_price ?? 0), 0);
  const tick = (on: boolean) => on ? <Check className="h-4 w-4 text-success" /> : <span className="text-muted-foreground/30">—</span>;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Endringsmeldinger</h1>
          <p className="mt-1 text-sm text-muted-foreground">{rows.length} meldinger</p>
        </div>
        <Button asChild><Link to="/endringsmeldinger/ny"><Plus className="mr-2 h-4 w-4" />Ny endringsmelding</Link></Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Søk på nr., prosjekt, tilbud, kunde eller tekst…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
        <table className="w-full">
          <thead className="border-b bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Nr.</th>
              <th className="px-4 py-3">Prosjekt</th>
              <th className="px-4 py-3">Tilbud</th>
              <th className="px-4 py-3">Beskrivelse</th>
              <th className="px-4 py-3">Varslet</th>
              <th className="px-4 py-3">Revidert</th>
              <th className="px-4 py-3">Prosjektleder</th>
              <th className="px-4 py-3 text-center">Masse</th>
              <th className="px-4 py-3 text-center">Tillegg</th>
              <th className="px-4 py-3 text-center">Pris↑</th>
              <th className="px-4 py-3 text-right">Sum eks. mva</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={11} className="px-4 py-12 text-center text-muted-foreground">Laster…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={11} className="px-4 py-12 text-center text-muted-foreground">Ingen endringsmeldinger.</td></tr>
            ) : rows.map((a: any, i: number) => (
              <tr key={a.id}
                className={`cursor-pointer border-b transition-colors hover:bg-accent/40 ${i % 2 === 1 ? "bg-muted/20" : ""}`}
                onClick={() => navigate({ to: "/endringsmeldinger/$id", params: { id: a.id } })}>
                <td className="px-4 py-3 tabular-nums text-sm text-primary">{a.amendment_number}</td>
                <td className="px-4 py-3">{a.project_ref ?? "—"}</td>
                <td className="px-4 py-3">
                  {a.offers ? (
                    // stopPropagation, ellers ville radklikket tatt over og ført
                    // til endringsmeldingen i stedet for tilbudet
                    <Link
                      to="/tilbud/$id"
                      params={{ id: a.offers.id }}
                      onClick={(e) => e.stopPropagation()}
                      className="text-primary hover:underline"
                      title={a.offers.customer_name ?? ""}
                    >
                      #{a.offers.offer_number} {a.offers.title}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground/50">—</span>
                  )}
                </td>
                <td className="px-4 py-3">{a.internal_description ?? "—"}</td>
                <td className="px-4 py-3 text-sm">{fmtDate(a.notified_date)}</td>
                <td className="px-4 py-3 text-sm">{fmtDate(a.revised_date)}</td>
                <td className="px-4 py-3 text-sm">{a.project_manager ?? "—"}</td>
                <td className="px-4 py-3 text-center">{tick(a.is_mass_settlement)}</td>
                <td className="px-4 py-3 text-center">{tick(a.is_additional_work)}</td>
                <td className="px-4 py-3 text-center">{tick(a.is_price_increase)}</td>
                <td className="px-4 py-3 text-right font-medium">{nok(sumOf(a))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
