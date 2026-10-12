import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Search, Trash2, BookOpen } from "lucide-react";
import { db } from "@/lib/kalkyle-db";
import { beregnKalkyle, type KalkyleLinje } from "@/lib/kalkyle";
import { nok, fmtDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/kalkyle/")({
  component: Kalkyler,
});

interface KalkyleRad {
  id: string;
  name: string;
  customer_text: string | null;
  markup_pct: number;
  updated_at: string;
  calculation_lines: KalkyleLinje[];
}

function Kalkyler() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [sok, setSok] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["calculations"],
    queryFn: async () => {
      const { data, error } = await db
        .from("calculations")
        .select("id, name, customer_text, markup_pct, updated_at, calculation_lines(quantity, unit_price, is_heading)")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as KalkyleRad[];
    },
  });

  const synlige = useMemo(() => {
    const q = sok.trim().toLowerCase();
    return (data ?? []).filter((k) => !q || k.name.toLowerCase().includes(q) || (k.customer_text ?? "").toLowerCase().includes(q));
  }, [data, sok]);

  const slett = async (k: KalkyleRad) => {
    if (!window.confirm(`Slette kalkylen «${k.name}»? Dette kan ikke angres.`)) return;
    const { error } = await db.from("calculations").delete().eq("id", k.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Kalkylen er slettet");
    qc.invalidateQueries({ queryKey: ["calculations"] });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Kalkyle</h1>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link to="/kalkyle/kodebank"><BookOpen className="mr-1 h-4 w-4" />Kodebank</Link>
          </Button>
          <Button onClick={() => navigate({ to: "/kalkyle/ny" })}><Plus className="mr-1 h-4 w-4" />Ny kalkyle</Button>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input className="pl-8" placeholder="Søk i navn eller kunde…" value={sok} onChange={(e) => setSok(e.target.value)} />
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Laster…</p>
      ) : error ? (
        <p className="text-destructive">Kunne ikke hente kalkylene: {(error as Error).message}</p>
      ) : synlige.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground">
          {data?.length ? "Ingen kalkyler passer søket." : "Ingen kalkyler ennå. Trykk «Ny kalkyle» for å starte."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Navn</th>
                <th className="px-3 py-2 text-left">Kunde / prosjekt</th>
                <th className="px-3 py-2 text-right">Sum eks. mva</th>
                <th className="px-3 py-2 text-left">Sist endret</th>
                <th className="w-12 px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {synlige.map((k) => (
                <tr key={k.id} className="cursor-pointer border-b hover:bg-accent/40" onClick={() => navigate({ to: "/kalkyle/$id", params: { id: k.id } })}>
                  <td className="px-3 py-2 font-medium">{k.name}</td>
                  <td className="px-3 py-2 text-muted-foreground">{k.customer_text}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{nok(beregnKalkyle(k.calculation_lines, k.markup_pct, 0).eksMva)}</td>
                  <td className="px-3 py-2 text-muted-foreground">{fmtDate(k.updated_at)}</td>
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <Button size="icon" variant="ghost" onClick={() => slett(k)} title="Slett kalkyle"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
