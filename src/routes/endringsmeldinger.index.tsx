import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { nok, fmtDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Search, Trash2 } from "lucide-react";

// Livssyklusen: en endring opprettes som "Krav om endring", og blir til
// "Endringsmelding" i det kunden signerer. Verdiene lagres i databasen og
// må derfor stå urørt — det er bare etikettene som er norske.
const STATUSES = ["krav", "endringsmelding"] as const;
type AmendmentStatus = typeof STATUSES[number];

const STATUS_STYLE: Record<AmendmentStatus, string> = {
  krav:            "bg-yellow-100 text-yellow-800 border-yellow-300",
  endringsmelding: "bg-green-100 text-green-800 border-green-300",
};

const STATUS_LABEL: Record<AmendmentStatus, string> = {
  krav: "Krav om endring", endringsmelding: "Endringsmelding",
};

// Rader fra før statusfeltet ble tatt i bruk regnes som krav om endring
const statusOf = (a: any): AmendmentStatus =>
  a?.status === "endringsmelding" ? "endringsmelding" : "krav";

/** Kort merke for endringstype — tre avhukingskolonner tok for mye bredde. */
function Merke({ children }: { children: React.ReactNode }) {
  return (
    <span className="whitespace-nowrap rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
      {children}
    </span>
  );
}

