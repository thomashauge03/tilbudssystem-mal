import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Plus, Search, Trash2, CalendarRange } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { fmtDate } from "@/lib/format";
import { planPeriode, ukeTekst, varighetDager } from "@/lib/fremdrift";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/fremdriftsplan/")({
  component: FremdriftsplanPage,
});

function FremdriftsplanPage() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [slettMaal, setSlettMaal] = useState<{ id: string; title: string } | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["progress-plans", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("progress_plans")
        .select("id, title, revision, plan_date, start_date, end_date, created_at, offer_id, offers(offer_number, title, customer_name), progress_plan_activities(start_date, end_date, is_milestone)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const rader = (data ?? []).filter((p: any) => {
    if (!q.trim()) return true;
    const t = q.toLowerCase();
    return [p.title, p.revision, p.offers?.title, p.offers?.customer_name, String(p.offers?.offer_number ?? "")]
      .some((s) => String(s ?? "").toLowerCase().includes(t));
  });

  const slett = async (id: string) => {
    // Aktivitetene har on delete cascade, så bare planen slettes. Slettet vi
    // dem først, ville en feil på planen etterlatt et tomt skall.
    const { error } = await supabase.from("progress_plans").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Fremdriftsplan slettet");
    setSlettMaal(null);
    qc.invalidateQueries({ queryKey: ["progress-plans"] });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Fremdriftsplan</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {rader.length} plan{rader.length === 1 ? "" : "er"}
          </p>
        </div>
        <Button asChild>
          <Link to="/fremdriftsplan/ny"><Plus className="mr-2 h-4 w-4" />Ny fremdriftsplan</Link>
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Søk på plan, tilbud eller kunde…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          Feil: {(error as Error).message}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
        <table className="w-full">
          <thead className="border-b bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3">Tilbud</th>
              <th className="px-4 py-3">Kunde</th>
              <th className="px-4 py-3">Periode</th>
              <th className="px-4 py-3 text-right">Aktiviteter</th>
              <th className="px-4 py-3">Plandato</th>
              <th className="w-12"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">Laster…</td></tr>
            ) : rader.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                  {q ? "Ingen planer traff søket." : (
                    <span className="flex flex-col items-center gap-2">
                      <CalendarRange className="h-6 w-6 opacity-40" />
                      Ingen fremdriftsplaner ennå.
                    </span>
                  )}
                </td>
              </tr>
            ) : rader.map((p: any, i: number) => {
              const akt = p.progress_plan_activities ?? [];
              // Perioden er planens egen — den settes før aktivitetene, fordi
              // den er kalenderen arbeidet legges inn i. En plan med periode,
              // men uten daterte aktiviteter, har altså en periode å vise og
              // skal ikke stå som «Ingen datoer». Eldre planer er lagret uten,
              // og de faller tilbake på ytterpunktene til aktivitetene.
              const periode = p.start_date && p.end_date
                ? { start: p.start_date as string, slutt: p.end_date as string }
                : planPeriode(akt);
              return (
                <tr
                  key={p.id}
                  className={`cursor-pointer border-b transition-colors hover:bg-accent/40 ${i % 2 === 1 ? "bg-muted/20" : ""}`}
                  onClick={() => navigate({ to: "/fremdriftsplan/$id", params: { id: p.id } })}
                >
                  <td className="px-4 py-3">
                    <span className="font-medium">{p.title || "Uten tittel"}</span>
                    {p.revision && (
                      <span className="ml-2 rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
                        rev. {p.revision}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {p.offers ? `#${p.offers.offer_number}` : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{p.offers?.customer_name ?? "—"}</td>
                  <td className="px-4 py-3 text-sm tabular-nums">
                    {periode ? (
                      <>
                        {ukeTekst(periode.start)} – {ukeTekst(periode.slutt)}
                        <span className="ml-2 text-xs text-muted-foreground">
                          {varighetDager(periode.start, periode.slutt)} dager
                        </span>
                      </>
                    ) : <span className="text-muted-foreground">Ingen datoer</span>}
                  </td>
                  <td className="px-4 py-3 text-right text-sm tabular-nums">{akt.length}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{p.plan_date ? fmtDate(p.plan_date) : "—"}</td>
                  <td className="px-2" onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setSlettMaal({ id: p.id, title: p.title || "Uten tittel" })}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <AlertDialog open={!!slettMaal} onOpenChange={(o) => !o && setSlettMaal(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Slette «{slettMaal?.title}»?</AlertDialogTitle>
            <AlertDialogDescription>
              Planen og alle aktivitetene i den blir borte. Dette kan ikke angres.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={() => slettMaal && slett(slettMaal.id)}>Slett</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