function StatusBadge({ status }: { status: AmendmentStatus }) {
  return (
    <span className={`inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export const Route = createFileRoute("/endringsmeldinger/")({
  component: AmendmentsList,
});

function AmendmentsList() {
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | AmendmentStatus>("all");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; label: string } | null>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      // Barneradene må bort først — uten kaskade ville slettingen av selve
      // endringen stoppet på fremmednøkkelen.
      const lines = await supabase.from("amendment_lines").delete().eq("amendment_id", id);
      if (lines.error) throw lines.error;
      const tokens = await supabase
        .from("amendment_signing_tokens" as never)
        .delete()
        .eq("amendment_id" as never, id as never);
      if (tokens.error) throw tokens.error;
      const { error } = await supabase.from("amendments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["amendments"] });
      setDeleteTarget(null);
    },
  });

  const { data, isLoading, isError, error } = useQuery({
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
    return (data ?? []).filter((a: any) => {
      const status = statusOf(a);
      if (statusFilter !== "all" && status !== statusFilter) return false;
      if (!t) return true;
      // Søket dekker også det koblede tilbudet, så du finner en endring
      // igjen ut fra tilbudsnummer, tittel eller kundenavn — og statusen,
      // slik at «krav» eller «endringsmelding» gir treff.
      return [
        a.amendment_number, a.project_ref, a.internal_description,
        a.change_description, a.reason, a.other_notes,
        a.project_manager, a.customer_email,
        a.offers?.title, a.offers?.customer_name,
        a.offers?.offer_number != null ? `#${a.offers.offer_number}` : null,
        status, STATUS_LABEL[status],
      ].some((s) => String(s ?? "").toLowerCase().includes(t));
    });
  }, [data, q, statusFilter]);

  // Undertittelen viser fordelingen mellom krav og signerte endringsmeldinger
  const counts = useMemo(() => {
    let krav = 0, endringsmelding = 0;
    for (const a of rows as any[]) {
      if (statusOf(a) === "endringsmelding") endringsmelding++; else krav++;
    }
    return { krav, endringsmelding };
  }, [rows]);

  const summary = [
    `${counts.krav} krav`,
    `${counts.endringsmelding} ${counts.endringsmelding === 1 ? "endringsmelding" : "endringsmeldinger"}`,
  ].join(" · ");

  const sumOf = (a: any) => (a.amendment_lines ?? []).reduce((s: number, l: any) => s + Number(l.quantity ?? 0) * Number(l.unit_price ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Endringsmeldinger</h1>
          <p className="mt-1 text-sm text-muted-foreground">{summary}</p>
        </div>
        <Button asChild><Link to="/endringsmeldinger/ny"><Plus className="mr-2 h-4 w-4" />Nytt krav om endring</Link></Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Søk på nr., prosjekt, tilbud, kunde, status eller tekst…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
        </div>
        <div className="flex rounded-md border bg-card p-1">
          {(["all", ...STATUSES] as const).map((f) => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`rounded px-3 py-1 text-sm font-medium transition-colors ${statusFilter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {f === "all" ? "Alle" : STATUS_LABEL[f]}
            </button>
          ))}
        </div>
      </div>

      {isError && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          Feil: {(error as Error).message}
        </div>
      )}

      {deleteMutation.error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          Kunne ikke slette: {(deleteMutation.error as Error).message}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
        <table className="w-full">
          <thead className="border-b bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              {/* Tolv kolonner fikk aldri plass — beskrivelsen brakk i biter og
                  tabellen måtte scrolles sidelengs. Prosjekt og tilbud er slått
                  sammen, og de tre typene til én kolonne med korte merker. */}
              <th className="whitespace-nowrap px-3 py-3">Nr.</th>
              <th className="whitespace-nowrap px-3 py-3">Status</th>
              <th className="px-3 py-3">Prosjekt / tilbud</th>
              <th className="px-3 py-3">Kunde</th>
              <th className="px-3 py-3">Beskrivelse</th>
              <th className="whitespace-nowrap px-3 py-3">Varslet</th>
              <th className="px-3 py-3">Type</th>
              <th className="whitespace-nowrap px-3 py-3 text-right">Sum eks. mva</th>
              <th className="w-10 px-2 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">Laster…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">Ingen endringer funnet.</td></tr>
            ) : rows.map((a: any, i: number) => (
              <tr key={a.id}
                className={`cursor-pointer border-b transition-colors hover:bg-accent/40 ${i % 2 === 1 ? "bg-muted/20" : ""}`}
                onClick={() => navigate({ to: "/endringsmeldinger/$id", params: { id: a.id } })}>
                <td className="whitespace-nowrap px-3 py-3 tabular-nums text-sm text-primary">{a.amendment_number}</td>
                <td className="px-3 py-3"><StatusBadge status={statusOf(a)} /></td>
                <td className="px-3 py-3">
                  <div className="tabular-nums">{a.project_ref ?? "—"}</div>
                  {a.offers ? (
                    // stopPropagation, ellers ville radklikket tatt over og ført
                    // til endringen i stedet for tilbudet
                    <Link
                      to="/tilbud/$id"
                      params={{ id: a.offers.id }}
                      onClick={(e) => e.stopPropagation()}
                      className="block max-w-[15rem] truncate text-xs text-primary hover:underline"
                      title={`#${a.offers.offer_number} ${a.offers.title}`}
                    >
                      #{a.offers.offer_number} {a.offers.title}
                    </Link>
                  ) : (
                    <span className="text-xs text-muted-foreground/50">uten tilbud</span>
                  )}
                </td>
                <td className="max-w-[11rem] truncate px-3 py-3" title={a.offers?.customer_name ?? ""}>
                  {a.offers?.customer_name ?? <span className="text-muted-foreground/50">—</span>}
                </td>
                <td className="max-w-[14rem] truncate px-3 py-3" title={a.internal_description ?? ""}>
                  {a.internal_description ?? "—"}
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-sm">
                  <div>{fmtDate(a.notified_date)}</div>
                  {a.revised_date && (
                    <div className="text-xs text-muted-foreground">rev. {fmtDate(a.revised_date)}</div>
                  )}
                  {a.project_manager && (
                    <div className="max-w-[9rem] truncate text-xs text-muted-foreground" title={a.project_manager}>
                      {a.project_manager}
                    </div>
                  )}
                </td>
                <td className="px-3 py-3">
                  {/* Tre avhukingskolonner tok mye bredde for lite informasjon */}
                  <div className="flex flex-wrap gap-1">
                    {a.is_mass_settlement && <Merke>Masse</Merke>}
                    {a.is_additional_work && <Merke>Tillegg</Merke>}
                    {a.is_price_increase && <Merke>Pris↑</Merke>}
                    {!a.is_mass_settlement && !a.is_additional_work && !a.is_price_increase && (
                      <span className="text-muted-foreground/30">—</span>
                    )}
                  </div>
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-right font-medium">{nok(sumOf(a))}</td>
                <td className="px-2 py-3 text-right">
                  {/* stopPropagation, ellers ville radklikket åpnet endringen i stedet */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteTarget({
                        id: a.id,
                        label: `${STATUS_LABEL[statusOf(a)]} ${a.amendment_number ?? ""}`.trim(),
                      });
                    }}
                    className="text-muted-foreground transition-colors hover:text-destructive"
                    title="Slett endring"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Slett endring</AlertDialogTitle>
            <AlertDialogDescription>
              Er du sikker på at du vil slette <strong>{deleteTarget?.label}</strong> med alle linjer og
              signeringslenker? Dette kan ikke angres.
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
